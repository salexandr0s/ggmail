import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";

const env: Record<string, string> = {};
const invoice = "filename:pdf newer_than:30d";
const paid = 'subject:"Paid / R+D"';
const sharedId = "194a92f8c0000001";
const olderId = "1824ce6600000000";
let holdWork = false;
let failWork = false;
const requests: { label: string; query: string; page: string }[] = [];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const label = request.headers.cookie?.includes("search=work") ? "Work" : "Personal";
  if (url.pathname === "/results") {
    const query = url.searchParams.get("q") ?? "";
    const page = url.searchParams.get("page") ?? "";
    requests.push({ label, query, page });
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    if (label === "Work" && query === invoice && holdWork) {
      response.end("null");
      return;
    }
    const id = label === "Work" && failWork ? "unavailable" : page === "p2" ? olderId : sharedId;
    const subject =
      query === invoice
        ? page === "p2"
          ? "Older invoice"
          : "Invoice"
        : query === paid
          ? "Paid"
          : null;
    response.end(JSON.stringify({ id, subject, more: query === invoice && page !== "p2" }));
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<main role="main"></main><script>
    async function showResults() {
      const [route, encodedQuery, page = ""] = location.hash.split("/");
      if (route !== "#search") return;
      const params = new URLSearchParams({q: decodeURIComponent(encodedQuery), page});
      const result = await fetch("/results?" + params).then(r => r.json());
      if (!result) return setTimeout(showResults, 100);
      const main = document.querySelector("main");
      if (!result.subject) {
        main.innerHTML = '<div class="TC">No results</div>';
        return;
      }
      main.innerHTML = '<table><tr class="zA"><td class="yW">${label} sender</td><td><span class="bog"></span><span class="y2">Receipt enclosed</span></td><td class="xW"><span title="Nov 20">Nov 20</span></td></tr></table><button><span class="amJ">Older</span></button>';
      main.querySelector("tr").dataset.legacyThreadId = "#" + result.id;
      main.querySelector(".bog").textContent = result.subject;
      main.querySelector("button").disabled = !result.more;
    }
    showResults();
  </script>`);
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.GGMAIL_TEST_GMAIL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mail/u/0`;
});
test.beforeEach(() => {
  holdWork = false;
  failWork = false;
  requests.length = 0;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const ggmail = useApp(
  {
    accounts: [
      seedAccount({ id: "Personal", label: "Personal" }),
      seedAccount({ id: "Work", label: "Work", selected: false }),
      seedAccount({ id: "Off", label: "Off", selected: false, disabled: true }),
    ],
    "gmail.savedSearches": [{ id: "paid", label: "Paid receipts", query: paid }],
  },
  { env, args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] },
);

async function openSearch() {
  await ggmail.app.evaluate(async ({ session }, url) => {
    await session
      .fromPartition("persist:Work")
      .cookies.set({ url, path: "/", name: "search", value: "work" });
  }, env.GGMAIL_TEST_GMAIL_URL ?? "");
  await ggmail.renderer.getByRole("button", { name: "Open unified inbox" }).click();
  return ggmail.renderer.getByRole("searchbox", { name: "Search all accounts" });
}

test("shows independent mailbox results, filters and pages them, and opens the owning thread", async () => {
  holdWork = true;
  const page = ggmail.renderer;
  const search = await openSearch();
  const personal = page.getByRole("region", { name: "Personal" });
  const work = page.getByRole("region", { name: "Work" });
  await search.fill(invoice);
  await search.press("Enter");
  await expect(personal.getByRole("button", { name: /Invoice/ })).toBeVisible();
  await expect(work.getByRole("status")).toHaveText("Searching…");
  await expect
    .poll(() => requests.some((r) => r.label === "Work" && r.query === invoice))
    .toBe(true);
  await expect(page.getByRole("region", { name: "Off" })).toHaveCount(0);
  holdWork = false;
  await expect(work.getByRole("button", { name: /Invoice/ })).toBeVisible();
  await work.getByRole("button", { name: "Load more" }).click();
  await expect(work.getByText("Older invoice")).toBeVisible();
  await expect(personal.getByText("Older invoice")).toHaveCount(0);
  await page.getByRole("button", { name: "All accounts", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Filters" })
    .getByRole("button", { name: "Work", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(personal).toBeHidden();
  await work.getByRole("button", { name: /Work sender Nov 20 Invoice/ }).click();
  await expect
    .poll(async () => (await ggmail.readConfig()).accounts?.find((a) => a.selected)?.id)
    .toBe("Work");
  await expect
    .poll(() =>
      ggmail.app.evaluate(({ webContents, session }, id) => {
        return webContents
          .getAllWebContents()
          .filter((w) => w.getURL().endsWith("#all/" + id))
          .map((w) => w.session === session.fromPartition("persist:Work"));
      }, sharedId),
    )
    .toEqual([true]);
});

test("retries a single mailbox and discards old responses when a saved search or clear supersedes them", async () => {
  const page = ggmail.renderer;
  const search = await openSearch();
  const personal = page.getByRole("region", { name: "Personal" });
  const work = page.getByRole("region", { name: "Work" });
  failWork = true;
  await search.fill(invoice);
  await search.press("Enter");
  await expect(personal.getByText("Invoice", { exact: true })).toBeVisible();
  await expect(work.getByRole("status")).toContainText("Couldn’t search this account.");
  failWork = false;
  await work.getByRole("button", { name: "Retry" }).click();
  await expect(work.getByText("Invoice", { exact: true })).toBeVisible();
  expect(requests.filter((r) => r.label === "Personal" && r.query === invoice)).toHaveLength(1);

  holdWork = true;
  requests.length = 0;
  await search.press("Enter");
  await expect
    .poll(() => requests.some((r) => r.label === "Work" && r.query === invoice))
    .toBe(true);
  await page.getByRole("button", { name: "Show saved searches" }).click();
  await page.getByText("Paid receipts", { exact: true }).click();
  await expect(search).toHaveValue(paid);
  await expect(work.getByText("Paid", { exact: true })).toBeVisible();
  await expect(personal.getByText("Paid", { exact: true })).toBeVisible();
  holdWork = false;
  await expect(page.getByText("Invoice", { exact: true })).toHaveCount(0);
  await search.fill("no results");
  await search.press("Enter");
  await expect(page.getByText("No matching conversations")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("No unread messages")).toBeVisible();
});

test("clears signed-out results, searches again after sign-in, and stops pending work on exit", async () => {
  const page = ggmail.renderer;
  const search = await openSearch();
  await search.fill(invoice);
  await search.press("Enter");
  const personal = page.getByRole("region", { name: "Personal" });
  const work = page.getByRole("region", { name: "Work" });
  await expect(work.getByText("Invoice", { exact: true })).toBeVisible();
  const workViewId = await ggmail.app.evaluate(async ({ webContents, session }) => {
    const view = webContents
      .getAllWebContents()
      .find(
        (w) =>
          w.session === session.fromPartition("persist:Work") && !w.getURL().includes("#search/"),
      );
    if (!view) {
      throw new Error("Missing work mailbox");
    }
    await view.loadURL("about:blank");
    return view.id;
  });
  await expect(work.getByRole("status")).toHaveText("Sign in to search this account.");
  await expect(work.getByText("Invoice", { exact: true })).toHaveCount(0);
  await expect(personal.getByText("Invoice", { exact: true })).toBeVisible();

  await ggmail.app.evaluate(
    async ({ webContents }, { id, url }) => {
      await webContents.fromId(id)?.loadURL(url);
    },
    { id: workViewId, url: env.GGMAIL_TEST_GMAIL_URL ?? "" },
  );
  await expect(work.getByText("Invoice", { exact: true })).toBeVisible();

  holdWork = true;
  requests.length = 0;
  await search.press("Enter");
  await expect
    .poll(() => requests.some((r) => r.label === "Work" && r.query === invoice))
    .toBe(true);
  await page.getByRole("button", { name: "Close unified inbox" }).click();
  await expect
    .poll(() =>
      ggmail.app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((w) => w.getURL().includes("#search/")),
      ),
    )
    .toBe(false);
});
