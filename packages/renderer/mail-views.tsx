import { accountColorsMap } from "@ggmail/shared/accounts";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
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
import { cn } from "@ggmail/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import { MailIcon } from "lucide-react";
import { getMailViews } from "@/lib/mail-views";
import { renderApp } from "@/lib/react";
import "@/components/mail-titlebar.css";

type AccountChoice = { value: string; label: string; color: AccountConfig["color"] };

function MailViews() {
  const { t } = useLingui();
  const {
    unified,
    accountItems,
    selected,
  }: { unified: boolean; accountItems: AccountChoice[]; selected: string } = JSON.parse(
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
        <DropdownMenuRadioGroup value={selected}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t`Mail views`}</DropdownMenuLabel>
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
          </DropdownMenuGroup>
          {accountItems.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t`Accounts`}</DropdownMenuLabel>
                {accountItems.map(({ value, label, color }) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    closeOnClick={false}
                    onClick={() => choose(value)}
                    title={label}
                  >
                    <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
                      {color ? (
                        <span
                          className={cn("size-2 rounded-full", accountColorsMap[color].className)}
                        />
                      ) : (
                        <MailIcon />
                      )}
                    </span>
                    <span className="truncate">{label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

renderApp(MailViews);
