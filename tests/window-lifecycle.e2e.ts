/*
 * Quitting from the menu and starting the app again on the same profile brings
 * the window back with the account on screen, every time.
 *
 * A start on a profile that has quit before is not the first start: it restores
 * the window state and tabs the quit saved, and an app that comes up from those
 * with its window hidden, or with the account's view stacked underneath, shows
 * nothing until somebody finds the tray. Read without Playwright attached,
 * because an attached page reports "visible" whatever is on screen.
 */
import { ms } from "@ggmail/shared/ms";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type UnattachedApp, useUnattachedApp } from "./lib/unattached-app";
import { expectOnScreen, waitForAccountViews } from "./lib/visibility";

const ACCOUNT_ID = "only-account";

const RESTARTS = 3;

/** How long a start is given to show its window, as `visibility.ts` gives a view. */
const WINDOW_TIMEOUT = ms("15s");

const ggmail = useUnattachedApp({
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
});

async function expectWindowWithAccount(app: UnattachedApp, start: string) {
  await expect
    .poll(
      () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((window) => ({
            renderer: window.webContents.getURL().includes("main.html"),
            visible: window.isVisible(),
            minimized: window.isMinimized(),
          })),
        ),
      {
        message: `on the ${start}, the app has one window, shown and not minimized`,
        timeout: WINDOW_TIMEOUT,
      },
    )
    .toEqual([{ renderer: true, visible: true, minimized: false }]);

  await waitForAccountViews(app, [ACCOUNT_ID]);

  await expectOnScreen(app, [ACCOUNT_ID], ACCOUNT_ID);
}

test("the window comes back with the account on screen after each quit and start", async () => {
  await expectWindowWithAccount(ggmail, "first start");

  for (let restart = 1; restart <= RESTARTS; restart++) {
    expect(await ggmail.quit(), `the exit code of quit ${restart} from the menu`).toBe(0);

    await ggmail.relaunch();

    await expectWindowWithAccount(ggmail, `start after quit ${restart} of ${RESTARTS}`);
  }
});
