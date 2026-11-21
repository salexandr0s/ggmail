import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import { type FollowUpRow, localDay, nextFriday } from "@ggmail/shared/follow-ups";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import { Badge } from "@ggmail/ui/components/badge";
import { Button } from "@ggmail/ui/components/button";
import { Input } from "@ggmail/ui/components/input";
import { cn } from "@ggmail/ui/lib/utils";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlarmClockIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  CheckIcon,
  Clock3Icon,
  InboxIcon,
  Loader2Icon,
  MailIcon,
  RefreshCwIcon,
  SendIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { navigate } from "wouter/use-hash-location";
import { dayjs } from "@/lib/date";
import { useAccountsStore, useMailboxRevisions } from "@/lib/stores";
import { AccountBadge } from "./account-badge";
import { MailboxSection } from "./mail-page";
import "./follow-ups.css";

const statuses = {
  due: {
    label: msg`Due for follow-up`,
    icon: AlarmClockIcon,
    className: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  scheduled: {
    label: msg`Scheduled`,
    icon: CalendarDaysIcon,
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  unverified: {
    label: msg`Couldn’t verify replies`,
    icon: TriangleAlertIcon,
    className: "bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  },
};

function useFollowUpMailboxes(dueOnly: boolean) {
  const accounts = useAccountsStore((state) => state.accounts);
  const revisions = useMailboxRevisions();
  const lists = useQueries({
    queries: accounts.map(({ config: { id } }) =>
      queryOptions({
        queryKey: ["followUps", id, revisions[id] ?? 0, dueOnly],
        queryFn: () => ipc.main.invoke("followUps.list", id),
        refetchInterval: 60_000,
        networkMode: "always",
        retry: false,
        gcTime: 0,
      }),
    ),
  });
  return accounts.flatMap(({ config }, index) => {
    const list = lists[index];
    if (!list) {
      return [];
    }
    const unavailable = list.isError || !!list.data?.unavailable;
    return [{ config, list, unavailable, rows: unavailable ? [] : (list.data?.rows ?? []) }];
  });
}

type Mailboxes = ReturnType<typeof useFollowUpMailboxes>;
type Filter = "all" | "due" | "scheduled";

function FollowUpRows({
  accountId,
  rows,
  compact = false,
}: {
  accountId: string;
  rows: FollowUpRow[];
  compact?: boolean;
}) {
  const { t } = useLingui();
  const client = useQueryClient();
  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "open" | "remove" }) =>
      ipc.main.invoke("followUps.act", accountId, id, action),
    onSuccess: (_result, { action }) => {
      if (action === "remove") {
        void client.invalidateQueries({ queryKey: ["followUps", accountId] });
      }
    },
    onError: () => toast.error(t`Couldn’t update this follow-up.`),
  });
  return (
    <ul className={cn("follow-up-rows", compact && "follow-up-rows-compact")}>
      {rows.map(({ id, status, due, subject, recipient, lastSent }) => {
        const { label, icon: Icon, className } = statuses[status];
        const date = dayjs(due);
        const dueDate = date.format("ll");
        return (
          <li key={id} className="follow-up-row">
            <button
              type="button"
              className="follow-up-open"
              onClick={() => action.mutate({ id, action: "open" })}
            >
              {!compact && (
                <time
                  className="follow-up-day"
                  data-status={status}
                  dateTime={due}
                  title={dueDate}
                  aria-label={dueDate}
                >
                  <span>{date.format("MMM")}</span>
                  <strong>{date.format("D")}</strong>
                  {date.year() !== dayjs().year() && <small>{date.format("YYYY")}</small>}
                </time>
              )}
              <span className="follow-up-details">
                <strong title={subject}>{subject || t`(no subject)`}</strong>
                <span title={recipient}>{recipient}</span>
                <small>{t`Last sent ${lastSent}`}</small>
              </span>
              {!compact && (
                <span className="follow-up-sent-date">
                  <small>
                    <Trans>Last sent</Trans>
                  </small>
                  <span>{lastSent}</span>
                </span>
              )}
              <span className="follow-up-status">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-auto max-w-full gap-1.5 border-current/10 px-2 py-0.5 text-start whitespace-normal",
                    className,
                  )}
                >
                  <Icon aria-hidden="true" />
                  {t(label)}
                </Badge>
                {compact && <time dateTime={due}>{dueDate}</time>}
              </span>
            </button>
            {!compact && (
              <Button
                size="icon"
                variant="ghost"
                className="follow-up-remove"
                aria-label={t`Remove`}
                aria-description={subject || t`(no subject)`}
                title={t`Remove`}
                disabled={action.isPending}
                onClick={() => action.mutate({ id, action: "remove" })}
              >
                <XIcon aria-hidden="true" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ScheduleFollowUp({ selected }: { selected?: AccountConfig }) {
  const { t } = useLingui();
  const client = useQueryClient();
  const [day, setDay] = useState(nextFriday);
  const selectedId = selected?.id;
  const revision = useMailboxRevisions((state) => (selectedId ? state[selectedId] : undefined));
  const current = useQuery({
    queryKey: ["followUpThread", selectedId, revision],
    queryFn: () => ipc.main.invoke("followUps.current"),
    networkMode: "always",
    gcTime: 0,
    retry: false,
  });
  const schedule = useMutation({
    mutationFn: async () => {
      if (!current.data) {
        throw new Error();
      }
      return ipc.main.invoke(
        "followUps.schedule",
        current.data.accountId,
        current.data.threadId,
        day,
      );
    },
    onSuccess: (ok) => {
      if (ok) {
        void client.invalidateQueries({ queryKey: ["followUps"] });
        toast.success(t`Follow-up scheduled`, { id: "follow-up-scheduled" });
      } else {
        toast.error(t`The latest message must be one you sent.`);
      }
    },
    onError: () =>
      toast.error(t`Couldn’t schedule this follow-up. Check the conversation and try again.`),
  });

  return (
    <section className="follow-up-scheduler" aria-label={t`Schedule follow-up`}>
      <div className="follow-up-context">
        <div className="follow-up-context-label">
          <SendIcon aria-hidden="true" />
          {current.data ? <Trans>Current mail view</Trans> : <Trans>Schedule follow-up</Trans>}
          {selected && (!current.data || selected.id === current.data.accountId) && (
            <AccountBadge label={getAccountLabel(selected.label)} color={selected.color} />
          )}
        </div>
        {current.data ? (
          <h2>{current.data.subject || t`(no subject)`}</h2>
        ) : current.isPending ? (
          <p role="status">
            <Loader2Icon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            <Trans>Loading email…</Trans>
          </p>
        ) : current.isError ? (
          <p role="status">
            <TriangleAlertIcon aria-hidden="true" className="size-4" />
            <Trans>Couldn’t check this mailbox.</Trans>
          </p>
        ) : (
          <p>
            <Trans>
              To schedule a follow-up, open a sent conversation in Gmail and return here.
            </Trans>
          </p>
        )}
      </div>
      {current.data ? (
        <form
          className="follow-up-form"
          onSubmit={(event) => {
            event.preventDefault();
            schedule.mutate();
          }}
        >
          <label>
            <span>
              <Trans>Follow-up date</Trans>
            </span>
            <Input
              type="date"
              required
              min={localDay()}
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="h-9 bg-background dark:scheme-dark"
            />
          </label>
          <Button
            type="submit"
            size="lg"
            className="follow-up-primary"
            disabled={schedule.isPending}
          >
            {schedule.isPending ? (
              <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <CalendarPlusIcon aria-hidden="true" />
            )}
            {day === nextFriday() ? t`Follow up Friday` : t`Schedule follow-up`}
          </Button>
        </form>
      ) : current.isError ? (
        <Button
          size="sm"
          variant="outline"
          disabled={current.isFetching}
          onClick={() => current.refetch()}
        >
          <RefreshCwIcon aria-hidden="true" />
          <Trans>Retry</Trans>
        </Button>
      ) : (
        !current.isPending &&
        selected && (
          <Button
            variant="outline"
            size="lg"
            className="follow-up-sent"
            onClick={() => {
              ipc.main.send("tabs.selectTab", selected.id, GMAIL_TAB_ID);
              ipc.main.send("gmail.navigateTo", "sent");
              navigate("/");
            }}
          >
            <Trans>Open sent mail</Trans>
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        )
      )}
    </section>
  );
}

function FollowUpQueue({ mailboxes }: { mailboxes: Mailboxes }) {
  const { t, i18n } = useLingui();
  const [filter, setFilter] = useState<Filter>("all");
  const rows = mailboxes.flatMap((mailbox) => mailbox.rows);
  const complete = mailboxes.every(({ list, unavailable }) => !list.isPending && !unavailable);
  const filters = [
    { id: "all", label: t`All follow-ups`, count: rows.length },
    {
      id: "due",
      label: t`Due`,
      count: rows.filter((row) => row.status === "due").length,
    },
    {
      id: "scheduled",
      label: t`Scheduled`,
      count: rows.filter((row) => row.status === "scheduled").length,
    },
  ] as const;
  const hasUnverified = rows.some((row) => row.status === "unverified");
  const empty =
    complete &&
    !rows.some((row) => filter === "all" || row.status === filter) &&
    (filter === "all" || !hasUnverified);
  return (
    <div className="follow-up-queue">
      <div role="group" aria-label={t`All follow-ups`} className="follow-up-filters">
        {filters.map(({ id, label, count }) => (
          <button key={id} type="button" aria-pressed={id === filter} onClick={() => setFilter(id)}>
            {label}
            {complete && <span>{i18n.number(count)}</span>}
          </button>
        ))}
      </div>
      {mailboxes.map(({ config, list, unavailable, rows }) => {
        const visible = rows.filter((row) => filter === "all" || row.status === filter);
        const unverified = rows.some((row) => row.status === "unverified");
        if (!visible.length && !list.isPending && !unavailable && !unverified) {
          return null;
        }
        const label = getAccountLabel(config.label);
        return (
          <section className="follow-up-mailbox" key={config.id} aria-label={label}>
            <header>
              <h2>
                {config.color ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      accountColorsMap[config.color].className,
                    )}
                  />
                ) : (
                  <InboxIcon aria-hidden="true" />
                )}
                {label}
              </h2>
              {(unavailable || unverified) && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={list.isFetching}
                  onClick={() => list.refetch()}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  <Trans>Retry</Trans>
                </Button>
              )}
            </header>
            {list.isPending ? (
              <p className="follow-up-notice" role="status">
                <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
                <Trans>Checking for replies…</Trans>
              </p>
            ) : unavailable ? (
              <p className="follow-up-notice" role="status">
                <TriangleAlertIcon aria-hidden="true" />
                <Trans>Couldn’t check this mailbox.</Trans>
              </p>
            ) : (
              unverified &&
              filter !== "all" && (
                <p className="follow-up-notice" role="status">
                  <TriangleAlertIcon aria-hidden="true" />
                  <Trans>Couldn’t verify replies</Trans>
                </p>
              )
            )}
            {visible.length > 0 && <FollowUpRows accountId={config.id} rows={visible} />}
          </section>
        );
      })}
      {empty && (
        <div className="follow-up-empty" role="status">
          <div aria-hidden="true" className="follow-up-empty-mark">
            <MailIcon />
            <span>
              <CheckIcon />
            </span>
          </div>
          <h2>
            {filter === "due"
              ? t`No follow-ups due`
              : filter === "scheduled"
                ? t`No scheduled follow-ups`
                : t`No follow-ups`}
          </h2>
          {rows.length > 0 ? (
            <Button variant="link" size="sm" onClick={() => setFilter("all")}>
              <Trans>View all follow-ups</Trans>
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : (
            <p>
              <Trans>You can schedule a follow-up when you sent the last message.</Trans>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function WaitingForReply() {
  const { t } = useLingui();
  const mailboxes = useFollowUpMailboxes(false);
  const selected = mailboxes.find(({ config }) => config.selected)?.config;
  const checking = mailboxes.some(({ list }) => list.isFetching);
  return (
    <main className="waiting-page">
      <header className="follow-up-heading">
        <div className="follow-up-emblem" aria-hidden="true">
          <Clock3Icon />
        </div>
        <div className="follow-up-heading-copy">
          <h1>
            <Trans>Waiting for reply</Trans>
          </h1>
          <p>
            <Trans>Conversations leave this list when a reply arrives.</Trans>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="follow-up-refresh"
          aria-label={t`Check for replies`}
          title={t`Check for replies`}
          disabled={checking || !mailboxes.length}
          onClick={() => {
            for (const { list } of mailboxes) {
              void list.refetch();
            }
          }}
        >
          <RefreshCwIcon
            aria-hidden="true"
            className={checking ? "motion-safe:animate-spin" : undefined}
          />
          <span>
            <Trans>Check for replies</Trans>
          </span>
        </Button>
      </header>
      <ScheduleFollowUp selected={selected} />
      <FollowUpQueue mailboxes={mailboxes} />
    </main>
  );
}

export function InboxFollowUps({ accountId }: { accountId?: string }) {
  const mailboxes = useFollowUpMailboxes(true);
  return (
    <div className="mb-6 hidden space-y-2 has-[section]:block">
      <Button size="sm" variant="ghost" className="-ms-2" onClick={() => navigate("/waiting")}>
        <Clock3Icon aria-hidden="true" />
        <Trans>Waiting for reply</Trans>
        <ArrowRightIcon aria-hidden="true" />
      </Button>
      <div className="space-y-4">
        {mailboxes.map(({ config, rows }) => {
          if (accountId && config.id !== accountId) {
            return null;
          }
          const due = rows.filter((row) => row.status === "due");
          return (
            due.length > 0 && (
              <MailboxSection
                key={config.id}
                label={getAccountLabel(config.label)}
                color={config.color}
              >
                <FollowUpRows accountId={config.id} rows={due} compact />
              </MailboxSection>
            )
          );
        })}
      </div>
    </div>
  );
}
