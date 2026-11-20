import { FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@ggmail/ui/components/field";
import { Trans, useLingui } from "@lingui/react/macro";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";

export function AdvancedSettings() {
  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.advanced)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          {platform.isMacOS && (
            <FieldSet>
              <FieldLegend>
                <Trans>Screen sharing</Trans>
              </FieldLegend>
              <FieldGroup>
                <ConfigSwitchField
                  label={t({
                    message: "Use system picker",
                    comment:
                      "Setting that shares the screen through the operating system's own picker",
                  })}
                  description={t`Use the system's native screen sharing picker when sharing your screen.`}
                  configKey="screenShare.useSystemPicker"
                  restartRequired
                />
              </FieldGroup>
            </FieldSet>
          )}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Settings section for settings that fit no other">
                Miscellaneous
              </Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t`Hardware acceleration`}
                description={t`Render with the GPU. This can improve performance, and can also cause compatibility problems on some systems.`}
                configKey="app.hardwareAcceleration"
                restartRequired
              />
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
