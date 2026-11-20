import assert from "node:assert/strict";
import { expect, test, type Page } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const ggmail = useApp({ "gmail.extendDarkTheme": true });
const mailbox = "https://mail.google.com/mail/u/0/";
const newsletter =
  '<table bgcolor="#ffffff"><tbody><tr><td id="copy" style="background: white !important; color: black !important">Order confirmed. <a href="#details"><span>View details</span></a></td></tr></tbody></table>';
const draft = '<span style="color: rgb(0, 0, 0);">Signed, Alex</span>';
const html = `<body style="background: white"><header>Inbox</header><main role="main">
<div class="nH id" id="thread" style="background-color: white"><h2 class="hP">Confirmation</h2>
<div class="adn" data-legacy-message-id="first"><div class="a3s" id="newsletter">${newsletter}</div></div>
<div class="adn"><div class="a3s">A plain text follow-up</div></div>
<div class="ip"><div class="AD"><div id="draft" contenteditable role="textbox">${draft}</div></div></div>
<div id="toolbar">Reply options</div></div></main></body>`;

async function mailboxView(exclude?: Page) {
  const find = () =>
    ggmail.app
      .windows()
      .find((page) => page !== exclude && page.url() === ggmail.gmailStandIn.signInUrl);
  await expect.poll(find).toBeDefined();
  const page = find();
  assert(page);
  return page;
}

test("reading colors, original artwork and live settings preserve message and draft HTML", async () => {
  const mail = await mailboxView();
  await mail.route(mailbox + "**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await mail.goto(mailbox + "#inbox/test-message");
  const buttons = mail.getByRole("button", { name: "Original colors" });
  await expect(buttons).toHaveCount(2);
  await expect(mail.locator("[data-dark-theme-root]")).toHaveCount(1);
  const copy = mail.locator("#copy");
  await expect(copy).toHaveCSS("color", "rgb(232, 234, 237)");
  await expect(copy).toHaveCSS("background-color", "rgb(44, 48, 53)");
  await expect(copy.locator("a span")).toHaveCSS("color", "rgb(168, 199, 250)");
  await expect(mail.locator("#draft")).toHaveCSS("filter", "invert(1) hue-rotate(180deg)");
  expect(await mail.locator("#draft").innerHTML()).toBe(draft);
  expect(await mail.locator("#newsletter").innerHTML()).toBe(newsletter);
  await buttons.first().focus();
  await buttons.first().press("Space");
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  await expect(copy).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(copy).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(buttons.last()).toHaveAttribute("aria-pressed", "false");
  await mail.locator("#newsletter").evaluate((body) => {
    const replacement = body.cloneNode(true) as HTMLElement;
    replacement.removeAttribute("data-ggmail-message-colors");
    body.replaceWith(replacement);
  });
  await expect(mail.locator("#newsletter")).toHaveAttribute(
    "data-ggmail-message-colors",
    "original",
  );
  await expect(copy).toHaveCSS("color", "rgb(0, 0, 0)");

  // Gmail mounts the new message and updates toolbar layout without a navigation.
  await mail.locator("#toolbar").evaluate((el) => {
    el.style.display = "none";
  });
  await mail.locator("main").evaluate((main) => {
    const message = document.createElement("div");
    message.className = "adn";
    message.innerHTML = '<div class="a3s" id="late"><blockquote>A quoted line</blockquote></div>';
    main.append(message);
  });
  await expect(buttons).toHaveCount(3);
  await expect(mail.locator("#late blockquote")).toHaveCSS("color", "rgb(199, 205, 212)");

  const settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Gmail");
  const toggle = settings.getByRole("switch", { name: "Extend dark theme", exact: true });
  await toggle.click();
  await expect(buttons).toHaveCount(0);
  await expect(
    mail.locator("[data-dark-theme], [data-dark-theme-root], [data-ggmail-message-colors]"),
  ).toHaveCount(0);
  await expect(mail.locator("#draft")).toHaveCSS("filter", "none");
  await expect(mail.locator("#toolbar")).toHaveCSS("display", "none");
  expect(await mail.locator("#newsletter").innerHTML()).toBe(newsletter);
  await toggle.click();
  await expect(buttons).toHaveCount(3);
  await expect(copy).toHaveCSS("color", "rgb(232, 234, 237)");
  expect(await mail.locator("#draft").innerHTML()).toBe(draft);
});

test("a workspace compose pop-out follows the setting and keeps an edited draft intact", async () => {
  // Open a real app-managed mail pop-out via the stand-in mailbox URL, then
  // navigate its workspace preload to the locally fulfilled Gmail document.
  const account = await mailboxView();
  const popoutUrl = ggmail.gmailStandIn.gmailUrl + "/popout";
  await account.evaluate((url) => {
    window.open(url, "_blank", "popup");
  }, popoutUrl);
  const popout = await mailboxView(account);
  await popout.route(mailbox + "**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div class="nH"><div class="AD"><div id="draft" contenteditable="true">${draft}</div></div></div>`,
    }),
  );
  await popout.goto(mailbox + "popout");
  const editor = popout.locator("#draft");
  await expect(editor).toHaveCSS("filter", "invert(1) hue-rotate(180deg)");
  await editor.press("End");
  await editor.pressSequentially("!");
  const edited = await editor.innerHTML();
  expect(edited).toContain("Signed, Alex!");
  expect(edited).not.toContain("data-dark-theme");
  const settings = await ggmail.openSettings();
  await openSettingsPage(settings, "Gmail");
  await settings.getByRole("switch", { name: "Extend dark theme", exact: true }).click();
  await expect(editor).toHaveCSS("filter", "none");
  expect(await editor.innerHTML()).toBe(edited);
});
