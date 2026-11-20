import { expect, test, type Locator, type Page } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const ggmail = useApp({
  accounts: [
    { ...seedAccount({ id: "personal", label: "Personal 🏠" }), color: "green" },
    seedAccount({ id: "work", label: "Work", selected: false }),
  ],
});

const image = {
  name: "logo.svg",
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480"><rect width="480" height="480" fill="#008000"/></svg>',
  ),
};

async function openSettings() {
  const settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Accounts");
  return settings;
}

async function editPersonal(settings: Page) {
  const row = settings.locator('[data-slot="item"]').filter({ hasText: "Personal 🏠" });
  await row.getByRole("button", { name: "Account actions" }).click();
  await settings.getByRole("menuitem", { name: "Edit account…" }).click();
  return settings.getByRole("dialog");
}

async function chooseImage(dialog: Locator, file: string | typeof image = image) {
  const chooser = dialog.page().waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Choose image" }).click();
  await (await chooser).setFiles(file);
  const preview = dialog.locator("img");
  await expect(preview).toHaveAttribute("src", /^data:image\/png;base64,/);
  return preview;
}

test("an account logo is resized, saved beside its label, and removable after relaunch", async () => {
  const settings = await openSettings();
  const dialog = await editPersonal(settings);
  const preview = await chooseImage(dialog);
  const { savedLogo, width, height } = await preview.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    return { savedLogo: element.src, width: element.naturalWidth, height: element.naturalHeight };
  });
  expect([width, height]).toEqual([48, 24]);

  await dialog.getByLabel("Logo", { exact: true }).setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid image"),
  });
  await expect(dialog.getByRole("alert")).toHaveText("Couldn’t read this image. Try another file.");
  await expect(preview).toHaveAttribute("src", savedLogo);

  await dialog.getByRole("button", { name: "Save" }).click();
  await ggmail.closeSettings();
  const personalTab = () => ggmail.renderer.getByRole("button", { name: "Personal 🏠" });
  await expect(personalTab().locator("img")).toHaveAttribute("src", savedLogo);
  await expect(personalTab().locator(".bg-green-500")).toBeVisible();
  await expect(ggmail.renderer.getByRole("button", { name: "Work" }).locator("img")).toHaveCount(0);

  await ggmail.relaunch();
  await expect(personalTab().locator("img")).toHaveAttribute("src", savedLogo);
  const reopened = await openSettings();
  const edit = await editPersonal(reopened);
  await edit.getByRole("button", { name: "Remove logo" }).click();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await editPersonal(reopened);
  await expect(edit.locator("img")).toHaveAttribute("src", savedLogo);
  await edit.getByRole("button", { name: "Remove logo" }).click();
  await edit.getByRole("button", { name: "Save" }).click();
  await ggmail.closeSettings();
  await expect(personalTab().locator("img")).toHaveCount(0);
});

test("adding an account applies its chosen logo to the new tab", async () => {
  const settings = await openSettings();
  await settings.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = settings.getByRole("dialog");
  const color = await dialog.getByLabel("Color", { exact: true }).boundingBox();
  const picker = await dialog.getByRole("button", { name: "Choose image" }).boundingBox();
  if (!color || !picker) {
    throw new Error("Color and logo controls must both be visible");
  }
  expect(Math.abs(picker.y - color.y)).toBeLessThan(color.height / 2);
  expect(picker.x).toBeGreaterThan(color.x + color.width);
  await dialog.getByLabel("Label", { exact: true }).fill("Studio");
  await chooseImage(dialog, "build/icons/512x512.png");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    ggmail.renderer.getByRole("button", { name: "Studio" }).locator("img"),
  ).toBeVisible();
});
