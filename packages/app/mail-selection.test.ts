import { expect, test } from "bun:test";
import { selectionDates, selectionTask } from "./mail-selection";

const now = new Date("2026-11-22T12:00:00Z");
test("removes only an unambiguous trailing due phrase", () => {
  expect(selectionTask("Send the revised proposal by Friday", now, "Europe/Vienna")).toEqual({
    title: "Send the revised proposal",
    due: "2026-11-27",
  });
  expect(selectionTask("Work on the draft by Friday", now).title).toBe("Work on the draft");
  expect(selectionTask("Design a Friday logo", now).title).toBe("Design a Friday logo");
  expect(selectionTask("Call Pat", now)).toEqual({ title: "Call Pat", due: "" });
  expect(selectionTask("Send by Thursday or Friday", now).due).toBe("");
});
test("interprets Vienna wall time across daylight saving and preserves the offered alternatives", () => {
  const text = "Thursday, 14:00–14:30 or Friday, 11:00–12:00 Vienna time";
  expect(selectionDates(text, now, "America/Chicago").map((o) => [o.dates, o.zone])).toEqual([
    ["20261126T130000Z/20261126T133000Z", "Europe/Vienna"],
    ["20261127T100000Z/20261127T110000Z", "Europe/Vienna"],
  ]);
  expect(selectionDates(text, new Date("2026-06-01T10:00Z"), "UTC")[0]?.dates).toBe(
    "20260604T120000Z/20260604T123000Z",
  );
  expect(
    selectionDates(
      "Tomorrow, 10:00 Vienna time",
      new Date("2026-11-22T23:30Z"),
      "America/New_York",
    )[0]?.dates,
  ).toBe("20261124T090000Z/20261124T093000Z");
});
test("handles all-day dates, alternate times and nonexistent wall-clock times", () => {
  expect(selectionDates("December 31, 2026", now)[0]?.dates).toBe("20261231/20270101");
  expect(selectionDates("Thursday 14:00 or 16:00 Vienna time", now).map((o) => o.dates)).toEqual([
    "20261126T130000Z/20261126T133000Z",
    "20261126T150000Z/20261126T153000Z",
  ]);
  expect(selectionDates("March 28, 2027 02:30 Vienna time", now)).toEqual([]);
  expect(selectionDates("Review the document", now)).toEqual([]);
});

test("shared appointment times, midnight crossings and per-option timezones", () => {
  expect(
    selectionDates("Thursday or Friday at 14:00–14:30 Vienna time", now, "UTC").map((o) => o.dates),
  ).toEqual(["20261126T130000Z/20261126T133000Z", "20261127T130000Z/20261127T133000Z"]);
  expect(selectionDates("Friday 23:30–00:30 Vienna time", now, "UTC")[0]?.label).toContain("Sat");
  expect(
    selectionDates("Thursday, 14:00 Vienna time; Friday, 15:00 London time", now, "UTC").map(
      (o) => o.dates,
    ),
  ).toEqual(["20261126T130000Z/20261126T133000Z", "20261127T150000Z/20261127T153000Z"]);
  const late = new Date("2026-11-22T22:00Z");
  expect(selectionDates("Tomorrow at 00:30 UTC+09:00", late, "UTC")[0]).toMatchObject({
    dates: "20261123T153000Z/20261123T160000Z",
    zone: "Etc/GMT-9",
  });
  expect(selectionDates("03/04/2027 at noon", now, "UTC", "en-GB")[0]?.day).toBe("2027-04-03");
});
test("removes leading and zoned deadline phrases without guessing between alternatives", () => {
  expect(selectionTask("By Friday, send the revised proposal", now, "UTC")).toEqual({
    title: "send the revised proposal",
    due: "2026-11-27",
  });
  expect(selectionTask("Ship by Friday at 17:00 Vienna time.", now, "UTC")).toEqual({
    title: "Ship",
    due: "2026-11-27",
  });
  expect(selectionTask("Deliver on Friday", now, "UTC")).toEqual({
    title: "Deliver",
    due: "2026-11-27",
  });
  expect(selectionTask("Send by Thursday or by Friday", now, "UTC").due).toBe("");
});

test("offers both occurrences of a repeated hour, and keeps timezone labels distinguishable", () => {
  const options = selectionDates("October 31, 2027 02:15 Vienna time", now, "UTC");
  expect(options.map((o) => o.dates)).toEqual([
    "20271031T001500Z/20271031T004500Z",
    "20271031T011500Z/20271031T014500Z",
  ]);
  expect(options[0]?.display.zone).toBe("Europe/Vienna");
  expect(options[0]?.display.time).toContain("UTC+02:00");
  expect(options[1]?.display.time).toContain("UTC+01:00");
  expect(
    selectionDates("Thursday at 2 or 4 pm Vienna time", now, "UTC").map((o) => o.dates),
  ).toEqual(["20261126T130000Z/20261126T133000Z", "20261126T150000Z/20261126T153000Z"]);
  expect(selectionTask("Prepare the December budget", now, "UTC").due).toBe("");
  expect(selectionDates("next week", now, "UTC")).toEqual([]);
});
