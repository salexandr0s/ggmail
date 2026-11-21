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

test("Calendar opens from the fixed sidebar and follows mailbox switches", async () => {
  await ggmail.app.evaluate(({ session }) => {
    for (const id of ["first-account", "second-account"]) {
      session
        .fromPartition("persist:" + id)
        .protocol.handle(
          "https",
          () => new Response(`<title>${id}</title>`, { headers: { "content-type": "text/html" } }),
        );
    }
  });
  const page = ggmail.renderer;
  await page.evaluate(() =>
    window.electron.ipcRenderer.invoke("config.setConfig", { "workspaceApps.mode": "windows" }),
  );
  const nav = page.getByRole("navigation", { name: "Mail views" });
  const sidebar = page.getByRole("navigation", { name: "Workspace apps" });
  const button = sidebar.getByRole("button", { name: "Calendar" });
  await expect(nav.getByRole("button", { name: "Calendar" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Attachments" }).click();
  const buttons = sidebar.getByRole("button");
  await expect(buttons).toHaveCount(5);
  expect(
    await buttons.evaluateAll((elements) => elements.map((el) => el.getAttribute("aria-label"))),
  ).toEqual(["Mail", "Calendar", "Bookmarks", "Google Tasks", "Settings"]);
  await button.click();
  await page.locator('[data-account-id="second-account"]').click();

  const readPage = () =>
    ggmail.app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const main = windows.find((w) => w.webContents.getURL().includes("main.html"));
      const views = main?.contentView.children as Electron.WebContentsView[];
      const calendarViews = views.filter((v) =>
        v.webContents.getURL().startsWith("https://calendar.google.com/"),
      );
      const active = views.at(-1)?.webContents;
      return {
        windowCount: windows.length,
        fullScreen: main?.isFullScreen(),
        calendars: calendarViews.length,
        account: active?.getTitle(),
        pageId: active?.id,
      };
    });
  await expect.poll(readPage).toEqual({
    windowCount: 1,
    fullScreen: false,
    calendars: 2,
    account: "second-account",
    pageId: expect.any(Number),
  });
  await expect(button).toHaveAttribute("aria-current", "page");
  const work = await readPage();
  await page.locator('[data-account-id="first-account"]').click();
  await expect
    .poll(readPage)
    .toMatchObject({ windowCount: 1, fullScreen: false, calendars: 2, account: "first-account" });
  await page.locator('[data-account-id="second-account"]').click();
  await expect.poll(readPage).toEqual({ ...work, calendars: 2 });
  await sidebar.getByRole("button", { name: "Mail", exact: true }).click();
  await expect(button).not.toHaveAttribute("aria-current", "page");
});

test("sidebar shortcuts reuse Tasks, open bookmarks and keep Settings at the bottom", async () => {
  const page = ggmail.renderer;
  const sidebar = page.getByRole("navigation", { name: "Workspace apps" });
  const tasks = sidebar.getByRole("button", { name: "Google Tasks" });
  const bookmarks = sidebar.getByRole("button", { name: "Bookmarks" });
  const settings = sidebar.getByRole("button", { name: "Settings" });
  await ggmail.app.evaluate(({ session }) =>
    session
      .fromPartition("persist:first-account")
      .protocol.handle(
        "https",
        () =>
          new Response("<title>Task list</title>", { headers: { "content-type": "text/html" } }),
      ),
  );
  await tasks.click();
  await expect(tasks).toHaveAttribute("aria-current", "page");
  const taskViews = () =>
    ggmail.app.evaluate(({ webContents }) =>
      webContents
        .getAllWebContents()
        .filter((wc) => wc.getURL().startsWith("https://tasks.google.com/"))
        .map((wc) => wc.id),
    );
  await expect.poll(taskViews).toHaveLength(1);
  const original = await taskViews();
  await sidebar.getByRole("button", { name: "Mail", exact: true }).click();
  await tasks.click();
  await expect(tasks).toHaveAttribute("aria-current", "page");
  expect(await taskViews()).toEqual(original);
  const popupPromise = page.context().waitForEvent("page");
  await bookmarks.click();
  const popup = await popupPromise;
  await popup.waitForURL("**/bookmarks.html*");
  await expect(bookmarks).toHaveAttribute("aria-expanded", "true");
  await expect(popup.getByRole("heading", { name: "Bookmarks", exact: true })).toBeVisible();
  await popup.getByRole("button", { name: "Close" }).click();
  await page.mouse.move(150, 20);
  await expect(bookmarks).toHaveAttribute("aria-expanded", "false");

  for (const theme of ["light", "dark"] as const) {
    await ggmail.app.evaluate(({ nativeTheme, BrowserWindow }, theme) => {
      nativeTheme.themeSource = theme;
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("main.html"),
      );
      win?.setMinimumSize(320, 360);
      win?.setContentSize(theme === "dark" ? 480 : 1080, theme === "dark" ? 460 : 650);
    }, theme);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(theme === "dark");
    await expect(sidebar).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(19, 19, 19)" : "rgb(255, 255, 255)",
    );
    const bounds = await sidebar.boundingBox();
    const gear = await settings.boundingBox();
    expect(bounds?.width).toBe(52);
    await expect(tasks.locator("svg")).toHaveCSS("width", "20px");
    expect(bounds && gear && bounds.y + bounds.height - gear.y - gear.height).toBeLessThan(20);
    await sidebar.screenshot({ path: test.info().outputPath(`workspace-sidebar-${theme}.png`) });
  }
  await settings.focus();
  await settings.press("Enter");
  await findRendererPage(ggmail, "settings");
  await ggmail.closeSettings();
});

test("Back and Forward retrace libraries and account switches across toolbar layouts", async () => {
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
  // At a laptop width the full set of destinations is still one click away.
  await expect(navigation.getByRole("toolbar")).toBeVisible();
  const waiting = navigation.getByRole("button", { name: "Waiting for reply" });
  await waiting.focus();
  await waiting.press("ArrowLeft");
  await expect(navigation.getByRole("button", { name: "Attachments" })).toBeFocused();
  await expect(waiting).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("button", { name: "Attachments" }).press("Enter");
  await expect(page.getByRole("main", { name: "Attachments" })).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("main.html"),
    );
    window?.setMinimumSize(320, 360);
    window?.setSize(520, 640);
  });
  const selector = navigation.getByRole("button", { name: "Mail views" });
  await expect(selector).toHaveText("Waiting for reply");
  await expect(navigation.getByRole("button", { name: "All Mail" })).toHaveCount(0);
  const pickerPromise = page.context().waitForEvent("page");
  await selector.click();
  const picker = await pickerPromise;
  await picker.waitForURL("**/mail-views.html*");
  await expect(picker.getByRole("menuitemradio", { name: "Waiting for reply" })).toBeChecked();
  await picker.getByRole("menuitemradio", { name: "Attachments" }).click();
  await expect(selector).toHaveText("Attachments");
  await page.screenshot({ path: info.outputPath("compact-shell.png") });
  await expect
    .poll(() => page.evaluate(() => window.electron.ipcRenderer.invoke("shell.getHistory")))
    .toMatchObject({ canGoForward: false });
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
            `Array.from(document.querySelectorAll('[role="menuitemradio"]'), el => el.getAttribute('aria-label') ?? el.textContent)`,
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

test("Gmail profile photos follow their own accounts into the toolbar and Accounts settings", async () => {
  const photoURL = "https://lh3.googleusercontent.com/a/fixture-avatar";
  await ggmail.app.evaluate(async ({ session, webContents, nativeImage }, photoURL) => {
    for (const [index, id] of ["first-account", "second-account"].entries()) {
      const partition = session.fromPartition("persist:" + id);
      const view = webContents.getAllWebContents().find((w) => w.session === partition);
      if (!view) {
        throw new Error("Missing account view");
      }
      const bitmap = Buffer.from(index === 0 ? [80, 60, 220, 255] : [220, 160, 30, 255]);
      const png = nativeImage.createFromBitmap(bitmap, { width: 1, height: 1 }).toPNG();
      partition.protocol.handle("https", (request) => {
        const url = new URL(request.url);
        if (url.hostname === "lh3.googleusercontent.com") {
          return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
        }
        const accountHeader =
          index === 0
            ? `<meta name="og-profile-acct" content="${id}@example.test"><header id="gb"><a href="https://accounts.google.com/SignOutOptions"><img src="${photoURL}"></a></header>`
            : `<header role="banner"><button role="button" aria-label="Account (${id}@example.test)"><svg><image href="${photoURL}"/></svg></button></header>`;
        const sender =
          '<main><img src="https://lh3.googleusercontent.com/a/unrelated-sender"></main>';
        const body = (url.pathname.endsWith("/signed-out") ? "" : accountHeader) + sender;
        return new Response(body, { headers: { "Content-Type": "text/html" } });
      });
      await view.loadURL("https://mail.google.com/mail/u/0/#inbox");
    }
  }, photoURL);

  const page = ggmail.renderer;
  const personal = page.locator(
    'button[data-account-id="first-account"] [data-slot="account-avatar"]',
  );
  const work = page.locator(
    'button[data-account-id="second-account"] [data-slot="account-avatar"]',
  );
  await expect(personal.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(work.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  const firstPhoto = await personal.locator("img").getAttribute("src");
  const secondPhoto = await work.locator("img").getAttribute("src");
  if (!firstPhoto || !secondPhoto) {
    throw new Error("Missing profile photos");
  }
  expect(firstPhoto).not.toBe(secondPhoto);
  const settings = await ggmail.openSettings();
  await settings
    .getByTestId("settings-nav")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  const row = (label: string) =>
    settings
      .locator(".settings-account-row")
      .filter({ has: settings.getByText(label, { exact: true }) });
  await expect(row("Personal").locator("img")).toHaveAttribute("src", firstPhoto);
  await expect(row("Work").locator("img")).toHaveAttribute("src", secondPhoto);
  for (const theme of ["light", "dark"] as const) {
    await ggmail.app.evaluate(({ nativeTheme }, t) => {
      nativeTheme.themeSource = t;
    }, theme);
    await expect(row("Personal")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await settings.screenshot({
      path: test.info().outputPath("accounts-" + theme + ".png"),
      animations: "disabled",
    });
  }
  await ggmail.app.evaluate(async ({ session, webContents }) => {
    const view = webContents
      .getAllWebContents()
      .find((w) => w.session === session.fromPartition("persist:first-account"));
    await view?.loadURL("https://mail.google.com/signed-out");
  });
  await expect(personal.locator("img")).toHaveCount(0);
  await expect(personal).toHaveText("P");
  await expect(row("Work").locator("img")).toHaveAttribute("src", secondPhoto);
});
