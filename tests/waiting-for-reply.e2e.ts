import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { localDay } from "@ggmail/shared/follow-ups";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";

const env: Record<string, string> = {};
const id = "194a92f8c0000001";
const firstDate = "Nov 19, 2026 at 1:00 PM";
let replied = false;
let failPrint = false;
let pausePrint: (() => Promise<void>) | undefined;
let unread = true;
let workSessionExpired = false;
let workUnread = false;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const account = req.headers.cookie?.match(/mailbox=(Personal|Work)/)?.[1];
  if (url.searchParams.get("view") === "pt") {
    await pausePrint?.();
    if (failPrint) {
      res.writeHead(503).end();
      return;
    }
    const message = (sender: string, date: string) => `<table class="message">
      <tr><td>${sender}@example.test</td><td>${date}</td></tr>
      <tr><td>To: Recipient &lt;recipient@example.test&gt;</td></tr>
      <tr><td>Can you confirm the date?</td></tr></table>`;
    res.end(
      message(account ?? "", firstDate) +
        (replied && account === "Work"
          ? message("recipient", "Nov 20") + message("Work", "Nov 21")
          : ""),
    );
  } else if (url.pathname.includes("/feed/atom")) {
    if (workSessionExpired && account === "Work") {
      res.writeHead(401).end();
      return;
    }
    const entry =
      (unread && account === "Personal") || (workUnread && account === "Work")
        ? `<entry><title>Ready message</title><summary>Unread</summary><link href="https://mail.google.com/mail/u/0/?message_id=${id}"/><modified>2026-11-19T12:00:00Z</modified><issued>${account === "Work" ? "2026-11-20" : "2026-11-19"}T12:00:00Z</issued><id>${id}</id><author><name>Sender</name><email>sender@example.test</email></author></entry>`
        : "";
    res.end(
      `<feed><title>Mail</title><tagline>Inbox</tagline><modified>2026-11-19T12:00:00Z</modified><fullcount>${entry ? 1 : 0}</fullcount>${entry}</feed>`,
    );
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<meta name="og-profile-acct" content="${account}@example.test"><main role="main"><h2 class="hP" data-legacy-thread-id="${id}">${account} invoice</h2></main>${account ? '<script>window.GM_INBOX_TYPE = "CLASSIC"</script>' : ""}`,
    );
  }
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.GGMAIL_TEST_GMAIL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mail/u/0`;
});
test.beforeEach(() => {
  replied = false;
  failPrint = false;
  pausePrint = undefined;
  unread = true;
  workSessionExpired = false;
  workUnread = false;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const ggmail = useApp(
  {
    accounts: [
      seedAccount({ id: "Personal", label: "Personal" }),
      seedAccount({ id: "Work", label: "Work", selected: false }),
      seedAccount({ id: "Off", label: "Off", disabled: true, selected: false }),
    ],
  },
  { env, args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] },
);

async function openMailbox(account: string, signedOut = false) {
  await ggmail.app.evaluate(
    async ({ session, webContents, ipcMain }, { account, url, id, signedOut }) => {
      const partition = session.fromPartition("persist:" + account);
      const view = webContents.getAllWebContents().find((w) => w.session === partition);
      if (!view) {
        throw new Error("No Gmail view");
      }
      await partition.cookies.set({ url, path: "/", name: "mailbox", value: account });
      await view.loadURL(signedOut ? "about:blank" : url + "?load=" + Date.now() + "#sent/" + id);
      // The real Gmail preload reports its profile meta tag only on mail.google.com.
      if (!signedOut) {
        ipcMain.emit(
          "gmail.setUserEmail",
          { sender: view },
          account.toLowerCase() + "@example.test",
        );
      }
    },
    { account, id, url: env.GGMAIL_TEST_GMAIL_URL ?? "", signedOut },
  );
}

test("partial feeds show mail and the owning sign-in action before an empty all-clear", async () => {
  const page = ggmail.renderer;
  await openMailbox("Personal");
  await page.getByRole("button", { name: "All Mail" }).click();
  await expect(page.getByText("Personal is up to date")).toBeVisible();
  await expect(page.getByText("Work is still syncing", { exact: false })).toBeVisible();
  await expect(page.getByText("Ready message")).toBeVisible();
  await expect(page.getByText("No unread messages")).toHaveCount(0);
  await openMailbox("Work", true);
  await page.getByRole("button", { name: "Sign in to Work" }).click();
  await expect
    .poll(async () => (await ggmail.readConfig()).accounts?.find((a) => a.selected)?.id)
    .toBe("Work");
  unread = false;
  await openMailbox("Work");
  await openMailbox("Personal");
  await page.getByRole("button", { name: "All Mail" }).click();
  await expect(page.getByText("No unread messages")).toBeVisible();
  await expect(page.getByText("Work is up to date", { exact: false })).toBeVisible();
  await expect(page.getByText("Off is still syncing")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("No unread messages")).toBeVisible();
});

test("a late mailbox with the same message ID keeps the keyboard on the selected account", async () => {
  const page = ggmail.renderer;
  await openMailbox("Personal");
  await page.getByRole("button", { name: "All Mail" }).click();
  const personal = page.getByRole("row", { name: /Personal.*Ready message/ });
  await expect(personal).toBeVisible();
  await page.keyboard.press("j");
  await expect(personal).toBeFocused();
  workUnread = true;
  await openMailbox("Work");
  await expect(page.getByRole("row").first()).toContainText("Work");
  await expect(personal).toBeFocused();
  const rowAction = personal.getByRole("button").first();
  await rowAction.focus();
  await openMailbox("Work", true);
  await expect(page.getByRole("button", { name: "Sign in to Work" })).toBeVisible();
  await expect(rowAction).toBeFocused();
  await page.keyboard.press("j");
  await expect(personal).toBeFocused();
  const search = page.getByRole("searchbox", { name: "Search all accounts" });
  await search.fill("invoice");
  await openMailbox("Work");
  await expect(page.getByRole("row").first()).toContainText("Work");
  await expect(search).toBeFocused();
});

test("an expired feed offers a fresh sign-in even while Gmail still displays the old thread", async () => {
  workSessionExpired = true;
  await openMailbox("Work");
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "All Mail" }).click();
  const signIn = page.getByRole("button", { name: "Sign in to Work" });
  await expect(signIn).toBeVisible();
  await expect(page.getByText("No unread messages")).toHaveCount(0);
  workSessionExpired = false;
  await signIn.click();
  await expect
    .poll(() =>
      ggmail.app.evaluate(({ session, webContents }) =>
        webContents
          .getAllWebContents()
          .find((view) => view.session === session.fromPartition("persist:Work"))
          ?.getURL(),
      ),
    )
    .toBe(env.GGMAIL_TEST_GMAIL_URL);
  await page.getByRole("button", { name: "All Mail" }).click();
  await expect(page.getByText("Work is up to date", { exact: false })).toBeVisible();
});

test("losing connectivity keeps unread mail visible and withdraws the up-to-date status", async () => {
  await openMailbox("Personal");
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "All Mail" }).click();
  await expect(page.getByText("Personal is up to date")).toBeVisible();
  // Change the test process's network signal without disconnecting the host Mac.
  await ggmail.app.evaluate(({ net }) => {
    net.isOnline = () => false;
  });
  await expect(page.getByText("Personal will retry syncing")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Ready message")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Personal will retry syncing")).toBeVisible();
  await expect(page.getByText("Ready message")).toBeVisible();
  await expect(page.getByText("No unread messages")).toHaveCount(0);
  await ggmail.app.evaluate(({ net }) => {
    net.isOnline = () => true;
  });
  await expect(page.getByText("Personal is up to date")).toBeVisible({ timeout: 12_000 });
});

test("a thread change during scheduling leaves the waiting list empty", async () => {
  await openMailbox("Personal");
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Waiting for reply", exact: true }).first().click();
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<void>();
  pausePrint = () => {
    started.resolve();
    return response.promise;
  };
  try {
    await page.getByRole("button", { name: "Follow up Friday" }).click();
    await started.promise;
    const mail = ggmail.app.windows().find((tab) => tab.url().endsWith("#sent/" + id));
    if (!mail) {
      throw new Error("Personal thread missing");
    }
    await mail.evaluate(() => {
      window.location.hash = "#inbox";
    });
    await expect(mail).toHaveURL(/#inbox$/);
  } finally {
    response.resolve();
  }
  await expect(page.getByText(/Couldn’t schedule this follow-up/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Personal" })).toContainText("No follow-ups");
});

test("an early reply clears a future follow-up from the waiting list", async () => {
  await openMailbox("Work");
  const page = ggmail.renderer;
  await page.locator('[data-account-id="Work"]').click();
  const waiting = page.getByRole("button", { name: "Waiting for reply", exact: true }).first();
  await waiting.click();
  await page.getByRole("button", { name: "Follow up Friday" }).click();
  const work = page.getByRole("region", { name: "Work" });
  await expect(work).toContainText("Scheduled");
  await page.getByRole("button", { name: "Go back" }).click();
  replied = true;
  await waiting.click();
  await expect(work).toContainText("No follow-ups");
});

test("scheduled follow-ups survive restart and only due threads without replies return", async () => {
  const waiting = () =>
    ggmail.renderer.getByRole("button", { name: "Waiting for reply", exact: true }).first();
  for (const account of ["Personal", "Work"]) {
    await openMailbox(account);
    await ggmail.renderer.locator(`[data-account-id="${account}"]`).click();
    await waiting().click();
    const region = ggmail.renderer.getByRole("region", { name: account });
    await ggmail.renderer.getByRole("button", { name: "Follow up Friday", exact: true }).click();
    await expect(region).toContainText("Scheduled");
    await expect(region).toContainText("recipient@example.test");
    await expect(region).toContainText(firstDate);
    await ggmail.renderer.getByLabel("Follow-up date").fill(localDay());
    await ggmail.renderer.getByRole("button", { name: "Schedule follow-up", exact: true }).click();
    await expect(region).toContainText("Due for follow-up");
    await ggmail.renderer.getByRole("button", { name: "Go back" }).click();
  }
  await ggmail.relaunch();
  await openMailbox("Personal");
  await openMailbox("Work");
  failPrint = true;
  await waiting().click();
  await expect(ggmail.renderer.getByText("Couldn’t verify replies", { exact: false })).toHaveCount(
    2,
  );
  await ggmail.renderer.getByRole("button", { name: "Go back" }).click();
  failPrint = false;
  pausePrint = undefined;
  replied = true;
  await ggmail.renderer.getByRole("button", { name: "All Mail" }).click();
  await expect(ggmail.renderer.getByRole("region", { name: "Personal" })).toContainText(
    "Personal invoice",
  );
  await expect(ggmail.renderer.getByText("Work invoice")).toHaveCount(0);
  await waiting().click();
  await expect(ggmail.renderer.getByRole("region", { name: "Work" })).toContainText(
    "No follow-ups",
  );
  const personal = ggmail.renderer.getByRole("region", { name: "Personal" });
  await personal.getByRole("button", { name: "Remove" }).click();
  await expect(personal).toContainText("No follow-ups");
});
