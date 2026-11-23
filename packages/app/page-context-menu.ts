import { SCHEDULE_FOLLOW_UP_PATH } from "@ggmail/shared/follow-ups";
import { t } from "@lingui/core/macro";
import { BrowserWindow, Menu, type WebContentsView } from "electron";
import { accounts } from "./accounts";
import { config } from "./config";
import { setupWindowContextMenu } from "./context-menu";
import { type ContextAction, showContextActions } from "./context-menu-popup";
import { getSearchMailbox } from "./gmail/search";
import { resolveRoutableUrl } from "./lib/deep-link";
import { log } from "./lib/log";
import { quoteToAssistant, threadActions } from "./mail-context-actions";
import { main } from "./main";
import { openExternalUrl } from "./url";

const threadControls = String.raw`(expectedUrl, routeId, point, taskLabel, hasSelection, addTask) => {
  if (location.href !== expectedUrl) return null;
  const chrome = el => el.getClientRects().length && !el.closest('.a3s, .gmail_quote, [contenteditable], [role="dialog"], [aria-hidden="true"]');
  const headings = [...document.querySelectorAll('[role="main"] h2.hP, [role="main"] h2[data-legacy-thread-id]')].filter(chrome);
  if (headings.length !== 1) return null;
  const heading = headings[0];
  const legacy = heading.getAttribute("data-legacy-thread-id")?.replace(/^#/, "");
  if (legacy && /^[0-9a-f]{15,16}$/i.test(routeId) && legacy !== routeId) return null;
  const target = document.elementFromPoint(point.x, point.y);
  const body = target?.closest(".a3s");
  const selected = window.getSelection();
  const withinMessage = !!body && heading.closest('[role="main"]').contains(body) &&
    (!selected?.rangeCount || (body.contains(selected.anchorNode) && body.contains(selected.focusNode)));
  const container = body?.closest(".adn, [data-message-id], [data-legacy-message-id]");
  const envelope = container?.closest(".adn") ?? container;
  const senderEl = [...(envelope?.querySelectorAll(".gD, .g2[email]") ?? [])].find(el => !el.closest(".a3s"));
  const sender = (senderEl?.getAttribute("email") || senderEl?.textContent || "").trim().slice(0, 512);
  const legacyMessage = (container?.getAttribute("data-legacy-message-id") ?? envelope?.querySelector("[data-legacy-message-id]")?.getAttribute("data-legacy-message-id"))?.replace(/^#/, "");
  const messageId = /^[a-f0-9]{15,16}$/i.test(legacyMessage || "") ? legacyMessage : undefined;
  const excerpt = !hasSelection && body && heading.closest('[role="main"]').contains(body) ? body.innerText.trim().slice(0, 4001) : "";
  const buttons = hasSelection ? [] : [...document.querySelectorAll('[role="toolbar"] :is([role="button"],button), .G-atb :is([role="button"],button)')].filter(chrome);
  const task = buttons.find(el => {
    const label = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("data-tooltip") || "");
    return !el.matches('[aria-disabled="true"], :disabled') && (label.trim() === taskLabel || /add to tasks|shift\s*\+\s*t\b/i.test(label) ||
      [...el.querySelectorAll("img, .asa, [style]")].some(icon => /(?:add_task|add_to_tasks|tasks_add)/i.test(icon.getAttribute("src") || getComputedStyle(icon).backgroundImage)));
  });
  if (addTask) { if (task) task.click(); return !!task; }
  return {subject: heading.textContent.trim().slice(0, 512), excerpt, sender, messageId, withinMessage, task: !!task};
}`;

export function setupPageContextMenu(view: BrowserWindow | WebContentsView) {
  const source = view.webContents;
  let sequence = 0;
  setupWindowContextMenu(view, (params, template, systemMenu) => {
    const request = ++sequence;
    const parent = BrowserWindow.getAllWindows().find(
      (win) => win === view || win.contentView.children.some((child) => child === view),
    );
    const url = source.getURL();
    const shell = parent === view;
    const account = accounts.getSelectedAccount();
    const gmail = account.instance.gmail;
    const mailbox =
      gmail.hasView &&
      view === gmail.view &&
      getSearchMailbox(gmail, account.config.gmail.delegatedAccountId);
    if (
      !parent ||
      (!shell && !mailbox && !resolveRoutableUrl(url)) ||
      params.formControlType === "input-password"
    ) {
      systemMenu();
      return;
    }
    const point = { x: params.x, y: params.y };
    if (!shell) {
      const bounds = (view as WebContentsView).getBounds();
      point.x += bounds.x;
      point.y += bounds.y;
    }
    const selection = params.selectionText.trim();
    const id =
      mailbox && gmail.messageId && params.frame === source.mainFrame && !params.isEditable
        ? gmail.messageId
        : null;
    const controlArgs = JSON.stringify([
      url,
      id,
      { x: params.x / source.getZoomFactor(), y: params.y / source.getZoomFactor() },
      t`Add to Tasks`,
      Boolean(selection),
    ]);
    const readControls = (addTask: boolean) =>
      source.executeJavaScriptInIsolatedWorld(1246, [
        {
          code: `(${threadControls})(...${controlArgs}, ${addTask})`,
        },
      ]);
    async function open(parent: BrowserWindow) {
      const controls = id
        ? ((await readControls(false)) as {
            subject: string;
            sender: string;
            withinMessage: boolean;
            messageId?: string;
            excerpt: string;
            task: boolean;
          } | null)
        : null;
      if (
        request !== sequence ||
        source.isDestroyed() ||
        source.getURL() !== url ||
        parent.isDestroyed()
      ) {
        return;
      }
      const thread =
        controls && id && (!selection || controls.withinMessage)
          ? threadActions(
              account,
              {
                id,
                subject: controls.subject,
                snippet: "",
                sender: controls.sender,
                messageId: controls.messageId,
              },
              selection,
              controls.excerpt,
              (options, choose) =>
                showContextActions(
                  parent,
                  source,
                  point,
                  [
                    options.map((option) => ({
                      id: "calendar",
                      label: option.label,
                      calendar: option.display,
                      run: () => choose(option),
                    })),
                  ],
                  410,
                ),
            )
          : undefined;
      const primary: ContextAction[] = [];
      if (thread) {
        primary.push(thread.quote, thread.calendar);
        if (selection) {
          primary.push(thread.task);
        } else if (controls?.task) {
          primary.push({
            id: "task",
            label: t`Add to Tasks`,
            run: () => {
              void readControls(true).catch((error) =>
                log.error("Could not activate Gmail Tasks", error),
              );
            },
          });
        }
        if (new URL(url).hash.startsWith("#sent/")) {
          primary.push({
            id: "followUp",
            label: t`Schedule follow-up`,
            run: () => main.navigate(SCHEDULE_FOLLOW_UP_PATH),
          });
        }
      } else if (selection && !params.isEditable && (mailbox || parent === main.windowIfCreated)) {
        primary.push({
          id: "quote",
          label: t`Quote to assistant`,
          run: () => quoteToAssistant(selection),
        });
      }
      const edits: ContextAction[] = [];
      const links: ContextAction[] = [];
      if (/^https?:\/\//i.test(params.linkURL)) {
        links.push({
          id: "open",
          label: t`Open link`,
          run: () => void openExternalUrl(params.linkURL),
        });
      }
      const native = Menu.buildFromTemplate(template);
      for (const item of native.items) {
        let id = item.id;
        if (item.label === t`Copy URL`) {
          id = "pageUrl";
        }
        if (item.label === t`Open in Default Browser`) {
          id = "browser";
        }
        if (
          !id ||
          ["lookUpSelection", "dictionarySuggestions", "learnSpelling", "noGuessesFound"].includes(
            id,
          )
        ) {
          continue;
        }
        const group = ["cut", "copy", "paste", "pasteAndMatchStyle", "selectAll"].includes(id)
          ? edits
          : links;
        group.push({
          id,
          label: item.label.replace(/&(.)/g, "$1"),
          enabled: item.enabled,
          run: () => item.click(),
        });
      }
      if (thread) {
        links.unshift(thread.messageLink);
      }
      const other = [{ id: "system", label: t`System menu…`, run: systemMenu }];
      if (shell && !primary.length && !edits.length && !links.length) {
        if (parent === main.windowIfCreated && config.get("unifiedInbox.enabled")) {
          primary.push({
            id: "inbox",
            label: t`All Mail`,
            run: () => main.navigate("/unified-inbox"),
          });
        } else {
          systemMenu();
          return;
        }
      }
      const commands = params.isEditable ? [edits, links] : [[...edits, ...links]];
      showContextActions(parent, source, point, [primary, ...commands, other]);
    }
    void open(parent).catch((error) => {
      log.error("Could not open context menu", error);
      if (!source.isDestroyed() && request === sequence && source.getURL() === url) {
        systemMenu();
      }
    });
  });
}
