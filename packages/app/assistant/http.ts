import { t } from "@lingui/core/macro";
import { ms } from "@ggmail/shared/ms";

export async function readJson(response: Response, limit: number): Promise<unknown> {
  if (!response.body) {
    throw new Error(t`ChatGPT returned an empty response.`);
  }

  let size = 0;
  const chunks: Uint8Array[] = [];

  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- Response decoding uses UTF-8.
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      }

      size += value.byteLength;
      if (size > limit) {
        throw new Error(t`ChatGPT returned a response that is too large.`);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function openAIRequest(url: URL, options: RequestInit = {}, timeout = ms("30 seconds")) {
  const deadline = AbortSignal.timeout(timeout);

  return fetch(url, {
    ...options,
    redirect: "error",
    cache: "no-store",
    signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
  });
}
