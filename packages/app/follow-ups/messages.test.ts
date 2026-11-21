import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFollowUpMessages } from "./messages";

function message(headers: string) {
  return `<table class="message"><tr><td>Me &lt;me@example.test&gt;</td><td>Friday</td></tr>
  <tr><td>${headers}</td></tr><tr><td>Body</td></tr></table>`;
}

test("reads the To field after Reply-To and keeps the anchor used by existing reminders", () => {
  const headers = "Reply-To: other@example.test<br>To: Casey &lt;casey@example.test&gt;<br>Cc: Lee";
  const [read] = readFollowUpMessages(message(headers));
  const oldHeader = "Reply-To: other@example.testTo: Casey <casey@example.test>Cc: Lee";
  expect(read?.recipient).toBe("Casey <casey@example.test>");
  expect(read?.key).toBe(
    createHash("sha256")
      .update(JSON.stringify(["me@example.test", "Friday", oldHeader, "Body"]))
      .digest("hex"),
  );
});

test("uses copy recipients when To is empty and excludes a Reply-To address on its own", () => {
  expect(
    readFollowUpMessages(message("<div>Cc: Casey</div><div>Bcc: Lee</div>"))[0]?.recipient,
  ).toBe("Casey, Lee");
  expect(readFollowUpMessages(message("Reply-To: wrong@example.test"))[0]?.recipient).toBe("");
});
