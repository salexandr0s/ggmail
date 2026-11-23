import { ipc } from "@ggmail/shared/renderer/ipc";
import { GMAIL_TAB_ID, showsGmailUnreadCount, type TabState } from "@ggmail/shared/tabs";
import {
  type SidebarShortcut,
  visibleSidebarShortcuts,
  workspaceApps,
} from "@ggmail/shared/workspace-apps";
import { useLingui } from "@lingui/react/macro";
import { CircleAlertIcon } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useSelectedAccountTabs } from "@/lib/hooks";
import { moveToolbarFocus } from "@/lib/move-toolbar-focus";
import { useConfig } from "@/lib/react-query";
import { BookmarksIcon } from "./bookmarks-icon";
import { WorkspaceSettingsIcon } from "./mail-icons";
import { WorkspaceAppIcon } from "./workspace-app-icon";
import "./workspace-sidebar.css";

function SidebarButton({ title, ...props }: ComponentProps<"button"> & { title: string }) {
  return (
    <button
      type="button"
      className="workspace-sidebar-button"
      title={title}
      aria-label={title}
      {...props}
    />
  );
}

export function WorkspaceSidebar() {
  const { t } = useLingui();
  const [location] = useLocation();
  const { selectedAccount, tabs } = useSelectedAccountTabs();
  const { config } = useConfig();
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  useEffect(
    () => ipc.renderer.on("bookmarks.popupOpen", (_event, open) => setBookmarksOpen(open)),
    [],
  );

  const shortcuts = visibleSidebarShortcuts(config?.["sidebar.shortcuts"]);
  const labels = { calendar: t`Calendar`, tasks: t`Google Tasks`, meet: t`Google Meet` };
  const gmail = tabs.find((tab) => tab.id === GMAIL_TAB_ID);
  const active = location === "/" ? tabs.find((tab) => tab.active) : undefined;
  const isMailActive = active?.id === GMAIL_TAB_ID;
  const unread =
    config?.["accounts.unreadBadge"] &&
    selectedAccount?.config.gmail.unreadBadge &&
    showsGmailUnreadCount(config["verticalTabs.gmailUnreadBadge"], isMailActive)
      ? selectedAccount.gmail.unreadCount
      : null;
  const attention = selectedAccount?.gmail.attentionRequired;
  const contextMenu = (tab?: TabState): ComponentProps<"button">["onContextMenu"] =>
    tab && selectedAccount
      ? (event) => {
          event.preventDefault();
          ipc.main.send("tabs.showTabContextMenu", selectedAccount.config.id, tab.id, {
            x: event.clientX,
            y: event.clientY,
          });
        }
      : undefined;

  const dockedBookmarks = shortcuts.at(-1) === "bookmarks";
  const appShortcuts = dockedBookmarks ? shortcuts.slice(0, -1) : shortcuts;
  const renderShortcut = (app: SidebarShortcut) => {
    if (app === "gmail") {
      return (
        <SidebarButton
          key="gmail"
          title={t`Mail`}
          aria-current={isMailActive ? "page" : undefined}
          aria-description={
            attention
              ? t`Sign in`
              : unread
                ? `${t`Unread messages`} (${unread.toLocaleString()})`
                : undefined
          }
          onClick={() => ipc.main.send("titleBar.openMailView", "gmail")}
          onContextMenu={contextMenu(gmail)}
        >
          <WorkspaceAppIcon app="gmail" aria-hidden="true" />
          {attention ? (
            <span aria-hidden="true" className="workspace-sidebar-alert">
              <CircleAlertIcon />
            </span>
          ) : unread ? (
            <span aria-hidden="true" className="workspace-sidebar-badge">
              {unread > 99 ? "99+" : unread.toLocaleString()}
            </span>
          ) : null}
        </SidebarButton>
      );
    }
    if (app === "bookmarks") {
      return (
        <SidebarButton
          key="bookmarks"
          title={t({ message: "Bookmarks", comment: "Heading of the bookmarks popup" })}
          aria-expanded={bookmarksOpen}
          onClick={(event) => {
            ipc.main.send(
              "bookmarks.togglePopup",
              dockedBookmarks
                ? undefined
                : Math.round(event.currentTarget.getBoundingClientRect().top),
            );
            if (event.detail === 0) {
              ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true);
            }
          }}
          onMouseEnter={() => ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", false)}
          onMouseLeave={() => ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true)}
        >
          <BookmarksIcon />
        </SidebarButton>
      );
    }
    return (
      <SidebarButton
        key={app}
        data-shortcut={app}
        title={
          app === "calendar" || app === "tasks" || app === "meet"
            ? labels[app]
            : workspaceApps[app].label
        }
        aria-current={active?.sidebarApp === app ? "page" : undefined}
        onClick={() => ipc.main.send("sidebar.openApp", app)}
        onContextMenu={contextMenu(tabs.find((tab) => tab.sidebarApp === app))}
      >
        <WorkspaceAppIcon app={app} aria-hidden="true" />
      </SidebarButton>
    );
  };
  return (
    <nav
      aria-label={t`Workspace apps`}
      className="workspace-sidebar"
      onKeyDown={(event) => moveToolbarFocus(event, true)}
      onContextMenu={(event) => {
        if (!event.defaultPrevented && selectedAccount) {
          event.preventDefault();
          const shortcut = (event.target as Element).closest<HTMLElement>("[data-shortcut]")
            ?.dataset.shortcut as SidebarShortcut | "settings" | undefined;
          ipc.main.send(
            "tabs.showVerticalTabsContextMenu",
            selectedAccount.config.id,
            {
              x: event.clientX,
              y: event.clientY,
            },
            shortcut,
          );
        }
      }}
    >
      <div className="workspace-sidebar-apps">{appShortcuts.map(renderShortcut)}</div>
      <div className="workspace-sidebar-footer">
        {dockedBookmarks && renderShortcut("bookmarks")}
        {shortcuts.length > 0 && <div className="workspace-sidebar-divider" aria-hidden="true" />}
        <SidebarButton
          data-shortcut="settings"
          title={t`Settings`}
          onClick={() => ipc.main.send("sidebar.openSettings")}
        >
          <WorkspaceSettingsIcon />
        </SidebarButton>
      </div>
    </nav>
  );
}
