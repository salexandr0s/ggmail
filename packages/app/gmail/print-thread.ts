/* oxlint-disable lingui/no-unlocalized-strings -- Gmail request parameters and internal fetch errors. */
import { ms } from "@ggmail/shared/ms";
import type { Session } from "electron";

export const legacyThreadId = /^[\da-f]{15,16}$/i;

// The caller supplies the validated mailbox of this session. Only the thread ID
// varies; message HTML cannot supply a URL or cause an external request.
export function fetchPrintThread(
  session: Session,
  mailbox: string,
  threadId: string,
  signal: AbortSignal,
) {
  if (!legacyThreadId.test(threadId)) {
    throw new Error("Invalid Gmail thread ID");
  }
  const url = new URL(mailbox);
  url.search = new URLSearchParams({
    ui: "2",
    view: "pt",
    search: "all",
    th: threadId,
    mb: "0",
    hl: "en",
  }).toString();
  return session.fetch(url.href, {
    credentials: "include",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(ms("20s"))]),
  });
}
