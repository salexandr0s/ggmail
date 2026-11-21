import { expect, mock, test } from "bun:test";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";

const launchFixture = spawn;
const invocations: string[][] = [];
mock.module("node:fs/promises", () => ({ ...fs, access: async () => {} }));
mock.module("node:child_process", () => ({
  spawn(_file: string, args: string[]) {
    invocations.push(args);
    let result: unknown;
    if (args.includes("status")) {
      result = {
        loggedIn: true,
        authMethod: "claude.ai",
        apiProvider: "firstParty",
        accountId: "fixture",
      };
    } else if (args.includes("--input-format")) {
      const models = [
        { value: "default", displayName: "Default", resolvedModel: "claude-opus-5-5" },
        {
          value: "opus",
          displayName: "Opus",
          resolvedModel: "claude-opus-5-5",
          supportedEffortLevels: ["low", "xhigh", "max"],
        },
        { value: "haiku", displayName: "Haiku 4.5", supportsEffort: false },
      ];
      result = {
        type: "control_response",
        response: { request_id: "catalog", response: { models } },
      };
    } else {
      result = {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: { text: "Ready", calls: [] },
      };
    }
    return launchFixture(
      process.execPath,
      [
        "-e",
        "process.stdin.resume(); process.stdin.on('end', () => console.log(process.argv[1]));",
        JSON.stringify(result),
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
  },
}));
const { cliIdentity, cliModels, claudeCliReply } = await import("./claude-cli");

test("a generic CLI alias shows its resolved version and passes the chosen effort to Claude", async () => {
  const [accountDefault, opus, haiku] = await cliModels();
  if (!accountDefault || !opus || !haiku) {
    throw new Error("Missing fixture model");
  }
  expect(accountDefault.label).toBe("Default (Opus 5.5)");
  expect(opus).toMatchObject({
    id: "opus",
    label: "Claude Opus 5.5",
    resolvedId: "claude-opus-5-5",
    efforts: ["low", "xhigh", "max"],
  });
  expect(haiku.efforts).toEqual([]);
  const { fingerprint } = await cliIdentity();
  const options = {
    model: opus.resolvedId ?? opus.id,
    instructions: "",
    input: [],
    tools: [],
    signal: new AbortController().signal,
    onText() {},
  };
  await claudeCliReply({ ...options, effort: "xhigh" }, fingerprint);
  expect(invocations.at(-1)?.slice(-4)).toEqual([
    "--model",
    "claude-opus-5-5",
    "--effort",
    "xhigh",
  ]);
  await claudeCliReply(options, fingerprint);
  expect(invocations.at(-1)).not.toContain("--effort");
});
