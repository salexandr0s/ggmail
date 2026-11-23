import {
  assistantRequestSchema,
  assistantProviderSchema,
  type AssistantActivity,
  type AssistantConnection,
} from "@ggmail/shared/assistant";
import { t } from "@lingui/core/macro";
import { app, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { ipc } from "@/ipc";
import { CachedStore } from "@/lib/cached-store";
import { main } from "@/main";
import { settingsWindow } from "@/settings-window";
import { AssistantChat, type SavedConversation } from "./chat";
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
  const assistantChat = new AssistantChat(
    new CachedStore<SavedConversation>({
      name: "assistant-conversation",
      defaults: { entries: [], sources: [] },
      configFileMode: 0o600,
    }),
  );

  app.on("before-quit", () => assistantChat.beforeQuit());

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
    assistantChat.interrupt();
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
    assistantChat.interrupt();
    return assistantChat.connection.change(provider, "select", undefined, publishConnection);
  });
  listener.handle("assistant.connect", (event, value, key) => {
    authorizeSettings(event);
    const provider = assistantProviderSchema.parse(value);
    assistantChat.interrupt();
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
    assistantChat.interrupt();
    return assistantChat.connection.change(provider, "disconnect", undefined, publishConnection);
  });
  listener.handle("assistant.context", (event) => {
    authorize(event);
    return assistantChat.context();
  });
  listener.on("assistant.setMounted", (event, mounted) => {
    if (!isMainFrame(event) || typeof mounted !== "boolean") {
      return;
    }
    if (mounted) {
      event.sender.off("did-navigate", closePanel).once("did-navigate", closePanel);
      event.sender.off("render-process-gone", closePanel).once("render-process-gone", closePanel);
    } else {
      closePanel();
    }
  });
  listener.on("assistant.setInset", (event, inset) => {
    if (isMainFrame(event) && Number.isSafeInteger(inset) && inset >= 0) {
      main.setAssistantInset(inset);
    }
  });
  listener.handle("assistant.transcript", (event) => {
    authorize(event);
    return assistantChat.transcript();
  });
  listener.handle("assistant.clear", (event) => {
    authorize(event);
    assistantChat.clear();
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
  listener.on("assistant.closePreview", (event, id) => {
    authorize(event);
    assistantChat.closePreview(z.uuid().parse(id));
  });
  listener.handle("assistant.previewSource", (event, id, offset) => {
    authorize(event);
    return assistantChat.previewSource(z.uuid().parse(id), z.int().nonnegative().parse(offset));
  });
  listener.handle("assistant.openSource", (event, id) => {
    authorize(event);
    return assistantChat.openSource(z.uuid().parse(id));
  });
  listener.handle("assistant.openDraft", (event, id) => {
    authorize(event);
    assistantChat.openDraft(z.uuid().parse(id));
  });
  listener.handle("assistant.insertReply", async (event, id) => {
    authorize(event);
    const turnId = z.uuid().parse(id);
    try {
      await assistantChat.insertReply(turnId);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          // Anything else is a fault in the insertion itself. Asking the user
          // to open a reply would send them after the wrong cause.
          error instanceof AssistantError
            ? error.message
            : t`Couldn't insert the draft. Copy it instead.`,
      };
    }
  });
}
