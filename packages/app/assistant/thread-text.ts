/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail markup and model tool output. */
import { load } from "cheerio/slim";

export function readThreadText(html: string, offset: number) {
  const $ = load(html);
  const tables = $("table.message").filter((_i, node) => !$(node).parents("table.message").length);
  if (!tables.length) {
    throw new Error("Missing Gmail conversation");
  }

  const messages: string[] = [];
  for (const table of tables) {
    const rows = $(table).children("tr").add($(table).children("tbody").children("tr"));
    const headers = rows.first().children("td");
    if (headers.length < 2 || rows.length < 2) {
      throw new Error("Incomplete Gmail message");
    }
    const sender = headers.first().text().trim();
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
    messages.push(`From: ${sender}\nDate: ${date}\n${text}`);
  }
  const fullText = messages.join("\n\n");
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
