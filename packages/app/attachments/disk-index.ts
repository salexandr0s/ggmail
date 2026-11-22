/* oxlint-disable lingui/no-unlocalized-strings -- SQLite statements and local cache paths. */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  attachmentCategories,
  fileKind,
  isAttachmentCategory,
  isCategorySelection,
  type AttachmentPreview,
} from "@ggmail/shared/attachments";
import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { app } from "electron";
import { z } from "zod";
import { log } from "@/lib/log";
import { classifyIndexedFilename } from "./classify";
import { markTemplateGraphics, type AttachmentEntry } from "./metadata";
import { isThumbnailMime } from "./preview";

// Keep the on-disk working set small even for mailboxes with years of image attachments.
const thumbnailBytes = 16 * 1024 * 1024;
const maxThumbnailBytes = 2 * 1024 * 1024;

function indexDirectory(accountId?: string) {
  const base = path.join(app.getPath("userData"), "attachment-index");
  return accountId === undefined
    ? base
    : path.join(base, createHash("sha256").update(accountId).digest("hex"));
}

export function clearAttachmentIndexes(accountId?: string) {
  rmSync(indexDirectory(accountId), { recursive: true, force: true });
}

const storedFile = z.object({
  id: z.string().regex(/^(?:[\da-f]{15,16}|msg-a:r-?\d{1,20})\/\d+(?:\.\d+)+$/i),
  name: z.string(),
  isEmbeddedImage: z.boolean().optional(),
  subject: z.string(),
  sender: z.string(),
  senderPhotoUrl: z.string().optional(),
  detectedCategories: z.array(z.enum(attachmentCategories)).refine(isCategorySelection),
  thumbnailView: z.enum(["snatt", "fimg", "att"]).optional(),
  size: z.string(),
  receivedAt: z.number(),
});
// Old indexes stored one detected category. Both formats can be restored even
// when SQLite is temporarily unable to commit a migration.
const readableFile = z.preprocess((raw) => {
  if (
    raw &&
    typeof raw === "object" &&
    !("detectedCategories" in raw) &&
    "detectedCategory" in raw &&
    isAttachmentCategory(raw.detectedCategory) &&
    "name" in raw &&
    typeof raw.name === "string"
  ) {
    return {
      ...raw,
      detectedCategories: classifyIndexedFilename(raw.name) ?? [raw.detectedCategory],
    };
  }
  return raw;
}, storedFile);
const readableFiles = readableFile.array();
const storedThread = z.object({
  id: z.string().regex(/^[\da-f]{15,16}$/i),
  signature: z.string(),
  files: z.string().transform((json, ctx) => {
    try {
      return readableFiles.parse(JSON.parse(json));
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid attachment metadata" });
      return z.NEVER;
    }
  }),
});

// Previous versions stored one category per attachment. Upgrade in place so
// unchanged conversations still match their Gmail signatures on the next scan.
function upgradeCategories(db: DatabaseSync) {
  if (Number(db.prepare("PRAGMA user_version").get()?.user_version) >= 2) {
    return;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const update = db.prepare("UPDATE threads SET files = ? WHERE id = ?");
    for (const row of db.prepare("SELECT id, signature, files FROM threads").all()) {
      const stored = storedThread.safeParse(row);
      if (!stored.success) {
        continue;
      }
      const { files, id } = stored.data;
      if (files.length) {
        update.run(JSON.stringify(files), id);
      }
    }
    db.exec("PRAGMA user_version = 2");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// A committed row is one successfully read conversation, including conversations with
// zero files. An interrupted scan never advances a separate cursor past unsaved data.
export class AttachmentDiskIndex {
  private db?: DatabaseSync;
  private hasThumbnails = false;

  constructor(accountId: string, mailboxKey: string) {
    const directory = indexDirectory(accountId);
    const filename = path.join(directory, mailboxKey + "-v1.sqlite");
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      this.db = new DatabaseSync(filename);
      chmodSync(filename, 0o600);
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, signature TEXT NOT NULL, files TEXT NOT NULL)",
      );
    } catch (error) {
      this.disable();
      if (
        error instanceof Error &&
        "errcode" in error &&
        (error.errcode === 11 || error.errcode === 26)
      ) {
        // This is a disposable metadata index. Rebuild a corrupt database on the next visit.
        rmSync(filename, { force: true });
      }
    }
    if (this.db) {
      try {
        upgradeCategories(this.db);
      } catch {
        // The previously saved files are still readable if the upgrade could not commit.
        log.warn("Could not update saved attachment categories; will retry when the index reopens");
      }
      try {
        this.db.exec(`CREATE TABLE IF NOT EXISTS thumbnails (
          fileId TEXT UNIQUE NOT NULL, threadId TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL
        )`);
        this.db.exec("CREATE INDEX IF NOT EXISTS thumbnails_thread ON thumbnails(threadId)");
        this.hasThumbnails = true;
      } catch {
        // A read-only or locked legacy index still supplies file metadata.
      }
    }
  }

  thumbnail(entry: AttachmentEntry): AttachmentPreview | undefined {
    if (!this.hasThumbnails || !this.db) {
      return;
    }
    try {
      const row = this.db
        .prepare(
          "SELECT mime, bytes FROM thumbnails WHERE fileId = ? AND threadId = ? AND length(bytes) BETWEEN 1 AND ?",
        )
        .get(entry.file.id, entry.threadId, maxThumbnailBytes);
      if (
        typeof row?.mime === "string" &&
        isThumbnailMime(row.mime) &&
        row.bytes instanceof Uint8Array
      ) {
        return { mime: row.mime, bytes: Uint8Array.from(row.bytes).buffer };
      }
    } catch {
      // Gmail can supply the thumbnail if the local cache cannot be read.
    }
  }

  saveThumbnail(entry: AttachmentEntry, preview: AttachmentPreview) {
    const db = this.db;
    if (
      !db ||
      !this.hasThumbnails ||
      !isThumbnailMime(preview.mime) ||
      !preview.bytes.byteLength ||
      preview.bytes.byteLength > maxThumbnailBytes
    ) {
      return;
    }
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare(
        "INSERT OR REPLACE INTO thumbnails (fileId, threadId, mime, bytes) VALUES (?, ?, ?, ?)",
      ).run(entry.file.id, entry.threadId, preview.mime, new Uint8Array(preview.bytes));
      db.prepare(`DELETE FROM thumbnails WHERE rowid IN (
        SELECT id FROM (
          SELECT rowid AS id, row_number() OVER recent AS position,
                 sum(length(bytes)) OVER recent AS total FROM thumbnails
          WINDOW recent AS (ORDER BY rowid DESC)
        ) WHERE position > 256 OR total > ?
      )`).run(thumbnailBytes);
      db.exec("COMMIT");
    } catch {
      if (db.isTransaction) {
        db.exec("ROLLBACK");
      }
    }
  }

  close() {
    this.db?.close();
    this.db = undefined;
  }

  private disable() {
    this.close();
    log.warn("Attachment index unavailable; continuing in memory");
  }

  *read() {
    try {
      for (const row of this.db?.prepare("SELECT id, signature, files FROM threads").iterate() ??
        []) {
        const stored = storedThread.safeParse(row);
        if (!stored.success) {
          continue;
        }
        const { id, signature, files } = stored.data;
        const entries: AttachmentEntry[] = files.map(({ thumbnailView, ...file }) => {
          const [messageId, part] = file.id.split("/") as [string, string];
          return {
            thumbnailView,
            file: { ...file, senderPhotoUrl: getGoogleProfilePhotoUrl(file.senderPhotoUrl ?? "") },
            threadId: id,
            messageId,
            part,
          };
        });
        // Older indexes lack body references. Show their files immediately and have
        // the usual discovery pass revisit only conversations with unchecked images.
        const needsImageCheck = files.some(
          (file) => file.isEmbeddedImage === undefined && fileKind(file.name) === "image",
        );
        if (needsImageCheck) {
          markTemplateGraphics(entries);
        }
        yield { id, signature: needsImageCheck ? "" : signature, entries };
      }
    } catch {
      this.disable();
    }
  }

  update(
    saved: { id: string; signature: string; entries: AttachmentEntry[] }[],
    removed: string[],
  ) {
    const db = this.db;
    if (!db || (!saved.length && !removed.length)) {
      return;
    }
    try {
      db.exec("BEGIN IMMEDIATE");
      const save = db.prepare("INSERT OR REPLACE INTO threads VALUES (?, ?, ?)");
      const invalidate = this.hasThumbnails
        ? db.prepare("DELETE FROM thumbnails WHERE threadId = ?")
        : undefined;
      for (const { id, signature, entries } of saved) {
        invalidate?.run(id);
        // Store the view type. Live URLs can contain short-lived Gmail credentials.
        const files = entries.map(({ file, thumbnailUrl }) =>
          storedFile.parse({
            ...file,
            thumbnailView: thumbnailUrl
              ? (new URL(thumbnailUrl).searchParams.get("view") ?? undefined)
              : undefined,
          }),
        );
        save.run(id, signature, JSON.stringify(files));
      }
      if (removed.length) {
        const remove = db.prepare("DELETE FROM threads WHERE id = ?");
        for (const id of removed) {
          invalidate?.run(id);
          remove.run(id);
        }
      }
      db.exec("COMMIT");
    } catch {
      // Closing the connection rolls back the entire unfinished batch.
      this.disable();
    }
  }
}
