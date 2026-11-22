import { getAccountLabel } from "@ggmail/shared/accounts";
import type { AccountConfig } from "@ggmail/shared/schemas";
import type { ReactNode } from "react";
import { AccountAvatar } from "./account-avatar";
import { SettingsTitle } from "./settings";

export function MailPageTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <SettingsTitle className="mail-page-title">
      {icon}
      <span>{children}</span>
    </SettingsTitle>
  );
}

export function MailboxSection({
  account,
  hidden,
  actions,
  children,
}: {
  account: AccountConfig;
  hidden?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const label = getAccountLabel(account.label);
  return (
    <section aria-label={label} hidden={hidden} className="mailbox-section">
      <header className="mailbox-section-header">
        <h2>
          <AccountAvatar account={account} />
          <span>{label}</span>
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}
