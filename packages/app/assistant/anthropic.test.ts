import { expect, spyOn, test } from "bun:test";
import { anthropicMessages, anthropicReply, readAnthropicStream } from "./anthropic";

const start = { type: "message_start", message: { role: "assistant", content: [] } };
const begin = (index: number, content_block: object) => ({
  type: "content_block_start",
  index,
  content_block,
});
const delta = (index: number, delta: object) => ({ type: "content_block_delta", index, delta });
const end = (index: number) => ({ type: "content_block_stop", index });
const reason = (stop_reason: string) => ({ type: "message_delta", delta: { stop_reason } });
const stop = { type: "message_stop" };

function frames(...events: object[]) {
  return new TextEncoder().encode(
    events.map((event) => "data: " + JSON.stringify(event) + "\r\n\r\n").join(""),
  );
}

test("Anthropic streams answer text before completion and keeps tool inputs and signed thinking out of previews", async () => {
  let send!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      send = controller;
    },
  });
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8" } }),
  );
  try {
    const first = Promise.withResolvers<void>();
    const updates: string[] = [];
    const reply = anthropicReply(
      {
        model: "test",
        instructions: "",
        input: [],
        tools: [],
        signal: new AbortController().signal,
        onText(text) {
          updates.push(text);
          first.resolve();
        },
      },
      "fixture",
    );
    const opening = frames(
      start,
      begin(0, { type: "thinking", thinking: "" }),
      delta(0, { type: "thinking_delta", thinking: "private" }),
      delta(0, { type: "signature_delta", signature: "signature" }),
      end(0),
      begin(1, { type: "text", text: "" }),
      delta(1, { type: "text_delta", text: "Résumé" }),
    );
    for (let offset = 0; offset < opening.length; offset += 9) {
      send.enqueue(opening.subarray(offset, offset + 9));
    }
    await first.promise;
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).stream).toBe(true);
    expect(updates).toEqual(["Résumé"]);
    send.enqueue(
      frames(
        delta(1, { type: "text_delta", text: " ready." }),
        end(1),
        begin(2, { type: "text", text: "Next step" }),
        end(2),
        begin(3, { type: "tool_use", id: "abc", name: "search_mail", input: {} }),
        delta(3, { type: "input_json_delta", partial_json: '{"query":' }),
        delta(3, { type: "input_json_delta", partial_json: '"due"}' }),
        end(3),
        reason("tool_use"),
        stop,
      ),
    );
    send.close();
    const result = await reply;
    expect(updates).toEqual(["Résumé", "Résumé ready.", "Résumé ready.\n\nNext step"]);
    expect(updates.at(-1)).toBe(result.text);
    expect(result.calls).toEqual([
      {
        type: "function_call",
        namespace: "ggmail",
        call_id: "abc",
        name: "search_mail",
        arguments: '{"query":"due"}',
      },
    ]);
    expect(anthropicMessages(result.items)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private", signature: "signature" },
          { type: "text", text: "Résumé ready." },
          { type: "text", text: "Next step" },
          { type: "tool_use", id: "abc", name: "search_mail", input: { query: "due" } },
        ],
      },
    ]);
  } finally {
    fetchMock.mockRestore();
  }
});

test("Anthropic reports a web search, resumes the paused turn and joins the cited answer", async () => {
  const search = { type: "server_tool_use", id: "srv", name: "web_search", input: {} };
  const found = {
    type: "web_search_tool_result",
    tool_use_id: "srv",
    content: [{ type: "web_search_result", url: "https://hotel.example", encrypted_content: "x" }],
  };
  const sse = { headers: { "content-type": "text/event-stream" } };
  const fetchMock = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        frames(
          start,
          begin(0, { type: "text", text: "Looking it up." }),
          end(0),
          begin(1, search),
          delta(1, { type: "input_json_delta", partial_json: '{"query":"hotel reception email"}' }),
          end(1),
          begin(2, found),
          end(2),
          reason("pause_turn"),
          stop,
        ),
        sse,
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        frames(
          start,
          begin(0, { type: "text", text: "The reception address is " }),
          end(0),
          begin(1, { type: "text", text: "", citations: [] }),
          delta(1, { type: "citations_delta", citation: { url: "https://hotel.example" } }),
          delta(1, { type: "text_delta", text: "desk@hotel.example" }),
          end(1),
          begin(2, { type: "text", text: "." }),
          end(2),
          reason("end_turn"),
          stop,
        ),
        sse,
      ),
    );
  try {
    const searches: Array<string | undefined> = [];
    const previews: string[] = [];
    const result = await anthropicReply(
      {
        model: "test",
        instructions: "",
        input: [{ role: "user", content: "Find the address" }],
        tools: [],
        web: { instructions: "", onSearch: (query) => searches.push(query) },
        signal: new AbortController().signal,
        onText: (text) => previews.push(text),
      },
      "fixture",
    );
    const answer = "Looking it up.\n\nThe reception address is desk@hotel.example.";
    expect(result.text).toBe(answer);
    expect(previews.at(-1)).toBe(answer);
    expect(searches).toEqual([undefined, "hotel reception email"]);
    const [first, resumed] = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(first.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
    // The paused reply returns with the search and its results exactly as they arrived.
    expect(resumed.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Find the address" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking it up." },
          { ...search, input: { query: "hotel reception email" } },
          found,
        ],
      },
    ]);
  } finally {
    fetchMock.mockRestore();
  }
});

test("Anthropic releases no calls from interrupted, truncated or malformed tool streams", async () => {
  const tool = begin(0, { type: "tool_use", id: "a", name: "search_mail", input: {} });
  for (const events of [
    [start, tool, end(0), reason("tool_use")],
    [start, tool, reason("tool_use"), stop],
    [start, tool, end(0), reason("max_tokens"), stop],
    [start, tool, end(0), reason("end_turn"), stop],
    [
      start,
      tool,
      delta(0, { type: "input_json_delta", partial_json: "{" }),
      end(0),
      reason("tool_use"),
      stop,
    ],
    [
      start,
      tool,
      delta(0, { type: "text_delta", text: "private" }),
      end(0),
      reason("tool_use"),
      stop,
    ],
    [start, tool, { type: "error", error: { message: "provider diagnostics" } }],
  ]) {
    const updates: string[] = [];
    const body = new Blob([frames(...events)]).stream();
    await expect(readAnthropicStream(body, (text) => updates.push(text))).rejects.toThrow();
    expect(updates).toEqual([]);
  }
});
