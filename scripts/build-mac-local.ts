import path from "node:path";
import { Arch, build, Platform } from "electron-builder";
import { SIGNING_ENV_VARS } from "./signing-env";

if (process.platform !== "darwin") {
  throw new Error("The local macOS build requires macOS.");
}

const projectDir = path.resolve(import.meta.dir, "..");
const appOutDir = path.join(projectDir, "dist", "mac-arm64");
const appPath = path.join(appOutDir, "ggmail.app");
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
  config: { mac: { identity: "-", notarize: false } },
});

await run("codesign", "--verify", "--deep", "--strict", appPath);

console.log(`Built ${appPath}`);
