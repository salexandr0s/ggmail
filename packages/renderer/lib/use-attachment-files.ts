import type {
  AttachmentBatch,
  AttachmentCategory,
  MailAttachment,
} from "@ggmail/shared/attachments";
import { ms } from "@ggmail/shared/ms";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { useEffect, useRef, useState } from "react";

type MailboxFiles = {
  mailboxKey: string;
  files: MailAttachment[];
  status: AttachmentBatch["status"];
};

/** Keep a slow or signed-out account from holding up results from the others. */
export function useAttachmentFiles(scope: string, refresh: number) {
  const [mailboxes, setMailboxes] = useState<Record<string, MailboxFiles>>({});
  const retryScans = useRef<(ids: string[]) => void>(() => {});
  const lastRefresh = useRef(refresh);
  useEffect(() => {
    const mode = refresh === lastRefresh.current ? "snapshot" : "refresh";
    lastRefresh.current = refresh;
    const accounts: { id: string; signedOut: boolean }[] = JSON.parse(scope);
    if (mode === "snapshot") {
      setMailboxes({});
    }
    const scanning = new Map<string, AbortController>();
    async function scan(id: string, initial: "snapshot" | "refresh" | "retry") {
      if (scanning.has(id)) {
        return;
      }
      const controller = new AbortController();
      scanning.set(id, controller);
      if (initial === "retry") {
        setMailboxes((previous) => {
          const current = previous[id];
          return current ? { ...previous, [id]: { ...current, status: "loading" } } : previous;
        });
      }
      try {
        let data = await ipc.main.invoke("attachments.read", id, initial);
        let snapshot = true;
        while (!controller.signal.aborted) {
          const batch = data;
          const replace = snapshot;
          snapshot = false;
          setMailboxes((previous) => {
            const current = previous[id];
            const append = !replace && current?.mailboxKey === batch.mailboxKey;
            let files = batch.files;
            if (append) {
              const replaced = new Set([
                ...batch.files.map((file) => file.id),
                ...(batch.removedIds ?? []),
              ]);
              files = replaced.size
                ? current.files.filter((file) => !replaced.has(file.id)).concat(batch.files)
                : current.files;
            }
            return {
              ...previous,
              [id]: {
                mailboxKey: batch.mailboxKey,
                files,
                status: batch.status,
              },
            };
          });
          if (data.status !== "loading") {
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
          setMailboxes((previous) => ({
            ...previous,
            [id]: { mailboxKey: "", files: [], ...previous[id], status: "incomplete" },
          }));
        }
      } finally {
        if (scanning.get(id) === controller) {
          scanning.delete(id);
        }
      }
    }
    retryScans.current = (ids) => {
      for (const { id, signedOut } of accounts) {
        if (!signedOut && ids.includes(id)) {
          void scan(id, "retry");
        }
      }
    };
    for (const account of accounts) {
      if (!account.signedOut) {
        void scan(account.id, mode);
      }
    }
    const unsubscribe = ipc.renderer.on("gmail.mailboxChanged", (_event, id) => {
      scanning.get(id)?.abort();
      scanning.delete(id);
      setMailboxes((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      if (accounts.some((account) => account.id === id && !account.signedOut)) {
        void scan(id, "snapshot");
      }
    });
    return () => {
      unsubscribe();
      for (const controller of scanning.values()) {
        controller.abort();
      }
    };
  }, [scope, refresh]);
  async function setCategory(
    accountId: string,
    mailboxKey: string,
    id: string,
    category: AttachmentCategory[] | null,
  ) {
    await ipc.main.invoke("attachments.setCategory", accountId, mailboxKey, id, category);
    setMailboxes((previous) => {
      const current = previous[accountId];
      if (current?.mailboxKey !== mailboxKey) {
        return previous;
      }
      const files = current.files.map((file) =>
        file.id === id ? { ...file, categoryOverride: category ?? undefined } : file,
      );
      return { ...previous, [accountId]: { ...current, files } };
    });
  }
  return { mailboxes, setCategory, retry: (ids: string[]) => retryScans.current(ids) };
}
