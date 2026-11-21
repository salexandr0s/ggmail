import { SCHEDULE_FOLLOW_UP_PATH } from "./follow-ups";
import type { AccountConfig } from "./schemas";

export type MailViewId = "gmail" | "/unified-inbox" | "/attachments" | "/waiting";

export function currentMailView(location: string, activeApp?: string): MailViewId | undefined {
  if (location === "/" && activeApp === "gmail") {
    return activeApp;
  }
  if (location === SCHEDULE_FOLLOW_UP_PATH) {
    return "/waiting";
  }
  if (location === "/unified-inbox" || location === "/attachments" || location === "/waiting") {
    return location;
  }
}

export type MailViewsPopupState = {
  unified: boolean;
  selectedView?: MailViewId;
  selectedAccount?: string;
  accountItems: {
    value: string;
    label: string;
    color: AccountConfig["color"];
    logo?: AccountConfig["logo"];
    profilePhoto?: string;
    signIn: boolean;
    unread: number | null;
  }[];
};
