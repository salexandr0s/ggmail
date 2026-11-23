import { cn } from "@ggmail/ui/lib/utils";

export function UnreadCountBadge({
  unreadCount,
  className,
}: {
  unreadCount: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-secondary px-1 text-[0.625rem] leading-none font-medium text-secondary-foreground tabular-nums",
        className,
      )}
    >
      {unreadCount.toLocaleString()}
    </div>
  );
}
