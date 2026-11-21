import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuBackdrop,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ggmail/ui/components/dropdown-menu";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, ClockIcon, InboxIcon, PaperclipIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { navigate } from "wouter/use-hash-location";
import { useChromeMenu } from "@/lib/chrome-menu";
import { useCloseOnWindowBlur } from "@/lib/hooks";

export function MailViewNavigation({ location, unified }: { location: string; unified: boolean }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  useEffect(
    () => ipc.renderer.on("titleBar.mailViewsOpen", (_event, next) => setCompactMenuOpen(next)),
    [],
  );
  const menu = useChromeMenu(open, setOpen);
  useCloseOnWindowBlur(open, () => setOpen(false));
  const views = [
    ...(unified ? [{ path: "/unified-inbox", label: t`All Mail`, Icon: InboxIcon }] : []),
    { path: "/attachments", label: t`Attachments`, Icon: PaperclipIcon },
    { path: "/waiting", label: t`Waiting for reply`, Icon: ClockIcon },
  ];
  const current = views.find((view) => view.path === location);
  return (
    <nav aria-label={t`Mail views`} className="shrink-0 draggable-none">
      <div className="hidden items-center gap-0.5 min-[1040px]:flex">
        {views.map(({ path, label, Icon }) => (
          <Button
            key={path}
            size="sm"
            variant={location === path ? "secondary" : "ghost"}
            aria-current={location === path ? "page" : undefined}
            className="gap-1.5 px-2 text-xs"
            onClick={() => {
              if (location !== path) {
                navigate(path);
              }
            }}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={compactMenuOpen}
        aria-label={t`Mail views`}
        aria-description={current?.label}
        className="max-w-32 gap-1 px-2 text-xs sm:hidden"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          ipc.main.send("titleBar.showMailViews", {
            x: Math.round(rect.left),
            y: Math.round(rect.bottom),
          });
        }}
      >
        <span className="truncate">{current?.label ?? t`Mail views`}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0" />
      </Button>
      {/* Keep the menu in the title bar, above the embedded Gmail or Workspace view. */}
      <DropdownMenu {...menu.rootProps} orientation="horizontal">
        <DropdownMenuTrigger
          aria-label={t`Mail views`}
          aria-description={current?.label}
          render={
            <Button
              size="sm"
              variant="secondary"
              className="hidden max-w-40 gap-1.5 px-2 text-xs sm:max-[1040px]:inline-flex"
            />
          }
        >
          <span className="truncate">{current?.label ?? t`Mail views`}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuBackdrop className="draggable-none" />
        <DropdownMenuContent
          {...menu.contentProps}
          side="right"
          align="center"
          collisionPadding={0}
          className="flex w-auto min-w-0 flex-row gap-0.5 p-0.5 draggable-none"
        >
          {views.map(({ path, label, Icon }) => (
            <DropdownMenuItem
              key={path}
              title={label}
              aria-label={label}
              aria-current={location === path ? "page" : undefined}
              className="h-7 justify-center px-1.5 aria-[current=page]:bg-accent"
              onClick={() => {
                if (location !== path) {
                  navigate(path);
                }
              }}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              <span className="truncate">{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
