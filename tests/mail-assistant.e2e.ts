import type {
  AssistantConnection,
  AssistantRequest,
  AssistantResult,
} from "@ggmail/shared/assistant";
import type {} from "@ggmail/shared/electron-api";
import { expect, test } from "@playwright/test";
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
    await ggmail.app.evaluate(({ ipcMain }) => {
      const status: AssistantConnection = {
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
            reply: { text: request.prompt + " answered", citations: [] },
          };
        },
      );
    });

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
      await expect(panel.getByRole("button", { name: "Draft a reply", exact: true })).toBeVisible();
      await expect(editor).toBeVisible();
      expect(await editor.innerHTML()).toBe(original);
    }
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
      "**Friday’s review needs your confirmation.** The agenda is ready to read. [1, 2]",
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
  await expect(mail).toHaveURL(new RegExp("#all/" + secondId + "$"));
});
