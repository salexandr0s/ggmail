import { ipc } from "@ggmail/shared/renderer/ipc";
import { create } from "zustand";
import { queryClient } from "./react-query";

export const useUnifiedSearch = create(() => ({
  draft: "",
  search: null as { query: string; id: string } | null,
  accountId: "",
  selection: null as { accountId: string; threadId: string; scrollTop: number } | null,
}));

// Identity changes can arrive while a conversation covers the results.
ipc.renderer.on("gmail.mailboxChanged", (_event, id) => {
  queryClient.removeQueries({ queryKey: ["unifiedSearch", id] });
  useUnifiedSearch.setState(({ selection }) => ({
    selection: selection?.accountId === id ? null : selection,
  }));
});

export function submitUnifiedSearch(draft: string) {
  const query = draft.trim();
  ipc.main.send("unifiedSearch.clear");
  queryClient.removeQueries({ queryKey: ["unifiedSearch"] });
  useUnifiedSearch.setState({
    draft: query,
    search: query ? { query, id: crypto.randomUUID() } : null,
    accountId: "",
    selection: null,
  });
}
