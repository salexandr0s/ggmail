import { verificationCodeCopyModes } from "@ggmail/shared/verification-codes";
import { FieldGroup } from "@ggmail/ui/components/field";
import { useLingui } from "@lingui/react/macro";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function VerificationCodesSettings() {
  const { config } = useConfig();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.verificationCodes)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <ConfigSwitchField
            label={t`Copy codes to clipboard`}
            description={t`Detect a verification code in an incoming email and copy it to your clipboard.`}
            configKey="verificationCodes.autoCopy"
          />
          <ConfigSelectField
            label={t`When to copy`}
            description={t({
              message:
                "A notification shows the code either way. Press its Copy button to copy the code yourself.",
              comment:
                "Copy names the button on the verification code notification, so it matches that button's label",
            })}
            configKey="verificationCodes.copyMode"
            items={Object.entries(verificationCodeCopyModes).map(([value, label]) => ({
              value,
              label: t(label),
            }))}
            disabled={!config["verificationCodes.autoCopy"]}
          />
          <ConfigSwitchField
            label={t`Mark email as read after copying`}
            description={t`Mark the email as read once its verification code has been copied.`}
            configKey="verificationCodes.autoMarkAsRead"
          />
          <ConfigSwitchField
            label={t({
              message: "Move email to Trash after copying",
              comment: "Trash is Gmail's folder of that name, so it follows Gmail's word for it",
            })}
            description={t({
              message:
                "Move the email to Trash once its verification code has been copied. Detection can misfire, and a real email can be moved too — Mark email as read is the safer choice.",
              comment:
                "Trash is Gmail's folder of that name; Mark email as read names the setting above this one, Mark email as read after copying",
            })}
            configKey="verificationCodes.autoDelete"
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
