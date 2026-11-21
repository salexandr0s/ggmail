import { createHash } from "node:crypto";
import type { AssistantScope, AssistantSender } from "@ggmail/shared/assistant";
import { parseGmailMessageId } from "@ggmail/shared/gmail";
import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import { t } from "@lingui/core/macro";
import type { WebContents } from "electron";
import { z } from "zod";
import { accounts } from "@/accounts";
import type { Gmail } from "@/gmail";
import { fetchPrintThread, legacyThreadId } from "@/gmail/print-thread";
import { getSearchMailbox, listSearchThreads } from "@/gmail/search";
import { main } from "@/main";
import { AssistantError } from "./responses";
import { readThreadText } from "./thread-text";

function activeMailboxes() {
  return accounts.getAccounts().flatMap(({ config, instance }) => {
    const gmail = instance.gmail;
    const mailbox = getSearchMailbox(gmail, config.gmail.delegatedAccountId);
    return mailbox && !gmail.store.getState().attentionRequired
      ? [{ accountId: config.id, mailbox, ownerEmail: gmail.userEmail, label: config.label, gmail }]
      : [];
  });
}

export function getAssistantMailboxes() {
  const ready = new Map(activeMailboxes().map((account) => [account.accountId, account]));
  return accounts.getAccountConfigs().map(({ id, label }) => ({
    accountId: id,
    label,
    email: ready.get(id)?.ownerEmail ?? null,
    available: ready.has(id),
  }));
}

type Scope = {
  kind: AssistantScope;
  unified: boolean;
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
  const unified = main.location === "/unified-inbox";
  const ready = activeMailboxes();
  // A sign-in or delegation change invalidates earlier cross-account results and citations.
  const identity = ready.map(({ accountId, mailbox, ownerEmail, gmail }) => [
    gmail.mailboxGeneration,
    gmail.view.webContents.id,
    accountId,
    mailbox,
    ownerEmail,
  ]);
  const contextKey = (view: string) =>
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Node hash algorithm.
    createHash("sha256")
      .update(JSON.stringify([accountId, identity, main.location, view]))
      .digest("hex");
  const chat: Scope = {
    kind: "chat",
    key: contextKey("chat"),
    unified,
    accountId,
    accountLabel,
    gmail,
  };
  const mailbox = ready.find((item) => item.accountId === accountId)?.mailbox;
  if (main.location !== "/" || !mailbox || tabs.activeTab.id !== GMAIL_TAB_ID) {
    return chat;
  }
  const url = new URL(gmail.view.webContents.getURL());
  const hash = url.hash.split("?")[0] || "#inbox";
  const threadId = parseGmailMessageId(hash);
  const kind = threadId ? "thread" : hash === "#all" ? "allMail" : "mailView";
  const key = contextKey(threadId ?? hash);

  return { kind, key, unified, accountId, accountLabel, gmail, mailbox, hash };
}

// Photos are UI metadata from Gmail's message header. Never load an inline
// email image as an avatar or include photo URLs in provider input.
const senderSchema = z
  .object({
    name: z.string().max(320),
    address: z.string().max(320),
    photo: z.string().max(2048),
  })
  .transform(({ name, address, photo }): AssistantSender => {
    const host = z.email().safeParse(address).success
      ? address.slice(address.lastIndexOf("@") + 1).toLowerCase()
      : undefined;
    const domain = host && z.hostname().safeParse(host).success ? host : undefined;
    return { name: name || address, domain, photoUrl: getGoogleProfilePhotoUrl(photo) };
  });

const snippetSchema = z.object({
  subject: z.string().max(300),
  sender: z.string().max(320),
  senders: z.array(senderSchema).max(8),
  snippet: z.string().max(700),
  date: z.string().max(180),
  id: z.string().regex(legacyThreadId).optional(),
});

const threadSchema = z.object({
  id: z.string().regex(legacyThreadId).optional(),
  subject: z.string().max(300),
  messages: z
    .array(
      z.object({
        sender: z.string().max(320),
        author: senderSchema,
        date: z.string().max(180),
        body: z.string().max(8000),
        truncated: z.boolean(),
      }),
    )
    .max(8),
});

type Snippet = z.infer<typeof snippetSchema>;

type MailboxIdentity = { accountId: string; mailbox: string; ownerEmail: string | null };
export type MailSource = MailboxIdentity & {
  threadId?: string;
  subject: string;
  hash: string;
  senders?: AssistantSender[];
  rowSender?: string;
};

function snippetsToSources(rows: Snippet[], fallback: string, identity: MailboxIdentity) {
  return rows.map(({ id, senders, ...row }) => {
    const source: MailSource = {
      ...identity,
      threadId: id,
      subject: row.subject,
      hash: id ? `#all/${id}` : fallback,
      senders: senders.length || !row.sender ? senders : [{ name: row.sender }],
      rowSender: id ? undefined : row.sender,
    };
    return { ...row, source };
  });
}

const readSender = String.raw`(el, img) => ({
  name: (el?.getAttribute("name") || el?.textContent || "").trim().slice(0, 320),
  address: (el?.getAttribute("email") || "").trim().slice(0, 320),
  photo: (img?.currentSrc || img?.src || "").slice(0, 2048),
})`;

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
    const authors = Array.from(row.querySelectorAll(".yW [email]")).slice(0, 8);
    const author = authors[0];
    const date = row.querySelector(".xW [title]");
    const id = (row.querySelector("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id")
      ?? row.getAttribute("data-legacy-thread-id"))?.replace(/^#/, "");
    return {
      subject: subjectElement?.textContent?.trim().slice(0, 300) ?? "",
      sender: (author?.getAttribute("email") ?? row.querySelector(".yW")?.textContent ?? "").trim().slice(0, 320),
      senders: authors.map(el => (${readSender})(el, el.querySelector("img") ??
        (authors.length === 1 ? row.querySelector(".yW img") : null))),
      snippet: row.querySelector(".y2")?.textContent?.trim().slice(0, 700) ?? "",
      date: (date?.getAttribute("title") ?? row.querySelector(".xW")?.textContent ?? "").trim().slice(0, 180),
      id: /^[\da-f]{15,16}$/i.test(id ?? "") ? id : undefined,
    };
  }).filter((row) => row.subject || row.snippet);
  return snippets.length ? snippets : null;
})()`;

const readThread = String.raw`(() => {
  const main = Array.from(document.querySelectorAll('[role="main"]'))
    .find((node) => node.getClientRects().length && !node.closest('[aria-hidden="true"]'));
  if (!main) return null;
  const headings = Array.from(main.querySelectorAll("h2.hP, h2[data-legacy-thread-id]"))
    .filter(el => el.getClientRects().length && !el.closest('.a3s, .gmail_quote, [role="dialog"], [aria-hidden="true"]'));
  if (headings.length !== 1) return null;
  const subject = headings[0];
  const legacy = subject.getAttribute("data-legacy-thread-id")?.replace(/^#/, "");
  const bodies = Array.from(main.querySelectorAll(".adn .a3s"))
    .filter((body) => body.getClientRects().length && !body.closest('[aria-hidden="true"]'))
    .slice(-8);
  return {
    id: /^[\da-f]{15,16}$/i.test(legacy ?? "") ? legacy : undefined,
    subject: subject.textContent.trim().slice(0, 300),
    messages: bodies.map((body) => {
      const message = body.closest(".adn");
      const sender = Array.from(message?.querySelectorAll(".gD[email], .gD") ?? []).find(el => !el.closest(".a3s, .gmail_quote"));
      const photo = Array.from(message?.querySelectorAll(".aju img, img.ajn, .gE img[data-hovercard-id]") ?? [])
        .find(img => !img.closest(".a3s, .gmail_quote"));
      const date = message?.querySelector(".g3[title]");
      const text = body.innerText.trim();
      return {
        sender: (sender?.getAttribute("email") ?? sender?.textContent ?? "").trim().slice(0, 320),
        author: (${readSender})(sender, photo),
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
  if (scope.kind === "chat" || !scope.hash || !scope.mailbox) {
    return { kind: scope.kind, sources: [] };
  }

  const identity = {
    accountId: scope.accountId,
    mailbox: scope.mailbox,
    ownerEmail: scope.gmail.userEmail,
  };
  const view = scope.gmail.view.webContents;
  if (scope.kind === "thread") {
    const parsed = threadSchema.safeParse(await readDom(view, readThread));
    ensureCurrentScope(scope, signal);
    const thread = parsed.success ? parsed.data : undefined;
    const route = parseGmailMessageId(scope.hash);
    const routeId = route && legacyThreadId.test(route) ? route : undefined;
    const threadId = routeId ?? thread?.id;
    if (thread?.id && routeId && thread.id !== routeId) {
      throw new AssistantError(t`The mail view changed. Ask again to use the new view.`);
    }
    const authors = new Map<string, AssistantSender>();
    const messages = thread?.messages.map(({ author, ...message }) => {
      if (author.name) {
        authors.set(message.sender || author.name, author);
      }
      return message;
    });
    return {
      kind: "thread",
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal model context about the source data.
      note: "These are the expanded messages on screen. Read the source for the full conversation, including collapsed replies.",
      thread: thread && { subject: thread.subject, messages },
      sources:
        thread || threadId
          ? [
              {
                ...identity,
                threadId,
                subject: thread?.subject || "",
                hash: scope.hash,
                senders: Array.from(authors.values()),
              },
            ]
          : [],
    };
  }

  const parsed = z
    .array(snippetSchema)
    .max(16)
    .safeParse(await readDom(view, readRows));
  ensureCurrentScope(scope, signal);
  const rows = snippetsToSources(parsed.data ?? [], scope.hash, identity);
  return {
    kind: scope.kind,
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal model context about the source data.
    note: "A limited snapshot of visible email snippets. A missing row is not evidence that the email does not exist.",
    rows: rows.map(({ source: _source, ...row }) => row),
    sources: rows.map((row) => row.source),
  };
}

function resolveMailbox(source: MailboxIdentity) {
  return activeMailboxes().find(
    (entry) =>
      entry.accountId === source.accountId &&
      entry.mailbox === source.mailbox &&
      entry.ownerEmail === source.ownerEmail,
  );
}

export async function searchAllMail(
  scope: Scope,
  query: string,
  signal: AbortSignal,
  accountId: string,
  page: number,
) {
  ensureCurrentScope(scope, signal);
  const account = activeMailboxes().find((mailbox) => mailbox.accountId === accountId);
  const unavailable = {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Model tool error.
    error: "This mailbox could not be searched. Coverage is partial.",
    rows: [],
    nextPage: null,
    complete: false,
  };
  if (!account || !Number.isSafeInteger(page) || page < 1) {
    return unavailable;
  }
  try {
    const { gmail, mailbox, ownerEmail } = account;
    const { threads, more } = await listSearchThreads(
      gmail.session,
      gmail.view.webContents.getUserAgent(),
      mailbox,
      query,
      page,
      signal,
      true,
    );
    ensureCurrentScope(scope, signal);
    if (!resolveMailbox(account)) {
      return unavailable;
    }
    const found = threads.map(({ id, sender, subject, snippet, date, photos }) => ({
      id,
      sender: sender.slice(0, 320),
      subject: subject.slice(0, 300),
      snippet: snippet.slice(0, 700),
      date: date.slice(0, 180),
      senders: (photos ?? []).map(({ address, url }) =>
        senderSchema.parse({
          name: photos?.length === 1 ? sender.slice(0, 320) : "",
          address: address.slice(0, 320),
          photo: url.slice(0, 2048),
        }),
      ),
    }));
    return {
      rows: snippetsToSources(found, "#all", { accountId, mailbox, ownerEmail }),
      nextPage: more ? page + 1 : null,
      complete: !more,
    };
  } catch {
    ensureCurrentScope(scope, signal);
    return unavailable;
  }
}

export async function readMailSource(
  scope: Scope,
  source: MailSource,
  offset: number,
  signal: AbortSignal,
) {
  ensureCurrentScope(scope, signal);
  const mailbox = resolveMailbox(source);
  if (!mailbox || !source.threadId || !legacyThreadId.test(source.threadId)) {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Model tool error.
    return { error: "Search this mailbox for the subject to get a readable conversation source." };
  }
  try {
    const response = await fetchPrintThread(
      mailbox.gmail.session,
      mailbox.mailbox,
      source.threadId,
      signal,
    );
    if (!response.ok) {
      throw new Error();
    }
    const html = await response.text();
    ensureCurrentScope(scope, signal);
    if (!resolveMailbox(source)) {
      throw new Error();
    }
    return readThreadText(html, offset);
  } catch {
    ensureCurrentScope(scope, signal);
    return {
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Model tool error.
      error: "Gmail could not read this conversation at that offset. Its contents are unverified.",
    };
  }
}

export function openMailSource(scope: Scope, source: MailSource) {
  const mailbox = resolveMailbox(source);
  if (getMailScope().key !== scope.key || !mailbox) {
    throw new AssistantError(t`The mail view changed. Ask again to use the new view.`);
  }
  accounts.getAccount(source.accountId).instance.tabs.activateTab(GMAIL_TAB_ID);
  if (source.accountId !== scope.accountId) {
    accounts.selectAccount(source.accountId);
  }
  if (main.location !== "/") {
    main.navigate("/");
  }
  return mailbox.gmail.navigateToHash(source.hash);
}
