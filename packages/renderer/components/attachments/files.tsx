import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import { fileKind, type AttachmentAction, type MailAttachment } from "@ggmail/shared/attachments";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { cn } from "@ggmail/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import {
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  SheetIcon,
  TextIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SenderAvatar } from "@/components/assistant/sender-avatar";
import { FilePreview, FileThumbnail } from "./preview";
import "./files.css";

export type LibraryFile = MailAttachment & { account: AccountConfig };

export const kindIcons = {
  pdf: FileTextIcon,
  document: TextIcon,
  sheet: SheetIcon,
  image: ImageIcon,
  other: FileIcon,
};

function FileMark({ name, large = false }: { name: string; large?: boolean }) {
  const kind = fileKind(name);
  const Icon = kindIcons[kind];
  const extension = /\.([a-z0-9]{1,6})$/i.exec(name)?.[1]?.toUpperCase();
  return (
    <span
      className={cn("attachment-mark", large && "attachment-mark-large")}
      data-kind={kind}
      aria-hidden="true"
    >
      <span className="attachment-paper">
        {(large || !extension) && <Icon strokeWidth={1.6} />}
        {extension && (
          <span className="attachment-extension" data-long={extension.length > 4 || undefined}>
            {extension}
          </span>
        )}
      </span>
    </span>
  );
}

function AccountName({ account }: { account: AccountConfig }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {account.color && (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            accountColorsMap[account.color].className,
          )}
        />
      )}
      <span className="truncate">{getAccountLabel(account.label)}</span>
    </span>
  );
}

function Sender({
  sender,
  photoUrl,
  showIcon,
  account,
}: {
  sender: string;
  photoUrl?: string;
  showIcon: boolean;
  account?: AccountConfig;
}) {
  const mailbox = /^(.*)<([^<>]+)>$/u.exec(sender);
  const address = (mailbox?.[2] ?? sender).trim();
  const name = mailbox?.[1]?.trim() || address;
  const domain = /^[^\s<>@]+@([\p{L}\p{N}.-]+)$/u.exec(address)?.[1];

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5" title={sender}>
      {showIcon && <SenderAvatar sender={{ name, domain, photoUrl }} className="size-5" />}
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {account && (
          <span className="mt-0.5 flex text-xs text-muted-foreground">
            <AccountName account={account} />
          </span>
        )}
      </span>
    </span>
  );
}

export function ListHeadings() {
  const { t } = useLingui();
  return (
    <div className="attachment-columns attachment-headings" aria-hidden="true">
      <span>{t`File name`}</span>
      <span className="attachment-from">{t`Sender`}</span>
      <span className="attachment-date">{t`Received`}</span>
      <span className="attachment-size">{t`Size`}</span>
    </div>
  );
}

export function FileItem({
  item,
  grid,
  showAccount,
  showSenderIcons,
  date,
}: {
  item: LibraryFile;
  grid: boolean;
  showAccount: boolean;
  showSenderIcons: boolean;
  date: Intl.DateTimeFormat;
}) {
  const { t } = useLingui();
  const filenameId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const received = date.format(item.receivedAt);
  const act = async (action: AttachmentAction) => {
    try {
      await ipc.main.invoke("attachments.act", item.account.id, item.id, action);
    } catch {
      toast.error(t`This attachment is unavailable. Refresh and try again.`);
    }
  };
  const preview = (
    <>
      <button
        ref={button}
        type="button"
        className="attachment-preview"
        title={item.name + "\n" + t`Preview attachment`}
        aria-description={t`Preview attachment`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span id={filenameId} className={grid ? "line-clamp-2 break-words" : "block truncate"}>
          {item.name}
        </span>
      </button>
      {open && (
        <FilePreview
          item={item}
          onClose={() => setOpen(false)}
          returnFocus={button}
          onDownload={() => void act("download")}
        />
      )}
    </>
  );
  const actions = (
    <div className="attachment-actions">
      <Button
        size="icon"
        variant="ghost"
        title={t`Open email`}
        aria-describedby={filenameId}
        onClick={() => void act("message")}
      >
        <MailIcon />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        title={t`Download`}
        aria-describedby={filenameId}
        onClick={() => void act("download")}
      >
        <DownloadIcon />
      </Button>
    </div>
  );
  if (grid) {
    return (
      <li className="attachment-card" data-kind={fileKind(item.name)}>
        <FileThumbnail item={item} large>
          <FileMark name={item.name} large />
        </FileThumbnail>
        <div className="flex flex-1 flex-col px-4 pt-3 pb-2">
          {preview}
          {item.subject && (
            <span className="mt-0.5 truncate text-xs text-muted-foreground" title={item.subject}>
              {item.subject}
            </span>
          )}
          <div className="mt-auto flex min-w-0 items-center gap-1.5 pt-3 text-xs">
            <Sender
              sender={item.sender}
              photoUrl={item.senderPhotoUrl}
              showIcon={showSenderIcons}
            />
            {showAccount && (
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
                <span aria-hidden="true">·</span>
                <AccountName account={item.account} />
              </span>
            )}
          </div>
        </div>
        <div className="mx-4 flex min-w-0 items-center justify-between gap-1 border-t py-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground tabular-nums">
            <time dateTime={new Date(item.receivedAt).toISOString()}>{received}</time>
            {item.size && (
              <>
                <span aria-hidden="true">·</span>
                <span>{item.size}</span>
              </>
            )}
          </div>
          {actions}
        </div>
      </li>
    );
  }
  return (
    <li className="attachment-columns attachment-row">
      <div className="flex min-w-0 items-center gap-3">
        <FileThumbnail item={item}>
          <FileMark name={item.name} />
        </FileThumbnail>
        <div className="min-w-0">
          {preview}
          {item.subject && (
            <div className="truncate text-xs/5 text-muted-foreground" title={item.subject}>
              {item.subject}
            </div>
          )}
          <div className="attachment-compact-detail text-xs text-muted-foreground">
            <Sender
              sender={item.sender}
              photoUrl={item.senderPhotoUrl}
              showIcon={showSenderIcons}
            />
            {showAccount && <AccountName account={item.account} />}
            <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
              <time dateTime={new Date(item.receivedAt).toISOString()}>{received}</time>
              {item.size && (
                <>
                  <span aria-hidden="true">·</span>
                  {item.size}
                </>
              )}
            </span>
          </div>
        </div>
      </div>
      <div className="attachment-from min-w-0 text-[13px]">
        <Sender
          sender={item.sender}
          photoUrl={item.senderPhotoUrl}
          showIcon={showSenderIcons}
          account={showAccount ? item.account : undefined}
        />
      </div>
      <div className="attachment-date text-xs text-muted-foreground tabular-nums">
        <time dateTime={new Date(item.receivedAt).toISOString()}>{received}</time>
        <span className="attachment-stacked-size">{item.size}</span>
      </div>
      <div className="attachment-size text-xs text-muted-foreground tabular-nums">{item.size}</div>
      {actions}
    </li>
  );
}
