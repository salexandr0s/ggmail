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

export const useTabsStore = create<{
  accountsTabs: AccountTabsState[];
}>(() => ({
  accountsTabs: tabsSearchParam ? JSON.parse(tabsSearchParam) : [],
}));

ipc.renderer.on("tabs.changed", (_event, accountsTabs) => {
  useTabsStore.setState({ accountsTabs });
});

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
