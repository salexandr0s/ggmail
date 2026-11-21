import { expect, mock, test } from "bun:test";
import assert from "node:assert/strict";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";

const root = "https://mail.google.com/mail/u/0/";
const thread = "1920000000000001";
const signal = new AbortController().signal;

function account(id: string, mailbox: string) {
  return {
    config: { id, label: id, gmail: { delegatedAccountId: null } },
    instance: {
      tabs: { activeTab: { id: GMAIL_TAB_ID }, activateTab: mock(() => {}) },
      gmail: {
        mailbox,
        userEmail: id + "@example.test",
        mailboxGeneration: 1,
        store: { getState: () => ({ attentionRequired: id === "offline" }) },
        view: { webContents: { id: 1, getUserAgent: () => "ggmail", getURL: () => mailbox } },
        session: { fetch: mock<(url: string, options: RequestInit) => Promise<Response>>() },
        navigateToHash: mock((_hash: string) => {}),
      },
    },
  };
}
const personal = account("personal", root);
const work = account("work", root + "d/work/");
const all = [personal, work, account("offline", root)];
const select = mock((_id: string) => {});
const main = { location: "/unified-inbox", navigate: mock((_route: string) => {}) };

mock.module("@/main", () => ({ main }));
mock.module("@/accounts", () => ({
  accounts: {
    getSelectedAccount: () => personal,
    getAccounts: () => all,
    getAccountConfigs: () => all.map(({ config }) => config),
    getAccount: (id: string) => all.find(({ config }) => config.id === id),
    selectAccount: select,
  },
}));
const list = mock(() =>
  Promise.resolve({
    threads: [
      { id: thread, sender: "Sam", subject: "Proof", snippet: "Preview only", date: "Nov 7" },
    ],
    more: true,
  }),
);
mock.module("@/gmail/search", () => ({
  getSearchMailbox: (gmail: typeof work.instance.gmail) => gmail.mailbox,
  listSearchThreads: list,
}));
const { getMailScope, getAssistantMailboxes, searchAllMail, readMailSource, openMailSource } =
  await import("./mail-context");

test("searches, reads and opens a result in its originating delegated account", async () => {
  const scope = getMailScope();
  expect(scope.unified).toBe(true);
  expect(getAssistantMailboxes().find(({ accountId }) => accountId === "offline")?.available).toBe(
    false,
  );
  const result = await searchAllMail(scope, "subject:Proof", signal, "work", 2);
  assert(result.rows[0]);
  const source = result.rows[0].source;
  expect(result.nextPage).toBe(3);
  expect(list).toHaveBeenCalledWith(
    work.instance.gmail.session,
    "ggmail",
    root + "d/work/",
    "subject:Proof",
    2,
    signal,
    true,
  );
  work.instance.gmail.session.fetch.mockResolvedValueOnce(
    new Response(
      '<table class="message"><tr><td>Sam</td><td>Nov 7</td></tr><tr><td>Due Friday</td></tr></table>',
    ),
  );
  const page = await readMailSource(scope, source, 0, signal);
  expect(page).toMatchObject({ text: expect.stringContaining("Due Friday"), nextOffset: null });
  expect(work.instance.gmail.session.fetch.mock.lastCall?.[0]).toStartWith(root + "d/work/?");
  expect(personal.instance.gmail.session.fetch).not.toHaveBeenCalled();
  openMailSource(scope, source);
  expect(select).toHaveBeenCalledWith("work");
  expect(work.instance.gmail.navigateToHash).toHaveBeenCalledWith("#all/" + thread);
});

test("an account change during a pending read invalidates both the data and its citation", async () => {
  const scope = getMailScope();
  const { rows } = await searchAllMail(scope, "subject:Proof", signal, "work", 1);
  const source = rows[0]?.source;
  assert(source);
  const result = Promise.withResolvers<Response>();
  work.instance.gmail.session.fetch.mockReturnValueOnce(result.promise);
  const read = readMailSource(scope, source, 0, signal);
  work.instance.gmail.mailboxGeneration++;
  result.resolve(
    new Response(
      '<table class="message"><tr><td>Sam</td><td>Today</td></tr><tr><td>Different account</td></tr></table>',
    ),
  );
  await expect(read).rejects.toThrow();
  expect(() => openMailSource(scope, source)).toThrow();
});

test("a signed-out account is distinguishable from an empty search", async () => {
  const count = list.mock.calls.length;
  const result = await searchAllMail(getMailScope(), "subject:Proof", signal, "offline", 1);
  expect(result).toMatchObject({ complete: false, rows: [], error: expect.any(String) });
  expect(list.mock.calls.length).toBe(count);
});
