import { ipc } from "@ggmail/shared/renderer/ipc";
import type { ContextMenuItem } from "@ggmail/shared/types";
import { useLingui } from "@lingui/react/macro";
import {
  Bookmark,
  Pin,
  Plus,
  PanelsTopLeft,
  AppWindow,
  ArrowUpRight,
  CalendarPlus,
  CalendarDays,
  ChevronRight,
  Globe2,
  AlarmClock,
  Check,
  Square,
  CircleCheck,
  Clipboard,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Image,
  Inbox,
  Link,
  ListRestart,
  Mail,
  MoreHorizontal,
  Quote,
  RotateCw,
  Scissors,
  Search,
  TextSelect,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useLayoutEffect, useRef } from "react";
import { renderApp } from "./lib/react";
import "./context-menu.css";

const groups: ContextMenuItem[][] = JSON.parse(
  new URLSearchParams(location.search).get("items") ?? "[]",
);
const icons: Record<string, LucideIcon> = {
  calendar: CalendarPlus,
  followUp: AlarmClock,
  task: CircleCheck,
  quote: Quote,
  copy: Copy,
  cut: Scissors,
  paste: Clipboard,
  pasteAndMatchStyle: ClipboardPaste,
  selectAll: TextSelect,
  copyEmailAddress: Mail,
  copyLink: Link,
  messageLink: Link,
  copyImage: Copy,
  copyImageAddress: Link,
  saveImageAs: Image,
  searchWithGoogle: Search,
  pageUrl: Link,
  browser: ExternalLink,
  system: MoreHorizontal,
  open: ArrowUpRight,
  reload: RotateCw,
  reopen: ListRestart,
  inbox: Inbox,
  close: X,
  bookmark: Bookmark,
  pin: Pin,
  new: Plus,
  tab: PanelsTopLeft,
  window: AppWindow,
};
const choose = (index: number | null) => ipc.main.send("contextMenu.choose", index);

function ContextMenu() {
  const { t } = useLingui();
  const options = groups[0];
  const dateMenu =
    groups.length === 1 && !!options?.length && options.every((item) => item.calendar);
  const firstZone = options?.[0]?.calendar?.zone;
  const commonZone =
    dateMenu && options.every((item) => item.calendar?.zone === firstZone) ? firstZone : undefined;
  const menu = useRef<HTMLDivElement>(null);
  const typed = useRef({ prefix: "", time: 0 });
  useLayoutEffect(() => {
    menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        choose(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  let index = 0;
  return (
    <div
      ref={menu}
      className={dateMenu ? "context-surface calendar-choices" : "context-surface"}
      role="menu"
      tabIndex={-1}
      aria-label={dateMenu ? t`Choose a date` : t`Actions`}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          choose(null);
          return;
        }
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        );
        const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const last = buttons.length - 1;
        let next: number;
        switch (event.key) {
          case "Home":
            next = 0;
            break;
          case "End":
            next = last;
            break;
          case "ArrowDown":
            next = active === last ? 0 : active + 1;
            break;
          case "ArrowUp":
            next = active <= 0 ? last : active - 1;
            break;
          default: {
            if (
              event.key.length !== 1 ||
              !event.key.trim() ||
              event.metaKey ||
              event.altKey ||
              event.ctrlKey
            ) {
              return;
            }
            const now = performance.now();
            const prefix =
              (now - typed.current.time < 600 ? typed.current.prefix : "") +
              event.key.toLocaleLowerCase();
            typed.current = { prefix, time: now };
            const ordered = [...buttons.slice(active + 1), ...buttons.slice(0, active + 1)];
            ordered
              .find((button) =>
                (button.getAttribute("aria-label") ?? button.textContent)
                  .toLocaleLowerCase()
                  .startsWith(prefix),
              )
              ?.focus();
            return;
          }
        }
        event.preventDefault();
        buttons[next]?.focus();
      }}
    >
      {dateMenu && (
        <div className="calendar-choice-heading" aria-hidden="true">
          <span className="calendar-heading-icon">
            <CalendarDays size={20} />
          </span>
          <div>
            <strong>{t`Choose a date`}</strong>
            {commonZone && (
              <span className="calendar-choice-zone">
                <Globe2 size={13} />
                {commonZone}
              </span>
            )}
          </div>
        </div>
      )}
      {groups.map((group, section) => (
        <Fragment key={section}>
          {section > 0 && <hr role="separator" />}
          {group.map((item) => {
            const value = index++;
            const Icon =
              item.checked === undefined ? icons[item.id ?? ""] : item.checked ? Check : Square;
            return (
              <button
                key={value}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={item.checked}
                disabled={item.enabled === false}
                tabIndex={-1}
                title={item.label}
                aria-label={item.label}
                onClick={() => choose(value)}
              >
                {item.calendar ? (
                  <>
                    <span className="calendar-choice-info">
                      <strong>{item.calendar.date}</strong>
                      <span>{item.calendar.time ?? t`All day`}</span>
                      {item.calendar.zone && !commonZone && (
                        <span className="calendar-choice-zone">
                          <Globe2 size={13} aria-hidden />
                          {item.calendar.zone}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={17} className="calendar-choice-arrow" aria-hidden />
                  </>
                ) : (
                  <>
                    <span className="context-icon">
                      {Icon && <Icon size={19} strokeWidth={1.8} />}
                    </span>
                    <span className="context-label">{item.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

renderApp(ContextMenu);
