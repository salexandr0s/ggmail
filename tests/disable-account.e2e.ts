import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type GgmailApp, useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";
import { readViews } from "./lib/views";

/**
 * The account labels the Accounts submenu offers, which the main process builds
 * from `accounts.getAccounts()`, so a disabled account that still turned up
 * here would be one the app was running.
 *
 * Reading it at all is also what says the main process is still answering. An
 * accounts listener that threw puts up Electron's error dialog and blocks the
 * main process behind it, and nothing evaluates after that.
 */
function readAccountsMenuLabels(ggmail: GgmailApp) {
  return ggmail.app.evaluate(({ Menu }) => {
    const accountsMenu = Menu.getApplicationMenu()?.items.find(
      (menuItem) => menuItem.label === "Accounts",
    );

    const items = accountsMenu?.submenu?.items ?? [];

    const separatorIndex = items.findIndex((menuItem) => menuItem.type === "separator");

    if (separatorIndex === -1) {
      throw new Error(
        "The Accounts submenu has no separator, so its accounts cannot be told from its commands",
      );
    }

    return items.slice(0, separatorIndex).map((menuItem) => menuItem.label);
  });
}

/**
 * How many of the window's child views are running in one account's session.
 *
 * A view is the account as far as the window is concerned, and a partitioned
 * session names its partition in the storage path, so this is what says an
 * account is up or gone without asking the app to describe itself.
 */
async function countAccountViews(ggmail: GgmailApp, accountId: string) {
  const views = await readViews(ggmail);

  return views.filter((view) => view.storagePath.includes(accountId)).length;
}

/** The rows of the accounts list in settings, which lists what the config holds. */
async function openAccountsSettings(ggmail: GgmailApp) {
  const settings = await ggmail.openSettings();

  await openSettingsPage(settings, "Accounts");

  return {
    settings,
    accountItems: settings.locator('[data-slot="item-group"] [data-slot="item"]'),
  };
}

/** Opens one account's edit dialog, flips Disabled and saves. */
async function toggleDisabled(ggmail: GgmailApp, label: string) {
  const { settings, accountItems } = await openAccountsSettings(ggmail);

  await accountItems
    .filter({ hasText: label })
    .getByRole("button", { name: "Account actions" })
    .click();

  await settings.getByRole("menuitem", { name: "Edit account…" }).click();

  await settings.getByRole("switch", { name: "Disabled" }).click();

  await settings.getByRole("button", { name: "Save" }).click();

  await expect(settings.getByRole("dialog")).toHaveCount(0);
}

/**
 * Closes the settings window, which selects nothing on the way out.
 *
 * The Accounts menu items are the other way back, and they are no use here:
 * their handler selects the account before it navigates, so a view left in the
 * wrong place in the z-order would be put right by the act of going to look at
 * it.
 *
 * Waited out on the navigation controls, which only the account titlebar draws.
 * The switcher buttons are what some callers then assert the absence of, and a
 * titlebar still showing Settings would satisfy that without anything having
 * been checked.
 */
async function closeSettings(ggmail: GgmailApp) {
  await ggmail.closeSettings();

  await expect(ggmail.renderer.getByRole("button", { name: "Go back" })).toBeVisible();
}

/** The partition of the view in front, which is the last of the window's children. */
async function readFrontViewStoragePath(ggmail: GgmailApp) {
  return (await readViews(ggmail)).at(-1)?.storagePath;
}

function readAccount(ggmail: GgmailApp, accountId: string) {
  return async () =>
    (await ggmail.readConfig()).accounts?.find((account) => account.id === accountId);
}

test.describe("with the second account disabled", () => {
  const ggmail = useApp({
    accounts: [
      seedAccount({
        id: "first-account",
        label: "Personal",
        notifications: false,
        unreadBadge: false,
      }),
      seedAccount({ id: "second-account", label: "Work", selected: false, disabled: true }),
    ],
  });

  test("the app runs on the enabled account alone", async () => {
    expect(await readAccountsMenuLabels(ggmail)).toEqual(["Personal"]);

    expect(await countAccountViews(ggmail, "second-account")).toBe(0);

    /*
     * The titlebar renders no account buttons at all below two accounts, so the
     * claim is that both are gone rather than that Work alone is. That is the
     * whole of the switcher: with one account to run there is nothing to switch
     * between.
     */
    await expect(ggmail.renderer.getByRole("button", { name: "Work" })).toHaveCount(0);

    await expect(ggmail.renderer.getByRole("button", { name: "Personal" })).toHaveCount(0);
  });

  test("settings still lists it, marked disabled", async () => {
    const { accountItems } = await openAccountsSettings(ggmail);

    await expect(accountItems).toHaveCount(2);

    await expect(accountItems.nth(0)).toContainText("Personal");

    await expect(accountItems.nth(1)).toContainText("Work");

    // The point of the feature: the account is kept, not removed, so the list
    // is where it stays reachable. A row's options share one line, joined by a
    // middle dot, so Disabled is read as part of that line.
    await expect(accountItems.nth(1).getByText("Disabled")).toBeVisible();

    await expect(accountItems.nth(0).getByText("Disabled")).toHaveCount(0);

    // Personal has Unified inbox as its only switch on. The badge row is drawn
    // only when one of its badges is, so a row whose condition missed that
    // switch would hide its badge here and nowhere else.
    await expect(accountItems.nth(0).getByText("All Mail", { exact: true })).toBeVisible();
  });

  test("it can be removed, without an instance to remove it through", async () => {
    const { settings, accountItems } = await openAccountsSettings(ggmail);

    await accountItems
      .filter({ hasText: "Work" })
      .getByRole("button", { name: "Account actions" })
      .click();

    await settings.getByRole("menuitem", { name: "Remove account…" }).click();

    await settings.getByRole("alertdialog").getByRole("button", { name: "Remove account" }).click();

    await expect
      .poll(async () => (await ggmail.readConfig()).accounts?.map((account) => account.id))
      .toEqual(["first-account"]);

    expect(await readAccountsMenuLabels(ggmail)).toEqual(["Personal"]);
  });

  test("turning it back on brings the account up there and then", async () => {
    await toggleDisabled(ggmail, "Work");

    await expect
      .poll(async () => (await readAccount(ggmail, "second-account")())?.disabled)
      .toBe(false);

    // The account ggmail never constructed at launch, constructed now. Nothing
    // short of a whole new `Account` would do: the one this config entry had
    // was never built, and a destroyed one could not be brought back either.
    await expect.poll(() => countAccountViews(ggmail, "second-account")).toBe(1);

    expect(await readAccountsMenuLabels(ggmail)).toEqual(["Personal", "Work"]);

    await closeSettings(ggmail);

    /*
     * Still Personal, which the switch did not deselect. A view is attached on
     * top of the ones already there, so an account turned on and left where it
     * landed would be the one on screen behind a titlebar naming the other.
     */
    await expect
      .poll(async () => (await readFrontViewStoragePath(ggmail))?.includes("first-account"))
      .toBe(true);

    const personal = ggmail.renderer.getByRole("button", { name: "Personal" });

    const work = ggmail.renderer.getByRole("button", { name: "Work" });

    await expect(personal).toBeVisible();

    await expect(work).toBeVisible();

    await work.click();

    await expect
      .poll(async () => (await readAccount(ggmail, "second-account")())?.selected)
      .toBe(true);

    await expect
      .poll(async () => (await readFrontViewStoragePath(ggmail))?.includes("second-account"))
      .toBe(true);
  });
});

/*
 * Three accounts rather than two, for the sake of the handover case below.
 *
 * `createViews` creates the selected account's view last, so it is the one in
 * front. With two accounts that leaves the other already where the handover
 * wants it, and the case passes against an app that never puts it there. With a
 * third in the middle, the view the window is left holding in front is not the
 * one the selection goes to.
 */
test.describe("with three accounts enabled", () => {
  const ggmail = useApp({
    accounts: [
      seedAccount({ id: "first-account", label: "Personal" }),
      seedAccount({ id: "second-account", label: "Work", selected: false }),
      seedAccount({ id: "third-account", label: "Archive", selected: false }),
    ],
  });

  test("turning one off takes it out of the running app", async () => {
    await toggleDisabled(ggmail, "Work");

    await expect
      .poll(async () => (await readAccount(ggmail, "second-account")())?.disabled)
      .toBe(true);

    await expect.poll(() => countAccountViews(ggmail, "second-account")).toBe(0);

    expect(await readAccountsMenuLabels(ggmail)).toEqual(["Personal", "Archive"]);

    await closeSettings(ggmail);

    // The two that are left still have each other to switch between, so this is
    // the switcher losing a button rather than going away.
    await expect(ggmail.renderer.getByRole("button", { name: "Personal" })).toBeVisible();

    await expect(ggmail.renderer.getByRole("button", { name: "Archive" })).toBeVisible();

    await expect(ggmail.renderer.getByRole("button", { name: "Work" })).toHaveCount(0);
  });

  test("turning the selected one off hands the selection over", async () => {
    // The account the rest of the app is pointed at, so this is the case where
    // turning one off has to move the selection in the same write. An account
    // listener asking for the selected account between the two would find one
    // ggmail had just destroyed.
    await toggleDisabled(ggmail, "Personal");

    await expect
      .poll(async () => (await readAccount(ggmail, "first-account")())?.disabled)
      .toBe(true);

    await expect
      .poll(async () => (await readAccount(ggmail, "second-account")())?.selected)
      .toBe(true);

    await expect.poll(() => countAccountViews(ggmail, "first-account")).toBe(0);

    expect(await countAccountViews(ggmail, "second-account")).toBe(1);

    expect(await readAccountsMenuLabels(ggmail)).toEqual(["Work", "Archive"]);

    await closeSettings(ggmail);

    /*
     * Work, which the selection was handed to, and not Archive, which is what
     * the window is left holding in front once the view above it is destroyed.
     * Tearing the front view down says nothing about which of the rest takes
     * its place, so the account the titlebar names has to be put there
     * deliberately.
     */
    await expect
      .poll(async () => (await readFrontViewStoragePath(ggmail))?.includes("second-account"))
      .toBe(true);
  });
});

test.describe("with one account", () => {
  const ggmail = useApp({
    accounts: [seedAccount({ id: "first-account", label: "Personal" })],
  });

  test("the last enabled account cannot be turned off", async () => {
    const { settings, accountItems } = await openAccountsSettings(ggmail);

    await accountItems.getByRole("button", { name: "Account actions" }).click();

    await settings.getByRole("menuitem", { name: "Edit account…" }).click();

    await expect(settings.getByRole("switch", { name: "Disabled" })).toBeDisabled();
  });
});
