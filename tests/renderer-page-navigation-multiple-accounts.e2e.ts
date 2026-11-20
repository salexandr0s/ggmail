import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useApp } from "./lib/app";
import {
  expectNavigationOpensInBrowser,
  expectNewWindowOpensOnlyWebLinks,
  expectReturnFromNavigation,
  findRendererPage,
  stubBrowser,
} from "./lib/renderer-navigation";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const MEET_URL = "https://meet.google.com/e2e-picker";

/** Titled apart from the app's label, so the tab reading it proves the page arrived. */
const MEET_PAGE_TITLE = "Meet Stand-In";

const ggmail = useApp({
  // The system picker answers on the operating system's side and never opens
  // ggmail's page.
  "screenShare.useSystemPicker": false,
  accounts: [
    seedAccount({
      id: ACCOUNT_ID,
      label: "Personal",
      savedTabs: [seedSavedTab({ app: "meet", url: MEET_URL, title: "Meet" })],
    }),
  ],
});

test.beforeEach(async () => {
  await stubBrowser(ggmail);
});

async function openPicker() {
  await ggmail.app.evaluate(
    ({ desktopCapturer, session }, { partition, title }) => {
      session.fromPartition(partition).protocol.handle(
        "https",
        () =>
          new Response(`<!doctype html><title>${title}</title>`, {
            headers: { "content-type": "text/html" },
          }),
      );

      // The picker lists sources through this, which on macOS asks for the
      // screen recording permission, a prompt no test is here to answer.
      desktopCapturer.getSources = async () => [];
    },
    { partition: `persist:${ACCOUNT_ID}`, title: MEET_PAGE_TITLE },
  );

  await ggmail.renderer.getByRole("button", { name: "Meet" }).click();

  await expect(ggmail.renderer.getByRole("button", { name: MEET_PAGE_TITLE })).toBeVisible();

  // With a user gesture, which Chromium requires of a screen share request.
  await ggmail.app.evaluate(({ webContents }, meetUrl) => {
    webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL() === meetUrl)
      ?.executeJavaScript("navigator.mediaDevices.getDisplayMedia({ video: true })", true)
      .catch(() => undefined);
  }, MEET_URL);

  return findRendererPage(ggmail, "desktop-sources");
}

test("a navigation away from the screen share picker opens in the browser and leaves it where it was", async () => {
  await expectNavigationOpensInBrowser(ggmail, await openPicker());
});

test("a new window from the screen share picker opens in the browser only for a web link", async () => {
  await expectNewWindowOpensOnlyWebLinks(ggmail, await openPicker());
});

test("the screen share picker comes back from about:blank with its bridge", async () => {
  await expectReturnFromNavigation(ggmail, await openPicker(), "about:blank");
});
