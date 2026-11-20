import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { sendDeepLink } from "./lib/deep-link";
import { readViews } from "./lib/views";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const MEET_URL = "https://meet.google.com/abc-defg-hij";

/** The URL `resolveRoutableUrl`'s host check exists for; its docblock has why. */
const SPOOFED_MEET_URL = "https://evil.com/meet.google.com/x";

function ggmailOpenUrl(url: string) {
  return `ggmail://open?url=${encodeURIComponent(url)}`;
}

const ggmail = useApp({
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
  /*
   * Both at their defaults, seeded rather than relied on. They are the two
   * settings the routing reads — `openUrl` sends a URL to the browser with the
   * first off, and opens a window rather than a child view with the second on
   * "windows" — so a change to either default would otherwise turn this file
   * red for a reason that has nothing to do with the route.
   */
  "workspaceApps.openInApp": true,
  "workspaceApps.mode": "tabs",
});

// At file scope rather than in a hook, as in `native-resize.e2e.ts`: the
// harness above registers its `beforeEach` first, and hooks run in registration
// order, so skipping from inside one would launch the app before deciding not
// to use it.
test.skip(
  process.platform === "darwin",
  "macOS delivers a link through open-url to the running app, which spawning the executable cannot reach",
);

/** Every child view's URL, which is what a deep link either adds to or does not. */
function readViewUrls() {
  return readViews(ggmail).then((views) => views.map((view) => view.url));
}

test("ggmail://open opens a Google link in the account's own view", async () => {
  await sendDeepLink(ggmail, ggmailOpenUrl(MEET_URL));

  /*
   * Polled, because the exit of the second instance says only that its argv was
   * handed over — everything the running app does with it happens afterwards.
   *
   * On the URL rather than anything in the page: what loads is a real Google
   * property, and the claim here is about which URL the app decided to open,
   * not about what Google served back.
   */
  await expect
    .poll(async () =>
      (await readViewUrls()).some((url) => url.startsWith("https://meet.google.com")),
    )
    .toBe(true);
});

test("ggmail://open refuses a URL that only looks like Google's", async () => {
  const viewUrlsBefore = await readViewUrls();

  await sendDeepLink(ggmail, ggmailOpenUrl(SPOOFED_MEET_URL));

  /*
   * A link that does open, sent behind the one that must not, so the claim has
   * something to wait for rather than a fixed pause standing in for one.
   * `second-instance` arrives in the order the instances hand over, and with a
   * single account `openUrlDeepLink` reaches the view without awaiting
   * anything, so a Meet view is proof the app is done with the link before it.
   */
  await sendDeepLink(ggmail, ggmailOpenUrl(MEET_URL));

  await expect
    .poll(async () =>
      (await readViewUrls()).some((url) => url.startsWith("https://meet.google.com")),
    )
    .toBe(true);

  const viewUrls = await readViewUrls();

  /*
   * One view more than before, the Meet one — so the refused link added none of
   * its own — and nothing went to the host that URL actually names.
   */
  expect(viewUrls).toHaveLength(viewUrlsBefore.length + 1);

  expect(viewUrls.filter((url) => url.includes("evil.com"))).toEqual([]);
});

/*
 * The same two claims for the URL a browser picker sends, which arrives with no
 * `ggmail://` wrapper around it once ggmail holds the http and https association.
 * It is a separate delivery branch, not a second spelling of the one above:
 * `handleWebUrl` takes the URL as the desktop hands it over, undecoded.
 */
test("an https URL sent to ggmail opens in the account's own view", async () => {
  await sendDeepLink(ggmail, MEET_URL);

  await expect
    .poll(async () =>
      (await readViewUrls()).some((url) => url.startsWith("https://meet.google.com")),
    )
    .toBe(true);
});

test("an https URL refuses a host that only looks like Google's", async () => {
  const viewUrlsBefore = await readViewUrls();

  await sendDeepLink(ggmail, SPOOFED_MEET_URL);

  // A link that does open, sent behind the one that must not, exactly as above.
  await sendDeepLink(ggmail, MEET_URL);

  await expect
    .poll(async () =>
      (await readViewUrls()).some((url) => url.startsWith("https://meet.google.com")),
    )
    .toBe(true);

  const viewUrls = await readViewUrls();

  expect(viewUrls).toHaveLength(viewUrlsBefore.length + 1);

  expect(viewUrls.filter((url) => url.includes("evil.com"))).toEqual([]);
});
