import type { MailViewsPopupState } from "@ggmail/shared/mail-views";
import { ipc } from "@ggmail/shared/renderer/ipc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ggmail/ui/components/dropdown-menu";
import { useLingui } from "@lingui/react/macro";
import { CircleAlertIcon } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { getMailViews } from "@/lib/mail-views";
import { renderApp } from "@/lib/react";
import "@/components/mail-titlebar.css";

function MailViews() {
  const { t } = useLingui();
  const { unified, accountItems, selectedView, selectedAccount }: MailViewsPopupState = JSON.parse(
    new URLSearchParams(location.search).get("choices") ?? "{}",
  );
  const choose = (value: string | null) => ipc.main.send("titleBar.chooseMailView", value);
  return (
    <DropdownMenu
      defaultOpen
      onOpenChange={(open) => {
        if (!open) {
          choose(null);
        }
      }}
    >
      <DropdownMenuTrigger
        tabIndex={-1}
        aria-hidden="true"
        className="mx-2 mt-2 block h-0 w-[calc(100%-1rem)]"
      />
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        collisionPadding={8}
        aria-label={t`Mail views`}
        className="mail-picker-menu"
        finalFocus={false}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t`Mail views`}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selectedView ?? null}>
            {getMailViews(unified).map(({ value, label, Icon }) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                data-view={value}
                closeOnClick={false}
                onClick={() => choose(value)}
              >
                <Icon aria-hidden="true" />
                <span className="truncate">{label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {accountItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t`Accounts`}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={selectedAccount ?? null}>
                {accountItems.map(({ value, label, color, logo, profilePhoto, signIn, unread }) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    closeOnClick={false}
                    onClick={() => choose(value)}
                    title={signIn ? t`Sign in to ${label}` : label}
                    aria-label={label}
                    aria-description={
                      signIn ? t`Sign in` : unread ? `${t`Unread messages`} (${unread})` : undefined
                    }
                  >
                    <AccountAvatar
                      account={{ id: value.slice("account/".length), label, color, logo }}
                      photo={profilePhoto}
                    />
                    <span className="truncate">{label}</span>
                    {signIn ? (
                      <CircleAlertIcon
                        aria-hidden="true"
                        className="ms-auto size-3.5 text-warning"
                      />
                    ) : unread ? (
                      <span aria-hidden="true" className="mail-picker-count">
                        {unread.toLocaleString()}
                      </span>
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

renderApp(MailViews);
