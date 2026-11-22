import { ipc } from "@ggmail/shared/renderer/ipc";
import type { DownloadItem } from "@ggmail/shared/types";
import { Button } from "@ggmail/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@ggmail/ui/components/empty";
import { Item, ItemActions, ItemContent, ItemDescription } from "@ggmail/ui/components/item";
import { cn } from "@ggmail/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { DownloadIcon, FileIcon, FolderIcon, XIcon } from "lucide-react";
import { DateFromNow } from "@/components/date-from-now";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function DownloadHistoryList({ limit }: { limit?: number }) {
  const { i18n } = useLingui();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const downloadHistory = config["downloads.history"];

  if (downloadHistory.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <DownloadIcon />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>No downloads yet</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>Files you download appear here for 30 days.</Trans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const remove = (id: DownloadItem["id"]) => {
    configMutation.mutate({
      "downloads.history": downloadHistory.filter((item) => item.id !== id),
    });
  };
  const rows = (items: DownloadItem[], clock?: Intl.DateTimeFormat) => (
    <ul>
      {items.map((item) => (
        <DownloadRow
          key={item.id}
          item={item}
          onRemove={remove}
          time={clock?.format(item.createdAt * 1000)}
        />
      ))}
    </ul>
  );

  if (limit) {
    return rows(downloadHistory.slice(0, limit));
  }
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "full" });
  const clock = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short" });
  const days = new Map<string, DownloadItem[]>();
  for (const item of downloadHistory) {
    const day = date.format(item.createdAt * 1000);
    const group = days.get(day);
    if (group) {
      group.push(item);
    } else {
      days.set(day, [item]);
    }
  }
  return (
    <div className="download-days">
      {Array.from(days, ([day, items]) => (
        <section key={day}>
          <h2>{day}</h2>
          {rows(items, clock)}
        </section>
      ))}
    </div>
  );
}

function DownloadRow({
  item,
  onRemove,
  time,
}: {
  item: DownloadItem;
  onRemove: (id: DownloadItem["id"]) => void;
  time?: string;
}) {
  const { t } = useLingui();
  const { id, fileName, createdAt, filePath, exists } = item;
  return (
    <Item
      render={<li />}
      className={cn(
        "relative flex-nowrap gap-3 rounded-xl border-0 px-3 py-2.5",
        exists && "focus-within:bg-muted/60 hover:bg-muted/60",
      )}
      onDragStart={
        exists
          ? (event) => {
              event.preventDefault();

              ipc.main.send("downloads.dragFile", { id, filePath });
            }
          : undefined
      }
      draggable={exists}
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"
      >
        <FileIcon className="size-4" />
      </span>
      <ItemContent className="overflow-hidden">
        {exists ? (
          <button
            type="button"
            title={fileName}
            className="block w-full truncate rounded-sm text-start text-sm font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            onClick={() => ipc.main.send("downloads.openFile", { id, filePath })}
          >
            {fileName}
          </button>
        ) : (
          <span className="truncate text-sm text-muted-foreground line-through" title={fileName}>
            {fileName}
          </span>
        )}
        <ItemDescription className="text-xs first-letter:capitalize">
          {exists ? (
            <time dateTime={new Date(createdAt * 1000).toISOString()}>
              {time ?? <DateFromNow timestamp={createdAt} />}
            </time>
          ) : (
            <Trans comment="In the download history, in place of when a file was downloaded, once the file is no longer where it was saved">
              File moved or deleted
            </Trans>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="relative shrink-0 gap-0.5">
        {exists && (
          <Button
            size="icon-sm"
            variant="ghost"
            title={t({
              message: "Show in folder",
              comment: "Button in the download history that shows the file in the file manager",
            })}
            onClick={() => {
              ipc.main.send("downloads.showFileInFolder", { id, filePath });
            }}
          >
            <FolderIcon />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          title={t({
            message: "Remove from history",
            comment: "Button that removes a download from the download history",
          })}
          onClick={() => onRemove(id)}
        >
          <XIcon />
        </Button>
      </ItemActions>
    </Item>
  );
}
