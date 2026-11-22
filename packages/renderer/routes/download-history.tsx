import { Button } from "@ggmail/ui/components/button";
import { Trans } from "@lingui/react/macro";
import { DownloadIcon } from "lucide-react";
import { DownloadHistoryList } from "@/components/download-history";
import { MailPageTitle } from "@/components/mail-page";
import { useConfig, useConfigMutation } from "@/lib/react-query";

function DownloadHistoryClearAllButton() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  return (
    <Button
      variant="outline"
      onClick={() => {
        configMutation.mutate({
          "downloads.history": [],
        });
      }}
      disabled={config["downloads.history"].length === 0}
    >
      <Trans comment="Button that clears the whole download history">Clear all</Trans>
    </Button>
  );
}

export function DownloadHistory() {
  return (
    <main>
      <header className="mail-page-header">
        <MailPageTitle icon={<DownloadIcon aria-hidden="true" />}>
          <Trans>Download history</Trans>
        </MailPageTitle>
        <DownloadHistoryClearAllButton />
      </header>
      <div className="download-list">
        <DownloadHistoryList />
      </div>
    </main>
  );
}
