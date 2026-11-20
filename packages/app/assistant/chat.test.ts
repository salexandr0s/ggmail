import { expect, mock, test } from "bun:test";
import type { AssistantRequest } from "@ggmail/shared/assistant";
import type { MailSource } from "./mail-context";
import type { respond } from "./responses";

const respondMock = mock<typeof respond>();
const navigate = mock((_hash: string) => {});
let key = "account/inbox";
let sources: MailSource[] = [];

mock.module("./connection", () => ({
  ChatGPTConnection: class {
    allowsModel() {
      return true;
    }
    accessToken() {
      return Promise.resolve("fixture");
    }
    invalidate() {}
  },
}));
mock.module("./mail-context", () => ({
  getMailScope: () => ({ kind: "mailView", key, gmail: { navigateToHash: navigate } }),
  ensureCurrentScope: (_scope: unknown, signal: AbortSignal) => signal.throwIfAborted(),
  readCurrentMail: () => Promise.resolve({ kind: "mailView", sources }),
  searchAllMail: () => Promise.resolve({ rows: [] }),
}));
mock.module("./responses", () => ({
  AssistantError: class extends Error {},
  respond: respondMock,
}));
const { AssistantChat } = await import("./chat");

function request(prompt: string): AssistantRequest {
  return { prompt, model: "fixture", id: crypto.randomUUID(), scopeKey: key };
}
const quiet = () => {};

test("a revision receives the actual subject and body even when ChatGPT also returned an acknowledgement", async () => {
  const chat = new AssistantChat();
  const draft = { subject: "Agenda", body: "Let's meet at ten." };
  const call = {
    type: "function_call" as const,
    namespace: "ggmail" as const,
    name: "prepare_draft",
    call_id: "draft",
    arguments: JSON.stringify(draft),
  };
  respondMock.mockResolvedValueOnce({ text: "", items: [call], calls: [call] });
  respondMock.mockResolvedValueOnce({ text: "Draft prepared.", items: [], calls: [] });
  expect((await chat.send(request("Draft an invitation"), quiet)).status).toBe("complete");
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input[1]).toEqual({
      role: "assistant",
      content: JSON.stringify({ answer: "Draft prepared.", draft, sources: [] }),
    });
    return { text: "Okay", items: [], calls: [] };
  });
  expect((await chat.send(request("Make it shorter"), quiet)).status).toBe("complete");
});

test("citations keep their numbers when rows reorder and can only open in their own conversation", async () => {
  const chat = new AssistantChat();
  const first = { hash: "#all/aa", subject: "Agenda" };
  const second = { hash: "#all/bb", subject: "Budget" };
  sources = [first];
  respondMock.mockResolvedValueOnce({ text: "Read [1]", items: [], calls: [] });
  const answer = await chat.send(request("First message?"), quiet);
  expect(answer.status).toBe("complete");
  sources = [second, first];
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input.at(-1)).toMatchObject({
      content: expect.stringContaining('"sourceNumbers":[2,1]'),
    });
    return { text: "Both [1, 2]", items: [], calls: [] };
  });
  const followUp = await chat.send(request("And now?"), quiet);
  expect(followUp.status).toBe("complete");
  if (answer.status !== "complete" || followUp.status !== "complete") {
    throw new Error("Expected replies");
  }
  expect(followUp.reply.citations.map(({ subject }) => subject)).toEqual(["Agenda", "Budget"]);
  const citation = answer.reply.citations[0];
  if (!citation) {
    throw new Error("Missing citation");
  }
  expect(followUp.reply.citations[0]?.id).toBe(citation.id);
  chat.openSource(citation.id);
  expect(navigate).toHaveBeenLastCalledWith(first.hash);
  key = "other/inbox";
  expect(() => chat.openSource(citation.id)).toThrow();
  chat.context();
  key = "account/inbox";
  expect(() => chat.openSource(citation.id)).toThrow();
  sources = [];
});

test("stopping a streamed reply leaves its partial answer out of the next request", async () => {
  const chat = new AssistantChat();
  const started = Promise.withResolvers<void>();
  respondMock.mockImplementationOnce(async ({ signal, onText }) => {
    onText("partial");
    started.resolve();
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
  });
  const first = request("First attempt");
  const pending = chat.send(first, quiet);
  await started.promise;
  chat.stop(first.id);
  expect(await pending).toEqual({ status: "stopped" });
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input).toHaveLength(1);
    return { text: "Complete", items: [], calls: [] };
  });
  expect((await chat.send(request("Retry"), quiet)).status).toBe("complete");
});
