import type { AssistantDraft, AssistantReply as Reply } from "@ggmail/shared/assistant";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FilePenLineIcon,
  LoaderCircleIcon,
  MailIcon,
  ReplyIcon,
} from "lucide-react";
import { memo, type ReactNode, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { useConfig } from "@/lib/react-query";
import { Answer } from "./answer";
import { AssistantMailCard, CitationNumber } from "./mail-card";
import { SenderAvatar } from "./sender-avatar";

export function DraftCard({
  draft,
  copyButton,
  children,
}: {
  draft: AssistantDraft;
  copyButton?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <AssistantMailCard
      label={t`Draft email`}
      icon={FilePenLineIcon}
      title={<Trans comment="Label for a suggested email draft">Draft email</Trans>}
      tools={copyButton}
      actions={children}
    >
      {draft.subject && (
        <p dir="auto" className="text-base leading-snug font-semibold tracking-tight wrap-anywhere">
          {draft.subject}
        </p>
      )}
      <p dir="auto" className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
        {draft.body}
      </p>
    </AssistantMailCard>
  );
}

export const AssistantReply = memo(function AssistantReply({
  reply,
  contextKey,
  inThread,
  onSource,
  onInserted,
}: {
  reply: Reply;
  contextKey: string;
  inThread: boolean;
  onSource: (
    source: Reply["citations"][number],
    citations: Reply["citations"],
    trigger: HTMLButtonElement,
  ) => void;
  onInserted: () => void;
}) {
  const { t } = useLingui();
  const [error, setError] = useState("");
  const [insertion, setInsertion] = useState<"ready" | "pending" | "inserted">("ready");
  const draft = reply.draft;
  const { config } = useConfig();
  const showSenderIcons = Boolean(config?.["gmail.showSenderIcons"]);
  const senders = reply.citations.flatMap((source) => source.senders ?? []);
  const previewSenders = Array.from(
    new Map(senders.map((sender) => [sender.name + "@" + (sender.domain ?? ""), sender])).values(),
  ).slice(0, 3);
  const copyError = () => setError(t`Couldn't copy to the clipboard.`);

  function openSource(id: string, trigger: HTMLButtonElement) {
    const source = reply.citations.find((item) => item.id === id);
    if (source) {
      onSource(source, reply.citations, trigger);
    }
  }

  async function insert(body: string) {
    setError("");
    setInsertion("pending");
    try {
      const result = await ipc.main.invoke("assistant.insertReply", body, contextKey);
      if (!result.ok) {
        setInsertion("ready");
        setError(result.message);
        return;
      }
      setInsertion("inserted");
      onInserted();
    } catch {
      setInsertion("ready");
      setError(t`Open a reply in this thread and try again.`);
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <Answer
        text={reply.text}
        citations={reply.citations}
        openSource={openSource}
        showSenderIcons={showSenderIcons}
      />
      {draft && (
        <DraftCard
          draft={draft}
          copyButton={
            <CopyButton
              value={draft.body}
              onCopyError={copyError}
              variant="ghost"
              size="icon-xs"
              title={t`Copy draft body`}
              aria-label={t`Copy draft body`}
            />
          }
        >
          {inThread && (
            <Button
              size="sm"
              disabled={insertion !== "ready"}
              onClick={() => void insert(draft.body)}
            >
              {insertion === "inserted" ? (
                <CheckIcon />
              ) : insertion === "pending" ? (
                <LoaderCircleIcon className="motion-safe:animate-spin" />
              ) : (
                <ReplyIcon />
              )}
              {insertion === "inserted" ? t`Inserted into reply` : t`Insert into reply`}
            </Button>
          )}
          <Button
            variant={inThread ? "ghost" : "outline"}
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
        </DraftCard>
      )}
      {(reply.citations.length > 0 || reply.text) && (
        <div className="flex items-start gap-2 pt-1 text-muted-foreground">
          {reply.citations.length > 0 && (
            <details className="group min-w-0 flex-1">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm py-1.5 text-xs font-medium hover:text-foreground focus-visible:outline-2">
                {showSenderIcons && previewSenders.length > 0 ? (
                  <span className="flex -space-x-1.5 pe-0.5">
                    {previewSenders.map((sender) => (
                      <SenderAvatar
                        key={sender.name + "@" + sender.domain}
                        sender={sender}
                        className="size-5 text-base ring-2 ring-background"
                      />
                    ))}
                  </span>
                ) : (
                  <MailIcon className="size-3.5" />
                )}
                <Trans>Email sources</Trans>
                <span className="rounded-md bg-muted px-1.5 text-[11px] tabular-nums">
                  {reply.citations.length}
                </span>
                <ChevronDownIcon className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-1.5 divide-y rounded-lg border bg-card px-2">
                {reply.citations.map((source) => {
                  const names = source.senders
                    ?.map((sender) => sender.name)
                    .filter(Boolean)
                    .join(", ");
                  const subject = source.subject || t`Email source`;
                  return (
                    <li key={source.id}>
                      <button
                        type="button"
                        data-source-id={source.id}
                        onClick={(event) => openSource(source.id, event.currentTarget)}
                        aria-label={`${source.number}. ${subject}${names ? " · " + names : ""}`}
                        title={source.subject || t`Open email source`}
                        className="my-0.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted focus-visible:outline-2"
                      >
                        {showSenderIcons && source.senders?.[0] && (
                          <SenderAvatar sender={source.senders[0]} className="size-7 text-lg" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs leading-snug font-medium wrap-anywhere text-foreground">
                            {subject}
                          </span>
                          {names && (
                            <span className="mt-0.5 block text-[11px] leading-snug wrap-anywhere text-muted-foreground">
                              {names}
                            </span>
                          )}
                        </span>
                        <CitationNumber number={source.number} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {reply.text && (
            <CopyButton
              value={reply.text}
              onCopyError={copyError}
              variant="ghost"
              size="icon-xs"
              className="ml-auto"
              title={t`Copy reply`}
              aria-label={t`Copy reply`}
            />
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
});
