import { getAccountLabel } from "@ggmail/shared/accounts";
import { type FollowUpRow, localDay, nextFriday } from "@ggmail/shared/follow-ups";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Badge } from "@ggmail/ui/components/badge";
import { Button } from "@ggmail/ui/components/button";
import { Field, FieldLabel } from "@ggmail/ui/components/field";
import { Input } from "@ggmail/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@ggmail/ui/components/item";
import { cn } from "@ggmail/ui/lib/utils";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClockIcon,
  ArrowRightIcon,
  CalendarIcon,
  Clock3Icon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { navigate } from "wouter/use-hash-location";
import { dayjs } from "@/lib/date";
import { useAccountsStore, useMailboxRevisions } from "@/lib/stores";
import { AccountBadge } from "./account-badge";
import { MailboxSection, MailPageHeader } from "./mail-page";

const statusBadges = {
  due: {
    label: msg`Due for follow-up`,
    icon: AlarmClockIcon,
    className: cn("bg-[#f7f1e7] text-[#755a34]", "dark:bg-[#302b24] dark:text-[#d4ba91]"),
  },
  scheduled: {
    label: msg`Scheduled`,
    icon: CalendarIcon,
    className: cn("bg-[#eef3f6] text-[#496479]", "dark:bg-[#252d33] dark:text-[#acc2d2]"),
  },
  unverified: {
    label: msg`Couldn’t verify replies`,
    icon: TriangleAlertIcon,
    className: cn("bg-[#f5eff3] text-[#75596b]", "dark:bg-[#30292e] dark:text-[#ceb2c3]"),
  },
};

function FollowUpStatusBadge({ status }: { status: FollowUpRow["status"] }) {
  const { t } = useLingui();
  const { label, icon: Icon, className } = statusBadges[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto min-h-5 max-w-full gap-1.5 border-current/15 px-2 py-0.5 text-start leading-4 whitespace-normal",
        className,
      )}
    >
      <Icon aria-hidden="true" />
      <span className="min-w-0 wrap-anywhere">{t(label)}</span>
    </Badge>
  );
}

function AccountFollowUps({
  id,
  label,
  color,
  dueOnly,
}: {
  id: string;
  label: string;
  color: AccountConfig["color"];
  dueOnly: boolean;
}) {
  const { t } = useLingui();
  const revision = useMailboxRevisions((state) => state[id] ?? 0);
  const list = useQuery({
    queryKey: ["followUps", id, revision, dueOnly],
    queryFn: () => ipc.main.invoke("followUps.list", id),
    refetchInterval: 60_000,
    networkMode: "always",
    retry: false,
    gcTime: 0,
  });
  const action = useMutation({
    mutationFn: ({ rowId, action }: { rowId: string; action: "open" | "remove" }) =>
      ipc.main.invoke("followUps.act", id, rowId, action),
    onSuccess: (_result, { action }) => {
      if (action === "remove") {
        void list.refetch();
      }
    },
    onError: () => toast.error(t`Couldn’t update this follow-up.`),
  });
  const rows = list.isError
    ? []
    : list.data?.rows.filter((row) => !dueOnly || row.status === "due");
  if (dueOnly && !rows?.length) {
    return null;
  }
  return (
    <MailboxSection
      label={label}
      color={color}
      actions={
        !list.isPending && !list.isError && !list.data.unavailable && !rows?.length ? (
          <span className="text-xs text-muted-foreground">
            <Trans>No follow-ups</Trans>
          </span>
        ) : rows?.some((row) => row.status === "unverified") ? (
          <Button
            size="xs"
            variant="outline"
            disabled={list.isFetching}
            onClick={() => list.refetch()}
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={list.isFetching ? "motion-safe:animate-spin" : undefined}
            />
            <Trans>Retry</Trans>
          </Button>
        ) : null
      }
    >
      {list.isPending ? (
        <p
          role="status"
          className="flex items-center gap-2 border-t px-3.5 py-3 text-sm text-muted-foreground"
        >
          <Loader2Icon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          <Trans>Checking for replies…</Trans>
        </p>
      ) : list.isError || list.data.unavailable ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-t px-3.5 py-3 text-sm text-muted-foreground"
        >
          <TriangleAlertIcon aria-hidden="true" className="size-4" />
          <Trans>Couldn’t check this mailbox.</Trans>
          <Button
            size="xs"
            variant="outline"
            disabled={list.isFetching}
            onClick={() => list.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      <ul className="divide-y border-t empty:hidden">
        {rows?.map(({ id: rowId, status, due, subject, recipient, lastSent }) => (
          <Item
            key={rowId}
            render={<li />}
            size="sm"
            className="flex-nowrap gap-0 rounded-none border-0 p-0"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() => action.mutate({ rowId, action: "open" })}
            >
              <span className="min-w-0 grow basis-52">
                <span className="block truncate text-sm font-semibold" title={subject}>
                  {subject || t`(no subject)`}
                </span>
                <span
                  className="mt-0.5 block truncate text-sm text-muted-foreground"
                  title={recipient}
                >
                  {recipient}
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{t`Last sent ${lastSent}`}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 @xl:flex-col @xl:items-end">
                <FollowUpStatusBadge status={status} />
                <time dateTime={due} className="text-xs text-muted-foreground tabular-nums">
                  {dayjs(due).format("ll")}
                </time>
              </span>
            </button>
            {!dueOnly && (
              <ItemActions className="pe-2 text-muted-foreground">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t`Remove`}
                  aria-label={t`Remove`}
                  disabled={action.isPending}
                  onClick={() => action.mutate({ rowId, action: "remove" })}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </ItemActions>
            )}
          </Item>
        ))}
      </ul>
    </MailboxSection>
  );
}

export function FollowUpList({ dueOnly = false }: { dueOnly?: boolean }) {
  const accounts = useAccountsStore((state) => state.accounts);
  return (
    <div className="space-y-4">
      {accounts.map(({ config }) => (
        <AccountFollowUps
          key={config.id}
          id={config.id}
          label={getAccountLabel(config.label)}
          color={config.color}
          dueOnly={dueOnly}
        />
      ))}
    </div>
  );
}

export function WaitingForReply() {
  const { t } = useLingui();
  const client = useQueryClient();
  const [day, setDay] = useState(nextFriday);
  const selected = useAccountsStore(
    (state) => state.accounts.find(({ config }) => config.selected)?.config,
  );
  const selectedId = selected?.id;
  const revision = useMailboxRevisions((state) => (selectedId ? state[selectedId] : undefined));
  const current = useQuery({
    queryKey: ["followUpThread", selectedId, revision],
    queryFn: () => ipc.main.invoke("followUps.current"),
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
    <>
      <MailPageHeader title={<Trans>Waiting for reply</Trans>} />
      {current.data ? (
        <form
          className="mb-6"
          onSubmit={(event) => {
            event.preventDefault();
            schedule.mutate();
          }}
        >
          <Item
            variant="muted"
            className="items-end gap-x-5 gap-y-4 rounded-xl border-border bg-muted/30 p-4"
          >
            <ItemContent className="min-w-0 basis-48 self-center">
              <ItemDescription className="flex flex-wrap items-center gap-2 text-xs">
                <Trans>Current mail view</Trans>
                {selected && selected.id === current.data.accountId && (
                  <AccountBadge label={getAccountLabel(selected.label)} color={selected.color} />
                )}
              </ItemDescription>
              <ItemTitle className="line-clamp-none block w-full text-base font-semibold wrap-anywhere">
                {current.data.subject || t`(no subject)`}
              </ItemTitle>
            </ItemContent>
            <ItemActions className="max-w-full flex-wrap items-end">
              <Field className="w-auto min-w-0 gap-1">
                <FieldLabel htmlFor="follow-up-date" className="text-xs">
                  <Trans>Follow-up date</Trans>
                </FieldLabel>
                <Input
                  id="follow-up-date"
                  type="date"
                  required
                  min={localDay()}
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  className="w-auto max-w-full bg-background tabular-nums dark:scheme-dark"
                />
              </Field>
              <Button type="submit" disabled={schedule.isPending}>
                {schedule.isPending && (
                  <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />
                )}
                {day === nextFriday() ? t`Follow up Friday` : t`Schedule follow-up`}
              </Button>
            </ItemActions>
          </Item>
        </form>
      ) : current.isPending ? (
        <p role="status" className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          <Trans>Loading email…</Trans>
        </p>
      ) : (
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          <Trans>To schedule a follow-up, open a sent conversation in Gmail and return here.</Trans>
        </p>
      )}
      <FollowUpList />
    </>
  );
}

export function InboxFollowUps() {
  return (
    <div className="mb-6 hidden space-y-2 has-[section]:block">
      <Button size="sm" variant="ghost" className="-ms-2" onClick={() => navigate("/waiting")}>
        <Clock3Icon aria-hidden="true" />
        <Trans>Waiting for reply</Trans>
        <ArrowRightIcon aria-hidden="true" />
      </Button>
      <FollowUpList dueOnly />
    </div>
  );
}
