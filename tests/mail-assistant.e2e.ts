import type {
  AssistantConnection,
  AssistantRequest,
  AssistantResult,
} from "@ggmail/shared/assistant";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const ggmail = useApp({});

test("stop and retry keep the next message in the composer", async () => {
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
        return { status: "complete", reply: { text: request.prompt + " answered", citations: [] } };
      },
    );
  });

  const page = ggmail.renderer;
  const toggle = page.getByRole("button", { name: "Mail assistant", exact: true });
  await toggle.click();
  const panel = page.getByRole("complementary", { name: "Mail assistant" });
  const composer = panel.getByRole("textbox", { name: "Message the mail assistant" });
  await composer.fill("First question");
  await composer.press("Enter");
  await expect(panel.getByText("Partial response")).toBeVisible();
  await composer.fill("Follow-up in progress");
  await panel.getByRole("button", { name: "Stop reply" }).click();
  await expect(panel.getByText("Reply stopped")).toBeVisible();
  await expect(panel.getByText("Partial response")).toBeVisible();
  await expect(composer).toHaveValue("Follow-up in progress");
  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(panel.getByText("First question answered")).toBeVisible();
  await expect(panel.getByText("First question", { exact: true })).toHaveCount(1);
  await expect(composer).toHaveValue("Follow-up in progress");
  await composer.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();
});
