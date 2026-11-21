/* oxlint-disable lingui/no-unlocalized-strings -- Gmail's English print-view headers and internal parse errors. */
import { createHash } from "node:crypto";
import { load } from "cheerio/slim";

export function readFollowUpMessages(html: string) {
  const $ = load(html);
  const tables = $("table.message").filter((_i, el) => !$(el).parents("table.message").length);
  if (!tables.length) {
    throw new Error("Missing print view");
  }
  return tables.toArray().map((table) => {
    const rows = $(table).children("tr").add($(table).children("tbody").children("tr"));
    const header = rows.first().children("td");
    const from = header.first().text().trim();
    const sender = (/<([^<>]+)>$/.exec(from)?.[1] ?? from).trim().toLowerCase();
    const date = header.last().text().trim();
    if (header.length < 2 || !date || !/^[^\s@<>]+@[^\s@<>]+$/.test(sender) || rows.length < 2) {
      throw new Error("Incomplete message headers");
    }
    // Gmail puts To and Cc in a row between the sender and the body.
    const recipientRows = rows.slice(1, -1);
    const addresses = recipientRows.text().trim();
    // Stored reminders use this original header serialization as part of their anchor.
    const anchorRecipient =
      /(?:^|\n)To:\s*([\s\S]*?)(?=(?:Cc|Bcc):|$)/i.exec(addresses)?.[1]?.trim() ||
      addresses.replace(/^(?:Cc|Bcc):\s*/i, "");
    const key = createHash("sha256")
      .update(JSON.stringify([sender, date, anchorRecipient, rows.last().text().trim()]))
      .digest("hex");
    recipientRows.find("br").replaceWith("\n");
    recipientRows.find("div, p").prepend("\n").append("\n");
    const fields = new Map<string, string[]>();
    let field = "";
    for (const line of recipientRows
      .map((_i, row) => $(row).text())
      .get()
      .join("\n")
      .split("\n")) {
      const match = /^([\w-]+):\s*(.*)$/.exec(line.trim());
      if (match?.[1]) {
        field = match[1].toLowerCase();
      }
      const value = (match ? match[2] : line)?.trim();
      if (field && value) {
        const values = fields.get(field) ?? [];
        values.push(value);
        fields.set(field, values);
      }
    }
    const recipient =
      fields.get("to")?.join(" ") ||
      [...(fields.get("cc") ?? []), ...(fields.get("bcc") ?? [])].join(", ") ||
      (!fields.size && addresses.includes("@") ? addresses : "");
    return { key, sender, recipient, date };
  });
}
