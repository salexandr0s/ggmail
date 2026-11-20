import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { cn } from "@ggmail/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import { LayersIcon, MailIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

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
      className="h-8 w-full justify-start gap-2.5 rounded-md px-2 text-[13px] font-normal text-muted-foreground aria-pressed:bg-foreground/8 aria-pressed:font-medium aria-pressed:text-foreground"
    >
      {icon}
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span
          id={countId}
          className="ml-auto pl-1 text-[11px] font-normal text-muted-foreground tabular-nums"
        >
          {count}
        </span>
      )}
    </Button>
  );
}

export function AccountFilters({
  accounts,
  chosen,
  onAccount,
}: {
  accounts: AccountConfig[];
  chosen: string;
  onAccount: (id: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div role="group" aria-label={t`Account`}>
      <h2 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">{t`Account`}</h2>
      <FilterButton
        label={t`All accounts`}
        active={!chosen}
        icon={<LayersIcon />}
        onClick={() => onAccount("")}
      />
      {accounts.map((a) => (
        <FilterButton
          key={a.id}
          label={getAccountLabel(a.label)}
          active={chosen === a.id}
          icon={
            a.color ? (
              <span className="grid size-3.5 shrink-0 place-items-center">
                <span className={cn("size-2 rounded-full", accountColorsMap[a.color].className)} />
              </span>
            ) : (
              <MailIcon />
            )
          }
          onClick={() => onAccount(a.id)}
        />
      ))}
    </div>
  );
}
