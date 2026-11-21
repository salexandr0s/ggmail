import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { nativeImage, net, type Session } from "electron";

// Some private avatars start at lh3.google.com and redirect to a photo CDN.
// Keep every hop in the account's partition and validate it before following.
export async function readProfilePhoto(session: Session, url: string, signal: AbortSignal) {
  if (signal.aborted || !getGoogleProfilePhotoUrl(url)) {
    return;
  }
  const request = net.request({
    url,
    session,
    credentials: "include",
    redirect: "manual",
    /* oxlint-disable lingui/no-unlocalized-strings -- HTTP origin and image formats for Google's avatar service. */
    origin: "https://mail.google.com",
    headers: { Referer: "https://mail.google.com/", Accept: "image/png, image/jpeg" },
    /* oxlint-enable lingui/no-unlocalized-strings */
  });
  const abort = () => request.abort();
  let redirects = 0;
  request.on("redirect", (_status, _method, target) => {
    if (++redirects <= 5 && getGoogleProfilePhotoUrl(target)) {
      request.followRedirect();
    } else {
      abort();
    }
  });
  signal.addEventListener("abort", abort, { once: true });
  try {
    const data = await new Promise<Buffer | undefined>((resolve, reject) => {
      request.once("error", reject);
      request.once("abort", () => resolve(undefined));
      request.once("response", (response) => {
        response.once("error", reject);
        response.once("aborted", () => resolve(undefined));
        // An Electron protocol handler can deliver the final image stream with
        // the status of the redirect we just approved.
        const redirectedImage =
          redirects > 0 && response.statusCode >= 300 && response.statusCode < 400;
        if (response.statusCode !== 200 && !redirectedImage) {
          abort();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.once("end", () => resolve(Buffer.concat(chunks)));
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 512 * 1024) {
            abort();
            return;
          }
          chunks.push(chunk);
        });
      });
      request.end();
    });
    if (data && !signal.aborted) {
      const image = nativeImage.createFromBuffer(data);
      if (!image.isEmpty()) {
        return image.resize({ width: 72, height: 72, quality: "best" }).toDataURL();
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
