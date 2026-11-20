/* oxlint-disable lingui/no-unlocalized-strings -- Personal build notices are intentionally in English. */
// Modified 2026-11-19: custom source builds are updated manually.
import { GITHUB_REPO_URL } from "@ggmail/shared/constants";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

export function UpdatesSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Updates — local source build</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <div className="space-y-3 text-sm">
          <p>Automatic app updates are disabled to preserve this local build.</p>
          <p>Rebuild ggmail from the repository to update this installation.</p>
          <a
            href={`${GITHUB_REPO_URL}/releases`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            View ggmail releases
          </a>
        </div>
      </SettingsContent>
    </Settings>
  );
}
