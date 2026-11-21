import { expect, mock, test } from "bun:test";
import type { AttachmentPreview } from "@ggmail/shared/attachments";
import type { AttachmentEntry } from "./metadata";
import { AttachmentThumbnails, snapshotUrl } from "./preview";

function savedEntry(messageId: string): AttachmentEntry {
  return {
    threadId: "194a92f8c0000001",
    messageId,
    part: "0.2",
    thumbnailView: "att",
    file: {
      id: messageId + "/0.2",
      name: "Receipt.pdf",
      subject: "",
      sender: "",
      receivedAt: 0,
      size: "",
      detectedCategories: ["receipt"],
    },
  };
}

test("restored thumbnails use their original view, message ID format and delegated mailbox", () => {
  const mailbox = "https://mail.google.com/mail/u/0/d/example/";
  for (const [messageId, key] of [
    ["194a92f8c0000001", "th"],
    ["msg-a:r-123456", "permmsgid"],
  ] as const) {
    const url = snapshotUrl(savedEntry(messageId), false, mailbox);
    expect(url.origin + url.pathname).toBe(mailbox);
    expect(url.searchParams.get(key)).toBe(messageId);
    expect(url.searchParams.get("view")).toBe("att");
    expect(url.searchParams.get("attid")).toBe("0.2");
    expect(url.searchParams.get("disp")).toBe("thd");
  }
});

test("shares an in-flight thumbnail and retries after leaving or receiving no preview", async () => {
  const cache = new AttachmentThumbnails();
  const entry = savedEntry("194a92f8c0000001");
  const previous = new AbortController();
  const next = new AbortController();
  const slow = Promise.withResolvers<AttachmentPreview | null>();
  const first = mock(() => slow.promise);
  const outstanding = cache.get(entry, previous.signal, first);
  expect(cache.get(entry, previous.signal, first)).toBe(outstanding);
  expect(first).toHaveBeenCalledTimes(1);

  previous.abort();
  const image = { bytes: new ArrayBuffer(1), mime: "image/png" };
  const second = mock(async () => image);
  expect(await cache.get(entry, next.signal, async () => null)).toBeNull();
  expect(await cache.get(entry, next.signal, second)).toBe(image);
  slow.resolve({ ...image });
  await outstanding;
  expect(await cache.get(entry, next.signal, second)).toBe(image);
  expect(second).toHaveBeenCalledTimes(1);
});

test("evicts the least recently used thumbnails at the mailbox byte limit", async () => {
  const cache = new AttachmentThumbnails();
  const { signal } = new AbortController();
  const read = mock(async () => ({ bytes: new ArrayBuffer(1024 * 1024), mime: "image/png" }));
  const entries = Array.from({ length: 9 }, (_, index) => savedEntry("msg-a:r" + index));
  const [first, second, ...rest] = entries;
  if (!first || !second) {throw new Error("Missing test entries");}
  await cache.get(first, signal, read);
  await cache.get(second, signal, read);
  await cache.get(first, signal, read);
  for (const entry of rest) {await cache.get(entry, signal, read);}
  await cache.get(first, signal, read);
  expect(read).toHaveBeenCalledTimes(9);
  await cache.get(second, signal, read);
  expect(read).toHaveBeenCalledTimes(10);
});
