import "./unified-inbox.css";
import { accountColorsMap } from "@ggmail/shared/accounts";
import type { GmailAction } from "@ggmail/shared/gmail";
import { ms } from "@ggmail/shared/ms";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { AvatarGroup } from "@ggmail/ui/components/avatar";
import { Button } from "@ggmail/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ggmail/ui/components/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@ggmail/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { Table, TableBody, TableCell, TableRow } from "@ggmail/ui/components/table";
import { cn } from "@ggmail/ui/lib/utils";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  type PaginationState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArchiveIcon,
  ArrowDownWideNarrowIcon,
  MailCheckIcon,
  MoreHorizontalIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  InboxIcon,
  Loader2Icon,
  MailOpenIcon,
  OctagonAlertIcon,
  Trash2Icon,
} from "lucide-react";
import {
  type ComponentProps,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { create } from "zustand";
import { SenderAvatar } from "@/components/assistant/sender-avatar";
import { InboxFollowUps } from "@/components/follow-ups";
import { InboxAccounts } from "@/components/inbox-accounts";
import { UnifiedInboxSearch } from "@/components/unified-search";
import { createDateTimeFormatter, dayjs } from "@/lib/date";
import { useUnifiedInbox, type UnifiedInboxMessage } from "@/lib/hooks";
import { useConfig, useConfigMutation } from "@/lib/react-query";

const columnHelper = createColumnHelper<UnifiedInboxMessage>();

// Opening a conversation unmounts All Mail. Keep its mailbox selection for the return trip.
const useInboxScope = create<{ accountId?: string; select: (id?: string) => void }>((set) => ({
  select: (accountId) => set({ accountId }),
}));

// lingui-set comment="Button on a message in All Mail. A Gmail action, so it follows Gmail's word for it"
const MESSAGE_ACTIONS = [
  { action: "archive", label: msg`Archive`, icon: ArchiveIcon },
  { action: "markAsRead", label: msg`Mark as read`, icon: MailOpenIcon },
  {
    action: "delete",
    label: msg({ message: "Delete", context: "Gmail action" }),
    icon: Trash2Icon,
  },
  { action: "markAsSpam", label: msg`Mark as spam`, icon: OctagonAlertIcon },
] as const satisfies {
  action: GmailAction;
  label: MessageDescriptor;
  icon: typeof ArchiveIcon;
}[];
// lingui-reset

function MessageActionButton({
  label,
  ...props
}: Omit<ComponentProps<typeof Button>, "title"> & { label: MessageDescriptor }) {
  const { t } = useLingui();

  return <Button title={t(label)} {...props} />;
}

function CompactMessageActions({
  message,
  pending,
  onAction,
}: {
  message: UnifiedInboxMessage;
  pending: boolean;
  onAction: (message: UnifiedInboxMessage, action: GmailAction) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="inbox-compact-actions" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-busy={pending || undefined}
          title={t`More options`}
          aria-description={message.subject}
        >
          {pending ? <Loader2Icon className="motion-safe:animate-spin" /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onKeyDown={(event) => event.stopPropagation()}>
          {MESSAGE_ACTIONS.map(({ action, label, icon: Icon }) => (
            <DropdownMenuItem
              key={action}
              disabled={pending}
              onClick={() => onAction(message, action)}
            >
              <Icon aria-hidden="true" />
              {t(label)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type PendingMessageAction = { accountId: string; messageId: string; action: GmailAction };

const PendingActionContext = createContext<PendingMessageAction | null>(null);

const createColumns = ({
  showSenderIcons,
  onAction,
}: {
  showSenderIcons: boolean;
  onAction: (message: UnifiedInboxMessage, action: GmailAction) => void;
}) => [
  columnHelper.accessor("author.name", {
    cell: ({ row: { original: message } }) => {
      const { author, contributors, account } = message;
      const senders = [author, ...contributors];
      const names = contributors.length
        ? senders.map(({ name, email }) => name.trim().split(/\s+/u)[0] || email).join(", ")
        : author.name || author.email;
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          {showSenderIcons && (
            <AvatarGroup className="shrink-0">
              {senders.slice(0, 3).map(({ name, email }, index) => (
                <SenderAvatar
                  key={index}
                  sender={{ name: name || email, domain: email.split("@")[1] }}
                  className="size-7 text-base"
                />
              ))}
            </AvatarGroup>
          )}
          <div className="grid min-w-0 gap-0.5">
            <span
              className="truncate text-sm font-semibold"
              title={senders
                .map(({ name, email }) => (name ? `${name} <${email}>` : email))
                .join(", ")}
            >
              {names}
            </span>
            <span
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
              title={account.label}
            >
              {account.color && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    accountColorsMap[account.color].className,
                  )}
                />
              )}
              <span className="truncate">{account.label}</span>
            </span>
          </div>
        </div>
      );
    },
  }),
  columnHelper.accessor("subject", {
    cell: ({ getValue, row: { original: message } }) => (
      <div className="inbox-message-preview">
        <button type="button" className="inbox-subject" title={getValue()}>
          {getValue() || <Trans>(no subject)</Trans>}
        </button>
        {message.summary && (
          <span
            className="truncate text-xs leading-4 text-muted-foreground"
            title={message.summary}
          >
            {message.summary}
          </span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("receivedAt", {
    cell: function MessageDateCell(props) {
      const pending = useContext(PendingActionContext);
      const date = dayjs(props.getValue());

      const pendingAction =
        pending?.accountId === props.row.original.account.id &&
        pending.messageId === props.row.original.id
          ? pending.action
          : null;

      return (
        <>
          <time
            dateTime={date.toISOString()}
            className="inbox-time"
            title={createDateTimeFormatter({
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(date.toDate())}
          >
            {date.isToday()
              ? createDateTimeFormatter({
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(date.toDate())
              : date.isSame(dayjs(), "year")
                ? createDateTimeFormatter({
                    month: "short",
                    day: "numeric",
                  }).format(date.toDate())
                : createDateTimeFormatter().format(date.toDate())}
          </time>
          <CompactMessageActions
            message={props.row.original}
            pending={pendingAction !== null}
            onAction={onAction}
          />
          <div className="inbox-row-actions">
            {MESSAGE_ACTIONS.map(({ action, label, icon: Icon }) => (
              <MessageActionButton
                key={action}
                variant="ghost"
                size="icon-sm"
                label={label}
                disabled={pendingAction !== null}
                className={cn(
                  "transition-colors",
                  pendingAction === action && "disabled:opacity-100",
                )}
                onClick={(event) => {
                  event.stopPropagation();

                  onAction(props.row.original, action);
                }}
              >
                {pendingAction === action ? (
                  <Loader2Icon className="motion-safe:animate-spin" />
                ) : (
                  <Icon />
                )}
              </MessageActionButton>
            ))}
          </div>
        </>
      );
    },
  }),
];

function UnifiedInboxTable({
  messages,
  rowsPerPage,
  showSenderIcons,
}: {
  messages: UnifiedInboxMessage[];
  rowsPerPage: number;
  showSenderIcons: boolean;
}) {
  const { t } = useLingui();

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: rowsPerPage,
  });

  const [focus, setFocus] = useState<{ id: string; position: number } | null>(null);

  const [pending, setPending] = useState<PendingMessageAction | null>(null);

  // Mirrors `pending` so that the guard below reads it without taking it as a
  // dependency: the hotkeys memoize their callbacks on their own dependencies,
  // and a `runAction` that changed identity would leave them holding one from
  // before the request started, whose guard sees nothing pending.
  const pendingRef = useRef<PendingMessageAction | null>(null);

  // Held until the whole cycle is done rather than removing the row at once,
  // because the poll a moment later rewrites the list from a feed the action
  // has not reached yet, and a row taken away optimistically comes back.
  const runAction = useCallback(
    async (message: UnifiedInboxMessage, action: GmailAction) => {
      if (pendingRef.current) {
        return;
      }

      pendingRef.current = { accountId: message.account.id, messageId: message.id, action };

      setPending(pendingRef.current);

      let handled = false;

      try {
        handled = await ipc.main.invoke(
          "gmail.handleMessage",
          message.account.id,
          message.id,
          action,
        );
      } catch {
        // Reported below, the same as an action Gmail refused.
      } finally {
        pendingRef.current = null;

        setPending(null);
      }

      // The row is still there either way, so without this a refused action
      // looks like one that was never asked for.
      if (!handled) {
        toast.error(t`Couldn’t update this message. Try again.`);
      }
      // `t` changes identity only with the language.
    },
    [t],
  );

  const columns = useMemo(
    () => createColumns({ showSenderIcons, onAction: runAction }),
    [showSenderIcons, runAction],
  );

  const table = useReactTable({
    data: messages,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => JSON.stringify([row.account.id, row.id]),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    // Every push of the accounts rebuilds `messages`, which the default would
    // read as new data and answer by sending the reader back to page one.
    autoResetPageIndex: false,
  });

  const configMutation = useConfigMutation();

  const rows = table.getRowModel().rows;

  const allRows = table.getPrePaginationRowModel().rows;
  const found = focus ? allRows.findIndex((row) => row.id === focus.id) : -1;
  const position = !focus ? -1 : found >= 0 ? found : Math.min(focus.position, allRows.length - 1);
  const focusedRow = allRows[position];
  const pageStart = pagination.pageIndex * pagination.pageSize;

  const focusPosition = (next: number) => {
    const row = allRows[next];
    if (row) {
      setFocus({ id: row.id, position: next });
    }
  };

  const currentPage = table.getState().pagination.pageIndex + 1;

  const pageCount = table.getPageCount();

  const focusedRowRef = useRef<HTMLTableRowElement>(null);

  const isGPrefixActiveRef = useRef(false);

  const gPrefixTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openMessage = async (message: UnifiedInboxMessage) => {
    let opened = false;

    try {
      opened = await ipc.main.invoke("unifiedInbox.openMessage", message.account.id, message.id);
    } catch {
      // Reported below.
    }

    if (!opened) {
      toast.error(t`Couldn’t open this conversation.`);
    }
  };

  useHotkeys(
    ["j", "down"],
    (event) => {
      event.preventDefault();

      focusPosition(position < 0 ? pageStart : position + 1);
    },
    [position, pageStart, allRows],
  );

  useHotkeys(
    ["k", "up"],
    (event) => {
      event.preventDefault();
      focusPosition(position < 0 ? pageStart : position - 1);
    },
    [position, pageStart, allRows],
  );

  useHotkeys(
    ["enter", "o"],
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, [role=combobox]")
      ) {
        return;
      }
      event.preventDefault();

      const focusedMessage = focusedRow?.original;

      if (focusedMessage) {
        openMessage(focusedMessage);
      }
    },
    [focusedRow],
  );

  const handleFocusedMessage = (action: GmailAction) => {
    const focusedMessage = focusedRow?.original;

    if (focusedMessage) {
      runAction(focusedMessage, action);
    }
  };

  useHotkeys(
    "e",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("archive");
    },
    [focusedRow],
  );

  useHotkeys(
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- a keyboard shortcut
    "shift+i",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("markAsRead");
    },
    [focusedRow],
  );

  // Matched on the character rather than the key, because the default matches
  // the physical key instead, where Shift-3 is `3` and never `#`.
  useHotkeys(
    "#",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("delete");
    },
    { useKey: true },
    [focusedRow],
  );

  useHotkeys(
    "!",
    (event) => {
      event.preventDefault();

      handleFocusedMessage("markAsSpam");
    },
    { useKey: true },
    [focusedRow],
  );

  useHotkeys("g", () => {
    isGPrefixActiveRef.current = true;

    clearTimeout(gPrefixTimeoutRef.current);

    gPrefixTimeoutRef.current = setTimeout(() => {
      isGPrefixActiveRef.current = false;
    }, ms("1s"));
  });

  useHotkeys("n", () => {
    if (!isGPrefixActiveRef.current) {
      return;
    }

    isGPrefixActiveRef.current = false;

    clearTimeout(gPrefixTimeoutRef.current);

    if (table.getCanNextPage()) {
      focusPosition(pageStart + pagination.pageSize);
    }
  });

  useHotkeys("p", () => {
    if (!isGPrefixActiveRef.current) {
      return;
    }

    isGPrefixActiveRef.current = false;

    clearTimeout(gPrefixTimeoutRef.current);

    if (table.getCanPreviousPage()) {
      focusPosition(pageStart - pagination.pageSize);
    }
  });

  useEffect(() => {
    setPagination((current) => ({
      ...current,
      pageIndex: Math.min(current.pageIndex, Math.max(table.getPageCount() - 1, 0)),
    }));
  }, [messages.length, table]);

  useEffect(() => {
    if (!focusedRow || !focus) {
      return;
    }
    if (focus.id !== focusedRow.id || focus.position !== position) {
      setFocus({ id: focusedRow.id, position });
    }
    const targetPage = Math.floor(position / pagination.pageSize);
    if (pagination.pageIndex !== targetPage) {
      table.setPageIndex(targetPage);
    }
  }, [focus, focusedRow, position, pagination, table]);

  // Also on `rows`, because acting on the focused row unmounts it and the row
  // that takes its index inherits the ref without inheriting the focus.
  useEffect(() => {
    focusedRowRef.current?.focus({ preventScroll: true });

    focusedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusedRow, rows]);

  useEffect(() => {
    return () => {
      clearTimeout(gPrefixTimeoutRef.current);
    };
  }, []);

  return (
    <>
      <PendingActionContext value={pending}>
        <Table className="unified-inbox-table" aria-labelledby="unread-heading">
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                ref={row.id === focusedRow?.id ? focusedRowRef : undefined}
                tabIndex={row.id === focusedRow?.id ? -1 : undefined}
                data-state={row.id === focusedRow?.id ? "selected" : undefined}
                className="inbox-row outline-none"
                onBlur={(event) => {
                  if (
                    event.relatedTarget instanceof Element &&
                    !event.relatedTarget.hasAttribute("data-inbox-row")
                  ) {
                    setFocus(null);
                  }
                }}
                data-inbox-row=""
                onContextMenu={(event) => {
                  if (window.getSelection()?.toString()) {
                    return;
                  }
                  event.preventDefault();
                  const { id, subject, summary, account } = row.original;
                  ipc.main.send(
                    "contextMenu.inboxRow",
                    account.id,
                    id,
                    subject.slice(0, 512),
                    summary.slice(0, 4096),
                    (row.original.author.name || row.original.author.email).slice(0, 512),
                    event.clientX,
                    event.clientY,
                  );
                }}
                data-pending={
                  (pending?.accountId === row.original.account.id &&
                    pending.messageId === row.original.id) ||
                  undefined
                }
                onClick={() => {
                  openMessage(row.original);
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PendingActionContext>
      {messages.length > 10 && (
        <div className="inbox-pagination">
          <div className="flex items-center gap-2">
            <div className="text-sm">
              <Trans comment="Label of All Mail's picker for how many messages a page lists">
                Rows per page
              </Trans>
            </div>
            <Select
              value={rowsPerPage}
              onValueChange={(value) => {
                if (value) {
                  setFocus(null);
                  table.setPageSize(value);

                  configMutation.mutate({ "unifiedInbox.rowsPerPage": value });
                }
              }}
            >
              <SelectTrigger aria-label={t`Rows per page`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 20, 25, 30].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm">
              <Trans comment="All Mail's current page and how many pages it has">
                Page {currentPage} of {pageCount}
              </Trans>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                focusPosition(0);
              }}
              title={t`First page`}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeftIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                focusPosition(pageStart - pagination.pageSize);
              }}
              title={t`Previous page`}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                focusPosition(pageStart + pagination.pageSize);
              }}
              title={t`Next page`}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                focusPosition((pageCount - 1) * pagination.pageSize);
              }}
              title={t`Last page`}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function UnifiedInbox() {
  const { config } = useConfig();
  const { t, i18n } = useLingui();
  const { inboxes, messages } = useUnifiedInbox();
  const { accountId, select } = useInboxScope();
  const feed = useRef<HTMLDivElement>(null);
  const selectAccount = (next?: string) => {
    if (accountId !== next && feed.current) {
      feed.current.scrollTop = 0;
    }
    select(next);
  };
  const selected = inboxes.find(({ account }) => account.id === accountId);
  const visibleMessages = useMemo(
    () =>
      selected ? messages.filter(({ account }) => account.id === selected.account.id) : messages,
    [messages, selected],
  );
  const visibleInboxes = selected ? [selected] : inboxes;
  const ready =
    visibleInboxes.length > 0 && visibleInboxes.every(({ status }) => status === "ready");

  const renderContent = () => {
    if (config && visibleMessages.length) {
      return (
        <UnifiedInboxTable
          key={selected?.account.id}
          messages={visibleMessages}
          rowsPerPage={config["unifiedInbox.rowsPerPage"]}
          showSenderIcons={config["unifiedInbox.showSenderIcons"]}
        />
      );
    }

    let Icon = Loader2Icon;
    let title = t`Loading email…`;
    if (config) {
      if (!inboxes.length) {
        Icon = InboxIcon;
        title = t`No accounts are included in All Mail.`;
      } else if (ready) {
        Icon = MailCheckIcon;
        title = t`No unread messages`;
      } else if (!visibleInboxes.some(({ status }) => status === "syncing")) {
        const needsSignIn = visibleInboxes.some(({ status }) => status === "signIn");
        Icon = needsSignIn ? KeyRoundIcon : RefreshCwIcon;
        title = needsSignIn ? t`Sign in to see unread messages` : t`Waiting to sync`;
      }
    }
    return (
      <Empty className="inbox-empty" role="status">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className={cn("size-7", Icon === Loader2Icon && "motion-safe:animate-spin")} />
          </EmptyMedia>
          <EmptyTitle className="text-base">{title}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  };

  return (
    <main>
      <UnifiedInboxSearch
        accountPicker={
          inboxes.length > 0 && (
            <InboxAccounts
              inboxes={inboxes}
              selected={selected?.account.id}
              onSelect={selectAccount}
              compact
            />
          )
        }
      >
        <div className="inbox-layout">
          {inboxes.length > 0 && (
            <InboxAccounts
              inboxes={inboxes}
              selected={selected?.account.id}
              onSelect={selectAccount}
            />
          )}
          <div className="inbox-feed" ref={feed}>
            <InboxFollowUps accountId={selected?.account.id} />
            <section className="inbox-panel" aria-labelledby="unread-heading">
              <div className="inbox-panel-heading">
                <h2 id="unread-heading" className="mail-section-title">
                  <InboxIcon aria-hidden="true" />
                  <Trans>Unread messages</Trans>
                  {(visibleMessages.length > 0 || ready) && (
                    <span className="mail-count">{i18n.number(visibleMessages.length)}</span>
                  )}
                </h2>
                {visibleMessages.length > 1 && (
                  <span className="inbox-sort" title={t`Newest first`}>
                    <ArrowDownWideNarrowIcon aria-hidden="true" />
                    <span>
                      <Trans>Newest first</Trans>
                    </span>
                  </span>
                )}
              </div>
              {renderContent()}
            </section>
          </div>
        </div>
      </UnifiedInboxSearch>
    </main>
  );
}
