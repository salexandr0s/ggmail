import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Input } from "@ggmail/ui/components/input";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleCheck,
  CircleAlert,
  LoaderCircle,
  Mail,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderApp } from "./lib/react";
import "./task-draft.css";

const load = () => ipc.main.invoke("taskDraft.read");
function TaskDraft() {
  const { t } = useLingui();
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof load>>>();
  const [operation, setOperation] = useState("");
  const busy = !!operation;
  const dateInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) {
      alert.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  useEffect(() => {
    // The draft lives in the main process until this window reads it. If it
    // cannot be read there is nothing to show, and an empty window would stay.
    void load().then(setDraft, () => window.close());
  }, []);
  if (!draft) {
    return null;
  }
  const change = (patch: Partial<typeof draft>) =>
    setDraft((previous) => previous && { ...previous, ...patch });
  async function act(action: "setup" | "save" | "connect" | "original" | "view" | "disconnect") {
    if (!draft || busy) {
      return;
    }
    setError("");
    setOperation(action);
    try {
      const result = await ipc.main.invoke("taskDraft.act", action, {
        title: draft.title,
        due: draft.due,
      });
      if (result.saved) {
        setSaved(true);
        if (action === "view") {
          window.close();
        }
      }
      if (result.connected !== undefined) {
        change({ connected: result.connected, configured: true });
      }
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError(t`Reopen the email and try again.`);
    } finally {
      setOperation("");
    }
  }
  const sourceLink = (
    <a
      href={draft.link}
      className="task-source"
      onClick={(event) => {
        event.preventDefault();
        void act("original");
      }}
    >
      <span className="task-source-icon">
        <Mail size={18} aria-hidden />
      </span>
      <span className="task-source-text">
        <span className="task-source-subject">{draft.subject || t`(no subject)`}</span>
        <span className="task-source-action">
          {t`Open original`} <ArrowUpRight size={13} aria-hidden />
        </span>
      </span>
    </a>
  );
  return (
    <form
      className="task-dialog"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          // Like Cancel, it stays available while Google sign-in is open in
          // the browser. Only a save in flight has to finish.
          operation !== "save" &&
          !event.nativeEvent.isComposing &&
          !event.defaultPrevented &&
          !dateInput.current?.matches(":open")
        ) {
          event.preventDefault();
          window.close();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!saved) {
          void act(draft.connected ? "save" : "connect");
        }
      }}
    >
      <header className="task-header">
        <span className={saved ? "task-emblem is-saved" : "task-emblem"}>
          {saved ? <Check aria-hidden /> : <CircleCheck aria-hidden />}
        </span>
        <div className="task-identity">
          <h1 role={saved ? "status" : undefined}>{saved ? t`Task created` : t`Add to Tasks`}</h1>
          <div className="task-account">
            <span title={draft.owner}>{draft.owner}</span>
            {!saved && draft.connected && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("disconnect")}
              >{t`Disconnect`}</button>
            )}
          </div>
        </div>
      </header>
      <div className="task-body">
        {saved ? (
          <div className="task-result">
            <p>{draft.title}</p>
            {draft.due && (
              <time dateTime={draft.due}>
                <CalendarDays size={15} aria-hidden />
                {new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
                  dateStyle: "long",
                  timeZone: "UTC",
                }).format(new Date(draft.due))}
              </time>
            )}
          </div>
        ) : (
          <>
            <label className="task-field">
              {t`Task title`}
              <Input
                className="task-title-input"
                disabled={operation === "save"}
                autoFocus
                required
                maxLength={1024}
                value={draft.title}
                onChange={(event) => change({ title: event.target.value })}
              />
            </label>
            <div className="task-field">
              <label htmlFor="task-due">{t`Due date`}</label>
              <div className="task-date-row">
                <Input
                  id="task-due"
                  ref={dateInput}
                  type="date"
                  disabled={operation === "save"}
                  value={draft.due}
                  onChange={(event) => change({ due: event.target.value })}
                />
                {draft.due && (
                  <button
                    type="button"
                    className="task-clear"
                    disabled={busy}
                    aria-label={t`Clear due date`}
                    title={t`Clear due date`}
                    onClick={() => {
                      change({ due: "" });
                      dateInput.current?.focus();
                    }}
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {sourceLink}
        {!saved && !draft.configured && !draft.connected && (
          <p className="task-setup">
            {t`Connect with a Google desktop OAuth client that has the Tasks API enabled.`}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("setup")}
            >{t`Setup instructions`}</button>
          </p>
        )}
        {operation === "connect" && (
          <p role="status" className="task-setup">
            {t`Finish signing in in your browser, then return here.`}
          </p>
        )}
        {error && (
          <p ref={alert} role="alert" className="task-error">
            <CircleAlert size={17} aria-hidden />
            {error}
          </p>
        )}
      </div>
      <footer className="task-footer">
        <Button
          disabled={operation === "save"}
          variant="ghost"
          type="button"
          onClick={() => window.close()}
        >
          {saved ? t`Done` : t`Cancel`}
        </Button>
        {saved ? (
          <Button
            key="view"
            autoFocus
            disabled={busy}
            type="button"
            onClick={() => void act("view")}
          >
            {t`Open in Google Tasks`}
            <ArrowUpRight aria-hidden />
          </Button>
        ) : (
          <Button
            key="submit"
            type="submit"
            disabled={busy || !draft.title.trim()}
            aria-busy={busy}
          >
            {(operation === "connect" || operation === "save") && (
              <LoaderCircle className="animate-spin" aria-hidden />
            )}
            {draft.connected ? t`Save` : t`Connect Google Tasks`}
          </Button>
        )}
      </footer>
    </form>
  );
}
renderApp(TaskDraft);
