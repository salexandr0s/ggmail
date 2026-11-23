import { randomUUID } from "node:crypto";
import {
  quoteSourceSchema,
  type AssistantQuote,
  ASSISTANT_PROMPT_LIMIT,
} from "@ggmail/shared/assistant";
import { createGgmailMessageUrl, gmailMessageWebUrl } from "@ggmail/shared/message-links";
import { GMAIL_TAB_ID } from "@ggmail/shared/tabs";
import { t } from "@lingui/core/macro";
import { app, type IpcMainEvent } from "electron";
import { serializeError } from "serialize-error";
import { z } from "zod";
import { accounts } from "./accounts";
import { type ContextAction, runContextAction, showContextActions } from "./context-menu-popup";
import { legacyThreadId } from "./gmail/print-thread";
import { getSearchMailbox } from "./gmail/search";
import { appI18n } from "./i18n";
import { ipc } from "./ipc";
import { copyText } from "./lib/clipboard";
import { log } from "./lib/log";
import type { CalendarOption } from "./mail-selection";
import { main } from "./main";
import { openTaskDraft } from "./task-draft";

function selectionLocale() {
  return new Intl.Locale(appI18n.locale, {
    region: app.getLocaleCountryCode() || undefined,
  }).toString();
}

const threadSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9]{15,128}$/),
  subject: z.string().max(512),
  snippet: z.string().max(4096),
  sender: z.string().max(512).optional(),
  messageId: z
    .string()
    .regex(/^[a-zA-Z0-9]{15,128}$/)
    .optional(),
  /** The conversation's own id, where the page gives one apart from the route's. */
  threadId: z.string().regex(legacyThreadId).optional(),
});
export type MenuThread = z.infer<typeof threadSchema>;
export type MenuAccount = ReturnType<typeof accounts.getSelectedAccount>;

export function quoteToAssistant(text: string | AssistantQuote) {
  if (main.location !== "/") {
    main.navigate("/");
  }
  main.show();
  main.window.webContents.focus();
  ipc.renderer.send(
    main.window.webContents,
    "assistant.quote",
    typeof text === "string" ? text.trim().slice(0, ASSISTANT_PROMPT_LIMIT + 1) : text,
  );
}

export function threadActions(
  account: MenuAccount,
  thread: MenuThread,
  selection: string,
  excerpt = "",
  chooseDate?: (options: CalendarOption[], choose: (option: CalendarOption) => void) => void,
) {
  const { gmail, tabs } = account.instance;
  const owner = gmail.userEmail;
  const generation = gmail.mailboxGeneration;
  const current = () =>
    accounts
      .getAccounts()
      .some(
        (item) =>
          item.instance.gmail === gmail &&
          gmail.userEmail === owner &&
          gmail.mailboxGeneration === generation,
      );
  const messageId = thread.messageId ?? thread.id;
  const link = owner ? createGgmailMessageUrl(owner, messageId) : "";
  const delegation = account.config.gmail.delegatedAccountId;
  const original = owner ? gmailMessageWebUrl(owner, messageId, delegation) : "";
  const quote = (
    selection ||
    excerpt ||
    [thread.subject, thread.snippet].filter(Boolean).join("\n")
  ).trim();
  function openCalendar(option?: CalendarOption) {
    if (!current()) {
      return;
    }
    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action", "TEMPLATE");
    if (owner) {
      url.searchParams.set("authuser", owner);
    }
    url.searchParams.set("text", thread.subject);
    /* oxlint-disable lingui/no-unlocalized-strings -- HTML entities for Calendar details. */
    const details = (selection.slice(0, 4000) || thread.snippet)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    /* oxlint-enable lingui/no-unlocalized-strings */
    url.searchParams.set("details", [details, original || link].filter(Boolean).join("\n\n"));
    if (option) {
      url.searchParams.set("dates", option.dates);
      if (option.zone) {
        url.searchParams.set("ctz", option.zone);
        url.searchParams.set("stz", option.zone);
        url.searchParams.set("etz", option.zone);
      }
    }
    const tab = tabs.openUrl(url.href);
    if (tab && !tab.isWindowed) {
      if (!accounts.getAccount(account.config.id).config.selected) {
        accounts.selectAccount(account.config.id);
      }
      main.navigate("/");
      accounts.refreshSelectedAccountView();
    }
  }
  return {
    task: {
      id: "task",
      label: t`Add to Tasks`,
      enabled: !!owner && !!selection,
      run: async () => {
        const { selectionTask } = await import("./mail-selection");
        if (!current() || !owner || !selection) {
          return;
        }
        openTaskDraft(
          {
            ...selectionTask(selection, new Date(), undefined, selectionLocale()),
            accountId: account.config.id,
            owner,
            subject: thread.subject,
            link: original,
            notes: selection.slice(0, 4000) + "\n\n" + original,
          },
          current,
          () => {
            accounts.openMessage(account.config.id, messageId);
            main.navigate("/");
            main.show();
          },
        );
      },
    },
    quote: {
      id: "quote",
      label: t`Quote to assistant`,
      enabled: Boolean(quote),
      run: () => {
        if (!current()) {
          return;
        }
        if (
          gmail.messageId !== thread.id ||
          !accounts.getAccount(account.config.id).config.selected ||
          account.instance.tabs.activeTabId !== GMAIL_TAB_ID
        ) {
          accounts.openMessage(account.config.id, thread.id);
        }
        quoteToAssistant({
          id: randomUUID(),
          text:
            quote.length > ASSISTANT_PROMPT_LIMIT
              ? quote.slice(0, ASSISTANT_PROMPT_LIMIT - 1).replace(/[\uD800-\uDBFF]$/, "") + "…"
              : quote,
          truncated: quote.length > ASSISTANT_PROMPT_LIMIT || undefined,
          sender: thread.sender ?? "",
          subject: thread.subject,
          accountId: account.config.id,
          owner: owner ?? "",
          messageId,
          // The id in a route is not always one Gmail's conversation reader
          // takes, so only an id in that form is kept.
          threadId: [thread.threadId, thread.id].find((id) => id && legacyThreadId.test(id)),
          mailbox: getSearchMailbox(gmail, delegation),
        });
      },
    },
    calendar: {
      id: "calendar",
      label: t`Add to Calendar…`,
      run: async () => {
        if (!selection) {
          openCalendar();
          return;
        }
        let options: CalendarOption[] = [];
        try {
          const { selectionDates } = await import("./mail-selection");
          options = selectionDates(selection, new Date(), undefined, selectionLocale());
        } catch (error) {
          // Finding a date in the text is a convenience. Without it the event
          // still opens, with the selection in its details.
          log.error("Could not read dates from the selection", { error: serializeError(error) });
        }
        if (!current()) {
          return;
        }
        if (options.length > 1 && chooseDate) {
          chooseDate(options, openCalendar);
        } else {
          openCalendar(options[0]);
        }
      },
    },
    messageLink: {
      id: "messageLink",
      label: t({ message: "Copy Message Link", context: "context menu" }),
      enabled: !!link,
      run: () => {
        if (current()) {
          void copyText(link);
        }
      },
    },
  } satisfies Record<string, ContextAction>;
}

export function registerMailContextActions(listener: typeof ipc.main) {
  listener.handle("assistant.openQuote", (event, input) => {
    if (event.sender !== main.window.webContents || event.senderFrame !== event.sender.mainFrame) {
      return false;
    }
    const source = quoteSourceSchema.safeParse(input).data;
    const account =
      source && accounts.getAccounts().find((item) => item.config.id === source.accountId);
    if (
      !account ||
      !source ||
      (account.instance.gmail.userEmail ?? "") !== source.owner ||
      (source.mailbox &&
        source.mailbox !==
          getSearchMailbox(account.instance.gmail, account.config.gmail.delegatedAccountId))
    ) {
      return false;
    }
    accounts.openMessage(account.config.id, source.messageId);
    main.navigate("/");
    return true;
  });
  listener.on("contextMenu.rowAction", (event, action, data) => {
    const account = accounts.getSelectedAccount();
    const gmail = account.instance.gmail;
    const thread = threadSchema.safeParse(data);
    if (
      main.location !== "/" ||
      account.instance.tabs.activeTabId !== GMAIL_TAB_ID ||
      !gmail.hasView ||
      event.sender !== gmail.view.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      !getSearchMailbox(gmail, account.config.gmail.delegatedAccountId) ||
      !thread.success ||
      !legacyThreadId.test(thread.data.id) ||
      (action !== "quote" && action !== "calendar")
    ) {
      return;
    }
    void runContextAction(threadActions(account, thread.data, "")[action]);
  });
  listener.on(
    "contextMenu.inboxRow",
    (event: IpcMainEvent, accountId, id, subject, snippet, sender, x, y) => {
      if (
        event.sender !== main.window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        main.location !== "/unified-inbox" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return;
      }
      const thread = threadSchema.safeParse({ id, subject, snippet, sender });
      const account = accounts.getAccounts().find((item) => item.config.id === accountId);
      if (!account || !thread.success) {
        return;
      }
      const actions = threadActions(account, thread.data, "");
      showContextActions(main.window, event.sender, { x: Math.round(x), y: Math.round(y) }, [
        [
          {
            id: "open",
            label: t`Open email`,
            run: () => {
              accounts.openMessage(accountId, id);
              main.navigate("/");
            },
          },
        ],
        [actions.quote, actions.calendar],
        [actions.messageLink],
      ]);
    },
  );
}
