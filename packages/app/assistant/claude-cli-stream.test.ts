import { expect, test } from "bun:test";
import { ClaudeCliStream } from "./claude-cli-stream";

const start = (name: string, index: number) => ({
  type: "content_block_start",
  index,
  content_block: { type: "tool_use", name },
});
const delta = (partial_json: string, index = 0) => ({
  type: "content_block_delta",
  index,
  delta: { type: "input_json_delta", partial_json },
});
const frame = (event: unknown, parent_tool_use_id: string | null = null) =>
  JSON.stringify({ type: "stream_event", event, parent_tool_use_id }) + "\r\n";

test("streams answer text before the terminal Claude result across JSON and Unicode boundaries", () => {
  const updates: string[] = [];
  const stream = new ClaudeCliStream((text) => updates.push(text));
  const prefix = frame(start("StructuredOutput", 0)) + frame(delta('{"calls":[],"te'));
  for (const character of prefix) {
    stream.write(character);
  }
  stream.write(frame(delta('xt":"Ready')));
  expect(updates).toEqual(["Ready"]);
  stream.write(frame(delta("\\n\\uD83")));
  stream.write(frame(delta("D\\uDC")));
  stream.write(frame(delta('8C: \\"OK\\".')));
  stream.write(frame(delta('"}')));
  expect(updates).toEqual(["Ready", "Ready\n", 'Ready\n💌: "OK".']);

  const result = { type: "result", structured_output: { text: updates.at(-1), calls: [] } };
  stream.write(JSON.stringify(result));
  expect(stream.finish()).toEqual(result);
});

test("reports a web search when it starts and again with its query", () => {
  const searches: Array<string | undefined> = [];
  const stream = new ClaudeCliStream(
    () => {},
    (query) => searches.push(query),
  );
  stream.write(frame(start("WebSearch", 0)));
  stream.write(frame(delta('{"query":"hotel ')));
  stream.write(frame(delta('reception email"}')));
  stream.write(frame({ type: "content_block_stop", index: 0 }));
  expect(searches).toEqual([undefined, "hotel reception email"]);
});

test("ignores CLI chatter, nested tools, arguments and stale block indices", () => {
  const updates: string[] = [];
  const stream = new ClaudeCliStream((text) => updates.push(text));
  stream.write('{"type":"assistant","message":{"content":[{"text":"diagnostics"}]}}\n');
  stream.write(frame(start("StructuredOutput", 0), "child"));
  stream.write(frame(delta('{"text":"nested process"}'), "child"));
  stream.write(frame(start("StructuredOutput", 0)));
  stream.write(frame(start("anotherTool", 0)));
  stream.write(frame(delta('{"text":"private args"}')));
  stream.write(frame(start("StructuredOutput", 1)));
  stream.write(frame(delta('{"text":"wrong index"}')));
  stream.write(
    frame({
      type: "content_block_delta",
      index: 1,
      delta: { type: "thinking_delta", thinking: "private" },
    }),
  );
  stream.write(
    frame(delta('{"calls":[{"name":"search_mail","arguments":"sensitive"}],"text":""}', 1)),
  );
  stream.write(frame({ type: "message_start" }));
  stream.write(frame(delta('{"text":"stale text"}', 1)));
  expect(updates).toEqual([]);

  stream.write(frame(start("StructuredOutput", 0)));
  stream.write(frame(delta('{"text":"Available","calls":[{"name":"read_thread"}]}')));
  stream.write(frame({ type: "content_block_stop", index: 0 }));
  stream.write(frame(delta('{"text":"after stop"}')));
  expect(updates).toEqual(["Available"]);
  expect(stream.finish()).toBeUndefined();
});
