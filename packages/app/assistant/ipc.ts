import {
  assistantDraftSchema,
  assistantRequestSchema,
  type AssistantConnection,
} from "@ggmail/shared/assistant";
import { t } from "@lingui/core/macro";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { ipc } from "@/ipc";
import { main } from "@/main";
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
  async function publishConnection(
    event: IpcMainInvokeEvent,
    pending: Promise<AssistantConnection>,
  ) {
    const connection = await pending;
    if (!event.sender.isDestroyed()) {
      renderer.send(event.sender, "assistant.connectionChanged", connection);
    }
    return connection;
  }

  function closePanel() {
    const view = main.windowIfCreated?.webContents;
    if (view && !view.isDestroyed()) {
      view.off("did-navigate", closePanel);
      view.off("render-process-gone", closePanel);
    }
    main.setAssistantVisible(false);
    assistantChat.clear();
  }
  listener.handle("assistant.status", (event) => {
    authorize(event);
    return assistantChat.connection.status();
  });
  listener.handle("assistant.connect", (event) => {
    authorize(event);
    return publishConnection(event, assistantChat.connection.connect());
  });
  listener.handle("assistant.disconnect", (event) => {
    authorize(event);
    assistantChat.clear();
    return publishConnection(event, assistantChat.connection.disconnect());
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
      main.setAssistantVisible(true);
    } else {
      closePanel();
    }
  });
  listener.on("assistant.clear", (event) => {
    if (isMainFrame(event)) {
      assistantChat.clear();
    }
  });
  listener.on("assistant.cancelSignIn", (event) => {
    if (isMainFrame(event)) {
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
      return { status: "error", message: t`Enter a message and choose a ChatGPT model.` };
    }
    return assistantChat.send(request.data, (text, activity) => {
      if (!event.sender.isDestroyed()) {
        renderer.send(event.sender, "assistant.progress", request.data.id, text, activity);
      }
    });
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
