/* oxlint-disable lingui/no-unlocalized-strings -- Internal IPC errors. The renderer localizes search status. */
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { accounts } from "@/accounts";
import type { ipc } from "@/ipc";
import { main } from "@/main";
import { getSearchMailbox, listSearchThreads } from "./search";

type Search = {
  requestId: string;
  query: string;
  mailbox: string;
  controller: AbortController;
  threadIds: Set<string>;
  nextPage: number | null;
};

const searches = new Map<string, Search>();

export function cancelUnifiedSearch(accountId: string) {
  const search = searches.get(accountId);
  search?.controller.abort();
  return searches.delete(accountId);
}

export function clearUnifiedSearches() {
  for (const id of searches.keys()) {
    cancelUnifiedSearch(id);
  }
}

function isInboxPage(event: IpcMainEvent | IpcMainInvokeEvent) {
  const contents = main.windowIfCreated?.webContents;
  return (
    contents &&
    event.sender === contents &&
    event.senderFrame === contents.mainFrame &&
    main.location === "/unified-inbox"
  );
}

function getMailbox(event: IpcMainInvokeEvent, id: string) {
  if (!isInboxPage(event)) {
    throw new Error("Unified inbox required");
  }
  const account = accounts.getAccount(id);
  const gmail = account.instance.gmail;
  const mailbox = getSearchMailbox(gmail, account.config.gmail.delegatedAccountId);
  if (!mailbox || gmail.store.getState().attentionRequired) {
    throw new Error("Mailbox unavailable");
  }
  return { account, gmail, mailbox };
}

export function registerUnifiedSearchIpc({ main: listener }: typeof ipc) {
  listener.on("unifiedSearch.cancel", (event, id, requestId) => {
    if (isInboxPage(event) && searches.get(id)?.requestId === requestId) {
      cancelUnifiedSearch(id);
    }
  });

  listener.handle("unifiedSearch.read", async (event, id, requestId, query, page) => {
    const { gmail, mailbox } = getMailbox(event, id);
    if (typeof query !== "string" || !query.trim() || typeof requestId !== "string") {
      throw new Error("Invalid search");
    }
    if (page === 1) {
      cancelUnifiedSearch(id);
      searches.set(id, {
        requestId,
        query,
        mailbox,
        controller: new AbortController(),
        threadIds: new Set(),
        nextPage: 1,
      });
    }
    const search = searches.get(id);
    if (
      !search ||
      search.requestId !== requestId ||
      search.mailbox !== mailbox ||
      search.query !== query ||
      !Number.isSafeInteger(page) ||
      search.nextPage !== page
    ) {
      throw new Error("Search changed");
    }

    // Reserve the page while reading. On failure it can be retried without losing earlier matches.
    search.nextPage = null;
    try {
      const result = await listSearchThreads(
        gmail.session,
        gmail.view.webContents.getUserAgent(),
        mailbox,
        query,
        page,
        search.controller.signal,
      );
      search.controller.signal.throwIfAborted();
      if (getMailbox(event, id).mailbox !== mailbox) {
        throw new Error("Mailbox changed");
      }
      const threads = result.threads.filter(({ id: threadId }) => {
        if (search.threadIds.has(threadId)) {
          return false;
        }
        search.threadIds.add(threadId);
        return true;
      });
      if (result.threads.length && !threads.length) {
        throw new Error("Gmail repeated a search page");
      }
      search.nextPage = result.more ? page + 1 : null;
      return { threads, more: result.more };
    } catch (error) {
      search.nextPage = page;
      throw error;
    }
  });

  listener.handle("unifiedSearch.open", async (event, id, requestId, threadId) => {
    const { account, gmail, mailbox } = getMailbox(event, id);
    const search = searches.get(id);
    if (
      search?.requestId !== requestId ||
      search.mailbox !== mailbox ||
      !search.threadIds.has(threadId)
    ) {
      throw new Error("Conversation unavailable");
    }
    account.instance.tabs.activateTab(GMAIL_TAB_ID);
    accounts.selectAccount(id);
    main.navigate("/");
    await gmail.navigateToHash("#all/" + threadId);
  });
}
