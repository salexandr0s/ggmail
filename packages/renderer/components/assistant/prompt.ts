import {
  ASSISTANT_PROMPT_LIMIT,
  QUOTE_LIMIT,
  assistantQuoteSchema,
  type AssistantQuote,
} from "@ggmail/shared/assistant";

export const promptKey = "assistant.unsentPrompt";
export const originKey = "assistant.unsentOrigin";
export const quoteDraftChanged = "ggmail-assistant-quote";

export const composerId = "mail-assistant-prompt";
export type QuoteInsertion =
  | { kind: "card"; quoteId: string; duplicate: boolean }
  | { kind: "text"; caret: number; trimmed: boolean }
  | { kind: "cardsFull" | "promptFull" };

// The first quote can arrive before the drawer has mounted its composer.
let pendingInsertion: QuoteInsertion | undefined;
export function takeQuoteInsertion() {
  const insertion = pendingInsertion;
  pendingInsertion = undefined;
  return insertion;
}
function notify(insertion: QuoteInsertion) {
  pendingInsertion = insertion;
  window.dispatchEvent(new Event(quoteDraftChanged));
}

const quotesKey = "assistant.unsentQuotes";

export function readQuotes(): AssistantQuote[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(quotesKey) ?? "[]");
    if (!Array.isArray(stored)) {
      return [];
    }
    // Checked one at a time, so a quote that no longer fits is dropped alone
    // rather than taking the others with it.
    return stored
      .flatMap((quote) => assistantQuoteSchema.safeParse(quote).data ?? [])
      .slice(0, QUOTE_LIMIT);
  } catch {
    return [];
  }
}
export function writeQuotes(quotes: AssistantQuote[]) {
  if (quotes.length) {
    localStorage.setItem(quotesKey, JSON.stringify(quotes));
  } else {
    localStorage.removeItem(quotesKey);
  }
}
export function clearAssistantPrompt() {
  pendingInsertion = undefined;
  writeQuotes([]);
  localStorage.removeItem(promptKey);
  localStorage.removeItem(originKey);
}

export function appendAssistantQuote(text: string | AssistantQuote) {
  if (typeof text !== "string") {
    const quotes = readQuotes();
    const existing = quotes.find(
      (quote) =>
        quote.accountId === text.accountId &&
        quote.owner === text.owner &&
        quote.messageId === text.messageId &&
        quote.mailbox === text.mailbox &&
        quote.text === text.text,
    );
    if (existing) {
      notify({ kind: "card", quoteId: existing.id, duplicate: true });
      return;
    }
    if (quotes.length >= QUOTE_LIMIT) {
      notify({ kind: "cardsFull" });
      return;
    }
    const next = [...quotes, text];
    writeQuotes(next);
    localStorage.setItem(originKey, "written");
    notify({ kind: "card", quoteId: text.id, duplicate: false });
    return;
  }
  const draft = localStorage.getItem(promptKey) ?? "";
  const field = document.getElementById(composerId);
  const at =
    field instanceof HTMLTextAreaElement && field.value === draft
      ? field.selectionEnd
      : draft.length;
  const before = draft.slice(0, at);
  const after = draft.slice(at);
  const prefix = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const room = ASSISTANT_PROMPT_LIMIT - draft.length - prefix.length - suffix.length;
  if (room < 4) {
    notify({ kind: "promptFull" });
    return;
  }
  const quoted = text
    .trim()
    .split(/\r?\n/)
    .map((line) => "> " + line)
    .join("\n");
  const trimmed = quoted.length > room;
  const excerpt = trimmed
    ? quoted.slice(0, room - 1).replace(/[\uD800-\uDBFF]$/, "") + "…"
    : quoted;
  const inserted = before + prefix + excerpt + suffix;
  localStorage.setItem(promptKey, inserted + after);
  localStorage.setItem(originKey, "written");
  notify({ kind: "text", trimmed, caret: before.length + prefix.length + excerpt.length + 2 });
}
