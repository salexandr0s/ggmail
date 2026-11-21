import { cn } from "@ggmail/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function CitationNumber({ number }: { number: number }) {
  return (
    <span className="rounded bg-muted px-1.5 text-[11px] font-semibold text-foreground tabular-nums">
      {number}
    </span>
  );
}

/** Drafts and cited mail share the same document frame inside the assistant. */
export function AssistantMailCard({
  label,
  title,
  subject,
  icon: Icon,
  tools,
  children,
  actions,
  scrollable = false,
}: {
  label?: string;
  title: ReactNode;
  subject?: string;
  icon: LucideIcon;
  tools?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  scrollable?: boolean;
}) {
  const Label = subject ? "span" : "h3";
  return (
    <section
      aria-label={label}
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
        scrollable && "flex max-h-full flex-col",
      )}
    >
      <header className="shrink-0 border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <Label className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs font-semibold">
            {title}
          </Label>
          {tools}
        </div>
        {subject && (
          <h2
            title={subject}
            className="mt-2 mb-1 line-clamp-2 text-lg leading-snug font-semibold tracking-tight wrap-anywhere"
          >
            {subject}
          </h2>
        )}
      </header>
      <div
        tabIndex={scrollable ? 0 : undefined}
        className={cn(
          "space-y-2.5 px-4 pt-3.5 pb-4 select-text",
          scrollable &&
            "min-h-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {children}
      </div>
      {actions && (
        <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t bg-muted/25 px-3 py-2.5">
          {actions}
        </footer>
      )}
    </section>
  );
}
