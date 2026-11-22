import type { KeyboardEvent } from "react";

/* oxlint-disable lingui/no-unlocalized-strings -- DOM key names and selectors. */
export function moveToolbarFocus(event: KeyboardEvent<HTMLElement>, vertical = false) {
  const forward = vertical ? "ArrowDown" : "ArrowRight";
  const backward = vertical ? "ArrowUp" : "ArrowLeft";
  if (![backward, forward, "Home", "End"].includes(event.key)) {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  ).filter((button) => button.offsetWidth > 0);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) {
    return;
  }
  event.preventDefault();
  const last = buttons.length - 1;
  const rtl = !vertical && getComputedStyle(event.currentTarget).direction === "rtl";
  switch (event.key) {
    case "Home":
      buttons[0]?.focus();
      break;
    case "End":
      buttons[last]?.focus();
      break;
    default: {
      const step = (event.key === forward) !== rtl ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    }
  }
}
/* oxlint-enable lingui/no-unlocalized-strings */
