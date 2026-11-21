import type { MailViewId } from "@ggmail/shared/mail-views";
import { t } from "@lingui/core/macro";
import { AllMailIcon, AttachmentIcon, MailIcon, WaitingIcon } from "@/components/mail-icons";

export function getMailViews(
  unified: boolean,
): { value: MailViewId; label: string; Icon: typeof MailIcon }[] {
  /* oxlint-disable lingui/no-unlocalized-strings -- Values identify routes. */
  return [
    unified
      ? { value: "/unified-inbox", label: t`All Mail`, Icon: AllMailIcon }
      : { value: "gmail", label: t`Mail`, Icon: MailIcon },
    { value: "/attachments", label: t`Attachments`, Icon: AttachmentIcon },
    { value: "/waiting", label: t`Waiting for reply`, Icon: WaitingIcon },
  ];
  /* oxlint-enable lingui/no-unlocalized-strings */
}
