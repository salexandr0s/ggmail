import { z } from "zod";

export function assistantPanelWidth(windowWidth: number) {
  if (windowWidth <= 640) {
    return windowWidth;
  }
  return Math.min(480, Math.max(380, Math.round(windowWidth / 3)));
}
export const ASSISTANT_PROMPT_LIMIT = 4000;

export type AssistantModel = { id: string; label: string };
export type AssistantScope = "thread" | "allMail" | "mailView" | "chat";
export type AssistantContext = { kind: AssistantScope; key: string; accountLabel: string };
export type AssistantActivity = "searching" | "drafting";

export type AssistantConnection = {
  status: "disconnected" | "connecting" | "connected";
  email?: string;
  models: AssistantModel[];
  error?: string;
};

export const assistantRequestSchema = z.object({
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

export const assistantDraftSchema = z.object({
  subject: z
    .string()
    .trim()
    .max(250)
    .regex(/^[^\r\n]*$/),
  body: z.string().trim().min(1).max(5000),
});

export type AssistantDraft = z.infer<typeof assistantDraftSchema>;

export type AssistantReply = {
  text: string;
  citations: Array<AssistantCitation & { number: number }>;
  draft?: AssistantDraft;
};

export type AssistantResult =
  | { status: "complete"; reply: AssistantReply }
  | { status: "stopped" }
  | { status: "error"; message: string };
