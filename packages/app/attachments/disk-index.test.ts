import { afterAll, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AttachmentCategory } from "@ggmail/shared/attachments";
import type { AttachmentEntry } from "./metadata";

const profile = mkdtempSync(path.join(tmpdir(), "attachment-index-"));
mock.module("electron", () => ({ app: { getPath: () => profile } }));
mock.module("@/lib/log", () => ({ log: { warn() {} } }));
const { AttachmentDiskIndex, clearAttachmentIndexes } = await import("./disk-index");
afterAll(() => rmSync(profile, { recursive: true, force: true }));

test("commits per-thread metadata, isolates mailboxes and clears removed accounts", () => {
  const id = "194a92f8c0000001";
  const mailbox = "https://mail.google.com/mail/u/0/";
  const file: AttachmentEntry["file"] = {
    id: id + "/0.1",
    name: "Receipt.pdf",
    sender: "Jane",
    subject: "Payment",
    detectedCategories: ["receipt"],
    categoryOverride: ["order"],
    size: "12 KB",
    receivedAt: 42,
  } as const;
  const entry: AttachmentEntry = {
    threadId: id,
    messageId: id,
    part: "0.1",
    file,
    downloadUrl: mailbox + "?ik=private-download-token",
    thumbnailUrl: mailbox + "?attbid=private-thumbnail-token",
  };
  const original = new AttachmentDiskIndex("A", "primary");
  original.save(id, "first", [entry]);
  original.close();
  const db = new AttachmentDiskIndex("A", "primary");
  expect(db.read(mailbox)).toMatchObject([
    {
      id,
      signature: "first",
      entries: [{ threadId: id, file: { id: file.id, detectedCategories: ["receipt"] } }],
    },
  ]);
  expect(db.read(mailbox)[0]?.entries[0]?.file.categoryOverride).toBeUndefined();
  const directory = path.join(profile, "attachment-index");
  const bytes = readFileSync(
    path.join(directory, ...readdirSync(directory), "primary-v1.sqlite"),
  ).toString("latin1");
  expect(bytes).not.toContain("private-download-token");
  expect(bytes).not.toContain("private-thumbnail-token");
  const delegated = new AttachmentDiskIndex("A", "delegated");
  const other = new AttachmentDiskIndex("B", "primary");
  expect(delegated.read(mailbox)).toEqual([]);
  expect(other.read(mailbox)).toEqual([]);
  other.save(id, "other", [entry]);
  db.save(id, "changed", []);
  expect(db.read(mailbox)).toEqual([{ id, signature: "changed", entries: [] }]);
  db.remove(id);
  expect(db.read(mailbox)).toEqual([]);
  db.close();
  delegated.close();
  other.close();
  clearAttachmentIndexes("A");
  expect(readdirSync(directory)).toHaveLength(1);
  const surviving = new AttachmentDiskIndex("B", "primary");
  expect(surviving.read(mailbox)).toHaveLength(1);
  surviving.close();
  clearAttachmentIndexes();
  expect(readdirSync(profile)).toEqual([]);
});

test("upgrades legacy filenames in place across restarts and preserves context-only decisions", () => {
  const account = "legacy";
  const directory = path.join(
    profile,
    "attachment-index",
    createHash("sha256").update(account).digest("hex"),
  );
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "primary-v1.sqlite");
  const mailbox = "https://mail.google.com/mail/u/0/";
  const id = "194a92f8c0000002";
  const db = new DatabaseSync(filename);
  db.exec(
    "CREATE TABLE threads (id TEXT PRIMARY KEY, signature TEXT NOT NULL, files TEXT NOT NULL)",
  );
  const fixtures: [string, AttachmentCategory, AttachmentCategory[]][] = [
    ["Web Booking eTicket (ZX72QK).pdf", "uncategorized", ["ticket", "booking"]],
    ["Buchungsübersicht.pdf", "uncategorized", ["booking"]],
    ["scan.pdf", "contract", ["contract"]],
    ["ticket.pdf", "receipt", ["receipt"]],
    ["ticket-123.pdf", "uncategorized", ["uncategorized"]],
    ["Parking ticket.pdf", "ticket", ["uncategorized"]],
  ];
  const files = fixtures.map(([name, detectedCategory], i) => ({
    id: id + "/0." + (i + 1),
    name,
    detectedCategory,
    subject: "Payment receipt",
    sender: "Example",
    receivedAt: 42,
    size: "12 KB",
    thumbnailView: "snatt",
  }));
  db.prepare("INSERT INTO threads VALUES (?, ?, ?)").run(id, "unchanged", JSON.stringify(files));
  db.close();

  // A failed update must keep the saved library available and retry on a later launch.
  const locked = new DatabaseSync(filename);
  locked.exec("BEGIN IMMEDIATE");
  try {
    const previous = new AttachmentDiskIndex(account, "primary");
    const entries = previous.read(mailbox)[0]?.entries;
    expect(entries).toHaveLength(fixtures.length);
    expect(entries?.[0]?.file.detectedCategories).toEqual(["ticket", "booking"]);
    previous.close();
    expect(locked.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
  } finally {
    locked.exec("ROLLBACK");
    locked.close();
  }

  const expected = files.map(({ detectedCategory: _legacy, ...file }, i) => ({
    ...file,
    detectedCategories: fixtures[i]?.[2],
  }));
  for (let launch = 0; launch < 2; launch++) {
    const index = new AttachmentDiskIndex(account, "primary");
    const restored = index.read(mailbox);
    expect(restored[0]?.signature).toBe("unchanged");
    expect(restored[0]?.entries.map((entry) => entry.file.detectedCategories)).toEqual(
      fixtures.map(([, , category]) => category),
    );
    index.close();
    const persisted = new DatabaseSync(filename);
    expect(persisted.prepare("PRAGMA user_version").get()?.user_version).toBe(2);
    const row = persisted.prepare("SELECT files FROM threads WHERE id = ?").get(id);
    expect(JSON.parse(String(row?.files))).toEqual(expected);
    persisted.close();
  }
});
