import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: [
    "desktop.e2e.ts",
    "gmail-dark-theme.e2e.ts",
    "account-logo.e2e.ts",
    "mail-assistant.e2e.ts",
    "attachments.e2e.ts",
    "unified-search.e2e.ts",
  ],
  workers: 1,
  timeout: 60000,
  expect: { timeout: 5000 },
  reporter: "list",
  fullyParallel: false,
});
