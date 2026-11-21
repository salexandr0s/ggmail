import { ipc } from "@ggmail/shared/renderer/ipc";
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
import { DownloadIcon, FolderIcon, XIcon } from "lucide-react";
import { DateFromNow } from "@/components/date-from-now";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function DownloadHistoryList({ limit }: { limit?: number }) {
  const { t } = useLingui();

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

  return (
    <ul className="divide-y divide-border">
      {(limit ? downloadHistory.slice(0, limit) : downloadHistory).map(
        ({ id, fileName, createdAt, filePath, exists }) => (
          <Item
            render={<li />}
            key={id}
            className={cn(
              "relative flex-nowrap rounded-none border-0 px-1.5",
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
                <span
                  className="truncate text-sm text-muted-foreground line-through"
                  title={fileName}
                >
                  {fileName}
                </span>
              )}
              <ItemDescription className="text-xs first-letter:capitalize">
                {exists ? (
                  <DateFromNow timestamp={createdAt} />
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
                    comment:
                      "Button in the download history that shows the file in the file manager",
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
                onClick={() => {
                  configMutation.mutate({
                    "downloads.history": downloadHistory.filter((item) => item.id !== id),
                  });
                }}
              >
                <XIcon />
              </Button>
            </ItemActions>
          </Item>
        ),
      )}
    </ul>
  );
}
