import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const ggmail = useApp();

test("the packaged changelog opens offline", async () => {
  const settings = await ggmail.openSettings();
  await settings.context().setOffline(true);
  await openSettingsPage(settings, "What's new");
  await expect(settings.getByRole("heading", { name: "Changelog" })).toBeVisible();
});
