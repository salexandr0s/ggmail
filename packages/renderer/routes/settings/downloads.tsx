import { byPlatform } from "@ggmail/shared/platform";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ggmail/ui/components/field";
import { Input } from "@ggmail/ui/components/input";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";
import { ConfigSwitchField } from "@/components/config-switch-field";
import {
  SettingsContent,
  SettingsHeader,
  SettingsPanel,
  SettingsTitle,
} from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@/lib/utils";

export function DownloadsSettings() {
  const { config } = useConfig();

  const locationFieldId = useId();

  const { t } = useLingui();

  if (!config) {
    return null;
  }

  // lingui-set comment="Save As names the operating system's dialog that asks where to save a file"
  const showSaveAsDialogLabel = byPlatform(platform, {
    macOS: t({ message: "Show Save As dialog before downloading", context: "macOS" }),
    windows: t({ message: "Show Save As dialog before downloading", context: "Windows" }),
    linux: t({ message: "Show Save As dialog before downloading", context: "Linux" }),
  });
  // lingui-reset

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.downloads)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Downloads section for how files are downloaded">
              General
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={showSaveAsDialogLabel}
              description={t`Ask where to save each file before it downloads.`}
              configKey="downloads.saveAs"
              restartRequired
            />
            <ConfigSwitchField
              label={t`Open folder when done`}
              description={t`Open the folder containing the file when a download finishes.`}
              configKey="downloads.openFolderWhenDone"
            />
            <Field>
              <FieldLabel htmlFor={locationFieldId}>
                <Trans>Default download location</Trans>
              </FieldLabel>
              <FieldDescription>
                <Trans>Where downloaded files are saved.</Trans>
              </FieldDescription>
              <div className="flex gap-2">
                <Input id={locationFieldId} value={config["downloads.location"]} readOnly />
                <Button
                  variant="outline"
                  onClick={async () => {
                    const { canceled } = await ipc.main.invoke("downloads.setLocation");

                    if (!canceled) {
                      restartRequiredToast();
                    }
                  }}
                >
                  <Trans comment="Button that picks another folder for downloads">Change…</Trans>
                </Button>
              </div>
            </Field>
          </SettingsPanel>
        </FieldSet>
      </SettingsContent>
    </>
  );
}
