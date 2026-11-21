import { GITHUB_REPO_URL } from "@ggmail/shared/constants";
/* oxlint-disable lingui/no-unlocalized-strings -- Personal build notices are intentionally in English. */
// Modified 2026-11-19: custom source builds are updated manually.
import { useLingui } from "@lingui/react/macro";
import { ArrowUpRight } from "lucide-react";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";

export function UpdatesSettings() {
  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.updates)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <div className="settings-surface settings-build-info text-sm">
          <h2>Local source build</h2>
          <p>Automatic app updates are disabled to preserve this local build.</p>
          <p>Rebuild ggmail from the repository to update this installation.</p>
          <a href={`${GITHUB_REPO_URL}/releases`} target="_blank" rel="noreferrer">
            View ggmail releases
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </SettingsContent>
    </Settings>
  );
}
