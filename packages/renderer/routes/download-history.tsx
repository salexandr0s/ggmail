import { Button } from "@ggmail/ui/components/button";
import { Trans } from "@lingui/react/macro";
import { DownloadHistoryList } from "@/components/download-history";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
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
    <main className="overflow-hidden rounded-2xl bg-card">
      <SettingsHeader className="mb-0 flex-wrap items-center gap-3 border-b bg-toolbar px-4 py-3">
        <SettingsTitle>
          <Trans>Download history</Trans>
        </SettingsTitle>
        <DownloadHistoryClearAllButton />
      </SettingsHeader>
      <div className="px-3">
        <DownloadHistoryList />
      </div>
    </main>
  );
}
