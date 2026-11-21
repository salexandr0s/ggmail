import { z } from "zod";

export function assistantPanelWidth(windowWidth: number) {
  if (windowWidth <= 640) {
    return windowWidth;
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

export type AssistantModel = { id: string; label: string };
export type AssistantScope = "thread" | "allMail" | "mailView" | "chat";
export type AssistantContext = { kind: AssistantScope; key: string; accountLabel: string };
export type AssistantActivity =
  | { kind: "thread" | "mailbox" | "waiting" | "reviewing" | "finishing" }
  | { kind: "searching"; account: string; page: number }
  | { kind: "reading"; subject: string }
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

export const assistantRequestSchema = z.object({
  provider: assistantProviderSchema,
  id: z.uuid(),
  scopeKey: z.string().min(1).max(2000),
  prompt: z.string().trim().min(1).max(ASSISTANT_PROMPT_LIMIT),
  model: z.string().min(1).max(128),
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

export const assistantDraftSchema = z.object({
  subject: z
    .string()
    .trim()
    .max(250)
    .regex(/^[^\r\n]*$/),
  body: z.string().trim().min(1).max(5000),
});

export type AssistantDraft = z.infer<typeof assistantDraftSchema>;

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
  | { status: "complete"; reply: AssistantReply }
  | { status: "stopped" }
  | { status: "error"; message: string };
