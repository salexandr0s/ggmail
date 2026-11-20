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
    <Badge variant="secondary">
      {color && <div className={cn("size-2 rounded-full", accountColorsMap[color].className)} />}
      {label}
    </Badge>
  );
}
