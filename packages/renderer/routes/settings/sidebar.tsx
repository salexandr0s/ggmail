import {
  defaultSidebarShortcuts,
  sidebarShortcuts,
  visibleSidebarShortcuts,
  workspaceApps,
  type SidebarShortcut,
} from "@ggmail/shared/workspace-apps";
import { Button } from "@ggmail/ui/components/button";
import { FieldLegend, FieldSet } from "@ggmail/ui/components/field";
import { Trans, useLingui } from "@lingui/react/macro";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppPicker, ShortcutIcon } from "@/components/app-picker";
import { WorkspaceSettingsIcon } from "@/components/mail-icons";
import {
  Settings,
  SettingsContent,
  SettingsDescription,
  SettingsPanel,
  SettingsHeader,
  SettingsTitle,
} from "@/components/settings";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function SidebarSettings() {
  const { t } = useLingui();
  const { config } = useConfig();
  const mutation = useConfigMutation();
  const stored = config?.["sidebar.shortcuts"];
  const [draft, setDraft] = useState<SidebarShortcut[] | null>(null);
  useEffect(() => {
    if (
      draft &&
      stored &&
      draft.length === stored.length &&
      draft.every((item, index) => item === stored[index])
    ) {
      setDraft(null);
    }
  }, [draft, stored]);

  if (!config) {
    return null;
  }

  const selected = draft ?? visibleSidebarShortcuts(stored);
  const save = (next: SidebarShortcut[]) => {
    setDraft(next);
    mutation.mutate(
      { "sidebar.shortcuts": next },
      {
        onError: (error) => {
          setDraft(null);
          toast.error(error.message);
        },
      },
    );
  };
  const isDefault =
    selected.length === defaultSidebarShortcuts.length &&
    defaultSidebarShortcuts.every((shortcut, index) => selected[index] === shortcut);
  const label = (shortcut: SidebarShortcut) =>
    shortcut === "bookmarks"
      ? t({ message: "Bookmarks", comment: "Heading of the bookmarks popup" })
      : workspaceApps[shortcut].label;

  const dockedBookmarks = selected.at(-1) === "bookmarks";
  const appShortcuts = dockedBookmarks ? selected.slice(0, -1) : selected;

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.sidebar)}</SettingsTitle>
        <Button
          variant="ghost"
          size="sm"
          disabled={isDefault}
          onClick={() => save([...defaultSidebarShortcuts])}
        >
          <RotateCcwIcon />
          <Trans>Restore defaults</Trans>
        </Button>
      </SettingsHeader>
      <SettingsContent>
        <FieldSet>
          <FieldLegend>
            <Trans>Preview</Trans>
          </FieldLegend>
          <div className="sidebar-preview">
            <div className="sidebar-preview-apps">
              {appShortcuts.map((shortcut) => (
                <span key={shortcut} title={label(shortcut)}>
                  <ShortcutIcon shortcut={shortcut} />
                </span>
              ))}
            </div>
            <div className="sidebar-preview-footer">
              {dockedBookmarks && (
                <span title={label("bookmarks")}>
                  <ShortcutIcon shortcut="bookmarks" />
                </span>
              )}
              {selected.length > 0 && <hr aria-hidden="true" />}
              <span title={t`Settings`}>
                <WorkspaceSettingsIcon />
              </span>
            </div>
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend>
            <Trans>Sidebar shortcuts</Trans>
          </FieldLegend>
          <SettingsPanel>
            <div className="flex flex-col gap-4 py-4">
              <SettingsDescription>
                <Trans>
                  Drag shortcuts into the order you want. Settings stays pinned at the bottom for
                  all accounts.
                </Trans>
              </SettingsDescription>
              <AppPicker
                destination="sidebar"
                choices={sidebarShortcuts}
                selected={selected}
                labelFor={label}
                onChange={save}
                insertAt={dockedBookmarks ? selected.length - 1 : selected.length}
              />
            </div>
          </SettingsPanel>
        </FieldSet>
      </SettingsContent>
    </Settings>
  );
}
