import { useLingui } from "@lingui/react/macro";
import Markdown from "react-markdown";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";
import changelog from "../../../../CHANGELOG.md?raw";

export function VersionHistorySettings() {
  const { t } = useLingui();
  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.versionHistory)}</SettingsTitle>
      </SettingsHeader>
      <div className="settings-surface prose dark:prose-invert max-w-none p-5 text-sm">
        <Markdown skipHtml>{changelog}</Markdown>
      </div>
    </>
  );
}
