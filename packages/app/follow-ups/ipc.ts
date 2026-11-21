/* oxlint-disable lingui/no-unlocalized-strings -- Fixed Gmail DOM reader and internal IPC errors. */
import { randomUUID } from "node:crypto";
import { localDay, type FollowUpRow } from "@ggmail/shared/follow-ups";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import type { IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { accounts } from "@/accounts";
import { fetchPrintThread, legacyThreadId } from "@/gmail/print-thread";
import { getSearchMailbox } from "@/gmail/search";
import type { ipc } from "@/ipc";
import { main } from "@/main";
import { readFollowUpMessages } from "./messages";
import { reminders, removeReminders, saveReminder } from "./store";

function authorize(event: IpcMainInvokeEvent, allowInbox = false) {
  const view = main.windowIfCreated?.webContents;
  if (
    !view ||
    event.sender !== view ||
    event.senderFrame !== view.mainFrame ||
    !(main.location === "/waiting" || (allowInbox && main.location === "/unified-inbox"))
  ) {
    throw new Error("Waiting list required");
  }
}

function mailboxFor(id: string) {
  const account = accounts.getAccount(id);
  const gmail = account.instance.gmail;
  const mailbox = getSearchMailbox(gmail, account.config.gmail.delegatedAccountId);
  const owner = gmail.userEmail?.trim().toLowerCase();
  if (!mailbox || !owner || gmail.store.getState().attentionRequired) {
    return;
  }
  return { account, gmail, mailbox, owner, generation: gmail.mailboxGeneration };
}

type Mailbox = NonNullable<ReturnType<typeof mailboxFor>>;

function isCurrentMailbox(box: Mailbox) {
  const current = mailboxFor(box.account.config.id);
  return (
    current?.gmail === box.gmail &&
    current.generation === box.generation &&
    current.mailbox === box.mailbox &&
    current.owner === box.owner
  );
}

async function readMessages(box: Mailbox, threadId: string) {
  if (!isCurrentMailbox(box)) {
    throw new Error("Mailbox changed");
  }
  const response = await fetchPrintThread(
    box.gmail.session,
    box.mailbox,
    threadId,
    new AbortController().signal,
  );
  if (!response.ok) {
    throw new Error("Print view unavailable");
  }
  const messages = readFollowUpMessages(await response.text());
  if (!isCurrentMailbox(box)) {
    throw new Error("Mailbox changed");
  }
  return messages;
}

async function currentThread() {
  const account = accounts.getSelectedAccount();
  const box = mailboxFor(account.config.id);
  if (!box || account.instance.tabs.activeTab.id !== GMAIL_TAB_ID || !box.gmail.messageId) {
    return null;
  }
  const route = box.gmail.messageId;
  const view = box.gmail.view.webContents;
  const heading = z
    .object({ subject: z.string(), id: z.string() })
    .nullable()
    .parse(
      await view.executeJavaScriptInIsolatedWorld(1245, [
        {
          code: `(() => {
      const headings = [...document.querySelectorAll('[role="main"] h2.hP, [role="main"] h2[data-legacy-thread-id]')].filter(el =>
        el.getClientRects().length && !el.closest('.a3s, .gmail_quote, [aria-hidden="true"], [role="dialog"]'));
      if (headings.length !== 1) return null;
      const el = headings[0];
      return {subject: el.textContent.trim().slice(0, 300), id: (el.dataset.legacyThreadId || "").replace(/^#/, "")};
    })()`,
        },
      ]),
    );
  if (
    !heading ||
    box.gmail.messageId !== route ||
    (legacyThreadId.test(route) && heading.id && heading.id !== route)
  ) {
    return null;
  }
  const threadId = legacyThreadId.test(route) ? route : heading.id;
  return legacyThreadId.test(threadId)
    ? { accountId: account.config.id, threadId, subject: heading.subject }
    : null;
}

export function registerFollowUpIpc({ main: listener }: typeof ipc) {
  listener.handle("followUps.current", (event) => {
    authorize(event);
    return currentThread();
  });
  listener.handle("followUps.schedule", async (event, accountId, threadId, due) => {
    authorize(event);
    z.iso.date().parse(due);
    const thread = await currentThread();
    const box = mailboxFor(accountId);
    if (
      !box ||
      thread?.accountId !== accountId ||
      thread.threadId !== threadId ||
      due < localDay()
    ) {
      throw new Error("Thread or date changed");
    }
    const latest = (await readMessages(box, threadId)).at(-1);
    authorize(event);
    const selected = await currentThread();
    authorize(event);
    if (
      selected?.accountId !== accountId ||
      selected.threadId !== threadId ||
      !isCurrentMailbox(box)
    ) {
      throw new Error("Thread or mailbox changed");
    }
    if (latest && latest.sender !== box.owner) {
      return false;
    }
    if (!latest?.recipient) {
      throw new Error("Missing message headers");
    }
    saveReminder({
      ...thread,
      id: randomUUID(),
      mailbox: box.mailbox,
      owner: box.owner,
      anchor: latest.key,
      lastSent: latest.date,
      recipient: latest.recipient,
      due,
    });
    return true;
  });
  listener.handle("followUps.list", async (event, accountId) => {
    authorize(event, true);
    const dueOnly = main.location === "/unified-inbox";
    const today = localDay();
    const box = mailboxFor(accountId);
    const stored = reminders().filter((row) => row.accountId === accountId);
    if (!box) {
      return { rows: [], unavailable: stored.length > 0 };
    }
    const rows: FollowUpRow[] = [];
    for (const row of stored) {
      authorize(event, true);
      if (row.owner !== box.owner || row.mailbox !== box.mailbox || (dueOnly && row.due > today)) {
        continue;
      }
      let status: FollowUpRow["status"] = "scheduled";
      let { recipient, lastSent } = row;
      try {
        const messages = await readMessages(box, row.threadId);
        const anchor = messages.findIndex((message) => message.key === row.anchor);
        const latest = messages.at(-1);
        if (!latest || anchor < 0) {
          throw new Error("Original message missing");
        }
        if (messages.slice(anchor + 1).some((message) => message.sender !== box.owner)) {
          removeReminders((item) => item.id === row.id);
          continue;
        }
        lastSent = latest.date;
        recipient = latest.recipient || recipient;
        status = row.due <= today ? "due" : "scheduled";
      } catch {
        status = "unverified";
      }
      rows.push({ id: row.id, subject: row.subject, due: row.due, recipient, lastSent, status });
    }
    authorize(event, true);
    if (!isCurrentMailbox(box)) {
      return { rows: [], unavailable: true };
    }
    const ids = new Set(reminders().map((row) => row.id));
    return {
      rows: rows.filter((row) => ids.has(row.id)).sort((a, b) => a.due.localeCompare(b.due)),
      unavailable: false,
    };
  });
  listener.handle("followUps.act", async (event, accountId, id, action) => {
    authorize(event, true);
    const box = mailboxFor(accountId);
    const row =
      box &&
      reminders().find(
        (item) =>
          item.id === id &&
          item.accountId === accountId &&
          item.owner === box.owner &&
          item.mailbox === box.mailbox,
      );
    if (!row || !box) {
      throw new Error("Reminder unavailable");
    }
    if (action === "remove") {
      return removeReminders((item) => item.id === id);
    }
    if (action !== "open") {
      throw new Error("Unknown action");
    }
    const origin = main.location;
    box.account.instance.tabs.activateTab(GMAIL_TAB_ID);
    accounts.selectAccount(accountId);
    const generation = box.gmail.mailboxGeneration;
    await box.gmail.navigateToHash("#all/" + row.threadId);
    if (
      main.location === origin &&
      box.gmail.mailboxGeneration === generation &&
      accounts.getSelectedAccount().config.id === accountId
    ) {
      main.navigate("/");
    }
  });
}
