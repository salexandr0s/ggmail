import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { cn } from "@ggmail/ui/lib/utils";
import type { ReactNode } from "react";

export function AppMain({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className="relative flex min-w-0 flex-1 bg-sidebar">
      <ScrollArea className="@container relative flex-1 overflow-hidden bg-canvas">
        <div className={cn("mx-auto py-8", className)}>{children}</div>
      </ScrollArea>
    </div>
  );
}
