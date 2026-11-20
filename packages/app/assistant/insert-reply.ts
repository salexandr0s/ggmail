import { setTimeout as delay } from "node:timers/promises";
import { ms } from "@ggmail/shared/ms";
import { t } from "@lingui/core/macro";
import { ensureCurrentScope, getMailScope } from "./mail-context";
import { AssistantError } from "./responses";

// This runs synchronously in the Gmail view's isolated world. Recheck the URL
// there too: Gmail can navigate between the main-process check and execution.
const editReply = String.raw`(expectedUrl, body, canOpen) => {
  const url = new URL(location.href);
  const expected = new URL(expectedUrl);
  const mailbox = (url) => url.origin + url.pathname.replace(/\/$/, "");
  if (mailbox(url) !== mailbox(expected) || url.hash.split("?")[0] !== expected.hash) {
    return "unavailable";
  }

  const visible = (el) => el.checkVisibility({ visibilityProperty: true }) && !el.closest('[aria-hidden="true"]');
  const inThread = (el) => !el.closest('[role="dialog"], .AD, .a3s, .gmail_quote');
  const headings = Array.from(document.querySelectorAll('[role="main"] h2:is(.hP, [data-legacy-thread-id])'))
    .filter((el) => visible(el) && inThread(el));
  if (headings.length !== 1) return "unavailable";
  const heading = headings[0];
  const legacyId = heading.getAttribute("data-legacy-thread-id")?.replace(/^#/, "");
  const routeId = expected.hash.split("/").at(-1);
  if (legacyId && /^[\da-f]{15,32}$/i.test(routeId) && legacyId !== routeId) return "unavailable";

  const thread = heading.closest(".nH.id, .g.id") ?? heading.closest('[role="main"]');
  const editors = Array.from(thread.querySelectorAll('.ip [contenteditable="true"]:is([g_editable="true"], .Am[role="textbox"])'))
    .filter((el) => visible(el) && inThread(el.closest(".ip")) && !el.closest(".a3s, .gmail_quote"));
  const editor = editors.find((el) => el === document.activeElement) ?? editors[0];
  if (editors.length > 1 && editor !== document.activeElement) return "unavailable";
  if (!editor) {
    if (!canOpen) return "waiting";
    const reply = Array.from(thread.querySelectorAll(".amn .ams:is(.bkH, .bkI)"))
      .find((el) => visible(el) && inThread(el));
    if (!reply) return "unavailable";
    reply.click();
    return "waiting";
  }
  if (editor.closest(".ip").querySelector(".Un.J-JN-M-I .mI")) return "unavailable";

  // Insert before any existing text, signature or quoted history. A native
  // editing transaction lets Gmail autosave the change and supports Undo.
  editor.focus();
  if (document.activeElement !== editor) return "unavailable";
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const hasContent = editor.textContent.trim() || editor.querySelector("img, hr, table");
  // Chromium's multiline insertText adds block wrappers around blank lines.
  // Encode the body as text first, then supply only our own line breaks.
  const plain = document.createElement("div");
  plain.textContent = body;
  const html = plain.innerHTML.replace(/\r\n?|\n/g, "<br>") + (hasContent ? "<br><br>" : "");
  return document.execCommand("insertHTML", false, html) ? "inserted" : "unavailable";
}`;

export async function insertReply(
  scope: ReturnType<typeof getMailScope>,
  body: string,
  signal: AbortSignal,
) {
  if (scope.kind !== "thread" || !scope.mailbox || !scope.hash) {
    throw new AssistantError(t`The mail view changed. Ask again to use the new view.`);
  }
  const view = scope.gmail.view.webContents;
  const url = new URL(scope.hash, scope.mailbox).href;
  const deadline = Date.now() + ms("4 seconds");
  let canOpen = true;
  do {
    ensureCurrentScope(scope, signal);
    const args = [url, body, canOpen].map((value) => JSON.stringify(value)).join(",");
    const result: unknown = await view.executeJavaScriptInIsolatedWorld(1243, [
      { code: `(${editReply})(${args})` },
    ]);
    if (result === "inserted") {
      if (!signal.aborted && !view.isDestroyed() && getMailScope().key === scope.key) {
        view.focus();
      }
      return;
    }
    if (result !== "waiting") {
      break;
    }
    canOpen = false;
    await delay(100, undefined, { signal });
  } while (Date.now() < deadline);
  throw new AssistantError(t`Open a reply in this thread and try again.`);
}
