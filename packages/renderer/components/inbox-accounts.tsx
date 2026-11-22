import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ggmail/ui/components/popover";
import { cn } from "@ggmail/ui/lib/utils";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  KeyRoundIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";
import type { useUnifiedInbox } from "@/lib/hooks";
import { AccountAvatar } from "./account-avatar";

const statusDetails = {
  ready: {
    icon: null,
    label: null,
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
  compact = false,
}: {
  inboxes: ReturnType<typeof useUnifiedInbox>["inboxes"];
  selected?: string;
  onSelect: (id?: string) => void;
  compact?: boolean;
}) {
  const { t, i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const choose = (id?: string) => {
    setOpen(false);
    onSelect(id);
  };
  const choices = (
    <div className="inbox-account-list" role="group" aria-label={t`Filter by account`}>
      <Button
        variant="ghost"
        aria-pressed={!selected}
        className="mail-nav-row inbox-account"
        onClick={() => choose()}
      >
        <span className="mail-nav-icon inbox-account-icon">
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
            className="mail-nav-row inbox-account"
            variant="ghost"
            data-unread={messages.length > 0 || undefined}
            aria-label={signIn ? description : label}
            aria-description={signIn ? undefined : description}
            aria-pressed={signIn ? undefined : selected === id}
            title={description}
            onClick={() => {
              if (signIn) {
                setOpen(false);
                ipc.main.send("gmail.openInboxSignIn", id);
              } else {
                choose(id);
              }
            }}
          >
            <AccountAvatar account={{ id, label, color }} />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate">{label}</span>
              {Icon && statusLabel && (
                <span className="inbox-account-status" data-status={status}>
                  <Icon
                    aria-hidden="true"
                    className={cn(status === "syncing" && "motion-safe:animate-spin")}
                  />
                  {t(statusLabel)}
                </span>
              )}
            </span>
            {signIn ? (
              <ChevronRightIcon aria-hidden="true" className="ms-auto text-muted-foreground" />
            ) : (
              messages.length > 0 && (
                <span className="mail-nav-count">{i18n.number(messages.length)}</span>
              )
            )}
          </Button>
        );
      })}
    </div>
  );
  if (compact) {
    const current = inboxes.find(({ account }) => account.id === selected);
    const label = current?.account.label ?? t`All accounts`;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button className="inbox-account-picker" variant="outline" size="sm" />}
          aria-label={t`Filter by account`}
          aria-description={label}
        >
          {current ? <AccountAvatar account={current.account} /> : <InboxIcon aria-hidden="true" />}
          <span className="truncate">{label}</span>
          <ChevronDownIcon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="inbox-account-popup"
          onKeyDown={(event) => {
            // Mail shortcuts belong to the list while choosing an account with the keyboard.
            if (event.key !== "Escape") {
              event.stopPropagation();
            }
          }}
        >
          <PopoverTitle className="mail-nav-heading">{t`Filter by account`}</PopoverTitle>
          {choices}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <aside className="inbox-accounts" aria-labelledby="inbox-accounts-title">
      <h2 id="inbox-accounts-title" className="mail-nav-heading">
        <Trans>Accounts</Trans>
      </h2>
      {choices}
    </aside>
  );
}
