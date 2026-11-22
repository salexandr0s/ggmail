import { minutesToTime, timeToMinutes } from "./time";
import type { NotificationTime } from "./types";

const DAY = 24 * 60;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
type Window = Omit<NotificationTime, "id">;
type Interval = { start: number; end: number };

function isClockTime(time: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/** An overnight window belongs to the day it starts on. Old settings can end at 24:00. */
function intervalsOnDay({ start, end, days }: Window, day: number): Interval[] {
  if (!isClockTime(start) || (!isClockTime(end) && end !== "24:00")) {
    return [];
  }

  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  const startsOn = (weekday: number) => !days?.length || days.includes(weekday);

  if (from === to) {
    return startsOn(day) ? [{ start: 0, end: DAY }] : [];
  }
  if (from < to) {
    return startsOn(day) ? [{ start: from, end: to }] : [];
  }

  const intervals: Interval[] = [];
  if (to > 0 && startsOn((day + 6) % 7)) {
    intervals.push({ start: 0, end: to });
  }
  if (startsOn(day)) {
    intervals.push({ start: from, end: DAY });
  }
  return intervals;
}

export function checkWithinNotificationTimes(times: Window[], now: Date) {
  const minute = now.getHours() * 60 + now.getMinutes();
  return (
    !times.length ||
    times.some((time) =>
      intervalsOnDay(time, now.getDay()).some(({ start, end }) => start <= minute && minute < end),
    )
  );
}

export function overlapsNotificationWindow(candidate: Window, others: Window[]) {
  return WEEKDAYS.some((day) => {
    const occupied = others.flatMap((other) => intervalsOnDay(other, day));
    return intervalsOnDay(candidate, day).some(({ start, end }) =>
      occupied.some((interval) => start < interval.end && interval.start < end),
    );
  });
}

function firstGap(occupied: Interval[]) {
  let start = 0;
  for (const interval of occupied.sort((a, b) => a.start - b.start)) {
    if (start < interval.start) {
      return { start, end: interval.start };
    }
    start = Math.max(start, interval.end);
  }
  return start < DAY ? { start, end: DAY } : undefined;
}

export function findNotificationWindow(times: Window[]): Window | undefined {
  if (!times.length) {
    return { start: "09:00", end: "17:00" };
  }

  const occupied = WEEKDAYS.map((day) => ({
    days: [day],
    intervals: times.flatMap((time) => intervalsOnDay(time, day)),
  }));

  // Prefer a window that works every day, then try each weekday individually.
  for (const { days, intervals } of [
    { days: undefined, intervals: occupied.flatMap((day) => day.intervals) },
    ...occupied,
  ]) {
    const gap = firstGap(intervals);
    if (gap) {
      return {
        start: minutesToTime(gap.start),
        end: minutesToTime(Math.min(gap.end, gap.start + 60) % DAY),
        days,
      };
    }
  }
}

export type NotificationTimeEdit =
  | { type: "add" }
  | { type: "remove"; id: string }
  | { type: "clock"; id: string; field: "start" | "end"; value: string }
  | { type: "weekday"; id: string; day: number | "all" };

/** Apply one edit to the latest saved list. Rapid changes to adjacent controls can arrive before a renderer repaint. */
export function editNotificationTimes(times: NotificationTime[], edit: NotificationTimeEdit) {
  if (edit.type === "add") {
    const slot = findNotificationWindow(times);
    return slot ? [...times, { id: crypto.randomUUID(), ...slot }] : "full";
  }
  if (edit.type === "remove") {
    return times.filter((entry) => entry.id !== edit.id);
  }
  const time = times.find((entry) => entry.id === edit.id);
  if (!time) {
    return "unchanged";
  }

  let candidate: NotificationTime;
  if (edit.type === "clock") {
    if (!isClockTime(edit.value)) {
      return "unchanged";
    }
    candidate = { ...time, [edit.field]: edit.value };
  } else {
    const days = time.days?.length === 7 ? [] : (time.days ?? []);
    const day = edit.day;
    const selected =
      day === "all" ? [] : days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    candidate = { ...time, days: selected };
  }
  if (
    overlapsNotificationWindow(
      candidate,
      times.filter((entry) => entry.id !== time.id),
    )
  ) {
    return "overlap";
  }
  return times.map((entry) => (entry.id === time.id ? candidate : entry));
}
