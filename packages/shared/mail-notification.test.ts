import { expect, test } from "bun:test";
import { createDefaultConfig } from "./config";
import { mailNotificationContent, sampleMailNotification } from "./mail-notification";

const mail = { sender: "Ada", subject: "Plans", summary: "Friday at noon" };
const config = createDefaultConfig({ accountId: "a", downloadsLocation: "", trayEnabled: false });

test("mail renders account, sender, subject and summary on each platform", () => {
  expect(mailNotificationContent(mail, config, "Work", true, true)).toEqual({
    title: "[Work] Ada",
    subtitle: "Plans",
    body: "Friday at noon",
  });
  expect(mailNotificationContent(mail, config, "Work", false, false)).toEqual({
    title: "Ada",
    subtitle: undefined,
    body: "Plans\nFriday at noon",
  });
});

test("hidden fields disappear independently without leaving blank lines", () => {
  const hidden = {
    ...config,
    "notifications.showSender": false,
    "notifications.showSubject": false,
  };
  expect(mailNotificationContent(mail, hidden, "Work", true, false)).toEqual({
    title: "Work",
    subtitle: undefined,
    body: "Friday at noon",
  });
  for (const mac of [true, false]) {
    expect(sampleMailNotification({ ...hidden, "notifications.showSummary": false }, mac)).toEqual({
      title: "Default",
      subtitle: undefined,
      body: undefined,
    });
  }
});
