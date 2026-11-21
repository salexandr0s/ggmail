import {
  assistantDraftSchema,
  assistantRequestSchema,
  assistantProviderSchema,
  type AssistantActivity,
  type AssistantConnection,
} from "@ggmail/shared/assistant";
import { t } from "@lingui/core/macro";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { ipc } from "@/ipc";
import { main } from "@/main";
import { settingsWindow } from "@/settings-window";
import { assistantChat } from "./chat";
import { AssistantError } from "./responses";

function isMainFrame(event: IpcMainEvent | IpcMainInvokeEvent) {
  const view = main.windowIfCreated?.webContents;
  return view && event.sender === view && event.senderFrame === view.mainFrame;
}

function authorize(event: IpcMainInvokeEvent) {
  if (!isMainFrame(event)) {
    throw new Error("Unauthorized assistant IPC");
  }
}

export function registerAssistantIpc({ main: listener, renderer }: typeof ipc) {
  function isSettingsFrame(event: IpcMainEvent | IpcMainInvokeEvent) {
    const view = settingsWindow.window?.webContents;
    return view && event.sender === view && event.senderFrame === view.mainFrame;
  }
  function authorizeSettings(event: IpcMainInvokeEvent) {
    if (!isSettingsFrame(event)) {
      throw new Error("Unauthorized assistant settings IPC");
    }
  }
  function publishConnection(connection: AssistantConnection) {
    for (const view of [main.windowIfCreated?.webContents, settingsWindow.window?.webContents]) {
      if (view && !view.isDestroyed()) {
        renderer.send(view, "assistant.connectionChanged", connection);
      }
    }
  }

  function closePanel() {
    const view = main.windowIfCreated?.webContents;
    if (view && !view.isDestroyed()) {
      view.off("did-navigate", closePanel);
      view.off("render-process-gone", closePanel);
    }
    main.setAssistantInset(0);
    assistantChat.clear();
  }
  listener.handle("assistant.status", (event) => {
    if (!isSettingsFrame(event)) {
      authorize(event);
    }
    return assistantChat.connection.status();
  });
  listener.handle("assistant.openSettings", (event) => {
    authorize(event);
    settingsWindow.open("ai");
  });
  listener.handle("assistant.selectProvider", (event, value) => {
    authorizeSettings(event);
    const provider = assistantProviderSchema.parse(value);
    assistantChat.clear();
    return assistantChat.connection.change(provider, "select", undefined, publishConnection);
  });
  listener.handle("assistant.connect", (event, value, key) => {
    authorizeSettings(event);
    const provider = assistantProviderSchema.parse(value);
    assistantChat.clear();
    return assistantChat.connection.change(
      provider,
      "connect",
      z.string().trim().max(4096).optional().parse(key),
      publishConnection,
    );
  });
  listener.handle("assistant.disconnect", (event, value) => {
    authorizeSettings(event);
    const provider = assistantProviderSchema.parse(value);
    assistantChat.clear();
    return assistantChat.connection.change(provider, "disconnect", undefined, publishConnection);
  });
  listener.handle("assistant.context", (event) => {
    authorize(event);
    return assistantChat.context();
  });
  listener.on("assistant.setVisible", (event, visible) => {
    if (!isMainFrame(event) || typeof visible !== "boolean") {
      return;
    }
    if (visible) {
      event.sender.off("did-navigate", closePanel).once("did-navigate", closePanel);
      event.sender.off("render-process-gone", closePanel).once("render-process-gone", closePanel);
    } else {
      // Stop work immediately; the renderer keeps painting the drawer's exit.
      assistantChat.clear();
    }
  });
  listener.on("assistant.setInset", (event, inset) => {
    if (isMainFrame(event) && Number.isSafeInteger(inset) && inset >= 0) {
      main.setAssistantInset(inset);
    }
  });
  listener.on("assistant.clear", (event) => {
    if (isMainFrame(event)) {
      assistantChat.clear();
    }
  });
  listener.on("assistant.cancelSignIn", (event) => {
    if (isSettingsFrame(event)) {
      assistantChat.connection.cancelSignIn();
    }
  });
  listener.on("assistant.stop", (event, id) => {
    if (isMainFrame(event) && z.uuid().safeParse(id).success) {
      assistantChat.stop(id);
    }
  });
  listener.handle("assistant.send", (event, input) => {
    authorize(event);
    const request = assistantRequestSchema.safeParse(input);
    if (!request.success) {
      return { status: "error", message: t`Enter a message and choose a model.` };
    }
    const { id } = request.data;
    function publish(text: string, activity?: AssistantActivity) {
      if (!event.sender.isDestroyed() && isMainFrame(event)) {
        renderer.send(event.sender, "assistant.progress", id, text, activity);
      }
    }

    // Providers send cumulative text. Show the first fragment immediately, and
    // send the latest snapshot in a burst before a tool starts or the turn ends.
    let lastSent = -Infinity;
    let buffered = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    function flush() {
      clearTimeout(timer);
      timer = undefined;
      if (buffered) {
        publish(buffered);
        buffered = "";
        lastSent = performance.now();
      }
    }
    return assistantChat
      .send(request.data, (text, activity) => {
        if (activity) {
          flush();
          publish(text, activity);
          lastSent = -Infinity;
        } else if (text) {
          buffered = text;
          const delay = 32 - (performance.now() - lastSent);
          if (delay <= 0) {
            flush();
          } else {
            timer ??= setTimeout(flush, delay);
          }
        }
      })
      .finally(flush);
  });
  listener.handle("assistant.openSource", (event, id) => {
    authorize(event);
    return assistantChat.openSource(z.uuid().parse(id));
  });
  listener.handle("assistant.openDraft", (event, draft, key) => {
    authorize(event);
    const validated = assistantDraftSchema.parse(draft);
    assistantChat.openDraft(validated, z.string().parse(key));
  });
  listener.handle("assistant.insertReply", async (event, body, key) => {
    authorize(event);
    const text = assistantDraftSchema.shape.body.parse(body);
    const scopeKey = z.string().parse(key);
    try {
      await assistantChat.insertReply(text, scopeKey);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof AssistantError
            ? error.message
            : t`Open a reply in this thread and try again.`,
      };
    }
  });
}
