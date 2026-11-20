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
