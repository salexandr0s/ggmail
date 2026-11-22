/*
 * Settings is the densest surface the tests can reach: nearly every route is
 * `ConfigSwitchField` and `ConfigSelectField` over a config key, and none of it
 * needs a Gmail account.
 */
import { expect, type Locator, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useApp } from "./lib/app";
import { setMinimumWindowWidth } from "./lib/page-fit";
import {
  configSwitch,
  openSettingsPage,
  readSettingsPageLabels,
  showSettingsNavigation,
} from "./lib/settings";

const ggmail = useApp({
  accounts: [
    seedAccount({
      id: "settings",
      label: "Personal",
      savedTabs: [
        seedSavedTab({
          app: "calendar",
          title: "Calendar",
          url: "about:blank",
          loadOnLaunch: true,
        }),
      ],
    }),
  ],
});

test("every settings page renders", async () => {
  const rendererErrors: Error[] = [];

  const settings = await ggmail.openSettings();

  settings.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  for (const label of await readSettingsPageLabels(settings)) {
    await openSettingsPage(settings, label);
  }

  /*
   * Both field components throw when a key's value isn't the type they render —
   * a switch over a string, a select over a boolean. That throw takes the whole
   * route down at render time, which nothing but a run of the built app catches.
   */
  expect(rendererErrors.map((error) => error.stack ?? error.message)).toEqual([]);
});

test("the page filter narrows navigation and opens a result from the keyboard", async () => {
  const settings = await ggmail.openSettings();
  const filter = settings.getByRole("searchbox", { name: "Filter pages" });
  const pages = settings.getByTestId("settings-nav").getByRole("button");
  const pageCount = await pages.count();

  await settings.keyboard.press("/");
  await expect(filter).toBeFocused();
  await filter.fill("xyzzy");
  await expect(pages).toHaveCount(0);
  await expect(settings.getByRole("status")).toContainText("No matching pages");
  await filter.press("Escape");
  await expect(pages).toHaveCount(pageCount);

  await filter.fill("APPear");
  await expect(pages).toHaveCount(1);
  await filter.press("Enter");
  await expect(settings.getByTestId("settings-title")).toHaveText("Appearance");
  await expect(filter).toHaveValue("");
  await expect(pages).toHaveCount(pageCount);
});

test("theme previews apply and persist the keyboard selection", async () => {
  const settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Appearance");
  const light = settings.getByRole("radio", { name: "Light", exact: true });
  const dark = settings.getByRole("radio", { name: "Dark", exact: true });

  await light.check();
  await expect.poll(async () => (await ggmail.readConfig()).theme).toBe("light");
  await light.press("ArrowRight");
  await expect(dark).toBeChecked();
  await expect.poll(async () => (await ggmail.readConfig()).theme).toBe("dark");
  await expect(settings.locator("html")).toHaveClass(/\bdark\b/);
  await openSettingsPage(settings, "General");
  await openSettingsPage(settings, "Appearance");
  await expect(dark).toBeChecked();
});

test("a switch writes its key back to the config", async () => {
  const settings = await ggmail.openSettings();

  await openSettingsPage(settings, "Downloads");

  const saveAs = configSwitch(settings, "downloads.saveAs");

  await expect(saveAs).toBeVisible();

  expect((await ggmail.readConfig())["downloads.saveAs"]).toBe(false);

  await saveAs.click();

  // Polled against the file the main process writes, not the switch: what is
  // being proved is the round trip through IPC to disk, and the switch would
  // read as on either way.
  await expect.poll(async () => (await ggmail.readConfig())["downloads.saveAs"]).toBe(true);

  await saveAs.click();

  await expect.poll(async () => (await ggmail.readConfig())["downloads.saveAs"]).toBe(false);
});

test("a select behind a confirmation writes only once confirmed", async () => {
  const settings = await ggmail.openSettings();

  await openSettingsPage(settings, "Workspace apps");
  const mode = settings.getByRole("combobox", { name: "Mode", exact: true });
  await mode.click();
  await settings.getByRole("option", { name: "New windows", exact: true }).click();

  const confirmation = settings.getByRole("dialog");
  await expect(confirmation).toContainText("Switch to New windows?");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(mode).toContainText("Tabs");
  expect((await ggmail.readConfig())["workspaceApps.mode"]).toBe("tabs");

  await mode.click();
  await settings.getByRole("option", { name: "New windows", exact: true }).click();
  await confirmation.getByRole("button", { name: "Switch to New windows", exact: true }).click();
  await expect.poll(async () => (await ggmail.readConfig())["workspaceApps.mode"]).toBe("windows");
});

test("every field label points at its control", async () => {
  const labelledIds: string[] = [];

  const settings = await ggmail.openSettings();

  for (const label of await readSettingsPageLabels(settings)) {
    // Opened and waited for before the DOM is read. Every page is statically
    // imported and renders in the same task as the navigation today, so a scan
    // would find it anyway — but one lazily loaded page would have this reading
    // the page before it and reporting nothing at all.
    await openSettingsPage(settings, label);

    /*
     * A label naming an id nothing carries is a field whose text does not click
     * through to its control and which assistive technology reads as unlabelled.
     * It is also what the rest of these tests stand on, since they address a
     * control through the label that points at it.
     */
    const fieldLabels = await settings.locator("label[for]").evaluateAll((labelElements) =>
      labelElements.map((labelElement) => ({
        labelledId: labelElement.getAttribute("for") ?? "",
        resolves: Boolean(
          labelElement.ownerDocument.getElementById(labelElement.getAttribute("for") ?? ""),
        ),
      })),
    );

    // Soft, so one bad page reports and the walk carries on to the rest. The
    // navigation above stays hard: reading on past a page that never opened
    // would report the page before it, over and over.
    expect
      .soft(
        fieldLabels.filter(({ resolves }) => !resolves).map(({ labelledId }) => labelledId),
        label,
      )
      .toEqual([]);

    labelledIds.push(...fieldLabels.map(({ labelledId }) => labelledId));
  }

  // Guards the walk itself, the same way the gating walk does: labels that
  // stopped naming their control would leave nothing to check and read clean.
  expect(labelledIds).toContain("downloads.saveAs");
  expect(labelledIds).toContain("notifications.enabled");
});

test("a copy button is named for screen readers", async () => {
  const settings = await ggmail.openSettings();

  await openSettingsPage(settings, "About ggmail");

  await expect(settings.getByRole("button", { name: "Copy", exact: true }).first()).toBeVisible();
});

test("picker chevrons stay at the right edge of the control", async () => {
  const settings = await ggmail.openSettings();

  async function checkChevron(trigger: Locator) {
    await expect(trigger).toBeVisible();
    const chevron = trigger.locator(":scope > svg:last-child");
    await expect(chevron).toBeVisible();
    const inset = await chevron.evaluate((svg) => {
      const trigger = svg.parentElement;
      if (!trigger) {
        throw new Error("The chevron has no trigger");
      }
      return trigger.getBoundingClientRect().right - svg.getBoundingClientRect().right;
    });
    expect(inset).toBeGreaterThanOrEqual(0);
    expect(inset).toBeLessThanOrEqual(12);
  }

  async function checkPagePickers() {
    await openSettingsPage(settings, "Workspace apps");
    const mode = settings.getByRole("combobox", { name: "Mode", exact: true });
    await checkChevron(mode);
    await mode.press("Enter");
    const selected = settings.getByRole("option", { selected: true });

    await expect(selected).toBeVisible();
    const selectedColor = await selected.evaluate((item) => getComputedStyle(item).backgroundColor);
    await settings.keyboard.press("Escape");
    await showSettingsNavigation(settings);
    await expect(settings.getByTestId("settings-nav").locator('[aria-current="page"]')).toHaveCSS(
      "background-color",
      selectedColor,
    );
    if (await settings.locator(".settings-nav-trigger").isVisible()) {
      await settings.keyboard.press("Escape");
    }
    await checkChevron(settings.getByLabel("Excluded apps", { exact: true }));
    await openSettingsPage(settings, "AI");
    await checkChevron(settings.getByRole("combobox", { name: "Mail assistant provider" }));
  }

  await checkPagePickers();
  await setMinimumWindowWidth(ggmail, settings);
  await checkPagePickers();

  await openSettingsPage(settings, "Accounts");
  await settings.getByRole("button", { name: "Add", exact: true }).click();
  await checkChevron(settings.getByRole("dialog").getByRole("combobox", { name: "Color" }));
});

test("compact Settings keeps the page, its filter and keyboard focus in reach", async () => {
  const page = await ggmail.openSettings();
  const resize = (width: number, height: number) =>
    ggmail.app.evaluate(
      ({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes("settings.html"))
          ?.setContentSize(size.width, size.height);
      },
      { width, height },
    );
  await ggmail.app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "light";
  });
  await resize(360, 440);
  const opener = page.locator(".settings-nav-trigger");
  await expect(opener).toBeInViewport();
  const main = page.getByRole("main");
  await expect(main).toHaveCSS("width", "360px");
  await page.keyboard.press("/");
  const sheet = page.getByRole("dialog");
  const search = sheet.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("xyzzy");
  await expect(sheet.getByRole("status")).toHaveText("No matching pages");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await search.press("ArrowDown");
  await page.keyboard.press("End");
  await expect(sheet.getByRole("button", { name: "About ggmail" })).toBeFocused();
  await expect(search).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.press("Enter");
  await search.fill("appear");
  await search.press("Enter");
  await expect(page.getByTestId("settings-title")).toHaveText("Appearance");
  await expect(page.getByRole("heading", { name: "Appearance", exact: true })).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("settings-compact.png"),
    animations: "disabled",
  });
  await opener.click();
  await page.screenshot({
    path: test.info().outputPath("settings-navigation-compact.png"),
    animations: "disabled",
  });
  await resize(1000, 600);
  await expect(sheet).toBeHidden();
  await expect(
    page.getByTestId("settings-nav").getByRole("button", { name: "Appearance" }),
  ).toHaveAttribute("aria-current", "page");
  await resize(360, 360);
  await expect(opener).toBeInViewport();
  await expect(sheet).toBeHidden();
  await openSettingsPage(page, "Accounts");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const accountDialog = page.getByRole("dialog");
  const fields = accountDialog.locator("form > [data-slot=field-group]");
  await expect(accountDialog.getByRole("button", { name: "Add", exact: true })).toBeInViewport();
  await fields.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await fields.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await accountDialog.getByRole("button", { name: "Cancel" }).click();
  await openSettingsPage(page, "Downloads");
  const control = configSwitch(page, "downloads.saveAs");
  await control.click();
  await expect.poll(async () => (await ggmail.readConfig())["downloads.saveAs"]).toBe(true);
});

test("sidebar shortcuts apply live, preserve open apps and leave Settings pinned after restart", async () => {
  const rail = () => ggmail.renderer.getByRole("navigation", { name: "Workspace apps" });
  const button = (name: string) => rail().getByRole("button", { name, exact: true });
  const defaults = [
    "Mail",
    "Calendar",
    "Google Tasks",
    "Google Meet",
    "Docs",
    "Drive",
    "Sheets",
    "Bookmarks",
    "Settings",
  ];
  await expect
    .poll(() =>
      rail()
        .getByRole("button")
        .evaluateAll((items) => items.map((item) => item.getAttribute("title"))),
    )
    .toEqual(defaults);
  await ggmail.app.evaluate(({ session }) =>
    session.fromPartition("persist:settings").protocol.handle("https", (request) => {
      const host = new URL(request.url).hostname.split(".")[0];
      return new Response("<title>" + host + " fixture</title>", {
        headers: { "content-type": "text/html" },
      });
    }),
  );
  for (const name of ["Docs", "Drive", "Sheets"]) {
    await button(name).click();
    await expect(button(name)).toHaveAttribute("aria-current", "page");
  }
  let settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Sidebar");
  const add = (name: string) =>
    settings.getByRole("button", { name: "Add " + name + " to sidebar", exact: true });
  const remove = (name: string) =>
    settings.getByRole("button", { name: "Remove " + name + " from sidebar", exact: true });
  await expect(remove("Settings")).toHaveCount(0);
  await expect(
    settings.locator('.sidebar-preview-footer [title="Bookmarks"] + hr + [title="Settings"]'),
  ).toHaveCount(1);
  await settings.screenshot({
    path: test.info().outputPath("sidebar-settings.png"),
    animations: "disabled",
  });
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("settings.html"),
    );
    win?.setContentSize(360, 680);
  });
  await expect.poll(() => settings.evaluate(() => innerWidth)).toBe(360);
  await expect(settings.locator(".sidebar-preview-footer [title='Settings']")).toBeInViewport();
  const bookmarkLabel = settings
    .getByRole("button", { name: "Drag Bookmarks to reorder" })
    .locator("span");
  expect(
    await bookmarkLabel.evaluate(
      (el) =>
        el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
    ),
  ).toBeLessThan(1.1);
  await settings.screenshot({
    path: test.info().outputPath("sidebar-settings-compact.png"),
    animations: "disabled",
  });
  await remove("Sheets").click();
  await expect(button("Sheets")).toHaveCount(0);
  await expect(
    ggmail.renderer
      .getByRole("group", { name: "Tabs", exact: true })
      .getByRole("button", { name: "sheets fixture", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await add("Sheets").click();
  await expect(button("Sheets")).toHaveAttribute("aria-current", "page");
  await add("Chat").click();
  await expect(button("Chat")).toBeVisible();
  await remove("Chat").click();
  for (const name of [
    "Gmail",
    "Calendar",
    "Tasks",
    "Meet",
    "Docs",
    "Drive",
    "Sheets",
    "Bookmarks",
  ]) {
    await remove(name).click();
  }
  await expect(settings.locator(".sidebar-preview-footer hr")).toHaveCount(0);
  await expect(rail().getByRole("button")).toHaveCount(1);
  await expect(button("Settings")).toBeInViewport();
  await ggmail.relaunch();
  await expect(rail().getByRole("button")).toHaveCount(1);
  const opened = ggmail.app.waitForEvent("window");
  await button("Settings").click();
  settings = await opened;
  await settings.waitForURL((url) => url.pathname.endsWith("/settings.html"));
  await openSettingsPage(settings, "Sidebar");
  await settings.getByRole("button", { name: "Restore defaults" }).click();
  await expect(rail().getByRole("button")).toHaveCount(defaults.length);
  await expect(remove("Docs")).toBeVisible();
});

test("launcher app controls stay joined at full and compact widths", async () => {
  const settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Workspace apps");
  await settings.getByRole("button", { name: "Add Sheets to launcher" }).click();
  await settings.getByRole("button", { name: "Add Apps Script to launcher" }).click();
  const chip = settings.locator(".app-picker-chip").filter({ hasText: "Sheets" });
  for (const width of [980, 360]) {
    await ggmail.app.evaluate(
      ({ BrowserWindow }, width) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("settings.html"))
          ?.setContentSize(width, 680),
      width,
    );
    await expect.poll(() => settings.evaluate(() => innerWidth)).toBe(width);
    await settings
      .getByText("Launcher apps", { exact: true })
      .evaluate((legend) => legend.scrollIntoView({ block: "start" }));
    await chip.scrollIntoViewIfNeeded();
    const gap = await chip.evaluate((el) => {
      const [handle, remove] = el.querySelectorAll("button");
      if (!handle || !remove) {
        throw new Error("Missing launcher chip control");
      }
      return remove.getBoundingClientRect().left - handle.getBoundingClientRect().right;
    });
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
    await expect(
      settings.getByRole("button", { name: "Remove Sheets from launcher" }),
    ).toBeInViewport();
    await settings.screenshot({
      path: test.info().outputPath("launcher-" + width + ".png"),
      animations: "disabled",
    });
  }
  const drag = settings.getByRole("button", { name: "Drag Apps Script to reorder" });
  await drag.focus();
  await settings.keyboard.press("Space");
  await settings.keyboard.press("ArrowLeft");
  await settings.keyboard.press("Space");
  await expect
    .poll(async () => (await ggmail.readConfig())["workspaceApps.launcherApps"], { timeout: 4500 })
    .toEqual(["appsScript", "sheets"]);
  await settings.getByRole("button", { name: "Remove Sheets from launcher" }).click();
  await expect(settings.getByRole("button", { name: "Add Sheets to launcher" })).toBeVisible();
  await expect
    .poll(async () => (await ggmail.readConfig())["workspaceApps.launcherApps"])
    .toEqual(["appsScript"]);
  await expect(
    ggmail.renderer
      .getByRole("navigation", { name: "Workspace apps" })
      .getByRole("button", { name: "Sheets", exact: true }),
  ).toBeVisible();
});

test("password manager rows share the panel surface in both themes", async () => {
  const settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Extensions");
  const rows = settings
    .getByRole("list")
    .filter({ has: settings.getByRole("switch", { name: "Install Bitwarden" }) });
  for (const theme of ["light", "dark"] as const) {
    await ggmail.app.evaluate(({ nativeTheme }, theme) => {
      nativeTheme.themeSource = theme;
    }, theme);
    await expect
      .poll(() => settings.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(theme === "dark");
    await expect(rows.getByRole("listitem")).toHaveCount(2);
    for (const row of await rows.getByRole("listitem").all()) {
      await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    await expect(rows.getByRole("switch", { name: "Install Bitwarden" })).toBeDisabled();
    await rows.screenshot({
      path: test.info().outputPath("password-managers-" + theme + ".png"),
      animations: "disabled",
    });
  }
});

test("dragging sidebar shortcuts changes their order across restarts and moves the bookmark popup", async () => {
  let settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Sidebar");
  const handle = (name: string) =>
    settings.getByRole("button", { name: "Drag " + name + " to reorder", exact: true });
  const source = handle("Bookmarks");
  const target = handle("Gmail");
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error("Missing sidebar drag handles");
  }
  await source.hover();
  await settings.mouse.down();
  await settings.mouse.move(from.x + from.width / 2 - 10, from.y + from.height / 2, { steps: 4 });
  await expect(source.locator("..")).toHaveCSS("opacity", "0.55");
  await settings.mouse.move(to.x + 8, to.y + to.height / 2, { steps: 24 });
  await settings.mouse.up();
  const rail = () => ggmail.renderer.getByRole("navigation", { name: "Workspace apps" });
  const first = () => rail().getByRole("button").first();
  await expect(first()).toHaveAccessibleName("Bookmarks");
  await expect(settings.getByRole("button", { name: "Restore defaults" })).toBeEnabled();
  await ggmail.relaunch();
  await expect(first()).toHaveAccessibleName("Bookmarks");
  const opening = ggmail.renderer.context().waitForEvent("page");
  await first().click();
  const popup = await opening;
  await expect(popup.getByRole("heading", { name: "Bookmarks", exact: true })).toBeVisible();
  const top = await first().evaluate((el) => el.getBoundingClientRect().top);
  const popupY = await ggmail.app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const main = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("main.html"),
    );
    const view = main?.contentView.children.find(
      (v) => v instanceof WebContentsView && v.webContents.getURL().includes("bookmarks.html"),
    );
    return view?.getBounds().y;
  });
  expect(Math.abs((popupY ?? -100) - top)).toBeLessThanOrEqual(8);
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Sidebar");
  await handle("Gmail").focus();
  await settings.keyboard.press("Space");
  await settings.keyboard.press("ArrowLeft");
  await settings.keyboard.press("Space");
  await expect(first()).toHaveAccessibleName("Mail");
});
