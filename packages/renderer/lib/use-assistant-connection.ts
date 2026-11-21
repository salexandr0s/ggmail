import type { AssistantConnection } from "@ggmail/shared/assistant";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAssistantConnection() {
  const [connection, setConnection] = useState<AssistantConnection>();
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    try {
      const next = await ipc.main.invoke("assistant.status");
      if (version === generation.current) {
        setConnection(next);
      }
    } catch {
      if (version === generation.current) {
        setConnection({ provider: "chatgpt", status: "disconnected", models: [] });
      }
    }
  }, []);
  useEffect(() => {
    const unsubscribe = ipc.renderer.on("assistant.connectionChanged", (_event, value) => {
      generation.current++;
      setConnection(value);
    });
    void refresh();
    return () => {
      generation.current++;
      unsubscribe();
    };
  }, [refresh]);
  return { connection, refresh };
}
