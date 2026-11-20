import type { FileKind } from "@ggmail/shared/attachments";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { useLingui } from "@lingui/react/macro";
import { PaperclipIcon } from "lucide-react";
import { AccountFilters, FilterButton } from "@/components/account-filters";
import { kindIcons } from "./files";

export type KindFilter = FileKind | "all";
export type KindOption = { value: KindFilter; label: string };

export function LibraryFilters({
  kinds,
  kind,
  counts,
  onKind,
  accounts,
  chosen,
  onAccount,
}: {
  kinds: KindOption[];
  kind: KindFilter;
  counts: Record<KindFilter, number>;
  onKind: (value: KindFilter) => void;
  accounts: AccountConfig[];
  chosen: string;
  onAccount: (id: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="space-y-6">
      <div role="group" aria-label={t`File type`}>
        <h2 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">{t`File type`}</h2>
        {kinds.map(({ value, label }) => {
          const Icon = value === "all" ? PaperclipIcon : kindIcons[value];
          return (
            <FilterButton
              key={value}
              label={label}
              active={kind === value}
              icon={<Icon />}
              count={counts[value]}
              onClick={() => onKind(value)}
            />
          );
        })}
      </div>
      {accounts.length > 1 && (
        <AccountFilters accounts={accounts} chosen={chosen} onAccount={onAccount} />
      )}
    </div>
  );
}
