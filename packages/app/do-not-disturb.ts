import { ms } from "@ggmail/shared/ms";
import { msg } from "@lingui/core/macro";
import dayjs from "dayjs";
import { config } from "./config";

export class DoNotDisturb {
  // lingui-set comment="How long Do Not Disturb keeps notifications silenced, in its menu"
  static options = [
    {
      label: msg`Indefinitely`,
      duration: "indefinite",
    },
    {
      label: msg`5 Minutes`,
      duration: "5m",
    },
    {
      label: msg`10 Minutes`,
      duration: "10m",
    },
    {
      label: msg`15 Minutes`,
      duration: "15m",
    },
    {
      label: msg`30 Minutes`,
      duration: "30m",
    },
    {
      label: msg`1 Hour`,
      duration: "1h",
    },
    {
      label: msg`2 Hours`,
      duration: "2h",
    },
    {
      label: msg`4 Hours`,
      duration: "4h",
    },
    {
      label: msg`8 Hours`,
      duration: "8h",
    },
    {
      label: msg`12 Hours`,
      duration: "12h",
    },
    {
      label: msg`Until Tomorrow`,
      duration: "until tomorrow",
    },
  ] as const;
  // lingui-reset

  private timer?: NodeJS.Timeout;

  restoreTimer() {
    clearTimeout(this.timer);
    const until = config.get("doNotDisturb.until");
    if (!config.get("doNotDisturb.enabled") || until === null) {
      return;
    }
    const remaining = until - Date.now();
    if (remaining <= 0) {
      this.disable();
      return;
    }
    this.timer = setTimeout(() => this.restoreTimer(), remaining);
  }

  enable(duration: (typeof DoNotDisturb.options)[number]["duration"]) {
    const until =
      duration === "indefinite"
        ? null
        : duration === "until tomorrow"
          ? dayjs().add(1, "day").startOf("day").valueOf()
          : Date.now() + ms(duration);
    config.store = {
      ...config.store,
      "doNotDisturb.enabled": true,
      "doNotDisturb.duration": duration,
      "doNotDisturb.until": until,
    };
    this.restoreTimer();
  }

  disable() {
    clearTimeout(this.timer);
    config.store = {
      ...config.store,
      "doNotDisturb.enabled": false,
      "doNotDisturb.duration": null,
      "doNotDisturb.until": null,
    };
  }

  toggle() {
    if (config.get("doNotDisturb.enabled")) {
      this.disable();
    } else {
      this.enable("indefinite");
    }
  }
}

export const doNotDisturb = new DoNotDisturb();
