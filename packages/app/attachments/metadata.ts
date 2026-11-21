/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import type { MailAttachment } from "@ggmail/shared/attachments";
import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { load } from "cheerio/slim";
import { classifyMessageAttachments } from "./classify";

export type AttachmentEntry = {
  file: MailAttachment;
  threadId: string;
  messageId: string;
  part: string;
  downloadUrl: string;
  thumbnailUrl?: string;
};

const legacyId = /^[\da-f]{15,16}$/i;

/** Only reconstruct Gmail's attachment request. Never use a link from the email as a download target. */
function readLocator(href: string, mailbox: string, thumbnail = false) {
  const url = URL.parse(href, mailbox);
  if (!url || url.username || url.password) {
    return;
  }
  const base = new URL(mailbox);
  const path = url.pathname.replace(/\/$/, "");
  const mailboxPath = base.pathname.replace(/\/$/, "");
  const sameMailbox =
    url.origin === base.origin && (path === mailboxPath || path === mailboxPath + "/s");
  const attachmentHost =
    url.origin === "https://mail-attachment.googleusercontent.com" &&
    url.pathname === "/attachment";
  const params = url.searchParams;
  const view = params.get("view") ?? "";
  const part = params.get("attid");
  const permanentId = /^msg-f:(\d{1,20})$/.exec(params.get("permmsgid") ?? "")?.[1];
  const legacyMessage = params.get("th") || (permanentId && BigInt(permanentId).toString(16));
  const gmailMessage = params.get("permmsgid") ?? "";
  const messageId =
    legacyMessage && legacyId.test(legacyMessage)
      ? legacyMessage
      : /^msg-a:r-?\d{1,20}$/.test(gmailMessage)
        ? gmailMessage
        : undefined;
  if (
    (!sameMailbox && !attachmentHost) ||
    (thumbnail
      ? !["snatt", "fimg", "att"].includes(view) || params.get("disp") !== "thd"
      : view !== "att") ||
    !messageId ||
    !part ||
    !/^\d+(?:\.\d+)+$/.test(part)
  ) {
    return;
  }

  base.search = new URLSearchParams({
    ui: "2",
    view,
    ...(legacyId.test(messageId) && { th: messageId }),
    attid: part,
    disp: thumbnail ? "thd" : "attd",
    safe: "1",
    zw: "",
  }).toString();
  for (const key of ["ik", "realattid", "permmsgid", "attbid", "ats"]) {
    const value = params.get(key);
    if (value) {
      base.searchParams.set(key, value);
    }
  }
  return { messageId, part, downloadUrl: base.href };
}

/** Gmail's print document contains one table per message and nested tables for the attachment tiles. */
export function readPrintAttachments(
  html: string,
  mailbox: string,
  threadId: string,
  subject: string,
  photos: { address: string; url: string }[] = [],
) {
  const $ = load(html);
  const messages = $("table.message").filter(
    (_i, node) => !$(node).parents("table.message").length,
  );
  if (!messages.length) {
    throw new Error("Missing Gmail print view");
  }
  const files = new Map<string, AttachmentEntry>();
  for (const message of messages) {
    const rows = $(message).children("tr").add($(message).children("tbody").children("tr"));
    const header = rows.first().children("td");
    const sender = header.first().text().trim();
    const address = (/<([^<>]+)>$/.exec(sender)?.[1] ?? sender).trim().toLowerCase();
    const senderPhotoUrl =
      getGoogleProfilePhotoUrl(header.first().find("img[src]").attr("src") ?? "") ??
      getGoogleProfilePhotoUrl(
        photos.find((photo) => photo.address.toLowerCase() === address)?.url ?? "",
      );
    // The message body is in a div before Gmail's own attachment table. Exclude tables inside it.
    const tiles = $(message)
      .find("table.att")
      .filter((_i, node) => !$(node).parentsUntil(message, "div").length);
    const messageFiles = new Map<string, AttachmentEntry>();
    for (const table of tiles) {
      for (const link of $(table).find("a[href]")) {
        const locator = readLocator($(link).attr("href") ?? "", mailbox);
        if (!locator) {
          continue;
        }
        const row = $(link).closest("tr");
        const thumbnailSrc = $(link).find("img[src]").attr("src");
        const thumbnail = thumbnailSrc && readLocator(thumbnailSrc, mailbox, true);
        const label = row.find("td b").last();
        const name = label.text().trim();
        if (!name) {
          continue;
        }
        const id = locator.messageId + "/" + locator.part;
        const parsedDate = Date.parse(header.last().text().trim().replace(" at ", " "));
        const receivedAt = Number.isFinite(parsedDate)
          ? parsedDate
          : Number(
              BigInt(`0x${legacyId.test(locator.messageId) ? locator.messageId : threadId}`) >> 20n,
            );
        messageFiles.set(id, {
          ...locator,
          thumbnailUrl:
            thumbnail &&
            thumbnail.messageId === locator.messageId &&
            thumbnail.part === locator.part
              ? thumbnail.downloadUrl
              : undefined,
          threadId,
          file: {
            id,
            name,
            detectedCategories: ["uncategorized"],
            subject,
            sender,
            senderPhotoUrl,
            receivedAt,
            size: label.next("br").parent().text().slice(name.length).trim(),
          },
        });
      }
    }
    const readMessageText = () => {
      const body = rows.slice(1).clone();
      body.find("#divRplyFwdMsg, .moz-cite-prefix").replaceWith("\n-----Original Message-----\n");
      body
        .find("[style]")
        .filter((_i, node) =>
          /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(
            $(node).attr("style") ?? "",
          ),
        )
        .remove();
      body
        .find(
          "blockquote, .gmail_quote, .gmail_attr, .gmail_signature, [data-smartmail=gmail_signature], script, style, [hidden], [aria-hidden=true], table.att",
        )
        .remove();
      body.find("br").replaceWith("\n");
      body.find("td, th").append(" ");
      body.find("p, div, li, tr").append("\n");
      return body.text().slice(0, 4000);
    };
    const entries = [...messageFiles.values()];
    const detected = classifyMessageAttachments(
      entries.map(({ file }) => file.name),
      // Gmail supplies one subject for the entire thread. In a reply chain it may describe a different message.
      messages.length === 1 ? subject : "",
      readMessageText,
    );
    entries.forEach((entry, index) => {
      entry.file.detectedCategories = detected[index] ?? ["uncategorized"];
      files.set(entry.file.id, entry);
    });
  }
  return [...files.values()];
}
