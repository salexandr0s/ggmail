import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { SidebarShortcut } from "@ggmail/shared/workspace-apps";
import { useLingui } from "@lingui/react/macro";
import { GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { BookmarksIcon } from "./bookmarks-icon";
import { WorkspaceAppIcon } from "./workspace-app-icon";
import "./app-picker.css";

export function ShortcutIcon({ shortcut }: { shortcut: SidebarShortcut }) {
  return shortcut === "bookmarks" ? <BookmarksIcon /> : <WorkspaceAppIcon app={shortcut} />;
}

function SortableChoice({
  shortcut,
  label,
  index,
  removeLabel,
  onRemove,
}: {
  shortcut: SidebarShortcut;
  label: string;
  index: number;
  removeLabel: string;
  onRemove: (keyboard: boolean) => void;
}) {
  const { t } = useLingui();
  const { ref, handleRef, isDragging } = useSortable({ id: shortcut, index });
  return (
    <div ref={ref} className="app-picker-chip" style={{ opacity: isDragging ? 0.55 : undefined }}>
      <button
        type="button"
        ref={handleRef}
        className="app-picker-handle"
        aria-label={t`Drag ${label} to reorder`}
      >
        <GripVerticalIcon />
        <ShortcutIcon shortcut={shortcut} />
        <span>{label}</span>
      </button>
      <button
        type="button"
        className="app-picker-remove"
        data-app-choice={shortcut}
        aria-label={removeLabel}
        onClick={(event) => onRemove(event.detail === 0)}
      >
        <XIcon />
      </button>
    </div>
  );
}

export function AppPicker<T extends SidebarShortcut>({
  destination,
  choices,
  selected,
  labelFor,
  onChange,
  insertAt = selected.length,
}: {
  destination: "launcher" | "sidebar";
  choices: readonly T[];
  selected: T[];
  labelFor: (shortcut: T) => string;
  onChange: (next: T[]) => void;
  insertAt?: number;
}) {
  const { t } = useLingui();
  const available = choices.filter((item) => !selected.includes(item));
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef<T | null>(null);
  useLayoutEffect(() => {
    if (!focusNext.current) {
      return;
    }
    const target = Array.from(
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- CSS selector for keyboard focus.
      root.current?.querySelectorAll<HTMLButtonElement>("button[data-app-choice]") ?? [],
    ).find((button) => button.dataset.appChoice === focusNext.current);
    target?.focus();
    focusNext.current = null;
  }, [selected]);

  const change = (item: T, keyboard: boolean, isAdding: boolean) => {
    const group = isAdding ? available : selected;
    const index = group.indexOf(item);
    if (keyboard) {
      focusNext.current = group[index + 1] ?? group[index - 1] ?? item;
    }
    if (isAdding) {
      const next = [...selected];
      next.splice(insertAt, 0, item);
      onChange(next);
    } else {
      onChange(selected.filter((value) => value !== item));
    }
  };

  return (
    <div ref={root} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground">
          {destination === "sidebar"
            ? t`In sidebar`
            : t({
                message: "In launcher",
                comment: "Heading of the Workspace apps already in the launcher",
              })}
        </div>
        {selected.length ? (
          <DragDropProvider
            onDragEnd={(event) => {
              if (!event.canceled) {
                onChange(move(selected, event));
              }
            }}
          >
            <div className="app-picker-grid">
              {selected.map((item, index) => {
                const label = labelFor(item);
                return (
                  <SortableChoice
                    key={item}
                    shortcut={item}
                    index={index}
                    label={label}
                    removeLabel={
                      destination === "sidebar"
                        ? t`Remove ${label} from sidebar`
                        : t({
                            message: `Remove ${label} from launcher`,
                            comment:
                              "Screen reader label of the button that takes a Workspace app out of the launcher; label is the app's name",
                          })
                    }
                    onRemove={(keyboard) => change(item, keyboard, false)}
                  />
                );
              })}
            </div>
          </DragDropProvider>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            {destination === "sidebar"
              ? t`Only Settings is pinned. Add a shortcut from Available.`
              : t({
                  message: "No apps in the launcher yet. Add one from Available.",
                  comment:
                    "Available quotes the heading of the apps that can be added, so it matches that heading's wording",
                })}
          </p>
        )}
      </div>
      {available.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t({
              message: "Available",
              comment: "Heading of the Workspace apps that can be added to the launcher",
            })}
          </div>
          <div className="app-picker-grid">
            {available.map((item) => {
              const label = labelFor(item);
              return (
                <button
                  key={item}
                  type="button"
                  className="app-picker-choice"
                  data-app-choice={item}
                  aria-label={
                    destination === "sidebar"
                      ? t`Add ${label} to sidebar`
                      : t({
                          message: `Add ${label} to launcher`,
                          comment:
                            "Screen reader label of the button that puts a Workspace app in the launcher; label is the app's name",
                        })
                  }
                  onClick={(event) => change(item, event.detail === 0, true)}
                >
                  <ShortcutIcon shortcut={item} />
                  <span>{label}</span>
                  <PlusIcon />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
