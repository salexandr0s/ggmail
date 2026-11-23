import { getAccountLabel } from "@ggmail/shared/accounts";
import type { GmailInboxMessage } from "@ggmail/shared/gmail";
import { ms } from "@ggmail/shared/ms";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { unifiedInboxOptions } from "./react-query";
import { useAccountsStore, useTabsStore } from "./stores";

export function useMouseAccountSwitching() {
  useEffect(() => {
    const handleMouseBackAndForward = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) {
        ipc.main.send(
          event.button === 3 ? "accounts.selectPreviousAccount" : "accounts.selectNextAccount",
        );
      }
    };

    document.addEventListener("mousedown", handleMouseBackAndForward);

    return () => {
      document.removeEventListener("mousedown", handleMouseBackAndForward);
    };
  }, []);
}

export function useCloseOnWindowBlur(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowBlur = () => {
      onClose();
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isOpen, onClose]);
}

/** Every tab of the selected account, before the vertical tabs strip narrows them down. */
export function useSelectedAccountTabs() {
  const accounts = useAccountsStore((state) => state.accounts);

  const accountsTabs = useTabsStore((state) => state.accountsTabs);

  const selectedAccount = accounts.find((account) => account.config.selected);

  const tabs =
    accountsTabs.find((accountTabs) => accountTabs.accountId === selectedAccount?.config.id)
      ?.tabs ?? [];

  return { selectedAccount, tabs };
}

export type UnifiedInboxMessage = GmailInboxMessage & {
  account: Pick<AccountConfig, "id" | "label" | "color">;
};

export function useUnifiedInbox() {
  const { data } = useQuery(unifiedInboxOptions);

  const accounts = useAccountsStore((state) => state.accounts);

  const inboxes = useMemo(
    () =>
      accounts
        .filter(({ config }) => config.gmail.unifiedInbox)
        .map(({ config, gmail }) => ({
          account: { id: config.id, label: getAccountLabel(config.label), color: config.color },
          status: gmail.attentionRequired
            ? ("signIn" as const)
            : (data[config.id]?.status ?? "syncing"),
          messages: gmail.attentionRequired ? [] : (data[config.id]?.messages ?? []),
        })),
    [accounts, data],
  );

  const messages = useMemo<UnifiedInboxMessage[]>(
    () =>
      inboxes
        .flatMap(({ account, messages }) => messages.map((mail) => ({ ...mail, account })))
        .sort((a, b) => b.receivedAt - a.receivedAt),
    [inboxes],
  );

  return { messages, inboxes };
}

export function useCopied() {
  const [copied, setCopied] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const markCopied = () => {
    setCopied(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, ms("2s"));
  };

  return { copied, markCopied };
}
