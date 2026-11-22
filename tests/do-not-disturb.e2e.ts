import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { configSwitch, openSettingsPage } from "./lib/settings";

const ggmail = useApp({}, { args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] });

/**
 * Flips Show Do Not Disturb button from the settings page and comes back to the
 * titlebar, having waited for the write.
 *
 * The config on disk is polled before settings is closed, so a failure
 * afterwards is the titlebar and not a write that had yet to land.
 */
async function setShowDoNotDisturbButton(shown: boolean) {
  const settings = await ggmail.openSettings();

  await openSettingsPage(settings, "Appearance");

  await configSwitch(settings, "doNotDisturb.showTitlebarButton").click();

  await expect
    .poll(async () => (await ggmail.readConfig())["doNotDisturb.showTitlebarButton"])
    .toBe(shown);

  await ggmail.closeSettings();
}

test("Do Not Disturb is available in View and shows an indicator while active", async () => {
  const indicator = ggmail.renderer.getByTitle("Turn Do Not Disturb off");
  await expect(indicator).toHaveCount(0);
  expect(await ggmail.runMenuCommand("Turn Do Not Disturb on")).toBe(true);
  await expect(indicator).toBeVisible();
  await setShowDoNotDisturbButton(false);
  await expect(indicator).toHaveCount(0);
  expect((await ggmail.readConfig())["doNotDisturb.enabled"]).toBe(true);
  await setShowDoNotDisturbButton(true);
  await indicator.click();
  await expect(indicator).toHaveCount(0);
  await expect.poll(async () => (await ggmail.readConfig())["doNotDisturb.enabled"]).toBe(false);
});

test("an expired pause clears when the Mac or PC wakes", async () => {
  await ggmail.renderer.evaluate(() =>
    window.electron.ipcRenderer.invoke("config.setConfig", {
      "doNotDisturb.enabled": true,
      "doNotDisturb.duration": "5m",
      "doNotDisturb.until": Date.now() - 1,
    }),
  );
  await ggmail.app.evaluate(({ powerMonitor }) => powerMonitor.emit("resume"));
  await expect
    .poll(() => ggmail.readConfig())
    .toMatchObject({
      "doNotDisturb.enabled": false,
      "doNotDisturb.duration": null,
      "doNotDisturb.until": null,
    });
});
