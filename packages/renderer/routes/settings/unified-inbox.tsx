import { useLingui } from "@lingui/react/macro";
import { ConfigSwitchField } from "@/components/config-switch-field";
import {
  Settings,
  SettingsContent,
  SettingsHeader,
  SettingsPanel,
  SettingsTitle,
} from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function UnifiedInboxSettings() {
  const { config } = useConfig();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.unifiedInbox)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <SettingsPanel>
          <ConfigSwitchField
            label={t`Enable All Mail`}
            description={t`Show unread messages from your accounts in one place.`}
            configKey="unifiedInbox.enabled"
            restartRequired
          />
          {config["unifiedInbox.enabled"] && (
            <ConfigSwitchField
              label={t`Show sender icons`}
              description={t`Show sender icons in All Mail.`}
              configKey="unifiedInbox.showSenderIcons"
            />
          )}
        </SettingsPanel>
      </SettingsContent>
    </Settings>
  );
}
