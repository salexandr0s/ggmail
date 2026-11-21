import { accountColorsMap } from "@ggmail/shared/accounts";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Badge } from "@ggmail/ui/components/badge";
import { cn } from "@ggmail/ui/lib/utils";

type AccountBadgeProps = {
  label: string;
  color: AccountConfig["color"];
};

export function AccountBadge({ label, color }: AccountBadgeProps) {
  return (
    <Badge variant="secondary" className="max-w-full" title={label}>
      {color && (
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", accountColorsMap[color].className)}
        />
      )}
      <span className="truncate">{label}</span>
    </Badge>
  );
}
