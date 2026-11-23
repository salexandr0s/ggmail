import type { ContextMenuItem } from "@ggmail/shared/types";
import type { IpcMainEvent, Point, WebContents, BrowserWindow } from "electron";
import { Popup } from "./lib/popup";

export type ContextAction = ContextMenuItem & { run: () => void };

const popup = new Popup();
let choose: ((index: number | null) => void) | undefined;

export function contextMenuContents() {
  return popup.webContents;
}

export function chooseContextAction(event: IpcMainEvent, index: number | null) {
  if (event.sender === popup.webContents && event.senderFrame === event.sender.mainFrame) {
    choose?.(index);
  }
}

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
  popup.toggle(parent, {
    page: "context-menu",
    width,
    height: dates ? 76 + 68 * actions.length : 14 + 36 * actions.length + 9 * (sections.length - 1),
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
      action.run();
    }
  };
}
