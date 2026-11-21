import { getAccountLabel } from "@ggmail/shared/accounts";
import { ipc } from "@ggmail/shared/renderer/ipc";
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
  MailIcon,
  FileIcon,
  Loader2Icon,
  PaperclipIcon,
  RefreshCwIcon,
  SearchIcon,
  CalendarDaysIcon,
  HardDriveIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { categoryIcons, useCategoryLabels } from "@/components/attachments/categories";
import { DetailFilters, useSizeLabels } from "@/components/attachments/detail-filters";
import { FileItem, ListHeadings } from "@/components/attachments/files";
import {
  FormatFilters,
  LibraryFilters,
  FilterMenu,
  type KindOption,
} from "@/components/attachments/filters";
import {
  dateBoundary,
  emptyAttachmentFilters,
  filterAttachments,
  toggleValue,
  type AttachmentFilters,
} from "@/lib/attachment-filters";
import { createDateTimeFormatter } from "@/lib/date";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { useAccountsStore } from "@/lib/stores";
import { useAttachmentFiles } from "@/lib/use-attachment-files";
import "@/components/attachments/library.css";

// Keep the reader's place when a file opens in Gmail. Only the layout persists across app launches.
const useBrowseState = create(() => ({
  ...emptyAttachmentFilters,
  sort: "recent",
  page: 0,
}));
type LibraryPosition = { top: number; key?: string; offset?: number };
let position: LibraryPosition = { top: 0 };
const setBrowse = (changes: Partial<ReturnType<typeof useBrowseState.getState>>) => {
  position = { top: 0 };
  useBrowseState.setState(changes);
};
const pageSize = 36;
const changeFilters = (change: Partial<AttachmentFilters>) => setBrowse({ ...change, page: 0 });

export function Attachments() {
  const { t, i18n } = useLingui();
  const accounts = useAccountsStore((state) => state.accounts);
  const [refresh, setRefresh] = useState(0);
  const scope = JSON.stringify(
    accounts.map(({ config, gmail }) => ({
      id: config.id,
      signedOut: gmail.attentionRequired,
      delegated: config.gmail.delegatedAccountId,
    })),
  );
  const { mailboxes, setCategory, retry } = useAttachmentFiles(scope, refresh);
  const browse = useBrowseState();
  const {
    accountIds,
    kinds,
    categories,
    query,
    sender,
    extension,
    from,
    through,
    size,
    sort,
    page,
  } = browse;
  const { config } = useConfig();
  const configMutation = useConfigMutation();
  const grid = config?.["attachments.layout"] === "grid";
  const searchInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const restore = useRef<LibraryPosition | null>(position);
  const previousBrowse = useRef(browse);
  const previousGrid = useRef(grid);
  const date = useMemo(
    () => createDateTimeFormatter({ year: "numeric", month: "short", day: "numeric" }),
    [],
  );
  const chosen = useMemo(
    () => accountIds.filter((id) => accounts.some((a) => a.config.id === id)),
    [accountIds, accounts],
  );
  const scoped = accounts.filter((a) => !chosen.length || chosen.includes(a.config.id));
  const scanning = scoped.filter(
    (a) =>
      !a.gmail.attentionRequired && (mailboxes[a.config.id]?.status ?? "loading") === "loading",
  );
  const loading = scanning.length > 0;
  const incomplete = scoped.filter(
    (a) => !a.gmail.attentionRequired && mailboxes[a.config.id]?.status === "incomplete",
  );
  const accountNames = (subset: typeof scoped) =>
    new Intl.ListFormat(i18n.locale).format(subset.map((a) => getAccountLabel(a.config.label)));
  const partialAccounts = accountNames(
    incomplete.filter((a) => mailboxes[a.config.id]?.files.length),
  );
  const unavailableAccounts = accountNames(
    incomplete.filter((a) => !mailboxes[a.config.id]?.files.length),
  );
  const signedOutAccounts = accountNames(scoped.filter((a) => a.gmail.attentionRequired));
  const hasIssue = !!(incomplete.length || signedOutAccounts);
  const loadingAccounts = accountNames(scanning);

  const categoryLabels = useCategoryLabels();
  const byName = useMemo(
    () => new Intl.Collator(i18n.locale, { numeric: true, sensitivity: "base" }),
    [i18n.locale],
  );
  const index = useMemo(() => {
    const files = accounts.flatMap(({ config, gmail }) =>
      gmail.attentionRequired ? [] : (mailboxes[config.id]?.files ?? []),
    );
    return files.sort(
      ({ file: a }, { file: b }) =>
        (sort === "name" ? byName.compare(a.name, b.name) : 0) ||
        b.receivedAt - a.receivedAt ||
        a.accountId.localeCompare(b.accountId) ||
        a.id.localeCompare(b.id),
    );
  }, [accounts, mailboxes, sort, byName]);
  const matches = useMemo(
    () =>
      filterAttachments(index, {
        accountIds: chosen,
        kinds,
        categories,
        query,
        sender,
        extension,
        from,
        through,
        size,
      }),
    [index, chosen, kinds, categories, query, sender, extension, from, through, size],
  );
  const { results } = matches;
  const count = results.length;
  const pages = Math.ceil(count / pageSize);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const visibleFiles = results
    .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    .flatMap((file) => {
      const account = accounts.find(({ config }) => config.id === file.accountId)?.config;
      return account ? [{ ...file, account }] : [];
    });
  const kindOptions: KindOption[] = [
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
  const clear = () => {
    changeFilters(emptyAttachmentFilters);
    searchInput.current?.focus();
  };
  const sizeLabels = useSizeLabels();
  const dateLabels = useMemo(
    () => new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium" }),
    [i18n.locale],
  );
  const formatDay = (day: string) => {
    const date = dateBoundary(day);
    return Number.isFinite(+date) ? dateLabels.format(date) : day;
  };
  const startDate = from && formatDay(from);
  const endDate = through && formatDay(through);
  const details = [
    {
      key: "sender",
      label: sender.trim() && t`From ${sender}`,
      Icon: UserRoundIcon,
      remove: () => changeFilters({ sender: "" }),
    },
    {
      key: "extension",
      label: extension === null ? "" : extension ? "." + extension : t`No extension`,
      Icon: FileIcon,
      remove: () => changeFilters({ extension: null }),
    },
    {
      key: "from",
      label: from && t`Since ${startDate}`,
      Icon: CalendarDaysIcon,
      remove: () => changeFilters({ from: "" }),
    },
    {
      key: "through",
      label: through && t`Through ${endDate}`,
      Icon: CalendarDaysIcon,
      remove: () => changeFilters({ through: "" }),
    },
    {
      key: "size",
      label: size ? sizeLabels[size] : "",
      Icon: HardDriveIcon,
      remove: () => changeFilters({ size: null }),
    },
  ].filter(({ label }) => label);
  const activeFilters = [
    ...accounts
      .filter((a) => chosen.includes(a.config.id))
      .map(({ config }) => ({
        key: "account-" + config.id,
        label: getAccountLabel(config.label),
        Icon: MailIcon,
        remove: () => changeFilters({ accountIds: toggleValue(chosen, config.id) }),
      })),
    ...kindOptions
      .filter((option) => option.value !== "all" && kinds.includes(option.value))
      .map(({ value, label }) => ({
        key: "format-" + value,
        label,
        Icon: FileIcon,
        remove: () => changeFilters({ kinds: kinds.filter((kind) => kind !== value) }),
      })),
    ...categories.map((category) => ({
      key: category,
      label: categoryLabels[category],
      Icon: categoryIcons[category],
      remove: () => changeFilters({ categories: toggleValue(categories, category) }),
    })),
    ...details,
  ];
  const filtered = activeFilters.length > 0 || !!query.trim();
  const formats = (
    <FormatFilters
      kinds={kindOptions}
      selected={kinds}
      counts={matches.kinds}
      onKind={(kind) => changeFilters({ kinds: kind === "all" ? [] : toggleValue(kinds, kind) })}
    />
  );
  const filters = (
    <LibraryFilters
      categories={categories}
      categoryLabels={categoryLabels}
      categoryCounts={matches.categories}
      onCategory={(category) =>
        changeFilters({ categories: category === "all" ? [] : toggleValue(categories, category) })
      }
      accounts={accounts.map((a) => a.config)}
      chosen={chosen}
      accountCounts={matches.accounts}
      onAccount={(id) => changeFilters({ accountIds: id ? toggleValue(chosen, id) : [] })}
    />
  );
  const detailFilters = (
    <DetailFilters
      filters={browse}
      onChange={changeFilters}
      sizeLabels={sizeLabels}
      extensionCounts={matches.extensions}
      sizeCounts={matches.sizes}
    />
  );
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) {
      return;
    }
    if (
      previousBrowse.current !== browse ||
      (config && previousGrid.current !== grid && !restore.current)
    ) {
      previousBrowse.current = browse;
      restore.current = null;
      position = { top: 0 };
      el.scrollTop = 0;
    }
    previousGrid.current = grid;
    const saved = restore.current;
    if (!saved || !config) {
      return;
    }
    const fileIndex = saved.key
      ? results.findIndex((file) => JSON.stringify([file.mailboxKey, file.id]) === saved.key)
      : -1;
    if (fileIndex >= 0 && Math.floor(fileIndex / pageSize) !== currentPage) {
      if (!loading) {
        useBrowseState.setState({ page: Math.floor(fileIndex / pageSize) });
        previousBrowse.current = useBrowseState.getState();
      }
      return;
    }
    const file = saved.key
      ? el.querySelector<HTMLButtonElement>(`[data-file-key="${CSS.escape(saved.key)}"]`)
      : null;
    if (file && saved.offset !== undefined) {
      el.scrollTop +=
        file.getBoundingClientRect().top - el.getBoundingClientRect().top - saved.offset;
      file.focus({ preventScroll: true });
    } else {
      el.scrollTop = saved.top;
    }
    if (!loading) {
      restore.current = null;
    }
  }, [browse, config, currentPage, grid, loading, results]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector(
          ':is([data-slot="popover-content"], [data-slot="select-content"], [data-slot="dialog-content"], [data-slot="dropdown-menu-content"])[data-open]',
        )
      ) {
        return;
      }
      if (event.target === searchInput.current && useBrowseState.getState().query) {
        event.preventDefault();
        setBrowse({ query: "", page: 0 });
      } else {
        event.preventDefault();
        ipc.main.send("workspaceApp.goBack");
      }
    };
    // Inspect the open layer before it handles Escape. Closing animations leave portals mounted.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <main
      aria-label={t`Attachments`}
      className="attachment-library @container/library flex min-h-0 min-w-0 flex-1 flex-col bg-background"
    >
      <header className="attachment-header">
        <div className="attachment-heading">
          <span className="attachment-library-icon">
            <PaperclipIcon aria-hidden="true" />
          </span>
          <h1>
            <Trans>Attachments</Trans>
          </h1>
        </div>
        <InputGroup className="attachment-search">
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
        <Button
          className="attachment-refresh"
          variant="outline"
          size="icon"
          title={t`Refresh attachments`}
          onClick={() => {
            setBrowse({ page: 0 });
            setRefresh((n) => n + 1);
          }}
        >
          <RefreshCwIcon />
        </Button>
      </header>
      <div className="attachment-body">
        <aside
          aria-label={t`Filters`}
          className="attachment-rail hidden @min-[54rem]/library:block"
        >
          {filters}
        </aside>
        <section aria-label={t`All files`} className="attachment-results @container/results">
          <div className="attachment-type-bar hidden @min-[54rem]/library:block">{formats}</div>
          <div className="attachment-results-panel">
            <div className="attachment-toolbar">
              <h2
                aria-live="polite"
                aria-atomic="true"
                aria-busy={loading}
                className="attachment-count"
              >
                {(!loading || count > 0) && <Plural value={count} one="# file" other="# files" />}
              </h2>
              <div className="attachment-view-tools">
                <div className="@min-[54rem]/library:hidden">
                  <FilterMenu
                    title={t`Filters`}
                    applied={activeFilters.length}
                    count={count}
                    onClear={filtered ? () => changeFilters(emptyAttachmentFilters) : undefined}
                  >
                    <h2>{t`File type`}</h2>
                    {formats}
                    {filters}
                    {detailFilters}
                  </FilterMenu>
                </div>
                <div className="hidden @min-[54rem]/library:block">
                  <FilterMenu
                    title={t`More filters`}
                    applied={details.length}
                    count={count}
                    onClear={filtered ? () => changeFilters(emptyAttachmentFilters) : undefined}
                  >
                    {detailFilters}
                  </FilterMenu>
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
                  <SelectTrigger
                    aria-label={t`Sort by`}
                    className="attachment-sort max-w-40 gap-1.5 text-xs"
                  >
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
                <div role="group" aria-label={t`Layout`} className="attachment-layout-toggle">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-pressed={!grid}
                    title={t`List view`}
                    onClick={() => configMutation.mutate({ "attachments.layout": "list" })}
                  >
                    <ListIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-pressed={grid}
                    title={t`Grid view`}
                    onClick={() => configMutation.mutate({ "attachments.layout": "grid" })}
                  >
                    <LayoutGridIcon />
                  </Button>
                </div>
              </div>
            </div>
            {activeFilters.length > 0 && (
              <div className="attachment-applied">
                <div className="attachment-filter-chips">
                  {activeFilters.map(({ key, label, Icon, remove }) => (
                    <button
                      type="button"
                      key={key}
                      className="attachment-filter-chip"
                      aria-label={t`Remove filter “${label}”`}
                      onClick={(event) => {
                        if (event.detail === 0) {
                          const next =
                            event.currentTarget.nextElementSibling ??
                            event.currentTarget.previousElementSibling;
                          (next instanceof HTMLButtonElement ? next : searchInput.current)?.focus();
                        }
                        remove();
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span className="truncate">{label}</span>
                      <XIcon aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={clear}
                >{t`Clear filters`}</Button>
              </div>
            )}
            {hasIssue && (
              <div role="status" className="attachment-warning">
                <CircleAlertIcon className="size-4 shrink-0" />
                <div className="min-w-40 flex-1 space-y-1">
                  {partialAccounts && (
                    <p>
                      <Trans>
                        Some messages in {partialAccounts} couldn’t be checked. Previously loaded
                        files are still available.
                      </Trans>
                    </p>
                  )}
                  {unavailableAccounts && (
                    <p>
                      <Trans>Couldn’t check {unavailableAccounts} for attachments.</Trans>
                    </p>
                  )}
                  {signedOutAccounts && (
                    <p>
                      <Trans>Sign in to {signedOutAccounts} to load attachments.</Trans>
                    </p>
                  )}
                </div>
                {incomplete.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retry(incomplete.map((a) => a.config.id))}
                  >
                    <Trans>Retry</Trans>
                  </Button>
                )}
              </div>
            )}
            {count > 0 && loading && (
              <div className="attachment-loading">
                <Loader2Icon className="size-3 motion-safe:animate-spin" />
                {hasIssue ? (
                  <Trans>Still checking {loadingAccounts}…</Trans>
                ) : (
                  <Trans>Loading older mail…</Trans>
                )}
              </div>
            )}
            <div
              ref={viewport}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              onScroll={(event) => {
                if (!restore.current) {
                  position.top = event.currentTarget.scrollTop;
                }
              }}
              onWheel={() => {
                restore.current = null;
                position.key = undefined;
              }}
            >
              {count > 0 ? (
                <>
                  {!grid && <ListHeadings />}
                  <ul className={grid ? "attachment-grid" : "attachment-list"}>
                    {visibleFiles.map((item) => (
                      <FileItem
                        key={JSON.stringify([item.mailboxKey, item.id])}
                        item={item}
                        onOpenSource={(button) => {
                          const el = viewport.current;
                          if (el) {
                            position = {
                              top: el.scrollTop,
                              key: button.dataset.fileKey,
                              offset:
                                button.getBoundingClientRect().top - el.getBoundingClientRect().top,
                            };
                          }
                        }}
                        onCategory={(category) =>
                          setCategory(item.account.id, item.mailboxKey, item.id, category)
                        }
                        grid={grid}
                        date={date}
                        showAccount={scoped.length > 1}
                        showSenderIcons={config?.["gmail.showSenderIcons"] === true}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <Empty className="attachment-empty">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
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
                        : activeFilters.length > chosen.length || query.trim()
                          ? t`No matching files`
                          : hasIssue
                            ? t`No files available`
                            : t`No attachments`}
                    </EmptyTitle>
                    {!loading && !filtered && !hasIssue && (
                      <EmptyDescription>
                        <Trans>Files attached to your Gmail messages appear here.</Trans>
                      </EmptyDescription>
                    )}
                    {filtered && !activeFilters.length && (
                      <Button variant="outline" size="sm" onClick={clear}>
                        <Trans>Clear filters</Trans>
                      </Button>
                    )}
                  </EmptyHeader>
                </Empty>
              )}
            </div>
            {pages > 1 && (
              <div className="attachment-pagination">
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
          </div>
        </section>
      </div>
    </main>
  );
}
