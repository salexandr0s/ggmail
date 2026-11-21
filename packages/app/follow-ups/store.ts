import type { FollowUpRow } from "@ggmail/shared/follow-ups";
import { CachedStore } from "@/lib/cached-store";

export type Reminder = Omit<FollowUpRow, "status"> & {
  accountId: string;
  owner: string;
  mailbox: string;
  threadId: string;
  anchor: string;
};

let store: CachedStore<{ reminders: Reminder[] }> | undefined;
function storage() {
  return (store ??= new CachedStore({
    name: "follow-ups",
    defaults: { reminders: [] as Reminder[] },
  }));
}

export function reminders() {
  return storage().get("reminders");
}

export function removeReminders(matches: (row: Reminder) => boolean) {
  const rows = reminders();
  const remaining = rows.filter((row) => !matches(row));
  if (remaining.length !== rows.length) {
    storage().set("reminders", remaining);
  }
}

export function saveReminder(reminder: Reminder) {
  const others = reminders().filter(
    (row) =>
      !(
        row.accountId === reminder.accountId &&
        row.owner === reminder.owner &&
        row.mailbox === reminder.mailbox &&
        row.threadId === reminder.threadId
      ),
  );
  storage().set("reminders", [...others, reminder]);
}
