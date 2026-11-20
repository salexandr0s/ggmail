import { t } from "@lingui/core/macro";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { toast } from "sonner";

export function restartRequiredToast() {
  toast.info(t`Restart ggmail to apply the changes.`, {
    id: "restart-required",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: t({
        message: "Restart",
        comment: "Button on the toast after a setting changes, which restarts ggmail now",
      }),
      onClick: () => {
        ipc.main.send("app.relaunch");
      },
    },
    cancel: {
      label: t({
        message: "Later",
        comment:
          "Button on the toast after a setting changes, which dismisses it and leaves the restart for later",
      }),
      onClick: () => {},
    },
  });
}
