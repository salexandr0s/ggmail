import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountInstances } from "@ggmail/shared/schemas";
import type { AccountTabsState } from "@ggmail/shared/tabs";
import { create } from "zustand";
import { accountsSearchParam, tabsSearchParam } from "./search-params";

export const useAccountsStore = create<{
  accounts: AccountInstances;
  isAddAccountDialogOpen: boolean;
  setIsAddAccountDialogOpen: (isOpen: boolean) => void;
}>((set) => ({
  accounts: accountsSearchParam ? JSON.parse(accountsSearchParam) : [],
  isAddAccountDialogOpen: false,
  setIsAddAccountDialogOpen: (isOpen) => {
    set({ isAddAccountDialogOpen: isOpen });
  },
}));

ipc.renderer.on("accounts.changed", (_event, accounts) => {
  useAccountsStore.setState({ accounts });
});

export const useMailboxRevisions = create(() => ({}) as Record<string, number>);
ipc.renderer.on("gmail.mailboxChanged", (_event, id) => {
  useMailboxRevisions.setState((state) => ({ [id]: (state[id] ?? 0) + 1 }));
});

export const useTabsStore = create<{
  accountsTabs: AccountTabsState[];
}>(() => ({
  accountsTabs: tabsSearchParam ? JSON.parse(tabsSearchParam) : [],
}));

ipc.renderer.on("tabs.changed", (_event, accountsTabs) => {
  useTabsStore.setState({ accountsTabs });
});

export const useShellHistory = create(() => ({ canGoBack: false, canGoForward: false }));
export const useDownloadActivity = create(() => ({ active: false }));
// Register before reading the initial state so a reload during a transfer or
// history traversal also receives subsequent changes.
ipc.renderer.on("shell.historyChanged", (_event, state) => useShellHistory.setState(state));
ipc.renderer.on("downloads.activityChanged", (_event, active) =>
  useDownloadActivity.setState({ active }),
);
// oxlint-disable-next-line lingui/no-unlocalized-strings -- Internal renderer filename.
if (window.location.pathname.endsWith("/main.html")) {
  void ipc.main.invoke("shell.getHistory").then((state) => useShellHistory.setState(state));
  void ipc.main
    .invoke("downloads.isActive")
    .then((active) => useDownloadActivity.setState({ active }));
}

export const useFindInPageStore = create<{
  isActive: boolean;
  deactivate: () => void;
  activeMatch: number;
  totalMatches: number;
}>((set) => ({
  isActive: false,
  deactivate: () => {
    ipc.main.send("findInPage", null);

    set({ isActive: false });
  },
  activeMatch: 0,
  totalMatches: 0,
}));

ipc.renderer.on("findInPage.activate", () => {
  useFindInPageStore.setState(() => ({
    isActive: true,
  }));
});

ipc.renderer.on("findInPage.result", (_event, { activeMatch, totalMatches }) => {
  useFindInPageStore.setState(() => ({
    activeMatch,
    totalMatches,
  }));
});

export const useAppUpdaterStore = create<{
  version: string | null;
  unverifiedVersion: string | null;
  dismiss: () => void;
}>((set) => ({
  version: null,
  unverifiedVersion: null,
  dismiss: () => {
    set({ version: null });
  },
}));

ipc.renderer.on("appUpdater.updateAvailable", (_event, version) => {
  useAppUpdaterStore.setState({ version });
});

ipc.renderer.on("appUpdater.updateNotVerified", (_event, version) => {
  useAppUpdaterStore.setState({ unverifiedVersion: version });
});
