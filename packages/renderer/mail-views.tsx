import { ipc } from "@ggmail/shared/renderer/ipc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ggmail/ui/components/dropdown-menu";
import { useLingui } from "@lingui/react/macro";
import { renderApp } from "@/lib/react";

type Choice = { value: string; label: string };

function MailViews() {
  const { t } = useLingui();
  const {
    views,
    accountItems,
    selected,
  }: { views: Choice[]; accountItems: Choice[]; selected: string } = JSON.parse(
    new URLSearchParams(location.search).get("choices") ?? "{}",
  );
  const choose = (value: string | null) => ipc.main.send("titleBar.chooseMailView", value);
  const item = ({ value, label }: Choice) => (
    <DropdownMenuRadioItem
      key={value}
      value={value}
      closeOnClick={false}
      onClick={() => choose(value)}
      className="h-8"
    >
      <span className="truncate">{label}</span>
    </DropdownMenuRadioItem>
  );
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
        finalFocus={false}
      >
        <DropdownMenuRadioGroup value={selected}>
          {views.map(item)}
          {accountItems.length > 0 && <DropdownMenuSeparator />}
          {accountItems.map(item)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

renderApp(MailViews);
