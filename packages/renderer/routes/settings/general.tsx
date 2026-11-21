import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@ggmail/ui/components/field";
import { Switch } from "@ggmail/ui/components/switch";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoginItemSettings } from "electron";
import { useEffect, useId } from "react";
import { ConfigSwitchField } from "@/components/config-switch-field";
import {
  Settings,
  SettingsContent,
  SettingsHeader,
  SettingsPanel,
  SettingsTitle,
} from "@/components/settings";
import { queryClient } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";
import { LanguageField } from "./language-field";

function LaunchAtLoginField() {
  const queryKey = ["login-item-settings"];

  const { data: loginItemSettings } = useQuery({
    queryKey,
    queryFn: () => ipc.main.invoke("app.getLoginItemSettings"),
  });

  const loginItemSettingsMutation = useMutation({
    mutationFn: (settings: Partial<LoginItemSettings>) =>
      ipc.main.invoke("app.setLoginItemSettings", settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey,
      });
    },
  });

  const fieldId = useId();

  if (platform.isLinux || !loginItemSettings) {
    return;
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={fieldId}>
          <Trans>Launch at login</Trans>
        </FieldLabel>
        <FieldDescription>
          <Trans>Start the application automatically when you log in to your computer.</Trans>
        </FieldDescription>
      </FieldContent>
      <Switch
        id={fieldId}
        checked={loginItemSettings.openAtLogin}
        onCheckedChange={(checked) => {
          loginItemSettingsMutation.mutate({
            openAtLogin: checked,
          });
        }}
      />
    </Field>
  );
}

const DEFAULT_MAILTO_CLIENT_QUERY_KEY = ["default-mailto-client"];

function DefaultMailClientField() {
  const { data: isDefaultMailtoClient } = useQuery({
    queryKey: DEFAULT_MAILTO_CLIENT_QUERY_KEY,
    queryFn: () => ipc.main.invoke("app.getIsDefaultMailtoClient"),
  });

  const isDefaultMailtoClientMutation = useMutation({
    mutationFn: () => ipc.main.invoke("app.setAsDefaultMailtoClient"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: DEFAULT_MAILTO_CLIENT_QUERY_KEY,
      });
    },
  });

  const fieldId = useId();

  /**
   * Windows takes the choice in its own settings, so the row cannot tell when it
   * was made; asking again on every focus is the closest it gets.
   */
  useEffect(() => {
    if (!platform.isWindows) {
      return;
    }

    const handleWindowFocus = () => {
      queryClient.invalidateQueries({
        queryKey: DEFAULT_MAILTO_CLIENT_QUERY_KEY,
      });
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  if (typeof isDefaultMailtoClient !== "boolean") {
    return;
  }

  const heading = (
    <>
      <Trans>Default mail client</Trans>
    </>
  );

  if (platform.isWindows) {
    // Responsive, so the button goes under the text in a column too narrow to
    // hold both, rather than past its edge: its label does not wrap.
    return (
      <Field orientation="responsive">
        <FieldContent>
          <FieldTitle>{heading}</FieldTitle>
          <FieldDescription>
            {isDefaultMailtoClient ? (
              <Trans>ggmail is set as the default mail client.</Trans>
            ) : (
              <Trans comment="Windows Settings is the Settings app of Windows, so it follows Microsoft's name for it">
                Choose ggmail as the default mail client in Windows Settings.
              </Trans>
            )}
          </FieldDescription>
        </FieldContent>
        {!isDefaultMailtoClient && (
          <Button
            variant="outline"
            onClick={() => {
              ipc.main.send("app.openDefaultAppsSettings");
            }}
          >
            <Trans comment="Button that opens the Settings app of Windows at its default apps, named as Microsoft names it">
              Open Windows Settings
            </Trans>
          </Button>
        )}
      </Field>
    );
  }

  return (
    <Field orientation="horizontal">
      <FieldContent>
        {/*
         * A label only while there is a switch for it to label. Once ggmail is the
         * default there is nothing left to turn on, so the switch goes and the
         * row states the fact instead — and a `label` naming an id that nothing
         * on the page carries is read as unlabelled by assistive technology.
         */}
        {isDefaultMailtoClient ? (
          <FieldTitle>{heading}</FieldTitle>
        ) : (
          <FieldLabel htmlFor={fieldId}>{heading}</FieldLabel>
        )}
        <FieldDescription>
          {isDefaultMailtoClient ? (
            <Trans>ggmail is set as the default mail client.</Trans>
          ) : (
            <Trans>
              Set ggmail as the default mail client to handle email links and related protocols.
            </Trans>
          )}
        </FieldDescription>
      </FieldContent>
      {!isDefaultMailtoClient && (
        <Switch
          id={fieldId}
          checked={isDefaultMailtoClient}
          onCheckedChange={(checked) => {
            if (checked) {
              isDefaultMailtoClientMutation.mutate();
            }
          }}
        />
      )}
    </Field>
  );
}

export function GeneralSettings() {
  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.general)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <SettingsPanel>
          <LanguageField />

          <DefaultMailClientField />
        </SettingsPanel>

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Settings section about how ggmail starts">Startup</Trans>
          </FieldLegend>
          <SettingsPanel>
            <LaunchAtLoginField />
            <ConfigSwitchField
              label={t`Launch minimized`}
              description={t`Start the application minimized.`}
              configKey="launchMinimized"
            />
          </SettingsPanel>
        </FieldSet>
        {platform.isMacOS && (
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Settings section about going back and forward between pages">
                Navigation
              </Trans>
            </FieldLegend>
            <SettingsPanel>
              <ConfigSwitchField
                label={t`Swipe between pages`}
                description={t({
                  message:
                    "Swipe left or right with two fingers on a trackpad to go back or forward. Swipe between pages must also be on in System Settings.",
                  comment:
                    "The second Swipe between pages names the macOS setting of that name in System Settings, so it follows Apple's wording for it",
                })}
                configKey="swipeNavigation.enabled"
              />
            </SettingsPanel>
          </FieldSet>
        )}
      </SettingsContent>
    </Settings>
  );
}
