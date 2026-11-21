/*
 * Deleting one account's browsing data from its row in Settings › Accounts.
 *
 * What a deletion reaches is read straight out of the account's partition in
 * the main process, so a cookie the test planted there is either still in the
 * session or it is not, whatever the page shows.
 *
 * The reload is read off a marker the test leaves on the Gmail view's
 * `window`: a reload builds a new document, which starts without it. The
 * stand-in Gmail redirects to its sign-in page, so the view's document is that
 * page, and so is the origin the localStorage entry belongs to.
 *
 * Pro for the disabled account, since a second account is Pro and the only
 * account cannot be disabled, and for the pinned tab, since saved tabs are.
 */
import { expect, type Locator, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { type GgmailApp, useApp } from "./lib/app";
import { startTestServer, type TestServer } from "./lib/server";
import { openSettingsPage } from "./lib/settings";
import { waitForVerticalTabs } from "./lib/strip";

const COOKIE_NAME = "ggmail-test-cookie";

const LOCAL_STORAGE_KEY = "ggmail-test-local-storage";

function setCookie(ggmail: GgmailApp, accountId: string) {
  return ggmail.app.evaluate(
    ({ session }, { partition, url, name }) =>
      session.fromPartition(partition).cookies.set({
        url,
        name,
        value: "1",
        // Persistent, so it is the kind a session keeps on disk.
        expirationDate: Date.now() / 1000 + 3600,
      }),
    { partition: `persist:${accountId}`, url: ggmail.gmailStandIn.origin, name: COOKIE_NAME },
  );
}

async function hasCookie(ggmail: GgmailApp, accountId: string) {
  const cookies = await ggmail.app.evaluate(
    ({ session }, { partition, name }) => session.fromPartition(partition).cookies.get({ name }),
    { partition: `persist:${accountId}`, name: COOKIE_NAME },
  );

  return cookies.length > 0;
}

/**
 * Runs a script in the account's Gmail view, or reports `undefined` while the
 * view has no settled document to run it in.
 *
 * Found by the stand-in's sign-in page on `localhost`, since the account's
 * workspace tabs share its session and load their pages from `127.0.0.1`.
 */
function evaluateInGmailView(ggmail: GgmailApp, accountId: string, script: string) {
  return ggmail.app.evaluate(
    async ({ BrowserWindow }, { accountId, script }) => {
      const mainWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes("main.html"),
      );

      const view = mainWindow?.contentView.children.find((child) => {
        const { webContents } = child as Electron.WebContentsView;

        return (
          webContents?.session.storagePath?.includes(accountId) &&
          new URL(webContents.getURL() || "about:blank").hostname === "localhost"
        );
      }) as Electron.WebContentsView | undefined;

      if (!view || view.webContents.isLoading()) {
        return undefined;
      }

      return view.webContents.executeJavaScript(script) as Promise<unknown>;
    },
    { accountId, script },
  );
}

/** Marks the Gmail view's document and stores an entry in its localStorage. */
async function markGmailView(ggmail: GgmailApp, accountId: string) {
  await expect
    .poll(() =>
      evaluateInGmailView(
        ggmail,
        accountId,
        `window.ggmailTestMarker = true; localStorage.setItem(${JSON.stringify(LOCAL_STORAGE_KEY)}, "1"); true`,
      ),
    )
    .toBe(true);
}

function readGmailView(ggmail: GgmailApp, accountId: string) {
  return evaluateInGmailView(
    ggmail,
    accountId,
    `({ marked: window.ggmailTestMarker === true, stored: localStorage.getItem(${JSON.stringify(LOCAL_STORAGE_KEY)}) })`,
  );
}

/** The dialog, in the settings window, for the account labelled `label`. */
async function openDeleteBrowsingDataDialog(ggmail: GgmailApp, label: string) {
  const settings = await ggmail.openSettings();

  await openSettingsPage(settings, "Accounts");

  await settings
    .locator('[data-slot="item-group"] [data-slot="item"]')
    .filter({ hasText: label })
    .getByRole("button", { name: "Account actions" })
    .click();

  await settings.getByRole("menuitem", { name: "Delete browsing data…" }).click();

  return settings.getByRole("alertdialog");
}

async function deleteData(dialog: Locator) {
  await dialog.getByRole("button", { name: "Delete data" }).click();

  await expect(dialog.page().getByText("Browsing data deleted")).toBeVisible();

  await expect(dialog).toHaveCount(0);
}

test.describe("with one account", () => {
  const ggmail = useApp({
    accounts: [seedAccount({ id: "first-account", label: "Personal" })],
  });

  test("the defaults delete the cache alone and reload the account", async () => {
    await markGmailView(ggmail, "first-account");

    await setCookie(ggmail, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Personal");

    await expect(dialog.getByRole("checkbox", { name: "Cached images and files" })).toBeChecked();

    await expect(
      dialog.getByRole("checkbox", { name: "Cookies and other site data" }),
    ).not.toBeChecked();

    await deleteData(dialog);

    await expect
      .poll(() => readGmailView(ggmail, "first-account"))
      .toEqual({ marked: false, stored: "1" });

    expect(await hasCookie(ggmail, "first-account")).toBe(true);
  });

  test("deleting cookies signs the account out and reloads it", async () => {
    await markGmailView(ggmail, "first-account");

    await setCookie(ggmail, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Personal");

    await dialog.getByRole("checkbox", { name: "Cookies and other site data" }).click();

    await deleteData(dialog);

    await expect
      .poll(() => readGmailView(ggmail, "first-account"))
      .toEqual({ marked: false, stored: null });

    expect(await hasCookie(ggmail, "first-account")).toBe(false);
  });

  test("nothing checked leaves nothing to delete", async () => {
    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Personal");

    await dialog.getByRole("checkbox", { name: "Cached images and files" }).click();

    await expect(dialog.getByRole("button", { name: "Delete data" })).toBeDisabled();
  });

  test("a failed deletion says so in the dialog and can be tried again", async () => {
    // Electron hands back the same `Session` object for a partition, so this is
    // the one the account clears.
    await ggmail.app.evaluate(({ session }) => {
      session.fromPartition("persist:first-account").clearData = () =>
        Promise.reject(new Error("clearData failed for the test"));
    });

    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Personal");

    await dialog.getByRole("button", { name: "Delete data" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "ggmail couldn't delete this account's browsing data. Try again.",
    );

    await expect(dialog.getByRole("button", { name: "Delete data" })).toBeEnabled();

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();

    await expect(dialog.page().getByText("Browsing data deleted")).toHaveCount(0);
  });
});

test.describe("with the second account disabled", () => {
  const ggmail = useApp({
    accounts: [
      seedAccount({ id: "first-account", label: "Personal" }),
      seedAccount({ id: "second-account", label: "Work", selected: false, disabled: true }),
    ],
  });

  test("its partition's cookies are deleted without an instance", async () => {
    await setCookie(ggmail, "second-account");

    await setCookie(ggmail, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Work");

    await dialog.getByRole("checkbox", { name: "Cookies and other site data" }).click();

    await deleteData(dialog);

    expect(await hasCookie(ggmail, "second-account")).toBe(false);

    // The other account's partition is not touched.
    expect(await hasCookie(ggmail, "first-account")).toBe(true);
  });
});

/*
 * Tabs, which run in the account's session too. A page left open while its
 * cookies are cleared would write its site data straight back, so deleting
 * cookies closes every tab but Gmail first: an unpinned one is gone, and a
 * pinned one stays where the user pinned it, unloaded, as hibernation leaves
 * it. Pro, since saved tabs are.
 */
test.describe("with a pinned tab and an unpinned one", () => {
  const PINNED_PAGE_TITLE = "Pinned Stand-In";

  const UNPINNED_PAGE_TITLE = "Unpinned Stand-In";

  let server: TestServer;

  // The query makes the app take the page for Calendar.
  function pageUrl(pageTitle: string) {
    return `${server.pageUrl(pageTitle)}?stand-in-for=/calendar.google.com`;
  }

  test.beforeAll(async () => {
    server = await startTestServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  const ggmail = useApp(() => ({
    accounts: [
      seedAccount({
        id: "first-account",
        label: "Personal",
        savedTabs: [
          seedSavedTab({
            app: "calendar",
            url: pageUrl(PINNED_PAGE_TITLE),
            title: PINNED_PAGE_TITLE,
            loadOnLaunch: true,
          }),
        ],
      }),
    ],
  }));

  function hasLoadedPage(url: string) {
    return ggmail.app.evaluate(
      ({ webContents }, pageUrl) =>
        webContents
          .getAllWebContents()
          .some((contents) => contents.getURL() === pageUrl && !contents.isLoading()),
      url,
    );
  }

  function stripTab(pageTitle: string) {
    return ggmail.renderer.getByRole("button", {
      name: pageTitle === PINNED_PAGE_TITLE ? "Calendar" : pageTitle,
      exact: true,
    });
  }

  async function readSavedTabUrls() {
    const config = await ggmail.readConfig();

    return config.accounts
      ?.find((account) => account.id === "first-account")
      ?.workspaceApps.savedTabs.map((savedTab) => savedTab.url);
  }

  /** Both tabs live, the unpinned one opened from a link in the pinned one. */
  async function openTabs() {
    await expect.poll(() => hasLoadedPage(pageUrl(PINNED_PAGE_TITLE))).toBe(true);

    await ggmail.app.evaluate(
      ({ webContents }, { pinnedUrl, unpinnedUrl }) => {
        const contents = webContents
          .getAllWebContents()
          .find((each) => each.getURL() === pinnedUrl);

        void contents?.executeJavaScript(`window.open(${JSON.stringify(unpinnedUrl)}); null`, true);
      },
      { pinnedUrl: pageUrl(PINNED_PAGE_TITLE), unpinnedUrl: pageUrl(UNPINNED_PAGE_TITLE) },
    );

    await expect.poll(() => hasLoadedPage(pageUrl(UNPINNED_PAGE_TITLE))).toBe(true);

    await expect(stripTab(UNPINNED_PAGE_TITLE)).toBeVisible();
  }

  async function closeSettings() {
    await ggmail.closeSettings();

    await waitForVerticalTabs(ggmail);
  }

  test("deleting cookies closes the unpinned tab and unloads the pinned one", async () => {
    await openTabs();

    await markGmailView(ggmail, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Personal");

    await dialog.getByRole("checkbox", { name: "Cookies and other site data" }).click();

    await deleteData(dialog);

    await expect
      .poll(() => readGmailView(ggmail, "first-account"))
      .toEqual({ marked: false, stored: null });

    expect(await hasLoadedPage(pageUrl(UNPINNED_PAGE_TITLE))).toBe(false);

    expect(await hasLoadedPage(pageUrl(PINNED_PAGE_TITLE))).toBe(false);

    expect(await readSavedTabUrls()).toEqual([pageUrl(PINNED_PAGE_TITLE)]);

    await closeSettings();

    await expect(stripTab(UNPINNED_PAGE_TITLE)).toHaveCount(0);

    await stripTab(PINNED_PAGE_TITLE).click();
    await expect.poll(() => hasLoadedPage(pageUrl(PINNED_PAGE_TITLE))).toBe(true);
  });

  test("deleting the cache leaves every tab open", async () => {
    await openTabs();

    await markGmailView(ggmail, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(ggmail, "Personal");

    await deleteData(dialog);

    await expect
      .poll(() => readGmailView(ggmail, "first-account"))
      .toEqual({ marked: false, stored: "1" });

    // Polled, since both are reloading.
    await expect.poll(() => hasLoadedPage(pageUrl(UNPINNED_PAGE_TITLE))).toBe(true);

    await expect.poll(() => hasLoadedPage(pageUrl(PINNED_PAGE_TITLE))).toBe(true);

    await closeSettings();

    await expect(stripTab(UNPINNED_PAGE_TITLE)).toBeVisible();

    await expect(stripTab(PINNED_PAGE_TITLE)).toBeVisible();
  });
});
