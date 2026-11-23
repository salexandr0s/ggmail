import { t } from "@lingui/core/macro";
import { z } from "zod";
import { AssistantError } from "./responses";

const frameSchema = z.object({
  type: z.string(),
  parent_tool_use_id: z.string().nullish(),
  event: z.unknown().optional(),
});
const eventSchema = z.object({
  type: z.string(),
  index: z.int().nonnegative().optional(),
  content_block: z.object({ type: z.string(), name: z.string().optional() }).optional(),
  delta: z.object({ type: z.string().optional(), partial_json: z.string().optional() }).optional(),
});

// The CLI streams the schema response as arguments to its StructuredOutput tool.
// Preview only the top-level answer string. Either field may come first on an
// answer round. Nonempty calls are processed separately after final validation.
const answerStart = /^\s*\{\s*(?:"calls"\s*:\s*\[\s*\]\s*,\s*)?"text"\s*:\s*"/;
// oxlint-disable-next-line no-control-regex -- Match complete JSON string characters and escapes.
const stringChars = /^(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*/;

class AnswerPreview {
  private remainder = "";
  private started = false;
  private finished = false;
  private text = "";

  append(fragment: string) {
    if (this.finished) {
      return;
    }
    this.remainder += fragment;
    if (!this.started) {
      const prefix = answerStart.exec(this.remainder);
      if (!prefix) {
        // A call round can contain long search arguments. Never scan inside them.
        this.finished = this.remainder.length > 256;
        return;
      }
      this.remainder = this.remainder.slice(prefix[0].length);
      this.started = true;
    }
    const chars = this.remainder.match(stringChars)?.[0] ?? "";
    this.remainder = this.remainder.slice(chars.length);
    this.finished = this.remainder.startsWith('"') || this.remainder.length > 5;
    if (!chars) {
      return;
    }

    this.text += JSON.parse('"' + chars + '"') as string;
    if (this.text.length > 64_000) {
      throw new AssistantError(t`The AI provider returned a response that is too large.`);
    }
    // A unicode escape may end mid-emoji. Wait for its second surrogate.
    const last = this.text.charCodeAt(this.text.length - 1);
    if (last < 0xd800 || last > 0xdbff) {
      return this.text;
    }
  }
}

function searchQuery(input: string) {
  try {
    return z.object({ query: z.string() }).parse(JSON.parse(input)).query;
  } catch {
    // The input was cut short or is not a search. The activity stays generic.
    return undefined;
  }
}

export class ClaudeCliStream {
  private pendingLine = "";
  private answer?: { index: number; preview: AnswerPreview };
  private search?: { index: number; input: string };
  private result?: unknown;

  constructor(
    private readonly onText: (text: string) => void,
    private readonly onSearch?: (query?: string) => void,
  ) {}

  write(chunk: string) {
    const lines = chunk.split("\n");
    const tail = lines.pop() ?? "";
    for (const line of lines) {
      this.frame(this.pendingLine + line);
      this.pendingLine = "";
    }
    this.pendingLine += tail;
    if (this.pendingLine.length > 2_097_152) {
      throw new AssistantError(t`The AI provider returned a response that is too large.`);
    }
  }

  finish() {
    this.frame(this.pendingLine);
    return this.result;
  }

  private frame(line: string) {
    if (line.length > 2_097_152) {
      throw new AssistantError(t`The AI provider returned a response that is too large.`);
    }
    if (!line.trim() || this.result !== undefined) {
      return;
    }
    const raw: unknown = JSON.parse(line);
    const frame = frameSchema.parse(raw);
    if (frame.parent_tool_use_id != null) {
      return;
    }
    if (frame.type === "result") {
      this.result = raw;
      return;
    }
    if (frame.type !== "stream_event") {
      return;
    }
    const event = eventSchema.parse(frame.event);
    if (event.type === "message_start" || event.type === "message_stop") {
      this.answer = undefined;
      this.search = undefined;
    } else if (event.type === "content_block_start" && event.index !== undefined) {
      const tool = event.content_block?.type === "tool_use" ? event.content_block.name : undefined;
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Built-in Claude Code tool name.
      if (tool === "StructuredOutput") {
        this.answer = { index: event.index, preview: new AnswerPreview() };
      } else if (this.answer?.index === event.index) {
        this.answer = undefined;
      }
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Built-in Claude Code tool name.
      if (tool === "WebSearch") {
        this.search = { index: event.index, input: "" };
        this.onSearch?.();
      }
    } else if (this.search && this.search.index === event.index) {
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        this.search.input = (this.search.input + (event.delta.partial_json ?? "")).slice(0, 4096);
      } else if (event.type === "content_block_stop") {
        const query = searchQuery(this.search.input);
        this.search = undefined;
        if (query) {
          this.onSearch?.(query);
        }
      }
    } else if (this.answer && this.answer.index === event.index) {
      if (event.type === "content_block_stop") {
        this.answer = undefined;
      } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        const text = this.answer.preview.append(event.delta.partial_json ?? "");
        if (text !== undefined) {
          this.onText(text);
        }
      }
    }
  }
}
