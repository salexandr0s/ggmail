import { getAccountLabel } from "@ggmail/shared/accounts";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@ggmail/ui/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ggmail/ui/components/popover";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountsStore } from "@/lib/stores";
import { submitUnifiedSearch, useUnifiedSearch } from "@/lib/unified-search";
import { AccountBadge } from "./account-badge";
import { AccountFilters } from "./account-filters";

function MailboxResults({ accountId, query }: { accountId: string; query: string }) {
  const { t } = useLingui();
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(
    () => () => ipc.main.send("unifiedSearch.cancel", accountId, requestId),
    [accountId, requestId],
  );

  const { data, isFetching, isError, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
    queryKey: ["unifiedSearch", accountId, requestId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      ipc.main.invoke("unifiedSearch.read", accountId, requestId, query, pageParam),
    getNextPageParam: (lastPage, _pages, page) => (lastPage.more ? page + 1 : undefined),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    networkMode: "always",
  });
  const threads = data?.pages.flatMap((page) => page.threads);
  return (
    <>
      {!!threads?.length && (
        <ul className="divide-y">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className="block w-full min-w-0 px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:bg-muted focus-visible:-outline-offset-2 focus-visible:outline-ring"
                onClick={async () => {
                  try {
                    await ipc.main.invoke("unifiedSearch.open", accountId, requestId, thread.id);
                  } catch {
                    toast.error(t`Couldn’t open this conversation.`);
                  }
                }}
              >
                <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{thread.sender}</span>
                  <span className="shrink-0">{thread.date}</span>
                </span>
                <span className="block truncate text-sm font-medium">
                  {thread.subject || t`(no subject)`}
                </span>
                {thread.snippet && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {thread.snippet}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        role="status"
        className="flex items-center gap-2 px-3 text-sm text-muted-foreground has-[*]:py-2"
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
          <span>
            <Trans>No matching conversations</Trans>
          </span>
        ) : hasNextPage ? (
          <Button size="sm" variant="ghost" onClick={() => fetchNextPage()}>
            <Trans>Load more</Trans>
          </Button>
        ) : null}
      </div>
    </>
  );
}

export function UnifiedInboxSearch({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const { search, draft } = useUnifiedSearch();
  const accounts = useAccountsStore((state) => state.accounts);
  const [accountId, setAccountId] = useState("");
  const chosen = accounts.find((a) => a.config.id === accountId);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () =>
      ipc.renderer.on("unifiedSearch.invalidated", (_event, id) => {
        setRevisions((previous) => ({ ...previous, [id]: (previous[id] ?? 0) + 1 }));
      }),
    [],
  );

  const clear = () => {
    submitUnifiedSearch("");
    setAccountId("");
    input.current?.focus();
  };

  return (
    <>
      <form
        className="mb-5 flex flex-wrap items-center gap-2"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitUnifiedSearch(draft);
        }}
      >
        <InputGroup className="h-9 min-w-32 flex-1">
          <InputGroupAddon>
            <InputGroupButton type="submit" size="icon-xs" title={t`Search all accounts`}>
              <SearchIcon />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupInput
            ref={input}
            type="search"
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
              if (event.key === "Escape" && !event.nativeEvent.isComposing && draft) {
                event.preventDefault();
                event.stopPropagation();
                clear();
              }
            }}
          />
          {draft && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" title={t`Clear search`} onClick={clear}>
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {search && accounts.length > 1 && (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant={chosen ? "secondary" : "outline"}
                  className="max-w-full"
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
      {search ? (
        <div className="space-y-4">
          {accounts.map(({ config, gmail }) => {
            const label = getAccountLabel(config.label);
            return (
              <section
                key={config.id}
                aria-label={label}
                hidden={!!chosen && chosen.config.id !== config.id}
                className="overflow-hidden rounded-lg border"
              >
                <h2 className="border-b bg-muted/40 px-3 py-2">
                  <AccountBadge label={label} color={config.color} />
                </h2>
                {gmail.attentionRequired ? (
                  <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
                    <Trans>Sign in to search this account.</Trans>
                  </p>
                ) : (
                  <MailboxResults
                    key={JSON.stringify([
                      search.id,
                      config.gmail.delegatedAccountId,
                      revisions[config.id],
                    ])}
                    accountId={config.id}
                    query={search.query}
                  />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        children
      )}
    </>
  );
}
