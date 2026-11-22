import { platform } from "@electron-toolkit/utils";
import { sampleMailNotification } from "@ggmail/shared/mail-notification";
import { checkWithinNotificationTimes } from "@ggmail/shared/notification-times";
import { Notification, type NotificationConstructorOptions } from "electron";
import { config } from "./config";
import { ipc } from "./ipc";
import { log } from "./lib/log";
import { shouldPlayNewEmailSound } from "./lib/notifications";
import { main } from "./main";

// Electron detaches the native callbacks when the JS wrapper is garbage collected.
const shownNotifications = new Set<Notification>();
let lastNewEmailNotificationAt: number | undefined;

export function areMailNotificationsAllowed(accountId: string) {
  return (
    config.get("notifications.enabled") &&
    !config.get("doNotDisturb.enabled") &&
    config.get("accounts").some((account) => account.id === accountId && account.notifications) &&
    checkWithinNotificationTimes(config.get("notifications.times"), new Date())
  );
}

export function areWorkspaceAppNotificationsAllowed(accountId: string) {
  return (
    config.get("notifications.allowFromWorkspaceApps") &&
    !config.get("doNotDisturb.enabled") &&
    config.get("accounts").some((account) => account.id === accountId && account.notifications)
  );
}

type NotificationOptions = NotificationConstructorOptions & {
  click?: () => void;
  action?: (index: number) => void;
  shown?: () => void;
  failed?: () => void;
};

export function createNotification(
  { click, action, shown, failed, ...options }: NotificationOptions,
  source?: "newEmail",
) {
  if (config.get("doNotDisturb.enabled") || !Notification.isSupported()) {
    failed?.();
    return;
  }

  const now = performance.now();
  const sound = config.get("notifications.sound");
  const playSound =
    !options.silent &&
    config.get("notifications.playSound") &&
    (source !== "newEmail" || shouldPlayNewEmailSound(now, lastNewEmailNotificationAt));

  if (source === "newEmail") {
    lastNewEmailNotificationAt = now;
  }

  const notification = new Notification({ ...options, silent: !playSound || sound !== "system" });
  shownNotifications.add(notification);
  const release = () => shownNotifications.delete(notification);

  notification.once("show", () => {
    shown?.();
    if (!click && !action) {
      release();
    }
    const window = main.windowIfCreated;
    if (
      playSound &&
      sound !== "system" &&
      window &&
      !window.isDestroyed() &&
      config.get("notifications.playSound") &&
      !config.get("doNotDisturb.enabled")
    ) {
      ipc.renderer.send(window.webContents, "notifications.playSound", {
        sound,
        volume: config.get("notifications.volume"),
      });
    }
  });
  notification.once("close", release);
  notification.once("failed", () => {
    release();
    log.warn("Desktop notification failed to display");
    failed?.();
  });
  const finishInteraction = () => {
    release();
    notification.off("click", onClick);
    notification.off("action", onAction);
  };
  const onClick = () => {
    finishInteraction();
    click?.();
  };
  const onAction = ({ actionIndex }: Electron.Event<Electron.NotificationActionEventParams>) => {
    finishInteraction();
    action?.(actionIndex);
  };
  notification.once("click", onClick);
  notification.once("action", onAction);

  notification.show();
}

export function showTestNotification() {
  if (config.get("doNotDisturb.enabled")) {
    return "muted" as const;
  }
  return new Promise<"shown" | "unconfirmed">((resolve) => {
    // Some notification servers do not acknowledge delivery.
    const timeout = setTimeout(() => resolve("unconfirmed"), 5000);
    const finish = (result: "shown" | "unconfirmed") => {
      clearTimeout(timeout);
      resolve(result);
    };
    createNotification({
      ...sampleMailNotification(config.store, platform.isMacOS),
      shown: () => finish("shown"),
      failed: () => finish("unconfirmed"),
    });
  });
}
