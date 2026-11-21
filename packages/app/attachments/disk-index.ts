/* oxlint-disable lingui/no-unlocalized-strings -- SQLite statements and local cache paths. */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  attachmentCategories,
  isAttachmentCategory,
  isCategorySelection,
} from "@ggmail/shared/attachments";
import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { app } from "electron";
import { z } from "zod";
import { log } from "@/lib/log";
import { classifyIndexedFilename } from "./classify";
import type { AttachmentEntry } from "./metadata";

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
const storedThread = z.object({
  id: z.string().regex(/^[\da-f]{15,16}$/i),
  signature: z.string(),
  files: z.string().transform((json, ctx) => {
    try {
      return readableFile.array().parse(JSON.parse(json));
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

  read(mailbox: string) {
    const threads = [];
    try {
      for (const row of this.db?.prepare("SELECT id, signature, files FROM threads").all() ?? []) {
        const stored = storedThread.safeParse(row);
        if (!stored.success) {
          continue;
        }
        const { id, signature, files } = stored.data;
        const entries: AttachmentEntry[] = files.map(({ thumbnailView, ...file }) => {
          const [messageId, part] = file.id.split("/") as [string, string];
          const url = new URL(mailbox);
          url.search = new URLSearchParams({
            ui: "2",
            view: "att",
            [messageId.startsWith("msg-a:") ? "permmsgid" : "th"]: messageId,
            attid: part,
            disp: "attd",
            safe: "1",
            zw: "",
          }).toString();
          const thumb = new URL(url);
          if (thumbnailView) {
            thumb.searchParams.set("view", thumbnailView);
            thumb.searchParams.set("disp", "thd");
          }
          return {
            thumbnailUrl: thumbnailView ? thumb.href : undefined,
            file: { ...file, senderPhotoUrl: getGoogleProfilePhotoUrl(file.senderPhotoUrl ?? "") },
            threadId: id,
            messageId,
            part,
            downloadUrl: url.href,
          };
        });
        threads.push({ id, signature, entries });
      }
    } catch {
      this.disable();
    }
    return threads;
  }

  save(id: string, signature: string, entries: AttachmentEntry[]) {
    try {
      // Select fields explicitly. Gmail request URLs, session tokens, message bodies
      // and manual category overrides are never part of this cache.
      if (!this.db) {
        return;
      }
      const files = entries.map(({ file, thumbnailUrl }) =>
        storedFile.parse({
          ...file,
          thumbnailView: thumbnailUrl
            ? (new URL(thumbnailUrl).searchParams.get("view") ?? undefined)
            : undefined,
        }),
      );
      this.db
        ?.prepare("INSERT OR REPLACE INTO threads VALUES (?, ?, ?)")
        .run(id, signature, JSON.stringify(files));
    } catch {
      this.disable();
    }
  }

  remove(id: string) {
    try {
      this.db?.prepare("DELETE FROM threads WHERE id = ?").run(id);
    } catch {
      this.disable();
    }
  }
}
