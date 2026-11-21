import { realpath } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { findRendererPage } from "./lib/renderer-navigation";
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

test("All Mail is enabled with two accounts", async () => {
  const unifiedInbox = await ggmail.app.evaluate(({ Menu }) => {
    const find = (menuItems: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const menuItem of menuItems) {
        if (menuItem.label === "All Mail") {
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

test("All Mail opens from the titlebar", async () => {
  const unifiedInbox = ggmail.renderer.getByRole("button", {
    name: "All Mail",
  });

  await expect(unifiedInbox).toBeVisible();

  await unifiedInbox.click();

  await expect.poll(() => new URL(ggmail.renderer.url()).hash).toBe("#/unified-inbox");
});

test("Back and Forward retrace libraries and account switches at both toolbar widths", async () => {
  const info = test.info();
  const page = ggmail.renderer;
  const navigation = page.getByRole("navigation", { name: "Mail views" });
  await expect(navigation.getByRole("button", { name: "Mail views", exact: true })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Attachments" }).click();
  await expect(page.getByRole("main", { name: "Attachments" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Attachments" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.screenshot({ path: info.outputPath("wide-shell.png") });
  await navigation.getByRole("button", { name: "Waiting for reply" }).click();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  expect(await ggmail.runMenuCommand("Forward")).toBe(true);
  await expect(page.getByRole("heading", { name: "Waiting for reply" })).toBeVisible();
  await page.locator('[data-account-id="second-account"]').click();
  await expect(page.locator('[data-account-id="second-account"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for reply" })).toBeVisible();
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("main.html"))
      ?.setSize(920, 640);
  });
  const selector = navigation.getByRole("button", { name: "Mail views" });
  await expect(selector).toHaveText("Waiting for reply");
  await expect(navigation.getByRole("button", { name: "All Mail" })).toHaveCount(0);
  await selector.click();
  await page.getByRole("menuitem", { name: "Attachments" }).click();
  await expect(selector).toHaveText("Attachments");
  await expect(page.getByRole("button", { name: "Go forward" })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("compact-shell.png") });
});

test("the narrow Mail views menu opens above Gmail and supports keyboard selection", async () => {
  const page = ggmail.renderer;
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("main.html"),
    );
    window?.setMinimumSize(320, 360);
    window?.setSize(480, 580);
  });
  const trigger = page.getByRole("button", { name: "Mail views", exact: true });
  await trigger.click();
  const id = await findRendererPage(ggmail, "mail-views");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const readOptions = () =>
    ggmail.app.evaluate(
      ({ webContents }, id) =>
        webContents
          .fromId(id)
          ?.executeJavaScript(
            `Array.from(document.querySelectorAll('[role="menuitemradio"]'), el => el.textContent)`,
          ),
      id,
    );
  await expect
    .poll(readOptions)
    .toEqual(["All Mail", "Attachments", "Waiting for reply", "Personal", "Work"]);
  await ggmail.app.evaluate(({ webContents }, id) => {
    const popup = webContents.fromId(id);
    for (const keyCode of ["Home", "Down", "Return"]) {
      popup?.sendInputEvent({ type: "keyDown", keyCode });
      popup?.sendInputEvent({ type: "keyUp", keyCode });
    }
  }, id);
  await expect(page.getByRole("main", { name: "Attachments" })).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const next = await findRendererPage(ggmail, "mail-views");
  await expect
    .poll(() =>
      ggmail.app.evaluate(
        ({ webContents }, id) =>
          webContents
            .fromId(id)
            ?.executeJavaScript(`document.querySelector('[aria-checked="true"]')?.textContent`),
        next,
      ),
    )
    .toBe("Attachments");
});

test("settings opens without an activation page and survives restart", async () => {
  const settings = await ggmail.openSettings();
  expect(await readSettingsPageLabels(settings)).not.toContain("License");
  await ggmail.relaunch();
  await expect(ggmail.renderer.getByRole("button", { name: "Personal" })).toBeVisible();
});
