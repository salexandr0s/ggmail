import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { t } from "@lingui/core/macro";
import { app, BrowserWindow, dialog, shell, type WebContents } from "electron";
import { canStoreSecrets, readSecret, writeSecret } from "./assistant/connection";
import { taskConnection } from "./google-task-connections";
import { connectTasks, desktopClient, insertGoogleTask, taskEdits } from "./google-tasks";
import type { ipc } from "./ipc";
import { createBrowserWindow, getCommonBrowserWindowOptions, loadRenderer } from "./lib/window";
import { main } from "./main";

type Draft = {
  accountId: string;
  title: string;
  due: string;
  owner: string;
  notes: string;
  subject: string;
  link: string;
};
const drafts = new Map<
  WebContents,
  {
    draft: Draft;
    current: () => boolean;
    openOriginal: () => void;
    busy: boolean;
    saved?: string;
    controller: AbortController;
  }
>();
export function taskDraftContents() {
  return drafts.keys();
}

function clientFile() {
  return path.join(app.getPath("userData"), "google-tasks-desktop-client");
}
function hasClient() {
  return !!process.env.GGMAIL_GOOGLE_TASKS_CLIENT_JSON || existsSync(clientFile());
}

export function openTaskDraft(draft: Draft, current: () => boolean, openOriginal: () => void) {
  for (const [source, state] of drafts) {
    if (
      !state.saved &&
      state.current() &&
      state.draft.accountId === draft.accountId &&
      state.draft.notes === draft.notes &&
      state.draft.owner === draft.owner
    ) {
      const existing = BrowserWindow.fromWebContents(source);
      if (existing) {
        if (existing.isMinimized()) {
          existing.restore();
        }
        existing.show();
        existing.focus();
        return;
      }
    }
  }
  const win = createBrowserWindow({
    ...getCommonBrowserWindowOptions(),
    titleBarStyle: "default",
    titleBarOverlay: false,
    title: t`Add to Tasks`,
    parent: main.window,
    width: 500,
    height: 475,
    minWidth: 380,
    minHeight: 380,
    fullscreenable: false,
  });
  const source = win.webContents;
  const controller = new AbortController();
  drafts.set(source, { draft, current, openOriginal, busy: false, controller });
  win.once("closed", () => {
    controller.abort();
    drafts.delete(source);
  });
  loadRenderer(win, { page: "task-draft" });
}

export function registerTaskDraft(listener: typeof ipc.main) {
  listener.handle("taskDraft.read", (event) => {
    const state = drafts.get(event.sender);
    if (event.senderFrame !== event.sender.mainFrame || !state) {
      throw new Error("Unknown draft");
    }
    const { title, due, owner, subject, link } = state.draft;
    return {
      title,
      due,
      owner,
      subject,
      link,
      connected: taskConnection(state.draft.accountId, owner).connected,
      configured: hasClient(),
    };
  });
  listener.handle("taskDraft.act", async (event, action, edits) => {
    const source = event.sender;
    const state = drafts.get(source);
    if (!state || event.senderFrame !== source.mainFrame || state.busy || !state.current()) {
      return { error: t`Reopen the email and try again.` };
    }
    if (state.saved) {
      if (action === "original") {
        state.openOriginal();
      } else if (action === "view") {
        await shell.openExternal(state.saved);
      }
      return { saved: true };
    }
    const { draft } = state;
    const owner = draft.owner;
    const win = BrowserWindow.fromWebContents(source);
    if (!win) {
      return { error: t`Reopen the email and try again.` };
    }
    const connection = taskConnection(draft.accountId, owner);
    state.busy = true;
    try {
      if (action === "original") {
        state.openOriginal();
        return {};
      }
      if (action === "setup") {
        await shell.openExternal(
          "https://developers.google.com/workspace/tasks/quickstart/nodejs#authorize_credentials_for_a_desktop_application",
        );
        return {};
      }
      if (action === "disconnect") {
        connection.forget();
        return { connected: false };
      }
      if (action === "connect") {
        if (connection.connected) {
          return { connected: true };
        }
        const generation = connection.generation;
        let raw = process.env.GGMAIL_GOOGLE_TASKS_CLIENT_JSON;
        if (!raw && existsSync(clientFile())) {
          raw = readSecret(clientFile());
        }
        if (!raw) {
          const choice = await dialog.showOpenDialog(win, {
            title: t`Choose Google desktop OAuth client JSON`,
            properties: ["openFile"],
            filters: [{ name: "JSON", extensions: ["json"] }],
          });
          if (choice.canceled || !choice.filePaths[0]) {
            return {};
          }
          // oxlint-disable-next-line lingui/no-unlocalized-strings -- File encoding.
          raw = readFileSync(choice.filePaths[0], "utf8");
        }
        const client = desktopClient.parse(JSON.parse(raw).installed);
        const auth = await connectTasks(
          client,
          owner,
          AbortSignal.any([state.controller.signal, AbortSignal.timeout(300_000)]),
          (url) => shell.openExternal(url),
        );
        if (
          generation !== connection.generation ||
          state.controller.signal.aborted ||
          !state.current()
        ) {
          return { error: t`Reopen the email and try again.` };
        }
        if (!process.env.GGMAIL_GOOGLE_TASKS_CLIENT_JSON && canStoreSecrets()) {
          writeSecret(clientFile(), JSON.stringify({ installed: client }));
        }
        connection.remember(client, auth);
        return { connected: true };
      }
      if (action !== "save") {
        throw new Error("Unknown action");
      }
      const fields = taskEdits.parse(edits);
      const notes = fields.due
        ? [t`Due date`, fields.due].join(" · ") + "\n\n" + draft.notes
        : draft.notes;
      let token = await connection.token();
      if (!token) {
        return { connected: false };
      }
      if (!state.current() || state.controller.signal.aborted) {
        return { error: t`Reopen the email and try again.` };
      }
      let result = await insertGoogleTask(token, fields, notes);
      // A 401 definitively rejected the insert. An unknown network outcome must never be replayed.
      if (result.status === 401) {
        connection.rejectToken(token);
        token = await connection.token();
        if (!token) {
          return { connected: false };
        }
        if (!state.current() || state.controller.signal.aborted) {
          return { error: t`Reopen the email and try again.` };
        }
        result = await insertGoogleTask(token, fields, notes);
        if (result.status === 401) {
          connection.forget(token);
          return { connected: false };
        }
      }
      const { status, url } = result;
      if (status < 200 || status >= 300) {
        throw new Error("Task save failed");
      }
      const taskUrl = url ?? new URL("https://tasks.google.com/tasks/");
      taskUrl.searchParams.set("authuser", owner);
      state.saved = taskUrl.href;
      return { saved: true };
    } catch {
      return {
        error:
          action === "connect"
            ? t`Couldn’t connect Google Tasks. Check the desktop client and sign in with the email shown here.`
            : t`Check Google Tasks before retrying the save.`,
      };
    } finally {
      state.busy = false;
    }
  });
}
