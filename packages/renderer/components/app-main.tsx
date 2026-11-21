import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { cn } from "@ggmail/ui/lib/utils";
import { Route, useRoute } from "wouter";
import { WaitingForReply } from "@/components/follow-ups";
import { DownloadHistory } from "@/routes/download-history";
import { UnifiedInbox } from "@/routes/unified-inbox";

export function AppMain() {
  const [matchUnifiedInboxRoute] = useRoute("/unified-inbox");

  const [waiting] = useRoute("/waiting");

  return (
    <div className="relative flex flex-1 bg-sidebar">
      <ScrollArea className="@container relative flex-1 overflow-hidden border bg-background dark:border-none">
        <div
          className={cn(
            "mx-auto py-8",
            matchUnifiedInboxRoute || waiting ? "w-full max-w-6xl px-4 @md:px-8" : "max-w-2xl px-8",
          )}
        >
          <Route path="/unified-inbox" component={UnifiedInbox} />
          <Route path="/waiting" component={WaitingForReply} />
          <Route path="/download-history" component={DownloadHistory} />
        </div>
      </ScrollArea>
    </div>
  );
}
