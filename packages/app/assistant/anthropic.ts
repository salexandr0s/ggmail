import { ms } from "@ggmail/shared/ms";
import { t } from "@lingui/core/macro";
import { z } from "zod";
import { providerRequest, readJson } from "./http";
import {
  apiHeaders,
  AssistantError,
  checkResponse,
  jsonEventStream,
  type FunctionCall,
  type ResponseInput,
  type ResponseOptions,
} from "./responses";

export function anthropicMessages(input: ResponseInput[]) {
  const messages: { role: string; content: unknown[] }[] = [];
  function append(role: string, block: unknown) {
    const last = messages.at(-1);
    if (last?.role === role) {
      last.content.push(block);
    } else {
      messages.push({ role, content: [block] });
    }
  }
  for (const item of input) {
    if (!("type" in item)) {
      append(item.role, { type: "text", text: item.content });
    } else if (item.type === "function_call") {
      append("assistant", {
        type: "tool_use",
        id: item.call_id,
        name: item.name,
        input: JSON.parse(item.arguments),
      });
    } else if (item.type === "function_call_output") {
      append("user", { type: "tool_result", tool_use_id: item.call_id, content: item.output });
    } else if (item.type === "reasoning") {
      append("assistant", item.block);
    } else {
      for (const part of item.content) {
        append("assistant", {
          type: "text",
          text: part.type === "output_text" ? part.text : part.refusal,
        });
      }
    }
  }
  return messages;
}

export async function anthropicReply(options: ResponseOptions, key: string) {
  const response = await providerRequest(
    new URL("https://api.anthropic.com/v1/messages"),
    {
      method: "POST",
      signal: options.signal,
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- HTTP media type.
      headers: { ...apiHeaders("anthropic", key), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 8192,
        stream: true,
        system: options.instructions,
        messages: anthropicMessages(options.input),
        tools: options.tools.map(({ name, description, parameters }) => ({
          name,
          description,
          input_schema: parameters,
        })),
      }),
    },
    ms("2 minutes"),
  );
  await checkResponse(response, "anthropic");
  if (response.headers.get("content-type")?.split(";")[0]?.trim() === "application/json") {
    return completedMessage(await readJson(response, 2_097_152));
  }
  if (!response.body) {
    throw new AssistantError(t`The AI provider returned an empty response.`);
  }
  return readAnthropicStream(response.body, options.onText);
}

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(64_000) }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string().min(1).max(256),
    name: z.string().min(1).max(64),
    input: z.record(z.string(), z.unknown()),
  }),
  // The signature arrives separately in streaming mode.
  z.object({ type: z.literal("thinking"), thinking: z.string(), signature: z.string().optional() }),
  z.object({ type: z.literal("redacted_thinking"), data: z.string() }),
]);
const stopReason = z.enum(["end_turn", "tool_use", "stop_sequence", "refusal"]);
const messageSchema = z.object({ stop_reason: stopReason, content: z.array(blockSchema).max(64) });

function incomplete() {
  return new AssistantError(t`The reply was incomplete. Try again with a shorter request.`);
}

function completedMessage(message: unknown) {
  const result = messageSchema.safeParse(message);
  if (!result.success) {
    throw incomplete();
  }
  const calls: FunctionCall[] = [];
  const sections: string[] = [];
  const items: ResponseInput[] = [];
  for (const block of result.data.content) {
    if (block.type === "tool_use") {
      const args = JSON.stringify(block.input);
      if (args.length > 24_000) {
        throw incomplete();
      }
      const call: FunctionCall = {
        type: "function_call",
        namespace: "ggmail",
        name: block.name,
        call_id: block.id,
        arguments: args,
      };
      calls.push(call);
      items.push(call);
    } else if (block.type === "text") {
      if (block.text) {
        sections.push(block.text);
        items.push({ role: "assistant", content: block.text });
      }
    } else {
      if (block.type === "thinking" && !block.signature) {
        throw incomplete();
      }
      items.push({ type: "reasoning", block });
    }
  }
  const hasCalls = calls.length > 0;
  if (hasCalls !== (result.data.stop_reason === "tool_use")) {
    throw incomplete();
  }
  return { calls, items, text: sections.join("\n\n") };
}

const streamEvent = z.object({
  type: z.string(),
  index: z.number().int().nonnegative().optional(),
  content_block: blockSchema.optional(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      partial_json: z.string().optional(),
      thinking: z.string().optional(),
      signature: z.string().optional(),
      stop_reason: z.string().nullish(),
    })
    .optional(),
});

export async function readAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
) {
  const content: z.infer<typeof blockSchema>[] = [];
  let block: z.infer<typeof blockSchema> | undefined;
  let started = false;
  let stop: string | undefined;
  let completedText = "";
  let toolJson = "";
  function showText(text: string) {
    const snapshot = completedText + text;
    if (snapshot.length > 64_000) {
      throw new AssistantError(t`The AI provider returned a response that is too large.`);
    }
    onText(snapshot);
  }

  for await (const frame of jsonEventStream(body)) {
    const { type, index, content_block, delta } = streamEvent.parse(frame);
    switch (type) {
      case "message_start":
        if (started) {
          throw incomplete();
        }
        started = true;
        break;
      case "content_block_start":
        if (
          !started ||
          stop ||
          block ||
          index !== content.length ||
          index >= 64 ||
          !content_block
        ) {
          throw incomplete();
        }
        block = content_block;
        toolJson = "";
        if (block.type === "text" && block.text) {
          showText(block.text);
        }
        break;
      case "content_block_delta":
        if (!block || index !== content.length || !delta?.type) {
          throw incomplete();
        }
        switch (delta.type) {
          case "text_delta":
            if (block.type !== "text" || delta.text === undefined) {
              throw incomplete();
            }
            if (delta.text) {
              block.text += delta.text;
              showText(block.text);
            }
            break;
          case "input_json_delta":
            if (block.type !== "tool_use" || delta.partial_json === undefined) {
              throw incomplete();
            }
            toolJson += delta.partial_json;
            if (toolJson.length > 24_000) {
              throw incomplete();
            }
            break;
          case "thinking_delta":
            if (block.type !== "thinking" || delta.thinking === undefined) {
              throw incomplete();
            }
            block.thinking += delta.thinking;
            break;
          case "signature_delta":
            if (block.type !== "thinking" || !delta.signature) {
              throw incomplete();
            }
            block.signature = delta.signature;
            break;
        }
        break;
      case "content_block_stop":
        if (!block || index !== content.length) {
          throw incomplete();
        }
        if (block.type === "tool_use" && toolJson) {
          block.input = JSON.parse(toolJson);
        }
        if (block.type === "text" && block.text) {
          completedText += block.text + "\n\n";
        }
        content.push(block);
        block = undefined;
        break;
      case "message_delta":
        if (!started || block) {
          throw incomplete();
        }
        if (delta?.stop_reason) {
          stop = delta.stop_reason;
        }
        break;
      case "message_stop":
        if (!started || block || !stop) {
          throw incomplete();
        }
        return completedMessage({ stop_reason: stop, content });
      case "error":
        throw new AssistantError(t`The AI provider couldn't complete the request. Try again.`);
    }
  }
  throw new AssistantError(t`The connection ended before the reply finished.`);
}
