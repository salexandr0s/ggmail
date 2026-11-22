import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { BookmarkState } from "@ggmail/shared/schemas";
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
import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { cn } from "@ggmail/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { SearchIcon, XIcon } from "lucide-react";
import { useRef, useState, type Ref } from "react";
import { BookmarksIcon } from "@/components/bookmarks-icon";
import { Popup } from "@/components/popup";
import { TabIcon } from "@/components/tab-icon";
import { sortablePlugins, sortableSensors } from "@/lib/dnd";
import { renderApp } from "@/lib/react";
import { useBookmarks } from "@/lib/react-query";
import { normalizeSearchText } from "@/lib/utils";

function closePopup() {
  ipc.main.send("bookmarks.closePopup");
}

function openBookmark({ accountId, id }: BookmarkState) {
  ipc.main.send("bookmarks.openBookmark", accountId, id);
  closePopup();
}

function Bookmark({
  ref,
  bookmark,
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  bookmark: BookmarkState;
  className?: string;
}) {
  const { t } = useLingui();
  const { accountId, id, app, title, url } = bookmark;
  const site = URL.parse(url)?.host;

  return (
    <div ref={ref} className={cn("group relative", className)}>
      <Button
        variant="ghost"
        size="sm"
        data-bookmark-open
        className="h-13 w-full justify-start gap-3 rounded-xl py-1.5 ps-2 pe-10 text-sm"
        title={url}
        aria-label={title || site || url}
        aria-description={site && site !== title ? site : undefined}
        onClick={() => openBookmark(bookmark)}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary/65">
          <TabIcon app={app} />
        </span>
        <span className="grid min-w-0 flex-1 text-start">
          <span className="truncate">{title || site || url}</span>
          {site && title && site !== title && (
            <span className="truncate text-xs font-normal text-muted-foreground">{site}</span>
          )}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        data-sortable-action
        className="absolute inset-y-0 end-1 my-auto size-7 text-muted-foreground group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground [@media(hover:hover)]:opacity-0"
        title={t({
          message: "Remove bookmark",
          comment: "Button on a bookmark in the bookmarks popup that removes it",
        })}
        onClick={() => {
          ipc.main.send("bookmarks.removeBookmark", accountId, id);
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

function SortableBookmark({ bookmark, index }: { bookmark: BookmarkState; index: number }) {
  const { ref, isDragging } = useSortable({ id: bookmark.id, index });

  return (
    <Bookmark
      ref={ref}
      bookmark={bookmark}
      className={cn("touch-none", isDragging && "opacity-50")}
    />
  );
}

/** The list is the order bookmarks are saved in. */
function moveBookmark(bookmarks: BookmarkState[], event: DragEndEvent) {
  if (event.canceled) {
    return;
  }

  const bookmarkIds = bookmarks.map((bookmark) => bookmark.id);

  const movedBookmarkIds = move(bookmarkIds, event);

  if (movedBookmarkIds === bookmarkIds) {
    return;
  }

  const movedBookmarkId = event.operation.source?.id;

  if (typeof movedBookmarkId !== "string") {
    return;
  }

  const movedBookmark = bookmarks.find((bookmark) => bookmark.id === movedBookmarkId);

  if (!movedBookmark) {
    return;
  }

  ipc.main.send(
    "bookmarks.moveBookmark",
    movedBookmark.accountId,
    movedBookmarkId,
    movedBookmarkIds.indexOf(movedBookmarkId),
  );
}

function BookmarkList() {
  const { bookmarks } = useBookmarks();
  const { t, i18n } = useLingui();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  if (!bookmarks) {
    return;
  }

  if (bookmarks.length === 0) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <Empty className="min-h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12 rounded-2xl bg-secondary [&_svg]:size-7">
              <BookmarksIcon />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>No bookmarks yet</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Right-click a Workspace tab and choose Bookmark to save its page here.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </ScrollArea>
    );
  }

  const term = normalizeSearchText(query, i18n.locale);
  const words = term.split(/\s+/);
  const matches = term
    ? bookmarks.filter(({ title, url }) => {
        const label = normalizeSearchText(`${title} ${url}`, i18n.locale);
        return words.every((word) => label.includes(word));
      })
    : bookmarks;

  return (
    <>
      <div className="shrink-0 px-3 py-2">
        <InputGroup className="mail-search-field">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={input}
            type="search"
            autoFocus
            aria-label={t`Search bookmarks`}
            placeholder={t`Search bookmarks`}
            aria-controls="bookmark-list"
            value={query}
            className="[&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (query) {
                  setQuery("");
                } else {
                  closePopup();
                }
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                list.current?.querySelector<HTMLButtonElement>("[data-bookmark-open]")?.focus();
              } else if (event.key === "Enter" && term && matches[0]) {
                event.preventDefault();
                openBookmark(matches[0]);
              }
            }}
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                title={t`Clear search`}
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
              >
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
        <div id="bookmark-list" ref={list}>
          {matches.length === 0 && (
            <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t`No matching bookmarks`}
            </p>
          )}
          {term ? (
            matches.map((bookmark) => <Bookmark key={bookmark.id} bookmark={bookmark} />)
          ) : (
            <DragDropProvider
              plugins={sortablePlugins}
              sensors={sortableSensors}
              onDragEnd={(event) => {
                moveBookmark(bookmarks, event);
              }}
            >
              <div className="flex flex-col">
                {bookmarks.map((bookmark, bookmarkIndex) => (
                  <SortableBookmark key={bookmark.id} bookmark={bookmark} index={bookmarkIndex} />
                ))}
              </div>
            </DragDropProvider>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

function BookmarksPopup() {
  return (
    <Popup
      title={<Trans comment="Heading of the bookmarks popup">Bookmarks</Trans>}
      onClose={closePopup}
    >
      <BookmarkList />
    </Popup>
  );
}

renderApp(BookmarksPopup);
