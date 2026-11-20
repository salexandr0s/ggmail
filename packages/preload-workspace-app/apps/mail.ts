import "@ggmail/preload-gmail/i18n";
import { initGmailDarkTheme } from "@ggmail/preload-gmail/dark-theme";
import { observeBodyMutations } from "@ggmail/shared/dom";
import { GMAIL_PRELOAD_ARGUMENTS, isGmailComposeWindowUrl } from "@ggmail/shared/gmail";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { $ } from "select-dom";

const isCloseComposeWindowAfterSendEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.closeComposeWindowAfterSend,
);

const messageSentElementProcessedAttribute = "data-ggmail-close-compose-window-after-send";

function closeComposeWindowAfterSend() {
  if (!isCloseComposeWindowAfterSendEnabled) {
    return;
  }

  const messageSentElement = $(
    `.vh:has(span[id='link_undo']):has(span[id='link_vsm']):not([${messageSentElementProcessedAttribute}])`,
  );

  if (!messageSentElement) {
    return;
  }

  messageSentElement.setAttribute(messageSentElementProcessedAttribute, "");

  ipc.main.send("gmail.closeComposeWindow");

  ipc.renderer.once("gmail.undoMessageSent", () => {
    const undoElement = $("span#link_undo", messageSentElement);

    if (!undoElement) {
      throw new Error("Undo element not found");
    }

    undoElement.click();
  });
}

/*
 * Gmail's own pop-out is recognized by its URL, which the page navigates to
 * itself. A compose window ggmail opened says so on the command line instead:
 * Gmail redirects the `?extsrc=mailto` form somewhere that is not `/popout`,
 * and the side that opened the window is the side that knows what it is.
 */
const isComposeWindow = process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.composeWindow);

export function initMailPreload() {
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a DOM event name
  document.addEventListener("DOMContentLoaded", () => {
    const popout = isComposeWindow || isGmailComposeWindowUrl(window.location.href);
    initGmailDarkTheme(popout);
    if (popout) {
      observeBodyMutations(closeComposeWindowAfterSend);
    }
  });
}
