import { FieldGroup } from "@ggmail/ui/components/field";
import { cn } from "@ggmail/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { createContext, useContext, type ComponentProps } from "react";

export const SettingsHeadingContext = createContext<{ icon: LucideIcon; group: string } | null>(
  null,
);

export function SettingsHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("settings-header mb-8 flex justify-between", className)} {...props} />;
}

export function SettingsTitle({ className, ...props }: ComponentProps<"h1">) {
  const heading = useContext(SettingsHeadingContext);
  // The boot smoke test waits for this to identify the settings page it routed
  // to, so it does not have to match against copy that is free to change.
  const title = (
    <h1
      data-testid="settings-title"
      className={cn("settings-title text-2xl font-semibold", className)}
      {...props}
    />
  );
  if (!heading) {
    return title;
  }

  return (
    <div className="settings-heading">
      <span className="settings-heading-icon" aria-hidden="true">
        <heading.icon />
      </span>
      <div className="min-w-0">
        <div className="settings-heading-group">{heading.group}</div>
        {title}
      </div>
    </div>
  );
}

export function SettingsDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function SettingsContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("settings-content", className)} {...props} />;
}

export function SettingsPanel({ className, ...props }: ComponentProps<"div">) {
  return <FieldGroup className={cn("settings-panel", className)} {...props} />;
}

export function Settings(props: ComponentProps<"div">) {
  return <div {...props} />;
}
