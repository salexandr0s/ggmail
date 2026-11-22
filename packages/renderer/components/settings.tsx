import { FieldGroup } from "@ggmail/ui/components/field";
import { cn } from "@ggmail/ui/lib/utils";
import type { ComponentProps } from "react";

export function SettingsHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("settings-header mb-8 flex justify-between", className)} {...props} />;
}

export function SettingsTitle({ className, ...props }: ComponentProps<"h1">) {
  // The boot smoke test waits for this to identify the settings page it routed
  // to, so it does not have to match against copy that is free to change.
  return (
    <h1
      data-testid="settings-title"
      tabIndex={-1}
      className={cn("settings-title page-heading-title", className)}
      {...props}
    />
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
