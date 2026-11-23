import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { assistantEffortSchema, type AssistantModel } from "@ggmail/shared/assistant";
import { ms } from "@ggmail/shared/ms";
import { t } from "@lingui/core/macro";
import { z } from "zod";
import { ClaudeCliStream } from "./claude-cli-stream";
import { AssistantError, type FunctionCall, type ResponseOptions } from "./responses";

/* oxlint-disable lingui/no-unlocalized-strings -- Claude model names, flags and installation paths. */
const legacyModels: AssistantModel[] = [
  { id: "default", label: "Claude Code" },
  { id: "sonnet", label: "Claude Sonnet" },
  { id: "opus", label: "Claude Opus" },
  { id: "haiku", label: "Claude Haiku" },
];

const isolation = [
  "--safe-mode",
  "--setting-sources",
  "",
  "--settings",
  '{"disableAllHooks":true,"enabledPlugins":{}}',
  "--disable-slash-commands",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--no-chrome",
];

async function executable() {
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  const directories = [
    path.join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...(process.env.PATH ?? "").split(path.delimiter),
  ];
  /* oxlint-enable lingui/no-unlocalized-strings */
  for (const dir of directories.filter((dir) => path.isAbsolute(dir))) {
    const file = path.join(dir, name);
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {
      /* Try the next installation directory. */
    }
  }
  throw new AssistantError(t`Install Claude Code on this computer, then try again.`);
}

// Web search is the only built-in tool a mail turn may use. It reads the web
// through the provider and cannot run commands, read files or fetch a chosen URL.
// oxlint-disable-next-line lingui/no-unlocalized-strings -- Claude Code tool name.
const webSearch = "WebSearch";

async function runCLI(
  args: string[],
  signal?: AbortSignal,
  input?: string,
  stream?: ClaudeCliStream,
  web = false,
) {
  const catalogOnly = args.includes("--input-format");
  const file = await executable();
  const dir = await mkdtemp(path.join(tmpdir(), "ggmail-claude-"));
  try {
    const env: NodeJS.ProcessEnv = {
      HOME: homedir(),
      TMPDIR: dir,
      TEMP: dir,
      TMP: dir,
      PATH: process.env.PATH,
      LANG: process.env.LANG,
      USER: process.env.USER,
      SystemRoot: process.env.SystemRoot,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
      // The CLI counts its model catalog as nonessential traffic. Only initialization
      // may refresh it. Respect local opt-outs and keep every mail turn isolated.
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: catalogOnly
        ? process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
        : "1",
      DISABLE_TELEMETRY: process.env.DISABLE_TELEMETRY,
      DISABLE_ERROR_REPORTING: "1",
      DISABLE_AUTOUPDATER: "1",
    };
    // Keep mail on stdin and out of process arguments. Never return raw CLI diagnostics.
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Claude Code flags.
    const tools = web ? ["--tools", webSearch, "--allowedTools", webSearch] : ["--tools", ""];
    const child = spawn(file, [...isolation, ...tools, ...args], {
      cwd: dir,
      env,
      windowsHide: true,
      timeout: stream ? ms("3 minutes") : ms("15 seconds"),
      signal,
      killSignal: "SIGKILL",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const exited = new Promise<number | null>((resolve) => {
      child.on("error", () => {
        // Node emits close after a spawn failure or abort.
      });
      child.once("close", resolve);
    });
    child.stdin.on("error", () => {
      // The process may exit before reading stdin.
    });
    child.stdin.end(input);
    let output = "";
    let bytes = 0;
    try {
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Subprocess output encoding.
      for await (const chunk of child.stdout.setEncoding("utf8")) {
        signal?.throwIfAborted();
        if (typeof chunk !== "string") {
          throw new Error();
        }
        bytes += Buffer.byteLength(chunk);
        // NDJSON adds an event envelope for each token. Discard each frame
        // once decoded; auth status remains a single bounded JSON document.
        if (bytes > (stream ? 16_777_216 : 2_097_152)) {
          throw new AssistantError(t`The AI provider returned a response that is too large.`);
        }
        if (stream) {
          stream.write(chunk);
        } else {
          output += chunk;
        }
      }
      const code = await exited;
      signal?.throwIfAborted();
      if (code !== 0 && !(args.includes("status") && code === 1 && output)) {
        throw new AssistantError(
          t`Claude Code couldn't complete the request. Check your sign-in, CLI version, and usage limits.`,
        );
      }
      if (stream) {
        return stream.finish();
      }
      if (catalogOnly) {
        for (const line of output.trim().split("\n")) {
          const frame = JSON.parse(line);
          if (frame.type === "control_response" && frame.response?.request_id === "catalog") {
            return frame.response.response?.models as unknown;
          }
        }
        return undefined;
      }
      return JSON.parse(output) as unknown;
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      await exited;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Initialize the local CLI without sending a user turn. It resolves aliases and account-specific models.
export async function cliModels(): Promise<AssistantModel[]> {
  try {
    const result = await runCLI(
      [
        "--print",
        "--no-session-persistence",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
      ],
      undefined,
      JSON.stringify({
        type: "control_request",
        request_id: "catalog",
        request: { subtype: "initialize" },
      }) + "\n",
    );
    const catalog = z
      .array(
        z.object({
          value: z.string().min(1).max(128),
          displayName: z.string().min(1).max(180),
          resolvedModel: z.string().min(1).max(128).nullish(),
          supportedEffortLevels: z.array(z.string()).optional(),
          supportsEffort: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(512)
      .parse(result);
    return catalog.map(
      ({ value, displayName, resolvedModel, supportedEffortLevels, supportsEffort }) => {
        const version =
          /^claude-(opus|fable|sonnet|haiku|mythos)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(
            resolvedModel ?? "",
          );
        const family = version?.[1];
        const resolvedName =
          family && version?.[2]
            ? `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version[2]}${version[3] ? "." + version[3] : ""}`
            : undefined;
        const name = resolvedName ?? displayName;
        const label =
          value === "default" && resolvedName
            ? t`Default (${resolvedName})`
            : /^(Opus|Sonnet|Haiku|Fable|Mythos)\b/.test(name)
              ? // oxlint-disable-next-line lingui/no-unlocalized-strings -- Provider model name.
                `Claude ${name}`
              : displayName;
        return {
          id: value,
          label,
          resolvedId: resolvedModel ?? undefined,
          efforts:
            supportsEffort === false
              ? []
              : assistantEffortSchema.options.filter((level) =>
                  supportedEffortLevels?.includes(level),
                ),
        };
      },
    );
  } catch {
    // Older CLI versions still accept the original model aliases.
    return legacyModels;
  }
}

export async function cliIdentity(signal?: AbortSignal) {
  const result = z
    .object({
      loggedIn: z.boolean(),
      authMethod: z.string().nullish(),
      apiProvider: z.string().nullish(),
      email: z.string().max(320).nullish(),
      orgId: z.string().nullish(),
      accountId: z.string().nullish(),
    })
    .parse(await runCLI(["auth", "status", "--json"], signal));
  if (
    !result.loggedIn ||
    result.authMethod !== "claude.ai" ||
    result.apiProvider !== "firstParty" ||
    !(result.email || result.accountId)
  ) {
    throw new AssistantError(
      t`Sign in to your subscription with “claude auth login” in a terminal, then connect here.`,
    );
  }
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Node hash algorithm.
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([result.email, result.orgId, result.accountId]))
    .digest("hex");
  return { fingerprint, email: result.email ?? undefined };
}

export async function claudeCliReply(options: ResponseOptions, fingerprint: string) {
  if ((await cliIdentity(options.signal)).fingerprint !== fingerprint) {
    throw new AssistantError(t`The Claude Code account changed. Reconnect in AI settings.`);
  }
  const schema = z.object({
    text: z.string().max(64_000),
    calls: options.tools.length
      ? z
          .array(
            z.object({
              name: z.enum(options.tools.map((tool) => tool.name)),
              arguments: z.string().max(24_000),
            }),
          )
          .max(12)
      : z.tuple([]),
  });
  const args = [
    "--print",
    "--no-session-persistence",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--system-prompt",
    options.instructions +
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Structured output protocol for the model.
      "\nReturn the answer as text and an empty calls array, or request the listed ggmail actions using JSON-encoded arguments. Use the results to request further reads as needed. Finish with the answer when you have the evidence.",
    "--json-schema",
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- JSON Schema dialect accepted by the CLI.
    JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" })),
  ];
  if (options.model !== "default") {
    args.push("--model", options.model);
  }
  if (options.effort) {
    args.push("--effort", options.effort);
  }
  // Claude Code can expand @file references in user prompts, including mail addresses.
  const input = JSON.stringify({ history: options.input, actions: options.tools }).replaceAll(
    "@",
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- JSON escape for the at sign.
    "\\u0040",
  );
  const envelope = z
    .object({
      subtype: z.literal("success"),
      is_error: z.literal(false),
      structured_output: schema,
    })
    .safeParse(
      await runCLI(
        args,
        options.signal,
        input,
        new ClaudeCliStream(options.onText, options.web?.onSearch),
        Boolean(options.web),
      ),
    );
  if (!envelope.success) {
    throw new AssistantError(t`Claude Code returned an incomplete reply. Try again.`);
  }
  const { calls: requested, text } = envelope.data.structured_output;
  const calls: FunctionCall[] = requested.map((call) => ({
    ...call,
    type: "function_call",
    namespace: "ggmail",
    call_id: randomUUID(),
  }));
  return { text, calls, items: calls };
}
