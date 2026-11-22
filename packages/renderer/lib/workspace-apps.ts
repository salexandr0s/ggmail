import type { MenuModifiers } from "@ggmail/shared/types";
import { platform } from "./utils";

export function getModifierOpenBehavior(event: MenuModifiers) {
  if (platform.isMacOS ? event.metaKey : event.ctrlKey) {
    return event.shiftKey ? "tab" : "backgroundTab";
  }

  if (event.shiftKey) {
    return "newWindow";
  }
}
