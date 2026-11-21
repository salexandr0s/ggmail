import {
  ASSISTANT_PROMPT_LIMIT,
  type AssistantActivity as Activity,
  type AssistantDraft,
  type AssistantModel,
  type AssistantProvider,
  providerNames,
  type AssistantReply as Reply,
  type AssistantScope,
} from "@ggmail/shared/assistant";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { Textarea } from "@ggmail/ui/components/textarea";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FilePenLineIcon,
  MailSearchIcon,
  RotateCcwIcon,
  SquareIcon,
  TextIcon,
} from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Answer } from "./answer";
import { AssistantActivity } from "./assistant-activity";
import { AssistantReply, DraftCard } from "./assistant-reply";
import { ModelLogo } from "./model-logo";

type PromptOrigin = "starter" | "written";
type Preview = {
  text: string;
  draft?: AssistantDraft;
  activity?: Activity;
};
type Entry = {
  id: string;
  prompt: string;
  origin: PromptOrigin;
  modelName: string;
  reply?: Reply;
  error?: string;
  interrupted?: Preview;
};

const ReplyPreview = memo(function ReplyPreview({ text, draft }: Pick<Preview, "text" | "draft">) {
  return (
    <>
      {text && <Answer text={text} />}
      {draft && <DraftCard draft={draft} />}
    </>
  );
});

export function AssistantConversation({
  provider,
  scope,
  contextKey,
  models,
  model,
  chooseModel,
  onReplyError,
  onInserted,
}: {
  provider: AssistantProvider;
  scope: AssistantScope;
  contextKey: string;
  models: AssistantModel[];
  model: AssistantModel;
  chooseModel: (id: string) => void;
  onReplyError: () => void;
  onInserted: () => void;
}) {
  const { t } = useLingui();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [composerOrigin, setComposerOrigin] = useState<PromptOrigin>("written");
  const [pending, setPending] = useState("");
  const [stopping, setStopping] = useState(false);
  const [preview, setPreview] = useState<Preview>({ text: "" });
  const pendingId = useRef("");
  const latestPreview = useRef<Preview>({ text: "" });
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const latestTurn = useRef<HTMLDivElement>(null);
  const scrollMode = useRef<"start" | "end" | "reading">("start");
  const lastScrollTop = useRef(0);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    if (document.activeElement === document.getElementById("mail-assistant")) {
      composer.current?.focus();
    }
    let frame: number | undefined;
    const unsubscribe = ipc.renderer.on("assistant.progress", (_event, id, text, activity) => {
      if (id !== pendingId.current || (!text && !activity)) {
        return;
      }
      const previous = latestPreview.current;
      // Text snapshots start afresh each provider round. Keep the previous one
      // visible during mail actions and retain unpainted text when Stop arrives.
      latestPreview.current = {
        text: text || previous.text,
        draft: activity?.kind === "draftReady" ? activity.draft : previous.draft,
        activity,
      };
      if (frame === undefined) {
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (pendingId.current) {
            setPreview(latestPreview.current);
          }
        });
      }
    });
    return () => {
      unsubscribe();
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      if (pendingId.current) {
        ipc.main.send("assistant.stop", pendingId.current);
        pendingId.current = "";
      }
    };
  }, []);

  useLayoutEffect(() => {
    const view = transcript.current;
    const turn = latestTurn.current;
    if (!view || !turn) {
      return;
    }
    if (scrollMode.current === "start") {
      view.scrollTop += turn.getBoundingClientRect().top - view.getBoundingClientRect().top - 16;
    } else if (scrollMode.current === "end") {
      view.scrollTop = view.scrollHeight;
    }
    lastScrollTop.current = view.scrollTop;
    setShowJump(view.scrollHeight - view.scrollTop - view.clientHeight > 48);
  }, [entries, preview]);

  // Resizing the window or expanding sources can change what is below the
  // fold without a scroll event. Neither should move the reader's place.
  const hasEntries = entries.length > 0;
  useEffect(() => {
    const view = transcript.current;
    if (!hasEntries || !view?.firstElementChild) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setShowJump(view.scrollHeight - view.scrollTop - view.clientHeight > 48),
    );
    observer.observe(view);
    observer.observe(view.firstElementChild);
    return () => observer.disconnect();
  }, [hasEntries]);

  async function send(value: string, origin: PromptOrigin, retry?: string) {
    const input = value.trim();
    if (!input || pendingId.current) {
      return;
    }

    const id = crypto.randomUUID();
    pendingId.current = id;
    const initial: Preview = { text: "", activity: { kind: "waiting" } };
    latestPreview.current = initial;
    setPreview(initial);
    setPending(id);
    setStopping(false);
    scrollMode.current = "start";
    const next = { id, prompt: input, origin, modelName: model.label };
    setEntries((previous) =>
      retry ? previous.map((entry) => (entry.id === retry ? next : entry)) : [...previous, next],
    );

    function finish(result: Partial<Entry>) {
      setEntries((previous) =>
        previous.map((entry) => (entry.id === id ? { ...entry, ...result } : entry)),
      );
    }
    try {
      const result = await ipc.main.invoke("assistant.send", {
        id,
        prompt: input,
        model: model.id,
        provider,
        scopeKey: contextKey,
      });
      if (pendingId.current !== id) {
        return;
      }
      if (result.status === "complete") {
        finish({ reply: result.reply });
      } else if (result.status === "stopped") {
        finish({ interrupted: latestPreview.current });
      } else {
        finish({ error: result.message, interrupted: latestPreview.current });
        onReplyError();
      }
    } catch {
      if (pendingId.current === id) {
        finish({
          error: t`Couldn't reach the mail assistant. Try again.`,
          interrupted: latestPreview.current,
        });
      }
    } finally {
      if (pendingId.current === id) {
        pendingId.current = "";
        setPending("");
        latestPreview.current = { text: "" };
        setPreview(latestPreview.current);
        setStopping(false);
      }
    }
  }

  function submit() {
    if (!prompt.trim() || pendingId.current) {
      return;
    }
    void send(prompt, composerOrigin);
    setPrompt("");
    setComposerOrigin("written");
    composer.current?.focus();
  }

  const draftStarter = {
    icon: FilePenLineIcon,
    label: t`Draft an email`,
    prompt: t`Help me draft an email. Ask me for the details you need.`,
  };
  const findEmail = { icon: MailSearchIcon, label: t`Find an email`, prompt: undefined };
  const findTodos = {
    icon: ClipboardListIcon,
    label: t`Find to-dos`,
    prompt: t`Find my to-dos in this mail scope. Include due dates when the email gives them.`,
  };
  const starters =
    scope === "chat"
      ? [findEmail, findTodos, draftStarter]
      : [
          scope === "thread"
            ? {
                icon: TextIcon,
                label: t`Summarize this email`,
                prompt: t`Summarize the open email and highlight anything I should know.`,
              }
            : {
                icon: TextIcon,
                label: t`Catch me up`,
                prompt: t`Catch me up on recent emails in this view. What needs my attention?`,
              },
          findTodos,
          scope === "thread"
            ? {
                icon: FilePenLineIcon,
                label: t`Draft a reply`,
                prompt: t`Draft a reply to the open email.`,
              }
            : findEmail,
          ...(scope === "mailView" ? [draftStarter] : []),
        ];

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div
          ref={transcript}
          className="h-full overflow-y-auto overscroll-contain px-5 [overflow-anchor:none]"
          onScroll={(event) => {
            const view = event.currentTarget;
            const below = view.scrollHeight - view.scrollTop - view.clientHeight;
            if (Math.abs(view.scrollTop - lastScrollTop.current) > 1) {
              scrollMode.current = below < 2 ? "end" : "reading";
            }
            lastScrollTop.current = view.scrollTop;
            setShowJump(below > 48);
          }}
        >
          {entries.length === 0 ? (
            <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center py-8">
              <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
                <Trans>What can I help you with?</Trans>
              </h2>
              <div className="mt-5 grid gap-2">
                {starters.map(({ icon: Icon, label, prompt: value }) => (
                  <button
                    key={label}
                    type="button"
                    className="group flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left text-sm font-medium transition-colors hover:border-input hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => {
                      if (value) {
                        void send(value, "starter");
                      } else {
                        if (!prompt.trim()) {
                          setPrompt(t`Find emails about `);
                          setComposerOrigin("starter");
                        }
                        composer.current?.focus();
                      }
                    }}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">{label}</span>
                    {value ? (
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    ) : (
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              role="log"
              aria-label={t`Mail assistant conversation`}
              aria-live="polite"
              className="space-y-6 py-6 text-sm"
            >
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  ref={index === entries.length - 1 ? latestTurn : undefined}
                  className="min-w-0 space-y-3"
                >
                  {entry.origin === "written" && (
                    <div className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-md border border-border/60 bg-muted px-3.5 py-2.5 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-foreground">
                      {entry.prompt}
                    </div>
                  )}
                  {entry.reply && (
                    <AssistantReply
                      reply={entry.reply}
                      contextKey={contextKey}
                      inThread={scope === "thread"}
                      onInserted={onInserted}
                    />
                  )}
                  {entry.interrupted && <ReplyPreview {...entry.interrupted} />}
                  {(entry.error || entry.interrupted !== undefined) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {entry.error ? (
                        <span role="alert" className="text-destructive">
                          {entry.error}
                        </span>
                      ) : (
                        <span>
                          <Trans>Reply stopped</Trans>
                        </span>
                      )}
                      {index === entries.length - 1 && !pending && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void send(entry.prompt, entry.origin, entry.id)}
                        >
                          <RotateCcwIcon />
                          <Trans>Try again</Trans>
                        </Button>
                      )}
                    </div>
                  )}
                  {pending === entry.id && (
                    <>
                      {(preview.text || preview.draft) && (
                        <div aria-live="off" className="min-w-0 space-y-3">
                          <ReplyPreview text={preview.text} draft={preview.draft} />
                        </div>
                      )}
                      {preview.activity && (
                        <AssistantActivity
                          activity={preview.activity}
                          modelName={entry.modelName}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {showJump && entries.length > 0 && (
          <Button
            variant="outline"
            size="icon-sm"
            className="absolute right-4 bottom-2 rounded-full shadow-sm"
            title={t`Jump to latest reply`}
            aria-label={t`Jump to latest reply`}
            onClick={() => {
              const view = transcript.current;
              if (view) {
                scrollMode.current = "end";
                view.scrollTop = view.scrollHeight;
                lastScrollTop.current = view.scrollTop;
                setShowJump(false);
              }
            }}
          >
            <ArrowDownIcon />
          </Button>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="shrink-0 bg-background px-4 pt-2 pb-4"
      >
        <div className="rounded-2xl border border-input bg-card shadow-xs transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40">
          <Textarea
            ref={composer}
            aria-label={t`Message the mail assistant`}
            className="max-h-[min(18vh,9rem)] min-h-12 resize-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={prompt}
            placeholder={t`Ask about your mail…`}
            maxLength={ASSISTANT_PROMPT_LIMIT}
            onChange={(event) => {
              setPrompt(event.target.value);
              setComposerOrigin("written");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              submit();
            }}
          />
          <div className="flex min-w-0 items-center justify-between gap-2 px-2 pb-2">
            <Select
              items={models.map(({ id, label }) => ({ value: id, label }))}
              value={model.id}
              onValueChange={(value) => value && chooseModel(value)}
            >
              <SelectTrigger
                size="sm"
                className="max-w-[68%] min-w-0 border-transparent px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-muted"
                title={providerNames[provider]}
                aria-label={t`Assistant model`}
              >
                <ModelLogo provider={provider} model={model.id} className="size-3.5" />
                <SelectValue className="min-w-0 truncate">{model.label}</SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                side="top"
                alignItemWithTrigger={false}
                className="w-max max-w-[min(20rem,var(--available-width))] min-w-48"
              >
                {models.map(({ id, label }) => (
                  <SelectItem
                    key={id}
                    value={id}
                    className="min-h-8 [&>span:first-child]:min-w-0 [&>span:first-child]:shrink"
                  >
                    <ModelLogo provider={provider} model={id} className="size-4 self-center" />
                    <span className="truncate" title={label}>
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {prompt.length >= ASSISTANT_PROMPT_LIMIT - 200 && (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {prompt.length}/{ASSISTANT_PROMPT_LIMIT}
              </span>
            )}
            {pending ? (
              <Button
                type="button"
                size="icon"
                className="rounded-full hover:bg-primary/85"
                title={t`Stop reply`}
                aria-label={t`Stop reply`}
                disabled={stopping}
                onClick={() => {
                  setStopping(true);
                  ipc.main.send("assistant.stop", pending);
                }}
              >
                <SquareIcon className="size-3 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="rounded-full hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                title={t`Send chat message`}
                aria-label={t`Send chat message`}
                disabled={!prompt.trim()}
              >
                <ArrowUpIcon />
              </Button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
