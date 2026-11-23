import { expect, spyOn, test } from "bun:test";
import { listModels, readResponseStream, respond } from "./responses";

function stream(...frames: unknown[]) {
  const payload = frames.map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join("");
  const bytes = new TextEncoder().encode(payload);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 11) {
        controller.enqueue(bytes.slice(offset, offset + 11));
      }
      controller.close();
    },
  });
}

test("uses streamed output items when ChatGPT completes with an empty output array", async () => {
  const onText: string[] = [];
  const body = stream(
    { type: "response.output_text.delta", delta: "Frist: " },
    { type: "response.output_text.delta", delta: "märz" },
    {
      type: "response.output_item.done",
      item: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Frist: märz" }],
      },
    },
    { type: "response.completed", response: { status: "completed", output: [] } },
  );

  const reply = await readResponseStream(body, (text) => onText.push(text));
  expect(onText).toEqual(["Frist: ", "Frist: märz"]);
  expect(reply.text).toBe("Frist: märz");
});

test("a web search is offered, reported with its query and returned to the provider", async () => {
  const record = {
    type: "web_search_call" as const,
    id: "ws",
    action: { type: "search", query: "hotel email" },
  };
  const message = {
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "output_text" as const, text: "desk@hotel.example" }],
  };
  const completed = {
    type: "response.completed",
    response: { status: "completed", output: [record, message] },
  };
  const fetchMock = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        stream(
          { type: "response.web_search_call.searching" },
          { type: "response.output_item.done", item: record },
          completed,
        ),
      ),
    )
    .mockResolvedValueOnce(new Response(stream(completed)));
  try {
    const searches: Array<string | undefined> = [];
    const options = {
      token: "fixture",
      provider: "openai" as const,
      model: "fixture",
      instructions: "",
      input: [],
      tools: [],
      signal: new AbortController().signal,
      onText() {},
    };
    const reply = await respond({
      ...options,
      web: { instructions: "", onSearch: (query) => searches.push(query) },
    });
    expect(searches).toEqual([undefined, "hotel email"]);
    expect(reply.items).toEqual([record, message]);
    // A round retried without web search leaves the search record behind.
    await respond({ ...options, input: reply.items });
    const [offered, retried] = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(offered.tools).toEqual([{ type: "web_search" }]);
    expect(retried).toMatchObject({ tools: [], input: [message] });
  } finally {
    fetchMock.mockRestore();
  }
});

test("a tool call cannot run before ChatGPT completes the response", async () => {
  const body = stream({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      namespace: "ggmail",
      name: "prepare_draft",
      call_id: "call-1",
      arguments: '{"subject":"Hello","body":"Hi"}',
    },
  });

  await expect(readResponseStream(body, () => {})).rejects.toThrow();
});

for (const provider of ["chatgpt", "openai", "deepseek"] as const) {
  test(
    provider + " streams distinct Markdown blocks in the same order as the final reply",
    async () => {
      const updates: string[] = [];
      const texts = ["## Decision", "Ship **Friday**.", "- Send the agenda"];
      const body = stream(
        { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: texts[0] },
        { type: "response.output_text.delta", output_index: 1, content_index: 0, delta: texts[2] },
        { type: "response.output_text.delta", output_index: 0, content_index: 1, delta: texts[1] },
        {
          type: "response.completed",
          response: {
            status: "completed",
            output: [
              {
                type: "message",
                role: "assistant",
                content: texts.slice(0, 2).map((text) => ({ type: "output_text", text })),
              },
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: texts[2] }],
              },
            ],
          },
        },
      );
      const result = await readResponseStream(body, (text) => updates.push(text), provider);
      expect(updates.at(-1)).toBe(texts.join("\n\n"));
      expect(updates.at(-1)).toBe(result.text);
    },
  );
}

test("the subscription picker respects the account's effort catalog and sends the selected level", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({
      models: [
        {
          slug: "account-model",
          display_name: "Account model",
          visibility: "list",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "xhigh" }, { effort: "ultra" }],
        },
        {
          slug: "gpt-6.2-sol",
          display_name: "Fixed configuration",
          visibility: "list",
          supported_reasoning_levels: [],
        },
      ],
    }),
  );
  try {
    const [choice, fixed] = await listModels("fixture");
    if (!choice || !fixed) {
      throw new Error("Missing fixture model");
    }
    expect(choice.efforts).toEqual(["low", "xhigh", "ultra"]);
    expect(fixed.efforts).toEqual([]);
    const options = {
      model: choice.id,
      instructions: "",
      input: [],
      tools: [],
      token: "fixture",
      signal: new AbortController().signal,
      onText() {},
    };
    for (const effort of ["xhigh", undefined] as const) {
      fetchMock.mockResolvedValueOnce(
        new Response(
          stream({ type: "response.completed", response: { status: "completed", output: [] } }),
        ),
      );
      await respond({ ...options, effort });
      const payload = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body));
      expect(payload.reasoning).toEqual(effort && { effort });
    }
  } finally {
    fetchMock.mockRestore();
  }
});
