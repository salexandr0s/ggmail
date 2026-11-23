import { ipc } from "@ggmail/shared/renderer/ipc";
import { t } from "@lingui/core/macro";
import { webFrame } from "electron";
import css from "./row-context-menu.css";

// Gmail owns row selection, bulk actions, nested menus and keyboard shortcuts.
// Extend only the menu opened by this particular single-row gesture.
export function initRowContextMenu() {
  webFrame.insertCSS(css);
  let cleanup = () => {};
  document.addEventListener(
    "contextmenu",
    (event) => {
      cleanup();
      if (!event.isTrusted || !(event.target instanceof Element)) {
        return;
      }
      const row = event.target.closest('[role="main"] tr.zA');
      if (!row || row.closest(".a3s, [contenteditable]")) {
        return;
      }
      const id = (
        row.getAttribute("data-legacy-thread-id") ??
        row.querySelector("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id")
      )?.replace(/^#/, "");
      if (!id || !/^[\da-f]{15,16}$/i.test(id)) {
        return;
      }
      const thread = {
        id,
        sender: (row.querySelector(".yW")?.textContent ?? "").trim().slice(0, 512),
        subject: (row.querySelector(".bog")?.textContent ?? "").trim().slice(0, 512),
        snippet: (row.querySelector(".y2")?.textContent ?? "")
          .trim()
          .replace(/^[-–]\s*/, "")
          .slice(0, 4096),
      };
      const visibleMenus = () =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]')).filter(
          (menu) =>
            menu.checkVisibility({ visibilityProperty: true }) &&
            menu.getClientRects().length &&
            !menu.closest('.a3s, [contenteditable], [aria-hidden="true"]'),
        );
      const previous = new Set(visibleMenus());
      const atPointer = (menu: HTMLElement) => {
        const box = menu.getBoundingClientRect();
        return (
          event.clientX >= box.left - 6 &&
          event.clientX <= box.right + 6 &&
          event.clientY >= box.top - 6 &&
          event.clientY <= box.bottom + 6
        );
      };
      const locationAtClick = location.href;
      const group = document.createElement("div");
      group.className = "ggmail-thread-actions";
      group.setAttribute("role", "group");
      const actions = [
        { id: "quote", label: t`Quote to assistant`, path: "M4 5h16v12H9l-5 4V5Z M8 9h3m2 0h3" },
        {
          id: "calendar",
          label: t`Add to Calendar…`,
          path: "M4 6h16v14H4z M8 3v5m8-5v5M4 10h16m-8 3v5m-2.5-2.5h5",
        },
      ] as const;
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const path = document.createElementNS(icon.namespaceURI, "path");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("aria-hidden", "true");
        path.setAttribute("d", action.path);
        icon.append(path);
        button.append(icon, action.label);
        button.addEventListener("mousedown", (e) => e.stopPropagation());
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!e.isTrusted || location.href !== locationAtClick || !group.isConnected) {
            return;
          }
          ipc.main.send("contextMenu.rowAction", action.id, thread);
          document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          cleanup();
        });
        group.append(button);
      }
      let menu: HTMLElement | undefined;
      const remove = () => {
        clearTimeout(timeout);
        cancelAnimationFrame(frame);
        observer.disconnect();
        menu?.style.removeProperty("--ggmail-menu-space");
        group.remove();
        if (cleanup === remove) {
          cleanup = () => {};
        }
        window.removeEventListener("hashchange", remove);
      };
      const update = () => {
        if (menu) {
          if (
            !group.isConnected ||
            !menu.checkVisibility({ visibilityProperty: true }) ||
            menu.getAttribute("aria-hidden") === "true"
          ) {
            remove();
          }
          return;
        }
        if (
          locationAtClick !== location.href ||
          (row.closest('[role="main"]')?.querySelectorAll("tr.zA.x7").length ?? 0) > 1
        ) {
          remove();
          return;
        }
        menu = visibleMenus().find(
          (item) =>
            (!previous.has(item) || atPointer(item)) && item.querySelector('[role="menuitem"]'),
        );
        if (!menu) {
          return;
        }
        clearTimeout(timeout);
        // Let Gmail measure and position its own rows. The extra section scrolls with them.
        menu.prepend(group);
        const box = menu.getBoundingClientRect();
        menu.style.setProperty("--ggmail-menu-space", window.innerHeight - box.top - 6 + "px");
        observer.disconnect();
        observer.observe(menu, { attributes: true, childList: true });
      };
      const observer = new MutationObserver(update);
      const timeout = window.setTimeout(remove, 800);
      const frame = requestAnimationFrame(update);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["style", "aria-hidden", "class", "hidden"],
      });
      window.addEventListener("hashchange", remove);
      cleanup = remove;
    },
    true,
  );
}
