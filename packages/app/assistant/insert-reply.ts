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
  const excluded = '[role="dialog"], [role="menu"], .J-M, .a3s, .gmail_quote, .gmail_signature, [data-smartmail="gmail_signature"]';
  const chromeOnly = excluded + ', [contenteditable]';
  const routeId = expected.hash.split("/").at(-1);
  const legacyRoute = /^[\da-f]{15,32}$/i.test(routeId);

  // Gmail can mount the inline composer beside the subject's layout wrapper.
  // Search each native main separately so a split-pane inbox is not a thread.
  const inlineRoot = (el) => {
    if (el.closest(excluded) || el.parentElement?.closest('[contenteditable]')) return null;
    const reply = el.closest(".ip");
    if (reply) return reply;
    const compose = el.closest(".HM");
    if (el.closest(".M9, .I5") && compose &&
        Array.from(compose.querySelectorAll(".HQ .Un")).some(node => !node.closest(chromeOnly))) return compose;
    return null;
  };
  const contexts = [];
  for (const main of document.querySelectorAll('[role="main"]')) {
    if (!visible(main) || main.closest(chromeOnly)) continue;
    const own = el => el.closest('[role="main"]') === main && visible(el);
    const headings = Array.from(main.querySelectorAll('h2.hP, h2[data-legacy-thread-id], .ha h2'))
      .filter(el => own(el) && !el.closest(chromeOnly + ', .AD'));
    const editors = Array.from(main.querySelectorAll('.ip [contenteditable], .HM [contenteditable]'))
      .filter(el => own(el) && el.isContentEditable && inlineRoot(el) &&
        (el.matches('[g_editable="true"], [role="textbox"], .Am') || el.closest(".Ap")));
    if (!headings.length && !editors.length) continue;
    if (headings.length > 1) return "unavailable";
    const id = headings[0]?.getAttribute("data-legacy-thread-id")?.replace(/^#/, "");
    if (legacyRoute && id && id.toLowerCase() !== routeId.toLowerCase()) continue;
    contexts.push({main, heading: headings[0], editors, matched: legacyRoute && !!id});
  }
  const matched = contexts.filter(context => context.matched);
  const targets = matched.length ? matched : contexts;
  if (targets.length !== 1) return "unavailable";
  const {main, heading, editors} = targets[0];
  const editor = editors.find(el => el === document.activeElement) ?? editors[0];
  if (editors.length > 1 && editor !== document.activeElement) return "unavailable";
  if (!editor) {
    if (!canOpen) return "waiting";
    if (!heading) return "unavailable";
    const reply = Array.from(main.querySelectorAll(".amn .ams:is(.bkH, .bkI)"))
      .find(el => el.closest('[role="main"]') === main && visible(el) && !el.closest(chromeOnly + ', .AD'));
    if (!reply) return "unavailable";
    reply.click();
    return "waiting";
  }
  const forward = Array.from(inlineRoot(editor).querySelectorAll(".Un.J-JN-M-I .mI"))
    .some(el => visible(el) && !el.closest(chromeOnly + ', [role="menuitem"]'));
  if (forward) return "unavailable";

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
  // Gmail supplies its own formatted signature. Only omit an identical trailing
  // signature from the suggestion when the user has not added any draft text.
  const signatures = Array.from(editor.querySelectorAll('.gmail_signature, [data-smartmail="gmail_signature"]'))
    .filter(el => visible(el) && !el.closest('.gmail_quote'));
  if (signatures.length === 1) {
    const signature = signatures[0].innerText.trim();
    const draft = body.trimEnd();
    if (signature && editor.innerText.trim() === signature && draft.endsWith("\n" + signature)) {
      body = draft.slice(0, -signature.length).trimEnd();
    }
  }
  const suffix = hasContent ? "\n\n" : "";
  const lines = (body + suffix).split(/\r\n?|\n/);
  // Gmail requires Trusted Types, and this world inherits that: insertHTML
  // throws on a plain string. The policy only ever sees text this function
  // escaped itself, with its own line breaks.
  let policy;
  try {
    policy = globalThis.ggmailReplyPolicy ??=
      window.trustedTypes?.createPolicy("ggmail-insert-reply", { createHTML: (html) => html });
  } catch {
    // Gmail's policy now allowlists policy names. Type the lines instead.
    for (const [index, line] of lines.entries()) {
      if (index && !document.execCommand("insertLineBreak")) return "unavailable";
      if (line && !document.execCommand("insertText", false, line)) return "unavailable";
    }
    return "inserted";
  }
  const plain = document.createElement("div");
  const html = lines.map((line) => {
    plain.textContent = line;
    return plain.innerHTML;
  }).join("<br>");
  return document.execCommand("insertHTML", false, policy?.createHTML(html) ?? html) ? "inserted" : "unavailable";
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
  // The click is in the separate assistant renderer. Give the Gmail editing
  // command a focused WebContents even when its editor was already open.
  ensureCurrentScope(scope, signal);
  view.focus();
  let canOpen = true;
  do {
    ensureCurrentScope(scope, signal);
    const args = [url, body, canOpen].map((value) => JSON.stringify(value)).join(",");
    const result: unknown = await view.executeJavaScriptInIsolatedWorld(1243, [
      { code: `(${editReply})(${args})` },
    ]);
    if (result === "inserted") {
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
