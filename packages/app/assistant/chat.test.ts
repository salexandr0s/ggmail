import { expect, mock, test } from "bun:test";
import type { AssistantRequest } from "@ggmail/shared/assistant";
import type { MailSource } from "./mail-context";
import type { respond, ResponseOptions, FunctionCall } from "./responses";

const respondMock = mock<(options: ResponseOptions) => ReturnType<typeof respond>>();
const navigate = mock((_source: MailSource) => {});
const primary = {
  accountId: "personal",
  mailbox: "https://mail.google.com/mail/u/0/",
  ownerEmail: "one@example.test",
};
const secondary = { ...primary, accountId: "work", ownerEmail: "two@example.test" };
const available = [primary, secondary].map(({ accountId, ownerEmail }) => ({
  accountId,
  label: accountId,
  email: ownerEmail,
  available: true,
}));
const search = mock<typeof import("./mail-context").searchAllMail>();
const read = mock<typeof import("./mail-context").readMailSource>();
const preview = mock<typeof import("./mail-context").readMailPreview>();

let key = "account/inbox";
let sources: MailSource[] = [];

mock.module("./providers", () => ({
  AssistantProviders: class {
    allowsModel() {
      return true;
    }
    reply(_provider: string, options: ResponseOptions) {
      return respondMock(options);
    }
    invalidate() {}
  },
}));
mock.module("./mail-context", () => ({
  getMailScope: () => ({
    kind: "mailView",
    key,
    accountId: primary.accountId,
    unified: false,
    gmail: {},
  }),
  getAssistantMailboxes: () => available,
  sourcesForQuotes: (quotes: NonNullable<AssistantRequest["quotes"]>) =>
    quotes.map((q) => ({
      ...primary,
      subject: q.subject,
      hash: "#all/" + q.messageId,
      threadId: q.messageId,
      excerpt: q.text,
    })),
  openMailSource: (_scope: unknown, source: MailSource) => navigate(source),
  readMailSource: read,
  readMailPreview: preview,
  resolveMailbox: () => primary,
  ensureCurrentScope: (_scope: unknown, signal: AbortSignal) => signal.throwIfAborted(),
  ensureMailboxes: (_scope: unknown, signal: AbortSignal) => signal.throwIfAborted(),
  readCurrentMail: () => Promise.resolve({ kind: "mailView", sources }),
  searchAllMail: search,
}));
const { AssistantChat, draftMailto } = await import("./chat");

function request(prompt: string): AssistantRequest {
  return { provider: "chatgpt", prompt, model: "fixture", id: crypto.randomUUID(), scopeKey: key };
}
const quiet = () => {};

test("a revision receives the actual subject and body even when ChatGPT also returned an acknowledgement", async () => {
  const chat = new AssistantChat();
  // No conversation is open, so the draft is a new email whatever the model claims.
  const draft = {
    to: ["desk@hotel.example", "two@example.test"],
    subject: "Agenda",
    body: "Let's meet at ten.",
    reply: false,
  };
  const call = {
    type: "function_call" as const,
    namespace: "ggmail" as const,
    name: "prepare_draft",
    call_id: "draft",
    arguments: JSON.stringify({
      ...draft,
      to: "desk@hotel.example, two@example.test",
      reply: true,
    }),
  };
  respondMock.mockResolvedValueOnce({ text: "", items: [call], calls: [call] });
  respondMock.mockResolvedValueOnce({ text: "Draft prepared.", items: [], calls: [] });
  const progress = mock<Parameters<typeof chat.send>[1]>();
  expect((await chat.send(request("Draft an invitation"), progress)).status).toBe("complete");
  expect(progress.mock.calls.map(([, step]) => step)).toEqual([
    { kind: "mailbox" },
    { kind: "waiting" },
    { kind: "draftReady", draft },
    { kind: "finishing" },
  ]);
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input[1]).toEqual({
      role: "assistant",
      content: JSON.stringify({ answer: "Draft prepared.", draft, sources: [] }),
    });
    return { text: "Okay", items: [], calls: [] };
  });
  expect((await chat.send(request("Make it shorter"), quiet)).status).toBe("complete");
});

test("one compose link carries the recipients, subject and body", () => {
  const url = draftMailto({
    to: ["a+b@example.test", "c@example.test"],
    subject: "Rooms & rates?",
    body: "First line\nSecond line",
  });
  expect(url).toBe(
    "mailto:a%2Bb@example.test,c@example.test?subject=Rooms%20%26%20rates%3F&body=First%20line%0ASecond%20line",
  );
  expect(draftMailto({ subject: "", body: "Hi" })).toBe("mailto:?subject=&body=Hi");
});

test("citations keep their numbers when rows reorder and can only open in their own conversation", async () => {
  const chat = new AssistantChat();
  const first = {
    ...primary,
    hash: "#all/aa",
    subject: "Agenda",
    excerpt: "The deadline is Friday.",
  };
  const second = { ...primary, hash: "#all/bb", subject: "Budget" };
  sources = [first];
  respondMock.mockResolvedValueOnce({ text: "Read [1]", items: [], calls: [] });
  const answer = await chat.send(request("First message?"), quiet);
  expect(answer.status).toBe("complete");
  key = "other/inbox";
  chat.context();
  sources = [second, first];
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input.at(-1)).toMatchObject({
      content: expect.stringContaining('"sourceNumbers":[2,1]'),
    });
    return {
      text: "Literal `[2]`, [label [2]](https://example.test), unknown [2–9000]. Both [1–2].",
      items: [],
      calls: [],
    };
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
  preview.mockResolvedValueOnce({ error: "Thread unavailable" });
  expect(await chat.previewSource(citation.id, 0)).toMatchObject({
    accountId: primary.accountId,
    excerpt: first.excerpt,
    nextOffset: null,
  });
  expect(navigate).not.toHaveBeenCalled();
  chat.openSource(citation.id);
  expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining(first));
  key = "account/inbox";
  chat.clear();
  await expect(chat.previewSource(citation.id, 0)).rejects.toThrow();
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

test("New chat discards a pending turn even when its provider responds late", async () => {
  const chat = new AssistantChat();
  const started = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  respondMock.mockImplementationOnce(async () => {
    started.resolve();
    await finished.promise;
    return { text: "Old answer", items: [], calls: [] };
  });
  const pending = chat.send(request("Old question"), quiet);
  await started.promise;
  chat.clear();
  respondMock.mockResolvedValueOnce({ text: "New answer", calls: [], items: [] });
  await chat.send(request("New question"), quiet);
  finished.resolve();
  expect(await pending).toEqual({ status: "stopped" });
  expect(chat.transcript().map(({ prompt }) => prompt)).toEqual(["New question"]);
});

function callTool(name: string, args: Record<string, unknown>) {
  const call: FunctionCall = {
    type: "function_call",
    namespace: "ggmail",
    name,
    call_id: crypto.randomUUID(),
    arguments: JSON.stringify(args),
  };
  return { text: "", items: [call], calls: [call] };
}

test("an inbox question searches a second account and reads a deadline beyond the first body chunk", async () => {
  const chat = new AssistantChat();
  const thread = {
    ...primary,
    threadId: "193078998a370001",
    hash: "#all/193078998a370001",
    subject: "Review",
  };
  const workThread = { ...thread, ...secondary, rowSender: undefined, senders: [{ name: "Sam" }] };
  sources = [thread];
  try {
    const query = "subject:Review";
    search.mockResolvedValueOnce({
      rows: [
        {
          subject: "Review",
          sender: "Sam",
          date: "",
          snippet: "Please see below",
          source: workThread,
        },
      ],
      nextPage: null,
      complete: true,
    });
    read.mockResolvedValueOnce({
      text: "Background",
      nextOffset: 10,
      totalCharacters: 30,
      messageCount: 2,
    });
    read.mockResolvedValueOnce({
      text: "Send by November 30.",
      nextOffset: null,
      totalCharacters: 30,
      messageCount: 2,
    });
    respondMock.mockImplementationOnce(async ({ input, tools }) => {
      expect(tools.map((tool) => tool.name)).toContain("search_mail");
      expect(tools.map((tool) => tool.name)).toContain("read_thread");
      expect(input[0]).toMatchObject({ content: expect.stringContaining('"accountId":"work"') });
      return callTool("search_mail", { accountId: "work", query, page: 1 });
    });
    respondMock.mockImplementationOnce(async ({ input }) => {
      expect(input.at(-1)).toMatchObject({ output: expect.stringContaining('"sourceNumber":2') });
      return callTool("read_thread", { sourceNumber: 2, offset: 0 });
    });
    respondMock.mockImplementationOnce(async ({ input }) => {
      expect(input.at(-1)).toMatchObject({ output: expect.stringContaining('"nextOffset":10') });
      return callTool("read_thread", { sourceNumber: 2, offset: 10 });
    });
    respondMock.mockImplementationOnce(async ({ input }) => {
      expect(input.at(-1)).toMatchObject({
        output: expect.stringContaining("Send by November 30."),
      });
      return { text: "Send by November 30 [2].", items: [], calls: [] };
    });
    const progress = mock<Parameters<typeof chat.send>[1]>();
    const result = await chat.send(request("Find the deadline in my work mail"), progress);
    expect(progress.mock.calls.map(([, step]) => step)).toEqual([
      { kind: "mailbox" },
      { kind: "waiting" },
      { kind: "searching", account: "work", page: 1 },
      { kind: "reviewing" },
      { kind: "reading", subject: "Review" },
      { kind: "reviewing" },
      { kind: "reading", subject: "Review" },
      { kind: "reviewing" },
    ]);
    if (result.status !== "complete") {
      throw new Error("Expected completed deadline search");
    }
    expect(search).toHaveBeenLastCalledWith(
      expect.anything(),
      query,
      expect.any(AbortSignal),
      "work",
      1,
    );
    expect(read).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining(workThread),
      10,
      expect.any(AbortSignal),
    );
    expect(result.reply.citations.map((citation) => citation.number)).toEqual([2]);
    const citation = result.reply.citations[0];
    if (!citation) {
      throw new Error("Missing deadline citation");
    }
    chat.openSource(citation.id);
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining(workThread));
  } finally {
    sources = [];
  }
});

test("unknown account and source references return tool errors without accessing Gmail", async () => {
  const chat = new AssistantChat();
  const searches = search.mock.calls.length;
  const reads = read.mock.calls.length;
  respondMock.mockResolvedValueOnce(
    callTool("search_mail", { accountId: "not-an-account", query: "agenda", page: 1 }),
  );
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input.at(-1)).toMatchObject({ output: expect.stringContaining('"error"') });
    return callTool("read_thread", { sourceNumber: 98765, offset: 0 });
  });
  respondMock.mockImplementationOnce(async ({ input }) => {
    expect(input.at(-1)).toMatchObject({ output: expect.stringContaining('"error"') });
    return { text: "That conversation was unavailable.", items: [], calls: [] };
  });
  expect((await chat.send(request("Read a conversation"), quiet)).status).toBe("complete");
  expect(search.mock.calls).toHaveLength(searches);
  expect(read.mock.calls).toHaveLength(reads);
});

test("two quoted messages retain their source and text for the comparison and its follow-up", async () => {
  const chat = new AssistantChat();
  const quotes = ["Alex", "Blair"].map((sender, index) => ({
    id: crypto.randomUUID(),
    sender,
    subject: sender + " proposal",
    text: index ? "180 euros" : "200 euros",
    accountId: "personal",
    owner: "one@example.test",
    messageId: "194a92f8c000000" + index,
  }));
  for (const [index, prompt] of ["Compare both", "What is the difference?"].entries()) {
    respondMock.mockResolvedValueOnce({ text: "Comparison", items: [], calls: [] });
    const result = await chat.send(
      { ...request(prompt), quotes: index === 0 ? quotes : undefined },
      quiet,
    );
    expect(result.status).toBe("complete");
    const input = respondMock.mock.lastCall?.[0].input ?? [];
    const question = input.find(
      (item) =>
        "content" in item &&
        typeof item.content === "string" &&
        item.content.includes('"quotedMail"'),
    );
    const content = question && "content" in question ? question.content : undefined;
    expect(content).toContain("Blair proposal");
    expect(content).toContain("ggmail://one@example.test/message/" + quotes[0]?.messageId);
    expect(content).toContain("200 euros");
  }
  expect(chat.transcript()[0]?.quotes).toEqual(quotes);
});

test("Compare quotes supplies only the attachments, with stable, openable citations", async () => {
  const chat = new AssistantChat();
  const quotes = ["First price", "Latest price"].map((subject, index) => ({
    id: crypto.randomUUID(),
    text: "Price " + index,
    subject,
    sender: "Pat",
    owner: primary.ownerEmail,
    accountId: primary.accountId,
    messageId: "194a92f8c000000" + index,
  }));
  respondMock.mockResolvedValueOnce({ text: "Changed [1] [2].", calls: [], items: [] });
  const answer = await chat.send(
    { ...request("Compare quotes"), quotes, compareQuotes: true },
    quiet,
  );
  expect(answer.status).toBe("complete");
  const options = respondMock.mock.lastCall?.[0];
  expect(options?.tools).toEqual([]);
  const input = options?.input;
  expect(input).toHaveLength(1);
  const message = input?.[0];
  const payload = message && "content" in message ? JSON.parse(String(message.content)) : undefined;
  expect(payload.mail).toBeUndefined();
  expect(payload.quotedMail.map((q: { sourceNumber: number }) => q.sourceNumber)).toEqual([1, 2]);
  if (answer.status !== "complete") {
    throw Error("Expected citations");
  }
  expect(answer.reply.citations.map((c) => c.subject)).toEqual(["First price", "Latest price"]);
  chat.openSource(answer.reply.citations[1]?.id ?? "");
  expect(navigate.mock.lastCall?.[0].threadId).toBe(quotes[1]?.messageId);
});
