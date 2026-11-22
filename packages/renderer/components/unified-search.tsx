import { getAccountLabel } from "@ggmail/shared/accounts";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@ggmail/ui/components/input-group";
import { Item } from "@ggmail/ui/components/item";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ggmail/ui/components/popover";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  KeyRoundIcon,
  Loader2Icon,
  SearchIcon,
  SearchXIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useAccountsStore, useMailboxRevisions } from "@/lib/stores";
import { submitUnifiedSearch, useUnifiedSearch } from "@/lib/unified-search";
import { AccountFilters } from "./account-filters";
import { AllMailIcon } from "./mail-icons";
import { MailboxSection, MailPageTitle } from "./mail-page";

// Only literal search terms describe text the reader can find in a result.
// Gmail operators such as filename: and newer_than: affect the result set instead.
function searchPattern(query: string) {
  const terms = new Set<string>();
  for (const token of query.match(/(?:[^\s"]+|"[^"]*")+/gu) ?? []) {
    if (token.startsWith("-") || token === "OR" || /^[\w-]+:/u.test(token)) {
      continue;
    }
    const text = token.replace(/^"|"$/gu, "").trim();
    if (text) {
      terms.add(text);
    }
  }
  const parts = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  return parts.length ? new RegExp(`(${parts.join("|")})`, "iu") : null;
}

function highlight(text: string, pattern: RegExp | null) {
  return pattern
    ? text.split(pattern).map((part, index) =>
        index % 2 ? (
          <mark key={index} className="rounded-xs bg-selected font-semibold text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )
    : text;
}

function MailboxResults({
  accountId,
  query,
  requestId,
}: {
  accountId: string;
  query: string;
  requestId: string;
}) {
  const { t } = useLingui();
  const pattern = useMemo(() => searchPattern(query), [query]);
  const selectedThread = useUnifiedSearch((state) =>
    state.selection?.accountId === accountId ? state.selection.threadId : null,
  );
  const { data, isFetching, isError, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
    queryKey: ["unifiedSearch", accountId, requestId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      ipc.main.invoke("unifiedSearch.read", accountId, requestId, query, pageParam),
    getNextPageParam: (lastPage, _pages, page) => (lastPage.more ? page + 1 : undefined),
    retry: false,
    gcTime: Infinity,
    staleTime: Infinity,
    networkMode: "always",
  });
  const threads = data?.pages.flatMap((page) => page.threads);
  return (
    <>
      {!!threads?.length && (
        <ul className="divide-y border-t">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Item
                render={<button type="button" />}
                size="xs"
                aria-current={selectedThread === thread.id ? "true" : undefined}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-none border-0 text-start hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @2xl:grid-cols-[minmax(7rem,24%)_minmax(0,1fr)_auto]"
                data-search-thread={thread.id}
                data-search-account={accountId}
                onClick={async (event) => {
                  const scrollTop =
                    event.currentTarget.closest('[data-slot="scroll-area-viewport"]')?.scrollTop ??
                    0;
                  useUnifiedSearch.setState({
                    selection: { accountId, threadId: thread.id, scrollTop },
                  });
                  try {
                    await ipc.main.invoke("unifiedSearch.open", accountId, requestId, thread.id);
                  } catch {
                    toast.error(t`Couldn’t open this conversation.`);
                  }
                }}
              >
                <span className="min-w-0 truncate text-sm font-medium" title={thread.sender}>
                  {highlight(thread.sender, pattern)}
                </span>
                <span className="inbox-message-preview col-span-2 row-start-2 @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1">
                  <span className="inbox-subject truncate font-semibold" title={thread.subject}>
                    {thread.subject ? highlight(thread.subject, pattern) : t`(no subject)`}
                  </span>
                  {thread.snippet && (
                    <span className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
                      {highlight(thread.snippet, pattern)}
                    </span>
                  )}
                </span>
                <span
                  className="col-start-2 row-start-1 truncate text-end text-xs text-muted-foreground tabular-nums @2xl:col-start-3"
                  title={thread.date}
                >
                  {thread.date}
                </span>
              </Item>
            </li>
          ))}
        </ul>
      )}
      <div
        role="status"
        className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground empty:hidden has-[*]:border-t has-[*]:px-3 has-[*]:py-2"
      >
        {isFetching ? (
          <>
            <Loader2Icon className="size-4 motion-safe:animate-spin" />
            <span>
              <Trans>Searching…</Trans>
            </span>
          </>
        ) : isError ? (
          <>
            <span>
              <Trans>Couldn’t search this account.</Trans>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => (data ? fetchNextPage() : refetch())}
            >
              <Trans>Retry</Trans>
            </Button>
          </>
        ) : !threads?.length ? (
          <span className="flex items-center gap-2">
            <SearchXIcon aria-hidden="true" className="size-4" />
            <Trans>No matching conversations</Trans>
          </span>
        ) : hasNextPage ? (
          <Button size="sm" variant="ghost" onClick={() => fetchNextPage()}>
            <ChevronDownIcon aria-hidden="true" />
            <Trans>Load more</Trans>
          </Button>
        ) : null}
      </div>
    </>
  );
}

export function UnifiedInboxSearch({
  children,
  accountPicker,
}: {
  children: ReactNode;
  accountPicker?: ReactNode;
}) {
  const { t } = useLingui();
  const { search, draft, accountId } = useUnifiedSearch();
  const revisions = useMailboxRevisions();
  const accounts = useAccountsStore((state) => state.accounts);
  const setAccountId = (id: string) =>
    useUnifiedSearch.setState({ accountId: id, selection: null });
  const chosen = accounts.find((a) => a.config.id === accountId);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  useHotkeys(
    "/",
    (event) => {
      if (
        !document.querySelector(
          ':is([role="dialog"], [role="menu"], [role="listbox"]):not([data-closed])',
        )
      ) {
        event.preventDefault();
        input.current?.focus();
      }
    },
    { useKey: true },
  );
  useLayoutEffect(() => {
    const selection = useUnifiedSearch.getState().selection;
    if (!selection || !results.current) {
      return;
    }
    const row = results.current.querySelector<HTMLButtonElement>(
      `[data-search-account="${CSS.escape(selection.accountId)}"][data-search-thread="${CSS.escape(selection.threadId)}"]`,
    );
    const viewport = results.current.closest('[data-slot="scroll-area-viewport"]');
    if (viewport && row) {
      viewport.scrollTop = selection.scrollTop;
      row.focus({ preventScroll: true });
    }
  }, [search?.id]);

  const clear = () => {
    submitUnifiedSearch("");
    input.current?.focus();
  };

  return (
    <>
      <header className="mail-page-header all-mail-header">
        <MailPageTitle icon={<AllMailIcon />}>
          <Trans comment="Title of All Mail page">All Mail</Trans>
        </MailPageTitle>
        {!search && accountPicker}
        <form
          className="all-mail-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submitUnifiedSearch(draft);
          }}
        >
          <InputGroup className="mail-search-field flex-1">
            <InputGroupAddon>
              <InputGroupButton type="submit" size="icon-sm" title={t`Search all accounts`}>
                <SearchIcon />
              </InputGroupButton>
            </InputGroupAddon>
            <InputGroupInput
              ref={input}
              type="search"
              aria-keyshortcuts="/"
              aria-label={t`Search all accounts`}
              placeholder={t`Search all accounts`}
              className="[&::-webkit-search-cancel-button]:hidden"
              value={draft}
              onChange={(event) => {
                if (!event.target.value) {
                  clear();
                } else {
                  useUnifiedSearch.setState({ draft: event.target.value });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !event.nativeEvent.isComposing) {
                  const first = results.current?.querySelector<HTMLButtonElement>(
                    "section:not([hidden]) [data-search-thread]",
                  );
                  if (first) {
                    event.preventDefault();
                    first.focus();
                  }
                }
                if (event.key === "Escape" && !event.nativeEvent.isComposing && draft) {
                  event.preventDefault();
                  event.stopPropagation();
                  clear();
                }
              }}
            />
            {draft ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" title={t`Clear search`} onClick={clear}>
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : (
              <kbd aria-hidden="true" className="all-mail-search-key">
                /
              </kbd>
            )}
          </InputGroup>
          {search && accounts.length > 1 && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant={chosen ? "secondary" : "outline"}
                    className="all-mail-search-account max-w-full min-w-0 shrink"
                  />
                }
              >
                <SlidersHorizontalIcon />
                <span className="truncate">
                  {chosen ? getAccountLabel(chosen.config.label) : t`All accounts`}
                </span>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="max-h-[min(70vh,var(--available-height))] w-56 overflow-y-auto"
              >
                <PopoverTitle className="sr-only">{t`Filters`}</PopoverTitle>
                <AccountFilters
                  accounts={accounts.map((a) => a.config)}
                  chosen={chosen?.config.id ?? ""}
                  onAccount={setAccountId}
                />
              </PopoverContent>
            </Popover>
          )}
        </form>
      </header>
      {search ? (
        <div
          className="all-mail-results"
          ref={results}
          onKeyDown={(event) => {
            if (
              !(event.target instanceof HTMLButtonElement) ||
              !event.target.dataset.searchThread
            ) {
              return;
            }
            const direction = ["ArrowDown", "j"].includes(event.key)
              ? 1
              : ["ArrowUp", "k"].includes(event.key)
                ? -1
                : 0;
            if (!direction) {
              return;
            }
            event.preventDefault();
            const rows = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "section:not([hidden]) [data-search-thread]",
              ),
            );
            rows[rows.indexOf(event.target) + direction]?.focus();
          }}
        >
          <h2 className="mail-section-title">
            <SearchIcon aria-hidden="true" />
            <Trans>Search results</Trans>
          </h2>
          {accounts.map(({ config, gmail }) => {
            return (
              <MailboxSection
                key={config.id}
                account={config}
                hidden={!!chosen && chosen.config.id !== config.id}
              >
                {gmail.attentionRequired ? (
                  <div role="status" className="border-t px-3.5 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ipc.main.send("gmail.openInboxSignIn", config.id)}
                    >
                      <KeyRoundIcon aria-hidden="true" />
                      <Trans>Sign in to search this account.</Trans>
                    </Button>
                  </div>
                ) : (
                  <MailboxResults
                    key={JSON.stringify([
                      search.id,
                      config.gmail.delegatedAccountId,
                      revisions[config.id],
                    ])}
                    requestId={search.id + "/" + (revisions[config.id] ?? 0)}
                    accountId={config.id}
                    query={search.query}
                  />
                )}
              </MailboxSection>
            );
          })}
        </div>
      ) : (
        children
      )}
    </>
  );
}
