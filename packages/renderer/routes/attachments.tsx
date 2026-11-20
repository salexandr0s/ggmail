import { getAccountLabel } from "@ggmail/shared/accounts";
import { fileKind } from "@ggmail/shared/attachments";
import { Button } from "@ggmail/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@ggmail/ui/components/empty";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowDownWideNarrowIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  PaperclipIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "wouter/use-hash-location";
import { create } from "zustand";
import { FileItem, ListHeadings, type LibraryFile } from "@/components/attachments/files";
import { LibraryFilters, type KindFilter, type KindOption } from "@/components/attachments/filters";
import { createDateTimeFormatter } from "@/lib/date";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { useAccountsStore } from "@/lib/stores";
import { useAttachmentFiles } from "@/lib/use-attachment-files";

// Keep the reader's place when a file opens in Gmail. Only the layout persists across app launches.
const useBrowseState = create(() => ({
  account: "",
  kind: "all" as KindFilter,
  query: "",
  sort: "recent",
  page: 0,
}));
const setBrowse = useBrowseState.setState;
const pageSize = 36;
const matchText = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function closeLibrary() {
  navigate("/");
  document.getElementById("attachments-toggle")?.focus();
}

export function Attachments() {
  const { t } = useLingui();
  const accounts = useAccountsStore((state) => state.accounts);
  const [refresh, setRefresh] = useState(0);
  const [retry, setRetry] = useState(0);
  const scope = JSON.stringify(
    accounts.map(({ config, gmail }) => ({
      id: config.id,
      signedOut: gmail.attentionRequired,
      delegated: config.gmail.delegatedAccountId,
    })),
  );
  const mailboxes = useAttachmentFiles(scope, refresh, retry);
  const { account, kind, query, sort, page } = useBrowseState();
  const { config } = useConfig();
  const configMutation = useConfigMutation();
  const grid = config?.["attachments.layout"] === "grid";
  const searchInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const date = useMemo(
    () => createDateTimeFormatter({ year: "numeric", month: "short", day: "numeric" }),
    [],
  );
  const chosenAccount = accounts.find((a) => a.config.id === account);
  const chosen = chosenAccount?.config.id ?? "";
  const scoped = accounts.filter((a) => !chosen || a.config.id === chosen);
  const loading = scoped.some(
    (a) =>
      !a.gmail.attentionRequired && (mailboxes[a.config.id]?.status ?? "loading") === "loading",
  );
  const unavailable = scoped.filter(
    (a) => a.gmail.attentionRequired || mailboxes[a.config.id]?.status === "error",
  );
  const unavailableAccounts = unavailable.map((a) => getAccountLabel(a.config.label)).join(", ");

  const { results, counts } = useMemo(() => {
    const text = matchText(query.trim());
    const counts = { all: 0, pdf: 0, sheet: 0, document: 0, image: 0, other: 0 };
    const results: LibraryFile[] = [];
    for (const { config: accountConfig, gmail } of accounts) {
      if (gmail.attentionRequired || (chosen && chosen !== accountConfig.id)) {
        continue;
      }
      for (const file of mailboxes[accountConfig.id]?.files ?? []) {
        if (text && !matchText([file.name, file.subject, file.sender].join(" ")).includes(text)) {
          continue;
        }
        const type = fileKind(file.name);
        counts.all++;
        counts[type]++;
        if (kind === "all" || kind === type) {
          results.push({ ...file, account: accountConfig });
        }
      }
    }
    results.sort(
      (a, b) =>
        (sort === "name" ? a.name.localeCompare(b.name) : 0) ||
        b.receivedAt - a.receivedAt ||
        a.account.id.localeCompare(b.account.id) ||
        a.id.localeCompare(b.id),
    );
    return { results, counts };
  }, [accounts, mailboxes, chosen, kind, query, sort]);
  const count = results.length;
  const pages = Math.ceil(count / pageSize);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const filtered = !!(chosen || query || kind !== "all");
  const kinds: KindOption[] = [
    { value: "all", label: t`All files` },
    { value: "pdf", label: "PDF" },
    { value: "document", label: t`Documents` },
    { value: "sheet", label: t`Spreadsheets` },
    { value: "image", label: t`Images` },
    { value: "other", label: t`Other files` },
  ];
  const sortOptions = [
    { value: "recent", label: t`Newest first` },
    { value: "name", label: t`File name` },
  ];
  const title = kinds.find((option) => option.value === kind)?.label;
  const clear = () => setBrowse({ account: "", kind: "all", query: "", page: 0 });
  const filters = (
    <>
      <LibraryFilters
        kinds={kinds}
        counts={counts}
        kind={kind}
        onKind={(kind) => setBrowse({ kind, page: 0 })}
        accounts={accounts.map((a) => a.config)}
        chosen={chosen}
        onAccount={(account) => setBrowse({ account, page: 0 })}
      />
      {filtered && count > 0 && (
        <Button variant="ghost" size="sm" className="mt-4 text-muted-foreground" onClick={clear}>
          <XIcon />
          <Trans>Clear filters</Trans>
        </Button>
      )}
    </>
  );
  useEffect(() => {
    viewport.current?.scrollTo(0, 0);
  }, [query, chosen, kind, currentPage, sort, grid]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector(
          '[data-slot="popover-content"], [data-slot="select-content"], [data-slot="dialog-content"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      if (event.target === searchInput.current && useBrowseState.getState().query) {
        setBrowse({ query: "", page: 0 });
      } else {
        closeLibrary();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main
      aria-label={t`Attachments`}
      className="@container/library flex min-h-0 min-w-0 flex-1 flex-col bg-sidebar"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-3 py-3 @min-[38rem]/library:flex-nowrap @min-[38rem]/library:px-5 @min-[38rem]/library:py-4">
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          <PaperclipIcon aria-hidden="true" className="size-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">
            <Trans>Attachments</Trans>
          </h1>
        </div>
        <InputGroup className="order-last h-9 w-full bg-background @min-[38rem]/library:order-0 @min-[38rem]/library:max-w-80">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchInput}
            type="search"
            className="[&::-webkit-search-cancel-button]:hidden"
            aria-label={t`Search attachments`}
            placeholder={t`Search files, senders, or subjects`}
            value={query}
            onChange={(e) => setBrowse({ query: e.target.value, page: 0 })}
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                title={t`Clear search`}
                onClick={() => {
                  setBrowse({ query: "", page: 0 });
                  searchInput.current?.focus();
                }}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={t`Refresh attachments`}
            onClick={() => {
              setBrowse({ page: 0 });
              setRefresh((n) => n + 1);
            }}
          >
            <RefreshCwIcon />
          </Button>
          <Button variant="ghost" size="icon" title={t`Close attachments`} onClick={closeLibrary}>
            <XIcon />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-4 px-2 pb-2 @min-[38rem]/library:px-4 @min-[38rem]/library:pb-4">
        <aside
          aria-label={t`Filters`}
          className="hidden w-44 shrink-0 overflow-y-auto pt-3 @min-[54rem]/library:block"
        >
          {filters}
        </aside>
        <section
          aria-label={title}
          className="@container/results flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-3 @min-[36rem]/results:px-4">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <h2 className="text-base font-semibold tracking-tight">{title}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                <Plural value={count} one="# file" other="# files" />
              </span>
              {chosenAccount && (
                <span
                  className="max-w-32 truncate text-xs text-muted-foreground"
                  title={getAccountLabel(chosenAccount.config.label)}
                >
                  · {getAccountLabel(chosenAccount.config.label)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="@min-[54rem]/library:hidden">
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant={chosen || kind !== "all" ? "secondary" : "outline"}
                        size="icon"
                        title={t`Filters`}
                      />
                    }
                  >
                    <SlidersHorizontalIcon />
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="max-h-[min(70vh,var(--available-height))] w-56 overflow-y-auto"
                  >
                    <PopoverTitle className="sr-only">{t`Filters`}</PopoverTitle>
                    {filters}
                  </PopoverContent>
                </Popover>
              </div>
              <Select
                value={sort}
                items={sortOptions}
                onValueChange={(value) => {
                  if (value) {
                    setBrowse({ sort: value, page: 0 });
                  }
                }}
              >
                <SelectTrigger aria-label={t`Sort by`} className="max-w-40 gap-1.5 text-xs">
                  <ArrowDownWideNarrowIcon className="size-3.5 text-muted-foreground" />
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div
                role="group"
                aria-label={t`Layout`}
                className="flex gap-0.5 rounded-lg border bg-muted/60 p-0.5"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={!grid}
                  title={t`List view`}
                  className="h-6 rounded-md text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
                  onClick={() => configMutation.mutate({ "attachments.layout": "list" })}
                >
                  <ListIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={grid}
                  title={t`Grid view`}
                  className="h-6 rounded-md text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
                  onClick={() => configMutation.mutate({ "attachments.layout": "grid" })}
                >
                  <LayoutGridIcon />
                </Button>
              </div>
            </div>
          </div>
          {unavailable.length > 0 && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground"
            >
              <CircleAlertIcon className="size-4 shrink-0" />
              <span className="min-w-40 flex-1">
                <Trans>
                  Couldn’t load attachments for {unavailableAccounts}. Check your Gmail connection
                  and refresh.
                </Trans>
              </span>
              {unavailable.some((a) => !a.gmail.attentionRequired) && (
                <Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>
                  <Trans>Retry</Trans>
                </Button>
              )}
            </div>
          )}
          {count > 0 && loading && (
            <div className="flex items-center gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 motion-safe:animate-spin" />
              <Trans>Loading older mail…</Trans>
            </div>
          )}
          <div ref={viewport} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {count > 0 ? (
              <>
                {!grid && <ListHeadings />}
                <ul
                  className={
                    grid
                      ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3 p-3 text-sm @min-[36rem]/results:p-4"
                      : "text-sm"
                  }
                >
                  {results
                    .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
                    .map((item) => (
                      <FileItem
                        key={JSON.stringify([item.account.id, item.id])}
                        item={item}
                        grid={grid}
                        date={date}
                        showAccount={!chosen && accounts.length > 1}
                        showSenderIcons={config?.["gmail.showSenderIcons"] === true}
                      />
                    ))}
                </ul>
              </>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="size-11 rounded-xl">
                    {loading ? (
                      <Loader2Icon className="motion-safe:animate-spin" />
                    ) : filtered ? (
                      <SearchIcon />
                    ) : (
                      <PaperclipIcon />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {loading
                      ? t`Looking for attachments…`
                      : kind !== "all" || query
                        ? t`No matching files`
                        : unavailable.length
                          ? t`No files available`
                          : t`No attachments`}
                  </EmptyTitle>
                  {!loading && !filtered && !unavailable.length && (
                    <EmptyDescription>
                      <Trans>Files attached to your Gmail messages appear here.</Trans>
                    </EmptyDescription>
                  )}
                  {filtered && (
                    <Button variant="outline" size="sm" onClick={clear}>
                      <Trans>Clear filters</Trans>
                    </Button>
                  )}
                </EmptyHeader>
              </Empty>
            )}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-xs text-muted-foreground tabular-nums">
              <Button
                variant="ghost"
                size="icon-sm"
                title={t`Previous page`}
                disabled={!currentPage}
                onClick={() => setBrowse({ page: currentPage - 1 })}
              >
                <ChevronLeftIcon />
              </Button>
              {currentPage + 1} / {pages}
              <Button
                variant="ghost"
                size="icon-sm"
                title={t`Next page`}
                disabled={currentPage + 1 === pages}
                onClick={() => setBrowse({ page: currentPage + 1 })}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
