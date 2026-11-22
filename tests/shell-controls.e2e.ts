/// <reference lib="dom" />
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";

const personal = seedAccount({ id: "shell-personal", label: "Personal" });
const work = seedAccount({ id: "shell-work", label: "Work", selected: false });
const brief = "https://docs.google.com/document/d/project-brief/edit";
personal.workspaceApps.bookmarks = [
  { id: "brief", title: "Café planning", url: brief, app: "docs" },
  {
    id: "events",
    title: "Team calendar",
    url: "https://calendar.google.com/calendar/u/0",
    app: "calendar",
  },
];
const ggmail = useApp({
  accounts: [personal, work],
  "gmail.savedSearches": Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    label: "Project messages " + i,
    query: "subject:project" + i,
  })),
});

test("the account toolbar previews a keyboard selection before switching mailboxes", async () => {
  const row = ggmail.renderer.getByRole("toolbar", { name: "Accounts" });
  const first = row.getByRole("button", { name: "Personal" });
  const second = row.getByRole("button", { name: "Work" });
  await expect(first).toHaveAttribute("tabindex", "0");
  await first.focus();
  await first.press("End");
  await expect(second).toBeFocused();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await second.press("ArrowRight");
  await expect(first).toBeFocused();
  await first.press("ArrowRight");
  await second.press("Enter");
  await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("bookmarks filter by title and destination and open from the keyboard", async () => {
  await ggmail.app.evaluate(({ session }) => {
    session.fromPartition("persist:shell-personal").protocol.handle(
      "https",
      () =>
        new Response("<title>Project brief</title>", {
          headers: { "content-type": "text/html" },
        }),
    );
  });
  const opening = ggmail.renderer.context().waitForEvent("page");
  await ggmail.renderer.getByRole("button", { name: "Bookmarks" }).click();
  const popup = await opening;
  const filter = popup.getByRole("searchbox", { name: "Search bookmarks" });
  const briefButton = popup.getByRole("button", { name: "Café planning" });
  await expect(filter).toBeFocused();
  await expect(briefButton).toContainText("docs.google.com");
  await popup.screenshot({ path: test.info().outputPath("bookmarks.png") });
  await filter.fill("absent");
  await expect(popup.getByRole("status")).toHaveText("No matching bookmarks");
  await filter.press("Escape");
  await expect(filter).toHaveValue("");
  await filter.fill("docs cafe");
  await expect(popup.getByRole("button", { name: "Team calendar" })).toHaveCount(0);
  await filter.press("ArrowDown");
  await expect(briefButton).toBeFocused();
  await filter.focus();
  // The popup closes on keydown, before Chromium can acknowledge keyup.
  await popup.keyboard.down("Enter");
  await expect.poll(() => ggmail.app.windows().some((page) => page.url() === brief)).toBe(true);
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("Find steps both ways, reselects its query and closes from the controls", async () => {
  const page = ggmail.renderer;
  await expect
    .poll(() => ggmail.app.windows().some((p) => p.url() === ggmail.gmailStandIn.signInUrl))
    .toBe(true);
  for (const mailbox of ggmail.app
    .windows()
    .filter((p) => p.url() === ggmail.gmailStandIn.signInUrl)) {
    await mailbox.evaluate(() => {
      document.body.textContent = "needle one, needle two, needle three";
    });
  }
  expect(await ggmail.runMenuCommand("Find…")).toBe(true);
  const box = page.getByRole("search", { name: "Find…" });
  const field = box.getByRole("textbox");
  const count = box.getByRole("status");
  await expect(field).toBeFocused();
  await expect(box.getByTitle("Find next match")).toBeDisabled();
  await field.fill("needle");
  await expect(count).toHaveText("1/3");
  await field.press("Enter");
  await expect(count).toHaveText("2/3");
  await field.press("Shift+Enter");
  await expect(count).toHaveText("1/3");
  await box.getByTitle("Find previous match").click();
  await expect(count).toHaveText("3/3");
  expect(await ggmail.runMenuCommand("Find…")).toBe(true);
  await expect(field).toBeFocused();
  await expect
    .poll(() => field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]))
    .toEqual([0, 6]);
  await box.screenshot({ path: test.info().outputPath("find.png") });
  await field.fill("");
  await expect(count).toHaveText("");
  await expect(box.getByTitle("Find previous match")).toBeDisabled();
  await box.getByTitle("Close find in page").press("Escape");
  await expect(box).toHaveCount(0);
});

test("Bookmarks fits the list and follows the sidebar when resizing or removing items", async () => {
  const opening = ggmail.renderer.context().waitForEvent("page");
  await ggmail.renderer.getByRole("button", { name: "Bookmarks" }).click();
  const popup = await opening;
  const viewport = popup.locator('[data-slot="scroll-area-viewport"]');
  const size = () => popup.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await expect(popup.getByRole("button", { name: "Team calendar" })).toBeVisible();
  await expect.poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
  const initial = await size();
  expect(initial.height).toBeLessThan(320);
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("main.html"),
    );
    main?.setMinimumSize(320, 360);
    main?.setContentSize(320, 430);
  });
  const railWidth = await ggmail.renderer
    .getByRole("navigation", { name: "Workspace apps" })
    .evaluate((el) => el.getBoundingClientRect().width);
  await expect.poll(async () => (await size()).width).toBe(320 - railWidth);
  await popup.getByRole("button", { name: "Team calendar" }).focus();
  await popup.getByTitle("Remove bookmark").last().click();
  await expect(popup.getByRole("button", { name: "Team calendar" })).toHaveCount(0);
  await expect.poll(async () => (await size()).height).toBeLessThan(initial.height);
  await popup.getByTitle("Remove bookmark").click();
  await expect(popup.getByText("No bookmarks yet")).toBeVisible();
});

test("Find fits a narrow detached window and searches its own page", async () => {
  await ggmail.app.evaluate(({ session }) => {
    session.fromPartition("persist:shell-personal").protocol.handle(
      "https",
      () =>
        new Response("<title>Document</title><p>A shared document</p><p>A shared calendar</p>", {
          headers: { "content-type": "text/html" },
        }),
    );
  });
  const opening = ggmail.app.waitForEvent("window", (win) =>
    win.url().includes("workspace-app.html"),
  );
  await ggmail.renderer.evaluate(() =>
    window.electron.ipcRenderer.send("workspaceApps.openApp", "docs", "newWindow"),
  );
  const page = await opening;
  await expect(page.getByText("Document", { exact: true })).toBeVisible();
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const detached = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("workspace-app.html"),
    );
    detached?.setMinimumSize(320, 360);
    detached?.setContentSize(360, 440);
    detached?.focus();
    // The macOS test app runs with a prohibited activation policy, so AppKit
    // cannot supply the front window when dispatching its application menu.
    if (process.platform === "darwin" && process.env.GGMAIL_TEST_BACKGROUND) {
      BrowserWindow.getFocusedWindow = () => detached ?? null;
    }
  });
  expect(await ggmail.runMenuCommand("Find…")).toBe(true);
  const box = page.getByRole("search", { name: "Find…" });
  const field = box.getByRole("textbox");
  await expect(field).toBeFocused();
  await field.fill("shared");
  await expect(box.getByRole("status")).toHaveText("1/2");
  expect(await field.evaluate((el) => el.clientWidth)).toBeGreaterThan(50);
  const close = box.getByTitle("Close find in page");
  expect(await close.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(360);
  await close.click();
  await expect(box).toHaveCount(0);
  await expect(page.getByTitle("More options")).toBeVisible();
});

test("compact shell keeps mail, tools and rail shortcuts reachable", async () => {
  const page = ggmail.renderer;
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("main.html"),
    );
    w?.setMinimumSize(320, 320);
    w?.setContentSize(360, 360);
  });
  const rail = page.getByRole("navigation", { name: "Workspace apps" });
  await expect(rail).toHaveCSS("width", "44px");
  const viewBounds = await ggmail.app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const w = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("main.html"),
    );
    return w?.contentView.children
      .filter((v) => v instanceof WebContentsView && v.getVisible())
      .map((v) => v.getBounds());
  });
  expect(viewBounds).toContainEqual({ x: 44, y: 48, width: 316, height: 312 });
  const apps = rail.locator(".workspace-sidebar-apps");
  await expect.poll(() => apps.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await rail.getByRole("button", { name: "Drive", exact: true }).press("ArrowDown");
  await expect(rail.getByRole("button", { name: "Sheets", exact: true })).toBeFocused();
  await expect.poll(() => apps.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(rail.getByRole("button", { name: "Settings", exact: true })).toBeInViewport();
  const tools = page.getByRole("button", { name: "More options" });
  const saved = page.getByTitle("Show saved searches");
  const picker = page.getByRole("button", { name: "Mail views" });
  await expect(picker).toBeInViewport();
  await expect(saved).toBeHidden();
  await tools.press("Enter");
  const back = page.locator(".mail-tools-toggle");
  await expect(back).toHaveAttribute("aria-expanded", "true");
  await expect(saved).toBeInViewport();
  await back.press("End");
  await expect(saved).toBeFocused();
  await saved.press("Escape");
  await expect(tools).toBeFocused();
  await expect(picker).toBeInViewport();
  const mail = rail.getByRole("button", { name: "Mail", exact: true });
  await mail.press("End");
  await expect(rail.getByRole("button", { name: "Settings" })).toBeFocused();
  await rail.getByRole("button", { name: "Settings" }).press("ArrowUp");
  await expect(rail.getByRole("button", { name: "Bookmarks" })).toBeFocused();
  expect(await ggmail.runMenuCommand("All Mail")).toBe(true);
  await expect(page.getByRole("heading", { name: "All Mail" })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("shell-compact.png"),
    animations: "disabled",
  });

  // Capture Electron's native menu at the platform boundary and exercise its last entry.
  await ggmail.app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function (options) {
      Reflect.set(
        globalThis,
        "compactToolLabels",
        this.items.map((item) => item.label),
      );
      this.items.at(-1)?.click();
      options?.callback?.();
    };
  });
  await tools.click();
  await saved.press("ArrowDown");
  await expect
    .poll(() => ggmail.app.evaluate(() => Reflect.get(globalThis, "compactToolLabels")))
    .toEqual(Array.from({ length: 8 }, (_, i) => "Project messages " + i));
  await expect(page.getByRole("searchbox")).toHaveValue("subject:project7");
  await expect(picker).toBeInViewport();
});
