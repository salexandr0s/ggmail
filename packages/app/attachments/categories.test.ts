import { afterAll, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const directory = mkdtempSync(path.join(tmpdir(), "attachment-categories-"));
mock.module("electron", () => ({
  default: {
    app: { getPath: () => directory, getVersion: () => "1.0.0" },
    ipcMain: { on() {} },
  },
}));

const { AttachmentCategoryOverrides, clearAttachmentCategories } = await import("./categories");
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("scopes manual choices to the account, signed-in mailbox, delegate and message part", () => {
  const mailbox = "https://mail.google.com/mail/u/0/";
  const primary = new AttachmentCategoryOverrides("a", mailbox, "Me@example.test");
  const other = new AttachmentCategoryOverrides("b", mailbox, "me@example.test");
  const part = "194a92f8c0000001/0.1";
  primary.set(part, "uncategorized");
  other.set(part, "ticket");
  expect(new AttachmentCategoryOverrides("a", mailbox, "me@example.test").get(part)).toBe(
    "uncategorized",
  );
  expect(primary.get(part + ".2")).toBeUndefined();
  expect(
    new AttachmentCategoryOverrides("a", mailbox, "different@example.test").get(part),
  ).toBeUndefined();
  expect(
    new AttachmentCategoryOverrides("a", mailbox + "d/22/", "me@example.test").get(part),
  ).toBeUndefined();
  expect(readFileSync(path.join(directory, "attachment-categories.json"), "utf8")).not.toContain(
    "example.test",
  );

  primary.set(part, null);
  expect(
    new AttachmentCategoryOverrides("a", mailbox, "me@example.test").get(part),
  ).toBeUndefined();
  primary.set(part, "order");
  clearAttachmentCategories("a");
  expect(
    new AttachmentCategoryOverrides("a", mailbox, "me@example.test").get(part),
  ).toBeUndefined();
  expect(other.get(part)).toBe("ticket");
  clearAttachmentCategories();
  expect(
    new AttachmentCategoryOverrides("b", mailbox, "me@example.test").get(part),
  ).toBeUndefined();
});
