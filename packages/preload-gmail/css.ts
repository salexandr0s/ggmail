import { GMAIL_PRELOAD_ARGUMENTS } from "@ggmail/shared/gmail";

export function initCss() {
  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideGmailLogo)) {
    document.documentElement.classList.add("ggmail-hide-gmail-logo");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideInboxFooter)) {
    document.documentElement.classList.add("ggmail-hide-inbox-footer");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.reverseConversation)) {
    document.documentElement.classList.add("ggmail-reverse-conversation");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.showTrimmedContent)) {
    document.documentElement.classList.add("ggmail-show-trimmed-content");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideOutOfOfficeBanner)) {
    document.documentElement.classList.add("ggmail-hide-out-of-office-banner");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hidePromoBanner)) {
    document.documentElement.classList.add("ggmail-hide-promo-banner");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideUpgradeButton)) {
    document.documentElement.classList.add("ggmail-hide-gmail-upgrade");
  }
}
