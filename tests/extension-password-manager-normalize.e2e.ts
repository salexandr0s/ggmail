/*
 * A config listing two password managers, which a version of ggmail without the
 * one-at-a-time rule can leave behind in a shared profile, is down to the one
 * installed last by the time the app is up. Bitwarden is listed after
 * 1Password, the reverse of catalog order, so keeping it shows the rule is the
 * install order rather than the catalog's.
 *
 * Each extension's storage is seeded as a directory standing in for what it
 * wrote, so the test can see the uninstall clear one and keep the other.
 * `GGMAIL_EXTENSIONS_FIXTURE` keeps the loader from looking for packages, since
 * nothing is installed on disk.
 */
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { BITWARDEN_EXTENSION_ID, ONEPASSWORD_EXTENSION_ID } from "@ggmail/shared/extensions";
import { expect, test } from "@playwright/test";
import { type GgmailApp, type SeedConfig, useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

function extensionStoragePath(userDataDir: string, extensionId: string) {
  return path.join(userDataDir, "Local Extension Settings", extensionId);
}

function seedTwoPasswordManagers(extensionsEnabled: boolean): SeedConfig {
  return async ({ userDataDir }) => {
    for (const extensionId of [ONEPASSWORD_EXTENSION_ID, BITWARDEN_EXTENSION_ID]) {
      await mkdir(extensionStoragePath(userDataDir, extensionId), { recursive: true });
    }

    return {
      "extensions.enabled": extensionsEnabled,
      "extensions.installed": [ONEPASSWORD_EXTENSION_ID, BITWARDEN_EXTENSION_ID],
    };
  };
}

async function exists(filePath: string) {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

async function expectOnlyBitwardenLeft(ggmail: GgmailApp) {
  await expect
    .poll(async () => (await ggmail.readConfig())["extensions.installed"])
    .toEqual([BITWARDEN_EXTENSION_ID]);

  expect(await exists(extensionStoragePath(ggmail.userDataDir, ONEPASSWORD_EXTENSION_ID))).toBe(
    false,
  );

  expect(await exists(extensionStoragePath(ggmail.userDataDir, BITWARDEN_EXTENSION_ID))).toBe(true);
}

test.describe("with the master switch on", () => {
  const ggmail = useApp(seedTwoPasswordManagers(true), {
    env: { GGMAIL_EXTENSIONS_FIXTURE: "1" },
  });

  test("keeps the password manager installed last, and settings shows only it on", async () => {
    await expectOnlyBitwardenLeft(ggmail);

    const settings = await ggmail.openSettings();

    await openSettingsPage(settings, "Extensions");

    await expect(settings.getByRole("switch", { name: "Install Bitwarden" })).toBeChecked();

    await expect(settings.getByRole("switch", { name: "Install 1Password" })).not.toBeChecked();
  });
});

test.describe("with the master switch off and no license", () => {
  const ggmail = useApp(seedTwoPasswordManagers(false), {
    env: { GGMAIL_EXTENSIONS_FIXTURE: "1" },
  });

  test("keeps the password manager installed last all the same", async () => {
    await expectOnlyBitwardenLeft(ggmail);
  });
});
