import { randomUUID } from "node:crypto";
import {
  APP_TITLEBAR_HEIGHT,
  BASE_SPACING,
  WORKSPACE_SIDEBAR_WIDTH,
} from "@ggmail/shared/constants";
import type { AccountConfig, Bookmark, BookmarkState } from "@ggmail/shared/schemas";
import { clamp } from "@ggmail/shared/utils";
import type { BrowserWindow } from "electron";
import { accounts } from "./accounts";
import { config } from "./config";
import { ipc } from "./ipc";
import { Popup } from "./lib/popup";
import { main } from "./main";

/**
 * The URLs an account has saved. A bookmark keeps the URL, title and app it was
 * created from and never follows what the user browses to afterwards — opening
 * one loads that URL again.
 */
class Bookmarks {
  popup = new Popup();

  togglePopup(parentWindow: BrowserWindow) {
    const open = this.popup.toggle(parentWindow, {
      page: "bookmarks",
      width: BASE_SPACING * 40,
      height: "fill",
      anchor: {
        x: WORKSPACE_SIDEBAR_WIDTH + BASE_SPACING,
        y: APP_TITLEBAR_HEIGHT + BASE_SPACING,
        align: "start",
      },
    });
    if (open) {
      ipc.renderer.send(parentWindow.webContents, "bookmarks.popupOpen", true);
      const contents = this.popup.webContents;
      contents?.once("did-finish-load", () => contents.focus());
      contents?.once("destroyed", () => {
        if (!this.popup.webContents && !parentWindow.isDestroyed()) {
          ipc.renderer.send(parentWindow.webContents, "bookmarks.popupOpen", false);
        }
      });
    }
  }

  getAccountBookmarks(accountId: AccountConfig["id"]): Bookmark[] {
    const accountConfig = config.get("accounts").find((account) => account.id === accountId);

    // Accounts written before bookmarks became a list of their own carry none
    return accountConfig?.workspaceApps.bookmarks ?? [];
  }

  private setAccountBookmarks(accountId: AccountConfig["id"], updatedBookmarks: Bookmark[]) {
    config.set(
      "accounts",
      config.get("accounts").map((accountConfig) =>
        accountConfig.id === accountId
          ? {
              ...accountConfig,
              workspaceApps: {
                ...accountConfig.workspaceApps,
                bookmarks: updatedBookmarks,
              },
            }
          : accountConfig,
      ),
    );
  }

  isBookmarked(accountId: AccountConfig["id"], url: string) {
    return this.getAccountBookmarks(accountId).some((bookmark) => bookmark.url === url);
  }

  toggle(accountId: AccountConfig["id"], { app, url, title }: Omit<Bookmark, "id">) {
    const accountBookmarks = this.getAccountBookmarks(accountId);

    const remainingBookmarks = accountBookmarks.filter((bookmark) => bookmark.url !== url);

    this.setAccountBookmarks(
      accountId,
      remainingBookmarks.length < accountBookmarks.length
        ? remainingBookmarks
        : [...accountBookmarks, { id: randomUUID(), app, url, title }],
    );
  }

  remove(accountId: AccountConfig["id"], bookmarkId: Bookmark["id"]) {
    this.setAccountBookmarks(
      accountId,
      this.getAccountBookmarks(accountId).filter((bookmark) => bookmark.id !== bookmarkId),
    );
  }

  move(accountId: AccountConfig["id"], bookmarkId: Bookmark["id"], targetIndex: number) {
    const accountBookmarks = this.getAccountBookmarks(accountId);

    const movedBookmark = accountBookmarks.find((bookmark) => bookmark.id === bookmarkId);

    if (!movedBookmark) {
      return;
    }

    const remainingBookmarks = accountBookmarks.filter((bookmark) => bookmark.id !== bookmarkId);

    remainingBookmarks.splice(clamp(targetIndex, 0, remainingBookmarks.length), 0, movedBookmark);

    this.setAccountBookmarks(accountId, remainingBookmarks);
  }

  open(accountId: AccountConfig["id"], bookmarkId: Bookmark["id"]) {
    const openedBookmark = this.getAccountBookmarks(accountId).find(
      (bookmark) => bookmark.id === bookmarkId,
    );

    if (!openedBookmark) {
      return;
    }

    const account = accounts.getAccount(accountId);

    const tab =
      account.instance.tabs.openInAppLinksTab(openedBookmark.url) ??
      account.instance.tabs.openUrl(openedBookmark.url);
    if (tab && !tab.isWindowed) {
      main.navigate("/");
    }

    if (account.config.selected) {
      accounts.refreshSelectedAccountView();
    } else {
      accounts.selectAccount(accountId);
    }
  }

  serialize(): BookmarkState[] {
    const selectedAccount = accounts.getSelectedAccount();

    return this.getAccountBookmarks(selectedAccount.config.id).map((bookmark) => ({
      ...bookmark,
      accountId: selectedAccount.config.id,
    }));
  }

  sendChangedToPopup() {
    const popupWebContents = this.popup.webContents;

    if (!popupWebContents) {
      return;
    }

    ipc.renderer.send(popupWebContents, "bookmarks.changed", this.serialize());
  }
}

export const bookmarks = new Bookmarks();
