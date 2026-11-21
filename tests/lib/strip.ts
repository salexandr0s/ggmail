import { expect } from "@playwright/test";
import type { GgmailApp } from "./app";

export async function waitForVerticalTabs(ggmail: GgmailApp) {
  await expect(
    ggmail.renderer
      .getByRole("navigation", { name: "Workspace apps" })
      .getByRole("button", { name: "Settings" }),
  ).toBeVisible();
}
