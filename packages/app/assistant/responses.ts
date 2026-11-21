import type { ApiProvider, AssistantModel } from "@ggmail/shared/assistant";
import { ms } from "@ggmail/shared/ms";
import { t } from "@lingui/core/macro";
import { z } from "zod";
import { providerRequest, readJson } from "./http";

// oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
const api = "https://api.openai.com/v1/";
const endpoints = {
  openai: api,
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Fixed API endpoint.
  deepseek: "https://api.deepseek.com/",
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Fixed API endpoint.
  anthropic: "https://api.anthropic.com/v1/",
};
type ResponsesProvider = "openai" | "deepseek" | "chatgpt";

export class AssistantError extends Error {}

class UnauthorizedError extends AssistantError {}

export function isUnauthorized(error: unknown) {
  return error instanceof UnauthorizedError;
}

function providerError(
  status: number,
  provider: ResponsesProvider | "anthropic",
  code?: string | null,
) {
  if (provider !== "chatgpt") {
    if (status === 401 || status === 403) {
      return new UnauthorizedError(t`Check the API key and its permissions in AI settings.`);
    }
    if (status === 402 || status === 429) {
      return new AssistantError(t`Check your provider's balance or usage limits and try again.`);
    }
    return new AssistantError(t`The AI provider couldn't complete the request. Try again.`);
  }
  if (status === 401) {
    return new UnauthorizedError(t`Your ChatGPT session expired. Sign in again.`);
  }
  if (status === 429 || code === "subscription_sharing_usage_limit_exceeded") {
    return new AssistantError(t`Your ChatGPT usage limit was reached. Try again later.`);
  }
  if (status === 403 || code === "subscription_sharing_usage_unavailable") {
    return new AssistantError(
      t`Your ChatGPT account or workspace hasn't enabled plan access for ggmail.`,
    );
  }
  return new AssistantError(t`ChatGPT couldn't complete the request. Try again.`);
}

export async function checkResponse(
  response: Response,
  provider: ResponsesProvider | "anthropic" = "chatgpt",
) {
  if (response.ok) {
    return;
  }

  const parsed = z
    .object({
      error: z.object({ code: z.string().nullish() }).optional(),
    })
    .safeParse(await readJson(response, 65_536).catch(() => null));

  throw providerError(response.status, provider, parsed.data?.error?.code);
}

export async function listModels(token: string): Promise<AssistantModel[]> {
  const response = await providerRequest(new URL("models", api), {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
    headers: { Authorization: `Bearer ${token}` },
  });
  await checkResponse(response);

  const { models } = z
    .object({
      models: z
        .array(
          z.object({
            slug: z.string().min(1).max(128).optional(),
            display_name: z.string().min(1).max(128).optional(),
            visibility: z.string(),
          }),
        )
        .max(512),
    })
    .parse(await readJson(response, 8_388_608));

  return models.flatMap(({ slug, display_name, visibility }) =>
    visibility === "list" && slug && display_name ? [{ id: slug, label: display_name }] : [],
  );
}

const functionCallSchema = z
  .object({
    type: z.literal("function_call"),
    namespace: z.literal("ggmail"),
    call_id: z.string().min(1).max(256),
    name: z.string().min(1).max(64),
    arguments: z.string().max(24_000),
  })
  .passthrough();

const textSchema = z
  .object({
    type: z.literal("message"),
    role: z.literal("assistant"),
    content: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("output_text"), text: z.string().max(64_000) }).passthrough(),
          z.object({ type: z.literal("refusal"), refusal: z.string().max(64_000) }).passthrough(),
        ]),
      )
      .max(24),
  })
  .passthrough();

const outputSchema = z.discriminatedUnion("type", [
  functionCallSchema,
  textSchema,
  z.object({ type: z.literal("reasoning") }).passthrough(),
]);

type Output = z.infer<typeof outputSchema>;
export type FunctionCall = z.infer<typeof functionCallSchema>;

export type ResponseInput =
  | { role: "user" | "assistant"; content: string }
  | Output
  | { type: "function_call_output"; call_id: string; output: string };

export type AssistantTool = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: {
    type: "object";
    properties: Record<string, { type: "string" | "integer" }>;
    required: string[];
    additionalProperties: false;
  };
};

const eventSchema = z.object({
  type: z.string(),
  delta: z.string().optional(),
  output_index: z.int().nonnegative().nullish(),
  content_index: z.int().nonnegative().nullish(),
  item: z.unknown().optional(),
  code: z.string().nullish(),
  response: z
    .object({
      status: z.string().optional(),
      output: z.array(z.unknown()).max(64).optional(),
      error: z.object({ code: z.string().nullish() }).nullish(),
    })
    .optional(),
});

export async function* jsonEventStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }

      bytes += value.byteLength;
      if (bytes > 2_097_152) {
        throw new AssistantError(t`The AI provider returned a response that is too large.`);
      }
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary) {
          break;
        }

        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (data && data !== "[DONE]") {
          yield JSON.parse(data) as unknown;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function readResponseStream(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
  provider: ResponsesProvider = "chatgpt",
) {
  const streamedItems: unknown[] = [];
  const textBlocks: string[][] = [];
  let text = "";

  for await (const frame of jsonEventStream(body)) {
    const event = eventSchema.parse(frame);
    if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
      const output = event.output_index ?? 0;
      const part = event.content_index ?? 0;
      if (output >= 64 || part >= 24) {
        throw new AssistantError(t`The AI provider returned a response that is too large.`);
      }
      const blocks = (textBlocks[output] ??= []);
      blocks[part] = (blocks[part] ?? "") + (event.delta ?? "");
      text = textBlocks.flat().filter(Boolean).join("\n\n");
      if (text.length > 64_000) {
        throw new AssistantError(t`The AI provider returned a response that is too large.`);
      }
      onText(text);
    } else if (event.type === "response.output_item.done") {
      streamedItems.push(event.item);
    } else if (event.type === "response.failed" || event.type === "error") {
      throw providerError(0, provider, event.code ?? event.response?.error?.code);
    } else if (event.type === "response.incomplete") {
      throw new AssistantError(t`The reply was incomplete. Try again with a shorter request.`);
    } else if (event.type === "response.completed" && event.response?.status === "completed") {
      const terminalItems = event.response.output;
      const output = terminalItems?.length ? terminalItems : streamedItems;
      const items = z
        .array(outputSchema)
        .max(64)
        .parse(
          output.map((item) => {
            if (
              provider !== "chatgpt" &&
              item &&
              typeof item === "object" &&
              "type" in item &&
              item.type === "function_call" &&
              (!("namespace" in item) || item.namespace == null)
            ) {
              return { ...item, namespace: "ggmail" };
            }
            return item;
          }),
        );
      const calls: FunctionCall[] = [];
      const sections: string[] = [];

      for (const item of items) {
        if (item.type === "function_call") {
          calls.push(item);
        }
        if (item.type === "message") {
          sections.push(
            ...item.content.map((part) => (part.type === "output_text" ? part.text : part.refusal)),
          );
        }
      }

      return { items, calls, text: sections.filter(Boolean).join("\n\n") || text };
    }
  }

  throw new AssistantError(t`The connection ended before the reply finished.`);
}

export type ResponseOptions = {
  model: string;
  instructions: string;
  input: ResponseInput[];
  tools: AssistantTool[];
  signal: AbortSignal;
  onText: (text: string) => void;
};

export async function respond(
  options: ResponseOptions & { token: string; provider?: ResponsesProvider },
) {
  const provider = options.provider ?? "chatgpt";
  const response = await providerRequest(
    new URL("responses", provider === "deepseek" ? endpoints.deepseek : api),
    {
      method: "POST",
      headers: {
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
        Authorization: `Bearer ${options.token}`,
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        instructions: options.instructions,
        input:
          provider === "chatgpt"
            ? options.input
            : options.input.map((item) => {
                if ("type" in item && item.type === "function_call") {
                  const { namespace: _, ...call } = item;
                  return call;
                }
                return item;
              }),
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
        ...(provider === "deepseek"
          ? { reasoning: { effort: "none" } }
          : // oxlint-disable-next-line lingui/no-unlocalized-strings -- Responses API include field.
            { include: ["reasoning.encrypted_content"], store: false }),
        tools:
          provider === "chatgpt"
            ? [
                {
                  type: "namespace",
                  name: "ggmail",
                  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
                  description:
                    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Request protocol text sent to the model.
                    "Search signed-in Gmail accounts, read conversations and prepare draft suggestions.",
                  tools: options.tools,
                },
              ]
            : options.tools.map(({ strict, ...tool }) =>
                provider === "deepseek" ? tool : { ...tool, strict },
              ),
        stream: true,
      }),
      signal: options.signal,
    },
    ms("2 minutes"),
  );
  await checkResponse(response, provider);

  if (!response.body) {
    throw new AssistantError(t`The AI provider returned an empty response.`);
  }

  return readResponseStream(response.body, options.onText, provider);
}

export function apiHeaders(provider: ApiProvider, key: string): Record<string, string> {
  return provider === "anthropic"
    ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
    : // oxlint-disable-next-line lingui/no-unlocalized-strings -- HTTP authorization scheme.
      { Authorization: `Bearer ${key}` };
}

export async function listApiModels(provider: ApiProvider, key: string): Promise<AssistantModel[]> {
  const url = new URL("models", endpoints[provider]);
  if (provider === "anthropic") {
    url.searchParams.set("limit", "100");
  }
  const models: AssistantModel[] = [];
  for (let page = 0; page < 10; page++) {
    const response = await providerRequest(url, { headers: apiHeaders(provider, key) });
    await checkResponse(response, provider);
    const catalog = z
      .object({
        data: z
          .array(
            z.object({
              id: z.string().min(1).max(128),
              display_name: z.string().max(180).optional(),
              lifecycle: z.string().optional(),
            }),
          )
          .max(2000),
        has_more: z.boolean().optional(),
        last_id: z.string().max(128).nullish(),
      })
      .parse(await readJson(response, 2_097_152));
    for (const entry of catalog.data) {
      if (entry.lifecycle === "retired") {
        continue;
      }
      if (
        provider === "openai" &&
        !/^(?:gpt-(?:4o|4\.1|[56](?:\.\d+)?)(?:-(?:mini|nano|sol|astra|luna))?|o[34](?:-mini)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(
          entry.id,
        )
      ) {
        continue;
      }
      if (provider === "deepseek" && !["deepseek-flash", "deepseek-v4-pro"].includes(entry.id)) {
        continue;
      }
      models.push({ id: entry.id, label: entry.display_name || entry.id });
    }
    if (provider !== "anthropic" || !catalog.has_more || !catalog.last_id) {
      break;
    }
    url.searchParams.set("after_id", catalog.last_id);
  }
  if (!models.length) {
    throw new AssistantError(
      t`No compatible mail assistant models are available for this API key.`,
    );
  }
  return models;
}
