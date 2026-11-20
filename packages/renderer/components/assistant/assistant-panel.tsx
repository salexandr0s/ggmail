import { getAccountLabel } from "@ggmail/shared/accounts";
import {
  assistantPanelWidth,
  type AssistantConnection,
  type AssistantContext,
} from "@ggmail/shared/assistant";
import { ms } from "@ggmail/shared/ms";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@ggmail/ui/components/dropdown-menu";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  EllipsisIcon,
  LoaderCircleIcon,
  MailOpenIcon,
  MessageSquarePlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AssistantConversation } from "./assistant-conversation";
import chatGPTLogo from "./chatgpt-logo.svg";

function watchWidth(update: () => void) {
  window.addEventListener("resize", update);
  return () => window.removeEventListener("resize", update);
}

function getWidth() {
  return assistantPanelWidth(window.innerWidth);
}

const modelPreferenceKey = "assistant.model";

export function AssistantPanel({ close }: { close: (focusToggle?: boolean) => void }) {
  const { t } = useLingui();
  const width = useSyncExternalStore(watchWidth, getWidth);
  const panel = useRef<HTMLElement>(null);
  const [connection, setConnection] = useState<AssistantConnection>();
  const [context, setContext] = useState<AssistantContext>();
  const [modelPreference, setModelPreference] = useState(() =>
    localStorage.getItem(modelPreferenceKey),
  );
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<
    "assistant.connect" | "assistant.disconnect" | "assistant.status"
  >();
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let readingContext = false;
    let connectionChanged = false;
    async function updateContext() {
      if (readingContext) {
        return;
      }
      readingContext = true;
      try {
        const next = await ipc.main.invoke("assistant.context");
        if (mounted) {
          setContext((current) =>
            current?.key === next.key && current.accountLabel === next.accountLabel
              ? current
              : next,
          );
        }
      } catch {
        if (mounted) {
          setContext(undefined);
        }
      } finally {
        readingContext = false;
      }
    }

    panel.current?.focus();
    ipc.main.send("assistant.setVisible", true);
    // The browser sign-in can outlive the panel that started it.
    const unsubscribe = ipc.renderer.on("assistant.connectionChanged", (_event, value) => {
      connectionChanged = true;
      setConnection(value);
    });
    void ipc.main.invoke("assistant.status").then(
      (value) => {
        if (mounted && !connectionChanged) {
          setConnection(value);
        }
      },
      () => {
        if (mounted && !connectionChanged) {
          setConnection({ status: "disconnected", models: [] });
        }
      },
    );
    void updateContext();
    const timer = setInterval(() => void updateContext(), ms("750 milliseconds"));
    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(timer);
      ipc.main.send("assistant.setVisible", false);
    };
  }, []);

  const model =
    connection?.models.find((choice) => choice.id === modelPreference)?.id ??
    connection?.models[0]?.id ??
    "";
  const scopes = {
    thread: t`Open email`,
    allMail: t`All mail`,
    mailView: t`Current mail view`,
    chat: t`Chat only`,
  };
  const connected = connection?.status === "connected";
  const ready = connected && Boolean(model);
  const signingIn = action === "assistant.connect" || connection?.status === "connecting";

  function newChat() {
    ipc.main.send("assistant.clear");
    panel.current?.focus();
    setRevision((previous) => previous + 1);
  }

  async function update(next: NonNullable<typeof action>) {
    setAction(next);
    setError("");
    try {
      setConnection(await ipc.main.invoke(next));
      if (next === "assistant.disconnect") {
        setRevision((previous) => previous + 1);
      }
    } catch {
      setError(t`Couldn't update the ChatGPT connection. Try again.`);
    } finally {
      setAction(undefined);
    }
  }

  return (
    <aside
      id="mail-assistant"
      ref={panel}
      tabIndex={-1}
      aria-label={t`Mail assistant`}
      className="absolute inset-y-0 right-0 flex min-w-0 flex-col border-l border-sidebar-border bg-background outline-none"
      style={{ width }}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.currentTarget.contains(event.target as Node) &&
          !event.currentTarget.querySelector('[aria-expanded="true"]')
        ) {
          event.preventDefault();
          close();
        }
      }}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b bg-sidebar px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200">
          <SparklesIcon className="size-[17px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            <Trans>Mail assistant</Trans>
          </h1>
          {ready && context && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0">{scopes[context.kind]}</span>
              {context.kind !== "chat" && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate" title={getAccountLabel(context.accountLabel)}>
                    {getAccountLabel(context.accountLabel)}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {ready && (
            <Button
              variant="ghost"
              size="icon-sm"
              title={t`New chat`}
              aria-label={t`New chat`}
              onClick={newChat}
            >
              <MessageSquarePlusIcon />
            </Button>
          )}
          {connection && (connection.email || connected || connection.error) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={t`ChatGPT connection`}
                    aria-label={t`ChatGPT connection`}
                  />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-max max-w-64">
                <DropdownMenuGroup>
                  {connection.email && (
                    <DropdownMenuLabel className="truncate">{connection.email}</DropdownMenuLabel>
                  )}
                  <DropdownMenuItem
                    disabled={Boolean(action) || signingIn}
                    onClick={() => void update("assistant.disconnect")}
                  >
                    <Trans comment="Disconnect the linked ChatGPT account from the mail assistant">
                      Disconnect ChatGPT
                    </Trans>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title={t`Close mail assistant`}
            aria-label={t`Close mail assistant`}
            onClick={() => close()}
          >
            <XIcon />
          </Button>
        </div>
      </header>
      {(error || connection?.error) && (
        <p
          role="alert"
          className="border-b bg-destructive/5 px-4 py-2 text-xs leading-relaxed text-destructive"
        >
          {error || connection?.error}
        </p>
      )}
      {ready && connection && context ? (
        <AssistantConversation
          key={JSON.stringify([context.key, revision])}
          scope={context.kind}
          contextKey={context.key}
          model={model}
          models={connection.models}
          chooseModel={(id) => {
            localStorage.setItem(modelPreferenceKey, id);
            setModelPreference(id);
          }}
          onReplyError={() => void update("assistant.status")}
          onInserted={() => {
            if (getWidth() === window.innerWidth) {
              close(false);
            }
          }}
        />
      ) : !connection || ready ? (
        <p role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 motion-safe:animate-spin" />
          {ready ? t`Waiting for the mail view…` : t`Checking ChatGPT connection…`}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-linear-to-b from-teal-50/50 via-background to-background px-6 py-8 dark:from-teal-950/20">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-teal-200/70 bg-background text-teal-700 shadow-xs dark:border-teal-900 dark:text-teal-300">
            <MailOpenIcon className="size-6" strokeWidth={1.6} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            {connected ? t`ChatGPT models unavailable` : t`Connect ChatGPT`}
          </h2>
          <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">
            {connected
              ? t`Reload the model list to start a conversation.`
              : t`Ask about an email, find to-dos, or draft a reply. When you ask, ChatGPT receives the relevant mail from your current view.`}
          </p>
          {connected ? (
            <Button
              variant="outline"
              disabled={Boolean(action)}
              onClick={() => void update("assistant.status")}
            >
              <Trans>Reload ChatGPT models</Trans>
            </Button>
          ) : signingIn ? (
            <div className="space-y-3">
              <p role="status" className="flex items-center gap-2 text-sm">
                <LoaderCircleIcon className="size-4 motion-safe:animate-spin" />
                <Trans>Finish signing in in your browser.</Trans>
              </p>
              <Button variant="outline" onClick={() => ipc.main.send("assistant.cancelSignIn")}>
                <Trans comment="Cancel ChatGPT sign-in">Cancel sign-in</Trans>
              </Button>
            </div>
          ) : (
            <Button
              className="h-9 bg-black px-3 text-white hover:bg-neutral-800 dark:border dark:border-neutral-600"
              disabled={Boolean(action)}
              data-oai-siwc-button=""
              onClick={() => void update("assistant.connect")}
            >
              <img src={chatGPTLogo} className="size-4" alt="" />
              <Trans>Continue with ChatGPT</Trans>
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
