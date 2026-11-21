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
      <article className="settings-surface settings-history prose dark:prose-invert max-w-none text-sm">
        <Markdown
          skipHtml
          components={{
            h1: ({ children }) => <h2 className="settings-history-label">{children}</h2>,
          }}
        >
          {changelog}
        </Markdown>
      </article>
    </>
  );
}
