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
  Info,
  Languages,
  PanelLeft,
  Puzzle,
  Search,
  Settings2,
  ShieldBan,
  ShieldCheck,
  SlidersHorizontal,
  SunMoon,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject, type ComponentType } from "react";
import { useLocation } from "wouter";
import {
  AllMailIcon,
  MailAssistantIcon,
  MailIcon,
  WorkspaceAppsIcon,
} from "@/components/mail-icons";
import type { ProductIconProps } from "@/components/product-icon";
import { moveToolbarFocus } from "@/lib/move-toolbar-focus";
import { settingsPageLabels } from "@/lib/settings-pages";
import { normalizeSearchText, platform } from "@/lib/utils";
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
import { SidebarSettings } from "@/routes/settings/sidebar";
import { UnifiedInboxSettings } from "@/routes/settings/unified-inbox";
import { UpdatesSettings } from "@/routes/settings/updates";
import { VerificationCodesSettings } from "@/routes/settings/verification-codes";
import { VersionHistorySettings } from "@/routes/settings/version-history";
import { WorkspaceAppsSettings } from "@/routes/settings/workspace-apps";

type SettingsPage = {
  label: MessageDescriptor | string;
  path: string;
  icon: ComponentType<ProductIconProps>;
  component: ComponentType;
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
        label: settingsPageLabels.sidebar,
        path: "/settings/sidebar",
        icon: PanelLeft,
        component: SidebarSettings,
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
      { label: "Gmail", path: "/settings/gmail", icon: MailIcon, component: GmailSettings },
      {
        label: settingsPageLabels.unifiedInbox,
        path: "/settings/unified-inbox",
        icon: AllMailIcon,
        component: UnifiedInboxSettings,
      },
      {
        label: settingsPageLabels.savedSearches,
        path: "/settings/saved-searches",
        icon: Bookmark,
        component: SavedSearchesSettings,
      },
      {
        label: settingsPageLabels.ai,
        path: "/settings/ai",
        icon: MailAssistantIcon,
        component: AISettings,
      },
      {
        label: settingsPageLabels.workspaceApps,
        path: "/settings/workspace-apps",
        icon: WorkspaceAppsIcon,
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

export function AppSidebar({
  input,
  onChoose,
}: {
  input: RefObject<HTMLInputElement | null>;
  onChoose?: () => void;
}) {
  const [location, navigate] = useLocation();
  const { t, i18n } = useLingui();
  const activeButton = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const normalize = (label: string) => normalizeSearchText(label, i18n.locale);
  const term = normalize(query);
  const matches = groups
    .map((group) => ({
      ...group,
      pages: group.pages.filter(
        ({ hidden, label }) =>
          !hidden && normalize(typeof label === "string" ? label : t(label)).includes(term),
      ),
    }))
    .filter((group) => group.pages.length > 0);

  useEffect(() => {
    setQuery("");
  }, [location]);

  useEffect(() => {
    if (term) {
      return;
    }
    activeButton.current?.scrollIntoView({ block: "nearest" });
  }, [location, term]);

  return (
    <aside className="settings-nav">
      <div className="settings-nav-search">
        <Search aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label={t`Filter pages`}
          placeholder={t`Filter pages`}
          aria-controls="settings-pages"
          aria-keyshortcuts="/"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            } else if (event.key === "ArrowDown" || (event.key === "Enter" && term)) {
              event.preventDefault();
              const first = nav.current?.querySelector("button");
              first?.focus();
              if (event.key === "Enter") {
                first?.click();
              }
            }
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label={t`Clear search`}
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </div>
      <nav
        onKeyDown={(event) => moveToolbarFocus(event, true)}
        ref={nav}
        id="settings-pages"
        data-testid="settings-nav"
        aria-label={t`Settings`}
      >
        <ScrollArea className="h-full">
          <div className="settings-nav-groups">
            {matches.length === 0 && (
              <p className="settings-nav-empty" role="status">{t`No matching pages`}</p>
            )}
            {matches.map((group) => (
              <div key={group.label.id} role="group" aria-label={t(group.label)}>
                <div className="mail-nav-heading" aria-hidden="true">
                  {t(group.label)}
                </div>
                {group.pages.map(({ path, label, icon: Icon }) => (
                  <Button
                    key={path}
                    ref={location === path ? activeButton : undefined}
                    aria-current={location === path ? "page" : undefined}
                    variant="ghost"
                    className="mail-nav-row settings-nav-item"
                    onClick={() => {
                      setQuery("");
                      navigate(path);
                      onChoose?.();
                    }}
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
    </aside>
  );
}
