import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import { APP_TITLEBAR_HEIGHT } from "@ggmail/shared/constants";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountInstances } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { cn } from "@ggmail/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  BookOpenIcon,
  BriefcaseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  DownloadIcon,
  MailSearchIcon,
  MoonIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AppMenuButton } from "@/components/app-menu-button";
import { FindInPage as UiFindInPage } from "@/components/find-in-page";
import {
  Titlebar,
  TitlebarButtonGroup,
  TitlebarDropdownMenu,
  TitlebarDropdownMenuItem,
  TitlebarIconButton,
  TitlebarLeft,
  TitlebarNavigationControls,
  TitlebarRightOverlay,
} from "@/components/titlebar";
import { UnreadCountBadge } from "@/components/unread-count-badge";
import { WorkspaceAppsLauncher } from "@/components/workspace-apps-launcher";
import { useVerticalTabs } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";
import { submitUnifiedSearch } from "@/lib/unified-search";
import { HOST_HANDOVER_FADE_CLASS_NAME } from "@/lib/utils";
import {
  useShellHistory,
  useDownloadActivity,
  useAccountsStore,
  useAppUpdaterStore,
  useFindInPageStore,
} from "../lib/stores";
import { MailViewNavigation } from "./mail-view-navigation";

function BookmarksButton() {
  const { t } = useLingui();

  return (
    <TitlebarIconButton
      onClick={() => {
        ipc.main.send("bookmarks.togglePopup", "titlebar");
      }}
      onMouseEnter={() => {
        ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", false);
      }}
      onMouseLeave={() => {
        ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true);
      }}
      title={t`Show bookmarks`}
    >
      <BookOpenIcon />
    </TitlebarIconButton>
  );
}

function RecentDownloadHistoryButton() {
  const { t } = useLingui();
  const active = useDownloadActivity((state) => state.active);
  if (!active) {
    return null;
  }

  return (
    <TitlebarIconButton
      onClick={() => {
        ipc.main.send("downloads.toggleRecentDownloadHistoryPopup");
      }}
      onMouseEnter={() => {
        ipc.main.send("downloads.setDownloadHistoryPopupOnBlurEnabled", false);
      }}
      onMouseLeave={() => {
        ipc.main.send("downloads.setDownloadHistoryPopupOnBlurEnabled", true);
      }}
      title={t`Show recent download history`}
    >
      <DownloadIcon />
    </TitlebarIconButton>
  );
}

function FindInPage() {
  const isActive = useFindInPageStore((state) => state.isActive);
  const activeMatch = useFindInPageStore((state) => state.activeMatch);
  const totalMatches = useFindInPageStore((state) => state.totalMatches);
  const deactivate = useFindInPageStore((state) => state.deactivate);

  return (
    <UiFindInPage
      isActive={isActive}
      activeMatch={activeMatch}
      totalMatches={totalMatches}
      onFind={(text, options) => {
        ipc.main.send("findInPage", text, options);
      }}
      onClose={deactivate}
    />
  );
}

function DoNotDisturb() {
  const { t } = useLingui();

  const { config } = useConfig();

  if (!config?.["doNotDisturb.enabled"] || !config["doNotDisturb.showTitlebarButton"]) {
    return;
  }

  return (
    <TitlebarIconButton
      onClick={() => {
        ipc.main.send("doNotDisturb.toggle");
      }}
      onContextMenu={(event) => {
        event.preventDefault();

        ipc.main.send("doNotDisturb.showOptions");
      }}
      title={
        config["doNotDisturb.enabled"] ? t`Turn Do Not Disturb off` : t`Turn Do Not Disturb on`
      }
    >
      <MoonIcon
        className={cn({
          "text-violet-600": config["doNotDisturb.enabled"],
        })}
      />
    </TitlebarIconButton>
  );
}

/** How much of what is on screen an arrow click keeps, so the move stays readable. */
const ACCOUNT_ROW_SCROLL_OVERLAP = 40;

/** The shortest an arrow click moves, for a row with barely anything visible. */
const ACCOUNT_ROW_MINIMUM_SCROLL = 80;

/**
 * An arrow is measured rather than assumed, because it is only in the page while
 * the row has somewhere to go that way and is a different width in every font
 * the row is laid out in.
 *
 * The ref carries the same number to the callbacks that have to read it without
 * being rebuilt every time it changes.
 */
function useMeasuredWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0);

  const widthRef = useRef(0);

  useEffect(() => {
    const record = (measured: number) => {
      widthRef.current = measured;

      setWidth(measured);
    };

    if (!element) {
      record(0);

      return;
    }

    const measure = () => {
      record(element.getBoundingClientRect().width);
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [element]);

  return [width, widthRef] as const;
}

/**
 * How much of the row's right end the pinned controls cover, which is not how
 * wide they are. They are pinned to the titlebar's padding box while the row
 * ends at its content box, and on Windows the row stops at the edge of the
 * window's titlebar area while the controls still reach the window's own edge.
 *
 * Measured rather than worked out from the padding: that padding belongs to
 * `Titlebar`, and the titlebar area insets make the difference platform
 * dependent. Nothing is covered rather than a negative amount when the controls
 * clear the row altogether.
 */
function useCoveredRowWidth(rowElement: HTMLElement | null, overlayElement: HTMLElement | null) {
  const [covered, setCovered] = useState(0);

  const coveredRef = useRef(0);

  useEffect(() => {
    const record = (measured: number) => {
      coveredRef.current = measured;

      setCovered(measured);
    };

    if (!rowElement || !overlayElement) {
      record(0);

      return;
    }

    const measure = () => {
      record(
        Math.max(
          0,
          rowElement.getBoundingClientRect().right - overlayElement.getBoundingClientRect().left,
        ),
      );
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);

    resizeObserver.observe(rowElement);

    resizeObserver.observe(overlayElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [rowElement, overlayElement]);

  return [covered, coveredRef] as const;
}

/**
 * The account row's scroll state: which way it can still go, how far an arrow
 * takes it, and how much of its ends the three overlays over them cover.
 *
 * No overlay takes room from the row, so neither scrolling the row nor an arrow
 * coming or going changes the row's width, and the browser never has to clamp a
 * scroll it has already started. The row reserves their widths instead: as
 * scroll padding at both ends, so selecting an account never parks it underneath
 * one of them, and as the least the spacer after the last button can be, so that
 * button can be scrolled clear of the controls on the right.
 */
function useAccountRow(accounts: AccountInstances) {
  const [rowElement, setRowElement] = useState<HTMLDivElement | null>(null);

  const [rightControlsElement, setRightControlsElement] = useState<HTMLDivElement | null>(null);

  const [leftArrowElement, setLeftArrowElement] = useState<HTMLDivElement | null>(null);

  const [rightArrowElement, setRightArrowElement] = useState<HTMLDivElement | null>(null);

  const [coveredRowWidth, coveredRowWidthRef] = useCoveredRowWidth(
    rowElement,
    rightControlsElement,
  );

  const [leftArrowWidth, leftArrowWidthRef] = useMeasuredWidth(leftArrowElement);

  const [rightArrowWidth, rightArrowWidthRef] = useMeasuredWidth(rightArrowElement);

  /*
   * Whether the row has anywhere to go at all, which is all the arrows are
   * mounted on: an arrow that left the page as the row reached an end would have
   * nothing to fade out over. Neither one is in the scroll container, so holding
   * it there costs the row no width.
   */
  const [isOverflowing, setIsOverflowing] = useState(false);

  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const [canScrollRight, setCanScrollRight] = useState(false);

  const leftInsetRef = useRef(0);

  const rightInsetRef = useRef(0);

  const selectedAccountId = accounts.find((account) => account.config.selected)?.config.id;

  /*
   * The account the row owes a scroll to, and how it should get there.
   *
   * The debt outlives the scroll that pays it, because one scroll is never
   * enough. The row is first laid out before its overlays have been measured,
   * so the margin and the scroll padding that reserve their widths are both
   * still zero, and the pushed account list then adds the unread badges and
   * attention icons that widen every button. Each of those moves the row's
   * contents out from under a scroll that has already landed, and an account
   * that was on screen between two of them is off it again after the next.
   *
   * So it is not paid off by the account looking right for a moment. It is
   * cleared by someone scrolling the row themselves, which is the only thing
   * that says they would rather be looking somewhere else.
   */
  const pendingScrollRef = useRef<{
    accountId: string;
    behavior: ScrollBehavior;
  } | null>(null);

  const alignedRowRef = useRef<HTMLDivElement | null>(null);

  const contentObserverRef = useRef<ResizeObserver | null>(null);

  const updateScrollState = useCallback(() => {
    if (!rowElement) {
      return;
    }

    const overflow = rowElement.scrollWidth - rowElement.clientWidth;

    const isScrolledFromStart = rowElement.scrollLeft > 1;

    const isScrolledFromEnd = overflow - rowElement.scrollLeft > 1;

    setIsOverflowing(overflow > 1);

    setCanScrollLeft(isScrolledFromStart);

    setCanScrollRight(isScrolledFromEnd);

    leftInsetRef.current = isScrolledFromStart ? leftArrowWidthRef.current : 0;

    rightInsetRef.current =
      coveredRowWidthRef.current + (isScrolledFromEnd ? rightArrowWidthRef.current : 0);
  }, [rowElement, leftArrowWidthRef, rightArrowWidthRef, coveredRowWidthRef]);

  /**
   * The button of the account the row owes a scroll to, unless it is already
   * clear of both overlays.
   *
   * Clear of them, rather than merely inside the row: they sit over the row's
   * ends rather than beside them, so a button under one of them is inside the
   * row and still not on screen.
   */
  const readButtonToAlign = useCallback(() => {
    const pending = pendingScrollRef.current;

    if (!pending || !rowElement) {
      return null;
    }

    const button = rowElement.querySelector(`[data-account-id="${CSS.escape(pending.accountId)}"]`);

    if (!button) {
      return null;
    }

    const buttonRect = button.getBoundingClientRect();

    const rowRect = rowElement.getBoundingClientRect();

    const isInTheClear =
      buttonRect.left >= rowRect.left + leftInsetRef.current - 1 &&
      buttonRect.right <= rowRect.right - rightInsetRef.current + 1;

    return isInTheClear ? null : { button, behavior: pending.behavior };
  }, [rowElement]);

  const alignRow = useCallback(() => {
    updateScrollState();

    const pending = readButtonToAlign();

    pending?.button.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: pending.behavior,
    });
  }, [updateScrollState, readButtonToAlign]);

  useEffect(() => {
    if (!rowElement) {
      setIsOverflowing(false);

      setCanScrollLeft(false);

      setCanScrollRight(false);

      return;
    }

    alignRow();

    rowElement.addEventListener("scroll", updateScrollState);

    const resizeObserver = new ResizeObserver(alignRow);

    contentObserverRef.current = resizeObserver;

    resizeObserver.observe(rowElement);

    let isObserving = true;

    // The row is laid out in a fallback font first, and every button in it is a
    // different width once Inter arrives.
    document.fonts.ready.then(() => {
      if (isObserving) {
        alignRow();
      }
    });

    return () => {
      isObserving = false;

      contentObserverRef.current = null;

      rowElement.removeEventListener("scroll", updateScrollState);

      resizeObserver.disconnect();
    };
  }, [rowElement, updateScrollState, alignRow]);

  useEffect(() => {
    if (!rowElement) {
      return;
    }

    const forgetPendingScroll = () => {
      pendingScrollRef.current = null;
    };

    // Registered here rather than as a React `onWheel`, because turning a
    // vertical wheel into a horizontal scroll takes `preventDefault`, and React
    // attaches its wheel listener passively.
    const handleWheel = (event: WheelEvent) => {
      forgetPendingScroll();

      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      rowElement.scrollLeft += event.deltaY;

      event.preventDefault();
    };

    /*
     * The other two ways the row moves under someone, neither of which is a
     * wheel: tabbing between the account buttons, which Chromium scrolls the
     * focused one into view for, and a touch pan on Windows. Left standing, the
     * alignment would take the row back off them at the next pushed account
     * list.
     */
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        forgetPendingScroll();
      }
    };

    rowElement.addEventListener("wheel", handleWheel, { passive: false });

    rowElement.addEventListener("focusin", forgetPendingScroll);

    rowElement.addEventListener("pointerdown", handlePointerDown);

    return () => {
      rowElement.removeEventListener("wheel", handleWheel);

      rowElement.removeEventListener("focusin", forgetPendingScroll);

      rowElement.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [rowElement]);

  // Keyed on the selection rather than called from the click handler, because a
  // menu item, an accelerator, a mouse button and Select Next Account all select
  // an account without the row hearing anything.
  useEffect(() => {
    if (!rowElement || !selectedAccountId) {
      return;
    }

    // Instant the first time a row is laid out, so an account chosen before
    // ggmail was on screen is simply already there; smooth for a selection
    // someone watched happen. A row coming back, such as on the way out of
    // settings, is a first time again.
    const isFirstLayout = alignedRowRef.current !== rowElement;

    alignedRowRef.current = rowElement;

    pendingScrollRef.current = {
      accountId: selectedAccountId,
      behavior: isFirstLayout ? "instant" : "smooth",
    };

    alignRow();
  }, [rowElement, selectedAccountId, alignRow]);

  /*
   * The row's own size never changes when its contents do, so watching the row
   * alone would have it measure itself once, against a layout that is not
   * finished, and never look again: a button is a different width once its
   * account has an unread badge or an attention icon, and different again once
   * the font it is set in has loaded. Each child is watched as well, and a row
   * laid out afresh — on the way back from settings, say — settles into the
   * right answer rather than keeping whatever it read first.
   */
  useEffect(() => {
    for (const child of Array.from(rowElement?.children ?? [])) {
      contentObserverRef.current?.observe(child);
    }

    alignRow();
  }, [alignRow, rowElement, accounts, leftArrowWidth, rightArrowWidth, coveredRowWidth]);

  const scrollBy = (direction: 1 | -1) => {
    if (!rowElement) {
      return;
    }

    pendingScrollRef.current = null;

    const distance = Math.max(
      ACCOUNT_ROW_MINIMUM_SCROLL,
      rowElement.clientWidth -
        coveredRowWidth -
        (canScrollLeft ? leftArrowWidth : 0) -
        (canScrollRight ? rightArrowWidth : 0) -
        ACCOUNT_ROW_SCROLL_OVERLAP,
    );

    rowElement.scrollBy({ left: direction * distance });
  };

  return {
    setRowElement,
    setRightControlsElement,
    setLeftArrowElement,
    setRightArrowElement,
    coveredRowWidth,
    leftArrowWidth,
    rightArrowWidth,
    isOverflowing,
    canScrollLeft,
    canScrollRight,
    scrollBy,
  };
}

export function AppTitlebar({
  showAssistant,
  toggleAssistant,
}: {
  showAssistant: boolean;
  toggleAssistant: () => void;
}) {
  const { t } = useLingui();

  const history = useShellHistory();
  const accounts = useAccountsStore((state) => state.accounts);

  const accountRow = useAccountRow(accounts);

  const { tabs: selectedAccountTabs, width: verticalTabsWidth } = useVerticalTabs();

  const activeTab = selectedAccountTabs.find((tab) => tab.active);

  const [location] = useLocation();

  const appUpdateVersion = useAppUpdaterStore((state) => state.version);
  const dismissAppUpdate = useAppUpdaterStore((state) => state.dismiss);
  const unverifiedAppUpdateVersion = useAppUpdaterStore((state) => state.unverifiedVersion);

  const { config } = useConfig();

  const [isGmailSavedSearchesOpen, setIsGmailSavedSearchesOpen] = useState(false);

  const [isAppUpdateDetailsOpen, setIsAppUpdateDetailsOpen] = useState(false);

  const [isUnverifiedAppUpdateDetailsOpen, setIsUnverifiedAppUpdateDetailsOpen] = useState(false);

  if (!config || !accounts) {
    return;
  }

  const isAccountLocation = location === "/";

  const isUnifiedInboxLocation = location === "/unified-inbox";
  const isAttachmentsLocation = location === "/attachments";
  const waiting = location === "/waiting";
  const isMailLibraryLocation = isUnifiedInboxLocation || isAttachmentsLocation || waiting;

  const shouldShowWorkspaceAppsLauncher = config["workspaceApps.launcherApps"].length > 0;

  const shouldShowBookmarksButton = config["workspaceApps.showBookmarksButton"];

  // On `auto` the vertical tabs strip hosts the launcher and the bookmarks
  // button whenever it is there, so that opening another app or a bookmarked
  // page stays in the same place as switching between tabs. `sidebar` keeps the
  // strip there for them, so the width is never 0; `titlebar` keeps them here
  // whatever the strip does.
  const areLauncherAndBookmarksPlacementedByVerticalTabs =
    config["workspaceApps.launcherAndBookmarksPlacement"] !== "titlebar" && verticalTabsWidth > 0;

  const shouldShowUnifiedInboxButton = config["unifiedInbox.enabled"] && accounts.length > 1;

  const shouldShowSavedSearchesButton = config["gmail.savedSearches"].length > 0;

  const isWorkspaceAppTabActive = Boolean(activeTab?.app && activeTab.app !== "gmail");

  const shouldShowOutOfOfficeButton =
    accounts.length === 1 &&
    Boolean(accounts[0]?.gmail.outOfOffice) &&
    config["gmail.hideOutOfOfficeBanner"];

  const renderAccounts = () => {
    if (accounts.length === 1) {
      return;
    }

    return accounts.map((account) => (
      <Button
        key={account.config.id}
        data-account-id={account.config.id}
        aria-pressed={account.config.selected && isAccountLocation}
        variant={account.config.selected && isAccountLocation ? "secondary" : "ghost"}
        size="sm"
        tabIndex={-1}
        className="draggable-none"
        onClick={() => {
          ipc.main.send("accounts.selectAccount", account.config.id, true);
        }}
      >
        {account.config.color && (
          <div
            className={cn("size-2 rounded-full", accountColorsMap[account.config.color].className)}
          />
        )}
        {account.gmail.outOfOffice && <BriefcaseIcon />}
        {getAccountLabel(account.config.label)}
        {account.config.logo && (
          <img
            src={account.config.logo}
            alt=""
            draggable={false}
            className="size-4 shrink-0 object-contain"
          />
        )}
        {account.gmail.attentionRequired && <CircleAlertIcon className="text-yellow-400" />}
        {!account.gmail.attentionRequired &&
        config["accounts.unreadBadge"] &&
        account.gmail.unreadCount ? (
          <UnreadCountBadge unreadCount={account.gmail.unreadCount} />
        ) : null}
      </Button>
    ));
  };

  const renderContent = () => {
    if (isUnverifiedAppUpdateDetailsOpen && unverifiedAppUpdateVersion) {
      const version = unverifiedAppUpdateVersion;

      return (
        <div className="flex flex-1 items-center justify-center gap-4 text-xs">
          <div>
            <Trans>ggmail {version} couldn't be verified, so it wasn't installed</Trans>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.openReleasePage");
              }}
            >
              <Trans comment="Titlebar button that opens the release page of an update ggmail couldn't verify, to download it from there">
                Download
              </Trans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                setIsUnverifiedAppUpdateDetailsOpen(false);
              }}
            >
              <Trans comment="Titlebar button that closes the details of an update ggmail couldn't verify">
                Close
              </Trans>
            </Button>
          </div>
        </div>
      );
    }

    if (isAppUpdateDetailsOpen && appUpdateVersion) {
      const version = appUpdateVersion;

      return (
        <div className="flex flex-1 items-center justify-center gap-4 text-xs">
          <div>
            <Trans>ggmail {version} is available and ready to install</Trans>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.quitAndInstall");
              }}
            >
              <Trans comment="Titlebar button that restarts ggmail to install a downloaded update">
                Restart now
              </Trans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                dismissAppUpdate();
                setIsAppUpdateDetailsOpen(false);
              }}
            >
              <Trans comment="Titlebar button that puts off installing a downloaded update">
                Later
              </Trans>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                ipc.main.send("appUpdater.openVersionHistory");
              }}
            >
              <Trans comment="Titlebar button beside a downloaded update that opens the version history">
                What's new
              </Trans>
            </Button>
          </div>
        </div>
      );
    }

    const accountButtons = renderAccounts();

    return (
      <>
        <TitlebarLeft>
          <TitlebarButtonGroup className="shrink-0">
            <TitlebarNavigationControls
              canGoBack={history.canGoBack}
              canGoForward={history.canGoForward}
              isLoading={Boolean(activeTab?.loading)}
              disabled={!isAccountLocation}
              onGoBack={() => {
                ipc.main.send("workspaceApp.goBack");
              }}
              onGoForward={() => {
                ipc.main.send("workspaceApp.goForward");
              }}
              onReload={() => {
                ipc.main.send("workspaceApp.reload");
              }}
              onStop={() => {
                ipc.main.send("workspaceApp.stop");
              }}
            />
          </TitlebarButtonGroup>
          <MailViewNavigation location={location} unified={shouldShowUnifiedInboxButton} />
          {(shouldShowOutOfOfficeButton || accountButtons) && (
            <TitlebarButtonGroup className="hidden min-w-0 flex-1 before:me-1 before:h-4 before:w-px before:shrink-0 before:bg-border sm:flex">
              {shouldShowOutOfOfficeButton && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tabIndex={-1}
                  className="draggable-none"
                  title={t`Open Gmail settings to turn off out of office`}
                  onClick={() => {
                    ipc.main.send("gmail.navigateTo", "settings");
                  }}
                >
                  <BriefcaseIcon />
                </Button>
              )}
              {accountButtons && (
                <div className="relative flex min-w-0 flex-1 items-center">
                  {/*
                   * Not a drag region, unlike the rest of the titlebar. macOS
                   * hands a drag region's wheel events to the window manager
                   * before the page sees them, which stopped a trackpad dead
                   * whenever the pointer sat in one of the gaps between the
                   * buttons. The spacer below gives the window back the part of
                   * the row worth dragging.
                   */}
                  <div
                    ref={accountRow.setRowElement}
                    className="flex min-w-0 flex-1 scrollbar-none items-center gap-1 overflow-x-auto overflow-y-hidden draggable-none motion-safe:scroll-smooth"
                    style={{
                      height: APP_TITLEBAR_HEIGHT,
                      scrollPaddingLeft: accountRow.canScrollLeft ? accountRow.leftArrowWidth : 0,
                      scrollPaddingRight:
                        accountRow.coveredRowWidth +
                        (accountRow.canScrollRight ? accountRow.rightArrowWidth : 0),
                    }}
                  >
                    {accountButtons}
                    {/*
                     * The space after the last account: a drag region again, and
                     * the room the row scrolls the last button clear of the
                     * controls that sit over its end with.
                     */}
                    <div
                      className="h-full flex-1 draggable"
                      style={{ minWidth: accountRow.coveredRowWidth }}
                    />
                  </div>
                  {/*
                   * Over the row rather than beside it, like the controls at the
                   * other end: an arrow that took room from the row would change
                   * the row's width by appearing, after the browser had already
                   * chosen where the scroll that made it appear stops. The fade
                   * beside it is a pseudo-element of the same wrapper, so it goes
                   * with it.
                   */}
                  {accountRow.isOverflowing && (
                    <div
                      ref={accountRow.setLeftArrowElement}
                      className={cn(
                        "absolute top-0 left-0 flex items-center bg-background duration-150 after:pointer-events-none after:absolute after:top-0 after:bottom-0 after:left-full after:w-6 after:bg-linear-to-r after:from-background after:to-transparent motion-safe:transition-opacity",
                        !accountRow.canScrollLeft && "pointer-events-none opacity-0",
                      )}
                      style={{ height: APP_TITLEBAR_HEIGHT }}
                    >
                      <TitlebarIconButton
                        className="text-muted-foreground"
                        title={t`Scroll accounts left`}
                        disabled={!accountRow.canScrollLeft}
                        aria-hidden={!accountRow.canScrollLeft || undefined}
                        onClick={() => {
                          accountRow.scrollBy(-1);
                        }}
                      >
                        <ChevronLeftIcon />
                      </TitlebarIconButton>
                    </div>
                  )}
                  {/*
                   * Held off the right edge by however much of the row the
                   * controls pinned there cover, so that it ends exactly where
                   * they begin and the row has no seam to slide through.
                   */}
                  {accountRow.isOverflowing && (
                    <div
                      ref={accountRow.setRightArrowElement}
                      className={cn(
                        "absolute top-0 flex items-center bg-background duration-150 before:pointer-events-none before:absolute before:top-0 before:right-full before:bottom-0 before:w-6 before:bg-linear-to-l before:from-background before:to-transparent motion-safe:transition-opacity",
                        !accountRow.canScrollRight && "pointer-events-none opacity-0",
                      )}
                      style={{
                        height: APP_TITLEBAR_HEIGHT,
                        right: accountRow.coveredRowWidth,
                      }}
                    >
                      <TitlebarIconButton
                        className="text-muted-foreground"
                        title={t`Scroll accounts right`}
                        disabled={!accountRow.canScrollRight}
                        aria-hidden={!accountRow.canScrollRight || undefined}
                        onClick={() => {
                          accountRow.scrollBy(1);
                        }}
                      >
                        <ChevronRightIcon />
                      </TitlebarIconButton>
                    </div>
                  )}
                </div>
              )}
            </TitlebarButtonGroup>
          )}
        </TitlebarLeft>
        <TitlebarRightOverlay ref={accountRow.setRightControlsElement}>
          <div className="flex items-center gap-2">
            <FindInPage />
            {/*
             * The group goes rather than emptying out, because an empty group
             * would still spend the gap between the controls either side of it.
             */}
            {(shouldShowWorkspaceAppsLauncher || shouldShowBookmarksButton) && (
              <TitlebarButtonGroup
                className={cn(
                  HOST_HANDOVER_FADE_CLASS_NAME,
                  areLauncherAndBookmarksPlacementedByVerticalTabs && "hidden opacity-0",
                )}
              >
                {shouldShowWorkspaceAppsLauncher && (
                  <WorkspaceAppsLauncher
                    launcherApps={config["workspaceApps.launcherApps"]}
                    display={config["workspaceApps.launcherDisplay"]}
                    disabled={isMailLibraryLocation}
                  />
                )}
                {shouldShowBookmarksButton && <BookmarksButton />}
              </TitlebarButtonGroup>
            )}
            {shouldShowSavedSearchesButton && (
              <TitlebarDropdownMenu
                title={t`Show saved searches`}
                icon={<MailSearchIcon />}
                side="left"
                disabled={
                  waiting ||
                  isAttachmentsLocation ||
                  (!isUnifiedInboxLocation && isWorkspaceAppTabActive)
                }
                isOpen={isGmailSavedSearchesOpen}
                onOpenChange={setIsGmailSavedSearchesOpen}
              >
                {config["gmail.savedSearches"].map((savedSearch) => (
                  <TitlebarDropdownMenuItem
                    key={savedSearch.id}
                    onClick={() => {
                      if (isUnifiedInboxLocation) {
                        submitUnifiedSearch(savedSearch.query);
                      } else {
                        ipc.main.send("gmail.search", savedSearch.query);
                      }
                    }}
                  >
                    {savedSearch.label}
                  </TitlebarDropdownMenuItem>
                ))}
              </TitlebarDropdownMenu>
            )}
            {isAccountLocation && (
              <TitlebarIconButton
                id="mail-assistant-toggle"
                tabIndex={0}
                onClick={toggleAssistant}
                aria-expanded={showAssistant}
                aria-controls={showAssistant ? "mail-assistant" : undefined}
                aria-label={t`Mail assistant`}
                title={t`Mail assistant`}
                className={cn(showAssistant && "bg-muted text-foreground")}
              >
                <SparklesIcon />
              </TitlebarIconButton>
            )}
            <RecentDownloadHistoryButton />
            <DoNotDisturb />
          </div>
          {unverifiedAppUpdateVersion && (
            <Button
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                setIsUnverifiedAppUpdateDetailsOpen(true);
              }}
            >
              <CircleAlertIcon />{" "}
              <Trans comment="Titlebar button that shows the details of an update ggmail downloaded but couldn't verify">
                Update not verified
              </Trans>
            </Button>
          )}
          {appUpdateVersion && (
            <Button
              size="sm"
              tabIndex={-1}
              className="draggable-none"
              onClick={() => {
                setIsAppUpdateDetailsOpen(true);
              }}
            >
              <Trans comment="Titlebar button that shows the details of a downloaded update, ready to install">
                Update available
              </Trans>
            </Button>
          )}
          <AppMenuButton />
        </TitlebarRightOverlay>
      </>
    );
  };

  return <Titlebar>{renderContent()}</Titlebar>;
}
