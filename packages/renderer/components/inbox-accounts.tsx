import { accountColorsMap } from "@ggmail/shared/accounts";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { cn } from "@ggmail/ui/lib/utils";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  CheckIcon,
  ChevronRightIcon,
  InboxIcon,
  KeyRoundIcon,
  Loader2Icon,
  MailIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { useUnifiedInbox } from "@/lib/hooks";

const statusDetails = {
  ready: {
    icon: CheckIcon,
    label: msg`Up to date`,
    description: (label: string) => msg`${label} is up to date`,
  },
  signIn: {
    icon: KeyRoundIcon,
    label: msg`Sign in`,
    description: (label: string) => msg`Sign in to ${label}`,
  },
  retrying: {
    icon: RefreshCwIcon,
    label: msg`Waiting to sync`,
    description: (label: string) => msg`${label} will retry syncing`,
  },
  syncing: {
    icon: Loader2Icon,
    label: msg`Syncing…`,
    description: (label: string) => msg`${label} is still syncing`,
  },
};

export function InboxAccounts({
  inboxes,
  selected,
  onSelect,
}: {
  inboxes: ReturnType<typeof useUnifiedInbox>["inboxes"];
  selected?: string;
  onSelect: (id?: string) => void;
}) {
  const { t, i18n } = useLingui();
  return (
    <aside className="inbox-accounts" aria-labelledby="inbox-accounts-title">
      <h2 id="inbox-accounts-title" className="inbox-rail-heading">
        <Trans>Accounts</Trans>
      </h2>
      <div className="inbox-account-list" role="group" aria-label={t`Filter by account`}>
        <Button
          variant="ghost"
          aria-pressed={!selected}
          className="inbox-account"
          onClick={() => onSelect()}
        >
          <span className="inbox-account-icon">
            <InboxIcon />
          </span>
          <span className="min-w-0 truncate">
            <Trans>All accounts</Trans>
          </span>
        </Button>
        {inboxes.map(({ account: { id, label, color }, messages, status }) => {
          const signIn = status === "signIn";
          const { icon: Icon, label: statusLabel, description: describe } = statusDetails[status];
          const description = t(describe(label));
          return (
            <Button
              key={id}
              className="inbox-account"
              variant="ghost"
              aria-label={signIn ? description : label}
              aria-description={signIn ? undefined : description}
              aria-pressed={signIn ? undefined : selected === id}
              title={description}
              onClick={() => (signIn ? ipc.main.send("gmail.openInboxSignIn", id) : onSelect(id))}
            >
              <span className="inbox-account-icon">
                <MailIcon aria-hidden="true" />
                {color && (
                  <span
                    aria-hidden="true"
                    className={cn("inbox-account-color", accountColorsMap[color].className)}
                  />
                )}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate">{label}</span>
                <span className="inbox-account-status" data-status={status}>
                  <Icon
                    aria-hidden="true"
                    className={cn(status === "syncing" && "motion-safe:animate-spin")}
                  />
                  {t(statusLabel)}
                </span>
              </span>
              {signIn ? (
                <ChevronRightIcon aria-hidden="true" className="ms-auto text-muted-foreground" />
              ) : (
                messages.length > 0 && (
                  <span className="inbox-account-count">{i18n.number(messages.length)}</span>
                )
              )}
            </Button>
          );
        })}
      </div>
    </aside>
  );
}
