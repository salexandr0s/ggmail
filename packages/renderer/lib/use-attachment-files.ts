import type {
  AttachmentBatch,
  AttachmentCategory,
  MailAttachment,
} from "@ggmail/shared/attachments";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { useCallback, useEffect, useRef, useState } from "react";
import { indexAttachment } from "./attachment-filters";

type IndexedFile = ReturnType<
  typeof indexAttachment<MailAttachment & { accountId: string; mailboxKey: string }>
>;
type MailboxFiles = {
  mailboxKey: string;
  files: IndexedFile[];
  status: AttachmentBatch["status"];
};

type MailboxIndex = Omit<MailboxFiles, "files"> & { files: Map<string, IndexedFile> };

/** Keep a slow or signed-out account from holding up results from the others. */
export function useAttachmentFiles(scope: string, refresh: number) {
  const [mailboxes, setMailboxes] = useState<Record<string, MailboxFiles>>({});
  const [indexes] = useState(() => new Map<string, MailboxIndex>());
  const publish = useCallback((id: string, index: MailboxIndex) => {
    const snapshot = { ...index, files: Array.from(index.files.values()) };
    setMailboxes((previous) => ({ ...previous, [id]: snapshot }));
  }, []);
  const retryScans = useRef<(ids: string[]) => void>(() => {});
  const lastRefresh = useRef(refresh);
  useEffect(() => {
    const mode = refresh === lastRefresh.current ? "snapshot" : "refresh";
    lastRefresh.current = refresh;
    const accounts: { id: string; signedOut: boolean }[] = JSON.parse(scope);
    if (mode === "snapshot") {
      indexes.clear();
      setMailboxes({});
    }
    const scanning = new Map<string, AbortController>();
    async function scan(id: string, initial: "snapshot" | "refresh" | "retry") {
      if (scanning.has(id)) {
        return;
      }
      const controller = new AbortController();
      scanning.set(id, controller);
      let index = indexes.get(id);
      let timer: ReturnType<typeof setTimeout> | undefined;
      function flush() {
        clearTimeout(timer);
        timer = undefined;
        if (index && !controller.signal.aborted) {
          publish(id, index);
        }
      }
      if (initial === "retry" && index) {
        index.status = "loading";
        flush();
      }
      try {
        let data = await ipc.main.invoke("attachments.read", id, initial);
        let snapshot = true;
        while (!controller.signal.aborted) {
          const replace = snapshot || index?.mailboxKey !== data.mailboxKey;
          snapshot = false;
          if (replace || !index) {
            index = { mailboxKey: data.mailboxKey, status: data.status, files: new Map() };
            indexes.set(id, index);
          }
          const hadFiles = index.files.size > 0;
          const changed = replace || data.files.length || data.removedIds?.length || index.status !== data.status;
          for (const fileId of data.removedIds ?? []) {
            index.files.delete(fileId);
          }
          for (const file of data.files) {
            index.files.set(file.id, indexAttachment({ ...file, accountId: id, mailboxKey: data.mailboxKey }));
          }
          index.status = data.status;
          if (changed) {
            // Paint the cache, the first files and the final status immediately. During a
            // fast scan, combine intermediate changes without delaying the next Gmail read.
            if (replace || !hadFiles || data.status !== "loading") {
              flush();
            } else {
              timer ??= setTimeout(flush, 100);
            }
          }
          if (data.status !== "loading") {
            break;
          }
          data = await ipc.main.invoke("attachments.read", id, "next");
        }
      } catch {
        if (!controller.signal.aborted) {
          index ??= { mailboxKey: "", status: "incomplete", files: new Map() };
          index.status = "incomplete";
          indexes.set(id, index);
          flush();
        }
      } finally {
        clearTimeout(timer);
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
      indexes.delete(id);
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
  }, [scope, refresh, indexes, publish]);
  async function setCategory(
    accountId: string,
    mailboxKey: string,
    id: string,
    category: AttachmentCategory[] | null,
  ) {
    await ipc.main.invoke("attachments.setCategory", accountId, mailboxKey, id, category);
    const index = indexes.get(accountId);
    const entry = index?.files.get(id);
    if (index?.mailboxKey === mailboxKey && entry) {
      const file = { ...entry.file, categoryOverride: category ?? undefined };
      index.files.set(id, { ...entry, file, categories: category ?? file.detectedCategories });
      publish(accountId, index);
    }
  }
  return { mailboxes, setCategory, retry: (ids: string[]) => retryScans.current(ids) };
}
