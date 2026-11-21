import { getAccountLabel } from "@ggmail/shared/accounts";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { useLingui } from "@lingui/react/macro";
import { InboxIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { AccountAvatar } from "./account-avatar";

export function FilterButton({
  label,
  active,
  icon,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  count?: number;
  onClick: () => void;
}) {
  const countId = useId();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-describedby={count !== undefined ? countId : undefined}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className="mail-nav-row"
    >
      {icon}
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span id={countId} className="mail-nav-count">
          {count}
        </span>
      )}
    </Button>
  );
}

export function AccountFilters({
  accounts,
  chosen,
  counts,
  label,
  onAccount,
}: {
  accounts: AccountConfig[];
  chosen: string | readonly string[];
  label?: string;
  counts?: { total: number; values: Map<string, number> };
  onAccount: (id: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div role="group" aria-label={label ?? t`Account`}>
      <h2 className="mail-nav-heading">{label ?? t`Account`}</h2>
      <FilterButton
        label={t`All accounts`}
        active={!chosen.length}
        count={counts?.total}
        icon={<InboxIcon />}
        onClick={() => onAccount("")}
      />
      {accounts.map((a) => (
        <FilterButton
          key={a.id}
          label={getAccountLabel(a.label)}
          active={typeof chosen === "string" ? chosen === a.id : chosen.includes(a.id)}
          count={counts && (counts.values.get(a.id) ?? 0)}
          icon={<AccountAvatar account={a} />}
          onClick={() => onAccount(a.id)}
        />
      ))}
    </div>
  );
}
