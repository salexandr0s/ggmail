import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import {
  type FollowUpRow,
  localDay,
  nextFriday,
  SCHEDULE_FOLLOW_UP_PATH,
} from "@ggmail/shared/follow-ups";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
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
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  ClockIcon,
  Loader2Icon,
  MailIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Route } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { dayjs } from "@/lib/date";
import { useAccountsStore, useMailboxRevisions } from "@/lib/stores";
import { WaitingIcon } from "./mail-icons";
import { MailboxSection, MailPageTitle } from "./mail-page";
import "./follow-ups.css";

const statuses = {
  due: {
    label: msg`Due for follow-up`,
    icon: AlarmClockIcon,
    className: "text-warning",
  },
  scheduled: {
    label: msg`Scheduled`,
    icon: CalendarDaysIcon,
    className: "text-muted-foreground",
  },
  unverified: {
    label: msg`Couldn’t verify replies`,
    icon: TriangleAlertIcon,
    className: "text-warning",
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
        const dueDate = dayjs(due).format("ll");
        return (
          <li key={id} className="follow-up-row" data-status={status}>
            <button
              type="button"
              className="follow-up-open"
              onClick={() => action.mutate({ id, action: "open" })}
            >
              <span className="follow-up-details">
                <strong title={subject}>{subject || t`(no subject)`}</strong>
                <span title={recipient}>{recipient}</span>
                <small>{t`Last sent ${lastSent}`}</small>
              </span>
              {!compact && (
                <span className="follow-up-sent-date">
                  <span className="sr-only">
                    <Trans>Last sent</Trans>{" "}
                  </span>
                  {lastSent}
                </span>
              )}
              <span className="follow-up-status">
                <time dateTime={due}>{dueDate}</time>
                <span className={cn("follow-up-status-label", className)}>
                  <Icon aria-hidden="true" />
                  {t(label)}
                </span>
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

function ScheduleFollowUp() {
  const { t, i18n } = useLingui();
  const client = useQueryClient();
  const [day, setDay] = useState(nextFriday);
  const today = dayjs();
  const relativeDay = new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto" });
  const tomorrow = localDay(today.add(1, "day").toDate());
  const friday = nextFriday(today.toDate());
  const presets = [
    { value: localDay(today.toDate()), label: relativeDay.format(0, "day") },
    { value: tomorrow, label: relativeDay.format(1, "day") },
  ];
  if (friday !== tomorrow) {
    presets.push({ value: friday, label: dayjs(friday).format("dddd") });
  }
  const selected = useAccountsStore(
    (state) => state.accounts.find(({ config }) => config.selected)?.config,
  );
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
    <main className="follow-up-scheduler">
      <header>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t`All follow-ups`}
          title={t`All follow-ups`}
          onClick={() => navigate("/waiting")}
        >
          <ArrowLeftIcon aria-hidden="true" className="rtl:rotate-180" />
        </Button>
        <h1 className="page-heading-title">
          <Trans>Schedule follow-up</Trans>
        </h1>
      </header>
      <div className="follow-up-context">
        {current.data ? (
          <div className="follow-up-thread">
            <span className="follow-up-thread-icon">
              <MailIcon aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="follow-up-context-label">{current.data.subject || t`(no subject)`}</h2>
              {selected?.id === current.data.accountId && (
                <p className="follow-up-current-account">
                  {selected.color && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        accountColorsMap[selected.color].className,
                      )}
                    />
                  )}
                  {getAccountLabel(selected.label)}
                </p>
              )}
            </div>
          </div>
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
            schedule.mutate(undefined, {
              onSuccess: (ok) => {
                if (ok) {
                  ipc.main.send("workspaceApp.goBack");
                }
              },
            });
          }}
        >
          <div className="follow-up-date-fields">
            <label htmlFor="follow-up-date">
              <Trans>Follow-up date</Trans>
            </label>
            <div className="follow-up-presets">
              {presets.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={value === day}
                  onClick={() => setDay(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Input
              id="follow-up-date"
              type="date"
              required
              min={localDay()}
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="h-9"
            />
          </div>
          <div className="follow-up-form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => ipc.main.send("workspaceApp.goBack")}
            >
              <Trans>Cancel</Trans>
            </Button>
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
              {day === friday ? t`Follow up Friday` : t`Schedule follow-up`}
            </Button>
          </div>
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
    </main>
  );
}

export function FollowUps() {
  const [filter, setFilter] = useState<Filter>("all");
  const returnPosition = useRef<number | null>(null);
  return (
    <>
      <Route path="/">
        <WaitingForReply filter={filter} onFilter={setFilter} returnPosition={returnPosition} />
      </Route>
      <Route path="/new" component={ScheduleFollowUp} />
    </>
  );
}

function WaitingForReply({
  filter,
  onFilter,
  returnPosition,
}: {
  returnPosition: RefObject<number | null>;
  filter: Filter;
  onFilter: (next: Filter) => void;
}) {
  const mailboxes = useFollowUpMailboxes(false);
  const queue = useRef<HTMLDivElement>(null);
  const compactSchedule = useRef<HTMLButtonElement>(null);
  const railSchedule = useRef<HTMLButtonElement>(null);
  const loading = mailboxes.some(({ list }) => list.isPending);
  useLayoutEffect(() => {
    if (returnPosition.current === null || loading || !queue.current) {
      return;
    }
    queue.current.scrollTop = returnPosition.current;
    returnPosition.current = null;
    const opener = compactSchedule.current?.offsetWidth
      ? compactSchedule.current
      : railSchedule.current;
    opener?.focus({ preventScroll: true });
  }, [loading, returnPosition]);
  const schedule = () => {
    returnPosition.current = queue.current?.scrollTop ?? 0;
    navigate(SCHEDULE_FOLLOW_UP_PATH);
  };
  const checking = mailboxes.some(({ list }) => list.isFetching);
  const { t, i18n } = useLingui();
  const rows = mailboxes.flatMap((mailbox) => mailbox.rows);
  const complete = mailboxes.every(({ list, unavailable }) => !list.isPending && !unavailable);
  const filters = [
    { id: "all", icon: ClockIcon, label: t`All follow-ups`, count: rows.length },
    {
      id: "due",
      icon: AlarmClockIcon,
      label: t`Due`,
      count: rows.filter((row) => row.status === "due").length,
    },
    {
      id: "scheduled",
      icon: CalendarDaysIcon,
      label: t`Scheduled`,
      count: rows.filter((row) => row.status === "scheduled").length,
    },
  ] as const;
  const activeFilter = filters.find(({ id }) => id === filter) ?? filters[0];
  const hasUnverified = rows.some((row) => row.status === "unverified");
  const hasVisibleRows = rows.some((row) => filter === "all" || row.status === filter);
  const empty = complete && !hasVisibleRows && (filter === "all" || !hasUnverified);
  return (
    <main className="waiting-page">
      <header className="mail-page-header waiting-header">
        <MailPageTitle icon={<WaitingIcon />}>
          <Trans>Waiting for reply</Trans>
        </MailPageTitle>
        <Button
          ref={compactSchedule}
          className="follow-up-compose follow-up-compact-compose"
          onClick={schedule}
          title={t`Schedule follow-up`}
          aria-label={t`Schedule follow-up`}
        >
          <CalendarPlusIcon aria-hidden="true" />
          <span>{t`Schedule follow-up`}</span>
        </Button>
        <Button
          variant="ghost"
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
      <aside className="follow-up-rail">
        <Button ref={railSchedule} className="follow-up-compose" onClick={schedule}>
          <CalendarPlusIcon aria-hidden="true" />
          <Trans>Schedule follow-up</Trans>
        </Button>
        <div role="group" aria-label={t`All follow-ups`} className="follow-up-filters">
          {filters.map(({ id, label, icon: Icon, count }) => (
            <Button
              key={id}
              variant="ghost"
              className="mail-nav-row"
              aria-pressed={id === filter}
              onClick={() => {
                onFilter(id);
                if (queue.current && filter !== id) {
                  queue.current.scrollTop = 0;
                }
              }}
            >
              <Icon aria-hidden="true" />
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
              {complete && <span className="mail-nav-count">{i18n.number(count)}</span>}
            </Button>
          ))}
        </div>
      </aside>
      <div className="follow-up-queue">
        <div className="follow-up-heading">
          <h2 className="mail-section-title">
            <activeFilter.icon aria-hidden="true" />
            {activeFilter.label}
            {complete && <span className="mail-count">{i18n.number(activeFilter.count)}</span>}
          </h2>
        </div>
        <div ref={queue} className="follow-up-queue-body">
          {hasVisibleRows && (
            <div className="follow-up-columns" aria-hidden="true">
              <span>
                <Trans>Conversation</Trans>
              </span>
              <span>
                <Trans>Last sent</Trans>
              </span>
              <span>
                <Trans>Follow-up date</Trans>
              </span>
            </div>
          )}
          {mailboxes.map(({ config, list, unavailable, rows }) => {
            const visible = rows.filter((row) => filter === "all" || row.status === filter);
            const unverified = rows.some((row) => row.status === "unverified");
            if (!visible.length && !list.isPending && !unavailable && !unverified) {
              return null;
            }
            return (
              <MailboxSection
                account={config}
                key={config.id}
                actions={
                  (unavailable || unverified) && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={list.isFetching}
                      onClick={() => list.refetch()}
                    >
                      <RefreshCwIcon aria-hidden="true" />
                      <Trans>Retry</Trans>
                    </Button>
                  )
                }
              >
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
              </MailboxSection>
            );
          })}
          {empty && (
            <div className="follow-up-empty" role="status">
              <ClockIcon aria-hidden="true" />
              <h2>
                {filter === "due"
                  ? t`No follow-ups due`
                  : filter === "scheduled"
                    ? t`No scheduled follow-ups`
                    : t`No follow-ups`}
              </h2>
              {rows.length > 0 ? (
                <Button variant="link" size="sm" onClick={() => onFilter("all")}>
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
          {rows.length > 0 && !empty && (
            <p className="follow-up-hint">
              <Trans>Conversations leave this list when a reply arrives.</Trans>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export function InboxFollowUps({ accountId }: { accountId?: string }) {
  const mailboxes = useFollowUpMailboxes(true);
  return (
    <div className="inbox-follow-ups mb-3 hidden overflow-hidden rounded-[var(--mail-panel-radius)] bg-card has-[section]:block">
      <Button size="sm" variant="ghost" className="my-2 ms-3" onClick={() => navigate("/waiting")}>
        <ClockIcon aria-hidden="true" />
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
              <MailboxSection key={config.id} account={config}>
                <FollowUpRows accountId={config.id} rows={due} compact />
              </MailboxSection>
            )
          );
        })}
      </div>
    </div>
  );
}
