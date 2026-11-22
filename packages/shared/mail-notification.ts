import { t } from "@lingui/core/macro";
import { getAccountLabel } from "./accounts";
import type { Config } from "./types";

type MailDetails = { sender: string; subject: string; summary: string };

export function mailNotificationContent(
  mail: MailDetails,
  config: Pick<
    Config,
    "notifications.showSender" | "notifications.showSubject" | "notifications.showSummary"
  >,
  accountLabel: string,
  multipleAccounts: boolean,
  isMacOS: boolean,
) {
  const sender = config["notifications.showSender"] && mail.sender;
  const title = sender ? (multipleAccounts ? `[${accountLabel}] ${sender}` : sender) : accountLabel;
  const subject = config["notifications.showSubject"] ? mail.subject : undefined;
  const summary = config["notifications.showSummary"] ? mail.summary : undefined;
  return {
    title,
    subtitle: isMacOS ? subject : undefined,
    body: isMacOS ? summary : [subject, summary].filter(Boolean).join("\n") || undefined,
  };
}

export function sampleMailNotification(config: Config, isMacOS: boolean) {
  const accounts = config.accounts.filter((account) => !account.disabled);
  const account = accounts.find((entry) => entry.selected) ?? accounts[0];
  return mailNotificationContent(
    {
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- sample sender's name
      sender: "Tim from ggmail",
      subject: t({
        message: "Your test notification request",
        comment: "Subject of the sample email in the test notification",
      }),
      summary: t`This is what a new email notification looks like.`,
    },
    config,
    account ? getAccountLabel(account.label) : "ggmail",
    accounts.length > 1,
    isMacOS,
  );
}
