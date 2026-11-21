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

const ggmail = useApp(
  {
    accounts: [
      seedAccount({ id: FIRST_ACCOUNT_ID, label: "First" }),
      seedAccount({ id: SECOND_ACCOUNT_ID, label: "Second", selected: false }),
    ],
  },
  { args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] },
);

function seedMessages(accountId: string): GmailInboxMessage[] {
  return Array.from({ length: 5 }, (_, index) => ({
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

  expect(findings).toEqual([]);
});
