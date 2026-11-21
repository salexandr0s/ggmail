import { msg } from "@lingui/core/macro";
import type { AccountConfig } from "./schemas";
import type { SupportedWorkspaceApp, WorkspaceAppsMode } from "./workspace-apps";

export const GMAIL_TAB_ID = "gmail";

// lingui-set comment="Option of the Show Gmail unread badge setting: when the Gmail tab shows its unread count"
export const verticalTabsGmailUnreadBadges = {
  always: msg`Always`,
  whenInactive: msg`When another tab is active`,
  never: msg`Never`,
} as const;
// lingui-reset

export type VerticalTabsGmailUnreadBadge = keyof typeof verticalTabsGmailUnreadBadges;

export function showsGmailUnreadCount(
  mode: VerticalTabsGmailUnreadBadge,
  gmailTabActive: boolean,
): boolean {
  if (mode === "never") {
    return false;
  }

  return !(mode === "whenInactive" && gmailTabActive);
}

export type SidebarWorkspaceApp = "calendar" | "tasks";

export type TabState = {
  sidebarApp?: SidebarWorkspaceApp;
  id: string;
  app: SupportedWorkspaceApp | undefined;
  title: string;
  pinned: boolean;
  dormant: boolean;
  windowed: boolean;
  /** Whether the URL the tab is on is among the account's bookmarks. */
  bookmarked: boolean;
  /**
   * The app whose links all open in this tab, which the tab keeps holding even
   * after browsing on to another app — so it is not always `app`.
   */
  opensLinksForApp: SupportedWorkspaceApp | null;
  loadOnLaunch: boolean;
  loading: boolean;
  navigationHistory: { canGoBack: boolean; canGoForward: boolean };
  active: boolean;
};

export type AccountTabsState = {
  accountId: AccountConfig["id"];
  tabs: TabState[];
};

export const tabSections = ["pinned", "normal"] as const;

export type TabSection = (typeof tabSections)[number];

export function getTabSection(tab: Pick<TabState, "id" | "pinned">): TabSection {
  if (tab.id === GMAIL_TAB_ID || tab.pinned) {
    return "pinned";
  }

  return "normal";
}

/**
 * `windows` mode leaves the strip with only what lives in the main window:
 * windowed apps have a window of their own, and a pinned entry that has never
 * been opened would open as one. An unloaded unpinned tab stays listed, because
 * it is a tab the user opened and dropping it from the strip would read as
 * closing it. In `tabs` mode windowed apps are listed alongside the tabs unless
 * the user turns that off. Everything filtered out here stays saved either way.
 */
export function getVisibleVerticalTabs<
  VerticalTab extends Pick<TabState, "dormant" | "pinned" | "windowed">,
>(
  tabs: VerticalTab[],
  {
    workspaceAppsMode,
    showWindows,
  }: { workspaceAppsMode: WorkspaceAppsMode; showWindows: boolean },
) {
  if (workspaceAppsMode === "windows") {
    return tabs.filter((tab) => !(tab.dormant && tab.pinned) && !tab.windowed);
  }

  return showWindows ? tabs : tabs.filter((tab) => !tab.windowed);
}
