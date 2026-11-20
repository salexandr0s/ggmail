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

/** Gmail sends document snapshots separately from the attachment download. */
export function snapshotUrl(entry: AttachmentEntry, large: boolean) {
  const url = new URL(entry.thumbnailUrl ?? entry.downloadUrl);
  if (!entry.thumbnailUrl) {
    url.searchParams.set("view", fileKind(entry.file.name) === "image" ? "fimg" : "snatt");
  }
  url.searchParams.set("disp", "thd");
  url.searchParams.set("sz", large ? "w1600-h2000" : "w480-h300-p-nu");
  return url;
}

export async function readAttachmentPreview(
  session: Session,
  entry: AttachmentEntry,
  size: "thumbnail" | "full",
  signal: AbortSignal,
): Promise<AttachmentPreview | null> {
  const extension = /\.([a-z0-9]+)$/i.exec(entry.file.name)?.[1]?.toLowerCase() ?? "";
  const nativeMime = Object.hasOwn(previewTypes, extension) ? previewTypes[extension] : undefined;
  const snapshot = size === "thumbnail" || !nativeMime;
  const url = snapshot ? snapshotUrl(entry, size === "full") : new URL(entry.downloadUrl);
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
  const bytes = Buffer.concat(chunks, length);
  if (!snapshot && nativeMime === "application/pdf" && !bytes.subarray(0, 1024).includes("%PDF-")) {
    return null;
  }
  return {
    mime: snapshot ? mime : nativeMime,
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + length),
  };
}
