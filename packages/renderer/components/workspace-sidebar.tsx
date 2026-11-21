import { ipc } from "@ggmail/shared/renderer/ipc";
import { GMAIL_TAB_ID, showsGmailUnreadCount, type TabState } from "@ggmail/shared/tabs";
import { useLingui } from "@lingui/react/macro";
import { CircleAlertIcon } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useSelectedAccountTabs } from "@/lib/hooks";
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
          ipc.main.send("tabs.showTabContextMenu", selectedAccount.config.id, tab.id);
        }
      : undefined;

  return (
    <nav
      aria-label={t`Workspace apps`}
      className="workspace-sidebar"
      onContextMenu={(event) => {
        if (!event.defaultPrevented && selectedAccount) {
          event.preventDefault();
          ipc.main.send("tabs.showVerticalTabsContextMenu", selectedAccount.config.id);
        }
      }}
    >
      <div className="workspace-sidebar-apps">
        <SidebarButton
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
        <SidebarButton
          title={t`Calendar`}
          aria-current={active?.sidebarApp === "calendar" ? "page" : undefined}
          onClick={() => ipc.main.send("sidebar.openApp", "calendar")}
          onContextMenu={contextMenu(tabs.find((tab) => tab.sidebarApp === "calendar"))}
        >
          <WorkspaceAppIcon app="calendar" aria-hidden="true" />
        </SidebarButton>
        <SidebarButton
          title={t({ message: "Bookmarks", comment: "Heading of the bookmarks popup" })}
          aria-expanded={bookmarksOpen}
          onClick={(event) => {
            ipc.main.send("bookmarks.togglePopup");
            if (event.detail === 0) {
              ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true);
            }
          }}
          onMouseEnter={() => ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", false)}
          onMouseLeave={() => ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true)}
        >
          <BookmarksIcon />
        </SidebarButton>
        <SidebarButton
          title={t`Google Tasks`}
          aria-current={active?.sidebarApp === "tasks" ? "page" : undefined}
          onClick={() => ipc.main.send("sidebar.openApp", "tasks")}
          onContextMenu={contextMenu(tabs.find((tab) => tab.sidebarApp === "tasks"))}
        >
          <WorkspaceAppIcon app="tasks" aria-hidden="true" />
        </SidebarButton>
      </div>
      <div className="workspace-sidebar-footer">
        <SidebarButton title={t`Settings`} onClick={() => ipc.main.send("sidebar.openSettings")}>
          <WorkspaceSettingsIcon />
        </SidebarButton>
      </div>
    </nav>
  );
}
