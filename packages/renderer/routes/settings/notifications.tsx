import { sampleMailNotification } from "@ggmail/shared/mail-notification";
import type { NotificationTimeEdit } from "@ggmail/shared/notification-times";
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
import { Input } from "@ggmail/ui/components/input";
import { Item, ItemActions, ItemContent } from "@ggmail/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { Slider } from "@ggmail/ui/components/slider";
import { msg, select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { Mail, Plus, X } from "lucide-react";
import { useId, useMemo } from "react";
import { toast } from "sonner";
import { ConfigSelectField } from "@/components/config-select-field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import {
  Settings,
  SettingsContent,
  SettingsHeader,
  SettingsPanel,
  SettingsTitle,
} from "@/components/settings";
import { NOTIFICATION_SOUNDS, playNotificationSound } from "@/lib/notifications";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";

const newEmailsItems = [
  {
    value: "all",
    label: msg({
      message: "All new emails",
      comment: "Option of the Notify for setting: a notification for every new email",
    }),
  },
  {
    value: "important",
    label: msg({
      message: "Important only",
      comment:
        "Option of the Notify for setting: a notification only for the emails Gmail marks as important. Important is Gmail's word for them, so it follows Gmail's word in this language",
    }),
  },
];

const MONDAY_FIRST_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export function NotificationsSettings() {
  const { config } = useConfig();

  const soundFieldId = useId();
  const volumeLabelId = useId();

  const configMutation = useConfigMutation();

  const { i18n, t } = useLingui();

  const weekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { weekday: "short", timeZone: "UTC" }),
    [i18n.locale],
  );

  const fullWeekdayFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { weekday: "long", timeZone: "UTC" }),
    [i18n.locale],
  );
  const unconfirmedMessage = t`ggmail couldn’t confirm delivery. Check your system notification settings.`;
  const testNotification = useMutation({
    mutationFn: () => ipc.main.invoke("notifications.showTestNotification"),
    onSuccess: (result) => {
      if (result === "muted") {
        toast.error(t`Turn off Do Not Disturb to show a test notification.`);
      }
      if (result === "unconfirmed") {
        toast.error(unconfirmedMessage);
      }
    },
    onError: () => toast.error(unconfirmedMessage),
  });

  const percentFormat = useMemo(
    () => new Intl.NumberFormat(i18n.locale, { style: "percent", maximumFractionDigits: 0 }),
    [i18n.locale],
  );

  if (!config) {
    return;
  }

  const times = config["notifications.times"];
  const preview = sampleMailNotification(config, platform.isMacOS);
  const systemSoundLabel = t({
    message: "System",
    comment: "Option of the Sound setting: the operating system's own notification sound",
  });

  const percent = percentFormat.format(config["notifications.volume"]);

  const downloadNotificationAction = platform.isLinux ? "click" : "button";

  // 4 January 1970 was a Sunday, so day 4 + n is weekday n.
  const getWeekdayLabel = (dayIndex: number) =>
    weekdayFormat.format(Date.UTC(1970, 0, 4 + dayIndex));

  const editTime = async (edit: NotificationTimeEdit) => {
    const result = await ipc.main.invoke("notifications.editTime", edit);
    if (result === "full") {
      toast.error(t`No free time slot left for another window. Remove or shorten one first.`);
    } else if (result === "overlap") {
      toast.error(t`Notification times overlap. Adjust the windows so that none of them do.`);
    }
  };

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.notifications)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Notifications section about notifications for new emails">
              Emails
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={t({
                message: "New emails",
                comment: "Setting that turns on notifications for new emails",
              })}
              description={t`Show notifications for new emails.`}
              configKey="notifications.enabled"
            />
            {config["notifications.enabled"] && (
              <>
                <ConfigSelectField
                  configKey="notifications.newEmails"
                  label={t({
                    message: "Notify for",
                    comment: "Setting that picks which new emails show a notification",
                  })}
                  description={t({
                    message:
                      "Choose whether every new email or only the emails Gmail marks as important shows a notification.",
                    comment:
                      "Marks as important names Gmail's Important marker, so important follows Gmail's word for it",
                  })}
                  items={newEmailsItems.map(({ value, label }) => ({ value, label: t(label) }))}
                />
                <ConfigSwitchField
                  label={t`Show sender`}
                  description={t`Display the email sender's name in notifications.`}
                  configKey="notifications.showSender"
                />
                <ConfigSwitchField
                  label={t`Show subject`}
                  description={t`Display the email subject in notifications.`}
                  configKey="notifications.showSubject"
                />
                <ConfigSwitchField
                  label={t`Show summary`}
                  description={t`Display the email summary in notifications.`}
                  configKey="notifications.showSummary"
                />
                <Field>
                  <FieldTitle>
                    <Trans>Test notification</Trans>
                  </FieldTitle>
                  <FieldDescription>
                    <Trans>Show a test notification to see how notifications appear.</Trans>
                  </FieldDescription>
                  <div
                    className="flex max-w-md items-start gap-3 rounded-lg border bg-muted/40 p-3"
                    data-testid="notification-preview"
                  >
                    <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold break-words">{preview.title}</div>
                      {preview.subtitle && (
                        <div className="font-medium break-words">{preview.subtitle}</div>
                      )}
                      {preview.body && (
                        <div className="whitespace-pre-line text-muted-foreground">
                          {preview.body}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      disabled={testNotification.isPending || config["doNotDisturb.enabled"]}
                      onClick={() => testNotification.mutate()}
                    >
                      <Trans>Show test notification</Trans>
                    </Button>
                  </div>
                  {config["doNotDisturb.enabled"] && (
                    <p
                      role="status"
                      className="text-sm text-muted-foreground"
                    >{t`Turn off Do Not Disturb to show a test notification.`}</p>
                  )}
                </Field>
                <Field>
                  <FieldTitle>
                    <Trans>Notification times</Trans>
                  </FieldTitle>
                  <FieldDescription>
                    <Trans>
                      Set the time windows when notifications are active. Outside them,
                      notifications stay silent. Leave the list empty to allow notifications at any
                      time.
                    </Trans>
                  </FieldDescription>
                  {times.map((time) => (
                    <Item key={time.id} variant="muted">
                      <ItemContent className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            aria-label={t`Start time`}
                            value={time.start}
                            onChange={(event) =>
                              editTime({
                                type: "clock",
                                id: time.id,
                                field: "start",
                                value: event.target.value,
                              })
                            }
                          />
                          <span className="shrink-0 text-sm text-muted-foreground">
                            <Trans comment="Sits between a start time field and an end time field, as in 09:00 to 17:00">
                              to
                            </Trans>
                          </span>
                          <Input
                            type="time"
                            aria-label={t`End time`}
                            value={time.end === "24:00" ? "00:00" : time.end}
                            onChange={(event) =>
                              editTime({
                                type: "clock",
                                id: time.id,
                                field: "end",
                                value: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-pressed={!time.days?.length || time.days.length === 7}
                            className="aria-pressed:border-primary aria-pressed:bg-selected aria-pressed:text-selected-foreground"
                            onClick={() => editTime({ type: "weekday", id: time.id, day: "all" })}
                          >
                            <Trans>Every day</Trans>
                          </Button>
                          {MONDAY_FIRST_WEEKDAYS.map((dayIndex) => {
                            const days = time.days?.length === 7 ? [] : (time.days ?? []);
                            const isActive = days.includes(dayIndex);
                            const fullDay = fullWeekdayFormat.format(
                              Date.UTC(1970, 0, 4 + dayIndex),
                            );

                            return (
                              <Button
                                key={dayIndex}
                                variant="outline"
                                aria-pressed={isActive}
                                aria-label={fullDay}
                                title={fullDay}
                                size="sm"
                                className="w-9 px-0 aria-pressed:border-primary aria-pressed:bg-selected aria-pressed:text-selected-foreground"
                                onClick={() =>
                                  editTime({ type: "weekday", id: time.id, day: dayIndex })
                                }
                              >
                                {getWeekdayLabel(dayIndex)}
                              </Button>
                            );
                          })}
                        </div>
                      </ItemContent>
                      <ItemActions>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => editTime({ type: "remove", id: time.id })}
                          title={t`Remove time window`}
                        >
                          <X />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                  <div>
                    <Button variant="outline" onClick={() => editTime({ type: "add" })}>
                      <Plus /> <Trans>Add time window</Trans>
                    </Button>
                  </div>
                </Field>
              </>
            )}
          </SettingsPanel>
        </FieldSet>

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Notifications section about notifications for finished downloads">
              Downloads
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={t({
                message: "Show notification",
                comment: "Setting that shows a notification when a download finishes",
              })}
              description={t`Show a notification when a download finishes.`}
              configKey="notifications.downloadCompleted"
            />
            {config["notifications.downloadCompleted"] && (
              <ConfigSelectField
                label={t({
                  message: select(downloadNotificationAction, {
                    click: "On click",
                    other: "Button",
                  }),
                  comment:
                    "Setting that picks what a finished download's notification does: on Linux, clicking it; elsewhere, its button",
                })}
                description={t({
                  message: select(downloadNotificationAction, {
                    click: "Choose what clicking the notification does.",
                    other: "Choose what the notification's button does.",
                  }),
                  comment:
                    "On Linux, a finished download's notification acts when clicked; elsewhere, through its button",
                })}
                configKey="notifications.onClickDownloadCompleted"
                items={[
                  {
                    value: "showInFolder",
                    label: t({
                      message: "Show in folder",
                      context: "download action",
                      comment: "Option of what a finished download's notification does",
                    }),
                  },
                  {
                    value: "openFile",
                    label: t({
                      message: "Open file",
                      comment: "Option of what a finished download's notification does",
                    }),
                  },
                ]}
              />
            )}
          </SettingsPanel>
        </FieldSet>

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Notifications section about notifications from Workspace apps">
              Workspace apps
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={t({
                message: "Show notifications",
                comment: "Setting that lets Workspace apps show notifications",
              })}
              description={t`Show notifications from Workspace apps such as Calendar, Meet, and Chat.`}
              configKey="notifications.allowFromWorkspaceApps"
            />
          </SettingsPanel>
        </FieldSet>

        <FieldSet>
          <FieldLegend>
            <Trans comment="Heading of the Notifications section about notification sounds">
              Sound
            </Trans>
          </FieldLegend>
          <SettingsPanel>
            <ConfigSwitchField
              label={t`Play sound`}
              description={t`Play a sound when showing a notification.`}
              configKey="notifications.playSound"
            />
            {config["notifications.playSound"] && (
              <>
                <Field className="settings-choice-row">
                  <FieldContent>
                    <FieldLabel htmlFor={soundFieldId} className="flex items-center gap-2">
                      <Trans comment="Setting that picks the notification sound">Sound</Trans>
                    </FieldLabel>
                    <FieldDescription>
                      <Trans>Select the sound to play for notifications.</Trans>
                    </FieldDescription>
                  </FieldContent>
                  <Select
                    items={[
                      ...Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => ({
                        value: sound,
                        label: t(label),
                      })),
                      { value: "system", label: systemSoundLabel },
                    ]}
                    value={config["notifications.sound"]}
                    onValueChange={(value) => {
                      if (value) {
                        configMutation.mutate({
                          "notifications.sound": value,
                        });

                        if (value !== "system") {
                          playNotificationSound({
                            sound: value,
                            volume: config["notifications.volume"],
                          });
                        }
                      }
                    }}
                  >
                    <SelectTrigger id={soundFieldId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NOTIFICATION_SOUNDS).map(([sound, { label }]) => (
                        <SelectItem key={sound} value={sound}>
                          {t(label)}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="system">{systemSoundLabel}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {config["notifications.sound"] !== "system" && (
                  <Field>
                    <FieldTitle id={volumeLabelId}>
                      <Trans comment="Title of the notification sound's volume slider; percent is the volume, such as 50%">
                        Volume {percent}
                      </Trans>
                    </FieldTitle>
                    <FieldDescription>
                      <Trans>Set the volume level for notification sounds.</Trans>
                    </FieldDescription>
                    <Slider
                      className="my-2"
                      // A sound that plays at no volume is a sound setting
                      // that looks on and is silent. Silence is turning
                      // sounds off instead.
                      min={5}
                      step={5}
                      aria-labelledby={volumeLabelId}
                      value={config["notifications.volume"] * 100}
                      onValueChange={(value) => {
                        if (typeof value !== "number") {
                          return;
                        }

                        configMutation.mutate({
                          "notifications.volume": value / 100,
                        });
                      }}
                      onValueCommitted={(value) => {
                        if (typeof value !== "number") {
                          return;
                        }

                        const volume = value / 100;

                        if (config["notifications.sound"] !== "system") {
                          playNotificationSound({
                            sound: config["notifications.sound"],
                            volume,
                          });
                        }
                      }}
                    />
                  </Field>
                )}
              </>
            )}
          </SettingsPanel>
        </FieldSet>
      </SettingsContent>
    </Settings>
  );
}
