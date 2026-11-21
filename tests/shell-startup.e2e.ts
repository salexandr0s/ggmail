import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const ggmail = useApp({}, { gmailStandInDelay: 10000 });

test("a single mailbox opened before Gmail loads still has a route back from a library", async () => {
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeHidden();
  await page.getByRole("button", { name: "Go forward" }).click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeVisible();
  const mail = page
    .getByRole("navigation", { name: "Mail views" })
    .getByRole("button", { name: "Mail", exact: true });
  await mail.click();
  await expect(mail).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeHidden();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeVisible();
});
