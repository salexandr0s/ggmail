import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, PanelsTopLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { navigate } from "wouter/use-hash-location";
import { getMailViews } from "@/lib/mail-views";

export function MailViewNavigation({
  location,
  unified,
  multipleAccounts,
  accountLabel,
}: {
  location: string;
  unified: boolean;
  multipleAccounts: boolean;
  accountLabel?: string;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  useEffect(() => ipc.renderer.on("titleBar.mailViewsOpen", (_event, next) => setOpen(next)), []);

  const views = getMailViews(unified);
  const current = views.find((view) => view.value === location);
  const CurrentIcon = current?.Icon ?? PanelsTopLeftIcon;
  const anchor = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    return { x: Math.round(rect.left), y: Math.round(rect.bottom) };
  };

  return (
    <nav aria-label={t`Mail views`} className="mail-view-nav draggable-none">
      <div className="mail-view-segments">
        {views.map(({ value, label, Icon }) => (
          <Button
            key={value}
            size="sm"
            variant="ghost"
            data-view={value}
            aria-current={location === value ? "page" : undefined}
            className="mail-view-segment"
            aria-haspopup={value === "calendar" && multipleAccounts ? "menu" : undefined}
            onClick={(event) => {
              if (value === "calendar") {
                ipc.main.send("titleBar.openCalendar", anchor(event.currentTarget));
              } else if (location !== value) {
                navigate(value);
              }
            }}
          >
            <Icon aria-hidden="true" />
            {label}
            {value === "calendar" && multipleAccounts && (
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            )}
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        data-view={current?.value}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t`Mail views`}
        aria-description={current?.label ?? accountLabel}
        title={t`Mail views`}
        className="mail-view-picker"
        onClick={(event) => ipc.main.send("titleBar.showMailViews", anchor(event.currentTarget))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            ipc.main.send("titleBar.showMailViews", anchor(event.currentTarget));
          }
        }}
      >
        <CurrentIcon aria-hidden="true" />
        <span className="truncate">
          {current?.label ??
            (accountLabel && multipleAccounts ? (
              <>
                <span className="mail-picker-account">{accountLabel}</span>
                <span className="mail-picker-caption">{t`Mail views`}</span>
              </>
            ) : (
              (accountLabel ?? t`Mail views`)
            ))}
        </span>
        <ChevronDownIcon aria-hidden="true" className="mail-picker-chevron size-3" />
      </Button>
    </nav>
  );
}
