import type { WebContents } from "electron";
import { config } from "@/config";
import { ipc } from "@/ipc";

// Each navigation gets the current setting, including pop-outs and restored tabs.
// Only the boolean crosses into the mailbox's renderer.
export function syncGmailDarkTheme(contents: WebContents) {
  const send = () => {
    if (contents.getURL().startsWith("https://mail.google.com/")) {
      ipc.renderer.send(
        contents,
        "gmail.extendDarkThemeChanged",
        config.get("gmail.extendDarkTheme"),
      );
    }
  };
  contents.on("dom-ready", send);
  contents.once("destroyed", config.onDidChange("gmail.extendDarkTheme", send));
}
