import {
  ASSISTANT_PROMPT_LIMIT,
  type AssistantActivity as Activity,
  type AssistantDraft,
  type AssistantModel,
  type AssistantEffort,
  type AssistantProvider,
  providerNames,
  type AssistantReply as Reply,
  type AssistantContext,
  type AssistantTurn,
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
  ClipboardListIcon,
  FilePenLineIcon,
  MailSearchIcon,
  RotateCcwIcon,
  SquareIcon,
  TextIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Answer } from "./answer";
import { AssistantActivity } from "./assistant-activity";
import { AssistantReply, DraftCard } from "./assistant-reply";
import { EffortPicker } from "./effort-picker";
import { ModelLogo } from "./model-logo";
import { SourcePreview } from "./source-preview";

type PromptOrigin = AssistantTurn["origin"];
type Preview = {
  text: string;
  draft?: AssistantDraft;
  activity?: Activity;
};
type Entry = AssistantTurn & { modelName?: string };

const promptKey = "assistant.unsentPrompt";
const originKey = "assistant.unsentOrigin";

export function clearAssistantPrompt() {
  localStorage.removeItem(promptKey);
  localStorage.removeItem(originKey);
}

const ReplyPreview = memo(function ReplyPreview({
  text,
  draft,
  streaming,
}: Pick<Preview, "text" | "draft"> & { streaming?: boolean }) {
  return (
    <>
      {text && <Answer text={text} streaming={streaming} />}
      {draft && <DraftCard draft={draft} />}
    </>
  );
});

export function AssistantConversation({
  provider,
  context,
  initialEntries,
  models,
  model,
  chooseModel,
  effort,
  chooseEffort,
  onReplyError,
  onInserted,
}: {
  provider: AssistantProvider;
  context?: AssistantContext;
  initialEntries: AssistantTurn[];
  models: AssistantModel[];
  model?: AssistantModel;
  chooseModel: (id: string) => void;
  effort?: AssistantEffort;
  chooseEffort: (level?: AssistantEffort) => void;
  onReplyError: () => void;
  onInserted: () => void;
}) {
  const { t } = useLingui();
  const [source, setSource] = useState<{
    citation: Reply["citations"][number];
    citations: Reply["citations"];
    occurrence: number;
  } | null>(null);
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [prompt, setPrompt] = useState(() => localStorage.getItem(promptKey) ?? "");
  const [composerOrigin, setComposerOrigin] = useState<PromptOrigin>(() =>
    localStorage.getItem(originKey) === "starter" ? "starter" : "written",
  );
  function updatePrompt(value: string, origin: PromptOrigin) {
    if (value) {
      localStorage.setItem(promptKey, value);
      localStorage.setItem(originKey, origin);
    } else {
      clearAssistantPrompt();
    }
    setPrompt(value);
    setComposerOrigin(origin);
  }
  const scope = context?.kind;
  const [pending, setPending] = useState("");
  const [stopping, setStopping] = useState(false);
  const [preview, setPreview] = useState<Preview>({ text: "" });
  const pendingId = useRef("");
  const latestPreview = useRef<Preview>({ text: "" });
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  // Markdown can recreate inline citation buttons. Resolve the same occurrence after Back.
  const citationButtons = useCallback(
    (id: string) =>
      Array.from(
        transcript.current?.querySelectorAll<HTMLButtonElement>(
          // oxlint-disable-next-line lingui/no-unlocalized-strings -- DOM selector for the citation trigger.
          `button[data-source-id="${CSS.escape(id)}"]`,
        ) ?? [],
      ),
    [],
  );
  const showSource = useCallback(
    (
      citation: Reply["citations"][number],
      citations: Reply["citations"],
      trigger: HTMLButtonElement,
    ) => {
      setSource({ citation, citations, occurrence: citationButtons(citation.id).indexOf(trigger) });
    },
    [citationButtons],
  );
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
    if (!input || pendingId.current || !model || (origin === "starter" && !context)) {
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
    const next = {
      id,
      prompt: input,
      origin,
      modelName: model.label,
      scopeKey: context?.key ?? "",
    };
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
        effort,
        provider,
        // A written question uses the mailbox active when it reaches the agent.
        // A contextual starter belongs to the view that displayed its button.
        scopeKey: origin === "starter" ? context?.key : undefined,
        origin,
        retry,
      });
      if (pendingId.current !== id) {
        return;
      }
      if (result.status === "complete") {
        finish({ reply: result.reply, scopeKey: result.scopeKey });
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
    if (
      !prompt.trim() ||
      pendingId.current ||
      !model ||
      (composerOrigin === "starter" && !context)
    ) {
      return;
    }
    void send(prompt, composerOrigin);
    updatePrompt("", "written");
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

  if (!model && !entries.length && !prompt) {
    return null;
  }

  return (
    <>
      {source && (
        <SourcePreview
          initial={source.citation}
          citations={source.citations}
          onBack={() => {
            setSource(null);
            requestAnimationFrame(() =>
              (citationButtons(source.citation.id)[source.occurrence] ?? composer.current)?.focus({
                preventScroll: true,
              }),
            );
          }}
        />
      )}
      <div hidden={!!source} className="relative min-h-0 flex-1">
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
            <div className="flex min-h-full flex-col justify-end py-2">
              <div className="grid gap-1">
                {context &&
                  model &&
                  starters.map(({ icon: Icon, label, prompt: value }) => (
                    <button
                      key={label}
                      type="button"
                      className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      onClick={() => {
                        if (value) {
                          void send(value, "starter");
                        } else {
                          if (!prompt.trim()) {
                            updatePrompt(t`Find emails about `, "starter");
                          }
                          composer.current?.focus();
                        }
                      }}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">{label}</span>
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
                      turnId={entry.id}
                      currentView={context?.key === entry.scopeKey}
                      inThread={scope === "thread" && context?.key === entry.scopeKey}
                      onSource={showSource}
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
                      {index === entries.length - 1 && !pending && model && context && (
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
                          <ReplyPreview text={preview.text} draft={preview.draft} streaming />
                        </div>
                      )}
                      {preview.activity && (
                        <AssistantActivity
                          activity={preview.activity}
                          modelName={entry.modelName ?? ""}
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
        hidden={!!source}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="shrink-0 bg-card px-4 pt-2 pb-4"
      >
        <div className="rounded-3xl border border-transparent bg-secondary transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/40">
          <Textarea
            ref={composer}
            aria-label={t`Message the mail assistant`}
            className="max-h-[min(18vh,9rem)] min-h-12 resize-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={prompt}
            placeholder={t`Ask about your mail…`}
            maxLength={ASSISTANT_PROMPT_LIMIT}
            onChange={(event) => {
              updatePrompt(event.target.value, "written");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              submit();
            }}
          />
          {prompt.length >= ASSISTANT_PROMPT_LIMIT - 200 && (
            <span className="block px-3 pb-1 text-right text-xs text-muted-foreground tabular-nums">
              {prompt.length}/{ASSISTANT_PROMPT_LIMIT}
            </span>
          )}
          <div className="flex min-w-0 items-center justify-between gap-1 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-0.5">
              {model && (
                <>
                  <Select
                    items={models.map(({ id, label }) => ({ value: id, label }))}
                    value={model.id}
                    onValueChange={(value) => value && chooseModel(value)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="max-w-56 min-w-0 border-transparent px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-muted"
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
                          <ModelLogo
                            provider={provider}
                            model={id}
                            className="size-4 self-center"
                          />
                          <span className="truncate" title={label}>
                            {label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <EffortPicker compact model={model} effort={effort} chooseEffort={chooseEffort} />
                </>
              )}
            </div>
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
                disabled={!prompt.trim() || !model || (composerOrigin === "starter" && !context)}
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
