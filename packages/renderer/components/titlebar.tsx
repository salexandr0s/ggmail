import { APP_TITLEBAR_HEIGHT } from "@ggmail/shared/constants";
import { ipc } from "@ggmail/shared/renderer/ipc";
import type { MenuModifiers } from "@ggmail/shared/types";
import { Button } from "@ggmail/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuBackdrop,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ggmail/ui/components/dropdown-menu";
import { useIsMobile } from "@ggmail/ui/hooks/use-mobile";
import { cn } from "@ggmail/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon, RotateCwIcon, XIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { useChromeMenu } from "@/lib/chrome-menu";
import { useCloseOnWindowBlur } from "@/lib/hooks";

/**
 * Icon commands default to menu shortcuts. The view and account toolbars each
 * provide one tab stop and use arrow keys to move between their buttons.
 */
export function Titlebar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border-b bg-chrome select-none draggable",
        className,
      )}
      style={{ height: APP_TITLEBAR_HEIGHT }}
    >
      <div
        className="absolute inset-y-0 flex items-center justify-between px-2"
        style={{
          left: "env(titlebar-area-x, 0)",
          width: "env(titlebar-area-width, 100%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function TitlebarLeft({ children }: { children: ReactNode }) {
  return <div className="titlebar-left flex min-w-0 flex-1 items-center gap-2">{children}</div>;
}

export function TitlebarRight({ children }: { children: ReactNode }) {
  return <div className="titlebar-right flex min-w-0 items-center gap-2">{children}</div>;
}

export function TitlebarButtonGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("flex items-center gap-1", className)}>{children}</div>;
}

export function TitlebarPageTitle({ children }: { children: string }) {
  return (
    <div className="max-w-xs truncate text-sm font-medium" title={children}>
      {children}
    </div>
  );
}

export function TitlebarTitle({ children }: { children: string }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 max-w-xs -translate-x-1/2 -translate-y-1/2 truncate text-sm font-medium"
      title={children}
    >
      {children}
    </div>
  );
}

export function TitlebarIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      tabIndex={-1}
      className={cn("draggable-none", className)}
      {...props}
    />
  );
}

type TitlebarMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onChoose: (keys: MenuModifiers) => void;
  onAuxClick?: ComponentProps<typeof DropdownMenuItem>["onAuxClick"];
};

export function TitlebarDropdownMenu({
  title,
  icon,
  side = "right",
  disabled,
  isOpen,
  onOpenChange,
  items,
}: {
  title: string;
  icon: ReactNode;
  side?: "left" | "right";
  disabled?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  items: TitlebarMenuItem[];
}) {
  const compact = useIsMobile();
  const { rootProps, triggerProps, contentProps } = useChromeMenu(isOpen, onOpenChange);
  useCloseOnWindowBlur(isOpen, () => onOpenChange(false));

  if (compact) {
    const pick = async (button: HTMLElement) => {
      if (isOpen) {
        return;
      }
      const rect = button.getBoundingClientRect();
      onOpenChange(true);
      try {
        const choice = await ipc.main.invoke(
          "titleBar.pickTool",
          items.map((item) => item.label),
          { x: rect.left, y: rect.bottom },
        );
        if (choice) {
          items[choice.index]?.onChoose(choice);
        }
      } finally {
        onOpenChange(false);
      }
    };
    return (
      <TitlebarIconButton
        tabIndex={0}
        title={title}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => void pick(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            void pick(event.currentTarget);
          }
        }}
      >
        {icon}
      </TitlebarIconButton>
    );
  }
  return (
    <DropdownMenu {...rootProps} orientation="horizontal">
      <DropdownMenuTrigger
        {...triggerProps}
        render={
          <TitlebarIconButton title={title} disabled={disabled}>
            {icon}
          </TitlebarIconButton>
        }
      />
      <DropdownMenuBackdrop className="draggable-none" />
      <DropdownMenuContent
        {...contentProps}
        side={side}
        align="center"
        collisionPadding={0}
        className="flex w-auto min-w-0 flex-row gap-1 p-0.5 draggable-none"
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            title={item.label}
            aria-label={item.label}
            className="h-7 justify-center"
            onClick={item.onChoose}
            onAuxClick={item.onAuxClick}
          >
            {item.icon ?? item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TitlebarNavigationControls({
  canGoBack,
  canGoForward,
  isLoading,
  disabled,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  disabled?: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onStop: () => void;
}) {
  const { t } = useLingui();

  const [isReloadHovered, setIsReloadHovered] = useState(false);

  return (
    <>
      <TitlebarIconButton title={t`Go back`} disabled={!canGoBack} onClick={onGoBack}>
        <ArrowLeftIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        title={t`Go forward`}
        className="max-sm:disabled:hidden"
        disabled={!canGoForward}
        onClick={onGoForward}
      >
        <ArrowRightIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        className="max-sm:hidden"
        title={isLoading ? t`Stop loading` : t`Reload page`}
        disabled={disabled}
        onMouseEnter={() => setIsReloadHovered(true)}
        onMouseLeave={() => setIsReloadHovered(false)}
        onClick={isLoading ? onStop : onReload}
      >
        {isLoading ? (
          isReloadHovered ? (
            <XIcon />
          ) : (
            <LoaderCircleIcon className="animate-spin" />
          )
        ) : (
          <RotateCwIcon />
        )}
      </TitlebarIconButton>
    </>
  );
}
