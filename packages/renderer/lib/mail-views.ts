import { t } from "@lingui/core/macro";
import { CalendarDaysIcon, ClockIcon, InboxIcon, PaperclipIcon } from "lucide-react";

export function getMailViews(unified: boolean) {
  /* oxlint-disable lingui/no-unlocalized-strings -- Values identify routes and the Calendar action. */
  return [
    ...(unified ? [{ value: "/unified-inbox", label: t`All Mail`, Icon: InboxIcon }] : []),
    { value: "/attachments", label: t`Attachments`, Icon: PaperclipIcon },
    { value: "/waiting", label: t`Waiting for reply`, Icon: ClockIcon },
    { value: "calendar", label: t`Calendar`, Icon: CalendarDaysIcon },
  ];
  /* oxlint-enable lingui/no-unlocalized-strings */
}
