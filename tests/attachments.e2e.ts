import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { expect, test, type Locator } from "@playwright/test";
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
        ["Studio signature.png", "12 KB"],
      ],
    },
    [older]: {
      subject: "Contrat de prestation",
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
        ["Τιμολόγιο_2026.csv", "12 KB"],
      ],
    },
  },
};
type ThreadId = keyof typeof mail.Work;

const webBookingTicket = "Web Booking eTicket (ZX72QK) - ALEX EXAMPLE.pdf";
const mixedDocuments = [
  ["01.pdf", "invoice"],
  ["02.pdf", "receipt"],
  ["Acuerdo de confidencialidad.pdf", "contract"],
  ["Bordkarte zur Buchung Q5.pkpass", "ticket"],
  [webBookingTicket, "ticket booking"],
  ["Επιβεβαίωση κράτησης.pdf", "booking"],
  ["Estratto conto corrente.pdf", "statement"],
  ["Purchase order for quotation 310.xlsx", "order"],
  ["Devis de réparation.pdf", "quote"],
  ["Ticket de soporte 94.pdf", "uncategorized"],
] as const;
let useMixedDocuments = false;
let failThread = false;
let rejectWorkMailbox = false;
let oneBadThreadOnFirstPage = false;
let failOnce = false;
let staleOlderPage = false;
let holdPersonalOlder: Promise<void> | undefined;
let holdWorkRecovery: Promise<void> | undefined;
const workPrints: string[] = [];
let emptyMailbox = false;
let holdListing = false;
let changedWork = false;
let workListings = 0;
let workSearchStarts = 0;
let handoverThumbnails = 0;
let searchImageRequests = 0;
let fileRequests = 0;
let missingSnapshots = false;
let thumbnailDelay = 0;
let wordmarkThumbnails = 0;
let holdOriginal: Promise<void> | undefined;

test.beforeEach(() => {
  useMixedDocuments = false;
  failThread = false;
  rejectWorkMailbox = false;
  oneBadThreadOnFirstPage = false;
  failOnce = false;
  staleOlderPage = false;
  holdPersonalOlder = undefined;
  holdWorkRecovery = undefined;
  workPrints.length = 0;
  emptyMailbox = false;
  holdListing = false;
  changedWork = false;
  workListings = 0;
  workSearchStarts = 0;
  handoverThumbnails = 0;
  searchImageRequests = 0;
  fileRequests = 0;
  missingSnapshots = false;
  thumbnailDelay = 0;
  wordmarkThumbnails = 0;
  holdOriginal = undefined;
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const work = request.headers.cookie?.includes("library=work");
  const label = work ? "Work" : "Personal";
  const threads = mail[label];
  if (url.searchParams.get("disp") === "thd") {
    response.setHeader("Cache-Control", "private, max-age=0");
    const id = url.searchParams.get("th") as ThreadId;
    const part = url.searchParams.get("attid");
    if (work && id === second && part === "0.2") {
      wordmarkThumbnails++;
    }
    const index = Number(part?.split(".").at(-1)) - 1;
    const name =
      useMixedDocuments && work && id === first
        ? mixedDocuments[index]?.[0]
        : threads[id]?.files[index]?.[0];
    if (work && id === older && part === "0.1") {
      handoverThumbnails++;
    }
    if (thumbnailDelay) {
      await delay(thumbnailDelay);
    }
    if (missingSnapshots && work && id === second && part === "0.2") {
      response.setHeader("Content-Type", "image/png");
      response.end(await readFile(path.join(process.cwd(), "build/icons/16x16.png")));
    } else if (!missingSnapshots && /\.(?:pdf|png|jpg)$/i.test(name ?? "")) {
      response.setHeader("Content-Type", "image/png");
      response.end(await readFile(picture));
    } else {
      response.writeHead(404).end();
    }
    return;
  }
  if (url.searchParams.get("view") === "att") {
    fileRequests++;
    if (work && url.searchParams.get("th") === second && url.searchParams.get("attid") === "0.1") {
      await holdOriginal;
    }
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
    if (work && id) {
      workPrints.push(id);
    }
    if (work && rejectWorkMailbox) {
      response.writeHead(403).end();
      return;
    }
    if (!work && id === older) {
      await holdPersonalOlder;
    }
    if (work && id === second) {
      await holdWorkRecovery;
    }
    if ((failThread || failOnce) && id === second && work) {
      failOnce = false;
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
    const mixed = useMixedDocuments && work && id === first;
    const body = mixed
      ? "<div>Facture : 01.pdf et reçu pour la facture : 02.pdf.</div>"
      : work && id === second
        ? `<div><img src="?view=att&amp;th=${id}&amp;attid=0.3&amp;disp=emb"></div>`
        : "";
    const files = mixed ? mixedDocuments.map(([name]) => [name, "12 KB"]) : thread.files;
    const currentFiles =
      changedWork && work && id === first ? [["New invoice.pdf", "11 KB"]] : files;
    const tiles = currentFiles
      .map(
        ([name, size], index) =>
          `<table class="att"><tr><td><table><tr><td><a href="?view=att&amp;th=${id}&amp;attid=0.${index + 1}"><img></a></td><td><b>${holdOriginal && name === "Identity overview.pdf" ? "Slow image.png" : name}</b><br>${size}</td></tr></table></td></tr></table>`,
      )
      .join("");
    response.end(
      `<table class="message"><tr><td>${work && id === first ? `<img src="${senderPhoto}">` : ""}${thread.sender}</td><td>${thread.date}T12:00:00Z</td></tr><tr><td>${body}${tiles}</td></tr></table>`,
    );
    return;
  }
  if (url.pathname === "/mail/u/0/search-image") {
    searchImageRequests++;
    response.setHeader("Content-Type", "image/png");
    response.end(await readFile(picture));
    return;
  }
  if (url.pathname === "/mail/u/0/listing") {
    if (work) {
      workListings++;
      if (url.searchParams.has("start")) {
        workSearchStarts++;
      }
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ hold: holdListing }));
    return;
  }
  if (emptyMailbox) {
    response.end('<main role="main"><div class="TC">No conversations</div></main>');
    return;
  }
  response.end(`<main role="main"><table><tbody></tbody></table></main><script>
    let started = false;
    async function render() {
      if (!location.hash.startsWith('#search/')) return;
      if (!started) {
        const image = new Image();
        image.src = '/mail/u/0/search-image';
        document.querySelector('main').append(image);
      }
      const path = started ? '/mail/u/0/listing' : '/mail/u/0/listing?start';
      started = true;
      while ((await (await fetch(path)).json()).hold) await new Promise(resolve => setTimeout(resolve, 100));
      const older = location.hash.endsWith('/p2');
      const subjects = ${JSON.stringify(Object.fromEntries(Object.entries(threads).map(([id, thread]) => [id, thread.subject])))};
      const firstPage = ${JSON.stringify(work && oneBadThreadOnFirstPage ? [second] : [first, second])};
      if (${!!work && changedWork}) subjects['${first}'] = 'Updated studio planning session';
      function rows(ids) {
        document.querySelector('tbody').replaceChildren();
        for (const id of ids) {
          document.querySelector('tbody').insertAdjacentHTML('beforeend','<tr class="zA"><td><span data-legacy-thread-id="#'+id+'" class="bog">'+subjects[id]+'</span></td></tr>');
        }
      }
      if (older && ${work && staleOlderPage}) {
        rows(firstPage);
        setTimeout(()=>rows(['${older}']),750);
      } else {
        rows(older ? ['${older}'] : firstPage);
      }
      document.querySelector('main button')?.remove();
      document.querySelector('main').insertAdjacentHTML('beforeend','<button aria-disabled="'+older+'"><span class="amJ">Older</span></button>');
    }
    addEventListener('hashchange', render);
    render();
  </script>`);
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.GGMAIL_TEST_GMAIL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mail/u/0`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const languages = [
  {
    tag: "en",
    more: "More filters",
    extension: "File extension",
    attachments: "Attachments",
    invoice: "Invoice",
  },
  {
    tag: "de",
    more: "Weitere Filter",
    extension: "Dateiendung",
    attachments: "Anhänge",
    invoice: "Rechnung",
  },
  {
    tag: "es",
    more: "Más filtros",
    extension: "Extensión de archivo",
    attachments: "Archivos adjuntos",
    invoice: "Factura",
  },
  {
    tag: "el",
    more: "Περισσότερα φίλτρα",
    extension: "Επέκταση αρχείου",
    attachments: "Συνημμένα",
    invoice: "Τιμολόγιο",
  },
  {
    tag: "it",
    more: "Altri filtri",
    extension: "Estensione del file",
    attachments: "Allegati",
    invoice: "Fattura",
  },
  {
    tag: "fr",
    more: "Plus de filtres",
    extension: "Extension du fichier",
    attachments: "Pièces jointes",
    invoice: "Facture",
  },
] as const;

const ggmail = useApp(
  ({ userDataDir }) => ({
    theme: "light",
    "app.language":
      languages.find(({ tag }) =>
        test
          .info()
          .annotations.some((entry) => entry.type === "language" && entry.description === tag),
      )?.tag ?? "en",
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
  { env },
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

async function choose(trigger: Locator, name: string | RegExp) {
  await trigger.click();
  await ggmail.renderer.getByRole("option", { name, exact: typeof name === "string" }).click();
}

async function toggleCategory(trigger: Locator, name: string | RegExp) {
  await choose(trigger, name);
  const list = ggmail.renderer.getByRole("listbox");
  if (await list.isVisible()) {
    await list.press("Escape");
  }
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
  const formats = page.getByRole("group", { name: "File type" });
  await formats.getByRole("button", { name: "PDF", exact: true }).click();
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
  await expect(formats.getByRole("button", { name: "PDF", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await formats.getByRole("button", { name: "All files", exact: true }).click();
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
  await expect(page.getByRole("main", { name: "Attachments" })).toBeHidden();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("planning session");
  await expect(row.getByRole("button", { name: "Notes.txt" })).toBeFocused();
  await page.getByRole("button", { name: "Go forward" }).click();
  await expect(page.getByRole("main", { name: "Attachments" })).toBeHidden();
  expect(await ggmail.runMenuCommand("Back")).toBe(true);
  await expect(row.getByRole("button", { name: "Notes.txt" })).toBeFocused();
});

test("combines categories with format, account and search and remembers corrections", async () => {
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files")).toBeVisible();
  const filters = page.getByRole("complementary", { name: "Filters" });
  const filter = (name: string) => filters.getByRole("button", { name, exact: true });
  await filter("Invoice").click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("Τιμολόγιο");
  await filter("Contract").click();
  await expect(filter("Invoice")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await filter("Contract").click();
  await expect(filter("Contract")).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("group", { name: "File type" })
    .getByRole("button", { name: "PDF", exact: true })
    .click();
  await expect(filter("Invoice")).toHaveAccessibleDescription("0");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove filter “Contract”" }).press("Enter");
  await expect(filter("All categories")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Remove filter “Invoice”" })).toHaveCount(0);
  await filter("Contract").click();
  await filter("Personal").click();
  await expect(page.getByText("No matching files")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  const work = page
    .getByRole("listitem")
    .filter({ hasText: "Míra Chen" })
    .filter({ hasText: "Notes.txt" });
  const picker = work.getByRole("combobox", { name: "Category for Notes.txt" });
  await toggleCategory(picker, "Receipt");
  await filter("Receipt").click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(work).toBeVisible();
  await page.getByRole("button", { name: "Refresh attachments" }).click();
  await expect(picker).toHaveText("Receipt");
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(picker).toHaveText("Receipt");
  await page.getByRole("searchbox").fill("studio");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await choose(picker, /^Automatic/);
  await expect(page.getByText("No matching files")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(picker).toHaveText("Uncategorized");
  expect(fileRequests).toBe(0);
});

test("Back from a source email restores the filtered file and its scroll position", async () => {
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files", { exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "Filter by account" })
    .getByRole("button", { name: "Work", exact: true })
    .click();
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("main.html"))
      ?.setSize(1080, 360);
  });
  const row = page.getByRole("listitem").filter({ hasText: "Project handover.pdf" });
  const source = row.getByRole("button", { name: "Open email" });
  await source.scrollIntoViewIfNeeded();
  const scrollTop = () => row.evaluate((el) => el.closest(".overflow-y-auto")?.scrollTop ?? 0);
  const before = await scrollTop();
  expect(before).toBeGreaterThan(0);
  await source.click();
  await expect(page.getByRole("main", { name: "Attachments" })).toBeHidden();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(row.getByRole("button", { name: "Project handover.pdf" })).toBeFocused();
  await expect(
    page
      .getByRole("group", { name: "Filter by account" })
      .getByRole("button", { name: "Work", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(scrollTop).toBe(before);
});

test("switches the file type while retaining selected accounts and counting alternatives", async () => {
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files", { exact: true })).toBeVisible();
  const account = page.getByRole("group", { name: "Filter by account", exact: true });
  const formats = page.getByRole("group", { name: "File type", exact: true });
  for (const name of ["Work", "Personal"]) {
    await account.getByRole("button", { name, exact: true }).click();
  }
  const pdf = formats.getByRole("button", { name: "PDF", exact: true });
  const sheets = formats.getByRole("button", { name: "Spreadsheets", exact: true });
  await pdf.click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await sheets.click();
  await expect(pdf).toHaveAttribute("aria-pressed", "false");
  await expect(formats.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(account.locator('[aria-pressed="true"]')).toHaveCount(2);
  await sheets.click();
  await expect(sheets).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(
    account.getByRole("button", { name: "Work", exact: true }),
  ).toHaveAccessibleDescription("1");
  await expect(
    account.getByRole("button", { name: "Personal", exact: true }),
  ).toHaveAccessibleDescription("1");
  await account.getByRole("button", { name: "Personal", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(
    formats.getByRole("button", { name: "Images", exact: true }),
  ).toHaveAccessibleDescription("1");
  await page.getByRole("searchbox").fill('budget "planning session" mira');
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("Studio budget.xlsx");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  expect(fileRequests).toBe(0);
});

test("filters by exact extension, sender, size and received dates, and recovers from conflicting choices", async () => {
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "More filters" });
  const sender = menu.getByRole("textbox", { name: "Sender", exact: true });
  const ext = menu.getByLabel("File extension", { exact: true });
  const size = menu.getByLabel("Size", { exact: true });
  const from = menu.getByLabel("Received from");
  const through = menu.getByLabel("Received through");
  const embedded = menu.getByRole("checkbox", { name: "Include embedded images" });
  await expect(embedded).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Studio signature.png" })).toHaveCount(0);
  await embedded.press("Space");
  await expect(menu.getByText("11 files", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Studio signature.png" })).toHaveCount(1);
  await menu.getByRole("button", { name: "Clear filters" }).click();
  await expect(embedded).not.toBeChecked();
  await expect(menu.getByText("10 files", { exact: true })).toBeVisible();
  await sender.fill("chen mira");
  await ext.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ext).toBeFocused();
  await expect(menu).toBeVisible();
  const spacing = await ext.evaluate((button) => {
    const value = button.querySelector('[data-slot="select-value"]');
    const arrow = button.querySelector("svg");
    if (!value || !arrow) {
      throw new Error("Missing select value or chevron");
    }
    return {
      gap: arrow.getBoundingClientRect().left - value.getBoundingClientRect().right,
      inset: button.getBoundingClientRect().right - arrow.getBoundingClientRect().right,
    };
  });
  expect(spacing.gap).toBeGreaterThanOrEqual(3);
  expect(spacing.inset).toBeLessThanOrEqual(12);
  await choose(ext, /^\.xlsx /);
  await choose(size, /^Under 1 MB/);
  await from.fill("2026-11-17");
  await through.fill("2026-11-17");
  await expect(menu.getByText("1 file", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("Studio budget.xlsx");
  await page.screenshot({ path: test.info().outputPath("attachment-detail-filters.png") });
  await from.fill("2026-11-18");
  await expect(menu.getByRole("alert")).toBeVisible();
  await expect(menu.getByText("0 files", { exact: true })).toBeVisible();
  await from.fill("2026-11-17");
  await expect(menu.getByRole("alert")).toHaveCount(0);
  await choose(size, /^10 MB or more/);
  await expect(menu.getByText("0 files", { exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("No matching files")).toBeVisible();
  await page.locator(".attachment-filter-chip").last().press("Enter");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.getByRole("button", { name: "Refresh attachments" }).click();
  await expect(page.locator(".attachment-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Go back" }).click();
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await expect(ext).toContainText(".xlsx");
  await menu.getByRole("button", { name: "Clear filters" }).click();
  await expect(menu.getByText("10 files", { exact: true })).toBeVisible();
  await expect(from).toHaveValue("");
  await expect(sender).toHaveValue("");
  expect(fileRequests).toBe(0);
});

test("categorizes a mixed-language message per attachment and uses those categories in filters", async () => {
  useMixedDocuments = true;
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  for (const [name, category] of mixedDocuments) {
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name, exact: true }) });
    await expect(row.locator(".attachment-category-picker")).toHaveAttribute(
      "data-attachment-category",
      category,
    );
  }
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("02.pdf");
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await page.getByRole("button", { name: "Ticket", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(
    page.getByRole("button", {
      name: "Web Booking eTicket (ZX72QK) - ALEX EXAMPLE.pdf",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reservation", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Ticket", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: webBookingTicket, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByRole("combobox", { name: "Category for " + webBookingTicket })).toHaveText(
    /Ticket.*Reservation/,
  );
  expect(fileRequests).toBe(0);
});

test("upgrades a cached e-ticket before Gmail responds and keeps manual categories", async () => {
  useMixedDocuments = true;
  await identifyProfiles();
  const open = () =>
    ggmail.renderer.getByRole("button", { name: "Attachments", exact: true }).click();
  const category = (name: string) =>
    ggmail.renderer.getByRole("combobox", { name: "Category for " + name, exact: true });
  const boardingPass = "Bordkarte zur Buchung Q5.pkpass";
  await open();
  await expect(category(webBookingTicket)).toHaveText(/Ticket.*Reservation/);
  await toggleCategory(category(boardingPass), "Reservation");
  await expect(category(boardingPass)).toHaveText(/Ticket.*Reservation/);
  await expect(category("Project handover.pdf")).toBeVisible();
  const indexed = [...workPrints];

  holdListing = true;
  try {
    await ggmail.relaunch();
    // Seed the old on-disk result in the temporary profile before the library opens.
    const directory = path.join(
      ggmail.userDataDir,
      "attachment-index",
      createHash("sha256").update("Work").digest("hex"),
    );
    const [filename] = await readdir(directory);
    if (!filename) {
      throw new Error("Fixture mailbox index missing");
    }
    const db = new DatabaseSync(path.join(directory, filename));
    try {
      for (const name of [webBookingTicket, boardingPass]) {
        const key = mixedDocuments.findIndex(([title]) => title === name);
        expect(
          db
            .prepare(
              "UPDATE threads SET files = json_set(json_remove(files, ?), ?, 'uncategorized') WHERE id = ?",
            )
            .run("$[" + key + "].detectedCategories", "$[" + key + "].detectedCategory", first)
            .changes,
        ).toBe(1);
      }
      db.exec("PRAGMA user_version = 0");
    } finally {
      db.close();
    }
    await identifyProfiles();
    await open();
    await expect(category(webBookingTicket)).toHaveText(/Ticket.*Reservation/);
    await expect(category(boardingPass)).toHaveText(/Ticket.*Reservation/);
    await toggleCategory(category(boardingPass), /^Automatic/);
    await expect(category(boardingPass)).toHaveText("Ticket");
    expect(workPrints).toEqual(indexed);
    expect(fileRequests).toBe(0);
  } finally {
    holdListing = false;
  }
});

test("an explicit Uncategorized survives restart until automatic detection is restored", async () => {
  await identifyWorkMailbox();
  const open = () =>
    ggmail.renderer.getByRole("button", { name: "Attachments", exact: true }).click();
  const category = () =>
    ggmail.renderer.getByRole("combobox", { name: "Category for Project handover.pdf" });
  await open();
  await toggleCategory(category(), "Uncategorized");
  await expect(category()).toHaveText("Uncategorized");
  await ggmail.relaunch();
  await identifyWorkMailbox();
  await open();
  await expect(category()).toHaveText("Uncategorized");
  await toggleCategory(category(), /^Automatic/);
  await ggmail.renderer.getByRole("button", { name: "Contract", exact: true }).click();
  await expect(category()).toHaveText("Contract");
  await expect(ggmail.renderer.getByRole("listitem")).toHaveCount(1);
});

for (const { tag, attachments, invoice, more, extension } of languages) {
  test(
    `filter a Greek invoice in the ${tag} interface`,
    {
      annotation: { type: "language", description: tag },
    },
    async () => {
      await identifyWorkMailbox();
      const page = ggmail.renderer;
      await page.getByRole("button", { name: attachments, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", tag);
      await page.getByRole("button", { name: invoice, exact: true }).click();
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expect(
        page.getByRole("listitem").getByRole("button", { name: "Τιμολόγιο_2026.csv" }),
      ).toBeVisible();
      await page.getByRole("button", { name: more, exact: true }).click();
      const advanced = page.getByRole("dialog", { name: more });
      await choose(advanced.getByRole("combobox", { name: extension, exact: true }), /^\.csv /);
      await advanced.press("Escape");
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await page.locator(".attachment-filter-chip").filter({ hasText: ".csv" }).press("Enter");
      await ggmail.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().includes("main.html"))
          ?.setSize(320, 600);
      });
      const chip = page.locator(".attachment-filter-chip");
      await expect(chip).toContainText(invoice);
      await expect(chip).toBeInViewport();
      await chip.press("Enter");
      await expect(page.getByRole("searchbox")).toBeFocused();
      await expect(page.getByRole("listitem")).toHaveCount(10);
    },
  );
}

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
  await card.getByRole("button", { name: "City walks.zip" }).press("Enter");
  await preview.getByRole("button", { name: "Open email" }).click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toHaveCount(0);
  await expect
    .poll(() =>
      ggmail.app.evaluate(({ webContents }) =>
        webContents
          .getAllWebContents()
          .some((view) => view.getURL().endsWith("#all/194a92f8c0000001")),
      ),
    )
    .toBe(true);
});

test("shows available files while a sibling thread is slow and resumes after leaving", async () => {
  await identifyWorkMailbox();
  const slow = Promise.withResolvers<void>();
  holdWorkRecovery = slow.promise;
  const page = ggmail.renderer;
  const open = () => page.getByRole("button", { name: "Attachments", exact: true }).click();
  try {
    await open();
    await expect(page.getByRole("button", { name: "Studio budget.xlsx" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Identity overview.pdf" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Attachments" })).toHaveCount(0);
    await open();
    await expect(page.getByRole("button", { name: "Studio budget.xlsx" })).toBeVisible();
  } finally {
    slow.resolve();
  }
  await expect(page.getByText("10 files", { exact: true })).toBeVisible();
  expect(workPrints.filter((id) => id === first)).toHaveLength(1);
});

test("reuses the Gmail search document and loaded thumbnails across layouts", async () => {
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files", { exact: true })).toBeVisible();
  expect(workSearchStarts).toBe(1);
  expect(searchImageRequests).toBe(0);
  await page.getByRole("searchbox").fill("Project handover.pdf");
  await expect(page.locator(".attachment-miniature img")).toBeVisible();
  expect(handoverThumbnails).toBe(1);
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.locator(".attachment-cover img")).toBeVisible();
  expect(handoverThumbnails).toBe(1);
  expect(fileRequests).toBe(0);
});

test("loads a nearby row before it scrolls into view", async () => {
  useMixedDocuments = true;
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await ggmail.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes("main.html"))
      ?.setSize(1200, 540),
  );
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("18 files", { exact: true })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Project handover.pdf" });
  expect(handoverThumbnails).toBe(0);
  await row.evaluate((el) => {
    const viewport = el.closest("[data-attachment-viewport]");
    if (!viewport) {
      throw new Error("Missing attachment viewport");
    }
    viewport.scrollTop +=
      el.getBoundingClientRect().top - viewport.getBoundingClientRect().bottom - 80;
  });
  await expect(row).not.toBeInViewport();
  const image = row.locator(".attachment-miniature img");
  await image.waitFor({ state: "attached" });
  await image.evaluate((img: HTMLImageElement) => img.decode());
  await row.scrollIntoViewIfNeeded();
  await expect(image).toBeInViewport();
  expect(handoverThumbnails).toBe(1);
  expect(fileRequests).toBe(0);
});

test("paints a saved thumbnail after restart without waiting for Gmail", async () => {
  thumbnailDelay = 350;
  async function timeToImage() {
    const page = ggmail.renderer;
    await page.evaluate(() => {
      document.addEventListener(
        "click",
        () => {
          performance.mark("open-library");
          function frame() {
            const row = [...document.querySelectorAll(".attachment-row")].find((el) =>
              el.textContent.includes("Wordmark studies.png"),
            );
            const img = row?.querySelector<HTMLImageElement>(".attachment-miniature img");
            if (img?.complete && img.naturalWidth && img.getBoundingClientRect().height) {
              performance.measure("thumbnail-ready", "open-library");
            } else {
              requestAnimationFrame(frame);
            }
          }
          requestAnimationFrame(frame);
        },
        { capture: true, once: true },
      );
    });
    await page.getByRole("button", { name: "Attachments", exact: true }).click();
    const timing = await page.waitForFunction(
      () => performance.getEntriesByName("thumbnail-ready")[0]?.duration,
    );
    return Math.round(Number(await timing.jsonValue()));
  }
  await identifyProfiles();
  const cold = await timeToImage();
  expect(wordmarkThumbnails).toBe(1);
  holdListing = true;
  try {
    await ggmail.relaunch();
    await identifyProfiles();
    const restored = await timeToImage();
    await test.info().attach("thumbnail-latency", {
      body: JSON.stringify({ cold, restored, wordmarkThumbnails }),
      contentType: "application/json",
    });
    expect(wordmarkThumbnails, JSON.stringify({ cold, restored })).toBe(1);
  } finally {
    holdListing = false;
  }
});

test("a slow original leaves capacity for another visible grid cover", async () => {
  missingSnapshots = true;
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  const gate = Promise.withResolvers<void>();
  holdOriginal = gate.promise;
  try {
    await page.getByRole("button", { name: "Attachments", exact: true }).click();
    const search = page.getByRole("searchbox");
    await search.fill("Slow image.png");
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect.poll(() => fileRequests).toBe(1);
    await search.fill("Autumn identity review");
    const sibling = page.getByRole("listitem").filter({ hasText: "Wordmark studies.png" });
    await expect(sibling.locator(".attachment-cover img")).toBeVisible();
  } finally {
    gate.resolve();
  }
});

test("renders image and PDF covers when a Gmail thumbnail is a placeholder or missing", async () => {
  missingSnapshots = true;
  await identifyProfiles();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  const search = page.getByRole("searchbox");
  await search.fill("Wordmark studies.png");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  expect(fileRequests).toBe(0);
  await page.getByRole("button", { name: "Grid view" }).click();
  const width = () =>
    page
      .locator(".attachment-cover img")
      .evaluateAll((images) => (images[0] as HTMLImageElement | undefined)?.naturalWidth ?? 0);
  await expect.poll(width).toBe(32);
  await search.fill("Project handover.pdf");
  await expect.poll(width).toBeGreaterThan(32);
  const pageCover = page.locator('.attachment-cover[data-file-kind="pdf"] img');
  await expect(pageCover).toHaveCSS("object-fit", "cover");
  await expect(pageCover).toHaveCSS("object-position", "50% 0%");
  expect(fileRequests).toBe(2);
  await page.getByRole("button", { name: "List view" }).click();
  await expect.poll(async () => (await ggmail.readConfig())["attachments.layout"]).toBe("list");
  const requests = handoverThumbnails;
  holdListing = true;
  try {
    await ggmail.relaunch();
    await identifyProfiles();
    const restored = ggmail.renderer;
    await restored.getByRole("button", { name: "Attachments", exact: true }).click();
    await restored.getByRole("searchbox").fill("Project handover.pdf");
    const thumbnail = restored.locator(".attachment-miniature img");
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(32);
    expect(handoverThumbnails).toBe(requests);
    expect(fileRequests).toBe(2);
  } finally {
    holdListing = false;
  }
});

test("aligns every card detail with short and long filenames", async () => {
  useMixedDocuments = true;
  await identifyWorkMailbox();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await page.getByRole("button", { name: "Grid view" }).click();
  await expect(page.getByRole("button", { name: webBookingTicket, exact: true })).toBeVisible();
  const offsets = await page.locator(".attachment-card").evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      const positions = [
        ".attachment-cover",
        ".attachment-preview",
        ".attachment-subject",
        ".attachment-card-category",
        ".attachment-card-sender",
        ".attachment-card-footer",
        ".attachment-actions",
      ].map((selector) => {
        const slot = card.querySelector(selector);
        if (!slot) {
          throw new Error("Missing card detail " + selector);
        }
        return Math.round(slot.getBoundingClientRect().top - box.top);
      });
      const title = card.querySelector(".attachment-preview span");
      if (!title) {
        throw new Error("Missing filename");
      }
      return {
        positions: [Math.round(box.height), ...positions],
        titleLines: Math.round(
          title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight),
        ),
      };
    }),
  );
  expect(new Set(offsets.map((card) => JSON.stringify(card.positions))).size).toBe(1);
  expect(new Set(offsets.map((card) => card.titleLines))).toEqual(new Set([1, 2]));
});

test("retains partial results, retries only unreadable mail, and refreshes to an empty mailbox", async () => {
  await identifyWorkMailbox();
  failThread = true;
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("8 files")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    /Some messages in Work couldn’t be checked.*Previously loaded files are still available/,
  );
  await page.getByRole("searchbox").fill("no such attachment");
  await expect(page.getByRole("status")).toContainText("Previously loaded files");
  await page.getByRole("searchbox").fill("");
  const successfulRequests = workPrints.filter((id) => id !== second);
  failThread = false;
  const recovery = Promise.withResolvers<void>();
  holdWorkRecovery = recovery.promise;
  try {
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await expect(page.getByText("8 files")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(8);
  } finally {
    recovery.resolve();
  }
  await expect(page.getByText("10 files")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(workPrints.filter((id) => id !== second)).toEqual(successfulRequests);
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

async function identifyProfiles(workEmail = "work@example.test") {
  await identifyWorkMailbox();
  await ggmail.app.evaluate(({ session, webContents, ipcMain }, email) => {
    for (const [account, address] of [
      ["Work", email],
      ["Personal", "personal@example.test"],
    ]) {
      const partition = session.fromPartition("persist:" + account);
      const view = webContents
        .getAllWebContents()
        .find((w) => w.session === partition && w.getURL().includes("/mail/u/0"));
      if (!view) {
        throw new Error("Missing fixture mailbox");
      }
      // The Gmail preload reads the profile meta tag only on mail.google.com.
      ipcMain.emit("gmail.setUserEmail", { sender: view }, address);
    }
  }, workEmail);
}

test("restores files before Gmail responds and refreshes only changed conversations", async () => {
  await identifyProfiles();
  const open = () =>
    ggmail.renderer.getByRole("button", { name: "Attachments", exact: true }).click();
  await open();
  await expect(ggmail.renderer.getByText("10 files", { exact: true })).toBeVisible();
  const indexed = [...workPrints];
  workListings = 0;
  changedWork = true;
  holdListing = true;
  await ggmail.relaunch();
  await identifyProfiles();
  await open();
  try {
    await expect(ggmail.renderer.getByText("10 files", { exact: true })).toBeVisible();
    await expect.poll(() => workListings).toBeGreaterThan(0);
    expect(workPrints).toEqual(indexed);
    await ggmail.renderer.getByRole("searchbox").fill("studio budget");
    await expect(ggmail.renderer.getByRole("listitem")).toHaveCount(1);
    await ggmail.renderer.getByRole("searchbox").fill("");
  } finally {
    holdListing = false;
  }
  await expect(ggmail.renderer.getByText("9 files", { exact: true })).toBeVisible();
  await expect(
    ggmail.renderer.getByRole("button", { name: "New invoice.pdf", exact: true }),
  ).toBeVisible();
  await expect(ggmail.renderer.getByText("Studio budget.xlsx", { exact: true })).toHaveCount(0);
  expect(workPrints).toEqual([...indexed, first]);
  // Cached file actions still use the correct account and fresh Gmail credentials.
  await ggmail.renderer.getByRole("button", { name: "Project handover.pdf", exact: true }).click();
  await expect(
    ggmail.renderer.getByRole("dialog").locator('embed[type="application/pdf"]'),
  ).toBeVisible();
  await ggmail.renderer.keyboard.press("Escape");
  holdListing = true;
  await ggmail.relaunch();
  await identifyProfiles("different@example.test");
  await open();
  try {
    await expect(ggmail.renderer.getByText("5 files", { exact: true })).toBeVisible();
    await expect(ggmail.renderer.getByText("New invoice.pdf", { exact: true })).toHaveCount(0);
  } finally {
    holdListing = false;
  }
});

test("resumes an incomplete mailbox after quitting without reading successful threads again", async () => {
  await identifyProfiles();
  failThread = true;
  const open = () =>
    ggmail.renderer.getByRole("button", { name: "Attachments", exact: true }).click();
  await open();
  await expect(ggmail.renderer.getByRole("status")).toContainText("Some messages in Work");
  await expect(ggmail.renderer.getByText("8 files", { exact: true })).toBeVisible();
  const before = [...workPrints];
  await ggmail.relaunch();
  failThread = false;
  holdListing = true;
  await identifyProfiles();
  await open();
  try {
    await expect(ggmail.renderer.getByText("8 files", { exact: true })).toBeVisible();
    expect(workPrints).toEqual(before);
  } finally {
    holdListing = false;
  }
  await expect(ggmail.renderer.getByText("10 files", { exact: true })).toBeVisible();
  expect(workPrints).toEqual([...before, second]);
});

test("recovers from a transient Gmail failure and waits for older search rows", async () => {
  await identifyWorkMailbox();
  failOnce = true;
  staleOlderPage = true;
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByText("10 files")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  expect(workPrints.filter((id) => id === second)).toHaveLength(2);
});

test("checks later pages after one unreadable thread and keeps healthy scans running during retry", async () => {
  await identifyWorkMailbox();
  oneBadThreadOnFirstPage = true;
  failThread = true;
  const loading = Promise.withResolvers<void>();
  holdPersonalOlder = loading.promise;
  const page = ggmail.renderer;
  try {
    await page.getByRole("button", { name: "Attachments", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Some messages in Work");
    await expect(page.getByText("Still checking Personal…")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Project handover.pdf", exact: true }),
    ).toBeVisible();
    failThread = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("listitem")).toHaveCount(6);
  } finally {
    loading.resolve();
  }
  await expect(page.getByRole("listitem")).toHaveCount(8);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("distinguishes an unavailable account from partial results and clears its warning after retry", async () => {
  await identifyWorkMailbox();
  rejectWorkMailbox = true;
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Couldn’t check Work for attachments.");
  await expect(page.getByRole("listitem")).toHaveCount(5);
  rejectWorkMailbox = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  await expect(page.getByRole("status")).toHaveCount(0);
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
  await filters.getByRole("button", { name: "Contract", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Contract", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await filters.getByRole("button", { name: "All categories", exact: true }).click();
  await filters.getByRole("button", { name: "Done", exact: true }).click();
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
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(320);
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
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await choose(filters.getByRole("combobox", { name: "File extension", exact: true }), /^\.pdf /);
  await filters.getByLabel("Received through").fill("2026-11-17");
  await expect(filters.getByText("1 file", { exact: true })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Done" })).toBeInViewport();
  expect(await filters.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await filters.getByRole("button", { name: "Clear filters" }).click();
  await expect(filters.getByText("10 files", { exact: true })).toBeVisible();
  await filters.getByRole("button", { name: "Done" }).click();
  await ggmail.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("main.html"),
    );
    win?.setMinimumSize(320, 320);
    win?.setContentSize(360, 440);
  });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect
    .poll(() => filters.locator(".attachment-filter-scroll").evaluate((el) => el.clientHeight))
    .toBeGreaterThan(230);
  test.info().annotations.push({
    type: "Filter choices height",
    description: String(
      await filters.locator(".attachment-filter-scroll").evaluate((el) => el.clientHeight),
    ),
  });
  await filters.getByLabel("Received through").focus();
  await expect(filters.getByRole("button", { name: "Done" })).toBeInViewport();
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("attachment-filters-compact.png"),
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeFocused();
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("Project handover");
  await search.press("ArrowDown");
  const file = page.getByRole("button", { name: "Project handover.pdf", exact: true });
  await expect(file).toBeFocused();
  await file.press("Enter");
  const preview = page.getByRole("dialog");
  await expect(preview.getByRole("button", { name: "Download", exact: true })).toBeInViewport();
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(file).toBeFocused();
  await search.fill("missing");
  await expect(page.getByText("No matching files")).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await search.press("Escape");
  await expect(page.getByRole("heading", { name: "Attachments" })).toHaveCount(0);
});
