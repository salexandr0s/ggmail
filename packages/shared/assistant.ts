import { z } from "zod";
import { workspaceSidebarWidth } from "./constants";

export function assistantCoversMail(windowWidth: number) {
  return windowWidth <= 640;
}

export function assistantPanelWidth(windowWidth: number) {
  if (assistantCoversMail(windowWidth)) {
    return Math.max(0, windowWidth - workspaceSidebarWidth(windowWidth));
  }
  return Math.min(480, Math.max(380, Math.round(windowWidth / 3)));
}
export const ASSISTANT_PROMPT_LIMIT = 4000;

export const assistantProviderSchema = z.enum([
  "chatgpt",
  "claude-cli",
  "anthropic",
  "openai",
  "deepseek",
]);
export type AssistantProvider = z.infer<typeof assistantProviderSchema>;
export type ApiProvider = Exclude<AssistantProvider, "chatgpt" | "claude-cli">;

export const providerNames: Record<AssistantProvider, string> = {
  chatgpt: "OpenAI Subscription (ChatGPT)",
  "claude-cli": "Claude Code CLI (Subscription)",
  anthropic: "Claude API",
  openai: "OpenAI API",
  deepseek: "DeepSeek AI",
};

export const assistantEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
export type AssistantEffort = z.infer<typeof assistantEffortSchema>;
export type AssistantModel = {
  id: string;
  label: string;
  resolvedId?: string;
  efforts?: AssistantEffort[];
};
export type AssistantScope = "thread" | "allMail" | "mailView" | "chat";
export type AssistantContext = { kind: AssistantScope; key: string; accountLabel: string };
export type AssistantActivity =
  | { kind: "thread" | "mailbox" | "waiting" | "reviewing" | "finishing" }
  | { kind: "searching"; account: string; page: number }
  | { kind: "reading"; subject: string }
  | { kind: "web"; query?: string }
  | { kind: "draftReady"; draft: AssistantDraft };

export type ConnectionState = {
  signingIn?: boolean;
  configured?: boolean;
  status: "disconnected" | "connecting" | "connected";
  email?: string;
  models: AssistantModel[];
  error?: string;
};

export type AssistantConnection = ConnectionState & { provider: AssistantProvider };

export const QUOTE_LIMIT = 8;
export const assistantQuoteSchema = z.object({
  id: z.uuid(),
  text: z.string().min(1).max(ASSISTANT_PROMPT_LIMIT),
  truncated: z.boolean().optional(),
  subject: z.string().max(512),
  sender: z.string().max(512),
  accountId: z.string().min(1).max(128),
  owner: z.string().max(320),
  mailbox: z.string().max(2048).optional(),
  messageId: z.string().regex(/^[a-zA-Z0-9]{15,128}$/),
  /** The conversation the message is in. Absent on a quote saved before it was recorded. */
  threadId: z
    .string()
    .regex(/^[a-zA-Z0-9]{15,128}$/)
    .optional(),
});
export type AssistantQuote = z.infer<typeof assistantQuoteSchema>;
export const quoteSourceSchema = assistantQuoteSchema.pick({
  accountId: true,
  owner: true,
  messageId: true,
  mailbox: true,
});
export type QuoteSource = z.infer<typeof quoteSourceSchema>;
export const quoteListSchema = z.array(assistantQuoteSchema).max(QUOTE_LIMIT);

export const assistantRequestSchema = z.object({
  provider: assistantProviderSchema,
  id: z.uuid(),
  origin: z.enum(["starter", "written"]).optional(),
  quotes: quoteListSchema.optional(),
  compareQuotes: z.boolean().optional(),
  retry: z.uuid().optional(),
  scopeKey: z.string().min(1).max(2000).optional(),
  prompt: z.string().trim().min(1).max(ASSISTANT_PROMPT_LIMIT),
  model: z.string().min(1).max(128),
  effort: assistantEffortSchema.optional(),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export const assistantCitationSchema = z.object({
  id: z.uuid(),
  subject: z.string().max(300),
  senders: z
    .array(
      z.object({
        name: z.string().max(320),
        domain: z.string().max(253).optional(),
        photoUrl: z.string().max(2048).optional(),
      }),
    )
    .max(8)
    .optional(),
});

export type AssistantCitation = z.infer<typeof assistantCitationSchema>;
export type AssistantSender = NonNullable<AssistantCitation["senders"]>[number];

export function getSenderDomain(address: string) {
  const host = z.email().safeParse(address).success
    ? address.slice(address.lastIndexOf("@") + 1).toLowerCase()
    : undefined;
  return host && z.hostname().safeParse(host).success ? host : undefined;
}

export const DRAFT_RECIPIENT_LIMIT = 20;
export const assistantDraftSchema = z.object({
  /** Who a new email goes to. Empty on a reply, where Gmail addresses the conversation. */
  to: z.array(z.email().max(254)).max(DRAFT_RECIPIENT_LIMIT).optional(),
  subject: z
    .string()
    .trim()
    .max(250)
    .regex(/^[^\r\n]*$/),
  body: z.string().trim().min(1).max(5000),
  /** Whether the draft answers the conversation it was written in. */
  reply: z.boolean().optional(),
});

// `to` and `reply` are absent on a draft saved before they were recorded.
export type AssistantDraft = z.infer<typeof assistantDraftSchema>;

/** A draft from before `reply` was recorded counts as a reply inside a conversation. */
export function isReplyDraft(draft: AssistantDraft) {
  return draft.reply ?? true;
}

export type SourceMessage = {
  index: number;
  sender: string;
  senderPhotoUrl?: string;
  date: string;
  body: string;
};
export type SourcePreviewPage = {
  accountId: string;
  nextOffset: number | null;
} & ({ messages: SourceMessage[] } | { excerpt: string });

export type AssistantReply = {
  text: string;
  citations: Array<AssistantCitation & { number: number }>;
  draft?: AssistantDraft;
};

export type AssistantResult =
  | { status: "complete"; reply: AssistantReply; scopeKey: string }
  | { status: "stopped" }
  | { status: "error"; message: string };

export type AssistantTurn = {
  id: string;
  prompt: string;
  quotes?: AssistantQuote[];
  compareQuotes?: boolean;
  quoteSourceNumbers?: Array<number | null>;
  origin: "starter" | "written";
  scopeKey: string;
  reply?: AssistantReply;
  error?: string;
  interrupted?: { text: string; draft?: AssistantDraft };
};
