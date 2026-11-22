import { Button } from "@ggmail/ui/components/button";
import { useLingui } from "@lingui/react/macro";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PopupWindow } from "@/components/popup-window";

/**
 * The frame of a page shown in a popup view drawn over a window. The view it
 * fills is transparent and spans the gaps the popup keeps from the window
 * edges, so the frame is what paints, pads and fades the popup in.
 */
export function Popup({
  title,
  children,
  onClose,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <PopupWindow onClose={onClose}>
      <div
        className="h-screen p-2"
        onPointerDown={(event) => {
          // The view covers the gaps, so a press on one lands in the popup
          // instead of blurring it — closing here is the blur that would have
          // been. On the press, not the click: a click that only ends on a gap
          // — a text selection dragged past the frame — lands here too
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="relative flex h-full animate-in flex-col overflow-hidden rounded-[20px] border bg-popover text-popover-foreground duration-150 fade-in-0 zoom-in-95 slide-in-from-top-2 motion-reduce:animate-none">
          <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b py-2 ps-5 pe-3">
            <h1 className="min-w-0 text-lg leading-6 font-medium wrap-anywhere">{title}</h1>
            <Button size="icon" variant="ghost" onClick={onClose} title={t`Close`}>
              <XIcon aria-hidden="true" />
            </Button>
          </header>
          {children}
        </div>
      </div>
    </PopupWindow>
  );
}
