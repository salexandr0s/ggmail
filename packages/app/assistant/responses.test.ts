import { expect, test } from "bun:test";
import { readResponseStream } from "./responses";

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
