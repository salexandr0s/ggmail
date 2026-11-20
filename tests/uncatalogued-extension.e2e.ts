import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

// Well formed, so the cleanup deletes by it, and in no catalog
const UNCATALOGUED_EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

function seededPaths(userDataDir: string) {
  return {
    packageDir: path.join(userDataDir, "extensions", UNCATALOGUED_EXTENSION_ID),
    // The worker runs in the default session, whose storage path is `userData`
    storageDir: path.join(userDataDir, "Local Extension Settings", UNCATALOGUED_EXTENSION_ID),
  };
}

async function exists(filePath: string) {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

const ggmail = useApp(async ({ userDataDir }) => {
  const { packageDir, storageDir } = seededPaths(userDataDir);

  await mkdir(path.join(packageDir, "1.0.0"), { recursive: true });
  await writeFile(path.join(packageDir, "1.0.0", "manifest.json"), "{}");

  await mkdir(storageDir, { recursive: true });
  await writeFile(path.join(storageDir, "000003.log"), "");

  await writeFile(
    path.join(userDataDir, "extension-permissions.json"),
    JSON.stringify({ [UNCATALOGUED_EXTENSION_ID]: ["notifications"] }),
  );

  return { "extensions.installed": [UNCATALOGUED_EXTENSION_ID] };
});

test("removes an installed extension the catalog doesn't offer", async () => {
  const { packageDir, storageDir } = seededPaths(ggmail.userDataDir);

  await expect.poll(async () => (await ggmail.readConfig())["extensions.installed"]).toEqual([]);

  expect(await exists(packageDir)).toBe(false);
  expect(await exists(storageDir)).toBe(false);
  expect(
    JSON.parse(await readFile(path.join(ggmail.userDataDir, "extension-permissions.json"), "utf8")),
  ).toEqual({});
});
