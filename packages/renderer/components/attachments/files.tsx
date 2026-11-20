import { useLingui } from "@lingui/react/macro";
import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import { fileKind, type AttachmentAction, type MailAttachment } from "@ggmail/shared/attachments";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { cn } from "@ggmail/ui/lib/utils";
import {
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  SheetIcon,
  TextIcon,
} from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
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
  date,
}: {
  item: LibraryFile;
  grid: boolean;
  showAccount: boolean;
  date: Intl.DateTimeFormat;
}) {
  const { t } = useLingui();
  const filenameId = useId();
  const sender = item.sender.split("<")[0]?.trim() || item.sender;
  const received = date.format(item.receivedAt);
  const act = async (action: AttachmentAction) => {
    try {
      await ipc.main.invoke("attachments.act", item.account.id, item.id, action);
    } catch {
      toast.error(t`This attachment is unavailable. Refresh and try again.`);
    }
  };
  const preview = (
    <button
      type="button"
      className="attachment-preview"
      title={item.name + "\n" + t`Preview in Gmail`}
      aria-description={t`Preview in Gmail`}
      onClick={() => void act("preview")}
    >
      <span id={filenameId} className={grid ? "line-clamp-2 break-words" : "block truncate"}>
        {item.name}
      </span>
    </button>
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
        <div className="attachment-cover" aria-hidden="true">
          <FileMark name={item.name} large />
        </div>
        <div className="flex flex-1 flex-col px-4 pt-3 pb-2">
          {preview}
          {item.subject && (
            <span className="mt-0.5 truncate text-xs text-muted-foreground" title={item.subject}>
              {item.subject}
            </span>
          )}
          <div
            className="mt-auto flex min-w-0 items-center gap-1.5 pt-3 text-xs"
            title={item.sender}
          >
            <span className="truncate">{sender}</span>
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
        <FileMark name={item.name} />
        <div className="min-w-0">
          {preview}
          {item.subject && (
            <div className="truncate text-xs/5 text-muted-foreground" title={item.subject}>
              {item.subject}
            </div>
          )}
          <div
            className="attachment-compact-detail text-xs text-muted-foreground"
            title={item.sender}
          >
            <span className="truncate">{sender}</span>
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
      <div className="attachment-from min-w-0">
        <div className="truncate text-[13px]" title={item.sender}>
          {sender}
        </div>
        {showAccount && (
          <div className="mt-0.5 flex min-w-0 text-xs text-muted-foreground">
            <AccountName account={item.account} />
          </div>
        )}
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
