import type { AssistantEffort, AssistantModel, AssistantProvider } from "@ggmail/shared/assistant";
import { useSyncExternalStore } from "react";

const modelChanged = "ggmail-assistant-model-changed";

function subscribe(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener(modelChanged, update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(modelChanged, update);
  };
}

export function useAssistantModel(provider: AssistantProvider, models: readonly AssistantModel[]) {
  // Reuse the preference saved by the original composer, including the legacy ChatGPT key.
  const key = provider === "chatgpt" ? "assistant.model" : `assistant.model.${provider}`;
  const preference = useSyncExternalStore(subscribe, () => localStorage.getItem(key));
  const model = models.find(({ id }) => id === preference) ?? models[0];

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Local storage key.
  const effortKey = `assistant.effort.${provider}.${model?.id}`;
  const savedEffort = useSyncExternalStore(subscribe, () => localStorage.getItem(effortKey));
  const effort = model?.efforts?.find((level) => level === savedEffort);

  function chooseEffort(value: AssistantEffort | undefined) {
    if (!model || (value && !model.efforts?.includes(value))) {
      return;
    }
    if (value) {
      localStorage.setItem(effortKey, value);
    } else {
      localStorage.removeItem(effortKey);
    }
    window.dispatchEvent(new Event(modelChanged));
  }

  function chooseModel(id: string) {
    if (id !== preference && models.some((choice) => choice.id === id)) {
      localStorage.setItem(key, id);
      // Other windows receive a native storage event. Notify subscribers in this window too.
      window.dispatchEvent(new Event(modelChanged));
    }
  }
  return { model, chooseModel, effort, chooseEffort };
}
