import {
  ASSISTANT_PROMPT_LIMIT,
  type AssistantActivity,
  type AssistantModel,
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
  LoaderCircleIcon,
  MailSearchIcon,
  RotateCcwIcon,
  SquareIcon,
  TextIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Answer } from "./answer";
import { AssistantReply } from "./assistant-reply";

type PromptOrigin = "starter" | "written";
type Entry = {
  id: string;
  prompt: string;
  origin: PromptOrigin;
  reply?: Reply;
  error?: string;
  interrupted?: string;
};

export function AssistantConversation({
  scope,
  contextKey,
  model,
  models,
  chooseModel,
  onReplyError,
  onInserted,
}: {
  scope: AssistantScope;
  contextKey: string;
  model: string;
  models: AssistantModel[];
  chooseModel: (model: string) => void;
  onReplyError: () => void;
  onInserted: () => void;
}) {
  const { t } = useLingui();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [composerOrigin, setComposerOrigin] = useState<PromptOrigin>("written");
  const [pending, setPending] = useState("");
  const [stopping, setStopping] = useState(false);
  const [partial, setPartial] = useState("");
  const [activity, setActivity] = useState<AssistantActivity>();
  const pendingId = useRef("");
  const lastText = useRef("");
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
    const unsubscribe = ipc.renderer.on("assistant.progress", (_event, id, text, step) => {
      if (id === pendingId.current) {
        lastText.current = text;
        setActivity(step);
        setPartial(text);
      }
    });
    return () => {
      unsubscribe();
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
  }, [entries, partial]);

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
    lastText.current = "";
    setPending(id);
    setActivity(undefined);
    setStopping(false);
    setPartial("");
    scrollMode.current = "start";
    const next = { id, prompt: input, origin };
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
        model,
        scopeKey: contextKey,
      });
      if (pendingId.current !== id) {
        return;
      }
      if (result.status === "complete") {
        finish({ reply: result.reply });
      } else if (result.status === "stopped") {
        finish({ interrupted: lastText.current });
      } else {
        finish({ error: result.message, interrupted: lastText.current });
        onReplyError();
      }
    } catch {
      if (pendingId.current === id) {
        finish({
          error: t`Couldn't reach the mail assistant. Try again.`,
          interrupted: lastText.current,
        });
      }
    } finally {
      if (pendingId.current === id) {
        pendingId.current = "";
        setPending("");
        setPartial("");
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
  const starters =
    scope === "chat"
      ? [draftStarter]
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
          {
            icon: ClipboardListIcon,
            label: t`Find to-dos`,
            prompt: t`Find my to-dos in this mail scope. Include due dates when the email gives them.`,
          },
          scope === "thread"
            ? {
                icon: FilePenLineIcon,
                label: t`Draft a reply`,
                prompt: t`Draft a reply to the open email.`,
              }
            : scope === "allMail"
              ? { icon: MailSearchIcon, label: t`Find an email`, prompt: undefined }
              : draftStarter,
        ];
  const descriptions = {
    thread: t`Use the expanded messages in this thread to summarize the exchange or prepare a reply.`,
    allMail: t`Search this account for a message, a deadline, or a conversation you need to revisit.`,
    mailView: t`Work with the email snippets visible in this Gmail view.`,
    chat: t`Describe the email you want to write, or open a Gmail thread to work with its messages.`,
  };

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div
          ref={transcript}
          className="h-full overflow-y-auto overscroll-contain px-4 [overflow-anchor:none]"
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
            <div className="px-1 pt-7 pb-5">
              <h2 className="text-xl font-semibold tracking-tight">
                <Trans>What can I help you with?</Trans>
              </h2>
              <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">
                {descriptions[scope]}
              </p>
              <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {starters.map(({ icon: Icon, label, prompt: value }) => (
                  <button
                    key={label}
                    type="button"
                    className="group flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm font-medium hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-offset-[-2px]"
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
                    <Icon className="size-4 text-teal-700 dark:text-teal-400" />
                    {label}
                    {value ? (
                      <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
                    ) : (
                      <ArrowUpRightIcon className="ml-auto size-3.5 text-muted-foreground" />
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
              className="space-y-6 py-5 text-sm"
            >
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  ref={index === entries.length - 1 ? latestTurn : undefined}
                  className="min-w-0 space-y-3"
                >
                  {entry.origin === "written" && (
                    <div className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-sm bg-teal-50 px-3.5 py-2.5 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-teal-950 dark:bg-teal-950/65 dark:text-teal-50">
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
                  {entry.interrupted && <Answer text={entry.interrupted} />}
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
                  {pending === entry.id &&
                    (partial ? (
                      <div aria-live="off">
                        <Answer text={partial} />
                      </div>
                    ) : (
                      <p
                        role="status"
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" />
                        {activity === "searching"
                          ? t`Searching All Mail…`
                          : activity === "drafting"
                            ? t`Preparing your draft…`
                            : t`Working on your request…`}
                      </p>
                    ))}
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
        className="shrink-0 border-t bg-sidebar p-3"
      >
        <div className="rounded-xl border border-input bg-background shadow-xs focus-within:border-teal-600/65 dark:focus-within:border-teal-400/65">
          <Textarea
            ref={composer}
            aria-label={t`Message the mail assistant`}
            className="max-h-[min(18vh,9rem)] min-h-12 resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={prompt}
            placeholder={scope === "chat" ? t`Write a message…` : t`Ask about your mail…`}
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
              value={model}
              onValueChange={(value) => value && chooseModel(value)}
            >
              <SelectTrigger
                size="sm"
                className="max-w-[68%] min-w-0 border-0 px-1.5 text-xs text-muted-foreground hover:bg-muted dark:bg-transparent"
                aria-label={t`ChatGPT model`}
              >
                <SelectValue className="block truncate" />
              </SelectTrigger>
              <SelectContent align="start" side="top" className="max-w-64">
                {models.map(({ id, label }) => (
                  <SelectItem
                    key={id}
                    value={id}
                    className="**:data-[slot=select-item-text]:min-w-0"
                  >
                    {label}
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
                size="icon-sm"
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
                size="icon-sm"
                className="rounded-lg bg-teal-800 text-white hover:bg-teal-900 disabled:bg-muted disabled:text-muted-foreground dark:bg-teal-300 dark:text-teal-950 dark:hover:bg-teal-200"
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
