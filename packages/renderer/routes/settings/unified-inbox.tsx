import { FieldGroup } from "@ggmail/ui/components/field";
import { useLingui } from "@lingui/react/macro";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
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
        <FieldGroup>
          <ConfigSwitchField
            label={t`Enable unified inbox`}
            description={t`Show all unread messages from every account in a single unified inbox.`}
            configKey="unifiedInbox.enabled"
            restartRequired
          />
          {config["unifiedInbox.enabled"] && (
            <ConfigSwitchField
              label={t`Show sender icons`}
              description={t`Show sender icons next to the senders in the unified inbox.`}
              configKey="unifiedInbox.showSenderIcons"
            />
          )}
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
