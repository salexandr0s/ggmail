import { nativeImage, type Session } from "electron";

// Request private photos in the same signed-in partition that displayed them.
// Give the app's own windows a small, local raster image.
export async function readProfilePhoto(session: Session, url: string, signal: AbortSignal) {
  const response = await session.fetch(url, { credentials: "include", redirect: "error", signal });
  if (!response.ok || !response.body) {
    return;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > 512 * 1024) {
        return;
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const image = nativeImage.createFromBuffer(Buffer.concat(chunks));
  if (!image.isEmpty()) {
    return image.resize({ width: 72, height: 72, quality: "best" }).toDataURL();
  }
}
