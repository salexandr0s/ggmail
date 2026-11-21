/*
 * Settings is the densest surface the tests can reach: nearly every route is
 * `ConfigSwitchField` and `ConfigSelectField` over a config key, and none of it
 * needs a Gmail account.
 */
import { expect, type Locator, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useApp } from "./lib/app";
import { setMinimumWindowWidth } from "./lib/page-fit";
import { configSwitch, openSettingsPage, readSettingsPageLabels } from "./lib/settings";

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
    const activePage = settings.getByTestId("settings-nav").locator('[aria-current="page"]');
    await expect(selected).toBeVisible();
    await expect(activePage).toHaveCSS(
      "background-color",
      await selected.evaluate((item) => getComputedStyle(item).backgroundColor),
    );
    await settings.keyboard.press("Escape");
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
