import type { GmailInboxMessage, InboxUpdate } from "@ggmail/shared/gmail";
import type { QueryClient } from "@tanstack/react-query";

export type UnifiedInbox = Record<
  string,
  { messages: GmailInboxMessage[]; status: InboxUpdate["status"] }
>;

export const unifiedInboxQueryKey = ["unifiedInbox"] as const;

/**
 * Each mailbox pushes its own status and last successful feed. The main
 * process can replay the current session's rows after a renderer reload,
 * including when the mailbox is offline.
 */
const unifiedInboxCacheLifetime = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
};

export const unifiedInboxCacheOptions = {
  queryKey: unifiedInboxQueryKey,
  initialData: (): UnifiedInbox => ({}),
  ...unifiedInboxCacheLifetime,
};

/**
 * A push that arrives before anything has mounted the unified inbox builds the
 * entry itself, and `setQueryData` builds it from the client's defaults rather
 * than from the options an observer would later bring. Without these it would
 * get the default five-minute `gcTime` and be collected before anyone opened
 * the route, losing every account that had not pushed since.
 */
export function registerUnifiedInboxCacheDefaults(queryClient: QueryClient) {
  queryClient.setQueryDefaults(unifiedInboxQueryKey, unifiedInboxCacheLifetime);
}

export function mergeUnifiedInboxPush(
  queryClient: QueryClient,
  accountId: string,
  update: InboxUpdate,
) {
  queryClient.setQueryData<UnifiedInbox>(unifiedInboxQueryKey, (unifiedInbox) => ({
    ...unifiedInbox,
    [accountId]: {
      status: update.status,
      messages:
        update.status === "signIn"
          ? []
          : (update.messages ??
            (update.status === "retrying" ? unifiedInbox?.[accountId]?.messages : undefined) ??
            []),
    },
  }));
}
