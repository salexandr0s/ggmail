import { ipc } from "@ggmail/shared/renderer/ipc";
import type { MenuModifiers } from "@ggmail/shared/types";
import {
  type LauncherWorkspaceApp,
  launcherWorkspaceApps,
  resolveWorkspaceAppsLauncherDisplay,
  type WorkspaceAppsLauncherDisplay,
} from "@ggmail/shared/workspace-apps";
import { useLingui } from "@lingui/react/macro";
import { type MouseEvent, useState } from "react";
import { WorkspaceAppsIcon } from "@/components/mail-icons";
import { TitlebarDropdownMenu, TitlebarIconButton } from "@/components/titlebar";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";
import { useCloseOnWindowBlur } from "@/lib/hooks";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";

function useLauncherApps() {
  const [isOpen, setIsOpen] = useState(false);

  useCloseOnWindowBlur(isOpen, () => {
    setIsOpen(false);
  });

  const getLauncherAppProps = (app: LauncherWorkspaceApp) => ({
    title: launcherWorkspaceApps[app],
    onClick: (event: MenuModifiers) => {
      ipc.main.send("workspaceApps.openApp", app, getModifierOpenBehavior(event));

      setIsOpen(false);
    },
    onAuxClick: (event: MouseEvent) => {
      if (event.button === 1) {
        ipc.main.send("workspaceApps.openApp", app, "backgroundTab");

        setIsOpen(false);
      }
    },
  });

  return { isOpen, setIsOpen, getLauncherAppProps };
}

export function WorkspaceAppsLauncher({
  launcherApps,
  display,
  disabled,
}: {
  launcherApps: LauncherWorkspaceApp[];
  display: WorkspaceAppsLauncherDisplay;
  disabled?: boolean;
}) {
  const { t } = useLingui();

  const { isOpen, setIsOpen, getLauncherAppProps } = useLauncherApps();

  if (resolveWorkspaceAppsLauncherDisplay(display, launcherApps.length) === "expanded") {
    return launcherApps.map((app) => (
      <TitlebarIconButton key={app} disabled={disabled} {...getLauncherAppProps(app)}>
        <WorkspaceAppIcon app={app} className="size-4" />
      </TitlebarIconButton>
    ));
  }

  return (
    <TitlebarDropdownMenu
      title={t({
        message: "Open workspace app",
        comment: "Titlebar button that opens the launcher of Google Workspace apps",
      })}
      icon={<WorkspaceAppsIcon />}
      side="left"
      disabled={disabled}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      items={launcherApps.map((app) => {
        const { title, onClick, onAuxClick } = getLauncherAppProps(app);
        return {
          key: app,
          label: title,
          icon: <WorkspaceAppIcon app={app} className="size-4" />,
          onChoose: onClick,
          onAuxClick,
        };
      })}
    />
  );
}
