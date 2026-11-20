import { Trans, useLingui } from "@lingui/react/macro";
import type { AssistantReply as Reply } from "@ggmail/shared/assistant";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { ArrowUpRightIcon, FilePenLineIcon, MailIcon } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { CopyButton } from "@/components/copy-button";

export function Answer({ text }: { text: string }) {
  if (!text) {
    return null;
  }
  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-sm prose-p:my-2 prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 prose-pre:whitespace-pre-wrap max-w-none wrap-anywhere text-foreground first:*:mt-0 last:*:mb-0">
      <ReactMarkdown
        allowedElements={[
          "p",
          "em",
          "strong",
          "ul",
          "ol",
          "li",
          "code",
          "pre",
          "blockquote",
          "h1",
          "h2",
          "h3",
          "h4",
          "br",
        ]}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function AssistantReply({ reply, contextKey }: { reply: Reply; contextKey: string }) {
  const { t } = useLingui();
  const [error, setError] = useState("");
  const draft = reply.draft;
  const copyError = () => setError(t`Couldn't copy to the clipboard.`);

  return (
    <div className="space-y-3">
      <Answer text={reply.text} />
      {reply.citations.length > 0 && (
        <section
          aria-label={t`Email sources`}
          className="space-y-1.5 border-l-2 border-teal-200 pl-2.5 dark:border-teal-900"
        >
          <h3 className="text-xs font-medium text-muted-foreground">
            <Trans>Email sources</Trans>
          </h3>
          {reply.citations.map((source) => (
            <button
              key={source.id}
              type="button"
              className="flex max-w-full items-center gap-1.5 rounded-sm text-left text-xs text-teal-800 hover:underline focus-visible:outline-2 dark:text-teal-300"
              title={source.subject || t`Open email source`}
              onClick={() => {
                setError("");
                void ipc.main
                  .invoke("assistant.openSource", source.id)
                  .catch(() => setError(t`Couldn't open the email source.`));
              }}
            >
              <MailIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {source.number}. {source.subject || t`Email source`}
              </span>
            </button>
          ))}
        </section>
      )}
      {draft && (
        <section
          aria-label={t`Draft email`}
          className="overflow-hidden rounded-xl border border-teal-900/15 bg-card shadow-xs dark:border-teal-200/15"
        >
          <div className="flex items-center gap-2 border-b bg-teal-50/70 px-3.5 py-2 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            <FilePenLineIcon className="size-3.5" />
            <h3 className="flex-1 text-xs font-semibold">
              <Trans comment="Label for a suggested email draft">Draft email</Trans>
            </h3>
            <CopyButton
              value={draft.body}
              onCopyError={copyError}
              variant="ghost"
              size="icon-xs"
              title={t`Copy draft body`}
              aria-label={t`Copy draft body`}
            />
          </div>
          <div className="space-y-2.5 px-3.5 py-3">
            {draft.subject && <p className="font-semibold wrap-anywhere">{draft.subject}</p>}
            <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
              {draft.body}
            </p>
          </div>
          <div className="border-t px-3.5 py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError("");
                void ipc.main
                  .invoke("assistant.openDraft", draft, contextKey)
                  .catch(() => setError(t`Couldn't open the draft in Gmail.`));
              }}
            >
              <Trans comment="Open a suggested email in the Gmail composer">Open in Gmail</Trans>
              <ArrowUpRightIcon />
            </Button>
          </div>
        </section>
      )}
      {reply.text && (
        <CopyButton
          value={reply.text}
          onCopyError={copyError}
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          title={t`Copy reply`}
          aria-label={t`Copy reply`}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
