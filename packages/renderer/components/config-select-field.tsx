import type { Config } from "@ggmail/shared/types";
import { Button } from "@ggmail/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ggmail/ui/components/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@ggmail/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { Trans } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { SettingsDialogContent } from "./settings-dialog-content";

export function ConfigSelectField({
  configKey,
  label,
  description,
  items,
  disabled,
  restartRequired,
  confirmation,
}: {
  configKey: keyof Config;
  label: string;
  description: ReactNode;
  items: { value: string; label: string }[];
  disabled?: boolean;
  restartRequired?: boolean;
  /**
   * Holds the value back until the user confirms it. The field keeps rendering
   * the value from config while the dialog is open, so cancelling needs no
   * reverting — nothing was written.
   */
  confirmation?: {
    when: (value: string) => boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
  };
}) {
  const { config } = useConfig();

  const configMutation = useConfigMutation({
    onSuccess: () => {
      if (restartRequired) {
        restartRequiredToast();
      }
    },
  });

  const [confirmableValue, setConfirmableValue] = useState<string | null>(null);

  if (!config) {
    return;
  }

  const value = config[configKey];

  if (typeof value !== "string") {
    throw new Error(`ConfigSelectField: Config key "${configKey}" is not a string`);
  }

  const setValue = (newValue: string) => {
    configMutation.mutate({
      [configKey]: newValue,
    });
  };

  return (
    <Field className="settings-choice-row">
      <FieldContent>
        <FieldLabel htmlFor={configKey} className="flex items-center gap-2">
          {label}
        </FieldLabel>
        <FieldDescription id={`${configKey}-description`}>{description}</FieldDescription>
      </FieldContent>
      <Select
        items={items}
        value={value}
        onValueChange={(newValue) => {
          if (!newValue) {
            return;
          }

          if (confirmation?.when(newValue)) {
            setConfirmableValue(newValue);

            return;
          }

          setValue(newValue);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={configKey} aria-describedby={`${configKey}-description`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {confirmation && (
        <Dialog
          open={confirmableValue !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setConfirmableValue(null);
            }
          }}
        >
          <SettingsDialogContent>
            <DialogHeader>
              <DialogTitle>{confirmation.title}</DialogTitle>
            </DialogHeader>
            <DialogDescription>{confirmation.description}</DialogDescription>
            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="outline">
                    <Trans comment="Button in a dialog asking to confirm a setting change, which leaves the setting as it was">
                      Cancel
                    </Trans>
                  </Button>
                }
              />
              <Button
                onClick={() => {
                  if (confirmableValue) {
                    setValue(confirmableValue);
                  }

                  setConfirmableValue(null);
                }}
              >
                {confirmation.confirmLabel}
              </Button>
            </DialogFooter>
          </SettingsDialogContent>
        </Dialog>
      )}
    </Field>
  );
}
