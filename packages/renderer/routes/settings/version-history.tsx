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
      <div className="prose dark:prose-invert text-sm">
        <Markdown skipHtml>{changelog}</Markdown>
      </div>
    </>
  );
}
