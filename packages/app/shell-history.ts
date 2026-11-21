import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import { accounts } from "./accounts";
import { ipc } from "./ipc";
import { main } from "./main";

type MailVisit = {
  accountId: string;
  tabId: string;
  contentsId: number;
  generation: number;
  index: number;
};
type Visit = string | MailVisit;

function currentVisit(): Visit | undefined {
  if (main.location !== "/") {
    return main.location;
  }
  const account = accounts.getAccounts().find(({ config }) => config.selected);
  if (!account || !account.instance.gmail.hasView) {
    return;
  }
  const { activeTab } = account.instance.tabs;
  const contents = activeTab.view?.webContents;
  if (!contents || contents.isDestroyed()) {
    return;
  }
  return {
    accountId: account.config.id,
    tabId: activeTab.id,
    contentsId: contents.id,
    generation: activeTab.id === GMAIL_TAB_ID ? account.instance.gmail.mailboxGeneration : 0,
    index: contents.navigationHistory.getActiveIndex(),
  };
}

function sameVisit(a: Visit | undefined, b: Visit) {
  if (typeof a === "string" || typeof b === "string") {
    return a === b;
  }
  return a?.contentsId === b.contentsId && a.index === b.index && a.generation === b.generation;
}

function resolveMail(visit: MailVisit) {
  const account = accounts.instances.get(visit.accountId);
  if (!account || !account.gmail.hasView) {
    return;
  }
  if (visit.tabId === GMAIL_TAB_ID && account.gmail.mailboxGeneration !== visit.generation) {
    return;
  }
  const tab = account.tabs.getTab(visit.tabId);
  const contents = tab?.view?.webContents;
  if (
    contents &&
    !contents.isDestroyed() &&
    contents.id === visit.contentsId &&
    visit.index >= 0 &&
    visit.index < contents.navigationHistory.length()
  ) {
    return { account, contents };
  }
}

// Chromium owns each tab's history. Keep only references to its entries and
// interleave the renderer pages and account switches in the order they were seen.
class ShellHistory {
  // A library can open before the first Gmail navigation commits. Give it a
  // way back immediately, then fill in the mailbox entry when Chromium is ready.
  private visits: Visit[] = ["/"];
  private cursor = 0;
  private restoring?: MailVisit;
  private restoringSurface = false;

  record() {
    if (this.restoringSurface) {
      return;
    }
    const visit = currentVisit();
    if (visit === undefined || (typeof visit !== "string" && visit.index < 0)) {
      return;
    }
    if (this.restoring) {
      if (
        typeof visit !== "string" &&
        visit.contentsId === this.restoring.contentsId &&
        visit.index !== this.restoring.index
      ) {
        return;
      }
      this.restoring = undefined;
    }
    if (this.visits[this.cursor] === "/" && typeof visit !== "string") {
      this.visits[this.cursor] = visit;
    } else if (!sameVisit(this.visits[this.cursor], visit)) {
      this.visits.splice(this.cursor + 1, Infinity, visit);
      if (this.visits.length > 256) {
        this.visits.shift();
      }
      this.cursor = this.visits.length - 1;
    }
    this.publish();
  }

  private destination(step: -1 | 1) {
    for (let i = this.cursor + step; i >= 0 && i < this.visits.length; i += step) {
      const visit = this.visits[i];
      if (
        visit !== undefined &&
        (typeof visit === "string" || resolveMail(visit)) &&
        !sameVisit(this.visits[this.cursor], visit)
      ) {
        return i;
      }
    }
    // The original mailbox may have signed out or closed while a library was
    // visible. Returning to the shell is still possible without reviving it.
    if (step === -1 && this.cursor > 0 && main.location !== "/") {
      return 0;
    }
    return -1;
  }

  get state() {
    return { canGoBack: this.destination(-1) >= 0, canGoForward: this.destination(1) >= 0 };
  }

  private lastState?: { canGoBack: boolean; canGoForward: boolean };

  private publish() {
    const window = main.windowIfCreated;
    if (!window || window.isDestroyed()) {
      return;
    }
    const state = this.state;
    if (
      state.canGoBack === this.lastState?.canGoBack &&
      state.canGoForward === this.lastState.canGoForward
    ) {
      return;
    }
    this.lastState = state;
    ipc.renderer.send(window.webContents, "shell.historyChanged", state);
  }

  move(step: -1 | 1) {
    this.record();
    const index = this.destination(step);
    const visit = this.visits[index];
    if (visit === undefined) {
      return;
    }
    this.cursor = index;
    this.restoring = undefined;
    this.restoringSurface = true;
    try {
      if (typeof visit === "string") {
        main.navigate(visit);
      } else {
        const target = resolveMail(visit);
        if (!target) {
          this.visits[index] = "/";
          main.navigate("/");
          return;
        }
        const { account, contents } = target;
        if (account.tabs.activeTab.id !== visit.tabId) {
          account.tabs.activateTab(visit.tabId);
        }
        if (accounts.getSelectedAccount().config.id !== visit.accountId) {
          accounts.selectAccount(visit.accountId);
        }
        if (main.location !== "/") {
          main.navigate("/");
        } else {
          accounts.refreshSelectedAccountView();
        }
        if (contents.navigationHistory.getActiveIndex() !== visit.index) {
          this.restoring = visit;
          contents.navigationHistory.goToIndex(visit.index);
        }
      }
    } finally {
      this.restoringSurface = false;
      this.publish();
    }
  }
}

export const shellHistory = new ShellHistory();
