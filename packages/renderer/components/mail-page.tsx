import { accountColorsMap } from "@ggmail/shared/accounts";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { cn } from "@ggmail/ui/lib/utils";
import { MailboxIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SettingsHeader, SettingsTitle } from "./settings";

export function MailPageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <SettingsHeader className="min-h-8 flex-col gap-x-5 gap-y-7 @2xl:flex-row @2xl:items-center">
      <SettingsTitle
        role="heading"
        aria-level={1}
        className="min-w-0 font-semibold tracking-tight wrap-anywhere"
      >
        {title}
      </SettingsTitle>
      {children}
    </SettingsHeader>
  );
}

export function MailboxSection({
  label,
  color,
  hidden,
  actions,
  children,
}: {
  label: string;
  color: AccountConfig["color"];
  hidden?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      hidden={hidden}
      className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground"
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 bg-muted/55 px-3.5 py-2">
        <h2 className="flex max-w-full min-w-0 items-center gap-2 text-sm font-semibold">
          {color ? (
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", accountColorsMap[color].className)}
            />
          ) : (
            <MailboxIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 wrap-anywhere">{label}</span>
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
