/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import { setTimeout as delay } from "node:timers/promises";
import { gmailSearchHash } from "@ggmail/shared/gmail";
import { ms } from "@ggmail/shared/ms";
import { WebContentsView, type Session } from "electron";
import { z } from "zod";
import type { Gmail } from "./index";
import { gmailSenderSchema, readRowSenders } from "./sender-dom";
import { gmailUrl } from "./url";

/** The authenticated mailbox behind an account, including a delegated mailbox when selected. */
export function getSearchMailbox(gmail: Gmail, delegatedId: string | null) {
  const expected = new URL(gmailUrl);
  if (delegatedId) {
    expected.pathname =
      expected.pathname.replace(/\/$/, "") + "/d/" + encodeURIComponent(delegatedId);
  }
  const current = gmail.hasView && URL.parse(gmail.view.webContents.getURL());
  if (
    !current ||
    current.origin !== expected.origin ||
    current.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "")
  ) {
    return;
  }
  return expected.origin + expected.pathname.replace(/\/$/, "") + "/";
}

const resultPage = z.object({
  threads: z
    .array(
      z.object({
        id: z.string().regex(/^[\da-f]{15,16}$/i),
        lastMessageId: z.string().optional(),
        subject: z.string(),
        sender: z.string(),
        senders: z.array(gmailSenderSchema).max(8).optional(),
        snippet: z.string(),
        date: z.string(),
      }),
    )
    .max(100),
  more: z.boolean(),
});

// Read Gmail's search results without opening the threads or disturbing the account's visible tab.
const readSearchPage = `(includeDetails => {
  const visible = el => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]');
  const main = Array.from(document.querySelectorAll('[role="main"]')).find(visible);
  if (!main) return null;
  const rows = Array.from(main.querySelectorAll('tr.zA')).filter(visible);
  if (!rows.length) return Array.from(main.querySelectorAll('.TC, .TD')).some(visible) ? {threads: [], more: false} : null;
  const threads = rows.map(row => ({
    id: (row.matches('[data-legacy-thread-id]') ? row : row.querySelector('[data-legacy-thread-id]'))?.getAttribute('data-legacy-thread-id')?.replace(/^#/, ''),
    lastMessageId: includeDetails ? (row.querySelector('[data-legacy-last-message-id]') ?? row).getAttribute('data-legacy-last-message-id') ?? undefined : undefined,
    subject: row.querySelector('.bog')?.textContent?.trim() ?? '',
    sender: row.querySelector('.yW')?.textContent?.trim() ?? '',
    senders: includeDetails ? (${readRowSenders})(row) : undefined,
    snippet: row.querySelector('.y2')?.textContent?.trim() ?? '',
    date: row.querySelector('.xW [title]')?.getAttribute('title') ?? row.querySelector('.xW')?.textContent?.trim() ?? ''
  }));
  if (threads.some(thread => !thread.id)) return null;
  const arrow = Array.from(document.querySelectorAll('.amJ, [aria-label="Older"]')).find(visible);
  const older = arrow?.closest('button, [role="button"]') ?? arrow;
  const more = older ? !older.disabled && older.getAttribute('aria-disabled') !== 'true' && !older.classList.contains('T-I-JE') : rows.length >= 10;
  return {threads, more};
})`;

export async function listSearchThreads(
  session: Session,
  userAgent: string,
  mailbox: string,
  query: string,
  page: number,
  signal: AbortSignal,
  includeDetails = false,
  seenThreads?: ReadonlySet<string>,
) {
  const url = new URL(mailbox);
  url.hash = gmailSearchHash(query) + (page > 1 ? "/p" + page : "");
  const view = new WebContentsView({
    webPreferences: {
      session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  view.setBounds({ x: 0, y: 0, width: 1100, height: 750 });
  const { webContents } = view;
  const close = () => {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  };
  const stop = AbortSignal.any([signal, AbortSignal.timeout(ms("30s"))]);
  stop.addEventListener("abort", close, { once: true });
  webContents.setUserAgent(userAgent);
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const isMailbox = (href: string) => {
    const target = URL.parse(href);
    return (
      target?.origin === url.origin &&
      target.pathname.replace(/\/$/, "") === url.pathname.replace(/\/$/, "")
    );
  };
  webContents.on("will-navigate", (event, href) => {
    if (!isMailbox(href)) {
      event.preventDefault();
    }
  });
  webContents.on("will-redirect", (event, href) => {
    if (!isMailbox(href)) {
      event.preventDefault();
    }
  });
  try {
    stop.throwIfAborted();
    await webContents.loadURL(url.href);
    while (true) {
      stop.throwIfAborted();
      const current = URL.parse(webContents.getURL());
      if (
        current &&
        isMailbox(current.href) &&
        decodeURIComponent(current.hash.replace(/\+/g, " ")) === decodeURIComponent(url.hash)
      ) {
        const raw: unknown = await webContents.executeJavaScriptInIsolatedWorld(1244, [
          { code: readSearchPage + "(" + includeDetails + ")" },
        ]);
        if (raw) {
          const result = resultPage.parse(raw);
          // Gmail can change its hash before replacing the previous rows, or render
          // placeholders before their thread IDs. Wait for the requested page to settle.
          if (
            !seenThreads ||
            !result.threads.length ||
            result.threads.some(({ id }) => !seenThreads.has(id))
          ) {
            return result;
          }
        }
      }
      await delay(ms("250ms"), undefined, { signal: stop });
    }
  } finally {
    stop.removeEventListener("abort", close);
    close();
  }
}
