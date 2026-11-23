import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AccountConfigInput } from "@ggmail/shared/schemas";
import type { Account } from "./account";

type Sent = { channel: string; payload: Array<Record<string, unknown>> };

let sent: Sent[] = [];

let accountConfigs: Array<{ id: string; selected?: boolean; [key: string]: unknown }> = [];

let clearData = () => Promise.resolve();

let attentionRequired = false;

let resolveRendererReady!: () => void;

const rendererReady = new Promise<void>((resolve) => {
  resolveRendererReady = resolve;
});

mock.module("@electron-toolkit/utils", () => ({ platform: { isMacOS: false } }));

mock.module("electron", () => ({
  app: {},
  net: {},
  powerMonitor: { on: () => {} },
  session: { fromPartition: () => ({ clearData: () => clearData() }) },
}));

mock.module("./account", () => ({ Account: class {} }));

mock.module("./attachments/disk-index", () => ({ clearAttachmentIndexes: () => {} }));

mock.module("./attachments/categories", () => ({ clearAttachmentCategories: () => {} }));

mock.module("./follow-ups/store", () => ({ removeReminders: () => {} }));

mock.module("./google-task-connections", () => ({ forgetTaskAccount: () => {} }));

mock.module("./config", () => ({
  config: {
    // A copy, as the store hands back, so a caller's edits stay out of it
    // until they are written.
    get: (key: string) =>
      key === "accounts" ? accountConfigs.map((accountConfig) => ({ ...accountConfig })) : false,
    set: (_key: string, value: typeof accountConfigs) => {
      accountConfigs = value;
    },
    onDidChange: () => {},
  },
}));

mock.module("./extensions", () => ({ extensions: { clearSessionData: async () => {} } }));

mock.module("./ipc", () => ({
  ipc: {
    broadcast: (channel: string, payload: Sent["payload"]) => {
      sent.push({ channel, payload });
    },
  },
}));

mock.module("./main", () => ({
  main: { rendererReady, window: { isDestroyed: () => false, webContents: {} } },
}));

mock.module("./tabs", () => ({ isWindowedTab: () => false }));

mock.module("./tray", () => ({ appTray: { updateUnreadStatus: () => {} } }));

mock.module("./workspace-app", () => ({
  WorkspaceApp: class {
    static closeAccountInstances() {}
  },
}));

const { accounts } = await import("./accounts");

function addInstance(id: string) {
  accounts.instances.set(id, {
    destroy: () => {},
    gmail: { destroy: () => {}, store: { getState: () => ({ attentionRequired }) } },
    session: { clearData: () => clearData() },
    tabs: { activeTab: {}, closeAll: () => {}, serialize: () => [], tabs: [] },
  } as unknown as Account);
}

beforeEach(() => {
  sent = [];
  accountConfigs = [];
  attentionRequired = false;
  clearData = () => Promise.resolve();
  accounts.instances.clear();
});

describe("accounts and tabs pushes to the renderer", () => {
  test("wait for the renderer, then send the state as it is then", async () => {
    accountConfigs = [{ id: "a" }];
    addInstance("a");

    const sends = [accounts.sendAccountsChangedToRenderer(), accounts.sendTabsChangedToRenderer()];

    expect(sent).toEqual([]);

    attentionRequired = true;
    resolveRendererReady();
    await Promise.all(sends);

    expect(sent.map(({ channel }) => channel).sort()).toEqual(["accounts.changed", "tabs.changed"]);
    expect(sent.find(({ channel }) => channel === "accounts.changed")?.payload).toMatchObject([
      { config: { id: "a" }, gmail: { attentionRequired: true } },
    ]);
  });

  test("skip an account whose instance is already gone", async () => {
    accountConfigs = [{ id: "a" }, { id: "removed" }];
    addInstance("a");
    resolveRendererReady();

    await accounts.sendAccountsChangedToRenderer();
    await accounts.sendTabsChangedToRenderer();

    expect(sent.find(({ channel }) => channel === "accounts.changed")?.payload).toMatchObject([
      { config: { id: "a" } },
    ]);
    expect(sent.find(({ channel }) => channel === "tabs.changed")?.payload).toEqual([
      { accountId: "a", tabs: [] },
    ]);
  });
});

describe("removing the selected account", () => {
  beforeEach(() => {
    accountConfigs = [
      { id: "a", selected: true },
      { id: "b", selected: false },
    ];
    addInstance("a");
    addInstance("b");
  });

  test("selects another account before its data starts clearing", async () => {
    let finishClearing!: () => void;

    clearData = () =>
      new Promise<void>((resolve) => {
        finishClearing = resolve;
      });

    const removal = accounts.removeAccount("a");

    expect(accountConfigs).toEqual([{ id: "b", selected: true }]);
    expect(accounts.getSelectedAccount().config.id).toBe("b");

    // The renderer lists the removed account until the push reaches it.
    accounts.selectAccount("a");

    expect(accounts.getSelectedAccount().config.id).toBe("b");

    // The cleanup of the account's own stores has to run before the clear is
    // reached, and each of those is a dynamic import.
    while (!finishClearing) {
      await Promise.resolve();
    }

    finishClearing();
    await removal;
  });

  test("leaves the app on the other account when its data cannot be cleared", async () => {
    clearData = () => Promise.reject(new Error("locked"));

    await expect(accounts.removeAccount("a")).rejects.toThrow("locked");

    expect(accounts.getSelectedAccount().config.id).toBe("b");
  });
});

describe("saving the Edit account dialog", () => {
  test("keeps what changed elsewhere while the dialog was open", () => {
    accountConfigs = [
      { id: "a", selected: true },
      { id: "b", selected: false },
    ];

    // The dialog still holds the account from before it was selected, and the
    // form hands back everything it was opened with.
    const stale = {
      id: "a",
      selected: false,
      label: "Work",
      color: null,
      notifications: false,
      gmail: { unreadBadge: false, unifiedInbox: true },
    } as AccountConfigInput;

    accounts.updateAccount("a", stale);

    expect(accountConfigs).toEqual([
      {
        id: "a",
        selected: true,
        label: "Work",
        color: null,
        logo: undefined,
        notifications: false,
        gmail: { unreadBadge: false, unifiedInbox: true },
      },
      { id: "b", selected: false },
    ]);
  });
});
