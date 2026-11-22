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

  test("keeps an email subject from assigning the same purpose to sibling files", () => {
    const link = `?view=att&th=${message}&attid=0.1`;
    const files = readPrintAttachments(
      printDocument(tile(link, "scan.pdf") + tile(link.replace("0.1", "0.2"), "Contratto.pdf")),
      mailbox,
      thread,
      "Votre facture",
    );
    expect(files.map((entry) => entry.file.detectedCategories.join(" + "))).toEqual([
      "uncategorized",
      "contract",
    ]);
    expect(
      readPrintAttachments(
        printDocument(tile(link, "scan.pdf") + tile(link, "scan.pdf")),
        mailbox,
        thread,
        "Votre facture",
      )[0]?.file.detectedCategories.join(" + "),
    ).toBe("invoice");
  });

  test("matches body images by message part or content ID and keeps ordinary image attachments", () => {
    const link = (part: number) => `?view=att&th=${message}&attid=0.${part}`;
    const tiles = [
      tile(link(1), "award.png"),
      tile(link(2) + "&realattid=sig%40mail", "signature.jpg"),
      tile(link(3) + "&disp=inline", "small.png").replace("<img>", `<img src="${link(3)}">`),
      tile(link(4), "notes.pdf"),
      tile(link(5), "image001.png"),
      tile(link(6), "image001.png"),
      tile(link(7) + "&realattid=banner", "banner.png"),
      tile(link(8) + "&disp=emb", "badge.gif"),
    ].join("");
    const body = [
      link(1).replace("view=att", "view=fimg"),
      "cid:sig%40mail",
      link(3).replace(message, thread),
      "https://external.test/" + link(3),
      link(4),
      "cid:image001.png@sender",
      `?view=fimg&th=${message}&realattid=banner`,
      "cid:%",
    ]
      .map((src) => `<img src="${src}">`)
      .join("");
    const entries = readPrintAttachments(printDocument(tiles, body), mailbox, thread, "");
    expect(entries.map(({ file }) => file.isEmbeddedImage)).toEqual([
      true,
      true,
      false,
      undefined,
      false,
      false,
      true,
      true,
    ]);
  });

  test("recognizes a template graphics branch while keeping standalone and mixed files visible", () => {
    const tiles = (parent: string, names: string[]) =>
      names
        .map((name, i) => tile(`?view=att&th=${message}&attid=${parent}.${i + 1}`, name))
        .join("");
    const names = ["a", "b", "c", "d"].map((s) => s.repeat(32) + ".png");
    const attachments =
      tiles("0.1", names) +
      tiles("0", names) +
      tiles("0.2", [...names, "photo.jpg"]) +
      tiles("0.3", names.slice(0, 1));
    const entries = readPrintAttachments(printDocument(attachments), mailbox, thread, "");
    expect(entries.filter(({ file }) => file.isEmbeddedImage).map(({ part }) => part)).toEqual([
      "0.1.1",
      "0.1.2",
      "0.1.3",
      "0.1.4",
    ]);
  });

  test("keeps quoted replies and signatures out of enclosure hints", () => {
    const parse = (body: string) =>
      readPrintAttachments(
        printDocument(tile(`?view=att&th=${message}&attid=0.1`, "scan.pdf"), body),
        mailbox,
        thread,
        "Documents",
      )[0]?.file.detectedCategories.join(" + ");
    expect(parse("<p>Ci-joint votre facture.</p><blockquote>Contract attached.</blockquote>")).toBe(
      "invoice",
    );
    expect(
      parse(
        '<div class="gmail_quote">Attached is your invoice.</div><div class="gmail_signature">Contract enclosed.</div>',
      ),
    ).toBe("uncategorized");
  });

  test("assigns per-file enclosure labels from the current message and ignores stale thread subjects", () => {
    const link = `?view=att&th=${message}&attid=0.1`;
    const first = printDocument(
      tile(link, "numéro.01.pdf") + tile(link.replace("0.1", "0.2"), "scan(2).pdf"),
      "<ul><li>Facture : numéro.01.pdf</li><li>Reçu de paiement : scan(2).pdf</li></ul>",
    );
    const second = printDocument(tile(link.replace(message, thread), "export.pdf"), "Many thanks.");
    expect(
      readPrintAttachments(first + second, mailbox, thread, "Contract").map((entry) =>
        entry.file.detectedCategories.join(" + "),
      ),
    ).toEqual(["invoice", "receipt", "uncategorized"]);
  });

  test("the current enclosure takes precedence over the thread subject, hidden text and forwarded mail", () => {
    const attachment = tile(`?view=att&th=${message}&attid=0.1`, "scan.pdf");
    const body =
      '<div style="display: none">Attached invoice.</div><p>In allegato la ricevuta di pagamento.</p><div id="divRplyFwdMsg">From earlier mail</div><p>Contract attached.</p>';
    expect(
      readPrintAttachments(
        printDocument(attachment, body),
        mailbox,
        thread,
        "Votre commande",
      )[0]?.file.detectedCategories.join(" + "),
    ).toBe("receipt");
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
        printDocument(tile(target).replace("<img>", `<img src="${src}">`) + tile(target)),
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
    expect(snapshotUrl(entry, false, mailbox).searchParams.get("attbid")).toBe("tile");
    expect(snapshotUrl(entry, true, mailbox).searchParams.get("attid")).toBe("0.2.3");
    expect(parse(thumbnail.replace("0.2.3", "0.1")).thumbnailUrl).toBeUndefined();
    expect(parse("https://example.test/" + thumbnail).thumbnailUrl).toBeUndefined();
  });
});
