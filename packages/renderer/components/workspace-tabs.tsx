import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ipc } from "@ggmail/shared/renderer/ipc";
import {
  GMAIL_TAB_ID,
  getTabSection,
  getVisibleVerticalTabs,
  tabSections,
  type TabState,
} from "@ggmail/shared/tabs";
import type { Config } from "@ggmail/shared/types";
import { workspaceApps } from "@ggmail/shared/workspace-apps";
import { cn } from "@ggmail/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import { AppWindowIcon, MergeIcon, XIcon } from "lucide-react";
import { sortablePlugins, sortableSensors } from "@/lib/dnd";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";
import { TabIcon } from "./tab-icon";
import { TitlebarIconButton } from "./titlebar";

function WorkspaceTab({
  tab,
  accountId,
  index,
  active,
  showAppLinksBadge,
}: {
  tab: TabState;
  accountId: string;
  index: number;
  active: boolean;
  showAppLinksBadge: boolean;
}) {
  const { t } = useLingui();
  const { ref } = useSortable({ id: tab.id, index });
  const tabTitle = tab.title;
  const appName = tab.opensLinksForApp && workspaceApps[tab.opensLinksForApp].label;
  const tooltip = appName
    ? t({
        message: `${tabTitle} — opens ${appName} links`,
        comment:
          "Tooltip of the tab every link to a Google Workspace app opens in. tabTitle is the page's title; appName is the app's English name, such as Calendar",
      })
    : tabTitle;
  const close = () => ipc.main.send("tabs.closeTab", accountId, tab.id);

  return (
    <div ref={ref} className="group relative flex touch-none">
      <TitlebarIconButton
        title={tooltip}
        tabIndex={0}
        aria-current={active ? "page" : undefined}
        className={cn("size-7 aria-current:bg-selected", tab.dormant && "opacity-50")}
        onClick={(event) => {
          const behavior = getModifierOpenBehavior(event);
          if (behavior && tab.app && !workspaceApps[tab.app].singleInstance) {
            ipc.main.send("workspaceApps.openApp", tab.app, behavior);
          } else {
            ipc.main.send("tabs.selectTab", accountId, tab.id);
          }
        }}
        onAuxClick={(event) => {
          if (event.button === 1 && !tab.pinned) {
            close();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          ipc.main.send("tabs.showTabContextMenu", accountId, tab.id, {
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <TabIcon app={tab.app} />
        {tab.windowed && (
          <AppWindowIcon
            aria-hidden="true"
            className="absolute right-0 bottom-0 size-2.5 rounded-sm bg-chrome"
          />
        )}
        {showAppLinksBadge && tab.opensLinksForApp && (
          <MergeIcon
            aria-hidden="true"
            className="absolute bottom-0 left-0 size-2.5 rounded-sm bg-chrome"
          />
        )}
      </TitlebarIconButton>
      {!tab.pinned && (
        <button
          type="button"
          data-sortable-action
          title={t({
            message: "Close",
            context: "tab",
            comment: "Button on a tab in the vertical tabs strip that closes the tab",
          })}
          className="absolute top-0 right-0 grid size-3.5 place-items-center rounded-full bg-secondary opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={close}
        >
          <XIcon aria-hidden="true" className="size-2.5" />
        </button>
      )}
    </div>
  );
}

export function WorkspaceTabs({
  accountId,
  tabs,
  config,
  showActive,
}: {
  accountId: string;
  tabs: TabState[];
  config: Config;
  showActive: boolean;
}) {
  const { t } = useLingui();
  const extras = getVisibleVerticalTabs(tabs, {
    workspaceAppsMode: config["workspaceApps.mode"],
    showWindows: config["verticalTabs.showWindows"],
  }).filter((tab) => tab.id !== GMAIL_TAB_ID && !tab.sidebarApp);
  if (!extras.length) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={t`Tabs`}
      className="flex max-w-32 shrink-0 scrollbar-none items-center gap-0.5 overflow-x-auto border-e pe-1 draggable-none"
    >
      {tabSections.map((section) => {
        const sectionTabs = extras.filter((tab) => getTabSection(tab) === section);
        if (!sectionTabs.length) {
          return null;
        }
        const ids = sectionTabs.map((tab) => tab.id);
        return (
          <DragDropProvider
            key={section}
            plugins={sortablePlugins}
            sensors={sortableSensors}
            onDragEnd={(event) => {
              const moved = event.operation.source?.id;
              if (event.canceled || typeof moved !== "string") {
                return;
              }
              const target = ids[move(ids, event).indexOf(moved)];
              if (!target || moved === target) {
                return;
              }
              // The persisted section also includes tabs represented by the fixed sidebar.
              const index = tabs
                .filter((tab) => getTabSection(tab) === section)
                .findIndex((tab) => tab.id === target);
              ipc.main.send("tabs.moveTab", accountId, moved, index);
            }}
          >
            {sectionTabs.map((tab, index) => (
              <WorkspaceTab
                key={tab.id}
                accountId={accountId}
                index={index}
                tab={tab}
                active={showActive && tab.active}
                showAppLinksBadge={config["verticalTabs.showAppLinksBadge"]}
              />
            ))}
          </DragDropProvider>
        );
      })}
    </div>
  );
}
