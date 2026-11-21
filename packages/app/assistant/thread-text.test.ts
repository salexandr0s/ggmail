import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { extractMessages, readThreadText, readThreadPreview } from "./thread-text";

const message = (sender: string, date: string, body: string) =>
  `<table class="message"><tbody><tr><td>${sender}</td><td>${date}</td></tr>
   <tr><td colspan="2"><font size="-1">To: Design</font></td></tr>
   <tr><td><table><tr><td><font size="-1">${body}</font></td></tr></table></td></tr></tbody></table>`;

test("reads earlier and later messages, preserving headers and body-only deadlines", () => {
  const html =
    message(
      "Sam &lt;sam@example.test&gt;",
      "Oct 8",
      "<p>Updated proof</p><p>Please sign &amp; return<br>by Nov 4.</p>",
    ) +
    message(
      "Lee",
      "Oct 9",
      '<div>Thank you.</div><script>ignoreScript</script><table class="att"><tr><td>attachmentMetadata</td></tr></table>',
    );
  const page = readThreadText(html, 0);
  expect(page.messageCount).toBe(2);
  expect(page.nextOffset).toBeNull();
  expect(page.text).toContain("From: Sam <sam@example.test>\nDate: Oct 8");
  expect(page.text).toContain("Updated proof\n\nPlease sign & return\nby Nov 4.");
  expect(page.text).toContain("Thank you.");
  expect(page.text).not.toContain("ignoreScript");
  expect(page.text).not.toContain("attachmentMetadata");
});

test("continuation offsets preserve a long single message through its final line", () => {
  const start = "Words ".repeat(4800);
  const html = message("Lee", "Nov 1", `<div>${start}Due November 30</div>`);
  const first = readThreadText(html, 0);
  expect(first.nextOffset).toBe(first.text.length);
  assert(first.nextOffset !== null);
  const last = readThreadText(html, first.nextOffset);
  expect(last.nextOffset).toBeNull();
  expect(first.text + last.text).toContain(start + "Due November 30");
  expect(first.totalCharacters).toEqual(first.text.length + last.text.length);
  expect(() => readThreadText(html, last.totalCharacters + 1)).toThrow();
});

test("only Gmail profile photos from sender headers reach the email preview", () => {
  const photo = "https://lh3.googleusercontent.com/a/sender";
  const bodyImage = `<img src="${photo}">See you Friday`;
  const html =
    message(`<img src="${photo}">Sam`, "Nov 1", bodyImage) +
    message('<img src="https://example.test/image">Lee', "Nov 2", bodyImage) +
    message("Pat", "Nov 3", bodyImage);
  expect(
    readThreadPreview(extractMessages(html), 0).messages.map((item) => item.senderPhotoUrl),
  ).toEqual([photo, undefined, undefined]);
  expect(readThreadText(html, 0).text).not.toContain(photo);
});

test("rejects a sign-in page or incomplete print markup", () => {
  expect(() => readThreadText("<h1>Sign in</h1>", 0)).toThrow();
  expect(() =>
    readThreadText('<table class="message"><tr><td>Loading</td></tr></table>', 0),
  ).toThrow();
});

test("source preview continues the same message across pages and keeps quoted headers in the body", () => {
  const long = "Words ".repeat(3000);
  const html =
    message("Mira", "Nov 1", `${long}<br>From: Sam<br>Date: Nov 3`) +
    message("Sam", "Nov 4", "Approved");
  const all = readThreadText(html, 0);
  const messages = extractMessages(html);
  const first = readThreadPreview(messages, 0);
  expect(first.messages.map(({ sender }) => sender)).toEqual(["Mira"]);
  assert(first.nextOffset !== null);
  const last = readThreadPreview(messages, first.nextOffset);
  expect(last.nextOffset).toBeNull();
  expect(last.messages.map(({ index, sender }) => [index, sender])).toEqual([
    [0, "Mira"],
    [1, "Sam"],
  ]);
  assert(first.messages[0] && last.messages[0]);
  expect(first.messages[0].body + last.messages[0].body).toContain(
    long.trimEnd() + "\nFrom: Sam\nDate: Nov 3",
  );
  expect(all.messageCount).toBe(2);
});
