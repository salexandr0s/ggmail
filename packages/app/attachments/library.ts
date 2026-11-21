/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail selectors, request parameters and IPC errors. The renderer localizes status messages. */
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { AttachmentBatch, AttachmentCategory } from "@ggmail/shared/attachments";
import { ms } from "@ggmail/shared/ms";
import type { Gmail } from "@/gmail";
import { fetchPrintThread } from "@/gmail/print-thread";
import { getSearchMailbox, listSearchThreads } from "@/gmail/search";
import { AttachmentCategoryOverrides } from "./categories";
import { AttachmentDiskIndex } from "./disk-index";
import { readPrintAttachments, type AttachmentEntry } from "./metadata";
import { readAttachmentPreview } from "./preview";

type Thread = {
  id: string;
  subject: string;
  signature: string;
  photos?: { address: string; url: string }[];
};

// Authentication and throttling responses affect the whole mailbox. Preserve this batch
// and wait for Retry before making more requests on its behalf.
class MailboxReadPaused extends Error {}

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

export function getAttachmentLibrary(
  gmail: Gmail,
  delegatedId: string | null,
  expectedKey?: string,
) {
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
  if (expectedKey !== undefined && expectedKey !== library.mailboxKey) {
    throw new Error("Mailbox changed");
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
  private paused = false;
  private consecutiveReadFailures = 0;
  private running?: Promise<AttachmentBatch>;
  controller?: AbortController;
  private lifetime = new AbortController();

  private disk?: AttachmentDiskIndex;
  private indexed = new Map<string, { signature: string; ids: string[] }>();
  private cachedLocators = new Set<string>();
  private refreshingLocators = new Map<string, Promise<void>>();
  private forceRead = false;
  private categories: AttachmentCategoryOverrides;

  constructor(
    private gmail: Gmail,
    readonly mailbox: string,
    readonly email: string | null,
  ) {
    this.categories = new AttachmentCategoryOverrides(gmail.accountId, mailbox, email);
    if (email && !gmail.store.getState().attentionRequired) {
      this.disk = new AttachmentDiskIndex(gmail.accountId, this.categories.mailboxKey);
      for (const { id, signature, entries } of this.disk.read(mailbox)) {
        this.indexed.set(id, { signature, ids: entries.map(({ file }) => file.id) });
        for (const entry of entries) {
          entry.file.categoryOverride = this.categories.get(entry.file.id);
          this.entries.set(entry.file.id, entry);
          this.cachedLocators.add(entry.file.id);
        }
      }
    }
  }

  get mailboxKey() {
    return this.categories.mailboxKey;
  }

  setCategory(mailboxKey: string, fileId: string, category: AttachmentCategory | null) {
    const entry = this.entries.get(fileId);
    if (mailboxKey !== this.categories.mailboxKey || !entry) {
      throw new Error("Attachment unavailable");
    }
    this.categories.set(fileId, category);
    entry.file.categoryOverride = category ?? undefined;
  }

  dispose() {
    this.controller?.abort();
    this.lifetime.abort();
    this.disk?.close();
  }

  // Gmail may require short-lived parameters for downloads or thumbnails. Resolve
  // them only for a file being used, sharing one request across siblings in a thread.
  async liveEntry(fileId: string) {
    const entry = this.entries.get(fileId);
    if (!entry || !this.cachedLocators.has(fileId)) {
      return entry;
    }
    const { threadId, file } = entry;
    let refresh = this.refreshingLocators.get(threadId);
    if (!refresh) {
      refresh = this.readThread({ id: threadId, subject: file.subject }, this.lifetime.signal)
        .then((entries) => {
          this.lifetime.signal.throwIfAborted();
          for (const live of entries ?? []) {
            const existing = this.entries.get(live.file.id);
            if (existing && existing.threadId === threadId) {
              existing.downloadUrl = live.downloadUrl;
              existing.thumbnailUrl = live.thumbnailUrl;
              this.cachedLocators.delete(live.file.id);
            }
          }
        })
        .finally(() => this.refreshingLocators.delete(threadId));
      this.refreshingLocators.set(threadId, refresh);
    }
    await refresh;
    return this.cachedLocators.has(fileId) ? undefined : this.entries.get(fileId);
  }

  async preview(fileId: string, size: "thumbnail" | "full") {
    const entry = this.entries.get(fileId);
    if (!entry) {
      throw new Error("Attachment unavailable");
    }
    const controller = new AbortController();
    loading.add(controller);
    try {
      const signal = AbortSignal.any([
        this.lifetime.signal,
        controller.signal,
        AbortSignal.timeout(ms("30s")),
      ]);
      const preview = await readAttachmentPreview(this.gmail.session, entry, size, signal);
      // Rendering a page of thumbnails must never restart discovery for those threads.
      if (preview || size === "thumbnail" || !this.cachedLocators.has(fileId)) {
        return preview;
      }
      signal.throwIfAborted();
      const live = await this.liveEntry(fileId);
      return live ? await readAttachmentPreview(this.gmail.session, live, size, signal) : null;
    } finally {
      loading.delete(controller);
    }
  }

  private status(): AttachmentBatch["status"] {
    if (this.paused) {
      return "incomplete";
    }
    if (this.morePages || this.pending.length) {
      return "loading";
    }
    return this.failed.length ? "incomplete" : "ready";
  }

  async snapshot(mode: "snapshot" | "retry" | "refresh"): Promise<AttachmentBatch> {
    // A previous visit may still own the last in-flight batch. Include its results
    // in the snapshot before a new reader advances the cursor.
    await this.running?.catch(() => {});
    if (mode === "refresh") {
      this.seenThreads.clear();
      this.pending = [];
      this.failed = [];
      this.page = 1;
      this.morePages = true;
      this.forceRead = true;
    }
    if (mode !== "snapshot") {
      this.paused = false;
      this.consecutiveReadFailures = 0;
      this.pending.push(...this.failed);
      this.failed = [];
    }
    return {
      mailboxKey: this.categories.mailboxKey,
      files: Array.from(this.entries.values(), (entry) => entry.file),
      status: this.status(),
    };
  }

  next() {
    if (this.running) {
      return this.running;
    }
    const controller = new AbortController();
    this.controller = controller;
    loading.add(controller);
    this.running = this.readBatch(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          this.paused = true;
        }
        throw error;
      })
      .finally(() => {
        loading.delete(controller);
        this.running = undefined;
        this.controller = undefined;
      });
    return this.running;
  }

  private async readThread(thread: Omit<Thread, "signature">, signal: AbortSignal) {
    const load = () => fetchPrintThread(this.gmail.session, this.mailbox, thread.id, signal);
    let response = await load().catch(() => undefined);
    signal.throwIfAborted();
    if (
      !response ||
      ([408, 500, 502, 503, 504].includes(response.status) && !response.headers.has("Retry-After"))
    ) {
      await response?.body?.cancel();
      await delay(ms("750ms"), undefined, { signal });
      response = await load();
    }
    if (response.status === 404 || response.status === 410) {
      return [];
    }
    if (!response.ok) {
      if ([401, 403, 429].includes(response.status) || response.headers.has("Retry-After")) {
        throw new MailboxReadPaused("Gmail paused attachment reads");
      }
      throw new Error("Gmail thread unavailable");
    }
    const html = await response.text();
    try {
      return readPrintAttachments(html, this.mailbox, thread.id, thread.subject, thread.photos);
    } catch {
      // A thread with an unreadable print view must not stop older mail from loading.
      return null;
    }
  }

  private async readBatch(signal: AbortSignal): Promise<AttachmentBatch> {
    const initialStatus = this.status();
    if (initialStatus !== "loading") {
      return { mailboxKey: this.categories.mailboxKey, files: [], status: initialStatus };
    }
    if (!this.pending.length && this.morePages) {
      const page = await listSearchThreads(
        this.gmail.session,
        this.gmail.view.webContents.getUserAgent(),
        this.mailbox,
        "has:attachment",
        this.page,
        signal,
        true,
        this.seenThreads,
      );
      signal.throwIfAborted();
      const fresh = page.threads.filter((thread) => !this.seenThreads.has(thread.id));
      this.pending = fresh.flatMap(
        ({ id, lastMessageId, subject, photos, sender, snippet, date }) => {
          const signature = createHash("sha256")
            .update(JSON.stringify([lastMessageId, subject, sender, snippet, date]))
            .digest("hex");
          return this.forceRead || this.indexed.get(id)?.signature !== signature
            ? [{ id, subject, photos, signature }]
            : [];
        },
      );
      this.morePages = page.more;
      this.page++;
      for (const thread of fresh) {
        this.seenThreads.add(thread.id);
      }
    }

    const batch = this.pending.slice(0, 4);
    const results = await Promise.allSettled(
      batch.map((thread) => this.readThread(thread, signal)),
    );
    // Advance past individual unreadable threads so one old email cannot hide the rest of the mailbox.
    signal.throwIfAborted();
    const added = [];
    const removedIds = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        this.consecutiveReadFailures++;
        if (result.reason instanceof MailboxReadPaused || this.consecutiveReadFailures >= 4) {
          this.paused = true;
        }
      } else {
        this.consecutiveReadFailures = 0;
      }
      const thread = batch[index];
      if (!thread) {
        continue;
      }
      if (result.status === "rejected" || result.value === null) {
        this.failed.push(thread);
        continue;
      }
      const ids = result.value.map(({ file }) => file.id);
      const keep = new Set(ids);
      for (const old of this.indexed.get(thread.id)?.ids ?? []) {
        if (!keep.has(old)) {
          removedIds.push(old);
          this.entries.delete(old);
          this.cachedLocators.delete(old);
        }
      }
      this.disk?.save(thread.id, thread.signature, result.value);
      this.indexed.set(thread.id, { signature: thread.signature, ids });
      for (const entry of result.value) {
        entry.file.categoryOverride = this.categories.get(entry.file.id);
        this.cachedLocators.delete(entry.file.id);
        added.push(entry.file);
        this.entries.set(entry.file.id, entry);
      }
    }
    this.pending.splice(0, batch.length);
    if (this.status() === "ready") {
      for (const [id, thread] of this.indexed) {
        if (this.seenThreads.has(id)) {
          continue;
        }
        for (const fileId of thread.ids) {
          this.entries.delete(fileId);
          this.cachedLocators.delete(fileId);
          removedIds.push(fileId);
        }
        this.indexed.delete(id);
        this.disk?.remove(id);
      }
    }
    return {
      mailboxKey: this.categories.mailboxKey,
      files: added,
      removedIds,
      status: this.status(),
    };
  }
}
