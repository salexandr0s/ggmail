import { Button } from "@ggmail/ui/components/button";
import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
  Bell,
  Bookmark,
  Download,
  FileClock,
  Fingerprint,
  RefreshCw,
  Inbox,
  Info,
  Languages,
  Mail,
  PanelsTopLeft,
  Puzzle,
  Settings2,
  ShieldBan,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { type RouteProps, useLocation } from "wouter";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";
import { AboutSettings } from "@/routes/settings/about";
import { AccountsSettings } from "@/routes/settings/accounts";
import { AdvancedSettings } from "@/routes/settings/advanced";
import { AISettings } from "@/routes/settings/ai";
import { AppearanceSettings } from "@/routes/settings/appearance";
import { BlockerSettings } from "@/routes/settings/blocker";
import { DownloadsSettings } from "@/routes/settings/downloads";
import { ExtensionsSettings } from "@/routes/settings/extensions";
import { GeneralSettings } from "@/routes/settings/general";
import { GmailSettings } from "@/routes/settings/gmail";
import { LanguagesSettings } from "@/routes/settings/languages";
import { NotificationsSettings } from "@/routes/settings/notifications";
import { PhishingProtectionSettings } from "@/routes/settings/phishing-protection";
import { SavedSearchesSettings } from "@/routes/settings/saved-searches";
import { UnifiedInboxSettings } from "@/routes/settings/unified-inbox";
import { UpdatesSettings } from "@/routes/settings/updates";
import { VerificationCodesSettings } from "@/routes/settings/verification-codes";
import { VersionHistorySettings } from "@/routes/settings/version-history";
import { WorkspaceAppsSettings } from "@/routes/settings/workspace-apps";

type SettingsPage = {
  label: MessageDescriptor | string;
  path: string;
  icon: LucideIcon;
  component: RouteProps["component"];
  hidden?: boolean;
};

const groups: { label: MessageDescriptor; pages: SettingsPage[] }[] = [
  {
    label: msg({ message: "Application", comment: "Group of pages in the Settings sidebar" }),
    pages: [
      {
        label: settingsPageLabels.general,
        path: "/settings/general",
        icon: Settings2,
        component: GeneralSettings,
      },
      {
        label: settingsPageLabels.accounts,
        path: "/settings/accounts",
        icon: UsersRound,
        component: AccountsSettings,
      },
      {
        label: settingsPageLabels.appearance,
        path: "/settings/appearance",
        icon: SunMoon,
        component: AppearanceSettings,
      },
      {
        label: settingsPageLabels.notifications,
        path: "/settings/notifications",
        icon: Bell,
        component: NotificationsSettings,
      },
      {
        label: settingsPageLabels.downloads,
        path: "/settings/downloads",
        icon: Download,
        component: DownloadsSettings,
      },
      {
        label: settingsPageLabels.languages,
        path: "/settings/languages",
        icon: Languages,
        component: LanguagesSettings,
        hidden: platform.isMacOS,
      },
    ],
  },
  {
    label: msg({ message: "Mail", comment: "Group of pages in the Settings sidebar" }),
    pages: [
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- a product name
      { label: "Gmail", path: "/settings/gmail", icon: Mail, component: GmailSettings },
      {
        label: settingsPageLabels.unifiedInbox,
        path: "/settings/unified-inbox",
        icon: Inbox,
        component: UnifiedInboxSettings,
      },
      {
        label: settingsPageLabels.savedSearches,
        path: "/settings/saved-searches",
        icon: Bookmark,
        component: SavedSearchesSettings,
      },
      { label: settingsPageLabels.ai, path: "/settings/ai", icon: Sparkles, component: AISettings },
      {
        label: settingsPageLabels.workspaceApps,
        path: "/settings/workspace-apps",
        icon: PanelsTopLeft,
        component: WorkspaceAppsSettings,
      },
      {
        label: settingsPageLabels.verificationCodes,
        path: "/settings/verification-codes",
        icon: Fingerprint,
        component: VerificationCodesSettings,
      },
    ],
  },
  {
    label: msg({ message: "System", comment: "Group of pages in the Settings sidebar" }),
    pages: [
      {
        label: settingsPageLabels.blocker,
        path: "/settings/blocker",
        icon: ShieldBan,
        component: BlockerSettings,
      },
      {
        label: settingsPageLabels.phishingProtection,
        path: "/settings/phishing-protection",
        icon: ShieldCheck,
        component: PhishingProtectionSettings,
      },
      {
        label: settingsPageLabels.extensions,
        path: "/settings/extensions",
        icon: Puzzle,
        component: ExtensionsSettings,
      },
      {
        label: settingsPageLabels.advanced,
        path: "/settings/advanced",
        icon: SlidersHorizontal,
        component: AdvancedSettings,
      },
      {
        label: settingsPageLabels.updates,
        path: "/settings/updates",
        icon: RefreshCw,
        component: UpdatesSettings,
      },
      {
        label: settingsPageLabels.versionHistory,
        path: "/settings/version-history",
        icon: FileClock,
        component: VersionHistorySettings,
      },
      {
        label: settingsPageLabels.about,
        path: "/settings/about",
        icon: Info,
        component: AboutSettings,
      },
    ],
  },
];

export const settingsPages = groups.flatMap((group) => group.pages);

export function AppSidebar() {
  const [location, navigate] = useLocation();
  const { t } = useLingui();
  const activeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeButton.current?.scrollIntoView({ block: "nearest" });
  }, [location]);

  return (
    <nav className="settings-nav" data-testid="settings-nav">
      <ScrollArea className="h-full">
        <div className="settings-nav-groups">
          {groups.map((group) => (
            <div key={group.label.id} role="group" aria-label={t(group.label)}>
              <div className="settings-nav-label" aria-hidden="true">
                {t(group.label)}
              </div>
              {group.pages
                .filter((page) => !page.hidden)
                .map(({ path, label, icon: Icon }) => (
                  <Button
                    key={path}
                    ref={location === path ? activeButton : undefined}
                    aria-current={location === path ? "page" : undefined}
                    variant="ghost"
                    className="settings-nav-item"
                    onClick={() => navigate(path)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{typeof label === "string" ? label : t(label)}</span>
                  </Button>
                ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </nav>
  );
}
