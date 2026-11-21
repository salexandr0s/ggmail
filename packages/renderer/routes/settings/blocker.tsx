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

export function BlockerSettings() {
  const { config } = useConfig();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.blocker)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <SettingsPanel>
          <ConfigSwitchField
            label={t`Enable blocker`}
            description={t`Block unwanted content and network requests.`}
            configKey="blocker.enabled"
            restartRequired
          />

          <ConfigSwitchField
            label={t`Block ads`}
            description={t`Block advertisements on the pages you open.`}
            configKey="blocker.ads"
            disabled={!config["blocker.enabled"]}
            restartRequired
          />
          <ConfigSwitchField
            label={t`Block trackers`}
            description={t`Block the scripts that follow you from site to site.`}
            configKey="blocker.tracking"
            disabled={!config["blocker.enabled"]}
            restartRequired
          />
        </SettingsPanel>
      </SettingsContent>
    </Settings>
  );
}
