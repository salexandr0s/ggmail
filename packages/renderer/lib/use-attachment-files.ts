import type { MailAttachment } from "@ggmail/shared/attachments";
import { ms } from "@ggmail/shared/ms";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { useEffect, useRef, useState } from "react";

type MailboxFiles = { files: MailAttachment[]; status: "loading" | "ready" | "error" };

/** Keep a slow or signed-out account from holding up results from the others. */
export function useAttachmentFiles(scope: string, refresh: number, retry: number) {
  const [mailboxes, setMailboxes] = useState<Record<string, MailboxFiles>>({});
  const [generation, setGeneration] = useState(0);
  const lastRetry = useRef(retry);
  const lastRefresh = useRef(refresh);
  useEffect(
    () => ipc.renderer.on("attachments.invalidated", () => setGeneration((n) => n + 1)),
    [],
  );
  useEffect(() => {
    const mode =
      refresh !== lastRefresh.current
        ? "refresh"
        : retry !== lastRetry.current
          ? "retry"
          : "snapshot";
    lastRetry.current = retry;
    lastRefresh.current = refresh;
    const controller = new AbortController();
    const accounts: { id: string; signedOut: boolean }[] = JSON.parse(scope);
    setMailboxes({});
    async function scan(id: string) {
      let files: MailAttachment[] = [];
      try {
        let data = await ipc.main.invoke("attachments.read", id, mode);
        while (!controller.signal.aborted) {
          files = files.concat(data.files);
          const state: MailboxFiles = {
            files,
            status: data.complete ? (data.partial ? "error" : "ready") : "loading",
          };
          setMailboxes((previous) => ({ ...previous, [id]: state }));
          if (data.complete) {
            break;
          }
          if (data.files.length) {
            await new Promise((resolve) => setTimeout(resolve, ms("500ms")));
          }
          if (controller.signal.aborted) {
            break;
          }
          data = await ipc.main.invoke("attachments.read", id, "next");
        }
      } catch {
        if (!controller.signal.aborted) {
          setMailboxes((previous) => ({ ...previous, [id]: { files, status: "error" } }));
        }
      }
    }
    for (const account of accounts) {
      if (!account.signedOut) {
        void scan(account.id);
      }
    }
    return () => controller.abort();
  }, [scope, refresh, retry, generation]);
  return mailboxes;
}
