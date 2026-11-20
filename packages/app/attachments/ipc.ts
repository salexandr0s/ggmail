/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import type { IpcMainInvokeEvent } from "electron";
import { accounts } from "@/accounts";
import type { ipc } from "@/ipc";
import { main } from "@/main";
import { forgetAttachments, getAttachmentLibrary } from "./library";

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
    if (mode === "refresh") {
      forgetAttachments(gmail);
    }
    const library = getAttachmentLibrary(gmail, account.config.gmail.delegatedAccountId);
    const result =
      mode === "next"
        ? await library.next()
        : mode === "retry"
          ? library.retry()
          : library.snapshot();
    const current = accountFor(event, id);
    if (
      library !==
      getAttachmentLibrary(current.instance.gmail, current.config.gmail.delegatedAccountId)
    ) {
      throw new Error("Mailbox changed");
    }
    return result;
  });

  listener.handle("attachments.act", (event, id, fileId, action) => {
    const account = accountFor(event, id);
    const gmail = account.instance.gmail;
    const entry = getAttachmentLibrary(gmail, account.config.gmail.delegatedAccountId).entries.get(
      fileId,
    );
    if (!entry) {
      throw new Error("Attachment unavailable");
    }
    if (action === "download") {
      gmail.view.webContents.downloadURL(entry.downloadUrl);
      return;
    }
    if (action !== "message" && action !== "preview") {
      throw new Error("Unknown attachment action");
    }
    account.instance.tabs.activateTab(GMAIL_TAB_ID);
    accounts.selectAccount(id);
    main.navigate("/");
    gmail.navigateToHash(
      action === "message"
        ? "#all/" + entry.threadId
        : "#all/" +
            (entry.messageId.startsWith("msg-a:") ? entry.threadId : entry.messageId) +
            "?projector=1&messagePartId=" +
            entry.part,
    );
  });
}
