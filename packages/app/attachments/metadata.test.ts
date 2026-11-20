import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { readPrintAttachments } from "./metadata";
import { snapshotUrl } from "./preview";

const mailbox = "https://mail.google.com/mail/u/0/";
const thread = "193078998a370000";
const message = "193078998a370001";

function tile(target: string, name = "Budget &amp; notes.pdf") {
  return `<table class="att"><tr><td><table><tr><td><a href="${target}"><img></a></td><td></td><td><b>${name}</b><br>42K</td></tr></table></td></tr></table>`;
}

function printDocument(attachments: string, body = "") {
  return `<table class="message"><tbody><tr><td>Mira &lt;mira@example.test&gt;</td><td>Tue, Nov 12, 2024 at 1:00 PM</td></tr><tr><td><table><tr><td><div>${body}</div>${attachments}</td></tr></table></td></tr></tbody></table>`;
}

describe("Gmail attachment metadata", () => {
  test("preserves per-message part identities and builds downloads in the originating mailbox", () => {
    const link = `?view=att&amp;th=${message}&amp;attid=0.1&amp;realattid=f_1&amp;disp=inline`;
    const metadata = readPrintAttachments(
      printDocument(tile(link) + tile(link) + tile(link.replace("0.1", "0.2"))),
      mailbox,
      thread,
      "Budget",
    );
    expect(metadata).toHaveLength(2);
    expect(metadata[0]).toMatchObject({
      threadId: thread,
      messageId: message,
      part: "0.1",
      file: {
        id: message + "/0.1",
        name: "Budget & notes.pdf",
        size: "42K",
        sender: "Mira <mira@example.test>",
        subject: "Budget",
      },
    });
    const url = new URL(metadata[0]?.downloadUrl ?? "");
    expect(url.searchParams.get("disp")).toBe("attd");
    expect(url.searchParams.get("realattid")).toBe("f_1");
  });

  test("ignores inline message content and links to another mailbox or origin", () => {
    const link = `?view=att&th=${message}&attid=0.1`;
    expect(
      readPrintAttachments(
        printDocument(tile("https://example.test/" + link) + tile("/mail/u/1/" + link), tile(link)),
        mailbox,
        thread,
        "",
      ),
    ).toEqual([]);
  });

  test("recognizes permanent message IDs and rejects sign-in pages", () => {
    const permanent = `msg-f:${BigInt("0x" + message)}`;
    const rows = readPrintAttachments(
      printDocument(tile(`?view=att&attid=0.2.3&permmsgid=${permanent}`)),
      mailbox,
      thread,
      "",
    );
    expect(rows[0]?.file.id).toBe(message + "/0.2.3");
    expect(() => readPrintAttachments("<h1>Sign in</h1>", mailbox, thread, "")).toThrow();
  });

  test("uses Gmail's thumbnail for the same message part and matches photos by sender", () => {
    const target = `?view=att&th=${message}&attid=0.2.3`;
    const thumbnail = `?view=snatt&disp=thd&th=${message}&attid=0.2.3&attbid=tile`;
    const photo = "https://lh3.googleusercontent.com/a/sender";
    const parse = (src: string) => {
      const [entry] = readPrintAttachments(
        printDocument(tile(target).replace("<img>", `<img src="${src}">`)),
        mailbox,
        thread,
        "",
        [
          { address: "other@example.test", url: "https://lh4.googleusercontent.com/a/other" },
          { address: "MIRA@example.test", url: photo },
        ],
      );
      assert.ok(entry);
      return entry;
    };
    const entry = parse(thumbnail);
    expect(entry.file.senderPhotoUrl).toBe(photo);
    expect(snapshotUrl(entry, false).searchParams.get("attbid")).toBe("tile");
    expect(snapshotUrl(entry, true).searchParams.get("attid")).toBe("0.2.3");
    expect(parse(thumbnail.replace("0.2.3", "0.1")).thumbnailUrl).toBeUndefined();
    expect(parse("https://example.test/" + thumbnail).thumbnailUrl).toBeUndefined();
  });
});
