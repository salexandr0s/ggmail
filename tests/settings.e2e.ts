/*
 * Settings is the densest surface the tests can reach: nearly every route is
 * `ConfigSwitchField` and `ConfigSelectField` over a config key, and none of it
 * needs a Gmail account.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { configSwitch, openSettingsPage, readSettingsPageLabels } from "./lib/settings";

const ggmail = useApp();

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

  await openSettingsPage(settings, "Updates");

  const releaseChannel = settings.locator('[id="updates.channel"]');

  await releaseChannel.click();

  await settings.getByRole("option", { name: "Beta" }).click();

  const confirmation = settings.getByRole("dialog");

  await expect(confirmation).toContainText("Switch to the beta channel?");

  await confirmation.getByRole("button", { name: "Cancel" }).click();

  // The field goes on rendering the value from the config while the dialog is
  // open, so cancelling is meant to leave nothing to revert. Contained rather
  // than equal, because the trigger renders its own chevron alongside the value.
  await expect(releaseChannel).toContainText("Stable");

  expect((await ggmail.readConfig())["updates.channel"]).toBe("stable");

  await releaseChannel.click();

  await settings.getByRole("option", { name: "Beta" }).click();

  // Changing the channel sends the updater off to check the new feed. That call
  // is fire and forget, and the app already makes one like it on every launch.
  await confirmation.getByRole("button", { name: "Switch to beta" }).click();

  await expect.poll(async () => (await ggmail.readConfig())["updates.channel"]).toBe("beta");
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
