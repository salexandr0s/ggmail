import { byPlatform } from "@ggmail/shared/platform";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { FieldLegend, FieldSet } from "@ggmail/ui/components/field";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ConfigSelectField } from "@/components/config-select-field";
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
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@/lib/utils";
import "./appearance.css";

// lingui-set comment="Option of the Theme setting"
const themeItems = [
  { value: "light", label: msg`Light` },
  { value: "dark", label: msg`Dark` },
  { value: "system", label: msg`System` },
] as const;
// lingui-reset

// lingui-set comment="Option of the system tray icon's Color setting"
const systemTrayIconColorItems = [
  {
    value: "light",
    label: msg({
      message: "Light",
      context: "tray icon color",
      comment:
        "Option of the system tray icon's Color setting; agrees with the word for color where the language genders it",
    }),
  },
  {
    value: "dark",
    label: msg({
      message: "Dark",
      context: "tray icon color",
      comment:
        "Option of the system tray icon's Color setting; agrees with the word for color where the language genders it",
    }),
  },
  { value: "system", label: msg`System` },
];
// lingui-reset

// lingui-set comment="Option of the Window controls setting: whether the titlebar shows the close, minimize and maximize buttons"
const linuxWindowControlsItems = [
  { value: "auto", label: msg`Automatic` },
  { value: "show", label: msg`Show` },
  { value: "hide", label: msg`Hide` },
];
// lingui-reset

function ThemeWindow({ dark = false }: { dark?: boolean }) {
  return (
    <span className="theme-window" data-dark={dark}>
      <span className="theme-window-bar" />
      <span className="theme-window-sidebar" />
      <span className="theme-window-messages">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function AppearanceSettings() {
  const { config } = useConfig();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  const renderPlatformIconSettings = () => {
    const selectAccountWithUnreadField = (
      <ConfigSwitchField
        label={t`Select first unread account on click`}
        description={byPlatform(platform, {
          macOS: t`Automatically select the first account with unread emails when clicking the menu bar icon.`,
          windows: t({
            message:
              "Automatically select the first account with unread emails when clicking the system tray icon.",
            context: "Windows",
          }),
          linux: t({
            message:
              "Automatically select the first account with unread emails when clicking the system tray icon.",
            context: "Linux",
          }),
        })}
        configKey="tray.selectAccountWithUnread"
        disabled={!config["tray.enabled"]}
      />
    );

    if (platform.isMacOS) {
      return (
        <>
          <FieldSet>
            <FieldLegend>
              <Trans>Dock icon</Trans>
            </FieldLegend>
            <SettingsPanel>
              <ConfigSwitchField
                label={t`Enable dock icon`}
                description={t`Show the application icon in the dock.`}
                configKey="dock.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label={t`Show unread badge`}
                description={t`Show an unread badge on the dock icon when there are unread emails.`}
                configKey="dock.unreadBadge"
                restartRequired
              />
            </SettingsPanel>
          </FieldSet>

          <FieldSet>
            <FieldLegend>
              <Trans>Menu bar icon</Trans>
            </FieldLegend>
            <SettingsPanel>
              <ConfigSwitchField
                label={t`Enable menu bar icon`}
                description={t`Show the application icon in the menu bar.`}
                configKey="tray.enabled"
                restartRequired
              />
              <ConfigSwitchField
                label={t`Show unread count`}
                description={t`Show an unread count next to the menu bar icon when there are unread emails.`}
                configKey="tray.unreadCount"
                disabled={!config["tray.enabled"]}
                restartRequired
              />
              {selectAccountWithUnreadField}
            </SettingsPanel>
          </FieldSet>
        </>
      );
    }

    // Only Windows and Linux get here, and each names the tray its own way.
    return (
      <FieldSet>
        <FieldLegend>
          {platform.isWindows
            ? t({ message: "System tray icon", context: "Windows" })
            : t({ message: "System tray icon", context: "Linux" })}
        </FieldLegend>
        <SettingsPanel>
          <ConfigSwitchField
            label={
              platform.isWindows
                ? t({ message: "Enable system tray icon", context: "Windows" })
                : t({ message: "Enable system tray icon", context: "Linux" })
            }
            description={
              platform.isWindows
                ? t({
                    message: "Show the application icon in the system tray.",
                    context: "Windows",
                  })
                : t({ message: "Show the application icon in the system tray.", context: "Linux" })
            }
            configKey="tray.enabled"
            restartRequired
          />
          <ConfigSelectField
            configKey="tray.iconColor"
            label={t({
              message: "Color",
              comment: "Setting that picks the system tray icon's color",
            })}
            description={
              platform.isWindows
                ? t({ message: "Choose the color of the system tray icon.", context: "Windows" })
                : t({ message: "Choose the color of the system tray icon.", context: "Linux" })
            }
            items={systemTrayIconColorItems.map(({ value, label }) => ({ value, label: t(label) }))}
            restartRequired
          />
          {selectAccountWithUnreadField}
        </SettingsPanel>
      </FieldSet>
    );
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.appearance)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldSet>
          <FieldLegend>
            <Trans comment="Setting that picks a light or dark appearance">Theme</Trans>
          </FieldLegend>
          <div className="settings-themes">
            {themeItems.map(({ value, label }) => (
              <label key={value} className="settings-theme">
                <span aria-hidden="true" className="settings-theme-preview" data-theme={value}>
                  <span className="theme-window-frame">
                    <ThemeWindow dark={value === "dark"} />
                    {value === "system" && <ThemeWindow dark />}
                  </span>
                </span>
                <span className="settings-theme-caption">
                  {t(label)}
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={config.theme === value}
                    onChange={() => {
                      ipc.main.send("theme.setTheme", value);
                      if (!platform.isMacOS) {
                        restartRequiredToast();
                      }
                    }}
                  />
                </span>
              </label>
            ))}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Appearance section for how accounts look">
              Accounts
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={t`Show unread badges`}
              description={t`Show unread badges, following each account's own setting.`}
              configKey="accounts.unreadBadge"
              restartRequired
            />
          </SettingsPanel>
        </FieldSet>

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Appearance section for the bar along the top of ggmail's window">
              Titlebar
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={t`Show Do Not Disturb button`}
              description={t`Show a moon in the title bar while Do Not Disturb is on.`}
              configKey="doNotDisturb.showTitlebarButton"
            />
          </SettingsPanel>
        </FieldSet>

        {renderPlatformIconSettings()}

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Appearance section about ggmail's window">Window</Trans>
          </FieldLegend>
          <SettingsPanel>
            {platform.isLinux && (
              <ConfigSelectField
                configKey="window.linuxWindowControls"
                label={t`Window controls`}
                description={t({
                  message:
                    "Show the close, minimize and maximize buttons in the titlebar. Automatic hides them on window managers without decorations, such as dwm, i3 and sway.",
                  comment:
                    "Automatic is this setting's first option; dwm, i3 and sway are window managers",
                })}
                items={linuxWindowControlsItems.map(({ value, label }) => ({
                  value,
                  label: t(label),
                }))}
                restartRequired
              />
            )}
            <ConfigSwitchField
              label={t`Restrict minimum window size`}
              description={t`Stop the application window from being resized below a usable minimum.`}
              configKey="window.restrictMinimumSize"
            />
          </SettingsPanel>
        </FieldSet>
      </SettingsContent>
    </Settings>
  );
}
