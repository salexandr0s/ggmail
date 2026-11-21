import path from "node:path";
import { Arch, build, Platform } from "electron-builder";
import { SIGNING_ENV_VARS } from "./signing-env";

if (process.platform !== "darwin") {
  throw new Error("The local macOS build requires macOS.");
}

const projectDir = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== "--install" && arg !== "--adhoc")) {
  throw new Error("Usage: build-mac-local.ts [--install | --adhoc]");
}
const adhoc = args.includes("--adhoc");
const output = adhoc ? "dist/adhoc" : "dist";
const appOutDir = path.join(projectDir, output, "mac-arm64");
const appPath = path.join(appOutDir, "ggmail.app");
// The published ggmail builds share this Developer ID requirement. It survives
// certificate renewal within the team and is also how Keychain recognizes an update.
const team = "97MH8853HX";
const requirement = [
  'identifier "com.github.salexandr0s.ggmail"',
  "anchor apple generic",
  "certificate 1[field.1.2.840.113635.100.6.2.6] exists",
  "certificate leaf[field.1.2.840.113635.100.6.1.13] exists",
  `certificate leaf[subject.OU] = "${team}"`,
].join(" and ");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
  GGMAIL_PSEUDO_LOCALE_CATALOG: "",
};

for (const key of SIGNING_ENV_VARS.mac) {
  // Empty values stop nested Bun commands from reloading these from .env.
  env[key] = "";
}

async function run(...command: string[]) {
  const child = Bun.spawn(command, {
    cwd: projectDir,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited with code ${exitCode}.`);
  }
}

await run(process.execPath, "--no-env-file", "run", "build:js");

Object.assign(process.env, env);
for (const key of SIGNING_ENV_VARS.mac) {
  // electron-builder treats an empty CSC_LINK as a certificate path.
  delete process.env[key];
}

process.chdir(projectDir);
// The API avoids the CLI reloading signing values from electron-builder.env.
await build({
  projectDir,
  targets: Platform.MAC.createTarget("dir", Arch.arm64),
  publish: "never",
  config: {
    directories: { output },
    forceCodeSigning: !adhoc,
    mac: { identity: adhoc ? "-" : `(${team})`, notarize: false },
  },
});

await run(
  "codesign",
  "--verify",
  "--deep",
  "--strict",
  ...(adhoc ? [] : [`-R=${requirement}`]),
  appPath,
);

console.log(`Built ${appPath}`);

if (args.includes("--install")) {
  await run("swift", "scripts/install-mac-local.swift", appPath, requirement);
}
