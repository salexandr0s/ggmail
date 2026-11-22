import type {
  AssistantConnection,
  AssistantRequest,
  AssistantResult,
} from "@ggmail/shared/assistant";
import { assistantPanelWidth, assistantProviderSchema } from "@ggmail/shared/assistant";
import type {} from "@ggmail/shared/electron-api";
import { expect, test } from "@playwright/test";
import type { BaseWindow, MessageBoxOptions } from "electron";
import type { Route } from "playwright";
import { useApp } from "./lib/app";

const ggmail = useApp(
  { "window.restrictMinimumSize": false },
  { args: process.platform === "darwin" ? ["--use-mock-keychain"] : [] },
);

for (const starter of [false, true]) {
  test(`stop and retry preserve a ${starter ? "starter" : "written"} prompt and the next message`, async () => {
    // Only the provider-facing operations are fixtures. The panel reads the
    // real account context, handles streamed IPC and uses its normal form.
    await ggmail.app.evaluate(({ ipcMain }, starter) => {
      const status: AssistantConnection = {
        provider: "chatgpt",
        status: "connected",
        models: [{ id: "fixture", label: "Fixture model" }],
      };
      ipcMain.removeHandler("assistant.status");
      ipcMain.handle("assistant.status", () => status);
      ipcMain.removeHandler("assistant.send");
      let attempts = 0;
      ipcMain.handle(
        "assistant.send",
        async (event, request: AssistantRequest): Promise<AssistantResult> => {
          attempts++;
          if (attempts === 1) {
            event.sender.send("assistant.progress", request.id, "Partial response");
            event.sender.send(
              "assistant.progress",
              request.id,
              "",
              starter
                ? { kind: "reading", subject: "Planning review" }
                : { kind: "searching", account: "Studio", page: 2 },
            );
            return new Promise((resolve) => {
              ipcMain.once("assistant.stop", (_stopEvent, id) => {
                resolve(
                  id === request.id
                    ? { status: "stopped" }
                    : { status: "error", message: "Unexpected request ID" },
                );
              });
            });
          }
          return {
            status: "complete",
            scopeKey: request.scopeKey ?? "fixture",
            reply: { text: request.prompt + " answered", citations: [] },
          };
        },
      );
    }, starter);

    const page = ggmail.renderer;
    const toggle = page.getByRole("button", { name: "Mail assistant", exact: true });
    await toggle.click();
    const panel = page.getByRole("complementary", { name: "Mail assistant" });
    const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
    const first = starter
      ? "Help me draft an email. Ask me for the details you need."
      : "First question";
    if (starter) {
      await panel.getByRole("button", { name: "Draft an email", exact: true }).click();
    } else {
      await composer.fill(first);
      await composer.press("Enter");
    }
    const bubble = panel.getByText(first, { exact: true });
    await expect(panel.getByRole("status")).toHaveText(
      starter ? "Reading “Planning review”" : "Searching Studio · page 2",
    );
    await expect(panel.getByText("Partial response")).toBeVisible();
    await expect(bubble).toHaveCount(starter ? 0 : 1);
    await composer.fill("Follow-up in progress");
    await panel.getByRole("button", { name: "Stop reply" }).click();
    await expect(panel.getByText("Reply stopped")).toBeVisible();
    await expect(panel.getByText("Partial response")).toBeVisible();
    await expect(composer).toHaveValue("Follow-up in progress");
    await panel.getByRole("button", { name: "Try again" }).click();
    await expect(panel.getByText(first + " answered")).toBeVisible();
    await expect(bubble).toHaveCount(starter ? 0 : 1);
    await expect(composer).toHaveValue("Follow-up in progress");
    await composer.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });
}

const threadId = "194a92f8c0000001";
const senderPhoto = "https://lh3.googleusercontent.com/a/ggmail-sender";
const senderIcon = "https://www.google.com/s2/favicons?domain=studio.example&sz=32";

function serveAvatar(route: Route) {
  return route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#efc5a6"/><circle cx="16" cy="12" r="6" fill="#513a40"/><path d="M3 32a13 13 0 0 1 26 0" fill="#496d70"/></svg>',
  });
}

for (const provider of assistantProviderSchema.options) {
  test(
    provider +
      " loads images automatically and renders links and source ranges in a compact answer",
    async () => {
      const imageUrl = "https://media.example.test/layout.png";
      const detailUrl = "https://media.example.test/detail.png";
      const briefUrl = "https://studio.example/brief";
      const code = "design-token-".repeat(24);
      const markdown = [
        "## Friday review",
        "Read the [brief](" + briefUrl + ") before **Friday**. [1–2]",
        "[![Layout proof](" + imageUrl + ")](" + briefUrl + ")",
        "![Layout detail](" + detailUrl + ")",
        "![Local preview](file:///unavailable.png)",
        "```text\n" + code + "\n```",
      ].join("\n\n");
      const linkPrompts = await ggmail.app.evaluateHandle(
        ({ ipcMain, BrowserWindow, dialog, shell }, { provider, markdown }) => {
          const destinations: string[] = [];
          dialog.showMessageBox = async (
            ...args: [MessageBoxOptions] | [BaseWindow, MessageBoxOptions]
          ) => {
            const options = args.length === 2 ? args[1] : args[0];
            if (options.detail) {
              destinations.push(options.detail);
            }
            return { response: 2, checkboxChecked: false };
          };
          shell.openExternal = async () => {
            destinations.push("unexpected open");
          };
          ipcMain.removeHandler("assistant.status");
          ipcMain.handle("assistant.status", () => ({
            status: "connected",
            provider,
            models: [{ id: "fixture", label: provider }],
          }));
          ipcMain.removeHandler("assistant.send");
          ipcMain.handle("assistant.send", (_event, request: AssistantRequest): AssistantResult => {
            if (request.provider !== provider) {
              throw new Error("Unexpected provider");
            }
            return {
              status: "complete",
              scopeKey: request.scopeKey ?? "fixture",
              reply: {
                text: markdown,
                citations: ["Brief", "Agenda"].map((subject, index) => ({
                  id: crypto.randomUUID(),
                  number: index + 1,
                  subject,
                  senders: [{ name: "Studio" }],
                })),
                draft: { subject: "Review", body: "Hi Sam,\n\nFriday works." },
              },
            };
          });
          BrowserWindow.getAllWindows()
            .find((win) => win.webContents.getURL().includes("main.html"))
            ?.setContentSize(380, 760);
          return destinations;
        },
        { provider, markdown },
      );
      const page = ggmail.renderer;
      await page.route(imageUrl, serveAvatar);
      let detailRequests = 0;
      await page.route(detailUrl, (route) =>
        ++detailRequests === 1 ? route.abort() : serveAvatar(route),
      );
      await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
      const panel = page.getByRole("complementary", { name: "Mail assistant" });
      const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
      await composer.fill("Show me the brief");
      await composer.press("Enter");
      const answer = panel.locator(".assistant-answer");
      const image = answer.getByRole("img", { name: "Layout proof" });
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      await expect(answer.getByRole("heading", { name: "Friday review" })).toBeVisible();
      const brief = answer.getByRole("link", { name: "brief", exact: true });
      await expect(brief).toHaveAttribute("href", briefUrl);
      await brief.click();
      await expect.poll(() => linkPrompts.jsonValue()).toEqual([briefUrl]);
      await linkPrompts.dispose();
      await expect(answer.getByRole("button", { name: "2. Agenda" })).toBeVisible();
      await expect(answer.locator("pre code")).toHaveText(code);
      await expect(answer.getByText("Local preview", { exact: true })).toBeVisible();
      await expect(panel.getByText("Friday works.", { exact: false })).toBeVisible();
      const retry = answer.getByRole("button", { name: /Retry.*Layout detail/ });
      await expect(retry).toBeVisible();
      await retry.press("Enter");
      const detail = answer.getByRole("img", { name: "Layout detail" });
      await expect
        .poll(() => detail.evaluate((img) => (img as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      expect(detailRequests).toBe(2);
      expect(await answer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    },
  );
}

const answer = [
  "Please confirm **one detail** before Friday.",
  "",
  "| Type | Action | Owner | Due date |",
  "| --- | --- | --- | --- |",
  "| Requested | Confirm the **review time** [1] | You | Friday |",
  "| Optional | Share the agenda | Sam | Thursday |",
].join("\n");

// Use a synthetic provider session in this test's temporary profile. Exercise
// the real assistant.send, tool call, conversation guard and reply IPC.
async function useDraftProvider(body: string | null, text = answer) {
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await writeFile(join(ggmail.userDataDir, "assistant-credentials"), "fixture");
  await ggmail.app.evaluate(
    ({ safeStorage }, { draft, answer, senderPhoto }) => {
      safeStorage.isEncryptionAvailable = () => true;
      safeStorage.getSelectedStorageBackend = () => "gnome_libsecret";
      safeStorage.decryptString = () =>
        JSON.stringify({
          hostId: "urn:uuid:" + crypto.randomUUID(),
          registration: { clientId: "fixture", identity: { sub: "fixture" } },
          credentials: {
            accessToken: "fixture",
            refreshToken: "fixture",
            idToken: "fixture",
            scopes: ["resource.invoke", "chatgpt.tokens.use.direct"],
            expiresAt: Date.now() + 3600000,
            refreshAt: Date.now() + 3000000,
          },
        });
      let calls = 0;
      const fetch = globalThis.fetch;
      globalThis.fetch = (async (url, options) => {
        if (String(url) === "https://api.openai.com/v1/models") {
          return Response.json({
            models: [{ slug: "fixture", display_name: "Fixture model", visibility: "list" }],
          });
        }
        if (String(url) === "https://api.openai.com/v1/responses") {
          if (
            String(options?.body).includes(senderPhoto) ||
            String(options?.body).includes("photoUrl")
          ) {
            throw new Error("Sender photos must stay in the app");
          }
          const item =
            draft && calls++ % 2 === 0
              ? {
                  type: "function_call",
                  name: "prepare_draft",
                  call_id: String(calls),
                  namespace: "ggmail",
                  arguments: JSON.stringify(draft),
                }
              : {
                  type: "message",
                  role: "assistant",
                  content: [{ type: "output_text", text: answer }],
                };
          return new Response(
            "data: " +
              JSON.stringify({
                type: "response.completed",
                response: { status: "completed", output: [item] },
              }) +
              "\n\n",
          );
        }
        return fetch(url, options);
      }) as typeof globalThis.fetch;
    },
    {
      draft: body === null ? null : { subject: "Planning review", body },
      answer: text,
      senderPhoto,
    },
  );
}

async function openMailFixture(hash: string, html: string) {
  const { signInUrl, gmailUrl } = ggmail.gmailStandIn;
  const findAccount = () => ggmail.app.windows().find((page) => page.url() === signInUrl);
  await expect.poll(findAccount).toBeDefined();
  const mail = findAccount();
  if (!mail) {
    throw new Error("The Gmail view is gone");
  }
  await mail.route(senderPhoto, serveAvatar);
  await mail.route(gmailUrl + "**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await mail.goto(gmailUrl + hash);
  return mail;
}

async function openThread() {
  return openMailFixture(
    "#inbox/" + threadId,
    `
    <main role="main"><div class="nH id">
      <h2 class="hP" data-legacy-thread-id="${threadId}">Planning review</h2>
      <div class="adn"><div class="aju"><img class="ajn" src="${senderPhoto}"></div>
        <div class="gE"><span class="gD" email="sam@studio.example" name="Sam Rivera">Sam</span></div>
        <div class="a3s">Can you confirm the time?</div></div>
      <div class="amn"><span class="ams bkH" role="link" tabindex="0">Reply</span></div>
      <div class="ip" hidden><span class="recipient">Sam</span><div class="AD"><div class="Ap"><div id="reply" contenteditable="true" role="textbox" g_editable="true"><br></div></div></div></div>
      <div role="dialog"><div class="ip"><div contenteditable="true" role="textbox" g_editable="true">Separate draft</div></div></div>
      <button id="send">Send</button>
    </div></main>
    <script>
      document.querySelector(".bkH").onclick = () => {
        document.querySelector(".amn").hidden = true;
        setTimeout(() => document.querySelector(".ip").hidden = false, 150);
      };
      document.querySelector("#reply").oninput = () => document.body.dataset.saved = document.querySelector("#reply").innerText;
      document.querySelector("#send").onclick = () => document.body.dataset.sent = "yes";
    </script>`,
  );
}

// Hold the first provider response so the test can navigate mid-reply.
function holdProvider() {
  return ggmail.app.evaluateHandle(() => {
    const gate = Promise.withResolvers<void>();
    const inputs: Array<Array<{ role: string; content: string }>> = [];
    const fetch = globalThis.fetch;
    globalThis.fetch = (async (url, options) => {
      if (String(url) === "https://api.openai.com/v1/responses") {
        inputs.push(JSON.parse(String(options?.body)).input);
        await gate.promise;
      }
      return fetch(url, options);
    }) as typeof globalThis.fetch;
    return { inputs, finish: gate.resolve };
  });
}

test("closing the assistant keeps its conversation, pending reply and unsent follow-up", async () => {
  const mail = await openThread();
  const first = "When is the review?";
  const answer = "Friday at ten.";
  const followUp = "Who will attend?";
  await useDraftProvider(null, answer);
  const provider = await holdProvider();

  const page = ggmail.renderer;
  const toggle = page.getByRole("button", { name: "Mail assistant", exact: true });
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await toggle.click();
  await composer.fill(first);
  await composer.press("Enter");
  await expect.poll(() => provider.evaluate(({ inputs }) => inputs.length)).toBe(1);
  await composer.fill(followUp);
  await panel.getByRole("button", { name: "Close mail assistant" }).click();
  await expect(page.locator(".assistant-drawer")).toHaveCSS("width", "0px");
  await expect(panel).toHaveCount(0);
  await mail.evaluate(() => {
    location.hash = "#inbox";
  });
  await provider.evaluate(({ finish }) => finish());
  await toggle.click();
  await expect(panel.getByText(first, { exact: true })).toBeVisible();
  await expect(panel.getByText(answer, { exact: true })).toBeVisible();
  await expect(composer).toHaveValue(followUp);
  await composer.press("Enter");
  await expect(panel.locator(".assistant-answer")).toHaveCount(2);
  expect(await provider.evaluate(({ inputs }) => inputs[1]?.slice(0, -1))).toEqual([
    { role: "user", content: first },
    { role: "assistant", content: expect.stringContaining(answer) },
  ]);

  // Open the email with the assistant visible, as when following a result.
  await mail.evaluate((id) => {
    location.hash = "#inbox/" + id;
  }, threadId);
  await expect(panel.getByText("Open email", { exact: true })).toBeVisible();
  await expect(panel.locator(".assistant-answer")).toHaveCount(2);
  await composer.fill("Unsent note");
  await composer.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(page.locator(".assistant-drawer")).toHaveCSS("width", "0px");
  await toggle.click();
  await expect(composer).toHaveValue("Unsent note");
  await panel.getByRole("button", { name: "New chat" }).click();
  await expect(composer).toHaveValue("");
  await expect(panel.locator(".assistant-answer")).toHaveCount(0);
  await expect(panel.getByText(first, { exact: true })).toHaveCount(0);
  await composer.fill("New topic");
  await composer.press("Enter");
  await expect(panel.getByText(answer, { exact: true })).toBeVisible();
  expect(await provider.evaluate(({ inputs }) => inputs[2]?.slice(0, -1))).toEqual([]);

  await composer.fill("Note for this thread");
  await toggle.click();
  await expect(page.locator(".assistant-drawer")).toHaveCSS("width", "0px");
  await mail.evaluate(() => {
    location.hash = "#inbox";
  });
  await toggle.click();
  await expect(panel.getByText("Current mail view", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("Note for this thread");
  await expect(panel.getByText("New topic", { exact: true })).toBeVisible();
  await expect(panel.locator(".assistant-answer")).toHaveCount(1);
  await provider.dispose();
});

test("relaunch restores the conversation and unsent message until New chat clears both", async () => {
  await openThread();
  await useDraftProvider(null, "The review starts on Friday.");
  async function openPanel() {
    const page = ggmail.renderer;
    await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
    return page.getByRole("complementary", { name: "Mail assistant" });
  }
  let panel = await openPanel();
  let composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await composer.fill("When is the review?");
  await composer.press("Enter");
  await expect(panel.getByText("The review starts on Friday.", { exact: true })).toBeVisible();
  await composer.fill("Which Friday?");
  await ggmail.relaunch();
  await useDraftProvider(null, "This Friday.");
  const provider = await holdProvider();
  await provider.evaluate(({ finish }) => finish());
  panel = await openPanel();
  composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await expect(panel.getByText("When is the review?", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("Which Friday?");
  await composer.press("Enter");
  await expect(panel.getByText("This Friday.", { exact: true })).toBeVisible();
  expect(await provider.evaluate(({ inputs }) => inputs[0]?.[1]?.content)).toContain(
    "The review starts on Friday.",
  );
  await provider.dispose();
  await composer.fill("Another follow-up");
  await panel.getByRole("button", { name: "New chat" }).click();
  await expect(composer).toHaveValue("");
  await ggmail.relaunch();
  await useDraftProvider(null);
  panel = await openPanel();
  await expect(panel.getByRole("textbox")).toHaveValue("");
  await expect(panel.getByRole("log")).toHaveCount(0);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`the assistant drawer tracks the Gmail view with ${reducedMotion} motion`, async () => {
    const mail = await openThread();
    const page = ggmail.renderer;
    await page.emulateMedia({ reducedMotion });
    // The test window stays behind other apps. Slow its CSS timeline so even an
    // occluded renderer paints intermediate frames under load.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.2 });
    const native = await ggmail.app.evaluateHandle(({ BrowserWindow, WebContentsView }, url) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("main.html"),
      );
      const view = win?.contentView.children.find(
        (child) => child instanceof WebContentsView && child.webContents.getURL() === url,
      );
      if (!win || !view) {
        throw new Error("Missing native Gmail view");
      }
      const rightGap = () => {
        const { x, width } = view.getBounds();
        return win.getContentBounds().width - x - width;
      };
      const baseline = rightGap();
      const inset = () => rightGap() - baseline;
      const samples: number[] = [];
      const record = () => samples.push(inset());
      view.on("bounds-changed", record);
      return {
        inset,
        samples,
        resize: (width: number) => win.setContentSize(width, 720),
        stop: () => view.off("bounds-changed", record),
      };
    }, mail.url());
    const width = await page.evaluate(() => innerWidth);
    const full = assistantPanelWidth(width);
    // Sample in the renderer on paint and in Electron on bounds changes. Playwright
    // polling alone can skip a full transition between two observations.
    async function move(action: "open" | "close" | "reverse") {
      await native.evaluate((tracker) => {
        tracker.samples.length = 0;
      });
      const samples = await page.evaluate(
        async ({ action, full }) => {
          const toggle = document.querySelector<HTMLButtonElement>("#mail-assistant-toggle");
          const drawer = document.querySelector<HTMLElement>(".assistant-drawer");
          if (!toggle || !drawer) {
            throw new Error("Missing assistant drawer or toggle");
          }
          const insets: number[] = [];
          const widths = new Set<number>();
          let reversed = false;
          toggle.click();
          const start = performance.now();
          while (performance.now() - start < 5000) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const panel = document.querySelector("#mail-assistant");
            const bounds = panel?.getBoundingClientRect();
            const inset = bounds ? Math.max(0, Math.round(innerWidth - bounds.left)) : 0;
            insets.push(inset);
            if (bounds) {
              widths.add(Math.round(bounds.width));
            }
            if (action === "reverse" && !reversed && inset > full / 4 && inset < full - 1) {
              toggle.click();
              reversed = true;
            }
            const closed = drawer.inert && drawer.getBoundingClientRect().width === 0;
            if (action === "open" ? inset === full : closed && (reversed || action === "close")) {
              return { insets, widths: [...widths] };
            }
          }
          throw new Error(`Drawer did not finish ${action}; observed insets ${insets.join(",")}`);
        },
        { action, full },
      );
      await expect
        .poll(() => native.evaluate((tracker) => tracker.inset()))
        .toBe(action === "open" ? full : 0);
      expect(samples.widths.every((width) => width === full)).toBe(true);
      const nativeInsets = await native.evaluate((tracker) => tracker.samples);
      for (const [source, values] of Object.entries({
        renderer: samples.insets,
        native: nativeInsets,
      })) {
        expect(
          values.some((inset) => inset > 1 && inset < full - 1),
          `${source} ${action} insets: ${values.join(", ")}`,
        ).toBe(reducedMotion === "no-preference");
        if (action === "reverse") {
          expect(Math.max(...values)).toBeLessThan(full);
        }
      }
    }
    try {
      await move("open");
      await move("close");
      if (reducedMotion === "no-preference") {
        await move("reverse");
      }
      await move("open");
      const resized = width > 1050 ? 960 : 1200;
      await native.evaluate((tracker, width) => tracker.resize(width), resized);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(resized);
      await expect
        .poll(() => native.evaluate((tracker) => tracker.inset()))
        .toBe(assistantPanelWidth(resized));
      await expect
        .poll(() =>
          page
            .locator("#mail-assistant")
            .evaluate((el) => Math.round(el.getBoundingClientRect().width)),
        )
        .toBe(assistantPanelWidth(resized));
    } finally {
      await native.evaluate((tracker) => {
        tracker.stop();
      });
      await native.dispose();
      await cdp.detach();
    }
  });
}

test("the assistant drawer stays uncovered when switching between mail accounts", async () => {
  const page = ggmail.renderer;
  const first = await openMailFixture("#inbox", '<main role="main">First mailbox</main>');
  const firstContext = await page.evaluate(() =>
    window.electron.ipcRenderer.invoke("assistant.context"),
  );
  await page.evaluate(() => {
    window.electron.ipcRenderer.send("accounts.addAccount", {
      label: "Second mailbox",
      color: null,
      notifications: false,
      gmail: { unreadBadge: true, unifiedInbox: true },
    });
  });
  const second = await openMailFixture("#sent", '<main role="main">Second mailbox</main>');
  const firstUrl = first.url();
  const secondUrl = second.url();
  const accounts = page.locator("button[data-account-id]");
  await expect(accounts).toHaveCount(2);
  const toggle = page.getByRole("button", { name: "Mail assistant", exact: true });
  const drawer = page.locator(".assistant-drawer");
  const width = await page.evaluate(() => innerWidth);
  const full = assistantPanelWidth(width);

  // Gmail is hosted in native child views above the renderer. A DOM visibility
  // assertion passes even when another account paints over the entire drawer.
  const nativeLayout = () =>
    ggmail.app.evaluate(
      ({ BrowserWindow, WebContentsView }, urls) => {
        const win = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes("main.html"),
        );
        if (!win) {
          throw new Error("Missing main window");
        }
        const views = win.contentView.children
          .filter((child) => child instanceof WebContentsView)
          .filter((view) => view.getVisible() && urls.includes(view.webContents.getURL()));
        const edges = views.map((view) => {
          const { x, width } = view.getBounds();
          return x + width;
        });
        return {
          front: views.at(-1)?.webContents.getURL(),
          frontEdge: edges.at(-1),
          furthestEdge: Math.max(...edges),
        };
      },
      [firstUrl, secondUrl],
    );

  await expect.poll(async () => (await nativeLayout()).front).toBe(secondUrl);
  const baseline = (await nativeLayout()).furthestEdge;
  async function expectLayout(front: string, inset: number) {
    await expect
      .poll(() => drawer.evaluate((el) => Math.round(el.getBoundingClientRect().width)))
      .toBe(inset);
    await expect.poll(nativeLayout).toEqual({
      front,
      frontEdge: baseline - inset,
      furthestEdge: baseline - inset,
    });
  }

  await useDraftProvider(null);
  const provider = await holdProvider();
  await expectLayout(secondUrl, 0);
  await toggle.click();
  await expectLayout(secondUrl, full);
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  const scopeAvatar = panel.locator('header [data-slot="account-avatar"]');
  await expect(scopeAvatar).toHaveText("S");
  const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await composer.fill("What needs my attention?");
  await composer.press("Enter");
  await expect.poll(() => provider.evaluate(({ inputs }) => inputs.length)).toBe(1);
  await composer.fill("Follow-up across mailboxes");

  // The transcript and unsent text stay visible while the next mailbox loads.
  const gate = await ggmail.app.evaluateHandle(({ BrowserWindow }, context) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("main.html"),
    );
    if (!win) {
      throw new Error("Missing main window");
    }
    const ipc = win.webContents.mainFrame.ipc;
    const gate = Promise.withResolvers<void>();
    ipc.handle("assistant.context", async () => {
      await gate.promise;
      return context;
    });
    return () => {
      ipc.removeHandler("assistant.context");
      gate.resolve();
    };
  }, firstContext);
  try {
    await accounts.first().click();
    await expectLayout(firstUrl, full);
    await expect(panel.getByText("Waiting for the mail view…", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("Follow-up across mailboxes");
    await expect(panel.getByRole("button", { name: "Stop reply" })).toBeVisible();
    await expect(panel.getByText("What needs my attention?", { exact: true })).toBeVisible();
    await expect(scopeAvatar).toHaveCount(0);
  } finally {
    await provider.evaluate(({ finish }) => finish());
    await gate.evaluate((release) => release());
    await gate.dispose();
  }
  await expect(composer).toHaveValue("Follow-up across mailboxes");
  await expect(panel.getByRole("button", { name: "Send chat message" })).toBeEnabled();
  await expect(scopeAvatar).toHaveText(
    await accounts.first().locator('[data-slot="account-avatar"]').innerText(),
  );
  await composer.press("Enter");
  await expect(panel.locator(".assistant-answer")).toHaveCount(2);
  const sent = await provider.evaluate(({ inputs }) => inputs[1]);
  expect(sent?.[0]?.content).toBe("What needs my attention?");
  expect(JSON.parse(sent?.at(-1)?.content ?? "{}").mail.selectedAccountId).toBe(
    await accounts.first().getAttribute("data-account-id"),
  );
  await provider.dispose();
  await toggle.click();
  await expectLayout(firstUrl, 0);
  // Switch again before the opening animation has settled.
  await toggle.click();
  await accounts.evaluateAll((buttons) => {
    for (const index of [1, 0, 1]) {
      (buttons[index] as HTMLButtonElement).click();
    }
  });
  await expectLayout(secondUrl, full);

  // Exercise Gmail's native fullscreen listeners without moving the test
  // window into a separate macOS Space.
  const fullscreen = (enter: boolean) =>
    ggmail.app.evaluate(
      ({ webContents }, { url, enter }) => {
        const mail = webContents.getAllWebContents().find((w) => w.getURL() === url);
        if (!mail) {
          throw new Error("Missing fullscreen mailbox");
        }
        mail.emit(enter ? "enter-html-full-screen" : "leave-html-full-screen");
      },
      { url: secondUrl, enter },
    );
  await fullscreen(true);
  try {
    for (const inset of [0, full]) {
      await page.evaluate(async (inset) => {
        window.electron.ipcRenderer.send("assistant.setInset", inset);
        await window.electron.ipcRenderer.invoke("assistant.context");
      }, inset);
      expect((await nativeLayout()).frontEdge).toBe(baseline);
    }
  } finally {
    await fullscreen(false);
  }
  await expectLayout(secondUrl, full);
});

test("streams answer text and shows a validated draft before the provider finishes", async () => {
  await openThread();
  await useDraftProvider(null);
  // Release individual SSE frames after inspecting the UI. Keep the actual
  // response parser, tool loop, draft validation and renderer IPC in the path.
  const transport = await ggmail.app.evaluateHandle(() => {
    let ready = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const fetch = globalThis.fetch;
    globalThis.fetch = (async (url, options) => {
      if (String(url) !== "https://api.openai.com/v1/responses") {
        return fetch(url, options);
      }
      const stream = new ReadableStream<Uint8Array>({ start: ready.resolve });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    }) as typeof globalThis.fetch;
    return async ({ frame, complete }: { frame: unknown; complete: boolean }) => {
      const stream = await ready.promise;
      stream.enqueue(new TextEncoder().encode("data: " + JSON.stringify(frame) + "\n\n"));
      if (complete) {
        ready = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
        stream.close();
      }
    };
  });
  const send = (frame: unknown, complete = false) =>
    transport.evaluate((release, data) => release(data), { frame, complete });

  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  await panel.getByRole("button", { name: "Draft a reply", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Waiting for Fixture model");
  await send({ type: "response.output_text.delta", delta: "Friday" });
  const partial = panel.locator(".assistant-answer");
  await expect(partial).toHaveText("Friday");
  await send({ type: "response.output_text.delta", delta: " works." });
  await expect(partial).toHaveText("Friday works.");

  const draft = { subject: "Friday plans", body: "Hi Sam, Friday works for me." };
  await send(
    {
      type: "response.completed",
      response: {
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "prepare_draft",
            call_id: "draft",
            namespace: "ggmail",
            arguments: JSON.stringify(draft),
          },
        ],
      },
    },
    true,
  );
  await expect(panel.getByText(draft.body, { exact: true })).toBeVisible();
  await expect(panel.getByRole("status")).toHaveText("Finishing your reply");
  await expect(partial).toHaveText("Friday works.");
  const insert = panel.getByRole("button", { name: "Insert into reply", exact: true });
  const open = panel.getByRole("button", { name: "Open in Gmail", exact: true });
  await expect(insert).toHaveCount(0);
  await expect(open).toHaveCount(0);

  const final = "Please review the draft.";
  await send({ type: "response.output_text.delta", delta: final });
  await expect(partial).toHaveText(final);
  await expect(panel.getByText(draft.body, { exact: true })).toBeVisible();
  await expect(insert).toHaveCount(0);
  await send(
    {
      type: "response.completed",
      response: {
        status: "completed",
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: final }] },
        ],
      },
    },
    true,
  );
  await expect(insert).toBeEnabled();
  await expect(open).toBeEnabled();
  await expect(panel.getByText(draft.body, { exact: true })).toHaveCount(1);
  await expect(panel.getByRole("status")).toHaveCount(0);
  await transport.dispose();
});

for (const existing of [false, true]) {
  test(`a starter inserts a draft into ${existing ? "an existing" : "a closed"} Gmail reply`, async () => {
    const mail = await openThread();
    await ggmail.renderer.route(senderPhoto, existing ? (route) => route.abort() : serveAvatar);
    await ggmail.renderer.route(senderIcon, serveAvatar);
    const editor = mail.locator("#reply");
    if (existing) {
      await mail.locator(".bkH").click();
      await editor.fill("My existing text");
      await editor.evaluate((el) =>
        el.insertAdjacentHTML("beforeend", '<div class="gmail_signature">Signature</div>'),
      );
    }
    const body = existing
      ? "Hi Sam,\n\nFriday works for me. <Thanks> & see you then."
      : "Hi Sam,\n\nFriday at 10 works for me. Thanks for sending the agenda.";
    await useDraftProvider(body);
    const page = ggmail.renderer;
    await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Mail assistant" });
    await panel.getByRole("button", { name: "Draft a reply", exact: true }).click();
    const insert = panel.getByRole("button", { name: "Insert into reply", exact: true });
    await expect(insert).toBeVisible();
    const prompt = "Draft a reply to the open email.";
    await expect(panel.getByText(prompt, { exact: true })).toHaveCount(0);
    await expect(panel.locator("dl")).toHaveCount(2);
    await expect(panel.locator("dt").first()).toHaveText("Action");
    await expect(panel.locator("dd strong")).toHaveText("review time");
    await expect(panel.getByRole("button", { name: "1. Planning review" })).toBeVisible();
    await expect(panel.locator("details")).not.toHaveAttribute("open", "");
    await panel.locator("summary").click();
    const source = panel
      .locator("details")
      .getByRole("button", { name: "1. Planning review · Sam Rivera" });
    await expect(source).toBeVisible();
    await expect(source.getByText("Sam Rivera")).toBeVisible();
    await expect(panel.locator("sup img")).toHaveAttribute(
      "src",
      existing ? senderIcon : senderPhoto,
    );
    await expect(source.locator("img")).toHaveAttribute("src", existing ? senderIcon : senderPhoto);
    await panel.locator("summary").click();
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (existing) {
      const reply = mail.locator(".ip").first();
      await reply.evaluate((el) =>
        el.insertAdjacentHTML("afterbegin", '<div class="Un J-JN-M-I"><i class="mI"></i></div>'),
      );
      await insert.click();
      await expect(panel.getByRole("alert")).toHaveText(
        "Open a reply in this thread and try again.",
      );
      await expect(editor).not.toContainText("Friday");
      await reply.locator(".Un").evaluate((el) => el.remove());
      await ggmail.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes("main.html"))
          ?.setSize(520, 750),
      );
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(640);
    } else {
      await ggmail.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes("main.html"))
          ?.setContentSize(1200, 960),
      );
      await panel.getByText("Please confirm", { exact: false }).scrollIntoViewIfNeeded();
      await panel.locator("summary").click();
      await panel.screenshot({ path: test.info().outputPath("assistant-answer.png") });
      await panel.locator("summary").click();
    }
    const windows = ggmail.app.windows().length;
    await insert.click();
    if (existing) {
      await expect(panel).toHaveCount(0);
    } else {
      await expect(panel.getByRole("button", { name: "Inserted into reply" })).toBeDisabled();
    }
    await expect(editor).toBeFocused();
    const saved = await mail.locator("body").getAttribute("data-saved");
    expect(saved).toBe(existing ? body + "\n\nMy existing text\nSignature" : body);
    await expect(editor.locator("thanks")).toHaveCount(0);
    await expect(mail.locator(".recipient")).toHaveText("Sam");
    await expect(mail.getByRole("dialog")).toHaveText("Separate draft");
    await expect(mail.locator("body")).not.toHaveAttribute("data-sent");
    expect(ggmail.app.windows()).toHaveLength(windows);
    if (existing) {
      expect(saved).toContain("My existing text");
      await expect(editor.locator(".gmail_signature")).toHaveText("Signature");
      await editor.press("ControlOrMeta+z");
      await expect(editor).not.toContainText("Friday");
      await expect(editor).toContainText("My existing text");
    } else {
      // The exact same words submitted from the composer are user-authored.
      const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
      await composer.fill(prompt);
      await composer.press("Enter");
      await expect(panel.getByText(prompt, { exact: true })).toBeVisible();
      // A switch while Gmail is opening Reply must cancel the pending edit.
      await expect(insert).toBeVisible();
      const original = await editor.innerHTML();
      await mail.evaluate(() => {
        const reply = document.querySelector<HTMLElement>(".ip");
        const toolbar = document.querySelector<HTMLElement>(".amn");
        if (!reply || !toolbar) {
          throw new Error("Missing reply controls");
        }
        reply.hidden = true;
        toolbar.hidden = false;
        toolbar.onclick = () => {
          location.hash = "#inbox/194a92f8c0000002";
        };
      });
      await insert.click();
      await expect(insert).toHaveCount(0);
      await expect(panel.getByText(prompt, { exact: true })).toBeVisible();
      await expect(editor).toBeVisible();
      expect(await editor.innerHTML()).toBe(original);
    }
  });
}

for (const mode of ["rich text", "plaintext-only"]) {
  test(`inserts into an open inline reply beside the Gmail thread heading (${mode})`, async () => {
    const mail = await openMailFixture(
      "#inbox/" + threadId,
      `<main role="main"><table><tr><td>Inbox</td></tr></table></main>
      <main role="main"><div class="nH id">
        <h2 class="hP" data-legacy-thread-id="${threadId}">Planning review</h2>
        <div class="adn"><div class="gE"><span class="gD" email="sam@studio.example">Sam</span></div>
          <div class="a3s">Please check the proof.
            <div role="main"><h2 class="hP">Message content</h2>
              <div class="ip"><div id="mail-content" contenteditable role="textbox">Original</div></div>
            </div></div></div></div>
        <div class="HM"><div class="I5"><div class="M9">
          <div class="HQ"><div class="Un J-JN-M-I">Reply
            <div role="menu" hidden><i class="mI"></i></div></div><span id="recipient">Sam</span></div>
          <div class="Ap"><div id="reply" contenteditable="${mode === "rich text" ? "" : "plaintext-only"}" role="textbox" aria-multiline="true"><br><div class="gmail_signature" data-smartmail="gmail_signature"><b>Studio Team</b><br>Studio phone</div></div></div>
        </div></div></div>
        <div role="dialog"><div class="ip"><div contenteditable role="textbox">Separate draft</div></div></div>
      </main>
      <script>document.querySelector("#reply").oninput = () => document.body.dataset.saved = "yes";</script>`,
    );
    await useDraftProvider("Hi Sam,\n\nThe proof looks good.\n\nStudio Team\nStudio phone");
    const page = ggmail.renderer;
    await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Mail assistant" });
    await panel.getByRole("button", { name: "Draft a reply", exact: true }).click();
    await panel.getByRole("button", { name: "Insert into reply", exact: true }).click();
    const editor = mail.locator("#reply");
    await expect(editor).toContainText("The proof looks good.");
    expect(await editor.innerText()).toMatch(
      /^Hi Sam,\n\nThe proof looks good\.\n+Studio Team\nStudio phone$/,
    );
    await expect(editor.locator(".gmail_signature b")).toHaveText("Studio Team");
    await expect(mail.locator("body")).toHaveAttribute("data-saved", "yes");
    await expect(mail.locator("#recipient")).toHaveText("Sam");
    await expect(mail.getByRole("dialog")).toHaveText("Separate draft");
    await expect(mail.locator("#mail-content")).toHaveText("Original");
  });
}

test("a draft outside a thread opens in its own composer", async () => {
  await useDraftProvider("See you on Friday.");
  const panel = ggmail.renderer.getByRole("complementary", { name: "Mail assistant" });
  await ggmail.renderer.getByRole("button", { name: "Mail assistant", exact: true }).click();
  await panel.getByRole("button", { name: "Draft an email", exact: true }).click();
  const open = panel.getByRole("button", { name: "Open in Gmail" });
  await expect(open).toBeVisible();
  await expect(panel.getByRole("button", { name: "Insert into reply" })).toHaveCount(0);
  const countWindows = () =>
    ggmail.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const count = await countWindows();
  await open.click();
  await expect.poll(countWindows).toBe(count + 1);
});

test("the inbox assistant searches later result pages and reads a deadline from the full thread", async () => {
  const server = ggmail.gmailStandIn;
  const mail = () => ggmail.app.windows().find((page) => page.url() === server.signInUrl);
  await expect.poll(mail).toBeDefined();
  const inbox = mail();
  if (!inbox) {
    throw new Error("Gmail inbox unavailable");
  }
  const printRequests: string[] = [];
  let previewBody = "";
  const deadline = "27 November at 16:30";
  const workDeadline = "30 November at 09:15";
  const subject = "Workshop approval";
  const reset = server.serveGmailPages((url, request) => {
    const work = request.headers.cookie?.includes("assistant=work") ?? false;
    if (url.searchParams.get("view") === "pt") {
      printRequests.push((work ? "work/" : "personal/") + url.searchParams.get("th"));
      if (url.searchParams.get("th") !== threadId) {
        return;
      }
      return [
        [
          (work ? `<img src="${senderPhoto}">` : "") + "Mira &lt;mira@studio.example&gt;",
          "Please approve the layout by " + (work ? workDeadline : deadline) + "." + previewBody,
        ],
        ["Sam", "Thanks for the update."],
      ]
        .map(
          ([
            sender,
            body,
          ]) => `<table class="message"><tr><td>${sender}</td><td>20 November</td></tr>
        <tr><td><table><tr><td><div>${body}</div></td></tr></table></td></tr></table>`,
        )
        .join("");
    }
    return `<main role="main"><div class="TC">Inbox</div></main><script>
      const main = document.querySelector('main');
      const page = location.hash === '#search/workshop/p2' ? 2 : location.hash === '#search/workshop' ? 1 : 0;
      if (page) {
        const id = page === 1 && !${work} ? '194a92f8c0000002' : '${threadId}';
        const subject = page === 1 && !${work} ? 'Workshop notes' : '${subject}';
        main.innerHTML = '<table><tr class="zA" data-legacy-thread-id="' + id + '"><td class="bog">' + subject +
          '</td><td class="yW"><span email="mira@studio.example" name="Mira">Mira</span>, <span email="sam@studio.example" name="Sam">Sam</span> 2</td><td class="y2">Thanks for the update.</td></tr></table>' +
          '<button aria-label="Older" aria-disabled="' + (page === 2 || ${work}) + '"></button>';
      }
    </script>`;
  });

  try {
    await inbox.goto(server.gmailUrl + "#inbox");
    const page = ggmail.renderer;
    await page.route(senderIcon, serveAvatar);
    await page.route(senderPhoto, serveAvatar);
    const personal = (await ggmail.readConfig()).accounts?.find((account) => account.selected);
    if (!personal) {
      throw new Error("First account unavailable");
    }
    await page.evaluate(() => {
      window.electron.ipcRenderer.send("accounts.addAccount", {
        label: "Work",
        color: null,
        notifications: false,
        gmail: { unreadBadge: true, unifiedInbox: true },
      });
    });
    const findWork = async () =>
      (await ggmail.readConfig()).accounts?.find((account) => account.label === "Work");
    await expect.poll(findWork).toBeDefined();
    const work = await findWork();
    if (!work) {
      throw new Error("Second account unavailable");
    }
    await ggmail.app.evaluate(
      async ({ session }, { id, base }) => {
        await session
          .fromPartition("persist:" + id)
          .cookies.set({ url: base, path: "/", name: "assistant", value: "work" });
      },
      { id: work.id, base: server.gmailUrl },
    );
    await expect
      .poll(() =>
        ggmail.app.evaluate(
          ({ webContents, session }, { id, base }) =>
            webContents
              .getAllWebContents()
              .some(
                (w) =>
                  w.session === session.fromPartition("persist:" + id) &&
                  w.getURL().startsWith(base),
              ),
          { id: work.id, base: server.gmailUrl },
        ),
      )
      .toBe(true);
    await page.evaluate(
      (id) => window.electron.ipcRenderer.send("accounts.selectAccount", id),
      personal.id,
    );
    await expect
      .poll(
        async () => (await ggmail.readConfig()).accounts?.find((account) => account.selected)?.id,
      )
      .toBe(personal.id);
    await useDraftProvider(null);
    await ggmail.app.evaluate(
      (_electron, { deadline, workDeadline, subject }) => {
        const original = globalThis.fetch;
        let personalSource = 0;
        let workSource = 0;
        globalThis.fetch = (async (url, options) => {
          if (String(url) !== "https://api.openai.com/v1/responses") {
            return original(url, options);
          }
          const { input, tools } = JSON.parse(String(options?.body));
          const action = (name: string, args: Record<string, string | number>, id: string) => {
            if (!tools[0].tools.some((tool: { name: string }) => tool.name === name)) {
              throw new Error("Missing assistant tool " + name);
            }
            return {
              type: "function_call",
              namespace: "ggmail",
              name,
              call_id: id,
              arguments: JSON.stringify(args),
            };
          };
          const turn = input.findLast((entry: { role: string }) => entry.role === "user");
          const context = JSON.parse(turn.content).mail;
          const last = input.at(-1);
          const work = context.accounts.find(
            (account: { label: string }) => account.label === "Work",
          );
          const search = (id: string, page: number, callId: string) =>
            action(
              "search_mail",
              {
                accountId: id,
                query: "workshop",
                page,
              },
              callId,
            );
          let item;
          if (
            String(last.content).includes("Did anyone change that date?") &&
            input.some(
              (entry: { role: string; content: string }) =>
                entry.role === "assistant" && entry.content.includes(workDeadline),
            )
          ) {
            item = {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "The original dates still apply." }],
            };
          } else if (last.type !== "function_call_output") {
            item = search(context.selectedAccountId, 1, "page1");
          } else {
            const result = JSON.parse(last.output);
            if (last.call_id === "page1" && result.nextPage === 2) {
              item = search(context.selectedAccountId, result.nextPage, "page2");
            } else if (last.call_id === "page2") {
              const match = result.rows.find((row: { subject: string }) => row.subject === subject);
              personalSource = match.sourceNumber;
              item = action(
                "read_thread",
                { sourceNumber: personalSource, offset: 0 },
                "personal-thread",
              );
            } else if (last.call_id === "personal-thread" && result.text?.includes(deadline)) {
              item = search(work.accountId, 1, "work-page");
            } else if (last.call_id === "work-page") {
              workSource = result.rows.find(
                (row: { subject: string }) => row.subject === subject,
              ).sourceNumber;
              if (workSource === personalSource) {
                throw new Error("Citations from different accounts must be distinct");
              }
              item = action("read_thread", { sourceNumber: workSource, offset: 0 }, "work-thread");
            } else if (last.call_id === "work-thread" && result.text?.includes(workDeadline)) {
              item = {
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text:
                      "Personal: " +
                      deadline +
                      " [" +
                      personalSource +
                      "]. Work: " +
                      workDeadline +
                      " [" +
                      workSource +
                      "].",
                  },
                ],
              };
            } else {
              throw new Error(
                "The deadline must come from the printed thread on the second search page.",
              );
            }
          }
          return new Response(
            "data: " +
              JSON.stringify({
                type: "response.completed",
                response: { status: "completed", output: [item] },
              }) +
              "\n\n",
          );
        }) as typeof globalThis.fetch;
      },
      { deadline, workDeadline, subject },
    );

    await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Mail assistant" });
    const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
    await composer.fill(
      "When do I need to approve the workshop layouts in my personal and work mailboxes?",
    );
    await composer.press("Enter");
    const answer = panel.locator(".assistant-answer").first();
    await expect(answer).toContainText(deadline, { timeout: 25_000 });
    await expect(answer).toContainText(workDeadline);
    const citations = answer.getByRole("button", { name: /Workshop approval/ });
    await expect(citations).toHaveCount(2);
    await expect(citations.first().locator("img")).toHaveAttribute("src", senderIcon);
    await expect(citations.first()).toHaveAttribute("title", subject + " · Mira, Sam");
    await expect(panel.locator("summary img").first()).toHaveAttribute("src", senderIcon);
    expect(printRequests).toEqual(["personal/" + threadId, "work/" + threadId]);
    await expect(inbox).toHaveURL(server.gmailUrl + "#inbox");
    const followUp = "Did anyone change that date?";
    await composer.fill(followUp);
    previewBody = " Details.".repeat(2200) + " End of original source.";
    await citations.last().click();
    const preview = panel.getByRole("region", { name: "Email source" });
    await expect(preview).toContainText(workDeadline);
    await expect(preview.getByRole("heading", { name: "Mira", exact: true })).toBeVisible();
    await expect(
      preview.getByRole("button", { name: "Mira", exact: true }).locator("img"),
    ).toHaveAttribute("src", senderPhoto);
    await expect(preview.getByText("mira@studio.example", { exact: true })).toBeVisible();
    await expect(preview.getByRole("button", { name: "Open in Gmail" })).toBeInViewport({
      ratio: 1,
    });
    const readsAtOpen = printRequests.length;
    previewBody = " The thread changed after the preview opened.";
    await preview.getByRole("button", { name: "Load more" }).click();
    await expect(preview).toContainText("End of original source.");
    await expect(preview.getByRole("button", { name: "Back to answer" })).toBeInViewport({
      ratio: 1,
    });
    await expect(preview.getByRole("button", { name: "Open in Gmail" })).toBeInViewport({
      ratio: 1,
    });
    expect(printRequests.length).toBe(readsAtOpen);
    await expect(preview.getByRole("heading", { name: "Sam" })).toBeVisible();
    await preview.getByRole("button", { name: "Back to answer" }).press("Escape");
    await expect(citations.last()).toBeFocused();
    await expect(composer).toHaveValue(followUp);
    await citations.last().press("Enter");
    await expect(preview).toContainText("The thread changed after the preview opened.");
    const previousSource = preview.getByRole("button", { name: "Previous source" });
    const nextSource = preview.getByRole("button", { name: "Next source" });
    await expect(nextSource).toBeDisabled();
    await previousSource.press("Enter");
    await expect(preview).toContainText(deadline);
    await expect(
      preview.getByRole("button", { name: "Mira", exact: true }).locator("img"),
    ).toHaveAttribute("src", senderIcon);
    await expect(preview).not.toContainText(workDeadline);
    await expect(previousSource).toBeDisabled();
    const mira = preview.getByRole("button", { name: "Mira", exact: true });
    const bodyId = await mira.getAttribute("aria-controls");
    expect(bodyId).toBeTruthy();
    const message = preview.locator(`[id="${bodyId}"]`);
    await mira.press("Space");
    await expect(mira).toHaveAttribute("aria-expanded", "false");
    await expect(message).toBeHidden();
    await mira.press("Enter");
    await expect(message).toBeVisible();
    await nextSource.click();
    await expect(preview).toContainText(workDeadline);
    await previousSource.click();
    await expect(preview).toContainText(deadline);
    await expect(inbox).toHaveURL(server.gmailUrl + "#inbox");
    await preview.getByRole("button", { name: "Back to answer" }).click();
    await expect(citations.last()).toBeFocused();
    await expect(composer).toHaveValue(followUp);
    await composer.press("Enter");
    await expect(panel.locator(".assistant-answer")).toHaveCount(2);
    await expect(panel.locator(".assistant-answer").last()).toContainText(
      "The original dates still apply.",
    );
    await citations.first().click();
    await nextSource.click();
    await expect(preview).toContainText(workDeadline);
    await preview.getByRole("button", { name: "Open in Gmail" }).click();
    await expect
      .poll(
        async () => (await ggmail.readConfig()).accounts?.find((account) => account.selected)?.id,
      )
      .toBe(work.id);
    await expect
      .poll(() =>
        ggmail.app.evaluate(
          ({ webContents, session }, { id, threadId }) =>
            webContents
              .getAllWebContents()
              .filter((w) => w.getURL().endsWith("#all/" + threadId))
              .map((w) => w.session === session.fromPartition("persist:" + id)),
          { id: work.id, threadId },
        ),
      )
      .toEqual([true]);
    await expect(inbox).toHaveURL(server.gmailUrl + "#inbox");
  } finally {
    reset();
  }
});

test("inbox answers show sender identities, fit the panel, and open the cited thread", async () => {
  const page = ggmail.renderer;
  const secondId = "194a92f8c0000002";
  const mail = await openMailFixture(
    "#inbox",
    `
    <main role="main"><table>
      <tr class="zA" data-legacy-thread-id="#${threadId}"><td class="yW"><span email="sam@studio.example" name="Sam Rivera">Sam</span></td>
        <td class="bog">Planning review</td><td class="y2">Please confirm Friday’s review.</td></tr>
      <tr class="zA" data-legacy-thread-id="${secondId}"><td class="yW">Design team</td>
        <td class="bog">Review notes</td><td class="y2">The agenda is ready.</td></tr>
    </table></main>`,
  );
  await page.route(senderIcon, serveAvatar);
  await useDraftProvider(
    null,
    [
      "**Friday’s review needs your confirmation.** The agenda is ready to read. [1–2]",
      "## Before Friday",
      "- [ ] Confirm the review time with Sam. [1]\n- [x] Read the design team’s notes. [2]",
      "> We can start at 10 if that works for you. [1]",
      "## At a glance",
      "| Action | Owner | Due |\n| --- | --- | --- |\n| Confirm the planning review | You | Thursday |\n| Share a final agenda | Design team | Friday |",
      "## Reference",
      "| Topic | Time |\n| --- | --- |\n| Design review | 10:00 |",
    ].join("\n\n"),
  );
  await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await composer.fill("What do I need for Friday?");
  await composer.press("Enter");
  const answer = panel.locator(".assistant-answer");
  await expect(answer.getByRole("heading", { name: "Before Friday" })).toBeVisible();
  await expect(answer.getByRole("checkbox")).toHaveCount(2);
  await expect(answer.getByRole("checkbox").last()).toBeChecked();
  await expect(answer.locator("blockquote")).toContainText("start at 10");
  await expect(answer.locator("dt").first()).toHaveText("Action");
  await expect(answer.getByRole("table")).toHaveCount(1);
  const sam = answer.getByRole("button", { name: "1. Planning review" }).first();
  await expect(sam.locator("img")).toHaveAttribute("src", senderIcon);
  const team = answer.getByRole("button", { name: "2. Review notes" }).first();
  await expect(team).toHaveText("DT2");
  for (const dark of [false, true]) {
    await ggmail.app.evaluate(({ BrowserWindow }, dark) => {
      const win = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().includes("main.html"),
      );
      win?.setContentSize(dark ? 480 : 1200, 940);
      win?.webContents.send("theme.darkModeChanged", dark);
    }, dark);
    await expect
      .poll(() => page.locator("html").evaluate((el) => el.classList.contains("dark")))
      .toBe(dark);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(dark ? 480 : 1200);
    await expect.poll(() => answer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await panel.screenshot({
      path: test.info().outputPath(dark ? "assistant-dark.png" : "assistant-light.png"),
    });
  }
  await ggmail.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL().includes("main.html"))
      ?.setContentSize(440, 540),
  );
  const jump = panel.getByRole("button", { name: "Jump to latest reply" });
  await expect(jump).toBeVisible();
  await expect(answer.locator("p").first()).toBeInViewport();
  await jump.click();
  await expect(jump).toHaveCount(0);
  await panel.locator("summary").click();
  const source = panel.getByRole("button", { name: "2. Review notes · Design team" });
  await expect(source).toContainText("Design team");
  await page.evaluate(() =>
    window.electron.ipcRenderer.invoke("config.setConfig", { "gmail.showSenderIcons": false }),
  );
  await expect(panel.locator('[data-slot="avatar"]')).toHaveCount(0);
  await expect(source.getByText("Design team")).toBeVisible();
  await source.click();
  await panel
    .getByRole("region", { name: "Email source" })
    .getByRole("button", { name: "Open in Gmail" })
    .click();
  await expect(mail).toHaveURL(new RegExp("#all/" + secondId + "$"));
});

test("model identity follows selection between Settings and chat in light and dark themes", async () => {
  await openThread();
  await ggmail.app.evaluate(({ BrowserWindow, ipcMain, nativeTheme }) => {
    const status: AssistantConnection = {
      provider: "claude-cli",
      status: "connected",
      models: [
        {
          id: "opus",
          label: "Claude Opus 5.5",
          efforts: ["low", "medium", "high", "xhigh", "max"],
        },
        { id: "haiku", label: "Claude Haiku 4.5" },
      ],
    };
    ipcMain.removeHandler("assistant.status");
    ipcMain.handle("assistant.status", () => status);
    nativeTheme.themeSource = "light";
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes("main.html"))
      ?.setContentSize(480, 760);
  });

  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  const header = panel.locator("header");
  const chatModel = panel.getByRole("combobox", { name: "Assistant model" });
  await expect(header.locator('[data-brand="claude"]')).toHaveCSS(
    "background-color",
    "rgb(217, 119, 87)",
  );
  await expect(header).toContainText("Claude Opus 5.5");
  await expect(chatModel.locator('[data-brand="claude"]')).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await panel.screenshot({
    path: test.info().outputPath("assistant-light.png"),
    animations: "disabled",
  });

  const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await composer.fill("Check the planning email");
  const loaded = ggmail.app.waitForEvent("window", {
    predicate: (window) => window.url().includes("settings.html"),
  });
  await panel.getByRole("button", { name: "AI settings", exact: true }).click();
  const settings = await loaded;
  const provider = settings.getByRole("combobox", { name: "Mail assistant provider" });
  const settingsModel = settings.getByRole("combobox", { name: "Assistant model" });
  await expect(provider.locator('[data-brand="claude"]')).toBeVisible();
  await expect(settingsModel.locator('[data-brand="claude"]')).toBeVisible();

  const settingsEffort = settings.getByRole("combobox", { name: "Reasoning effort" });
  const chatEffort = panel.getByRole("combobox", { name: "Reasoning effort" });
  await settingsEffort.click();
  await settings.getByRole("option", { name: "XHigh", exact: true }).click();
  await expect(chatEffort).toContainText("XHigh");
  await provider.click();
  for (const [name, brand] of [
    ["OpenAI Subscription (ChatGPT)", "openai"],
    ["OpenAI API", "openai"],
    ["Claude Code CLI (Subscription)", "claude"],
    ["Claude API", "claude"],
    ["DeepSeek AI", "deepseek"],
  ]) {
    await expect(
      settings.getByRole("option", { name, exact: true }).locator(`[data-brand="${brand}"]`),
    ).toBeVisible();
  }
  await settings.screenshot({
    path: test.info().outputPath("assistant-settings.png"),
    animations: "disabled",
  });
  await settings.keyboard.press("Escape");
  await settingsModel.click();
  const haiku = settings.getByRole("option", { name: "Claude Haiku 4.5", exact: true });
  await expect(haiku.locator('[data-brand="claude"]')).toBeVisible();
  await haiku.click();
  await expect(chatModel).toContainText("Claude Haiku 4.5");
  await expect(chatEffort).toHaveCount(0);
  await expect(header).toContainText("Claude Haiku 4.5");
  await expect(composer).toHaveValue("Check the planning email");

  await chatModel.click();
  const opus = page.getByRole("option", { name: "Claude Opus 5.5", exact: true });
  await expect(opus.locator('[data-brand="claude"]')).toBeVisible();
  await opus.click();
  await expect(chatEffort).toContainText("XHigh");
  await expect(settingsEffort).toContainText("XHigh");
  await expect(settingsModel).toContainText("Claude Opus 5.5");
  await expect(header).toContainText("Claude Opus 5.5");
  await ggmail.closeSettings();
  await composer.fill("");
  await composer.blur();

  await ggmail.app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(header.locator('[data-brand="claude"]')).toHaveCSS(
    "background-color",
    "rgb(217, 119, 87)",
  );
  await panel.screenshot({
    path: test.info().outputPath("assistant-dark.png"),
    animations: "disabled",
  });
  await ggmail.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes("main.html"))
      ?.setContentSize(360, 560),
  );
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(panel.getByRole("textbox", { name: "Message the mail assistant" })).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Send chat message" })).toBeInViewport();
});

test("AI settings connect each API, route mail actions, and remember separate keys", async () => {
  await ggmail.app.evaluate(() => {
    const original = globalThis.fetch;
    const services: Record<string, [string, string]> = {
      "api.anthropic.com": ["claude-sonnet-4-6", "anthropic"],
      "api.deepseek.com": ["deepseek-flash", "deepseek"],
      "api.openai.com": ["gpt-6.1-terra", "openai"],
    };
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      const service = services[url.hostname];
      if (!service) {
        return original(input, init);
      }
      const [model, provider] = service;
      const headers = new Headers(init?.headers);
      const key =
        provider === "anthropic"
          ? headers.get("x-api-key")
          : headers.get("authorization")?.replace(/^Bearer /, "");
      if (key !== "fixture-" + provider) {
        return Response.json({}, { status: 401 });
      }
      if (url.pathname.endsWith("/models")) {
        return Response.json({
          data: [
            {
              id: model,
              ...(provider === "anthropic" && {
                capabilities: {
                  effort: { high: { supported: true }, xhigh: { supported: false } },
                },
              }),
            },
          ],
          has_more: false,
        });
      }
      const body = JSON.parse(String(init?.body));
      if (
        body.model !== model ||
        (provider === "anthropic" ? body.output_config?.effort : body.reasoning?.effort) !== "high"
      ) {
        throw new Error("Incorrect provider model");
      }
      const draft = { subject: "Schedule", body: "Friday works for " + provider };
      if (provider === "anthropic" && url.pathname === "/v1/messages") {
        if (!body.tools.some((tool: { name: string }) => tool.name === "prepare_draft")) {
          throw new Error("Missing mail action");
        }
        const finished = body.messages
          .at(-1)
          .content.some((item: { type: string }) => item.type === "tool_result");
        return Response.json({
          stop_reason: finished ? "end_turn" : "tool_use",
          content: [
            finished
              ? { type: "text", text: "Prepared with " + provider }
              : { type: "tool_use", id: "tool1", name: "prepare_draft", input: draft },
          ],
        });
      }
      if (
        !url.pathname.endsWith("/responses") ||
        !body.tools.some((tool: { name: string }) => tool.name === "prepare_draft")
      ) {
        throw new Error("Incorrect Responses request");
      }
      if (
        provider === "deepseek" &&
        ("include" in body || "store" in body || "strict" in body.tools[0])
      ) {
        throw new Error("Unsupported DeepSeek parameter");
      }
      const finished = body.input.at(-1).type === "function_call_output";
      const output = finished
        ? {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Prepared with " + provider }],
          }
        : {
            type: "function_call",
            name: "prepare_draft",
            call_id: "tool1",
            arguments: JSON.stringify(draft),
          };
      return new Response(
        "data: " +
          JSON.stringify({
            type: "response.completed",
            response: { status: "completed", output: [output] },
          }) +
          "\n\n",
      );
    }) as typeof globalThis.fetch;
  });

  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  await expect(panel.getByRole("button", { name: "Continue with ChatGPT" })).toHaveCount(0);
  const loaded = ggmail.app.waitForEvent("window", {
    predicate: (window) => window.url().includes("settings.html"),
  });
  await panel.getByRole("button", { name: "Open AI settings" }).click();
  const settings = await loaded;
  await expect(settings.getByTestId("settings-title")).toHaveText("AI");
  const picker = settings.getByRole("combobox", { name: "Mail assistant provider" });
  await picker.click();
  await expect(settings.getByRole("option")).toHaveCount(5);
  await settings
    .getByRole("option", { name: "Claude Code CLI (Subscription)", exact: true })
    .click();
  await expect(settings.getByRole("button", { name: "Use Claude Code session" })).toBeVisible();

  let turns = 0;
  for (const [name, provider] of [
    ["Claude API", "anthropic"],
    ["DeepSeek AI", "deepseek"],
    ["OpenAI API", "openai"],
  ] as const) {
    await picker.click();
    await settings.getByRole("option", { name, exact: true }).click();
    await settings.getByLabel("API key").fill("fixture-" + provider);
    await settings.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(settings.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
    const effort = settings.getByRole("combobox", { name: "Reasoning effort" });
    await effort.click();
    await settings.getByRole("option", { name: "High", exact: true }).click();
    await expect(panel.getByRole("combobox", { name: "Reasoning effort" })).toContainText("High");
    const brand = provider === "anthropic" ? "claude" : provider;
    await expect(panel.locator(`header [data-brand="${brand}"]`)).toBeVisible();
    const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
    await expect(panel.locator(".assistant-answer")).toHaveCount(turns++);
    await composer.fill("Draft a short reply");
    await composer.press("Enter");
    await expect(panel.getByText("Friday works for " + provider, { exact: true })).toBeVisible();
    await expect(panel.getByText("Prepared with " + provider, { exact: true })).toBeVisible();
  }
  await picker.click();
  await settings.getByRole("option", { name: "Claude API", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(settings.getByLabel("API key")).toHaveValue("");
  await expect(panel.getByRole("button", { name: "Open AI settings" })).toBeVisible();
});

test("the locally signed-in Claude Code session answers a synthetic prompt", async () => {
  test.skip(
    process.env.GGMAIL_TEST_CLAUDE_SUBSCRIPTION !== "1",
    "Requires a signed-in local Claude Code subscription.",
  );
  test.setTimeout(150_000);
  const settings = await ggmail.openSettings();
  await settings
    .getByTestId("settings-nav")
    .getByRole("button", { name: "AI", exact: true })
    .click();
  await settings.getByRole("combobox", { name: "Mail assistant provider" }).click();
  await settings
    .getByRole("option", { name: "Claude Code CLI (Subscription)", exact: true })
    .click();
  await settings.getByRole("button", { name: "Use Claude Code session" }).click();
  await expect(settings.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await ggmail.closeSettings();
  const page = ggmail.renderer;
  await page.getByRole("button", { name: "Mail assistant", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  await panel.getByRole("combobox", { name: "Assistant model" }).click();
  await page.getByRole("option", { name: /^Claude Haiku(?: 5\.5)?$/ }).click();
  const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await composer.fill(
    "Draft a new email with subject Sample and body exactly: The sample meeting starts at noon.",
  );
  await composer.press("Enter");
  await expect(panel.getByRole("button", { name: "Open in Gmail", exact: true })).toBeVisible({
    timeout: 110_000,
  });
  await expect(
    panel.getByText("The sample meeting starts at noon.", { exact: true }),
  ).toBeVisible();
});
