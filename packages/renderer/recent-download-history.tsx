import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@ggmail/shared/constants";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon } from "lucide-react";
import { DownloadHistoryList } from "@/components/download-history";
import { Popup } from "@/components/popup";
import { renderApp } from "@/lib/react";

function RecentDownloadHistoryPopup() {
  return (
    <Popup
      title={<Trans>Recent download history</Trans>}
      onClose={() => ipc.main.send("downloads.closeRecentDownloadHistoryPopup")}
    >
      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-2">
        <div className="flex h-full flex-col">
          <DownloadHistoryList limit={MAX_RECENT_DOWNLOAD_HISTORY_ITEMS} />
        </div>
      </ScrollArea>
      <div className="flex shrink-0 justify-end border-t px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            ipc.main.send("downloads.openDownloadHistory");
          }}
        >
          <Trans>Full download history</Trans>
          <ArrowRightIcon aria-hidden="true" className="rtl:rotate-180" />
        </Button>
      </div>
    </Popup>
  );
}

renderApp(RecentDownloadHistoryPopup);
