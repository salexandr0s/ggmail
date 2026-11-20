/*
 * A German start loads the German catalog and no other: in the main process, in
 * the renderer and in the Gmail preload, and in time for the first paint. A
 * Japanese start, in one launch of its own, checks the same three places, so a
 * loader wired to the wrong catalog, or a language left out of one, shows
 * without a second launch per test.
 *
 * The translations are read from the compiled catalogs rather than written
 * here, so a wording can change without this test.
 */
import { type Messages, setupI18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { messages as gmailDe } from "@ggmail/preload-gmail/locales/de";
import { messages as gmailJa } from "@ggmail/preload-gmail/locales/ja";
import { messages as en } from "@ggmail/shared/i18n/locales/en";
import { type CatalogTag, SHIPPED_CATALOG_TAGS } from "@ggmail/shared/i18n/tags";
import { expect, test } from "@playwright/test";
import { type GgmailApp, useApp } from "./lib/app";

const RENDERER_DIR = "build-js/renderer/";

const CATALOG_DELAY = 300;

const otherTags = SHIPPED_CATALOG_TAGS.filter((tag) => tag !== "en");

let translations: Partial<Record<string, Messages>> = {};

test.beforeAll(async () => {
  translations = Object.fromEntries(
    await Promise.all(
      otherTags.map(
        async (tag) =>
          [
            tag,
            ((await import(`@ggmail/shared/i18n/locales/${tag}.ts`)) as { messages: Messages })
              .messages,
          ] as const,
      ),
    ),
  );
});

/*
 * Translations long enough not to occur by chance, unlike their English, and
 * free of anything a bundler would escape, so they read in a bundle as they do
 * in the catalog.
 */
function readSampleTranslations(messages: Messages) {
  return Object.entries(messages)
    .flatMap(([id, message]) =>
      Array.isArray(message) && message.length === 1 && typeof message[0] === "string"
        ? [[id, message[0]] as const]
        : [],
    )
    .filter(
      ([id, message]) =>
        message.length >= 20 && /^[^"'\\`\n\u00a0]+$/.test(message) && en[id]?.[0] !== message,
    )
    .slice(0, 5)
    .map(([, message]) => message);
}

function translate(messages: Messages, message: string, context?: string) {
  return setupI18n({ locale: "xx", messages: { xx: messages } })._({
    id: generateMessageId(message, context),
    message,
  });
}

/**
 * The bundle files the main process has required from inside the app, by path
 * relative to the app.
 */
function readMainModules(ggmail: GgmailApp) {
  return ggmail.app.evaluate(({ app }) => {
    const { _cache: cache } = process.getBuiltinModule("node:module") as unknown as {
      _cache: Record<string, unknown>;
    };

    const appPath = app.getAppPath();

    return Object.keys(cache)
      .filter((modulePath) => modulePath.startsWith(appPath))
      .map((modulePath) => modulePath.slice(appPath.length + 1).replaceAll("\\", "/"));
  });
}

function readAppFile(ggmail: GgmailApp, relativePath: string) {
  return ggmail.app.evaluate(({ app }, filePath) => {
    const fs = process.getBuiltinModule("node:fs");

    const path = process.getBuiltinModule("node:path");

    return fs.readFileSync(path.join(app.getAppPath(), filePath), "utf8");
  }, relativePath);
}

/**
 * Holds the loaded app files to one language's catalog in exactly one of them
 * and every other language's in none, and returns the one holding it.
 */
async function expectCatalogAlone(ggmail: GgmailApp, language: CatalogTag, appFiles: string[]) {
  expect(appFiles.length).toBeGreaterThan(0);

  const sources = await Promise.all(
    appFiles.map(async (appFile) => ({ appFile, source: await readAppFile(ggmail, appFile) })),
  );

  let languageFiles: string[] = [];

  for (const tag of otherTags) {
    const samples = readSampleTranslations(translations[tag] ?? {});

    expect(samples.length, tag).toBeGreaterThan(0);

    const holdingFiles = sources
      .filter(({ source }) => samples.some((sample) => source.includes(sample)))
      .map(({ appFile }) => appFile);

    if (tag === language) {
      languageFiles = holdingFiles;
    } else {
      expect(holdingFiles, tag).toEqual([]);
    }
  }

  expect(languageFiles, language).toHaveLength(1);

  return languageFiles[0];
}

/** The renderer's bundle files, as the debugger reports every script already parsed. */
async function readRendererScripts(ggmail: GgmailApp) {
  // Chromium keeps no resource timing for a `file://` page.
  const cdp = await ggmail.app.context().newCDPSession(ggmail.renderer);

  const scriptUrls: string[] = [];

  cdp.on("Debugger.scriptParsed", ({ url }) => {
    if (url.includes(RENDERER_DIR) && !scriptUrls.includes(url)) {
      scriptUrls.push(url);
    }
  });

  await cdp.send("Debugger.enable");

  await cdp.detach();

  return scriptUrls.map((scriptUrl) => `${RENDERER_DIR}${scriptUrl.split(RENDERER_DIR)[1]}`);
}

/** Shows the toast main sends once Gmail reports a message sent, which the stand-in never will. */
async function showMessageSentToast(ggmail: GgmailApp) {
  const { signInUrl } = ggmail.gmailStandIn;

  const findAccountView = () => ggmail.app.windows().find((page) => page.url() === signInUrl);

  await expect.poll(findAccountView).toBeDefined();

  const accountView = findAccountView();

  if (!accountView) {
    throw new Error("The account view is gone");
  }

  await ggmail.app.evaluate(({ webContents }, url) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === url)
      ?.send("gmail.showMessageSentNotification", 1);
  }, signInUrl);

  return accountView;
}

async function expectToastIn(ggmail: GgmailApp, gmailMessages: Messages) {
  const preload = await readAppFile(ggmail, "build-js/preload-gmail.js");

  const messageSent = translate(gmailMessages, "Message sent");

  expect(preload.includes(messageSent)).toBe(false);

  const accountView = await showMessageSentToast(ggmail);

  await expect(accountView.getByText(messageSent)).toBeVisible();

  await expect(
    accountView.getByRole("button", { name: translate(gmailMessages, "Undo", "button") }),
  ).toBeVisible();
}

test.describe("German", () => {
  const ggmail = useApp({ "app.language": "de" });

  test("the main process loads the German catalog alone", async () => {
    // Not the entry bundle, which every start reads whatever its language.
    expect(await expectCatalogAlone(ggmail, "de", await readMainModules(ggmail))).not.toBe(
      "build-js/app.js",
    );
  });

  test("the renderer loads the German catalog alone and paints German first", async () => {
    /*
     * Every title the page shows from its first commit on, so an English one
     * swapped for German a moment later is still caught.
     */
    await ggmail.app.context().addInitScript(() => {
      const shownTitles: string[] = [];

      Object.assign(window, { shownTitles });

      new MutationObserver(() => {
        for (const element of document.querySelectorAll("#root [title]")) {
          const title = element.getAttribute("title");

          if (title && !shownTitles.includes(title)) {
            shownTitles.push(title);
          }
        }
      }).observe(document, { attributes: true, childList: true, subtree: true });
    });

    const cdp = await ggmail.app.context().newCDPSession(ggmail.renderer);

    /*
     * Held back a moment, so a page that rendered before its catalog arrived
     * would show its English titles first and the recording above would catch
     * them. A loopback file otherwise loads too fast for the race to show.
     */
    let delayedCatalogRequests = 0;

    cdp.on("Fetch.requestPaused", ({ requestId }) => {
      delayedCatalogRequests += 1;

      setTimeout(() => {
        void cdp.send("Fetch.continueRequest", { requestId });
      }, CATALOG_DELAY);
    });

    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/assets/de-*.js" }] });

    await ggmail.renderer.reload();

    const recentDownloadsTitle = translate(translations.de ?? {}, "Show recent download history");

    await expect(ggmail.renderer.getByTitle(recentDownloadsTitle)).toBeVisible();

    const shownTitles = await ggmail.renderer.evaluate(
      () => (window as unknown as { shownTitles: string[] }).shownTitles,
    );

    expect(shownTitles).toContain(recentDownloadsTitle);

    expect(shownTitles).not.toContain("Show recent download history");

    // Proves the delay above applied, which a renamed chunk would quietly undo.
    expect(delayedCatalogRequests).toBe(1);

    await cdp.send("Fetch.disable");

    await cdp.detach();

    await expectCatalogAlone(ggmail, "de", await readRendererScripts(ggmail));
  });

  test("the Gmail view shows its toast in German from a preload that carries no catalog but English", async () => {
    await expectToastIn(ggmail, gmailDe);
  });
});

test.describe("Japanese", () => {
  const ggmail = useApp({ "app.language": "ja" });

  test("main, the renderer and the Gmail view load the Japanese catalog alone", async () => {
    expect(await expectCatalogAlone(ggmail, "ja", await readMainModules(ggmail))).not.toBe(
      "build-js/app.js",
    );

    await expectCatalogAlone(ggmail, "ja", await readRendererScripts(ggmail));

    await expectToastIn(ggmail, gmailJa);
  });
});
