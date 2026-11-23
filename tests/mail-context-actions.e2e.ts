import assert from "node:assert/strict";
import { ASSISTANT_PROMPT_LIMIT, type AssistantRequest } from "@ggmail/shared/assistant";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const ggmail = useApp(
  {
    "workspaceApps.mode": "tabs",
    "workspaceApps.openInApp": true,
    "window.restrictMinimumSize": false,
  },
  { args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] },
);
const threadId = "194a92f8c0000001";
const subject = "Project review & next steps";
const selection = "Send the revised proposal by Friday";
const owner = "planning@example.test";

async function setLayout(
  page: "task-draft" | "main",
  width: number,
  height: number,
  dark: boolean,
) {
  await ggmail.app.evaluate(
    ({ BrowserWindow, nativeTheme }, layout) => {
      const win = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().includes("/" + layout.page + ".html"),
      );
      if (!win) {
        throw Error("Window unavailable");
      }
      nativeTheme.themeSource = layout.dark ? "dark" : "light";
      win.setContentSize(layout.width, layout.height);
    },
    { page, width, height, dark },
  );
}

async function getPopup() {
  const find = () =>
    ggmail.app.windows().find((page) => page.url().includes("/context-menu.html?"));
  await expect.poll(find).toBeTruthy();
  const popup = find();
  assert(popup);
  await expect(popup.getByRole("menu")).toBeVisible();
  return popup;
}

test("edits and saves a selected task, preserves its origin and chooses between Calendar dates", async () => {
  await ggmail.app.evaluate(({ shell }, email) => {
    process.env.GGMAIL_GOOGLE_TASKS_CLIENT_JSON = JSON.stringify({
      installed: { client_id: "fixture.apps.googleusercontent.com", client_secret: "fixture" },
    });
    const originalFetch = globalThis.fetch;
    shell.openExternal = async (href) => {
      const consent = new URL(href);
      if (consent.origin === "https://tasks.google.com") {
        process.env.GGMAIL_E2E_TASK_URL = href;
        return;
      }
      if (
        consent.hostname !== "accounts.google.com" ||
        consent.searchParams.get("login_hint") !== email
      ) {
        throw Error("Unexpected consent");
      }
      const callback = new URL(consent.searchParams.get("redirect_uri") ?? "");
      callback.searchParams.set("state", consent.searchParams.get("state") ?? "");
      callback.searchParams.set("code", "fixture");
      await originalFetch(callback);
    };
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      switch (String(input)) {
        case "https://oauth2.googleapis.com/token":
          if (new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token") {
            process.env.GGMAIL_E2E_REFRESHES = String(
              Number(process.env.GGMAIL_E2E_REFRESHES ?? "0") + 1,
            );
            return Response.json({ access_token: "renewed", expires_in: 3600 });
          }
          return Response.json({
            access_token: "fixture",
            refresh_token: "renew-fixture",
            expires_in: 3600,
          });
        case "https://www.googleapis.com/oauth2/v2/userinfo":
          return Response.json({ email, verified_email: true });
        case "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks":
          if (new Headers(init?.headers).get("Authorization") === "Bearer fixture") {
            return new Response(null, { status: 401 });
          }
          if (
            init?.method !== "POST" ||
            new Headers(init.headers).get("Authorization") !== "Bearer renewed"
          ) {
            throw Error("Unexpected task request");
          }
          process.env.GGMAIL_E2E_AUTHORIZED_INSERTS = String(
            Number(process.env.GGMAIL_E2E_AUTHORIZED_INSERTS ?? "0") + 1,
          );
          if (process.env.GGMAIL_E2E_AUTHORIZED_INSERTS === "1") {
            throw new TypeError("Uncertain network outcome");
          }
          process.env.GGMAIL_E2E_TASK_BODY = String(init.body);
          return Response.json({
            id: "fixture",
            webViewLink: "https://tasks.google.com/task/fixture",
          });
        default:
          return originalFetch(input, init);
      }
    }, originalFetch);
  }, owner);
  const { signInUrl, gmailUrl } = ggmail.gmailStandIn;
  const find = () => ggmail.app.windows().find((page) => page.url() === signInUrl);
  await expect.poll(find).toBeTruthy();
  const mail = find();
  assert(mail);
  await mail.route(gmailUrl + "**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<main role="main"><h2 class="hP">Project review &amp; next steps</h2>
      <div role="toolbar"><button aria-label="Add to Tasks" onclick="this.dataset.used='true'">Tasks</button></div>
      <section class="adn" data-legacy-message-id="194a92f8c0000012"><span class="gD" email="alex@example.test">Alex</span><p class="a3s"><span>${selection}</span> Other message details.</p></section></main>`,
    }),
  );
  await mail.goto(gmailUrl + "#inbox/" + threadId);
  await ggmail.app.evaluate(
    ({ webContents, ipcMain }, { url, email }) => {
      const source = webContents.getAllWebContents().find((view) => view.getURL() === url);
      if (!source) {
        throw new Error("Missing mailbox");
      }
      ipcMain.emit("gmail.setUserEmail", { sender: source, senderFrame: source.mainFrame }, email);
    },
    { url: mail.url(), email: owner },
  );
  await ggmail.renderer.evaluate(() =>
    localStorage.setItem("assistant.unsentPrompt", "Draft question"),
  );
  const rightClickSelection = async () => {
    const text = mail.locator(".a3s span");
    await text.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selected = getSelection();
      selected?.removeAllRanges();
      selected?.addRange(range);
    });
    await text.click({ button: "right" });
    return getPopup();
  };
  await ggmail.app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  const first = await rightClickSelection();
  await expect(first.getByRole("menu")).toHaveCSS("background-color", "rgb(48, 48, 48)");
  await expect(first.getByRole("menuitem", { name: "Add to Tasks" })).toBeVisible();
  await first.screenshot({
    path: test.info().outputPath("message-menu.png"),
    scale: "css",
    omitBackground: true,
  });
  await first.getByRole("menu").press("ArrowDown");
  await expect(first.getByRole("menuitem", { name: "Quote to assistant" })).toBeFocused();
  await first.keyboard.down("Enter");
  await expect(
    ggmail.renderer.getByRole("textbox", { name: "Message the mail assistant" }),
  ).toHaveValue("Draft question");
  await expect(ggmail.renderer.getByText("alex@example.test", { exact: true })).toBeVisible();
  await expect(ggmail.renderer.getByRole("blockquote")).toHaveText(selection);
  await ggmail.app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "light";
  });
  const copy = await rightClickSelection();
  await expect(copy.getByRole("menu")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await copy.screenshot({
    path: test.info().outputPath("message-menu-light.png"),
    scale: "css",
    omitBackground: true,
  });
  await copy.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect
    .poll(() => ggmail.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(selection);
  const next = await rightClickSelection();
  await next.getByRole("menuitem", { name: "Add to Tasks" }).click();
  const findTask = () =>
    ggmail.app.windows().find((page) => page.url().includes("/task-draft.html?"));
  await expect.poll(findTask).toBeTruthy();
  const task = findTask();
  assert(task);
  await expect(task.getByLabel("Task title")).toHaveValue("Send the revised proposal");
  await expect(task.getByLabel("Due date", { exact: true })).toHaveValue(
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  );
  expect(
    new Date(
      (await task.getByLabel("Due date", { exact: true }).inputValue()) + "T12:00:00Z",
    ).getUTCDay(),
  ).toBe(5);
  await task.screenshot({ path: test.info().outputPath("selection-task.png"), scale: "css" });
  await setLayout("task-draft", 380, 355, true);
  await expect(task.locator("html")).toHaveClass(/dark/);
  await expect(task.getByRole("button", { name: "Connect Google Tasks" })).toBeInViewport();
  const clearDue = task.getByRole("button", { name: "Clear due date" });
  await clearDue.press("Enter");
  await expect(task.getByLabel("Due date", { exact: true })).toHaveValue("");
  await expect(task.getByLabel("Due date", { exact: true })).toBeFocused();
  await task.screenshot({
    path: test.info().outputPath("selection-task-compact-dark.png"),
    scale: "css",
  });
  await task.getByLabel("Task title").fill("Send approved proposal");
  await task.getByLabel("Due date", { exact: true }).fill("2027-02-12");
  await (await rightClickSelection()).getByRole("menuitem", { name: "Add to Tasks" }).click();
  expect(
    ggmail.app.windows().filter((page) => page.url().includes("/task-draft.html?")),
  ).toHaveLength(1);
  await expect(task.getByLabel("Task title")).toHaveValue("Send approved proposal");
  await task.getByRole("button", { name: "Connect Google Tasks" }).click();
  await task.getByRole("button", { name: "Save", exact: true }).click();
  await expect(task.getByRole("alert")).toHaveText("Check Google Tasks before retrying the save.");
  expect(await ggmail.app.evaluate(() => process.env.GGMAIL_E2E_AUTHORIZED_INSERTS)).toBe("1");
  await expect(task.getByLabel("Task title")).toHaveValue("Send approved proposal");
  await task.getByRole("button", { name: "Save", exact: true }).click();
  await expect(task.getByRole("status")).toHaveText("Task created");
  expect(await ggmail.app.evaluate(() => process.env.GGMAIL_E2E_REFRESHES)).toBe("1");
  await expect(task.getByRole("button", { name: "Open in Google Tasks" })).toBeFocused();
  await expect(task.getByRole("link", { name: /Open original/ })).toHaveAttribute(
    "href",
    /194a92f8c0000012$/,
  );
  await expect(task.locator("time")).toHaveAttribute("datetime", "2027-02-12");
  await task.screenshot({ path: test.info().outputPath("task-created.png"), scale: "css" });
  await task.getByRole("button", { name: "Open in Google Tasks" }).click();
  await expect
    .poll(() => ggmail.app.evaluate(() => process.env.GGMAIL_E2E_TASK_URL))
    .toBe("https://tasks.google.com/task/fixture?authuser=planning%40example.test");
  await expect.poll(() => task.isClosed()).toBe(true);
  expect(
    await ggmail.app.evaluate(() => JSON.parse(process.env.GGMAIL_E2E_TASK_BODY ?? "{}")),
  ).toEqual({
    title: "Send approved proposal",
    due: "2027-02-12T00:00:00.000Z",
    notes:
      "Due date · 2027-02-12\n\n" +
      selection +
      "\n\nhttps://mail.google.com/mail/u/planning%40example.test/#all/194a92f8c0000012",
  });
  const setSelection = async (value: string) =>
    mail.locator(".a3s span").evaluate((node, text) => {
      node.textContent = text;
    }, value);
  const openChoices = async (text: string) => {
    await setSelection(text);
    await (await rightClickSelection()).getByRole("menuitem", { name: "Add to Calendar…" }).click();
    return getPopup();
  };
  await (await rightClickSelection()).getByRole("menuitem", { name: "Add to Tasks" }).click();
  await expect.poll(findTask).toBeTruthy();
  const cancelled = findTask();
  assert(cancelled);
  await cancelled.getByLabel("Task title").focus();
  await cancelled.keyboard.down("Escape");
  await expect.poll(() => cancelled.isClosed()).toBe(true);
  await ggmail.app
    .context()
    .route("https://calendar.google.com/**", (route) => route.fulfill({ body: "Calendar draft" }));
  await setLayout("main", 1150, 780, false);
  const allDay = await openChoices("Thursday or Friday");
  await expect(allDay.getByText("All day", { exact: true })).toHaveCount(2);
  await allDay.keyboard.down("Escape");
  await expect.poll(() => allDay.isClosed()).toBe(true);
  const mixed = await openChoices("Thursday 14:00 Vienna time; Friday 15:00 London time");
  await expect(mixed.getByRole("menuitem").first()).toContainText("Europe/Vienna");
  await expect(mixed.getByRole("menuitem").last()).toContainText("Europe/London");
  await mixed.keyboard.down("Escape");
  await expect.poll(() => mixed.isClosed()).toBe(true);
  const dates = "Thursday, 14:00–14:30 or Friday, 15:00–16:00 Vienna time";
  const choices = await openChoices(dates);
  await expect(choices.getByRole("menuitem")).toHaveCount(2);
  await expect(choices.getByRole("menu", { name: "Choose a date" })).toBeVisible();
  await expect(choices.getByText("Europe/Vienna", { exact: true })).toHaveCount(1);
  await choices.getByRole("menu").press("ArrowDown");
  await choices.screenshot({
    path: test.info().outputPath("calendar-choices.png"),
    scale: "css",
    omitBackground: true,
  });
  await choices.keyboard.down("Escape");
  await expect.poll(() => choices.isClosed()).toBe(true);
  await setLayout("main", 400, 640, true);
  await (await rightClickSelection()).getByRole("menuitem", { name: "Add to Calendar…" }).click();
  const compact = await getPopup();
  await expect(compact.locator("html")).toHaveClass(/dark/);
  await compact.getByRole("menu").press("f");
  const friday = compact.getByRole("menuitem", { name: /Fri.*Europe\/Vienna/ });
  await expect(friday).toBeFocused();
  await expect(friday).toBeInViewport();
  await compact.screenshot({
    path: test.info().outputPath("calendar-choices-compact-dark.png"),
    scale: "css",
    omitBackground: true,
  });
  await compact.keyboard.down("Enter");
  const draft = () =>
    ggmail.app
      .windows()
      .map((page) => new URL(page.url()))
      .find((url) => url.hostname === "calendar.google.com");
  await expect.poll(() => draft()?.searchParams.get("text")).toBe(subject);
  expect(draft()?.searchParams.get("details")).toBe(
    dates + "\n\nhttps://mail.google.com/mail/u/planning%40example.test/#all/194a92f8c0000012",
  );
  expect(draft()?.searchParams.get("authuser")).toBe(owner);
  expect(draft()?.searchParams.get("ctz")).toBe("Europe/Vienna");
  const times = draft()?.searchParams.get("dates")?.split("/");
  assert(times?.[0] && times[1]);
  function clock(stamp: string) {
    const iso = stamp.replace(/^(....)(..)(..)T(..)(..)(..)Z$/, "$1-$2-$3T$4:$5:$6Z");
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Vienna",
    }).format(new Date(iso));
  }
  expect(clock(times[0])).toMatch(/Fri.*15:00/);
  expect(clock(times[1])).toMatch(/Fri.*16:00/);
});

test("the Mail sidebar menu supports keyboard dismissal and the Gmail inbox menu keeps its original actions", async () => {
  const rail = ggmail.renderer.getByRole("navigation", { name: "Workspace apps" });
  await rail.getByRole("button", { name: "Mail", exact: true }).click({ button: "right" });
  const popup = await getPopup();
  await expect(popup.getByRole("menuitem", { name: "Open inbox" })).toBeVisible();
  await popup.keyboard.down("Escape");
  await expect.poll(() => popup.isClosed()).toBe(true);

  await rail.getByRole("button", { name: "Calendar", exact: true }).click({ button: "right" });
  const calendar = await getPopup();
  await expect(calendar.getByRole("menuitem", { name: "Open in Default Browser" })).toBeVisible();
  await calendar.keyboard.down("Escape");
  await expect.poll(() => calendar.isClosed()).toBe(true);

  const find = () =>
    ggmail.app.windows().find((page) => page.url() === ggmail.gmailStandIn.signInUrl);
  await expect.poll(find).toBeTruthy();
  const mail = find();
  assert(mail);
  const mailbox = "https://mail.google.com/mail/u/0/";
  await mail.route(mailbox + "**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<main role="main"><table><tr class="zA" data-legacy-thread-id="${threadId}"><td class="bog">Review</td></tr></table></main>
     <div role="menu" hidden><button role="menuitem">Reply</button></div>
     <script>document.querySelector("tr").oncontextmenu = e => {e.preventDefault(); document.querySelector('[role=menu]').hidden=false;};</script>`,
    }),
  );
  await mail.goto(mailbox + "#inbox");
  await mail.getByText("Review").click({ button: "right" });
  await expect(mail.getByRole("menuitem", { name: "Reply" })).toBeVisible({ timeout: 5000 });
  await expect(mail.getByRole("menuitem", { name: "Quote to assistant" })).toHaveCount(1, {
    timeout: 5000,
  });
  await expect(mail.getByRole("menuitem", { name: "Add to Calendar…" })).toBeVisible();
  await expect(mail.getByRole("menuitem", { name: "Reply" })).toBeVisible();
});

test("right-clicking an All Mail row quotes that row's subject and snippet", async () => {
  const server = ggmail.gmailStandIn;
  const find = () => ggmail.app.windows().find((page) => page.url() === server.signInUrl);
  await expect.poll(find).toBeTruthy();
  const mail = find();
  assert(mail);
  await mail.route(server.gmailUrl + "**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<main role="main">Inbox</main>' }),
  );
  await mail.goto(server.gmailUrl + "#inbox");
  expect(await ggmail.runMenuCommand("All Mail")).toBe(true);
  await expect(ggmail.renderer.getByRole("heading", { name: "All Mail" })).toBeVisible();
  await ggmail.app.evaluate(
    ({ BrowserWindow }, { id, subject, summary }) => {
      const view = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes("main.html"),
      )?.webContents;
      if (!view) {
        throw new Error("Missing mail window");
      }
      const [account] = JSON.parse(new URL(view.getURL()).searchParams.get("accounts") ?? "[]");
      view.send("gmail.inboxChanged", account.config.id, {
        status: "ready",
        messages: [
          {
            id,
            subject,
            summary,
            author: { name: "Planning", email: "planning@example.test" },
            contributors: [],
            receivedAt: Date.now(),
          },
        ],
      });
    },
    { id: threadId, subject, summary: selection },
  );
  await ggmail.renderer.getByText(subject, { exact: true }).click({ button: "right" });
  const popup = await getPopup();
  await popup.getByRole("menuitem", { name: "Quote to assistant" }).click();
  await expect(ggmail.renderer.getByRole("blockquote")).toHaveText(subject + "\n" + selection);
  await expect(ggmail.renderer.getByText("Planning", { exact: true })).toBeVisible();
});

test("collects, removes, reopens and compares passages from two messages", async () => {
  const fixture = ggmail.gmailStandIn;
  const find = () => ggmail.app.windows().find((page) => page.url() === fixture.signInUrl);
  await expect.poll(find).toBeTruthy();
  const mail = find();
  assert(mail);
  const ids = ["194a92f8c0000031", "194a92f8c0000032"];
  const firstPassage =
    "Version A costs 200. The proposal includes delivery to the site and a review of the revised drawings. Payment is due once the revised drawings have been approved and the delivery time has been confirmed.";
  const messages = [
    { subject: "Draft pricing", sender: "alex@example.test", body: firstPassage },
    { subject: "New pricing", sender: "blair@example.test", body: "Version B costs 180." },
  ];
  await mail.route(fixture.gmailUrl + "**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<main role="main"><h2 class="hP"></h2><section class="adn"><span class="gD"></span><p class="a3s"> </p></section></main>',
    }),
  );
  await mail.goto(fixture.gmailUrl + "#inbox/" + ids[0]);
  await ggmail.app.evaluate(
    ({ ipcMain, webContents }, { url, email }) => {
      const source = webContents.getAllWebContents().find((view) => view.getURL() === url);
      if (!source) {
        throw Error("Missing mail");
      }
      ipcMain.emit("gmail.setUserEmail", { sender: source, senderFrame: source.mainFrame }, email);
      ipcMain.removeHandler("assistant.status");
      ipcMain.handle("assistant.status", () => ({
        provider: "chatgpt",
        status: "connected",
        models: [{ id: "fixture", label: "fixture" }],
      }));
      ipcMain.removeHandler("assistant.send");
      ipcMain.handle("assistant.send", (_event, request: AssistantRequest) => ({
        status: "complete",
        scopeKey: "fixture",
        reply: {
          text: JSON.stringify([
            request.prompt,
            request.quotes?.map(({ text, sender }) => [text, sender]),
          ]),
          citations: [],
        },
      }));
    },
    { url: mail.url(), email: owner },
  );
  async function quote(index: number, passage?: string) {
    assert(mail);
    const message = messages[index];
    const id = ids[index];
    assert(message && id);
    await mail.evaluate(
      ({ id, message }) => {
        location.hash = "#inbox/" + id;
        const heading = document.querySelector("h2"),
          body = document.querySelector(".a3s"),
          sender = document.querySelector(".gD");
        if (!heading || !body || !sender) {
          throw Error("Missing message");
        }
        heading.textContent = message.subject;
        sender.setAttribute("email", message.sender);
        body.textContent = message.body;
        const range = document.createRange();
        range.selectNodeContents(body);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      },
      { id, message: { ...message, body: passage ?? message.body } },
    );
    await mail.locator(".a3s").click({ button: "right", position: { x: 5, y: 5 } });
    await (await getPopup()).getByRole("menuitem", { name: "Quote to assistant" }).click();
  }
  const panel = ggmail.renderer.getByRole("complementary", { name: "Mail assistant" });
  const form = panel.locator("form");
  const writer = form.getByRole("textbox");
  const tray = form.getByRole("button", { name: /Quoted passages/ });
  await quote(0);
  await expect(form.getByRole("blockquote")).toHaveText(firstPassage);
  await expect(writer).toBeFocused();
  await expect(writer).toHaveAttribute("placeholder", "Ask about the quoted text…");
  await writer.fill("Compare these prices.");
  const caret = () =>
    writer.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd]);
  await writer.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(8, 13));
  await tray.click();
  await expect(tray).toHaveAttribute("aria-expanded", "false");
  await expect(form.getByRole("blockquote")).toHaveCount(0);
  await quote(0);
  await expect(tray).toHaveAttribute("aria-expanded", "true");
  await expect(form.getByRole("status")).toHaveText("This passage is already attached.");
  await expect(form.getByRole("blockquote")).toHaveCount(1);
  await quote(1);
  await expect(writer).toBeFocused();
  await expect(writer).toHaveValue("Compare these prices.");
  await expect.poll(caret).toEqual([8, 13]);
  await form.screenshot({ path: test.info().outputPath("quote-insertion.png"), scale: "css" });

  // A selection outside an email body is inserted as plain quoted text.
  await writer.fill("Before\n\nAfter");
  await writer.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(8, 8));
  await mail.evaluate(() => {
    const note = document.createElement("span");
    note.className = "fixture-note";
    note.textContent = "Reference line";
    document.querySelector("main")?.append(note);
    const range = new Range();
    range.selectNodeContents(note);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  await mail.locator(".fixture-note").click({ button: "right" });
  await (await getPopup()).getByRole("menuitem", { name: "Quote to assistant" }).click();
  const inserted = "Before\n\n> Reference line\n\n";
  await expect(writer).toHaveValue(inserted + "After");
  await expect.poll(caret).toEqual([inserted.length, inserted.length]);
  await writer.fill("");

  await setLayout("main", 1050, 590, false);
  const extras = [
    "Delivery is included.",
    "Invoices are due Friday.",
    "The quote is valid for seven days.",
    "Prices include tax.",
    "A deposit is required.",
    "Delivery starts in June.",
  ] as const;
  for (const passage of extras) {
    await quote(1, passage);
  }
  const last = form.getByRole("listitem").last();
  await expect(last).toContainText(extras[5]);
  await expect(last).toBeInViewport({ ratio: 0.95 });
  await tray.click();
  await quote(1, "One more passage.");
  await expect(form.getByRole("status")).toHaveText("Remove a quote to add another.");
  await expect(tray).toHaveAttribute("aria-expanded", "true");
  await expect(form.getByRole("blockquote")).toHaveCount(8);
  await quote(0);
  await expect(form.getByRole("listitem").first()).toBeInViewport({ ratio: 0.95 });
  await expect(form.getByRole("listitem")).toHaveCount(8);
  for (const passage of extras) {
    await form
      .getByRole("listitem")
      .filter({ hasText: passage })
      .getByRole("button", { name: "Remove quote" })
      .click();
  }
  await expect(form.getByRole("blockquote")).toHaveCount(2);
  await form.getByRole("button", { name: "Show more" }).click();
  await expect(form.getByRole("button", { name: "Show less" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await form.getByRole("button", { name: "Show less" }).click();
  await setLayout("main", 1150, 840, false);
  await expect(ggmail.renderer.locator("html")).not.toHaveClass(/dark/);
  await expect(ggmail.renderer.getByText("This passage is already attached.")).toHaveCount(0);
  await form.screenshot({ path: test.info().outputPath("source-quotes.png"), scale: "css" });
  await setLayout("main", 390, 650, true);
  await expect(ggmail.renderer.locator("html")).toHaveClass(/dark/);
  await expect(form.getByRole("button", { name: "Compare quotes" })).toBeInViewport();
  await expect(form.getByRole("textbox")).toBeInViewport();
  await form.screenshot({
    path: test.info().outputPath("source-quotes-compact-dark.png"),
    scale: "css",
  });
  await form.getByRole("button", { name: "Remove quote" }).first().click();
  await expect(form.getByRole("blockquote")).toHaveText("Version B costs 180.");
  await expect(form.getByRole("textbox")).toBeFocused();
  await setLayout("main", 1150, 840, false);
  await quote(0);
  await form.getByRole("link", { name: "Open original" }).first().click();
  await expect.poll(() => new URL(mail.url()).hash).toContain(ids[1]);
  await expect(form.getByRole("blockquote")).toHaveCount(2);
  await form.getByRole("button", { name: "Compare quotes" }).click();
  const log = panel.getByRole("log");
  await expect(log).toContainText(
    JSON.stringify([
      "Compare quotes",
      [
        ["Version B costs 180.", "blair@example.test"],
        [firstPassage, "alex@example.test"],
      ],
    ]),
  );
  await expect(form.getByRole("blockquote")).toHaveCount(0);
});

test("plain quote insertion preserves the surrounding draft at its size limit", async () => {
  const insert = (text: string) =>
    ggmail.app.evaluate(({ BrowserWindow }, passage) => {
      const window = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes("/main.html"),
      );
      if (!window) {
        throw Error("Missing main window");
      }
      window.webContents.send("assistant.quote", passage);
    }, text);
  await insert("Opening paragraph");
  const form = ggmail.renderer
    .getByRole("complementary", { name: "Mail assistant" })
    .locator("form");
  const writer = form.getByRole("textbox");
  await expect(writer).toHaveValue("> Opening paragraph\n\n");
  const draft = "x".repeat(ASSISTANT_PROMPT_LIMIT);
  await writer.fill(draft);
  await insert("Another paragraph");
  await expect(form.getByRole("status")).toHaveText(
    "Your assistant draft is full. Shorten it to add a quote.",
  );
  await expect(writer).toHaveValue(draft);
  const remainder = "y".repeat(ASSISTANT_PROMPT_LIMIT - 14);
  await writer.fill("A" + remainder);
  await writer.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(1, 1));
  await insert("😀".repeat(20));
  await expect(form.getByRole("status")).toHaveText(
    "The quote was shortened to fit your assistant draft.",
  );
  const result = await writer.inputValue();
  expect(result.length).toBeLessThanOrEqual(ASSISTANT_PROMPT_LIMIT);
  expect(result.startsWith("A\n\n> 😀")).toBe(true);
  expect(result.endsWith("…\n\n" + remainder)).toBe(true);
  expect(result).not.toMatch(/[\uD800-\uDFFF]/u);
  await expect(writer).toBeFocused();
});
