import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { configSwitch, openSettingsPage } from "./lib/settings";

const ggmail = useApp();

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

test("the Do Not Disturb button follows its setting, and turns Do Not Disturb off when hidden", async () => {
  // Found by the title it toggles between, which is what a user reads off it
  // and the only thing distinguishing it from the other icon buttons beside it.
  const doNotDisturbButton = ggmail.renderer.getByRole("button", {
    name: /Turn Do Not Disturb (on|off)/,
  });

  await expect(doNotDisturbButton).toHaveCount(1);

  await doNotDisturbButton.click();

  await expect.poll(async () => (await ggmail.readConfig())["doNotDisturb.enabled"]).toBe(true);

  await setShowDoNotDisturbButton(false);

  await expect(doNotDisturbButton).toHaveCount(0);

  await expect.poll(async () => (await ggmail.readConfig())["doNotDisturb.enabled"]).toBe(false);

  await setShowDoNotDisturbButton(true);

  await expect(doNotDisturbButton).toHaveCount(1);

  /*
   * Bringing the button back is not bringing Do Not Disturb back: what was
   * turned off stays off, and the button comes back reading Turn Do Not
   * Disturb on.
   */
  expect((await ggmail.readConfig())["doNotDisturb.enabled"]).toBe(false);
});
