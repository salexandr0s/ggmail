import { fileKind } from "@ggmail/shared/attachments";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@ggmail/ui/components/dialog";
import { useLingui } from "@lingui/react/macro";
import { DownloadIcon, Loader2Icon, MailIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { FileMark } from "./file-mark";
import type { LibraryFile } from "./files";

function useFilePreview(account: string, mailboxKey: string, id: string) {
  const [preview, setPreview] = useState<{ mime: string; url: string; text?: string } | null>();
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    ipc.main
      .invoke("attachments.preview", account, mailboxKey, id, "full")
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
  }, [account, mailboxKey, id]);
  return preview;
}

const lookAhead = 240;
function thumbnailObserver(root: Element, margin: number) {
  const callbacks = new WeakMap<Element, () => void>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          callbacks.get(entry.target)?.();
          callbacks.delete(entry.target);
        }
      }
    },
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- CSS length for IntersectionObserver.
    { root, rootMargin: margin + "px 0px" },
  );
  return (element: Element, load: () => void) => {
    callbacks.set(element, load);
    observer.observe(element);
    return () => {
      observer.unobserve(element);
      callbacks.delete(element);
    };
  };
}

const viewports = new WeakMap<
  Element,
  {
    near: ReturnType<typeof thumbnailObserver>;
    visible: ReturnType<typeof thumbnailObserver>;
  }
>();

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
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const accountId = item.account.id;
  const { id, mailboxKey } = item;
  useLayoutEffect(() => {
    const node = element.current;
    const root = node?.closest("[data-attachment-viewport]");
    if (!node || !root) {
      return;
    }
    let observers = viewports.get(root);
    if (!observers) {
      observers = { near: thumbnailObserver(root, lookAhead), visible: thumbnailObserver(root, 0) };
      viewports.set(root, observers);
    }
    let active = true;
    let objectUrl: string | undefined;
    let coverRequested = false;
    const load = (size: "thumbnail" | "cover") => {
      if (objectUrl || coverRequested) {
        return;
      }
      coverRequested = size === "cover";
      void ipc.main
        .invoke("attachments.preview", accountId, mailboxKey, id, size)
        .then((file) => {
          if (active && file && !objectUrl) {
            objectUrl = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
            setUrl(objectUrl);
          }
        })
        .catch(() => {});
    };
    const bounds = node.getBoundingClientRect();
    const viewport = root.getBoundingClientRect();
    const gap = Math.max(viewport.top - bounds.bottom, bounds.top - viewport.bottom);
    const cleanup: (() => void)[] = [];
    if (gap <= 0) {
      load(large ? "cover" : "thumbnail");
    } else {
      if (gap <= lookAhead) {
        load("thumbnail");
      } else {
        cleanup.push(observers.near(node, () => load("thumbnail")));
      }
      if (large) {
        cleanup.push(observers.visible(node, () => load("cover")));
      }
    }
    return () => {
      active = false;
      for (const stop of cleanup) {
        stop();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accountId, mailboxKey, id, large]);
  return (
    <span
      ref={element}
      aria-hidden="true"
      className={large ? "attachment-cover" : "attachment-miniature"}
      data-file-kind={fileKind(item.name)}
    >
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : children}
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
  const file = useFilePreview(item.account.id, item.mailboxKey, item.id);
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
