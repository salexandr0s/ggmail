import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const env: Record<string, string> = {};
const first = "194a92f8c0000001";
const second = "194a92f8b0000002";
const older = "1824ce6600000000";

const senderPhoto = "https://lh3.googleusercontent.com/a/example";
const picture = path.join(process.cwd(), "build/icons/32x32.png");

const mail = {
  Work: {
    [first]: {
      subject: "Studio planning session",
      sender: "Míra Chen &lt;studio@example.test&gt;",
      date: "2026-11-17",
      files: [
        ["Notes.txt", "8 KB"],
        ["Studio budget.xlsx", "146 KB"],
      ],
    },
    [second]: {
      subject: "Autumn identity review",
      sender: "Theo Park &lt;theo@example.test&gt;",
      date: "2026-11-19",
      files: [
        ["Identity overview.pdf", "2.4 MB"],
        ["Wordmark studies.png", "840 KB"],
      ],
    },
    [older]: {
      subject: "Handover documents",
      sender: "Lena Morris &lt;lena@example.test&gt;",
      date: "2026-11-12",
      files: [["Project handover.pdf", "1.2 MB"]],
    },
  },
  Personal: {
    [first]: {
      subject: "Weekend in Vienna",
      sender: "Alex Meyer &lt;alex@personal.test&gt;",
      date: "2026-11-16",
      files: [
        ["Notes.txt", "4 KB"],
        ["City walks.zip", "3.2 MB"],
      ],
    },
    [second]: {
      subject: "Photos from the gallery",
      sender: "Inès Klein",
      date: "2026-11-18",
      files: [["Gallery entrance.jpg", "1.8 MB"]],
    },
    [older]: {
      subject: "November workshop",
      sender: "sam@workshop.test",
      date: "2026-11-13",
      files: [
        ["Workshop outline.docx", "92 KB"],
        ["Materials list.csv", "12 KB"],
      ],
    },
  },
};
type ThreadId = keyof typeof mail.Work;

let failThread = false;
let emptyMailbox = false;
let fileRequests = 0;

test.beforeEach(() => {
  failThread = false;
  emptyMailbox = false;
  fileRequests = 0;
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const work = request.headers.cookie?.includes("library=work");
  const label = work ? "Work" : "Personal";
  const threads = mail[label];
  if (url.searchParams.get("disp") === "thd") {
    if (
      work &&
      url.searchParams.get("view") === "snatt" &&
      url.searchParams.get("attid") === "0.1"
    ) {
      response.setHeader("Content-Type", "image/png");
      response.end(await readFile(picture));
    } else {
      response.writeHead(404).end();
    }
    return;
  }
  if (url.searchParams.get("view") === "att") {
    fileRequests++;
    if (work && url.searchParams.get("th") === second && url.searchParams.get("attid") === "0.2") {
      response.setHeader("Content-Type", "image/png");
      response.end(await readFile(picture));
      return;
    }
    if (work && url.searchParams.get("th") === older && url.searchParams.get("attid") === "0.1") {
      response.setHeader("Content-Type", "application/pdf");
      response.end(await readFile(path.join(process.cwd(), "tests/fixtures/project-handover.pdf")));
      return;
    }
    response.writeHead(200, {
      "Content-Disposition": 'attachment; filename="Notes.txt"',
      "Content-Type": "text/plain",
    });
    response.end(label + " attachment");
    return;
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (url.searchParams.get("view") === "pt") {
    const id = url.searchParams.get("th");
    if (failThread && id === second && work) {
      response.writeHead(503);
      response.end();
      return;
    }
    const thread = threads[id as ThreadId];
    if (!thread) {
      response.writeHead(404);
      response.end();
      return;
    }
    const tiles = thread.files
      .map(
        ([name, size], index) =>
          `<table class="att"><tr><td><table><tr><td><a href="?view=att&amp;th=${id}&amp;attid=0.${index + 1}"><img></a></td><td><b>${name}</b><br>${size}</td></tr></table></td></tr></table>`,
      )
      .join("");
    response.end(
      `<table class="message"><tr><td>${work && id === first ? `<img src="${senderPhoto}">` : ""}${thread.sender}</td><td>${thread.date}T12:00:00Z</td></tr><tr><td>${tiles}</td></tr></table>`,
    );
    return;
  }
  if (emptyMailbox) {
    response.end('<main role="main"><div class="TC">No conversations</div></main>');
    return;
  }
  response.end(`<main role="main"><table><tbody></tbody></table></main><script>
    if(location.hash.startsWith('#search/')) {
      const older = location.hash.endsWith('/p2');
      const subjects = ${JSON.stringify(Object.fromEntries(Object.entries(threads).map(([id, thread]) => [id, thread.subject])))};
      for(const id of older ? ['${older}'] : ['${first}','${second}']) {
        document.querySelector('tbody').insertAdjacentHTML('beforeend','<tr class="zA"><td><span data-legacy-thread-id="#'+id+'" class="bog">'+subjects[id]+'</span></td></tr>');
      }
      document.querySelector('main').insertAdjacentHTML('beforeend','<button aria-disabled="'+older+'"><span class="amJ">Older</span></button>');
    }
  </script>`);
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.GGMAIL_TEST_GMAIL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mail/u/0`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const ggmail = useApp(
  ({ userDataDir }) => ({
    theme: "light",
    "window.restrictMinimumSize": false,
    accounts: ["Personal", "Work"].map((label, index) => ({
      id: label,
      label,
      selected: index === 0,
      color: index === 0 ? "teal" : "amber",
      notifications: true,
      gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
      workspaceApps: { savedTabs: [], bookmarks: [] },
    })),
    "downloads.location": userDataDir,
    "downloads.saveAs": false,
  }),
  { env, args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] },
);

test.beforeEach(async () => {
  await ggmail.renderer.route(senderPhoto, (route) => route.fulfill({ path: picture }));
  await ggmail.renderer.route("https://www.google.com/s2/favicons?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("domain") === "personal.test") {
      await route.abort();
    } else {
      await route.fulfill({ path: path.join(process.cwd(), "build/icons/32x32.png") });
    }
  });
});

async function identifyWorkMailbox() {
  await ggmail.app.evaluate(async ({ session }, base) => {
    await session
      .fromPartition("persist:Work")
      .cookies.set({ url: base, name: "library", value: "work" });
  }, env.GGMAIL_TEST_GMAIL_URL ?? "");
}

test("browse, filter, preview, and download attachments in their own account", async () => {
  const page = ggmail.renderer;
  await identifyWorkMailbox();
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files")).toBeVisible();
  await expect(page.getByRole("button", { name: "Notes.txt" })).toHaveCount(2);
  const senderColumn = page.locator(".attachment-row .attachment-from");
  await expect(
    senderColumn.filter({ hasText: "Míra Chen" }).first().locator("img"),
  ).toHaveAttribute("src", senderPhoto);
  await expect(
    senderColumn.filter({ hasText: "sam@workshop.test" }).first().locator("img"),
  ).toHaveAttribute("src", "https://www.google.com/s2/favicons?domain=workshop.test&sz=32");
  await expect(
    senderColumn.filter({ hasText: "Alex Meyer" }).first().locator('[data-slot="avatar-fallback"]'),
  ).toHaveText("AM");
  await expect(
    senderColumn.filter({ hasText: "Inès Klein" }).locator('[data-slot="avatar-fallback"]'),
  ).toHaveText("IK");
  expect(fileRequests).toBe(0);
  await page.screenshot({ path: test.info().outputPath("attachment-list.png") });
  await page.getByRole("button", { name: "Wordmark studies.png" }).press("Enter");
  const image = page.getByRole("dialog").getByRole("img", { name: "Wordmark studies.png" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(32);
  await page.keyboard.press("Escape");
  await expect(image).toBeHidden();
  await page.getByRole("combobox", { name: "Sort by" }).click();
  await page.getByRole("option", { name: "File name", exact: true }).click();
  await expect(page.getByRole("listitem").first()).toContainText("City walks.zip");
  const search = page.getByRole("searchbox");
  await search.fill("mira chen");
  await expect(page.getByText("2 files", { exact: true })).toBeVisible();
  await search.fill("missing");
  await expect(page.getByText("No matching files")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  const sidebar = page.getByRole("complementary", { name: "Filters" });
  await sidebar.getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.getByText("5 files", { exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByRole("button", { name: "Project handover.pdf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Notes.txt" })).toHaveCount(0);
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect.poll(async () => (await ggmail.readConfig())["attachments.layout"]).toBe("grid");
  const handoverCard = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Project handover.pdf" }) });
  await expect(handoverCard).toHaveClass(/attachment-card/);
  await expect(handoverCard.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect
    .poll(() =>
      handoverCard
        .locator(".attachment-cover img")
        .evaluateAll((images) => images.some((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  expect(fileRequests).toBe(1);
  await handoverCard.click({ position: { x: 14, y: 14 } });
  const pdf = page.getByRole("dialog", { name: "Project handover.pdf" });
  await expect(pdf.locator('embed[type="application/pdf"]')).toBeVisible();
  const pdfContents = await pdf.locator("embed").evaluate(async (el: HTMLEmbedElement) => {
    const response = await fetch(el.src);
    return response.text();
  });
  expect(pdfContents).toContain("(Project handover)");
  expect((await ggmail.readConfig()).accounts?.find((a) => a.selected)?.label).toBe("Personal");
  await pdf.getByRole("button", { name: "Close" }).click();
  await expect(handoverCard.getByRole("button", { name: "Project handover.pdf" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(sidebar.getByRole("button", { name: "PDF", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await sidebar.getByRole("button", { name: "All files", exact: true }).click();
  await page.getByRole("searchbox").fill("planning session");
  await expect(page.getByText("2 files", { exact: true })).toBeVisible();
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Notes.txt" }) });
  await row.getByRole("button", { name: "Notes.txt" }).press("Enter");
  const note = page.getByRole("dialog", { name: "Notes.txt" });
  await expect(note.getByText("Work attachment")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(note).toBeHidden();
  await row.getByRole("button", { name: "Download", exact: true }).click();
  await expect
    .poll(async () => readFile(path.join(ggmail.userDataDir, "Notes.txt"), "utf8").catch(() => ""))
    .toBe("Work attachment");
  await row.getByRole("button", { name: "Open email" }).click();
  await expect
    .poll(async () =>
      ggmail.app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((w) => w.getURL().endsWith("#all/194a92f8c0000001")),
      ),
    )
    .toBe(true);
});

test("a file without a Gmail preview keeps its download action", async () => {
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.getByRole("searchbox").fill("City walks.zip");
  const card = page.locator(".attachment-card").first();
  await expect(card.locator(".attachment-cover .attachment-mark")).toBeVisible();
  await card.getByRole("button", { name: "City walks.zip" }).click();
  const preview = page.getByRole("dialog", { name: "City walks.zip" });
  await expect(preview.getByText("No preview available")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Download" })).toBeVisible();
  expect(fileRequests).toBe(0);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(page.getByRole("searchbox")).toHaveValue("City walks.zip");
});

test("retains partial results, retries unreadable mail, and refreshes to an empty mailbox", async () => {
  await identifyWorkMailbox();
  failThread = true;
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("8 files")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Work");
  failThread = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("10 files")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Grid view" }).click();
  await ggmail.app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath("attachment-grid.png") });
  emptyMailbox = true;
  await page.getByRole("button", { name: "Refresh attachments" }).click();
  await expect(page.getByText("No attachments", { exact: true })).toBeVisible();
  expect(fileRequests).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Attachments" })).toHaveCount(0);
});

test("compact windows keep filters, file actions and keyboard navigation reachable", async () => {
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("main.html"))
      ?.setSize(480, 640);
  });
  await expect(page.getByText("10 files")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Filters" })).toBeHidden();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await filters.getByRole("button", { name: "Work", exact: true }).click();
  await filters.getByRole("button", { name: "PDF", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(filters).toBeHidden();
  await expect(page.getByText("2 files", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(
    page.locator('.attachment-compact-detail [data-slot="avatar-image"]').first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }).first(),
  ).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("attachment-compact.png") });
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("main.html"))
      ?.setSize(320, 600);
  });
  await expect.poll(() => page.getByRole("main").evaluate((el) => el.clientWidth)).toBe(320);
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByRole("listitem").first()).toBeInViewport();
  expect(
    await page
      .getByRole("main")
      .evaluate((el) =>
        [...el.querySelectorAll("button, input, li")]
          .filter((node) => node.getClientRects().length)
          .every(
            (node) => node.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1,
          ),
      ),
  ).toBe(true);
  const search = page.getByRole("searchbox");
  await search.fill("missing");
  await expect(page.getByText("No matching files")).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await search.press("Escape");
  await expect(page.getByRole("heading", { name: "Attachments" })).toHaveCount(0);
});
