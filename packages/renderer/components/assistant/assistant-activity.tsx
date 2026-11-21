import type { AssistantActivity as Activity } from "@ggmail/shared/assistant";
import { useLingui } from "@lingui/react/macro";
import {
  BookOpenTextIcon,
  EllipsisIcon,
  FilePenLineIcon,
  InboxIcon,
  ListChecksIcon,
  MailSearchIcon,
  type LucideIcon,
} from "lucide-react";

export function AssistantActivity({
  activity,
  modelName,
}: {
  activity: Activity;
  modelName: string;
}) {
  const { t } = useLingui();
  let Icon: LucideIcon;
  let label: string;
  switch (activity.kind) {
    case "thread":
    case "reading": {
      const subject = activity.kind === "reading" ? activity.subject : "";
      Icon = BookOpenTextIcon;
      label = subject ? t`Reading “${subject}”` : t`Reading this conversation`;
      break;
    }
    case "mailbox":
      Icon = InboxIcon;
      label = t`Checking visible messages`;
      break;
    case "searching": {
      const account = activity.account || t`All mail`;
      const { page } = activity;
      Icon = MailSearchIcon;
      label = page > 1 ? t`Searching ${account} · page ${page}` : t`Searching ${account}`;
      break;
    }
    case "reviewing":
      Icon = ListChecksIcon;
      label = t`Reviewing the mail results`;
      break;
    case "draftReady":
    case "finishing":
      Icon = FilePenLineIcon;
      label = t`Finishing your reply`;
      break;
    case "waiting":
      Icon = EllipsisIcon;
      label = t`Waiting for ${modelName}`;
      break;
  }
  return (
    <p
      role="status"
      aria-atomic="true"
      className="flex min-w-0 items-center gap-2 text-xs leading-relaxed text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-md bg-muted"
      >
        <Icon className="size-3.5 motion-safe:animate-pulse" />
      </span>
      <span className="line-clamp-2 wrap-anywhere" title={label}>
        {label}
      </span>
    </p>
  );
}
