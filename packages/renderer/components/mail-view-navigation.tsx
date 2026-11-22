import type { MailViewId } from "@ggmail/shared/mail-views";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, PanelsTopLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountAvatar } from "@/components/account-avatar";
import { MailIcon } from "@/components/mail-icons";
import { getMailViews } from "@/lib/mail-views";
import { moveToolbarFocus } from "@/lib/move-toolbar-focus";

function anchor(button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  return { x: Math.round(rect.left), y: Math.round(rect.bottom) };
}

export function MailViewNavigation({
  selectedView,
  unified,
  accountLabel,
  account,
}: {
  selectedView?: MailViewId;
  unified: boolean;
  accountLabel?: string;
  account?: AccountConfig;
}) {
  const { t } = useLingui();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focused, setFocused] = useState<MailViewId>();
  useEffect(
    () => ipc.renderer.on("titleBar.mailViewsOpen", (_event, next) => setPickerOpen(next)),
    [],
  );

  const views = getMailViews(unified);
  const current = views.find((view) => view.value === selectedView);
  const CurrentIcon = current?.Icon ?? (accountLabel ? MailIcon : PanelsTopLeftIcon);
  const tabStop = views.find((view) => view.value === focused) ?? current ?? views[0];
  const showPicker = (button: HTMLElement) =>
    ipc.main.send("titleBar.showMailViews", anchor(button));

  return (
    <nav aria-label={t`Mail views`} className="mail-view-nav draggable-none">
      <div
        className="mail-view-segments"
        role="toolbar"
        aria-label={t`Mail views`}
        onKeyDown={moveToolbarFocus}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocused(undefined);
          }
        }}
      >
        {views.map(({ value, label, Icon }) => (
          <Button
            key={value}
            size="sm"
            variant="ghost"
            data-view={value}
            aria-label={label}
            title={label}
            tabIndex={tabStop?.value === value ? 0 : -1}
            onFocus={() => setFocused(value)}
            aria-current={selectedView === value ? "page" : undefined}
            className="mail-view-segment"
            onClick={() => ipc.main.send("titleBar.openMailView", value)}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="mail-view-label">{label}</span>
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        data-view={current?.value}
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        aria-label={t`Mail views`}
        aria-description={current?.label ?? accountLabel}
        title={current?.label ?? accountLabel ?? t`Mail views`}
        className="mail-view-picker"
        onClick={(event) => showPicker(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            showPicker(event.currentTarget);
          }
        }}
      >
        {account && (!current || current.value === "gmail") ? (
          <AccountAvatar account={account} />
        ) : (
          <CurrentIcon aria-hidden="true" className="size-4" />
        )}
        <span className="truncate">{current?.label ?? accountLabel ?? t`Mail views`}</span>
        <ChevronDownIcon aria-hidden="true" className="mail-picker-chevron size-3" />
      </Button>
    </nav>
  );
}
