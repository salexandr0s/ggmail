import { create } from "zustand";

// Keep the submitted query available when returning from an opened conversation.
// Result rows are fetched against the current mailbox session each time the page opens.
export const useUnifiedSearch = create(() => ({
  draft: "",
  search: null as { query: string; id: string } | null,
}));

export function submitUnifiedSearch(draft: string) {
  const query = draft.trim();
  useUnifiedSearch.setState({
    draft: query,
    search: query ? { query, id: crypto.randomUUID() } : null,
  });
}
