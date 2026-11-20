/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import type { AttachmentBatch } from "@ggmail/shared/attachments";
import { ms } from "@ggmail/shared/ms";
import type { Gmail } from "@/gmail";
import { gmailUrl } from "@/gmail/url";
import { readPrintAttachments, type AttachmentEntry } from "./metadata";
import { listAttachmentThreads } from "./search";

const libraries = new WeakMap<Gmail, AttachmentLibrary>();
const loading = new Set<AbortController>();

export function pauseAttachmentReads() {
  for (const controller of loading) {
    controller.abort();
  }
}

export function forgetAttachments(gmail: Gmail) {
  libraries.get(gmail)?.controller?.abort();
  return libraries.delete(gmail);
}

export function getAttachmentLibrary(gmail: Gmail, delegatedId: string | null) {
  const expected = new URL(gmailUrl);
  if (delegatedId) {
    expected.pathname = `${expected.pathname}/d/${encodeURIComponent(delegatedId)}`;
  }
  const current = gmail.hasView && URL.parse(gmail.view.webContents.getURL());
  if (
    !current ||
    current.origin !== expected.origin ||
    current.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "")
  ) {
    forgetAttachments(gmail);
    throw new Error("Mailbox unavailable");
  }
  const mailbox = expected.origin + expected.pathname.replace(/\/$/, "") + "/";
  let library = libraries.get(gmail);
  if (!library || library.mailbox !== mailbox || library.email !== gmail.userEmail) {
    forgetAttachments(gmail);
    library = new AttachmentLibrary(gmail, mailbox, gmail.userEmail);
    libraries.set(gmail, library);
  }
  return library;
}

class AttachmentLibrary {
  entries = new Map<string, AttachmentEntry>();
  private pending: { id: string; subject: string }[] = [];
  private seenThreads = new Set<string>();
  private failed: { id: string; subject: string }[] = [];
  private page = 1;
  private morePages = true;
  private running?: Promise<AttachmentBatch>;
  controller?: AbortController;

  constructor(
    private gmail: Gmail,
    readonly mailbox: string,
    readonly email: string | null,
  ) {}

  private get complete() {
    return !this.morePages && !this.pending.length;
  }

  snapshot(): AttachmentBatch {
    return {
      files: Array.from(this.entries.values(), (entry) => entry.file),
      complete: this.complete,
      partial: this.failed.length > 0,
    };
  }

  retry() {
    this.pending.push(...this.failed);
    this.failed = [];
    return this.snapshot();
  }

  next() {
    if (this.running) {
      return this.running;
    }
    const controller = new AbortController();
    this.controller = controller;
    loading.add(controller);
    this.running = this.readBatch(controller.signal).finally(() => {
      loading.delete(controller);
      this.running = undefined;
      this.controller = undefined;
    });
    return this.running;
  }

  private async readBatch(signal: AbortSignal): Promise<AttachmentBatch> {
    if (!this.pending.length && this.morePages) {
      const page = await listAttachmentThreads(
        this.gmail.session,
        this.gmail.view.webContents.getUserAgent(),
        this.mailbox,
        this.page,
        signal,
      );
      signal.throwIfAborted();
      const fresh = page.threads.filter((thread) => !this.seenThreads.has(thread.id));
      if (page.threads.length && !fresh.length) {
        throw new Error("Gmail repeated a search page");
      }
      this.pending = fresh;
      this.morePages = page.more;
      this.page++;
      for (const thread of fresh) {
        this.seenThreads.add(thread.id);
      }
    }

    const batch = this.pending.slice(0, 4);
    const results = await Promise.allSettled(
      batch.map(async (thread) => {
        const url = new URL(this.mailbox);
        url.search = new URLSearchParams({
          ui: "2",
          view: "pt",
          search: "all",
          th: thread.id,
          mb: "0",
          hl: "en",
        }).toString();
        const response = await this.gmail.session.fetch(url.href, {
          credentials: "include",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(ms("20s"))]),
        });
        if (response.status === 404 || response.status === 410) {
          return [];
        }
        if (!response.ok) {
          throw new Error("Gmail thread unavailable");
        }
        return readPrintAttachments(await response.text(), this.mailbox, thread.id, thread.subject);
      }),
    );
    // Advance past individual unreadable threads so one old email cannot hide the rest of the mailbox.
    signal.throwIfAborted();
    const added = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        const thread = batch[index];
        if (thread) {
          this.failed.push(thread);
        }
        continue;
      }
      for (const entry of result.value) {
        if (!this.entries.has(entry.file.id)) {
          added.push(entry.file);
        }
        this.entries.set(entry.file.id, entry);
      }
    }
    this.pending.splice(0, batch.length);
    // When a whole batch fails, wait for an explicit retry before doing more network work.
    if (results.length && results.every((result) => result.status === "rejected")) {
      throw new Error("Gmail thread batch unavailable");
    }
    return { files: added, complete: this.complete, partial: this.failed.length > 0 };
  }
}
