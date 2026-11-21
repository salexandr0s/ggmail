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
import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { cn } from "@ggmail/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { XIcon } from "lucide-react";
import type { Ref } from "react";
import { BookmarksIcon } from "@/components/bookmarks-icon";
import { Popup } from "@/components/popup";
import { TabIcon } from "@/components/tab-icon";
import { sortablePlugins, sortableSensors } from "@/lib/dnd";
import { renderApp } from "@/lib/react";
import { useBookmarks } from "@/lib/react-query";

function closePopup() {
  ipc.main.send("bookmarks.closePopup");
}

function Bookmark({
  ref,
  bookmark: { accountId, id, app, title },
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  bookmark: BookmarkState;
  className?: string;
}) {
  const { t } = useLingui();

  return (
    <div ref={ref} className={cn("group relative", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="h-10 w-full justify-start gap-2.5 rounded-xl ps-2 pe-9 text-sm font-normal"
        title={title}
        onClick={() => {
          ipc.main.send("bookmarks.openBookmark", accountId, id);

          closePopup();
        }}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary/65">
          <TabIcon app={app} />
        </span>
        <span className="min-w-0 flex-1 truncate text-start">{title}</span>
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

  if (!bookmarks) {
    return;
  }

  if (bookmarks.length === 0) {
    return (
      <Empty>
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
    );
  }

  return (
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
  );
}

function BookmarksPopup() {
  return (
    <Popup
      title={<Trans comment="Heading of the bookmarks popup">Bookmarks</Trans>}
      onClose={closePopup}
    >
      <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2">
        <div className="flex h-full flex-col">
          <BookmarkList />
        </div>
      </ScrollArea>
    </Popup>
  );
}

renderApp(BookmarksPopup);
