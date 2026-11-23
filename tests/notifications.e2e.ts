import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { configSwitch, openSettingsPage } from "./lib/settings";

const env: Record<string, string> = {};
let entries: string[] = [];
const server = createServer((request, response) => {
  if (!request.url?.includes("/feed/atom")) {
    response.setHeader("Content-Type", "text/html");
    response.end('<main role="main"></main><script>window.GM_INBOX_TYPE = "CLASSIC"</script>');
    return;
  }
  const now = new Date().toISOString();
  response.end(
    `<feed><title>Mail</title><tagline>Inbox</tagline><modified>${now}</modified><fullcount>${entries.length}</fullcount>${entries.join("")}</feed>`,
  );
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.GGMAIL_TEST_GMAIL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mail/u/0`;
});
test.beforeEach(() => {
  entries = [];
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const ggmail = useApp(
  {
    accounts: [
      seedAccount({ id: "Personal", label: "Personal" }),
      seedAccount({
        id: "Other",
        label: "Other",
        selected: false,
        notifications: false,
        unifiedInbox: false,
      }),
    ],
    "notifications.playSound": false,
    "notifications.showSummary": false,
  },
  { env },
);

// Exercise Electron's real constructor, events and IPC without posting banners to the user's desktop.
type TestProcess = typeof globalThis & { captured: Electron.Notification[] };
test.beforeEach(async () => {
  await ggmail.app.evaluate(({ Notification }) => {
    const captured: Electron.Notification[] = [];
    (globalThis as TestProcess).captured = captured;
    Notification.isSupported = () => true;
    Notification.prototype.show = function () {
      captured.push(this);
      this.emit("show", {});
    };
  });
});

async function alerts() {
  return ggmail.app.evaluate(() =>
    (globalThis as TestProcess).captured.map(
      ({ title, subtitle, body, silent, groupId, actions }) => ({
        title,
        subtitle,
        body,
        silent,
        groupId,
        actions: actions.map(({ text }) => text),
      }),
    ),
  );
}

test("privacy switches update both previews, and schedule and volume changes persist", async () => {
  const page = await ggmail.openSettings();
  await openSettingsPage(page, "Notifications");
  const preview = page.getByTestId("notification-preview");
  await expect(preview).toContainText("Tim from ggmail");
  await configSwitch(page, "notifications.showSender").click();
  await configSwitch(page, "notifications.showSubject").click();
  await expect(preview).toHaveText("Personal");
  await page.getByRole("button", { name: "Show test notification" }).click();
  await expect
    .poll(alerts)
    .toMatchObject([{ title: "Personal", subtitle: "", body: "", silent: true }]);
  await page.getByRole("button", { name: "Add time window" }).click();
  await expect(page.getByRole("button", { name: "Every day" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Friday" }).click();
  await page.getByLabel("Start time").fill("22:00");
  await page.getByLabel("End time").fill("06:00");
  await expect
    .poll(async () => (await ggmail.readConfig())["notifications.times"])
    .toMatchObject([{ start: "22:00", end: "06:00", days: [5] }]);
  await configSwitch(page, "notifications.playSound").click();
  const volume = page.getByRole("slider", { name: /Volume/ });
  await volume.press("ArrowLeft");
  await expect.poll(async () => (await ggmail.readConfig())["notifications.volume"]).toBe(0.95);
  await ggmail.closeSettings();
  expect(await ggmail.runMenuCommand("Turn Do Not Disturb on")).toBe(true);
  const reopened = await ggmail.openSettings();
  await openSettingsPage(reopened, "Notifications");
  await expect(reopened.getByRole("button", { name: "Show test notification" })).toBeDisabled();
  await expect(reopened.getByLabel("Start time")).toHaveValue("22:00");
  await expect(reopened.getByRole("slider", { name: /Volume/ })).toHaveValue("95");
});

async function receive(subject: string) {
  const id = `194a92f8c000000${entries.length + 1}`;
  const now = new Date().toISOString();
  entries.unshift(
    `<entry><title>${subject}</title><summary>Message body</summary><link href="https://mail.google.com/mail/u/0/?message_id=${id}"/><modified>${now}</modified><issued>${now}</issued><id>tag:mail:${id}</id><author><name>Sender</name><email>sender@example.test</email></author></entry>`,
  );
  await ggmail.app.evaluate(({ webContents, session, ipcMain }, count) => {
    const sender = webContents
      .getAllWebContents()
      .find((view) => view.session === session.fromPartition("persist:Personal"));
    if (!sender) {
      throw new Error("Missing Gmail view");
    }
    ipcMain.emit("gmail.unreadCountChanged", { sender }, String(count));
  }, entries.length);
  await expect(ggmail.renderer.getByText(subject, { exact: true })).toBeVisible();
  return id;
}

test("incoming code alerts honor privacy and quiet mode, and a mail click returns to Gmail", async () => {
  await ggmail.renderer.getByRole("button", { name: "All Mail" }).click();
  await expect(ggmail.renderer.getByTitle("Personal is up to date")).toBeVisible();
  await receive("Your verification code is 123456");
  await expect
    .poll(alerts)
    .toMatchObject([
      { title: "[Personal] Sender", body: "Verification code", actions: ["Copy"], silent: true },
    ]);
  expect(await ggmail.runMenuCommand("Turn Do Not Disturb on")).toBe(true);
  await receive("Your verification code is 987654");
  expect(await alerts()).toHaveLength(1);
  expect(await ggmail.runMenuCommand("Turn Do Not Disturb off")).toBe(true);
  const id = await receive("Meeting notes");
  await expect.poll(alerts).toHaveLength(2);
  await ggmail.app.evaluate(() => (globalThis as TestProcess).captured[1]?.emit("click", {}));
  await expect
    .poll(() =>
      ggmail.app.evaluate(
        ({ webContents }, id) =>
          webContents.getAllWebContents().some((view) => view.getURL().endsWith("#inbox/" + id)),
        id,
      ),
    )
    .toBe(true);
  await expect(ggmail.renderer).toHaveURL(/#\/$/);
});

test("a failed automatic code copy offers a retry and performs one clipboard write per interaction", async () => {
  await ggmail.renderer.evaluate(() =>
    window.electron.ipcRenderer.invoke("config.setConfig", {
      "verificationCodes.copyMode": "immediately",
      "verificationCodes.autoDelete": false,
      "verificationCodes.autoMarkAsRead": false,
      "notifications.showSummary": true,
    }),
  );
  await ggmail.app.evaluate(({ clipboard }) => {
    const attempts: string[] = [];
    (globalThis as typeof globalThis & { attempts: string[] }).attempts = attempts;
    clipboard.writeText = async (text) => {
      attempts.push(text);
      if (attempts.length === 1) {
        throw new Error("Clipboard busy");
      }
    };
  });
  await ggmail.renderer.getByRole("button", { name: "All Mail" }).click();
  await expect(ggmail.renderer.getByTitle("Personal is up to date")).toBeVisible();
  await receive("Your verification code is 456789");
  await expect
    .poll(alerts)
    .toMatchObject([{ body: "Verification code 456789", actions: ["Copy"] }]);
  await ggmail.app.evaluate(() => {
    const alert = (globalThis as TestProcess).captured[0];
    alert?.emit("action", { actionIndex: 0 });
    alert?.emit("click", {});
  });
  await expect
    .poll(() =>
      ggmail.app.evaluate(
        () => (globalThis as typeof globalThis & { attempts: string[] }).attempts,
      ),
    )
    .toEqual(["456789", "456789"]);
  await receive("Your verification code is 567890");
  await expect
    .poll(async () => (await alerts()).at(-1))
    .toMatchObject({ body: "Copied verification code 567890", actions: [] });
});
