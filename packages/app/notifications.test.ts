import { beforeEach, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { createDefaultConfig } from "@ggmail/shared/config";
import type { Config } from "@ggmail/shared/types";
import type { NotificationConstructorOptions } from "electron";

function defaults() {
  return createDefaultConfig({ accountId: "mail", downloadsLocation: "", trayEnabled: false });
}

let preferences = defaults();
const displayed: NotificationConstructorOptions[] = [];
const send = mock(() => {});
class DesktopNotification extends EventEmitter {
  static isSupported = () => true;
  constructor(private options: NotificationConstructorOptions) {
    super();
  }
  show() {
    displayed.push(this.options);
    this.emit("show");
  }
}

mock.module("electron", () => ({ Notification: DesktopNotification }));
mock.module("@electron-toolkit/utils", () => ({ platform: { isMacOS: true } }));
mock.module("./config", () => ({ config: { get: (key: keyof Config) => preferences[key] } }));
mock.module("./main", () => ({
  main: { windowIfCreated: { isDestroyed: () => false, webContents: {} } },
}));
mock.module("./lib/log", () => ({ log: { warn: () => {} } }));
mock.module("./ipc", () => ({ ipc: { renderer: { send } } }));

const {
  areMailNotificationsAllowed,
  areWorkspaceAppNotificationsAllowed,
  createNotification,
  showTestNotification,
} = await import("./notifications");

beforeEach(() => {
  preferences = defaults();
  displayed.length = 0;
  send.mockClear();
});

test("mail and Workspace switches are independent and both honor account mute", () => {
  preferences["notifications.enabled"] = false;
  expect(areMailNotificationsAllowed("mail")).toBe(false);
  expect(areWorkspaceAppNotificationsAllowed("mail")).toBe(true);
  preferences["notifications.enabled"] = true;
  preferences["notifications.allowFromWorkspaceApps"] = false;
  expect(areMailNotificationsAllowed("mail")).toBe(true);
  expect(areWorkspaceAppNotificationsAllowed("mail")).toBe(false);
  preferences["notifications.allowFromWorkspaceApps"] = true;
  preferences.accounts = preferences.accounts.map((account) => ({
    ...account,
    notifications: false,
  }));
  expect(areMailNotificationsAllowed("mail")).toBe(false);
  expect(areWorkspaceAppNotificationsAllowed("mail")).toBe(false);
});

test("Do Not Disturb stops desktop delivery and sound for all app alerts", async () => {
  preferences["doNotDisturb.enabled"] = true;
  expect(areWorkspaceAppNotificationsAllowed("mail")).toBe(false);
  expect(areMailNotificationsAllowed("mail")).toBe(false);
  createNotification({ title: "Download complete" });
  expect(await showTestNotification()).toBe("muted");
  expect(displayed).toHaveLength(0);
  expect(send).not.toHaveBeenCalled();
});

test("a quiet Workspace alert stays silent and other alerts use the selected sound", () => {
  createNotification({ title: "Calendar", silent: true });
  createNotification({ title: "Download complete" });
  expect(displayed.map(({ silent }) => silent)).toEqual([true, true]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({}, "notifications.playSound", { sound: "linen", volume: 1 });
  preferences["notifications.sound"] = "system";
  createNotification({ title: "Chat" });
  preferences["notifications.playSound"] = false;
  createNotification({ title: "Chat" });
  expect(displayed.slice(2).map(({ silent }) => silent)).toEqual([false, true]);
  expect(send).toHaveBeenCalledTimes(1);
});
