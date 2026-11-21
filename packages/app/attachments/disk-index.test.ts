import { afterAll, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AttachmentEntry } from "./metadata";

const profile = mkdtempSync(path.join(tmpdir(), "attachment-index-"));
mock.module("electron", () => ({ app: { getPath: () => profile } }));
mock.module("@/lib/log", () => ({ log: { warn() {} } }));
const { AttachmentDiskIndex, clearAttachmentIndexes } = await import("./disk-index");
afterAll(() => rmSync(profile, { recursive: true, force: true }));

test("commits per-thread metadata, isolates mailboxes and clears removed accounts", () => {
  const id = "194a92f8c0000001";
  const mailbox = "https://mail.google.com/mail/u/0/";
  const file = {
    id: id + "/0.1",
    name: "Receipt.pdf",
    sender: "Jane",
    subject: "Payment",
    detectedCategory: "receipt",
    categoryOverride: "order",
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
      entries: [{ threadId: id, file: { id: file.id, detectedCategory: "receipt" } }],
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
