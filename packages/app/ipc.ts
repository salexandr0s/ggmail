import fs from "node:fs";
import os from "node:os";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/main";
import { platform } from "@electron-toolkit/utils";
import { isExtensionId } from "@ggmail/electron-extensions";
import { getAccountLabel } from "@ggmail/shared/accounts";
import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@ggmail/shared/constants";
import { curatedExtensions, isCuratedExtensionId } from "@ggmail/shared/extensions";
import { getWorkspaceAppUrl } from "@ggmail/shared/google";
import { i18n } from "@ggmail/shared/i18n";
import { currentMailView, type MailViewsPopupState } from "@ggmail/shared/mail-views";
import { ms } from "@ggmail/shared/ms";
import { editNotificationTimes } from "@ggmail/shared/notification-times";
import { byPlatform } from "@ggmail/shared/platform";
import { accountConfigInputSchema } from "@ggmail/shared/schemas";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import type { IpcMainEvents, IpcRendererEvent, MenuModifiers } from "@ggmail/shared/types";
import {
  isSidebarApp,
  visibleSidebarShortcuts,
  workspaceApps,
} from "@ggmail/shared/workspace-apps";
import { select, t } from "@lingui/core/macro";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  nativeTheme,
  session,
  shell,
} from "electron";
import { serializeError } from "serialize-error";
import { getDesktopSourcesWindowTitle } from "@/account";
import { accounts } from "@/accounts";
import { registerAssistantIpc } from "@/assistant/ipc";
import { registerAttachmentIpc } from "@/attachments/ipc";
import { bookmarks } from "@/bookmarks";
import { config } from "@/config";
import { copyText } from "@/lib/clipboard";
import { getExtensionWindowError } from "@/lib/extension-window";
import { readFindRequest } from "@/lib/find-in-page";
import { Popup } from "@/lib/popup";
import { relaunchApp } from "@/lib/relaunch";
import { main } from "@/main";
import { appMenu } from "@/menu";
import { settingsWindow } from "@/settings-window";
import { shellHistory } from "@/shell-history";
import { swipeNavigation } from "@/swipe-navigation";
import { DormantTab, isWindowedTab } from "@/tabs";
import {
  canOpenWorkspaceAppInApp,
  resolveWorkspaceAppOpenBehavior,
  WorkspaceApp,
} from "@/workspace-app";
import {
  contextMenuContents,
  chooseContextAction,
  showContextActions,
  type ContextAction,
} from "./context-menu-popup";
import { confirmAppLinksTabHandover } from "./dialogs";
import { DoNotDisturb, doNotDisturb } from "./do-not-disturb";
import { downloads } from "./downloads";
import {
  extensionUpdater,
  getInstalledExtensions,
  installCuratedExtension,
  openCuratedExtensionWindow,
  uninstallCuratedExtension,
} from "./extensions";
import { registerFollowUpIpc } from "./follow-ups/ipc";
import { Gmail, GMAIL_USER_STYLES_PATH } from "./gmail";
import { registerUnifiedSearchIpc } from "./gmail/unified-search";
import {
  ExtensionInstallError,
  getCouldNotInstallExtensionMessage,
  getErrorMessage,
} from "./lib/extension-swap";
import { hibernatesTabWhenIdle } from "./lib/hibernation";
import { log } from "./lib/log";
import { registerMailContextActions } from "./mail-context-actions";
import {
  areWorkspaceAppNotificationsAllowed,
  showTestNotification,
  createNotification,
} from "./notifications";
import { getIsDefaultMailtoClient, setAsDefaultMailtoClient } from "./protocol";
import { openWindowsDefaultAppsSettings } from "./protocol/windows-mail-client";
import { registerTaskDraft, taskDraftContents } from "./task-draft";
import { appUpdater } from "./updater";
import { openExternalUrl } from "./url";

const undoSendLapseTimeouts = new Map<number, NodeJS.Timeout>();

function clearUndoSendLapseTimeout(browserWindowId: number) {
  const undoSendLapseTimeout = undoSendLapseTimeouts.get(browserWindowId);

  if (undoSendLapseTimeout) {
    clearTimeout(undoSendLapseTimeout);
  }

  undoSendLapseTimeouts.delete(browserWindowId);
}

function getNavigationWebContents(workspaceAppId?: string) {
  if (workspaceAppId) {
    return WorkspaceApp.fromId(workspaceAppId).view.webContents;
  }

  const selectedAccount = accounts.getSelectedAccount();

  return (selectedAccount.instance.tabs.activeTab.view ?? selectedAccount.instance.gmail.view)
    .webContents;
}

function getRendererWebContents() {
  const rendererWebContents = [main.window.webContents];

  if (settingsWindow.window && !settingsWindow.window.webContents.isDestroyed()) {
    rendererWebContents.push(settingsWindow.window.webContents);
  }

  const recentDownloadHistoryPopupWebContents = downloads.recentDownloadHistoryPopup.webContents;

  if (recentDownloadHistoryPopupWebContents) {
    rendererWebContents.push(recentDownloadHistoryPopupWebContents);
  }

  for (const workspaceAppWindow of WorkspaceApp.getAllWindows()) {
    rendererWebContents.push(workspaceAppWindow.webContents);
  }

  return rendererWebContents;
}

function getNewTabLabel(appLabel: string, target: "window" | "tab") {
  return t({
    message: select(target, {
      window: `New ${appLabel} Window`,
      other: `New ${appLabel} Tab`,
    }),
    comment:
      "Tab context menu item; appLabel is the name of a Google Workspace app, such as Docs or Sheets",
  });
}

function getOpenLinksHereLabel(appLabel: string, target: "window" | "tab") {
  return t({
    message: select(target, {
      window: `Open ${appLabel} Links in This Window`,
      other: `Open ${appLabel} Links in This Tab`,
    }),
    comment:
      "Tab context menu checkbox that makes this tab open the app's links; appLabel is the name of a Google Workspace app, such as Docs or Sheets",
  });
}

function getCouldNotUninstallExtensionMessage(error: unknown) {
  const errorMessage = getErrorMessage(error);

  return t({
    message: `Couldn't uninstall the extension: ${errorMessage}`,
    comment: "errorMessage is the technical reason, left untranslated",
  });
}

function showTabActions(point: Electron.Point, template: MenuItemConstructorOptions[]) {
  const groups: ContextAction[][] = [[]];
  for (const item of Menu.buildFromTemplate(template).items) {
    if (item.type === "separator") {
      groups.push([]);
    } else {
      groups.at(-1)?.push({
        id: item.id,
        label: item.label,
        enabled: item.enabled,
        checked: item.type === "checkbox" ? item.checked : undefined,
        run: () => item.click(),
      });
    }
  }
  showContextActions(main.window, main.window.webContents, point, groups);
}

class Ipc {
  main = new IpcListener<IpcMainEvents>();

  renderer = new IpcEmitter<IpcRendererEvent>();

  broadcast<E extends keyof IpcRendererEvent>(
    channel: Extract<E, string>,
    ...args: IpcRendererEvent[E]
  ) {
    const recipients = getRendererWebContents();
    if (channel === "theme.darkModeChanged") {
      recipients.push(...taskDraftContents());
      const menu = contextMenuContents();
      if (menu) {
        recipients.push(menu);
      }
    }
    for (const rendererWebContents of recipients) {
      this.renderer.send(rendererWebContents, channel, ...args);
    }
  }

  init() {
    this.main.on("contextMenu.choose", chooseContextAction);
    registerMailContextActions(this.main);
    registerTaskDraft(this.main);
    registerAssistantIpc(this);
    registerAttachmentIpc(this);
    registerUnifiedSearchIpc(this);
    registerFollowUpIpc(this);

    config.onDidAnyChange(() => {
      ipc.broadcast("config.configChanged", config.store);
    });

    config.onDidChange("sidebar.shortcuts", () => {
      accounts.sendTabsChangedToRenderer();
      if (!visibleSidebarShortcuts(config.get("sidebar.shortcuts")).includes("bookmarks")) {
        bookmarks.popup.close();
      }
    });

    config.onDidChange("accounts", () => {
      accounts.sendAccountsChangedToRenderer();

      // Bookmarks live in the account config, so every surface reflecting them
      // redraws from here rather than from a change event of its own. The strip's
      // tab rows star the URL they sit on, so they are sent again too.
      accounts.sendTabsChangedToRenderer();

      bookmarks.sendChangedToPopup();

      WorkspaceApp.broadcastBookmarkStates();
    });

    this.main.on("accounts.selectAccount", (_event, selectedAccountId, showMailbox) => {
      if (showMailbox) {
        accounts.openAccountPage(selectedAccountId);
      } else {
        accounts.selectAccount(selectedAccountId);
      }
    });

    this.main.on("accounts.selectPreviousAccount", () => {
      accounts.selectPreviousAccount();
    });

    this.main.on("accounts.selectNextAccount", () => {
      accounts.selectNextAccount();
    });

    this.main.on("accounts.addAccount", (_event, accountDetails) => {
      accounts.addAccount(accountDetails);
    });

    this.main.handle("accounts.removeAccount", async (_event, accountId) => {
      try {
        await accounts.removeAccount(accountId);
      } catch (error) {
        log.error("Failed to remove account", { accountId, error: serializeError(error) });

        throw error;
      }
    });

    this.main.on("accounts.updateAccount", (_event, accountId, details) => {
      const parsed = accountConfigInputSchema.safeParse(details);

      if (typeof accountId !== "string" || !parsed.success) {
        log.warn("Ignored an account update that did not match the form");

        return;
      }

      accounts.updateAccount(accountId, parsed.data);
    });

    this.main.on("accounts.setAccountEnabled", (_event, accountId, enabled) => {
      accounts.setAccountEnabled(accountId, enabled);
    });

    this.main.handle("accounts.deleteBrowsingData", async (_event, accountId, dataTypes) => {
      try {
        await accounts.deleteBrowsingData(accountId, dataTypes);
      } catch (error) {
        log.error("Failed to delete browsing data", {
          accountId,
          dataTypes,
          error: serializeError(error),
        });

        throw error;
      }
    });

    this.main.handle("shell.getHistory", () => shellHistory.state);
    this.main.handle("downloads.isActive", () => downloads.isActive);

    this.main.on("workspaceApp.goBack", (_event, workspaceAppId) => {
      if (workspaceAppId) {
        getNavigationWebContents(workspaceAppId).navigationHistory.goBack();
      } else {
        shellHistory.move(-1);
      }
    });

    this.main.on("workspaceApp.goForward", (_event, workspaceAppId) => {
      if (workspaceAppId) {
        getNavigationWebContents(workspaceAppId).navigationHistory.goForward();
      } else {
        shellHistory.move(1);
      }
    });

    this.main.on("workspaceApp.reload", (_event, workspaceAppId) => {
      getNavigationWebContents(workspaceAppId).reload();
    });

    this.main.on("workspaceApp.stop", (_event, workspaceAppId) => {
      getNavigationWebContents(workspaceAppId).stop();
    });

    this.main.handle("workspaceApp.getLoadingState", (_event, workspaceAppId) => {
      return getNavigationWebContents(workspaceAppId).isLoading();
    });

    this.main.handle("workspaceApp.getPageTitle", (event) => {
      return WorkspaceApp.tryFromWebContents(event.sender)?.title ?? "";
    });

    this.main.on("gmail.setOutOfOffice", (event, outOfOffice) => {
      const accountInstance = accounts.findInstanceByGmailWebContentsId(event.sender.id);

      if (accountInstance) {
        accountInstance.gmail.store.setState({
          outOfOffice,
        });
      }
    });

    this.main.on("swipeNavigation.setPageScrollEdge", (event, pageScrollEdge) => {
      swipeNavigation.setPageScrollEdge(event.sender, pageScrollEdge);
    });

    /* oxlint-disable lingui/no-unlocalized-strings -- Internal route and account identifiers for the mail-view popup. */
    const mailViewsPopup = new Popup();
    const showMailPicker = (anchor: { x: number; y: number }) => {
      const mailboxes = accounts.getAccounts();
      const unified = config.get("unifiedInbox.enabled") && mailboxes.length > 1;
      const selected = accounts.getSelectedAccount();
      const choices: MailViewsPopupState = {
        unified,
        selectedView: currentMailView(main.location, selected.instance.tabs.activeTab.app),
        selectedAccount: main.location === "/" ? "account/" + selected.config.id : undefined,
        accountItems:
          mailboxes.length > 1
            ? mailboxes.map(({ config: account, instance }) => {
                const { attentionRequired, unreadCount, profilePhoto } =
                  instance.gmail.store.getState();
                return {
                  value: "account/" + account.id,
                  label: getAccountLabel(account.label),
                  color: account.color,
                  logo: account.logo,
                  profilePhoto,
                  signIn: attentionRequired,
                  unread:
                    config.get("accounts.unreadBadge") && account.gmail.unreadBadge
                      ? unreadCount
                      : null,
                };
              })
            : [],
      };
      if (
        mailViewsPopup.toggle(main.window, {
          page: "mail-views",
          anchor: { ...anchor, align: "start" },
          width: 248,
          // Allow 40px per section for its label and padding, and 36px per choice.
          height:
            40 + 3 * 36 + (choices.accountItems.length ? 40 + 36 * choices.accountItems.length : 0),
          searchParams: new URLSearchParams({
            choices: JSON.stringify(choices),
          }),
        })
      ) {
        const owner = main.window.webContents;
        ipc.renderer.send(owner, "titleBar.mailViewsOpen", true);
        mailViewsPopup.webContents?.once("destroyed", () => {
          if (!owner.isDestroyed() && !mailViewsPopup.webContents) {
            ipc.renderer.send(owner, "titleBar.mailViewsOpen", false);
          }
        });
        mailViewsPopup.closeOnBlurEnabled = true;
        mailViewsPopup.webContents?.once("did-finish-load", () =>
          mailViewsPopup.webContents?.focus(),
        );
      }
    };

    const openMailView = (value: string) => {
      if (value === "gmail") {
        const { instance } = accounts.getSelectedAccount();
        instance.tabs.activateTab(GMAIL_TAB_ID);
        if (main.location !== "/") {
          main.navigate("/");
        }
        accounts.refreshSelectedAccountView();
      } else if (value.startsWith("account/")) {
        const id = value.slice("account/".length);
        if (accounts.getAccounts().some((account) => account.config.id === id)) {
          accounts.openAccountPage(id);
        }
      } else if (
        value === "/attachments" ||
        value === "/waiting" ||
        (value === "/unified-inbox" &&
          config.get("unifiedInbox.enabled") &&
          accounts.getAccounts().length > 1)
      ) {
        if (main.location !== value) {
          main.navigate(value);
        }
      }
    };

    this.main.on("titleBar.openMailView", (event, value) => {
      if (
        event.sender === main.window.webContents &&
        event.senderFrame === event.sender.mainFrame &&
        typeof value === "string"
      ) {
        openMailView(value);
      }
    });

    this.main.on("titleBar.showMailViews", (event, anchor) => {
      if (
        event.sender === main.window.webContents &&
        event.senderFrame === event.sender.mainFrame
      ) {
        showMailPicker(anchor);
      }
    });

    this.main.on("titleBar.chooseMailView", (event, value) => {
      if (
        event.sender !== mailViewsPopup.webContents ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        return;
      }
      mailViewsPopup.close();
      if (typeof value === "string") {
        openMailView(value);
      } else if (main.location === "/") {
        accounts.focusActiveView();
      }
    });

    /* oxlint-enable lingui/no-unlocalized-strings */

    this.main.on("sidebar.openApp", (event, app) => {
      if (
        event.sender === main.window.webContents &&
        event.senderFrame === event.sender.mainFrame &&
        isSidebarApp(app) &&
        visibleSidebarShortcuts(config.get("sidebar.shortcuts")).includes(app)
      ) {
        accounts.getSelectedAccount().instance.tabs.openSidebarApp(app);
      }
    });

    this.main.on("sidebar.openSettings", (event) => {
      if (
        event.sender === main.window.webContents &&
        event.senderFrame === event.sender.mainFrame
      ) {
        settingsWindow.open();
      }
    });

    // A renderer menu extending below the titlebar would sit behind the native mail view.
    this.main.handle("titleBar.pickTool", (event, labels, anchor) => {
      if (
        event.sender !== main.window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        !Array.isArray(labels) ||
        !labels.length ||
        !labels.every((label) => typeof label === "string") ||
        !Number.isFinite(anchor?.x) ||
        !Number.isFinite(anchor?.y)
      ) {
        return null;
      }
      return new Promise<({ index: number } & MenuModifiers) | null>((resolve) => {
        const menu = Menu.buildFromTemplate(
          labels.map((label, index) => ({
            label: label.replaceAll("&", "&&"),
            click: (_item, _window, keys) =>
              resolve({
                index,
                ctrlKey: !!keys?.ctrlKey,
                metaKey: !!keys?.metaKey,
                shiftKey: !!keys?.shiftKey,
              }),
          })),
        );
        menu.popup({
          window: main.window,
          x: Math.round(anchor.x),
          y: Math.round(anchor.y),
          callback: () => setImmediate(() => resolve(null)),
        });
      });
    });

    this.main.on("titleBar.toggleAppMenu", (event, anchor) => {
      appMenu.togglePopup(anchor, settingsWindow.getAppMenuWindow(event.sender));
    });

    // A menu in the chrome closing, which leaves the keyboard nowhere on purpose.
    ipc.main.on("window.focusActiveView", () => {
      accounts.focusActiveView();
    });

    this.main.handle("desktopSources.getSources", async () => {
      const desktopSources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });

      const desktopSourcesWindowTitle = getDesktopSourcesWindowTitle();

      return desktopSources
        .filter((source) => !source.name.startsWith(desktopSourcesWindowTitle))
        .map(({ id, name, thumbnail }) => ({
          id,
          name,
          thumbnail: thumbnail.toDataURL(),
        }));
    });

    this.main.on("findInPage", (event, text, options) => {
      const workspaceApp = WorkspaceApp.tryFromWebContents(event.sender);

      const targetWebContents = workspaceApp?.view.webContents ?? getNavigationWebContents();

      const request = readFindRequest(text);

      if (request.kind !== "search") {
        targetWebContents.stopFindInPage("clearSelection");

        // Closing the field gives the keyboard back to the page it searched,
        // which is where the window's own find bar took it from. Clearing the
        // text does not: the field is still open and still being typed in.
        if (request.kind === "close") {
          if (workspaceApp) {
            targetWebContents.focus();
          } else {
            accounts.focusActiveView();
          }
        }

        return;
      }

      targetWebContents.findInPage(request.text, {
        forward: options?.forward,
        findNext: options?.findNext,
      });
    });

    ipc.main.on("downloads.openFile", async (_event, { id, filePath }) => {
      if (await downloads.markDownloadMissingIfGone(id, filePath)) {
        return;
      }

      shell.openPath(filePath);
    });

    ipc.main.on("downloads.showFileInFolder", async (_event, { id, filePath }) => {
      if (await downloads.markDownloadMissingIfGone(id, filePath)) {
        return;
      }

      shell.showItemInFolder(filePath);
    });

    ipc.main.on("taskbar.setOverlayIcon", (_event, dataUrl) => {
      main.window.setOverlayIcon(
        nativeImage.createFromDataURL(dataUrl),
        t({
          message: "You have unread messages",
          comment:
            "Accessible description of the unread badge on ggmail's taskbar button on Windows",
        }),
      );
    });

    ipc.main.on("appUpdater.quitAndInstall", () => {
      appUpdater.quitAndInstall();
    });

    ipc.main.on("appUpdater.openVersionHistory", () => {
      settingsWindow.open("version-history");
    });

    ipc.main.on("appUpdater.openReleasePage", () => {
      appUpdater.openReleasePage();
    });

    ipc.main.on("gmail.search", (_event, searchQuery) => {
      const selectedAccount = accounts.getSelectedAccount();

      selectedAccount.instance.gmail.search(searchQuery);
    });

    this.main.handle("workspaceApp.getBookmarkState", (_event, workspaceAppId) => {
      return WorkspaceApp.fromId(workspaceAppId).bookmarkState;
    });

    ipc.main.on("workspaceApp.toggleBookmark", (_event, workspaceAppId) => {
      WorkspaceApp.fromId(workspaceAppId).toggleBookmark();
    });

    ipc.main.on("workspaceApp.showMenu", (_event, workspaceAppId) => {
      const workspaceApp = WorkspaceApp.fromId(workspaceAppId);

      const isWindowsMode = config.get("workspaceApps.mode") === "windows";

      Menu.buildFromTemplate([
        ...(workspaceApp.isWindowed && workspaceApp.window.isFullScreen()
          ? [{ label: t`Exit full screen`, click: () => workspaceApp.window.setFullScreen(false) }]
          : []),
        ...(workspaceApp.isPopup || isWindowsMode
          ? []
          : [
              {
                label: t`Move to Tab`,
                click: () => {
                  workspaceApp.adoptIntoTabs();
                },
              },
              {
                type: "separator" as const,
              },
            ]),
        ...(workspaceApp.isSavable
          ? [
              {
                label: t`Load on Launch`,
                type: "checkbox" as const,
                checked: workspaceApp.pinned && workspaceApp.loadOnLaunch,
                click: () => {
                  if (workspaceApp.loadOnLaunch) {
                    workspaceApp.loadOnLaunch = false;

                    accounts.saveTabs();

                    return;
                  }

                  workspaceApp.loadOnLaunch = true;

                  workspaceApp.account.instance.tabs.setTabPinned(workspaceApp.id, true);
                },
              },
              {
                type: "separator" as const,
              },
            ]
          : []),
        {
          label: t`Copy URL`,
          click: () => {
            workspaceApp.copyUrl();
          },
        },
        {
          label: t`Open in Default Browser`,
          click: () => {
            workspaceApp.openInBrowser();
          },
        },
      ]).popup();
    });

    ipc.main.on("tabs.selectTab", (_event, accountId, tabId) => {
      const account = accounts.getAccount(accountId);

      account.instance.tabs.activateTab(tabId);

      if (account.instance.tabs.activeTabId !== tabId) {
        return;
      }

      main.navigate("/");
      if (account.config.selected) {
        accounts.refreshSelectedAccountView();
      } else {
        accounts.selectAccount(accountId);
      }
    });

    ipc.main.on("tabs.closeTab", (_event, accountId, tabId) => {
      const account = accounts.getAccount(accountId);

      account.instance.tabs.closeTab(tabId);

      if (account.config.selected) {
        accounts.refreshSelectedAccountView();
      }
    });

    ipc.main.on("tabs.moveTab", (_event, accountId, tabId, targetSectionIndex) => {
      const account = accounts.getAccount(accountId);

      account.instance.tabs.moveTab(tabId, targetSectionIndex);
    });

    ipc.main.on("tabs.showTabContextMenu", (event, accountId, tabId, point) => {
      if (
        event.sender !== main.window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        return;
      }
      const account = accounts.getAccount(accountId);

      const tab = account.instance.tabs.getTab(tabId);

      if (tabId === GMAIL_TAB_ID) {
        showContextActions(main.window, event.sender, point, [
          [
            {
              id: "inbox",
              label: t`Open inbox`,
              run: () => {
                account.instance.tabs.activateTab(GMAIL_TAB_ID);
                accounts.selectAccount(accountId);
                main.navigate("/");
                ipc.renderer.send(
                  account.instance.gmail.view.webContents,
                  "gmail.navigateTo",
                  "inbox",
                );
              },
            },
            {
              id: "reload",
              label: t({ message: "Reload", context: "context menu" }),
              run: () => account.instance.gmail.view.webContents.reload(),
            },
          ],
        ]);
        return;
      }

      if (!(tab instanceof WorkspaceApp) && !(tab instanceof DormantTab)) {
        return;
      }

      const tabApp = tab.app;

      // The designation stays visible and removable from the tab holding it.
      const appLinksApp = tab.opensLinksForApp ?? tabApp;

      const hasOtherClosableTabs = account.instance.tabs.tabs.some(
        (accountTab) =>
          accountTab.id !== tabId && accountTab.id !== GMAIL_TAB_ID && !accountTab.pinned,
      );

      const contextTabIndex = account.instance.tabs.tabs.findIndex(
        (accountTab) => accountTab.id === tabId,
      );

      const hasClosableTabsBelow = account.instance.tabs.tabs
        .slice(contextTabIndex + 1)
        .some((accountTab) => !accountTab.pinned);

      const isWindowsMode = config.get("workspaceApps.mode") === "windows";

      const isTabWindowed = isWindowedTab(tab);

      const openWorkspaceAppUrl = (url: string) => {
        account.instance.tabs.openUrl(url);

        if (account.config.selected) {
          accounts.refreshSelectedAccountView();
        }
      };

      // lingui-set comment="An item in the context menu of a Google Workspace app's tab"
      showTabActions(point, [
        ...(tabApp && !workspaceApps[tabApp].singleInstance
          ? [
              {
                id: "new",
                label: getNewTabLabel(
                  workspaceApps[tabApp].label,
                  isWindowsMode ? "window" : "tab",
                ),
                click: () => {
                  openWorkspaceAppUrl(getWorkspaceAppUrl(tabApp));
                },
              },
            ]
          : []),
        {
          id: "reload",
          label: t({ message: "Reload", context: "context menu" }),
          enabled: tab instanceof WorkspaceApp,
          click: () => {
            if (tab instanceof WorkspaceApp) {
              tab.reload();
            }
          },
        },
        {
          id: "copy",
          label: t`Duplicate`,
          click: () => {
            const currentTabUrl =
              tab instanceof WorkspaceApp ? tab.view.webContents.getURL() : tab.url;

            const duplicatedTabUrl =
              !currentTabUrl && tabApp ? getWorkspaceAppUrl(tabApp) : currentTabUrl;

            openWorkspaceAppUrl(duplicatedTabUrl);
          },
        },
        ...(tab instanceof WorkspaceApp && tab.isWindowed
          ? [
              {
                id: "tab",
                label: t`Move to Tab`,
                click: () => {
                  if (tab instanceof WorkspaceApp) {
                    tab.adoptIntoTabs();
                  }

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]
          : [
              {
                id: "window",
                label: t`Move to New Window`,
                enabled: tab instanceof WorkspaceApp && !tab.isWindowed,
                click: () => {
                  if (tab instanceof WorkspaceApp) {
                    tab.detachToWindow();
                  }

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]),
        {
          type: "separator",
        },
        {
          id: "pageUrl",
          label: t({
            message: "Copy URL",
            comment:
              "Copies the address of the page open in a Google Workspace app; an item in the app's page context menu and its tab's context menu",
          }),
          click: () => {
            if (tab instanceof WorkspaceApp) {
              tab.copyUrl();

              return;
            }

            copyText(tab.url);
          },
        },
        {
          id: "browser",
          label: t`Open in Default Browser`,
          click: () => {
            if (tab instanceof WorkspaceApp) {
              tab.openInBrowser();

              return;
            }

            openExternalUrl(tab.url, { skipTrustedHostCheck: true });
          },
        },
        {
          type: "separator" as const,
        },
        ...(tabApp
          ? [
              {
                id: "pin",
                label: tab.pinned ? t`Unpin` : t`Pin`,
                click: () => {
                  account.instance.tabs.setTabPinned(tabId, !tab.pinned);
                },
              },
              {
                id: "bookmark",
                label: bookmarks.isBookmarked(accountId, tab.url)
                  ? t`Remove Bookmark`
                  : t({
                      message: "Bookmark",
                      context: "context menu",
                      comment: "Context menu item that bookmarks the tab",
                    }),
                click: () => {
                  bookmarks.toggle(accountId, {
                    app: tabApp,
                    url: tab.url,
                    title: tab.title,
                  });
                },
              },
              ...(tab.pinned
                ? [
                    {
                      label: t`Load on Launch`,
                      type: "checkbox" as const,
                      checked: tab.loadOnLaunch,
                      click: () => {
                        tab.loadOnLaunch = !tab.loadOnLaunch;

                        accounts.saveTabs();
                      },
                    },
                  ]
                : []),
            ]
          : []),
        // The checkbox shows what the tab does today, under the setting and any
        // mark it already carries, so ticking it always says hibernate this one
        // and clearing it always says leave it alone.
        {
          label: t`Hibernate When Idle`,
          type: "checkbox" as const,
          checked: hibernatesTabWhenIdle(tab, config.get("workspaceApps.hibernation")),
          click: () => {
            tab.hibernatesWhenIdle = !hibernatesTabWhenIdle(
              tab,
              config.get("workspaceApps.hibernation"),
            );

            // An unpinned tab is not saved, so the mark lasts as long as the
            // tab itself does.
            if (tab.pinned) {
              accounts.saveTabs();
            }
          },
        },
        ...(appLinksApp && !workspaceApps[appLinksApp].singleInstance
          ? [
              {
                label: getOpenLinksHereLabel(
                  workspaceApps[appLinksApp].label,
                  isTabWindowed ? "window" : "tab",
                ),
                type: "checkbox" as const,
                checked: Boolean(tab.opensLinksForApp),
                click: async () => {
                  if (tab.opensLinksForApp) {
                    account.instance.tabs.setTabOpensLinksForApp(tabId, null);

                    return;
                  }

                  const appLinksTab = account.instance.tabs.getAppLinksTab(appLinksApp);

                  if (
                    appLinksTab &&
                    !(await confirmAppLinksTabHandover(appLinksApp, appLinksTab.title, {
                      isTargetWindowed: isTabWindowed,
                    }))
                  ) {
                    return;
                  }

                  account.instance.tabs.setTabOpensLinksForApp(tabId, appLinksApp);
                },
              },
            ]
          : []),
        {
          type: "separator",
        },
        ...(tab instanceof DormantTab
          ? [
              {
                id: "open",
                label: t({
                  message: "Open",
                  context: "context menu",
                  comment: "Context menu item that loads an unloaded tab",
                }),
                click: () => {
                  account.instance.tabs.activateTab(tabId);

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]
          : []),
        // An unloaded pinned tab is the one thing with nothing left to close:
        // it is already saved, and closing it again would drop what was pinned.
        ...(tab instanceof DormantTab && tab.pinned
          ? []
          : [
              {
                id: "close",
                label: t({
                  message: "Close",
                  context: "context menu",
                  comment: "Context menu item that closes the tab",
                }),
                click: () => {
                  account.instance.tabs.closeTab(tabId);

                  if (account.config.selected) {
                    accounts.refreshSelectedAccountView();
                  }
                },
              },
            ]),
        {
          id: "close",
          label: t`Close Other Tabs`,
          enabled: hasOtherClosableTabs,
          click: () => {
            account.instance.tabs.closeOtherTabs(tabId);

            if (account.config.selected) {
              accounts.refreshSelectedAccountView();
            }
          },
        },
        {
          id: "close",
          label: t`Close Tabs Below`,
          enabled: hasClosableTabsBelow,
          click: () => {
            account.instance.tabs.closeTabsBelow(tabId);

            if (account.config.selected) {
              accounts.refreshSelectedAccountView();
            }
          },
        },
      ]);
      // lingui-reset
    });

    ipc.main.on("tabs.showVerticalTabsContextMenu", (event, accountId, point, shortcut) => {
      if (
        event.sender !== main.window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        return;
      }
      const account = accounts.getAccount(accountId);

      const openLabel = t({ message: "Open", context: "context menu" });
      if (shortcut === "settings" || shortcut === "bookmarks") {
        showContextActions(main.window, event.sender, point, [
          [
            {
              id: "open",
              label: openLabel,
              run: () => {
                if (shortcut === "settings") {
                  settingsWindow.open();
                } else {
                  bookmarks.togglePopup(main.window, point.y);
                }
              },
            },
          ],
        ]);
        return;
      }
      if (
        shortcut &&
        isSidebarApp(shortcut) &&
        visibleSidebarShortcuts(config.get("sidebar.shortcuts")).includes(shortcut)
      ) {
        showContextActions(main.window, event.sender, point, [
          [
            {
              id: "open",
              label: openLabel,
              run: () => account.instance.tabs.openSidebarApp(shortcut),
            },
            {
              id: "browser",
              label: t`Open in Default Browser`,
              run: () => {
                const url = new URL(getWorkspaceAppUrl(shortcut));
                if (account.instance.gmail.userEmail) {
                  url.searchParams.set("authuser", account.instance.gmail.userEmail);
                }
                openExternalUrl(url.href, { skipTrustedHostCheck: true });
              },
            },
          ],
        ]);
        return;
      }
      showTabActions(point, [
        {
          id: "reopen",
          label: t({ message: "Reopen Closed Tab", context: "context menu" }),
          enabled: account.instance.tabs.hasRecentlyClosedTabs,
          click: () => {
            if (account.instance.tabs.reopenClosedTab() && account.config.selected) {
              accounts.refreshSelectedAccountView();
            }
          },
        },
      ]);
    });

    ipc.main.handle("config.getConfig", () => config.store);

    ipc.main.handle(
      "spellchecker.getAvailableLanguages",
      () => session.defaultSession.availableSpellCheckerLanguages,
    );

    ipc.main.handle("spellchecker.getOsLocale", () => app.getLocale());

    ipc.main.handle("config.setConfig", (_event, keyValues) => {
      Object.entries(keyValues).forEach(([key, value]) => {
        config.set(key as keyof typeof keyValues, value);
      });
    });

    ipc.main.handle("downloads.setLocation", async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        buttonLabel: t({
          message: "Select",
          comment: "Button in the folder picker that chooses where downloads are saved",
        }),
        defaultPath: config.get("downloads.location"),
      });

      if (canceled) {
        return { canceled: true };
      }

      config.set("downloads.location", filePaths[0]);

      return { canceled: false };
    });

    ipc.main.on("app.relaunch", () => {
      relaunchApp();
      app.quit();
    });

    ipc.main.on("theme.setTheme", (_event, theme) => {
      nativeTheme.themeSource = theme;

      config.set("theme", theme);
    });

    ipc.main.handle("app.getLoginItemSettings", () => app.getLoginItemSettings());

    ipc.main.handle("app.setLoginItemSettings", (_event, settings) => {
      app.setLoginItemSettings(settings);
    });

    ipc.main.handle("app.getIsDefaultMailtoClient", () => getIsDefaultMailtoClient());

    ipc.main.handle("app.setAsDefaultMailtoClient", () => {
      setAsDefaultMailtoClient();
    });

    ipc.main.on("app.openDefaultAppsSettings", () => {
      openWindowsDefaultAppsSettings();
    });

    ipc.main.handle("updates.isBelowMinimumMacOSVersion", () => !appUpdater.isUpdateSupported());

    ipc.main.handle("about.getInfo", async () => ({
      version: app.getVersion(),
      os: `${os.type()} ${os.release()} (${os.arch()})`,
    }));

    ipc.main.handle("about.exportLogs", async () => {
      // lingui-set comment="Button in the save dialog that exports ggmail's log file"
      const buttonLabel = byPlatform(platform, {
        macOS: t({ message: "Export", context: "macOS" }),
        windows: t({ message: "Export", context: "Windows" }),
        linux: t({ message: "Export", context: "Linux" }),
      });
      // lingui-reset

      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: "ggmail.log",
        buttonLabel,
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      fs.copyFileSync(log.transports.file.getFile().path, filePath);

      return { canceled: false };
    });

    ipc.main.handle("notifications.editTime", (_event, edit) => {
      const result = editNotificationTimes(config.get("notifications.times"), edit);
      if (typeof result === "string") {
        return result;
      }
      config.set("notifications.times", result);
      return "saved" as const;
    });

    ipc.main.handle("notifications.showTestNotification", showTestNotification);

    ipc.main.on("workspaceApp.showNotification", (event, notification) => {
      const notifyingWorkspaceApp = WorkspaceApp.tryFromViewWebContents(event.sender);

      if (
        !notifyingWorkspaceApp ||
        !areWorkspaceAppNotificationsAllowed(notifyingWorkspaceApp.accountId)
      ) {
        return;
      }

      const workspaceAppLabel = notifyingWorkspaceApp.app
        ? workspaceApps[notifyingWorkspaceApp.app].label
        : undefined;

      const hasMultipleAccounts = accounts.getAccountConfigs().length > 1;

      let notificationTitle = workspaceAppLabel ?? notification.title;

      if (hasMultipleAccounts) {
        notificationTitle = `[${getAccountLabel(notifyingWorkspaceApp.account.config.label)}] ${notificationTitle}`;
      }

      let subtitle: string | undefined;

      let body = notification.body;

      if (workspaceAppLabel) {
        if (platform.isMacOS) {
          subtitle = notification.title;
        } else {
          body = [notification.title, notification.body].filter(Boolean).join("\n");
        }
      }

      createNotification({
        groupId: notifyingWorkspaceApp.accountId,
        title: notificationTitle,
        subtitle,
        body,
        silent: notifyingWorkspaceApp.app === "calendar" ? true : notification.silent,
        timeoutType: notification.requireInteraction ? "never" : "default",
        click: () => {
          const account = accounts.instances.get(notifyingWorkspaceApp.accountId);
          if (!account) {
            return;
          }
          if (notifyingWorkspaceApp.isWindowed) {
            if (notifyingWorkspaceApp.window.isDestroyed()) {
              return;
            }
            notifyingWorkspaceApp.window.show();

            return;
          }

          if (!account.tabs.getTab(notifyingWorkspaceApp.id)) {
            return;
          }
          main.navigate("/");
          account.tabs.activateTab(notifyingWorkspaceApp.id);

          if (notifyingWorkspaceApp.account.config.selected) {
            accounts.refreshSelectedAccountView();
          } else {
            accounts.selectAccount(notifyingWorkspaceApp.accountId);
          }
        },
      });
    });

    ipc.main.on("workspaceApps.openApp", (_event, app, modifierOpenBehavior) => {
      if (!canOpenWorkspaceAppInApp(app)) {
        openExternalUrl(getWorkspaceAppUrl(app), {
          skipTrustedHostCheck: true,
          focusBrowser: modifierOpenBehavior !== "backgroundTab",
        });

        return;
      }

      const openBehavior = resolveWorkspaceAppOpenBehavior(modifierOpenBehavior);

      const selectedAccount = accounts.getSelectedAccount();

      if (openBehavior === "newWindow") {
        selectedAccount.instance.tabs.openWindowedTab(getWorkspaceAppUrl(app));

        return;
      }

      const workspaceApp = selectedAccount.instance.tabs.openTab(getWorkspaceAppUrl(app));

      if (openBehavior === "backgroundTab") {
        return;
      }

      selectedAccount.instance.tabs.activateTab(workspaceApp.id);

      accounts.refreshSelectedAccountView();
    });

    ipc.main.on("doNotDisturb.toggle", () => {
      doNotDisturb.toggle();
    });

    ipc.main.on("doNotDisturb.showOptions", () => {
      const options: MenuItemConstructorOptions[] = DoNotDisturb.options.map(
        ({ label, duration }) => ({
          label: i18n.t(label),
          type: "checkbox",
          checked: config.get("doNotDisturb.duration") === duration,
          click: () => {
            doNotDisturb.enable(duration);
          },
        }),
      );

      const menu = Menu.buildFromTemplate(
        config.get("doNotDisturb.enabled")
          ? [
              {
                label: t({
                  message: "Disable",
                  comment: "Do Not Disturb menu item that turns Do Not Disturb off",
                }),
                click: () => {
                  doNotDisturb.disable();
                },
              },
              { type: "separator" },
              ...options,
            ]
          : options,
      );

      menu.popup();
    });

    ipc.main.on("gmail.openUserStyles", (_event, openIn) => {
      if (!fs.existsSync(GMAIL_USER_STYLES_PATH)) {
        fs.closeSync(fs.openSync(GMAIL_USER_STYLES_PATH, "w"));
      }

      if (openIn === "editor") {
        shell.openPath(GMAIL_USER_STYLES_PATH);
      } else {
        shell.showItemInFolder(GMAIL_USER_STYLES_PATH);
      }
    });

    ipc.main.on("gmail.navigateTo", (_event, hashLocation) => {
      ipc.renderer.send(
        accounts.getSelectedAccount().instance.gmail.view.webContents,
        "gmail.navigateTo",
        hashLocation,
      );
    });

    ipc.main.on("gmail.closeComposeWindow", (event) => {
      const composeWorkspaceApp = WorkspaceApp.tryFromViewWebContents(event.sender);

      if (!composeWorkspaceApp?.isWindowed) {
        return;
      }

      const composeWindow = composeWorkspaceApp.window;

      const gmailWebContents = composeWorkspaceApp.account.instance.gmail.view.webContents;

      composeWindow.hide();

      const browserWindowId = composeWindow.id;

      clearUndoSendLapseTimeout(browserWindowId);

      // Gmail's undo send period is configurable up to 30 seconds
      undoSendLapseTimeouts.set(
        browserWindowId,
        setTimeout(() => {
          if (!composeWindow.isDestroyed() && !composeWindow.isVisible()) {
            composeWindow.close();
          }
        }, ms("30s")),
      );

      composeWindow.once("closed", () => {
        clearUndoSendLapseTimeout(browserWindowId);

        if (gmailWebContents.isDestroyed()) {
          return;
        }

        ipc.renderer.send(
          gmailWebContents,
          "gmail.dismissMessageSentNotification",
          browserWindowId,
        );
      });

      if (gmailWebContents.isDestroyed()) {
        return;
      }

      ipc.renderer.send(gmailWebContents, "gmail.showMessageSentNotification", browserWindowId);
    });

    ipc.main.on("gmail.undoMessageSent", (_event, browserWindowId) => {
      const composeWindow = BrowserWindow.fromId(browserWindowId);

      if (!composeWindow) {
        return;
      }

      const composeWorkspaceApp = WorkspaceApp.tryFromWebContents(composeWindow.webContents);

      if (!composeWorkspaceApp) {
        return;
      }

      clearUndoSendLapseTimeout(browserWindowId);

      composeWindow.show();

      ipc.renderer.send(composeWorkspaceApp.view.webContents, "gmail.undoMessageSent");
    });

    ipc.main.on("gmail.setUserEmail", (event, email, photo) => {
      const accountInstance = accounts.findInstanceByGmailWebContentsId(event.sender.id);

      if (
        accountInstance &&
        typeof email === "string" &&
        accountInstance.gmail.userEmail !== email
      ) {
        accountInstance.gmail.invalidateMailboxReads();
        accountInstance.gmail.setProfilePhoto();
        accountInstance.gmail.userEmail = email;
        void accountInstance.gmail.fetchInboxFeed({ retryWhileUnchanged: false });
      }
      if (
        accountInstance &&
        event.senderFrame === event.sender.mainFrame &&
        event.senderFrame &&
        URL.parse(event.senderFrame.url)?.origin === "https://mail.google.com" &&
        (typeof photo === "string" || photo === null)
      ) {
        accountInstance.gmail.setProfilePhoto(photo);
      }
    });

    ipc.main.on("downloads.dragFile", async (event, { id, filePath }) => {
      if (await downloads.markDownloadMissingIfGone(id, filePath)) {
        return;
      }

      event.sender.startDrag({
        file: filePath,
        icon: nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABFklEQVR4nN3RzysEcRjH8afd1kE5ODg4ODgoBwcHRSFEfs0f4V9x9D+478HZqCmllB+llFLYqG1mWzTM0jhY6vtWa5GDnhnPiXe9Ls/38Dl8Rf5d3j3LXoPIa8CPEpyXcOElrOQemI+JFu4gs5jVXAOzt6CpNKGcwtzH7Ya1zAPTddA8vLqWjdQx075N1TOOTESgiV/cp/KjY7J9H69l+JOxKmium+6b9cS17qNVztWBkSvQ7KeO6PnLwZN7f7vEqQPDFbAQraEzsBCtwVOwEK2BE7AQrf5jsBCtviOwEK3eQ7AQrZ49sBCt7l2wEK2uHbAQrc5tsBCtUkDUEcBvlAJCdaDos1TwCQtbkItPWNxkUR34c70BSSmcO++HIKkAAAAASUVORK5CYII=",
        ),
      });
    });

    ipc.main.handle("bookmarks.getBookmarks", () => {
      return bookmarks.serialize();
    });

    ipc.main.on("bookmarks.togglePopup", (event, sidebarTop) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (!parentWindow) {
        return;
      }

      bookmarks.togglePopup(parentWindow, Number.isFinite(sidebarTop) ? sidebarTop : undefined);
    });

    /*
     * Only the closes the popup asks for land here — Escape, its close button,
     * opening a bookmark — so the keyboard goes back to the content behind it.
     * A close the popup's own blur caused does not: something else has the
     * focus by then, and it is where the click went.
     */
    ipc.main.on("bookmarks.closePopup", () => {
      bookmarks.popup.close();

      accounts.focusActiveView();
    });

    ipc.main.on("bookmarks.setPopupCloseOnBlurEnabled", (_event, enabled) => {
      bookmarks.popup.closeOnBlurEnabled = enabled;
    });

    ipc.main.on("bookmarks.openBookmark", (_event, accountId, bookmarkId) => {
      bookmarks.open(accountId, bookmarkId);
    });

    ipc.main.on("bookmarks.removeBookmark", (_event, accountId, bookmarkId) => {
      bookmarks.remove(accountId, bookmarkId);
    });

    ipc.main.on("bookmarks.moveBookmark", (_event, accountId, bookmarkId, targetIndex) => {
      bookmarks.move(accountId, bookmarkId, targetIndex);
    });

    ipc.main.handle("extensions.getInstalled", () => {
      return getInstalledExtensions();
    });

    ipc.main.handle("extensions.install", async (_event, extensionId) => {
      if (!isCuratedExtensionId(extensionId)) {
        return { error: t`ggmail doesn't offer this extension.` };
      }

      try {
        await installCuratedExtension(extensionId);

        return {};
      } catch (error) {
        log.error("Failed to install extension", { extensionId, error: serializeError(error) });

        if (error instanceof ExtensionInstallError) {
          return { error: error.message };
        }

        return {
          error: getCouldNotInstallExtensionMessage(error),
        };
      }
    });

    ipc.main.handle("extensions.uninstall", async (_event, extensionId) => {
      if (!isExtensionId(extensionId)) {
        return { error: t`ggmail doesn't know this extension.` };
      }

      try {
        await uninstallCuratedExtension(extensionId);

        return {};
      } catch (error) {
        log.error("Failed to uninstall extension", { extensionId, error: serializeError(error) });

        return {
          error: getCouldNotUninstallExtensionMessage(error),
        };
      }
    });

    ipc.main.handle("extensions.update", async () => {
      return { results: await extensionUpdater.checkForUpdates() };
    });

    ipc.main.handle("extensions.openWindow", (_event, extensionId) => {
      const name = curatedExtensions.find(
        (curatedExtension) => curatedExtension.id === extensionId,
      )?.name;

      return { error: getExtensionWindowError(name, openCuratedExtensionWindow(extensionId)) };
    });

    ipc.main.on("downloads.toggleRecentDownloadHistoryPopup", (event) => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (!parentWindow) {
        return;
      }

      if (downloads.toggleRecentDownloadHistoryPopup(parentWindow)) {
        downloads.checkDownloadHistoryItems(MAX_RECENT_DOWNLOAD_HISTORY_ITEMS);
      }
    });

    ipc.main.on("downloads.closeRecentDownloadHistoryPopup", () => {
      downloads.recentDownloadHistoryPopup.close();

      accounts.focusActiveView();
    });

    ipc.main.on("downloads.setDownloadHistoryPopupOnBlurEnabled", (_event, enabled) => {
      downloads.recentDownloadHistoryPopup.closeOnBlurEnabled = enabled;
    });

    ipc.main.on("downloads.openDownloadHistory", () => {
      downloads.recentDownloadHistoryPopup.close();

      main.navigate("/download-history");

      downloads.checkDownloadHistoryItems();
    });

    this.main.on("gmail.unreadCountChanged", (event, unreadCountString) => {
      const parsedUnreadCountString = unreadCountString
        .split(":")
        .map((count) => Number(count.replace(/\D/g, "")) || 0);

      const unreadCountPreference = config.get("gmail.unreadCountPreference");

      const unreadCount =
        parsedUnreadCountString.length === 2
          ? parsedUnreadCountString[unreadCountPreference === "first-section" ? 0 : 1]
          : parsedUnreadCountString[0];

      if (typeof unreadCount !== "number") {
        log.error(`Received invalid "unreadCount" from renderer:`, unreadCountString);

        return;
      }

      for (const account of accounts.instances.values()) {
        if (event.sender.id === account.gmail.view.webContents.id) {
          account.gmail.setUnreadCount(unreadCount);

          account.gmail.fetchInboxFeed();

          break;
        }
      }
    });

    this.main.on("gmail.openInboxSignIn", (event, accountId) => {
      const renderer = main.windowIfCreated?.webContents;
      if (
        !renderer ||
        event.sender !== renderer ||
        event.senderFrame !== renderer.mainFrame ||
        main.location !== "/unified-inbox"
      ) {
        return;
      }
      const account = accounts.getAccount(accountId);
      account.instance.tabs.activateTab(GMAIL_TAB_ID);
      accounts.selectAccount(accountId);
      main.navigate("/");
      account.instance.gmail.resumeInboxSignIn();
    });

    // Answers with whether the conversation came up, so All Mail can say when
    // it did not instead of leaving the click with no effect.
    this.main.handle("unifiedInbox.openMessage", async (event, accountId, messageId) => {
      if (
        event.sender !== main.window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        main.location !== "/unified-inbox"
      ) {
        return false;
      }

      const instance = accounts.instances.get(accountId);

      if (!instance?.gmail.hasView) {
        return false;
      }

      const previousAccountId = accounts.getSelectedAccount().config.id;

      instance.tabs.activateTab(GMAIL_TAB_ID);
      accounts.selectAccount(accountId);

      try {
        await instance.gmail.navigateToHash("#inbox/" + messageId);
      } catch (error) {
        log.error("Failed to open message from All Mail", { error: serializeError(error) });

        // The titlebar would otherwise name an account the reader never got to.
        if (accounts.getSelectedAccount().config.id === accountId) {
          accounts.selectAccount(previousAccountId);
        }

        return false;
      }

      if (
        main.location === "/unified-inbox" &&
        accounts.getSelectedAccount().config.id === accountId
      ) {
        main.navigate("/");
      }

      return true;
    });

    this.main.handle("gmail.handleMessage", async (_event, accountId, messageId, action) => {
      return (
        (await accounts.instances.get(accountId)?.gmail.handleMessage(messageId, action)) ?? false
      );
    });

    this.main.on("gmail.messageHandled", (_event, requestId, success) => {
      Gmail.resolveMessageHandled(requestId, success);
    });
  }
}

export const ipc = new Ipc();
