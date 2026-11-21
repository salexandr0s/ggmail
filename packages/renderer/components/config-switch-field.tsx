import type { Config } from "@ggmail/shared/types";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@ggmail/ui/components/field";
import { Switch } from "@ggmail/ui/components/switch";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { type FieldMaturity, MaturityFieldBadge } from "./maturity-field-badge";

export function ConfigSwitchField({
  configKey,
  label,
  description,
  maturity,
  disabled,
  restartRequired,
}: {
  configKey: keyof Config;
  label: string;
  description: string;
  maturity?: FieldMaturity;
  disabled?: boolean;
  restartRequired?: boolean;
}) {
  const { config } = useConfig();

  const configMutation = useConfigMutation({
    onSuccess: () => {
      if (restartRequired) {
        restartRequiredToast();
      }
    },
  });

  if (!config) {
    return;
  }

  const checked = config[configKey];

  if (typeof checked !== "boolean") {
    throw new Error(`ConfigSwitchField: Config key "${configKey}" is not a boolean`);
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel
          id={`${configKey}-label`}
          htmlFor={configKey}
          className="flex items-center gap-2"
        >
          {label}
          {maturity && <MaturityFieldBadge maturity={maturity} />}
        </FieldLabel>
        <FieldDescription id={`${configKey}-description`}>{description}</FieldDescription>
      </FieldContent>
      <Switch
        id={configKey}
        aria-labelledby={`${configKey}-label`}
        aria-describedby={`${configKey}-description`}
        checked={disabled ? false : checked}
        disabled={disabled}
        onCheckedChange={(checked) => {
          configMutation.mutate({
            [configKey]: checked,
          });
        }}
      />
    </Field>
  );
}
