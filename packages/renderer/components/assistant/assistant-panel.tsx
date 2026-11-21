import { getAccountLabel } from "@ggmail/shared/accounts";
import {
  assistantPanelWidth,
  providerNames,
  type AssistantContext,
} from "@ggmail/shared/assistant";
import { ms } from "@ggmail/shared/ms";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  InboxIcon,
  SettingsIcon,
  LoaderCircleIcon,
  MailOpenIcon,
  MessageSquarePlusIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAssistantConnection } from "@/lib/use-assistant-connection";
import { useAssistantModel } from "@/lib/use-assistant-model";
import { AssistantConversation } from "./assistant-conversation";
import { ModelLogo } from "./model-logo";
import "./assistant-drawer.css";

function watchWidth(update: () => void) {
  window.addEventListener("resize", update);
  return () => window.removeEventListener("resize", update);
}

function getWidth() {
  return assistantPanelWidth(window.innerWidth);
}

type ClosePanel = (focusToggle?: boolean) => void;

export function AssistantDrawer({ open, close }: { open: boolean; close: ClosePanel }) {
  const width = useSyncExternalStore(watchWidth, getWidth);
  const clip = useRef<HTMLDivElement>(null);
  const nextSession = useRef(0);
  const [session, setSession] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = clip.current;
    if (!element) {
      return;
    }
    // The Gmail WebContentsView is above this renderer. Follow the actual
    // moving edge, including CSS transition reversals and window resizes.
    let lastInset = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const inset = Math.round(entry.contentRect.width);
      if (inset !== lastInset) {
        lastInset = inset;
        ipc.main.send("assistant.setInset", inset);
      }
      if (!entry.contentRect.width && element.inert) {
        setSession(null);
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      ipc.main.send("assistant.setInset", 0);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      if (!clip.current?.offsetWidth) {
        setSession(null);
      }
      return;
    }
    setSession(++nextSession.current);
    ipc.main.send("assistant.setVisible", true);
    return () => ipc.main.send("assistant.setVisible", false);
  }, [open]);

  return (
    <div
      ref={clip}
      inert={!open}
      data-open={open || undefined}
      className="assistant-drawer absolute inset-y-0 right-0 overflow-clip"
      style={{ width: `calc(var(--assistant-reveal) * ${width}px)` }}
    >
      {session !== null && <AssistantPanel key={session} width={width} close={close} />}
    </div>
  );
}

function AssistantPanel({ width, close }: { width: number; close: ClosePanel }) {
  const { t } = useLingui();
  const panel = useRef<HTMLElement>(null);
  const { connection, refresh } = useAssistantConnection();
  const provider = connection?.provider ?? "chatgpt";
  const { model, chooseModel } = useAssistantModel(provider, connection?.models ?? []);
  const [context, setContext] = useState<AssistantContext>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let mounted = true;
    let readingContext = false;
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
    void updateContext();
    const timer = setInterval(() => void updateContext(), ms("750 milliseconds"));
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const scopes = {
    thread: t`Open email`,
    allMail: t`All mail`,
    mailView: t`Current mail view`,
    chat: t`All accounts`,
  };
  const connected = connection?.status === "connected";
  const ready = connected && Boolean(connection.models.length);
  function newChat() {
    ipc.main.send("assistant.clear");
    panel.current?.focus();
    setRevision((previous) => previous + 1);
  }

  return (
    <aside
      id="mail-assistant"
      ref={panel}
      tabIndex={-1}
      aria-label={t`Mail assistant`}
      className="absolute inset-y-0 left-0 flex min-w-0 flex-col border-l border-sidebar-border bg-background outline-none"
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
      <header className="shrink-0 border-b bg-sidebar">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-background text-foreground shadow-xs">
            {connection ? (
              <ModelLogo provider={provider} model={model?.id} className="size-5" />
            ) : (
              <MailOpenIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm leading-snug font-semibold tracking-tight">
              <Trans>Mail assistant</Trans>
            </h1>
            {connection && (
              <p
                className="truncate text-xs leading-relaxed text-muted-foreground"
                title={model?.label ?? providerNames[provider]}
              >
                {model?.label ?? providerNames[provider]}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
            {ready && (
              <Button
                variant="ghost"
                size="icon"
                title={t`New chat`}
                aria-label={t`New chat`}
                onClick={newChat}
              >
                <MessageSquarePlusIcon />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              title={t`AI settings`}
              aria-label={t`AI settings`}
              onClick={() => void ipc.main.invoke("assistant.openSettings")}
            >
              <SettingsIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t`Close mail assistant`}
              aria-label={t`Close mail assistant`}
              onClick={() => close()}
            >
              <XIcon />
            </Button>
          </div>
        </div>
        {ready && context && (
          <p className="flex min-w-0 items-center gap-2 border-t border-border/70 px-5 py-2 text-xs text-muted-foreground">
            {context.kind === "thread" ? (
              <MailOpenIcon aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <InboxIcon aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="shrink-0 font-medium">{scopes[context.kind]}</span>
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
      </header>
      {connection?.error && (
        <p
          role="alert"
          className="border-b bg-destructive/5 px-4 py-2 text-xs leading-relaxed text-destructive"
        >
          {connection.error}
        </p>
      )}
      {ready && model && connection && context ? (
        <AssistantConversation
          key={JSON.stringify([context.key, provider, revision])}
          provider={provider}
          scope={context.kind}
          contextKey={context.key}
          models={connection.models}
          model={model}
          chooseModel={chooseModel}
          onReplyError={() => void refresh()}
          onInserted={() => {
            if (getWidth() === window.innerWidth) {
              close(false);
            }
          }}
        />
      ) : !connection || connection.status === "connecting" || ready ? (
        <p role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 motion-safe:animate-spin" />
          {ready ? t`Waiting for the mail view…` : t`Checking connection…`}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <div className="mx-auto flex min-h-full w-full max-w-sm flex-col items-start justify-center py-8">
            <div className="mb-4 grid size-10 place-items-center rounded-xl bg-muted text-foreground">
              <MailOpenIcon aria-hidden="true" className="size-5" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              <Trans>Set up the mail assistant</Trans>
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">
              <Trans>Choose a provider in AI settings to ask about mail or draft a reply.</Trans>
            </p>
            <Button onClick={() => void ipc.main.invoke("assistant.openSettings")}>
              <Trans>Open AI settings</Trans>
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
