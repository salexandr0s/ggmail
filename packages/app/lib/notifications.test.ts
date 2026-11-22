import { describe, expect, test } from "bun:test";
import {
  checkWithinNotificationTimes,
  findNotificationWindow,
  overlapsNotificationWindow,
} from "@ggmail/shared/notification-times";
import type { NotificationTime } from "@ggmail/shared/types";
import { shouldPlayNewEmailSound } from "./notifications";

function makeTime(start: string, end: string, days?: number[]): NotificationTime {
  return {
    id: "test-id",
    start,
    end,
    days,
  };
}

// Jan 1 2024 was a Monday (getDay() = 1), so offset dayOfWeek by 1 to get correct days
const makeDate = (dayOfWeek: number, hours: number, minutes: number) => {
  const date = new Date(2024, 0, dayOfWeek); // 0=Sun(Dec31), 1=Mon(Jan1), ..., 6=Sat(Jan6)
  date.setHours(hours, minutes, 0, 0);
  return date;
};

describe("checkWithinNotificationTimes", () => {
  test("returns true when times list is empty", () => {
    const now = makeDate(1, 10, 0);
    expect(checkWithinNotificationTimes([], now)).toBe(true);
  });

  test("returns true when current time is within a window", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(true);
  });

  test("returns false when current time is outside all windows", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 18, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(false);
  });

  test("returns false at the exact end time (exclusive)", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 17, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(false);
  });

  test("returns true at the exact start time (inclusive)", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 9, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(true);
  });

  test("overnight window includes time after midnight", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowAfterMidnight = makeDate(1, 2, 0);
    expect(checkWithinNotificationTimes(times, nowAfterMidnight)).toBe(true);
  });

  test("overnight window includes time before midnight", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowBeforeMidnight = makeDate(1, 23, 0);
    expect(checkWithinNotificationTimes(times, nowBeforeMidnight)).toBe(true);
  });

  test("overnight window excludes time in the middle of the day", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowMiddleOfDay = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, nowMiddleOfDay)).toBe(false);
  });

  test("returns true when no days are set (undefined) regardless of day", () => {
    const times = [makeTime("09:00", "17:00", undefined)];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("returns true when days array is empty regardless of day", () => {
    const times = [makeTime("09:00", "17:00", [])];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("returns true when current day matches a day-specific window", () => {
    const times = [makeTime("09:00", "17:00", [1, 2, 3, 4, 5])];
    const monday = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, monday)).toBe(true);
  });

  test("returns false when current day does not match a day-specific window", () => {
    const times = [makeTime("09:00", "17:00", [1, 2, 3, 4, 5])];
    const saturday = makeDate(6, 12, 0);
    expect(checkWithinNotificationTimes(times, saturday)).toBe(false);
  });

  test("all 7 days set behaves like every day", () => {
    const times = [makeTime("09:00", "17:00", [0, 1, 2, 3, 4, 5, 6])];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("day-agnostic and day-specific windows are independent (no precedence)", () => {
    const everyDay = makeTime("09:00", "17:00");
    const mondayOnly = makeTime("10:00", "12:00", [1]);
    const times = [everyDay, mondayOnly];

    // Monday 9:30 — everyDay matches even though mondayOnly does not cover 9:30
    const monday930 = makeDate(1, 9, 30);
    expect(checkWithinNotificationTimes(times, monday930)).toBe(true);
  });

  test("returns true if any of multiple windows matches", () => {
    const morningWindow = makeTime("08:00", "10:00");
    const eveningWindow = makeTime("18:00", "20:00");
    const times = [morningWindow, eveningWindow];

    expect(checkWithinNotificationTimes(times, makeDate(1, 9, 0))).toBe(true);
    expect(checkWithinNotificationTimes(times, makeDate(1, 14, 0))).toBe(false);
    expect(checkWithinNotificationTimes(times, makeDate(1, 19, 0))).toBe(true);
  });
});

describe("shouldPlayNewEmailSound", () => {
  function soundsFor(times: number[]) {
    let last: number | undefined;

    return times.map((now) => {
      const sounds = shouldPlayNewEmailSound(now, last);
      last = now;
      return sounds;
    });
  }

  test("the first notification plays a sound", () => {
    expect(shouldPlayNewEmailSound(1000)).toBe(true);
  });

  test("a notification within 5 seconds of the last is silent", () => {
    expect(soundsFor([1000, 1000, 1000, 5999])).toEqual([true, false, false, false]);
  });

  test("a chain 4 seconds apart stays silent after the first", () => {
    expect(soundsFor([0, 4000, 8000, 12000, 16000])).toEqual([true, false, false, false, false]);
  });

  test("a notification after 5 seconds of quiet plays a sound", () => {
    expect(soundsFor([0, 4000, 9000, 20000])).toEqual([true, false, true, true]);
  });
});

test("Saturday night continues into Sunday, and ends at the specified minute", () => {
  const times = [makeTime("22:30", "06:15", [6])];
  expect(checkWithinNotificationTimes(times, makeDate(6, 5, 0))).toBe(false);
  expect(checkWithinNotificationTimes(times, makeDate(6, 22, 30))).toBe(true);
  expect(checkWithinNotificationTimes(times, makeDate(0, 6, 14))).toBe(true);
  expect(checkWithinNotificationTimes(times, makeDate(0, 6, 15))).toBe(false);
});

test("overlap checks include only occupied weekdays and allow adjacent windows", () => {
  const saturdayNight = [makeTime("22:00", "06:00", [6])];
  expect(overlapsNotificationWindow(makeTime("05:00", "06:00", [0]), saturdayNight)).toBe(true);
  expect(overlapsNotificationWindow(makeTime("05:00", "06:00", [6]), saturdayNight)).toBe(false);
  expect(overlapsNotificationWindow(makeTime("06:00", "07:00", [0]), saturdayNight)).toBe(false);
});

test("new windows can use short gaps, the last hour, and a single free weekday", () => {
  expect(findNotificationWindow([makeTime("09:45", "09:30")])).toMatchObject({
    start: "09:30",
    end: "09:45",
  });
  expect(findNotificationWindow([makeTime("00:00", "23:00")])).toMatchObject({
    start: "23:00",
    end: "00:00",
  });
  expect(findNotificationWindow([makeTime("00:00", "24:00", [0, 1, 2, 3, 4, 5])])).toEqual({
    start: "00:00",
    end: "01:00",
    days: [6],
  });
  expect(findNotificationWindow([makeTime("12:00", "12:00")])).toBeUndefined();
});

test("legacy midnight, equal endpoints and incomplete times retain sensible boundaries", () => {
  expect(checkWithinNotificationTimes([makeTime("23:00", "24:00", [1])], makeDate(1, 23, 59))).toBe(
    true,
  );
  expect(checkWithinNotificationTimes([makeTime("12:00", "12:00", [1])], makeDate(1, 1, 0))).toBe(
    true,
  );
  expect(checkWithinNotificationTimes([makeTime("", "", [1])], makeDate(1, 1, 0))).toBe(false);
});
