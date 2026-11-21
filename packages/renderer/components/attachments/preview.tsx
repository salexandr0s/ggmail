import { fileKind } from "@ggmail/shared/attachments";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@ggmail/ui/components/dialog";
import { useLingui } from "@lingui/react/macro";
import { DownloadIcon, Loader2Icon, MailIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { FileMark } from "./file-mark";
import type { LibraryFile } from "./files";

function usePreview(
  account: string,
  mailboxKey: string,
  id: string,
  size: "full" | "thumbnail",
  enabled: boolean,
) {
  const [preview, setPreview] = useState<{ mime: string; url: string; text?: string } | null>();
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    let url: string | undefined;
    ipc.main
      .invoke("attachments.preview", account, mailboxKey, id, size)
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
  }, [account, mailboxKey, id, size, enabled]);
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
  const preview = usePreview(item.account.id, item.mailboxKey, item.id, "thumbnail", visible);
  return (
    <span
      ref={element}
      aria-hidden="true"
      className={large ? "attachment-cover" : "attachment-miniature"}
      data-file-kind={fileKind(item.name)}
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
  onOpenEmail,
  received,
  returnFocus,
}: {
  item: LibraryFile;
  onClose: () => void;
  onDownload: () => void;
  onOpenEmail: () => void;
  received: string;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useLingui();
  const file = usePreview(item.account.id, item.mailboxKey, item.id, "full", true);
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
        className="attachment-preview-dialog flex max-h-[90vh] w-[min(64rem,94vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <header className="attachment-preview-header">
          <FileMark name={item.name} />
          <div className="min-w-0">
            <DialogTitle className="truncate leading-snug" title={item.name}>
              {item.name}
            </DialogTitle>
            {item.subject && (
              <div className="attachment-subject" title={item.subject}>
                {item.subject}
              </div>
            )}
          </div>
        </header>
        <div className="attachment-preview-stage" data-unavailable={file === null || failed}>
          {file === undefined ? (
            <Loader2Icon
              role="status"
              aria-label={t`Loading`}
              className="size-6 motion-safe:animate-spin"
            />
          ) : !file || failed ? (
            <div
              role="status"
              className="flex flex-col items-center gap-4 text-sm text-muted-foreground"
            >
              <FileMark name={item.name} large />
              {t`No preview available`}
            </div>
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
        <footer className="attachment-preview-footer">
          <div className="min-w-0 text-xs">
            <div className="truncate font-medium" title={item.sender}>
              {item.sender}
            </div>
            <div className="mt-1 text-muted-foreground">
              <time dateTime={new Date(item.receivedAt).toISOString()}>{received}</time>
              {item.size && ` · ${item.size}`}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              aria-label={t`Open email`}
              title={t`Open email`}
              onClick={onOpenEmail}
            >
              <MailIcon />
              <span className="hidden sm:inline">{t`Open email`}</span>
            </Button>
            <Button size="sm" aria-label={t`Download`} onClick={onDownload}>
              <DownloadIcon />
              {t`Download`}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
