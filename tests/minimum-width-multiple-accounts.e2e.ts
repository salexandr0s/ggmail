/*
 * The unified inbox at the window's minimum width.
 *
 * Pro with two accounts, which is what offers the unified inbox. Its messages
 * are pushed the way main pushes a changed feed, since no account here is
 * signed in to have one.
 */
import type { GmailInboxMessage } from "@ggmail/shared/gmail";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { readPageMisfits, setMinimumWindowWidth } from "./lib/page-fit";

const FIRST_ACCOUNT_ID = "first";

const SECOND_ACCOUNT_ID = "second";

const ggmail = useApp({
  accounts: [
    seedAccount({ id: FIRST_ACCOUNT_ID, label: "First" }),
    seedAccount({ id: SECOND_ACCOUNT_ID, label: "Second", selected: false }),
  ],
});

function seedMessages(accountId: string): GmailInboxMessage[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `${accountId}-${index}`,
    subject: `Quarterly planning notes and the follow-ups everyone agreed to take on ${index}`,
    summary: "A summary long enough to fill the row it is shown in, and then some more of it.",
    author: { name: "Alexandra Montgomery-Fitzgerald", email: "alexandra@example.com" },
    contributors: [],
    receivedAt: Date.now() - index * 60_000,
  }));
}

test("the unified inbox fits the window at its minimum width", async () => {
  await setMinimumWindowWidth(ggmail);

  expect(await ggmail.runMenuCommand("All Mail")).toBe(true);

  await expect(ggmail.renderer.getByTestId("settings-title")).toHaveText("All Mail");

  const findings: string[] = [];

  const check = async (where: string) => {
    const windowWidth = await ggmail.renderer.evaluate(() => innerWidth);
    for (const misfit of await readPageMisfits(ggmail.renderer)) {
      findings.push(`${windowWidth}px ${where}: ${misfit}`);
    }
  };

  await check("empty");

  const reset = ggmail.gmailStandIn.serveGmailPages(() => "<main>Inbox</main>");
  await ggmail.app.evaluate(
    async ({ webContents, session }, { ids, url }) => {
      for (const id of ids) {
        const view = webContents
          .getAllWebContents()
          .find((w) => w.session === session.fromPartition("persist:" + id));
        await view?.loadURL(url);
      }
    },
    { ids: [FIRST_ACCOUNT_ID, SECOND_ACCOUNT_ID], url: ggmail.gmailStandIn.gmailUrl },
  );
  reset();
  await ggmail.app.evaluate(
    ({ BrowserWindow }, pushes) => {
      const window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().includes("main.html"),
      );

      for (const [accountId, messages] of pushes) {
        window?.webContents.send("gmail.inboxChanged", accountId, { status: "ready", messages });
      }
    },
    [FIRST_ACCOUNT_ID, SECOND_ACCOUNT_ID].map((id) => [id, seedMessages(id)] as const),
  );

  await expect(ggmail.renderer.getByRole("row")).toHaveCount(10);

  await check("with messages");

  // The optional unrestricted window supports 320px. The two-line header must
  // leave both the close button and its keyboard hint clear of the search field.
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes("main.html"),
    );
    window?.setMinimumSize(320, 320);
  });
  await setMinimumWindowWidth(ggmail);
  await check("unrestricted with messages");

  const picker = ggmail.renderer.getByRole("button", { name: "Filter by account" });
  const accounts = ggmail.renderer.getByRole("dialog", { name: "Filter by account" });
  await ggmail.renderer.getByRole("button", { name: "Next page" }).click();
  await expect(ggmail.renderer.getByRole("row")).toHaveCount(2);
  await expect(ggmail.renderer.getByRole("row").first()).toBeFocused();
  const first = accounts.getByRole("button", { name: "First", exact: true });
  await picker.click();
  await first.click();
  await expect(accounts).toBeHidden();
  await expect(picker).toHaveAccessibleDescription("First");
  await expect(ggmail.renderer.getByRole("row")).toHaveCount(6);
  await expect(ggmail.renderer.getByRole("row", { name: /Second/ })).toHaveCount(0);
  expect(await ggmail.runMenuCommand("Waiting for reply")).toBe(true);
  await expect(
    ggmail.renderer.getByRole("heading", { name: "Waiting for reply", exact: true }),
  ).toBeVisible();
  expect(await ggmail.runMenuCommand("All Mail")).toBe(true);
  await expect(picker).toHaveAccessibleDescription("First");
  await expect(ggmail.renderer.getByRole("row")).toHaveCount(6);
  await picker.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await accounts.getByRole("button", { name: "All accounts" }).click();
  await expect(ggmail.renderer.getByRole("row")).toHaveCount(10);

  const row = ggmail.renderer.getByRole("row").first();
  const subject = row.getByRole("button", { name: /Quarterly planning notes/ });
  const initialBox = await subject.boundingBox();
  await subject.focus();
  await ggmail.renderer.keyboard.press("Tab");
  const more = row.getByRole("button", { name: "More options" });
  await expect(more).toBeFocused();
  await more.press("Enter");
  const menu = ggmail.renderer.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Archive" })).toBeVisible();
  await ggmail.renderer.keyboard.press("Escape");
  await expect(more).toBeFocused();
  expect((await subject.boundingBox())?.width).toBe(initialBox?.width);

  await ggmail.renderer.keyboard.press("/");
  await expect(ggmail.renderer.getByRole("searchbox")).toBeFocused();

  await ggmail.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().includes("main.html"))
      ?.setContentSize(360, 440);
  });
  await expect
    .poll(() =>
      picker
        .getByText("All accounts", { exact: true })
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    )
    .toBe(true);
  const feed = ggmail.renderer.locator(".inbox-feed");
  const listTop = await row.evaluate((el) => el.getBoundingClientRect().top);
  expect(listTop).toBeLessThan(200);
  test.info().annotations.push({ type: "First unread row", description: String(listTop) });
  await feed.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect(picker).toBeInViewport();
  await feed.evaluate((el) => {
    el.scrollTop = 0;
  });
  await ggmail.renderer.screenshot({
    animations: "disabled",
    path: test.info().outputPath("all-mail-compact.png"),
  });
  // Use the compact menu on the first mailbox's most recent message.
  await ggmail.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("gmail.handleMessage");
    ipcMain.handle("gmail.handleMessage", (_event, ...args) => {
      Reflect.set(globalThis, "compactInboxAction", args);
    });
  });
  const firstRow = ggmail.renderer.getByRole("row", { name: /First.*take on 0/ });
  await firstRow.getByRole("button", { name: "More options" }).click();
  await menu.getByRole("menuitem", { name: "Archive" }).focus();
  await ggmail.renderer.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Mark as read" })).toBeFocused();
  await ggmail.renderer.keyboard.press("Enter");
  await expect
    .poll(() => ggmail.app.evaluate(() => Reflect.get(globalThis, "compactInboxAction")))
    .toEqual([FIRST_ACCOUNT_ID, "first-0", "markAsRead"]);
  await expect(firstRow.getByRole("button", { name: "More options" })).toBeFocused();
  await expect(picker).toBeInViewport();

  // A wider, short window fits search and mailbox selection on the same line.
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().includes("main.html"))
      ?.setContentSize(760, 440);
  });
  await expect(picker).toBeInViewport();
  const pickerTop = await picker.evaluate((el) => el.getBoundingClientRect().top);
  const searchTop = await ggmail.renderer
    .getByRole("searchbox")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(pickerTop - searchTop)).toBeLessThan(12);
  expect(findings).toEqual([]);
});
