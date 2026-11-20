import { realpath } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { readSettingsPageLabels } from "./lib/settings";

/** The shape `accounts` is stored in, with only the two labels differing. */
function account(id: string, label: string, selected: boolean) {
  return {
    id,
    label,
    color: null,
    selected,
    notifications: true,
    gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
    workspaceApps: { savedTabs: [], bookmarks: [] },
  };
}

const ggmail = useApp({
  accounts: [account("first-account", "Personal", true), account("second-account", "Work", false)],
  "verificationCodes.autoCopy": true,
  "extensions.enabled": true,
});

test("the app uses the ggmail identity and the requested profile", async () => {
  const identity = await ggmail.app.evaluate(({ app }) => ({
    name: app.name,
    userData: app.getPath("userData"),
  }));

  expect(identity.name).toBe("ggmail");
  expect(await realpath(identity.userData)).toBe(await realpath(ggmail.userDataDir));
});

test("both accounts survive into the app", async () => {
  const accountLabels = await ggmail.app.evaluate(({ Menu }) => {
    const accountsMenu = Menu.getApplicationMenu()?.items.find(
      (menuItem) => menuItem.label === "Accounts",
    );

    const items = accountsMenu?.submenu?.items ?? [];

    /*
     * Up to the first separator: everything after it is a command rather than
     * an account. Guarded rather than sliced straight, because findIndex
     * answers -1 for a submenu that lost its separator and slice(0, -1) would
     * quietly drop the last item and go on reporting a plausible list.
     */
    const separatorIndex = items.findIndex((menuItem) => menuItem.type === "separator");

    if (separatorIndex === -1) {
      throw new Error(
        "The Accounts submenu has no separator, so its accounts cannot be told from its commands",
      );
    }

    return items.slice(0, separatorIndex).map((menuItem) => menuItem.label);
  });

  expect(accountLabels).toEqual(["Personal", "Work"]);
});

test("Unified Inbox is enabled with two accounts", async () => {
  const unifiedInbox = await ggmail.app.evaluate(({ Menu }) => {
    const find = (menuItems: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const menuItem of menuItems) {
        if (menuItem.label === "Unified Inbox") {
          return menuItem;
        }

        const found = menuItem.submenu ? find(menuItem.submenu.items) : undefined;

        if (found) {
          return found;
        }
      }

      return undefined;
    };

    const menuItem = find(Menu.getApplicationMenu()?.items ?? []);

    return menuItem ? { enabled: menuItem.enabled } : null;
  });

  expect(unifiedInbox).toEqual({ enabled: true });
});

test("both accounts are in the titlebar, and switching writes back", async () => {
  const personal = ggmail.renderer.getByRole("button", { name: "Personal" });

  const work = ggmail.renderer.getByRole("button", { name: "Work" });

  await expect(personal).toBeVisible();

  await expect(work).toBeVisible();

  await work.click();

  /*
   * Polled against the config the main process writes rather than the button's
   * own styling. Clicking sends `accounts.selectAccount`, which persists the
   * selection, so this is the whole round trip — and the button would read as
   * selected from its variant either way.
   */
  await expect
    .poll(
      async () => (await ggmail.readConfig()).accounts?.find((account) => account.selected)?.label,
    )
    .toBe("Work");
});

test("the unified inbox opens from the titlebar", async () => {
  const unifiedInbox = ggmail.renderer.getByRole("button", {
    name: "Open unified inbox",
  });

  await expect(unifiedInbox).toBeVisible();

  await unifiedInbox.click();

  await expect.poll(() => new URL(ggmail.renderer.url()).hash).toBe("#/unified-inbox");
});

test("settings opens without an activation page and survives restart", async () => {
  const settings = await ggmail.openSettings();
  expect(await readSettingsPageLabels(settings)).not.toContain("License");
  await ggmail.relaunch();
  await expect(ggmail.renderer.getByRole("button", { name: "Personal" })).toBeVisible();
});
