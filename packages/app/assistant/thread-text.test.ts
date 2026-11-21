import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { readThreadText } from "./thread-text";

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

test("rejects a sign-in page or incomplete print markup", () => {
  expect(() => readThreadText("<h1>Sign in</h1>", 0)).toThrow();
  expect(() =>
    readThreadText('<table class="message"><tr><td>Loading</td></tr></table>', 0),
  ).toThrow();
});
