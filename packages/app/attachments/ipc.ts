/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import { isAttachmentCategory } from "@ggmail/shared/attachments";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import type { IpcMainInvokeEvent } from "electron";
import { accounts } from "@/accounts";
import type { ipc } from "@/ipc";
import { main } from "@/main";
import { getAttachmentLibrary } from "./library";

function accountFor(event: IpcMainInvokeEvent, accountId: string) {
  const contents = main.windowIfCreated?.webContents;
  if (
    !contents ||
    event.sender !== contents ||
    event.senderFrame !== contents.mainFrame ||
    main.location !== "/attachments"
  ) {
    throw new Error("Attachments page required");
  }
  return accounts.getAccount(accountId);
}

export function registerAttachmentIpc({ main: listener }: typeof ipc) {
  listener.handle("attachments.read", async (event, id, mode) => {
    const account = accountFor(event, id);
    const gmail = account.instance.gmail;
    const library = getAttachmentLibrary(gmail, account.config.gmail.delegatedAccountId);
    const result = mode === "next" ? await library.next() : await library.snapshot(mode);
    const current = accountFor(event, id);
    if (
      library !==
      getAttachmentLibrary(current.instance.gmail, current.config.gmail.delegatedAccountId)
    ) {
      throw new Error("Mailbox changed");
    }
    return result;
  });

  listener.handle("attachments.setCategory", (event, id, mailboxKey, fileId, category) => {
    if (category !== null && !isAttachmentCategory(category)) {
      throw new Error("Invalid category");
    }
    const account = accountFor(event, id);
    getAttachmentLibrary(
      account.instance.gmail,
      account.config.gmail.delegatedAccountId,
    ).setCategory(mailboxKey, fileId, category);
  });

  listener.handle("attachments.preview", async (event, id, mailboxKey, fileId, size) => {
    if (size !== "thumbnail" && size !== "full") {
      throw new Error("Unknown preview size");
    }
    const getLibrary = () => {
      const account = accountFor(event, id);
      return getAttachmentLibrary(
        account.instance.gmail,
        account.config.gmail.delegatedAccountId,
        mailboxKey,
      );
    };
    const library = getLibrary();
    const preview = await library.preview(fileId, size);
    if (library !== getLibrary()) {
      throw new Error("Mailbox changed");
    }
    return preview;
  });

  listener.handle("attachments.act", async (event, id, mailboxKey, fileId, action) => {
    const account = accountFor(event, id);
    const gmail = account.instance.gmail;
    const library = getAttachmentLibrary(
      gmail,
      account.config.gmail.delegatedAccountId,
      mailboxKey,
    );
    const entry = library.entries.get(fileId);
    if (!entry) {
      throw new Error("Attachment unavailable");
    }
    if (action === "download") {
      const live = await library.liveEntry(fileId);
      const current = accountFor(event, id);
      if (
        !live ||
        library !==
          getAttachmentLibrary(current.instance.gmail, current.config.gmail.delegatedAccountId)
      ) {
        throw new Error("Attachment unavailable");
      }
      gmail.view.webContents.downloadURL(live.downloadUrl);
      return;
    }
    if (action !== "message") {
      throw new Error("Unknown attachment action");
    }
    account.instance.tabs.activateTab(GMAIL_TAB_ID);
    accounts.selectAccount(id);
    const generation = gmail.mailboxGeneration;
    await gmail.navigateToHash("#all/" + entry.threadId);
    if (
      main.location === "/attachments" &&
      gmail.mailboxGeneration === generation &&
      accounts.getSelectedAccount().config.id === id
    ) {
      main.navigate("/");
    }
  });
}
