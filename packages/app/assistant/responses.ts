import { t } from "@lingui/core/macro";
import type { AssistantModel } from "@ggmail/shared/assistant";
import { ms } from "@ggmail/shared/ms";
import { z } from "zod";
import { openAIRequest, readJson } from "./http";

// oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
const api = "https://api.openai.com/v1/";

export class AssistantError extends Error {}

class UnauthorizedError extends AssistantError {}

export function isUnauthorized(error: unknown) {
  return error instanceof UnauthorizedError;
}

function providerError(status: number, code?: string | null) {
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

async function checkResponse(response: Response) {
  if (response.ok) {
    return;
  }

  const parsed = z
    .object({
      error: z.object({ code: z.string().nullish() }).optional(),
    })
    .safeParse(await readJson(response, 65_536).catch(() => null));

  throw providerError(response.status, parsed.data?.error?.code);
}

export async function listModels(token: string): Promise<AssistantModel[]> {
  const response = await openAIRequest(new URL("models", api), {
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
type FunctionCall = z.infer<typeof functionCallSchema>;

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
    properties: Record<string, { type: "string" }>;
    required: string[];
    additionalProperties: false;
  };
};

const eventSchema = z.object({
  type: z.string(),
  delta: z.string().optional(),
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

async function* responseEvents(body: ReadableStream<Uint8Array>) {
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
        throw new AssistantError(t`ChatGPT returned a response that is too large.`);
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
          yield eventSchema.parse(JSON.parse(data));
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
) {
  const streamedItems: unknown[] = [];
  let text = "";

  for await (const event of responseEvents(body)) {
    if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
      text += event.delta ?? "";
      if (text.length > 64_000) {
        throw new AssistantError(t`ChatGPT returned a response that is too large.`);
      }
      onText(text);
    } else if (event.type === "response.output_item.done") {
      streamedItems.push(event.item);
    } else if (event.type === "response.failed" || event.type === "error") {
      throw providerError(0, event.code ?? event.response?.error?.code);
    } else if (event.type === "response.incomplete") {
      throw new AssistantError(
        t`The ChatGPT reply was incomplete. Try again with a shorter request.`,
      );
    } else if (event.type === "response.completed" && event.response?.status === "completed") {
      const terminalItems = event.response.output;
      const items = z
        .array(outputSchema)
        .max(64)
        .parse(terminalItems?.length ? terminalItems : streamedItems);
      const calls: FunctionCall[] = [];
      const sections: string[] = [];

      for (const item of items) {
        if (item.type === "function_call") {
          calls.push(item);
        }
        if (item.type === "message") {
          sections.push(
            item.content
              .map((part) => (part.type === "output_text" ? part.text : part.refusal))
              .join("\n"),
          );
        }
      }

      return { items, calls, text: sections.join("\n\n") || text };
    }
  }

  throw new AssistantError(t`The connection to ChatGPT ended before the reply finished.`);
}

export async function respond(options: {
  token: string;
  model: string;
  instructions: string;
  input: ResponseInput[];
  tools: AssistantTool[];
  signal: AbortSignal;
  onText: (text: string) => void;
}) {
  const response = await openAIRequest(
    new URL("responses", api),
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
        input: options.input,
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
        include: ["reasoning.encrypted_content"],
        tools: [
          {
            type: "namespace",
            name: "ggmail",
            // oxlint-disable-next-line lingui/no-unlocalized-strings -- OpenAI endpoint or request protocol text.
            description:
              // oxlint-disable-next-line lingui/no-unlocalized-strings -- Request protocol text sent to the model.
              "Search Gmail in the current scope and prepare editable draft suggestions.",
            tools: options.tools,
          },
        ],
        store: false,
        stream: true,
      }),
      signal: options.signal,
    },
    ms("2 minutes"),
  );
  await checkResponse(response);

  if (!response.body) {
    throw new AssistantError(t`ChatGPT returned an empty response.`);
  }

  return readResponseStream(response.body, options.onText);
}
