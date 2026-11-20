/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import type { AttachmentBatch } from "@ggmail/shared/attachments";
import { ms } from "@ggmail/shared/ms";
import type { Gmail } from "@/gmail";
import { getSearchMailbox, listSearchThreads } from "@/gmail/search";
import { readPrintAttachments, type AttachmentEntry } from "./metadata";
import { readAttachmentPreview } from "./preview";

type Thread = {
  id: string;
  subject: string;
  photos?: { address: string; url: string }[];
};

const libraries = new WeakMap<Gmail, AttachmentLibrary>();
const loading = new Set<AbortController>();

export function pauseAttachmentReads() {
  for (const controller of loading) {
    controller.abort();
  }
}

export function forgetAttachments(gmail: Gmail) {
  libraries.get(gmail)?.dispose();
  return libraries.delete(gmail);
}

export function getAttachmentLibrary(gmail: Gmail, delegatedId: string | null) {
  const mailbox = getSearchMailbox(gmail, delegatedId);
  if (!mailbox) {
    forgetAttachments(gmail);
    throw new Error("Mailbox unavailable");
  }
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
  private pending: Thread[] = [];
  private seenThreads = new Set<string>();
  private failed: Thread[] = [];
  private page = 1;
  private morePages = true;
  private running?: Promise<AttachmentBatch>;
  controller?: AbortController;
  private lifetime = new AbortController();

  constructor(
    private gmail: Gmail,
    readonly mailbox: string,
    readonly email: string | null,
  ) {}

  dispose() {
    this.controller?.abort();
    this.lifetime.abort();
  }

  async preview(fileId: string, size: "thumbnail" | "full") {
    const entry = this.entries.get(fileId);
    if (!entry) {
      throw new Error("Attachment unavailable");
    }
    const controller = new AbortController();
    loading.add(controller);
    try {
      return await readAttachmentPreview(
        this.gmail.session,
        entry,
        size,
        AbortSignal.any([this.lifetime.signal, controller.signal, AbortSignal.timeout(ms("30s"))]),
      );
    } finally {
      loading.delete(controller);
    }
  }

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
      const page = await listSearchThreads(
        this.gmail.session,
        this.gmail.view.webContents.getUserAgent(),
        this.mailbox,
        "has:attachment",
        this.page,
        signal,
        true,
      );
      signal.throwIfAborted();
      const fresh = page.threads.filter((thread) => !this.seenThreads.has(thread.id));
      if (page.threads.length && !fresh.length) {
        throw new Error("Gmail repeated a search page");
      }
      this.pending = fresh.map(({ id, subject, photos }) => ({ id, subject, photos }));
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
        return readPrintAttachments(
          await response.text(),
          this.mailbox,
          thread.id,
          thread.subject,
          thread.photos,
        );
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
