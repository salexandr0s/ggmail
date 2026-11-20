import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@ggmail/ui/components/dialog";
import { useLingui } from "@lingui/react/macro";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { LibraryFile } from "./files";

function usePreview(account: string, id: string, size: "full" | "thumbnail", enabled: boolean) {
  const [preview, setPreview] = useState<{ mime: string; url: string; text?: string } | null>();
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    let url: string | undefined;
    ipc.main
      .invoke("attachments.preview", account, id, size)
      .then((file) => {
        if (!active) {
          return;
        }
        if (!file) {
          setPreview(null);
          return;
        }
        if (file.mime === "text/plain") {
          setPreview({ mime: file.mime, url: "", text: new TextDecoder().decode(file.bytes) });
        } else {
          url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
          setPreview({ mime: file.mime, url });
        }
      })
      .catch(() => {
        if (active) {
          setPreview(null);
        }
      });
    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [account, id, size, enabled]);
  return preview;
}

export function FileThumbnail({
  item,
  large,
  children,
}: {
  item: LibraryFile;
  large?: boolean;
  children: ReactNode;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (element.current) {
      observer.observe(element.current);
    }
    return () => observer.disconnect();
  }, []);
  const preview = usePreview(item.account.id, item.id, "thumbnail", visible);
  return (
    <span
      ref={element}
      aria-hidden="true"
      className={large ? "attachment-cover" : "attachment-miniature"}
    >
      {preview && !failed ? (
        <img src={preview.url} alt="" onError={() => setFailed(true)} />
      ) : (
        children
      )}
    </span>
  );
}

export function FilePreview({
  item,
  onClose,
  onDownload,
  returnFocus,
}: {
  item: LibraryFile;
  onClose: () => void;
  onDownload: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useLingui();
  const file = usePreview(item.account.id, item.id, "full", true);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        closeLabel={t`Close`}
        finalFocus={returnFocus}
        className="flex max-h-[90vh] w-[min(64rem,94vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b ps-4 pe-12">
          <DialogTitle className="min-w-0 flex-1 truncate" title={item.name}>
            {item.name}
          </DialogTitle>
          <Button size="icon-sm" variant="ghost" aria-label={t`Download`} onClick={onDownload}>
            <DownloadIcon />
          </Button>
        </header>
        <div className="flex h-[min(75vh,52rem)] min-h-0 items-center justify-center bg-muted/40">
          {file === undefined ? (
            <Loader2Icon
              role="status"
              aria-label={t`Loading`}
              className="size-6 motion-safe:animate-spin"
            />
          ) : !file || failed ? (
            <p role="status" className="text-muted-foreground">{t`No preview available`}</p>
          ) : file.mime === "application/pdf" ? (
            <embed
              src={file.url + "#navpanes=0"}
              type="application/pdf"
              title={item.name}
              className="size-full"
            />
          ) : file.text !== undefined ? (
            <pre className="size-full overflow-auto p-5 text-start whitespace-pre-wrap">
              {file.text}
            </pre>
          ) : file.mime.startsWith("video/") ? (
            <video
              controls
              src={file.url}
              aria-label={item.name}
              className="max-h-full max-w-full"
              onError={() => setFailed(true)}
            />
          ) : file.mime.startsWith("audio/") ? (
            <audio controls src={file.url} aria-label={item.name} onError={() => setFailed(true)} />
          ) : (
            <img
              src={file.url}
              alt={item.name}
              className="max-h-full max-w-full object-contain"
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
