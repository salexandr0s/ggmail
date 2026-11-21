/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail markup and model tool output. */
import type { SourceMessage } from "@ggmail/shared/assistant";
import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { load } from "cheerio/slim";

export function extractMessages(html: string) {
  const $ = load(html);
  const tables = $("table.message").filter((_i, node) => !$(node).parents("table.message").length);
  if (!tables.length) {
    throw new Error("Missing Gmail conversation");
  }

  const messages: SourceMessage[] = [];
  for (const table of tables) {
    const rows = $(table).children("tr").add($(table).children("tbody").children("tr"));
    const headers = rows.first().children("td");
    if (headers.length < 2 || rows.length < 2) {
      throw new Error("Incomplete Gmail message");
    }
    const sender = headers.first().text().trim();
    const senderPhotoUrl = getGoogleProfilePhotoUrl(
      headers.first().find("img[src]").attr("src") ?? "",
    );
    const date = headers.last().text().trim();
    const body = rows.slice(1);
    body.find("script, style, template, noscript, iframe, object, [hidden], table.att").remove();
    body.find("br").replaceWith("\n");
    body.find("div, p, li, blockquote, tr, pre, h1, h2, h3, h4, h5, h6").prepend("\n").append("\n");
    body.find("td, th").append(" ");
    const text = body
      .map((_i, row) => $(row).text())
      .get()
      .join("\n")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    messages.push({ index: messages.length, sender, senderPhotoUrl, date, body: text });
  }
  return messages;
}

export function readThreadText(html: string, offset: number) {
  const messages = extractMessages(html);
  const fullText = messages
    .map(({ sender, date, body }) => `From: ${sender}\nDate: ${date}\n${body}`)
    .join("\n\n");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= fullText.length) {
    throw new Error("Invalid Gmail conversation offset");
  }
  const text = fullText.slice(offset, offset + 16_000);
  const end = offset + text.length;
  return {
    text,
    messageCount: messages.length,
    totalCharacters: fullText.length,
    nextOffset: end < fullText.length ? end : null,
  };
}

/** The cursor counts body characters, allowing one position for an empty message. */
export function readThreadPreview(messages: SourceMessage[], offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Invalid preview offset");
  }
  const fragments: SourceMessage[] = [];
  let position = 0;
  let remaining = 16_000;
  for (const message of messages) {
    const length = Math.max(1, message.body.length);
    const end = position + length;
    if (end > offset) {
      const start = Math.max(0, offset - position);
      const count = Math.min(remaining, length - start);
      fragments.push({
        ...message,
        sender: message.sender.slice(0, 1024),
        date: message.date.slice(0, 256),
        body: message.body.slice(start, start + count),
      });
      remaining -= count;
      if (!remaining || fragments.length === 32) {
        const more = start + count < length || message.index < messages.length - 1;
        return { messages: fragments, nextOffset: more ? position + start + count : null };
      }
    }
    position = end;
  }
  if (!fragments.length) {
    throw new Error("Invalid preview offset");
  }
  return { messages: fragments, nextOffset: null };
}
