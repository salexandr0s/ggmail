import { applyDarkTheme, type DarkThemeController } from "@ggmail/dark-theme";
import {
  GMAIL_EDITOR_DARK_THEME_CSS,
  GMAIL_EDITOR_SELECTOR,
} from "@ggmail/shared/gmail-editor-dark-theme";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { t } from "@lingui/core/macro";
import { webFrame } from "electron";
import chromeCss from "./chrome.css";
import readerCss from "./reader.css";

const threadSelector = ":is(.nH.id, .g.id):has(h2:is([data-legacy-thread-id], .hP))";
const panelSelector = [threadSelector, ".AD", ".adn:has(.a3s)", ".ip:has([contenteditable])"].join(
  ",",
);
const bodySelector = ".a3s";
const buttonAttribute = "data-ggmail-original-colors";
const modeAttribute = "data-ggmail-message-colors";
const protectedContent = [bodySelector, GMAIL_EDITOR_SELECTOR, `[${buttonAttribute}]`].join(",");

function themePanel(root: HTMLElement) {
  return applyDarkTheme(root, {
    backgroundColor: "rgb(19, 19, 19)",
    ignore: [
      protectedContent,
      ".edeTZ",
      { selector: ".HM .I5", properties: ["border-color"] },
      { selector: ".J-JN-M-I, .J-N, .dC", properties: ["background-color"] },
    ],
    invertImageUrls: [
      "https://www.gstatic.com/images/icons/material/system_gm/",
      "https://ssl.gstatic.com/ui/v1/icons/mail/gm3/",
    ],
    invertImageExcludeFilenames: [
      "star_googyellow500_20dp.png",
      "archive_white_20dp.png",
      "schedule_send_googblue_20dp.png",
      "label_important_fill_googyellow500_20dp.png",
      "arrow_drop_down_white_20dp.png",
    ],
  });
}

function messageId(body: HTMLElement) {
  const message = body.closest("[data-legacy-message-id], [data-message-id]");
  return (
    message?.getAttribute("data-legacy-message-id") || message?.getAttribute("data-message-id")
  );
}

function createColorToggle(body: HTMLElement, originals: Set<string>) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(buttonAttribute, "");
  button.textContent = t({
    message: "Original colors",
    comment: "Toggle showing one email in its sender’s original colors",
  });
  const id = messageId(body);
  const setOriginal = (original: boolean) => {
    body.setAttribute(modeAttribute, original ? "original" : "dark");
    button.setAttribute("aria-pressed", String(original));
  };
  setOriginal(!!id && originals.has(id));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const original = body.getAttribute(modeAttribute) === "dark";
    if (id) {
      if (original) {
        originals.add(id);
      } else {
        originals.delete(id);
      }
    }
    setOriginal(original);
  });
  return { button, id };
}

export function initGmailDarkTheme(popout = false) {
  const panels = new Map<HTMLElement, DarkThemeController>();
  const messages = new Map<HTMLElement, ReturnType<typeof createColorToggle>>();
  const originals = new Set<string>();
  let conversation = location.hash;
  let sheet: string | undefined;
  let frame = 0;

  function reconcile() {
    frame = 0;
    if (conversation !== location.hash) {
      conversation = location.hash;
      originals.clear();
    }
    const selector = popout ? `.nH, ${panelSelector}` : panelSelector;
    const roots = new Set(
      [...document.querySelectorAll<HTMLElement>(selector)].filter(
        (root) => !root.closest(protectedContent) && !root.parentElement?.closest(selector),
      ),
    );
    for (const [panel, controller] of panels) {
      if (!roots.has(panel)) {
        controller.revert();
        panels.delete(panel);
      }
    }
    for (const root of roots) {
      if (!panels.has(root)) {
        panels.set(root, themePanel(root));
      }
    }

    const bodies = new Set(
      [...document.querySelectorAll<HTMLElement>(bodySelector)].filter(
        (body) =>
          !body.closest(GMAIL_EDITOR_SELECTOR) && !body.parentElement?.closest(bodySelector),
      ),
    );
    for (const [body, { button, id }] of messages) {
      if (!bodies.has(body) || id !== messageId(body)) {
        body.removeAttribute(modeAttribute);
        button.remove();
        messages.delete(body);
      }
    }
    for (const body of bodies) {
      let toggle = messages.get(body);
      if (!toggle) {
        toggle = createColorToggle(body, originals);
        messages.set(body, toggle);
      }
      if (body.previousElementSibling !== toggle.button) {
        body.before(toggle.button);
      }
    }
  }

  // Batch panel discovery. Typing in an editor and rendering the contents of a
  // newsletter cannot add a panel, and CSS already covers new message content.
  const observer = new MutationObserver((records) => {
    if (
      !frame &&
      records.some(
        ({ target, type }) =>
          !(target instanceof Element) ||
          !(type === "childList" ? target : target.parentElement)?.closest(protectedContent),
      )
    ) {
      frame = requestAnimationFrame(reconcile);
    }
  });
  ipc.renderer.on("gmail.extendDarkThemeChanged", (_event, enabled) => {
    if (enabled === (sheet !== undefined)) {
      return;
    }
    if (enabled) {
      sheet = webFrame.insertCSS([chromeCss, GMAIL_EDITOR_DARK_THEME_CSS, readerCss].join("\n"), {
        cssOrigin: "user",
      });
      reconcile();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "class",
          "contenteditable",
          "data-legacy-thread-id",
          "data-legacy-message-id",
          "data-message-id",
        ],
      });
    } else {
      observer.disconnect();
      cancelAnimationFrame(frame);
      frame = 0;
      for (const controller of panels.values()) {
        controller.revert();
      }
      panels.clear();
      for (const [body, { button }] of messages) {
        body.removeAttribute(modeAttribute);
        button.remove();
      }
      messages.clear();
      originals.clear();
      if (sheet !== undefined) {
        webFrame.removeInsertedCSS(sheet);
        sheet = undefined;
      }
    }
  });
}
