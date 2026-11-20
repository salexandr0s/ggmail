import { setTimeout as delay } from "node:timers/promises";
import { t } from "@lingui/core/macro";
import type { AssistantScope } from "@ggmail/shared/assistant";
import { gmailSearchHash, parseGmailMessageId } from "@ggmail/shared/gmail";
import { ms } from "@ggmail/shared/ms";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import { WebContentsView, type WebContents } from "electron";
import { z } from "zod";
import { accounts } from "@/accounts";
import type { Gmail } from "@/gmail";
import { gmailUrl } from "@/gmail/url";
import { main } from "@/main";
import { AssistantError } from "./responses";

const gmailRoot = new URL(gmailUrl);

function getMailbox(url: URL) {
  const root = gmailRoot.pathname.replace(/\/$/, "");
  const path = url.pathname.replace(/\/$/, "");
  if (url.origin !== gmailRoot.origin || url.username || url.password) {
    return;
  }

  if (
    path === root ||
    (path.startsWith(`${root}/d/`) && /^[\w-]+$/.test(path.slice(root.length + 3)))
  ) {
    return `${url.origin}${path}/`;
  }
}

type Scope = {
  kind: AssistantScope;
  key: string;
  accountId: string;
  accountLabel: string;
  gmail: Gmail;
  mailbox?: string;
  hash?: string;
};

export function getMailScope(): Scope {
  const account = accounts.getSelectedAccount();
  const { gmail, tabs } = account.instance;
  const accountId = account.config.id;
  const accountLabel = account.config.label;
  const chat: Scope = { kind: "chat", key: `${accountId}:chat`, accountId, accountLabel, gmail };
  if (main.location !== "/" || !gmail.hasView || tabs.activeTab.id !== GMAIL_TAB_ID) {
    return chat;
  }

  const url = URL.parse(gmail.view.webContents.getURL());
  const mailbox = url && getMailbox(url);
  if (!url || !mailbox) {
    return chat;
  }
  const hash = url.hash.split("?")[0] || "#inbox";
  const threadId = parseGmailMessageId(hash);
  const kind = threadId ? "thread" : hash === "#all" ? "allMail" : "mailView";
  const key = JSON.stringify([accountId, mailbox, threadId ?? hash]);

  return { kind, key, accountId, accountLabel, gmail, mailbox, hash };
}

const snippetSchema = z.object({
  subject: z.string().max(300),
  sender: z.string().max(320),
  snippet: z.string().max(700),
  date: z.string().max(180),
  id: z
    .string()
    .regex(/^[\da-f]{15,32}$/i)
    .optional(),
});

const threadSchema = z.object({
  subject: z.string().max(300),
  messages: z
    .array(
      z.object({
        sender: z.string().max(320),
        date: z.string().max(180),
        body: z.string().max(8000),
        truncated: z.boolean(),
      }),
    )
    .max(8),
});

type Snippet = z.infer<typeof snippetSchema>;

export type MailSource = {
  subject: string;
  hash: string;
};

function snippetsToSources(rows: Snippet[], fallback: string) {
  return rows.map(({ id, ...row }) => ({
    ...row,
    source: { subject: row.subject, hash: id ? `#all/${id}` : fallback },
  }));
}

// Run fixed readers in an isolated world. Gmail supplies strings only; page content
// never becomes code, and no IPC or Electron API is exposed to the mail document.
const readRows = String.raw`(() => {
  const visible = (node) => node.getClientRects().length && !node.closest('[aria-hidden="true"]');
  const main = Array.from(document.querySelectorAll('[role="main"]')).find(visible);
  if (!main) return null;
  const rows = Array.from(main.querySelectorAll("tr.zA"))
    .filter(visible).slice(0, 16);
  if (!rows.length) {
    return Array.from(main.querySelectorAll(".TC, .TD")).some(visible) ? [] : null;
  }
  const snippets = rows.map((row) => {
    const subjectElement = row.querySelector(".bog");
    const author = row.querySelector(".yW [email]");
    const date = row.querySelector(".xW [title]");
    const id = row.querySelector("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id")
      ?? row.getAttribute("data-legacy-thread-id");
    return {
      subject: subjectElement?.textContent?.trim().slice(0, 300) ?? "",
      sender: (author?.getAttribute("email") ?? row.querySelector(".yW")?.textContent ?? "").trim().slice(0, 320),
      snippet: row.querySelector(".y2")?.textContent?.trim().slice(0, 700) ?? "",
      date: (date?.getAttribute("title") ?? row.querySelector(".xW")?.textContent ?? "").trim().slice(0, 180),
      id: /^[\da-f]{15,32}$/i.test(id ?? "") ? id : undefined,
    };
  }).filter((row) => row.subject || row.snippet);
  return snippets.length ? snippets : null;
})()`;

const readThread = String.raw`(() => {
  const main = Array.from(document.querySelectorAll('[role="main"]'))
    .find((node) => node.getClientRects().length && !node.closest('[aria-hidden="true"]'));
  if (!main) return null;
  const subject = main.querySelector("h2.hP, h2[data-legacy-thread-id]");
  const bodies = Array.from(main.querySelectorAll(".adn .a3s"))
    .filter((body) => body.getClientRects().length && !body.closest('[aria-hidden="true"]'))
    .slice(-8);
  return {
    subject: subject?.textContent?.trim().slice(0, 300) ?? "",
    messages: bodies.map((body) => {
      const message = body.closest(".adn");
      const sender = message?.querySelector(".gD[email]");
      const date = message?.querySelector(".g3[title]");
      const text = body.innerText.trim();
      return {
        sender: (sender?.getAttribute("email") ?? sender?.textContent ?? "").trim().slice(0, 320),
        date: (date?.getAttribute("title") ?? date?.textContent ?? "").trim().slice(0, 180),
        body: text.slice(0, 8000),
        truncated: text.length > 8000,
      };
    }).filter((message) => message.body),
  };
})()`;

async function readDom(view: WebContents, code: string): Promise<unknown> {
  return view.executeJavaScriptInIsolatedWorld(1243, [{ code }]);
}

export function ensureCurrentScope(scope: Scope, signal: AbortSignal) {
  signal.throwIfAborted();
  if (getMailScope().key !== scope.key) {
    throw new AssistantError(t`The mail view changed. Ask again to use the new view.`);
  }
}

export async function readCurrentMail(scope: Scope, signal: AbortSignal) {
  ensureCurrentScope(scope, signal);
  if (scope.kind === "chat" || !scope.hash) {
    return { kind: scope.kind, sources: [] };
  }

  const view = scope.gmail.view.webContents;
  if (scope.kind === "thread") {
    const parsed = threadSchema.safeParse(await readDom(view, readThread));
    ensureCurrentScope(scope, signal);
    const thread = parsed.success ? parsed.data : undefined;
    return {
      kind: "thread",
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal model context about the source data.
      note: "Only expanded messages are included. If none were captured, ask the user to open or expand the email and try again.",
      thread,
      sources: thread?.messages.length ? [{ subject: thread.subject, hash: scope.hash }] : [],
    };
  }

  const parsed = z
    .array(snippetSchema)
    .max(16)
    .safeParse(await readDom(view, readRows));
  ensureCurrentScope(scope, signal);
  const rows = snippetsToSources(parsed.data ?? [], scope.hash);
  return {
    kind: scope.kind,
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal model context about the source data.
    note: "A limited snapshot of visible email snippets. A missing row is not evidence that the email does not exist.",
    rows,
    sources: rows.map((row) => row.source),
  };
}

export async function searchAllMail(scope: Scope, query: string, signal: AbortSignal) {
  ensureCurrentScope(scope, signal);
  if (scope.kind !== "allMail" || !scope.mailbox) {
    throw new AssistantError(t`Open Gmail's All Mail view to search this account.`);
  }

  const hash = gmailSearchHash(query);
  const target = new URL(hash, scope.mailbox);
  const searchView = new WebContentsView({
    webPreferences: {
      session: scope.gmail.session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const { webContents } = searchView;
  // Keep the unattached view alive until the request finishes.
  const abort = () => {
    if (!searchView.webContents.isDestroyed()) {
      searchView.webContents.close();
    }
  };
  const deadline = AbortSignal.timeout(ms("16 seconds"));
  const stop = AbortSignal.any([signal, deadline]);
  stop.addEventListener("abort", abort, { once: true });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, url) => {
    const next = URL.parse(url);
    if (!next || getMailbox(next) !== scope.mailbox) {
      event.preventDefault();
    }
  });
  webContents.on("will-redirect", (event, url) => {
    const next = URL.parse(url);
    if (!next || getMailbox(next) !== scope.mailbox) {
      event.preventDefault();
    }
  });
  webContents.setUserAgent(scope.gmail.view.webContents.getUserAgent());

  try {
    await webContents.loadURL(target.href);
    while (!stop.aborted) {
      ensureCurrentScope(scope, stop);
      const url = URL.parse(webContents.getURL());
      if (
        url &&
        getMailbox(url) === scope.mailbox &&
        decodeURIComponent(url.hash.replace(/\+/g, " ")) ===
          decodeURIComponent(target.hash.replace(/\+/g, " "))
      ) {
        const parsed = z
          .array(snippetSchema)
          .max(16)
          .safeParse(await readDom(webContents, readRows));
        if (parsed.success) {
          return { rows: snippetsToSources(parsed.data, hash), complete: parsed.data.length === 0 };
        }
      }
      await delay(ms("350 milliseconds"), undefined, { signal: stop });
    }
  } catch {
    ensureCurrentScope(scope, signal);
  } finally {
    stop.removeEventListener("abort", abort);
    abort();
  }

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal model context about the source data.
  return {
    rows: [],
    complete: false,
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal model context about the source data.
    note: "No matching rows could be verified. Gmail may have no matches or the results may not have loaded.",
  };
}
