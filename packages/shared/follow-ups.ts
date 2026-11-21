export type FollowUpRow = {
  id: string;
  subject: string;
  recipient: string;
  lastSent: string;
  due: string;
  status: "due" | "scheduled" | "unverified";
};

/** A calendar day in the user's local timezone, also the value of a date input. */
export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function nextFriday(today = new Date()) {
  const date = new Date(today);
  date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7));
  return localDay(date);
}
