/* oxlint-disable lingui/no-unlocalized-strings -- Internal Gmail request parameters and MIME types. */
import { fileKind, type AttachmentPreview } from "@ggmail/shared/attachments";
import type { Session } from "electron";
import type { AttachmentEntry } from "./metadata";

const rasterMime = /^image\/(?:png|jpeg|webp|gif|avif|bmp)$/;
const previewTypes: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  txt: "text/plain",
  md: "text/plain",
  csv: "text/plain",
  tsv: "text/plain",
  log: "text/plain",
  json: "text/plain",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
};

// One cache per mailbox. A replacement entry from discovery gets its own thumbnail.
export class AttachmentThumbnails {
  private images = new Map<AttachmentEntry, AttachmentPreview>();
  private bytes = 0;
  private pending = new Map<AttachmentEntry, { visit: AbortSignal; request: Promise<AttachmentPreview | null> }>();

  get(entry: AttachmentEntry, visit: AbortSignal, read: () => Promise<AttachmentPreview | null>) {
    const cached = this.images.get(entry);
    if (cached) {
      this.images.delete(entry);
      this.images.set(entry, cached);
      return cached;
    }
    const pending = this.pending.get(entry);
    if (pending?.visit === visit) {
      return pending.request;
    }
    const request = read().then((preview) => {
      if (preview && !visit.aborted) {
        this.images.set(entry, preview);
        this.bytes += preview.bytes.byteLength;
        for (const [oldest, image] of this.images) {
          if (this.bytes <= 8 * 1024 * 1024 && this.images.size <= 128) {
            break;
          }
          this.images.delete(oldest);
          this.bytes -= image.bytes.byteLength;
        }
      }
      return preview;
    }).finally(() => {
      if (this.pending.get(entry)?.request === request) {
        this.pending.delete(entry);
      }
    });
    this.pending.set(entry, { visit, request });
    return request;
  }
}

function downloadUrl(entry: AttachmentEntry, mailbox: string) {
  if (entry.downloadUrl) {
    return new URL(entry.downloadUrl);
  }
  // Saved metadata omits Gmail locators. Construct one only when a file is opened.
  const url = new URL(mailbox);
  url.search = new URLSearchParams({
    ui: "2",
    view: "att",
    [entry.messageId.startsWith("msg-a:") ? "permmsgid" : "th"]: entry.messageId,
    attid: entry.part,
    disp: "attd",
    safe: "1",
    zw: "",
  }).toString();
  return url;
}

/** Gmail sends document snapshots separately from the attachment download. */
export function snapshotUrl(entry: AttachmentEntry, large: boolean, mailbox: string) {
  const url = entry.thumbnailUrl ? new URL(entry.thumbnailUrl) : downloadUrl(entry, mailbox);
  if (!entry.thumbnailUrl) {
    url.searchParams.set(
      "view",
      entry.thumbnailView ?? (fileKind(entry.file.name) === "image" ? "fimg" : "snatt"),
    );
  }
  url.searchParams.set("disp", "thd");
  url.searchParams.set("sz", large ? "w1600-h2000" : "w480-h300-p-nu");
  return url;
}

export async function readAttachmentPreview(
  session: Session,
  mailbox: string,
  entry: AttachmentEntry,
  size: "thumbnail" | "full",
  signal: AbortSignal,
): Promise<AttachmentPreview | null> {
  const extension = /\.([a-z0-9]+)$/i.exec(entry.file.name)?.[1]?.toLowerCase() ?? "";
  const nativeMime = Object.hasOwn(previewTypes, extension) ? previewTypes[extension] : undefined;
  const snapshot = size === "thumbnail" || !nativeMime;
  const url = snapshot ? snapshotUrl(entry, size === "full", mailbox) : downloadUrl(entry, mailbox);
  const response = await session.fetch(url.href, { credentials: "include", signal });
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const limit = (size === "thumbnail" ? 1 : snapshot ? 8 : 32) * 1024 * 1024;
  if (
    !response.ok ||
    !response.body ||
    (snapshot && !rasterMime.test(mime)) ||
    mime === "text/html" ||
    Number(response.headers.get("content-length")) > limit
  ) {
    await response.body?.cancel();
    return null;
  }
  // Chunked replies do not always carry a Content-Length.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (!length) {
    return null;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (
    !snapshot &&
    nativeMime === "application/pdf" &&
    !Buffer.from(bytes.buffer, 0, Math.min(length, 1024)).includes("%PDF-")
  ) {
    return null;
  }
  return {
    mime: snapshot ? mime : nativeMime,
    bytes: bytes.buffer,
  };
}
