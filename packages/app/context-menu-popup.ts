import type { ContextMenuItem } from "@ggmail/shared/types";
import type { IpcMainEvent, Point, WebContents, BrowserWindow } from "electron";
import { serializeError } from "serialize-error";
import { log } from "./lib/log";
import { Popup } from "./lib/popup";

export type ContextAction = ContextMenuItem & { run: () => void | Promise<void> };

const popup = new Popup();
let choose: ((index: number | null) => void) | undefined;

export function contextMenuContents() {
  return popup.webContents;
}

export function chooseContextAction(event: IpcMainEvent, index: unknown) {
  if (
    event.sender === popup.webContents &&
    event.senderFrame === event.sender.mainFrame &&
    (index === null || (typeof index === "number" && Number.isInteger(index)))
  ) {
    choose?.(index);
  }
}

/**
 * Runs a menu action where a failure has somewhere to go. Several of them wait
 * on a lazily loaded module or on Gmail, and nothing awaits the click that
 * started them.
 */
export async function runContextAction(action: Pick<ContextAction, "id" | "run">) {
  try {
    await action.run();
  } catch (error) {
    log.error("Context menu action failed", { id: action.id, error: serializeError(error) });
  }
}

/** A row that also names its time zone runs to a third line. */
const DATE_ROW_HEIGHT = 68;

const DATE_ROW_HEIGHT_WITH_ZONE = 88;

export function showContextActions(
  parent: BrowserWindow,
  source: WebContents,
  point: Point,
  groups: ContextAction[][],
  width = 280,
) {
  popup.close();
  const sections = groups.filter((group) => group.length);
  const actions = sections.flat();
  const sourceUrl = source.getURL();
  const items = sections.map((group) =>
    group.map(({ id, label, enabled, checked, calendar }) => ({
      id,
      label,
      enabled,
      checked,
      calendar,
    })),
  );
  const dates = actions.length > 0 && actions.every((action) => action.calendar);
  // The page names the zone once, in its heading, when every date shares it.
  const sharedZone = new Set(actions.map((action) => action.calendar?.zone)).size === 1;
  const datesHeight = actions.reduce(
    (height, action) =>
      height + (action.calendar?.zone && !sharedZone ? DATE_ROW_HEIGHT_WITH_ZONE : DATE_ROW_HEIGHT),
    76,
  );
  popup.toggle(parent, {
    page: "context-menu",
    width,
    height: dates ? datesHeight : 14 + 36 * actions.length + 9 * (sections.length - 1),
    anchor: { ...point, align: "start" },
    fitVertically: true,
    searchParams: new URLSearchParams({ items: JSON.stringify(items) }),
  });
  const contents = popup.webContents;
  if (!contents) {
    return;
  }
  const dismiss = () => {
    if (popup.webContents === contents) {
      popup.close();
    }
  };
  const navigating = (details: { isMainFrame: boolean }) => {
    if (details.isMainFrame) {
      dismiss();
    }
  };
  source.on("did-start-navigation", navigating);
  source.once("destroyed", dismiss);
  parent.once("blur", dismiss);
  contents.once("destroyed", () => {
    source.off("did-start-navigation", navigating);
    source.off("destroyed", dismiss);
    parent.off("blur", dismiss);
    if (!popup.webContents) {
      choose = undefined;
    }
  });
  popup.closeOnBlurEnabled = true;
  contents.focus();
  choose = (index) => {
    const action = index === null ? undefined : actions[index];
    dismiss();
    if (source.isDestroyed() || source.getURL() !== sourceUrl) {
      return;
    }
    source.focus();
    if (action && action.enabled !== false) {
      void runContextAction(action);
    }
  };
}
