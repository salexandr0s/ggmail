/* oxlint-disable lingui/no-unlocalized-strings -- Date grammar, ISO formats and timezone identifiers. */
import type { CalendarChoiceDisplay } from "@ggmail/shared/types";
import { Temporal } from "@js-temporal/polyfill";
import type { ParsedComponents } from "chrono-node";
import { GB, parse } from "chrono-node/en";

export type CalendarOption = {
  dates: string;
  zone?: string;
  label: string;
  day: string;
  display: CalendarChoiceDisplay;
};

const limit = 4000;
const cities = new Map<string, string>();
let zonePattern: RegExp | undefined;
function namedZones(input: string) {
  if (!zonePattern) {
    for (const id of Intl.supportedValuesOf("timeZone")) {
      cities.set(
        id
          .slice(id.lastIndexOf("/") + 1)
          .replaceAll("_", " ")
          .toLowerCase(),
        id,
      );
    }
    zonePattern = new RegExp(
      "\\b([A-Za-z_]+(?:/[A-Za-z_+0-9-]+){1,2})\\b|\\b(" +
        [...cities.keys()].sort((a, b) => b.length - a.length).join("|") +
        ")\\s+time\\b|\\b(?:UTC|GMT)(?:([+-])(\\d{1,2})(?::?(\\d{2}))?)?\\b",
      "gi",
    );
  }
  return [...input.matchAll(zonePattern)].flatMap((match) => {
    const [, iana, city, sign, hour, minute] = match;
    let zone = "UTC";
    if (iana) {
      try {
        zone = new Intl.DateTimeFormat("en", { timeZone: iana }).resolvedOptions().timeZone;
      } catch {
        return [];
      }
    } else if (city) {
      zone = cities.get(city.toLowerCase()) ?? zone;
    } else if (sign && hour) {
      if (+hour > 23 || +(minute ?? 0) > 59) {
        return [];
      }
      zone = sign + hour.padStart(2, "0") + ":" + (minute ?? "00");
    }
    return [{ start: match.index, end: match.index + match[0].length, zone }];
  });
}

const formats = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string | undefined, zone: string, clock: boolean) {
  const key = [locale, zone, clock].join("|");
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(
      locale,
      clock
        ? { timeZone: zone, hour: "2-digit", minute: "2-digit" }
        : { timeZone: zone, weekday: "short", month: "short", day: "numeric", year: "numeric" },
    );
    if (formats.size >= 32) {
      formats.clear();
    }
    formats.set(key, format);
  }
  return format;
}

function isoDay(parts: ParsedComponents) {
  return [
    String(parts.get("year")).padStart(4, "0"),
    String(parts.get("month")).padStart(2, "0"),
    String(parts.get("day")).padStart(2, "0"),
  ].join("-");
}
function hasDay(parts: ParsedComponents) {
  return parts.isCertain("day") || parts.isCertain("weekday") || parts.isCertain("month");
}
function clockValue(parts: ParsedComponents) {
  return {
    hour: parts.get("hour") ?? 0,
    minute: parts.get("minute") ?? 0,
    second: parts.get("second") ?? 0,
  };
}
function fixedZone(minutes: number) {
  return (
    (minutes < 0 ? "-" : "+") +
    String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0") +
    ":" +
    String(Math.abs(minutes) % 60).padStart(2, "0")
  );
}
type Slot = {
  startIndex: number;
  endIndex: number;
  day: string;
  endDay: string;
  zone: string;
  startTime?: ReturnType<typeof clockValue>;
  endTime?: ReturnType<typeof clockValue>;
  alternative: boolean;
  text: string;
};
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
function readDates(input: string, now: Date, fallbackZone: string, locale?: string) {
  const hits = namedZones(input);
  const uniqueZones = new Set(hits.map((h) => h.zone));
  const shared = uniqueZones.size === 1 ? hits[0]?.zone : undefined;
  const offsets = new Map<string, number>();
  const slots: Slot[] = [];
  let offset = 0;
  let alternative = false;
  // Keep the original offsets so task titles can retain every word outside the date phrase.
  const pieces = input.split(
    /(\bor\b|;|\n(?=\s*(?:[-*•]|mon|tue|wed|thu|fri|sat|sun))|,(?=\s*(?:mon|tue|wed|thu|fri|sat|sun)\w*\b))/gi,
  );
  const numericDate = /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/.test(input);
  const dayFirst =
    numericDate &&
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" })
      .formatToParts(now)
      .find((part) => part.type === "day" || part.type === "month")?.type === "day";
  const parser = dayFirst ? GB.parse.bind(GB) : parse;
  function parseInZone(text: string, timeZone: string) {
    let minutes = offsets.get(timeZone);
    if (minutes === undefined) {
      minutes =
        Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone)
          .offsetNanoseconds / 60e9;
      offsets.set(timeZone, minutes);
    }
    return parser(
      text.replace(/[–—]/g, "-"),
      { instant: now, timezone: minutes },
      { forwardDate: true },
    );
  }
  for (const [i, piece] of pieces.entries()) {
    const begin = offset;
    offset += piece.length;
    if (i % 2) {
      alternative = piece.toLowerCase() === "or";
      continue;
    }
    if (!piece.trim()) {
      continue;
    }
    const tokens = hits.filter((h) => h.start >= begin && h.end <= offset);
    const zone = tokens[0]?.zone ?? shared ?? fallbackZone;
    const masked = tokens.reduceRight(
      (s, h) => s.slice(0, h.start - begin) + " ".repeat(h.end - h.start) + s.slice(h.end - begin),
      piece,
    );
    const parsed = parseInZone(masked, zone);
    for (const result of parsed) {
      const parsedEnd = begin + result.index + result.text.trimEnd().length;
      const suffixZone = tokens.find(
        (h) => h.start >= parsedEnd && !input.slice(parsedEnd, h.start).trim(),
      );
      const resultZone = suffixZone?.zone ?? zone;
      // Two suggestions separated by prose can have different wall dates at the same instant.
      const { start, end } =
        resultZone === zone ? result : (parseInZone(result.text, resultZone)[0] ?? result);
      // A month or week on its own doesn't identify a day for a task or an event.
      if (
        (start.isCertain("month") && !start.isCertain("day") && !start.isCertain("weekday")) ||
        /^(?:this|next|last)\s+week\b(?!.*\b(?:mon|tue|wed|thu|fri|sat|sun))/i.test(result.text)
      ) {
        continue;
      }
      const previous = alternative ? slots.at(-1) : undefined;
      const day = previous && !hasDay(start) ? previous.day : isoDay(start);
      const explicit = start.get("timezoneOffset");
      slots.push({
        startIndex: begin + result.index,
        endIndex: suffixZone?.end ?? parsedEnd,
        day,
        endDay: end && (hasDay(start) || hasDay(end)) ? isoDay(end) : day,
        startTime: start.isCertain("hour") ? clockValue(start) : undefined,
        endTime: end?.isCertain("hour") ? clockValue(end) : undefined,
        zone:
          start.isCertain("timezoneOffset") && explicit !== null ? fixedZone(explicit) : resultZone,
        alternative,
        text: masked,
      });
      alternative = false;
    }
  }
  return slots;
}

function calendarZone(zone: string) {
  const fixed = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (!fixed) {
    return zone;
  }
  const hours = Number(fixed[2]);
  if (fixed[3] !== "00" || hours > 14) {
    return undefined;
  }
  if (!hours) {
    return "UTC";
  }
  return "Etc/GMT" + (fixed[1] === "+" ? "-" : "+") + hours;
}
function wallTimes(day: Temporal.PlainDate, time: ReturnType<typeof clockValue>, zone: string) {
  const local = day.toPlainDateTime(time);
  try {
    return [local.toZonedDateTime(zone, { disambiguation: "reject" })];
  } catch {
    // A repeated hour has two valid instants. A skipped hour has none.
    return (["earlier", "later"] as const)
      .map((disambiguation) => local.toZonedDateTime(zone, { disambiguation }))
      .filter((value) => value.toPlainDateTime().equals(local));
  }
}
function formatSlot(slot: Slot, locale?: string): CalendarOption[] {
  const day = Temporal.PlainDate.from(slot.day);
  let endDay = Temporal.PlainDate.from(slot.endDay);
  const dayLabel = (date: Temporal.PlainDate) =>
    formatter(locale, "UTC", false).format(new Date(date.toString() + "T12:00Z"));
  if (!slot.startTime) {
    const date = dayLabel(day) + (day.equals(endDay) ? "" : " – " + dayLabel(endDay));
    return [
      {
        day: slot.day,
        dates:
          slot.day.replaceAll("-", "") +
          "/" +
          endDay.add({ days: 1 }).toString().replaceAll("-", ""),
        label: date,
        display: { date },
      },
    ];
  }
  if (
    slot.endTime &&
    day.equals(endDay) &&
    Temporal.PlainTime.compare(slot.endTime, slot.startTime) < 0
  ) {
    endDay = endDay.add({ days: 1 });
  }
  const starts = wallTimes(day, slot.startTime, slot.zone);
  const ends = slot.endTime ? wallTimes(endDay, slot.endTime, slot.zone) : undefined;
  const ambiguous = starts.length > 1 || (ends?.length ?? 0) > 1;
  const fmt = formatter(locale, slot.zone, true);
  const time = (value: Temporal.ZonedDateTime) =>
    fmt.format(value.epochMilliseconds) + (ambiguous ? " UTC" + value.offset : "");
  const wire = (value: Temporal.ZonedDateTime) =>
    value.toInstant().toString({ smallestUnit: "second" }).replace(/[-:]/g, "");
  const options: CalendarOption[] = [];
  for (const start of starts) {
    for (const end of ends ?? [start.add({ minutes: 30 })]) {
      if (end.epochMilliseconds <= start.epochMilliseconds) {
        continue;
      }
      const last = end.toPlainDate();
      const date = dayLabel(day);
      const range = time(start) + "–" + (day.equals(last) ? "" : dayLabel(last) + " ") + time(end);
      options.push({
        day: slot.day,
        dates: wire(start) + "/" + wire(end),
        zone: calendarZone(slot.zone),
        label: [date, range, slot.zone].join(" · "),
        display: { date, time: range, zone: slot.zone },
      });
    }
  }
  return options;
}

export function selectionDates(text: string, now = new Date(), zone?: string, locale?: string) {
  if (!text.trim()) {
    return [];
  }
  // “2 or 4 pm” shares a meridiem. Keep explicit 24-hour times untouched.
  const input = text
    .slice(0, limit)
    .replace(
      /(?<![:.\d])\b(1[0-2]|[1-9])(\s+or\s+(1[0-2]|[1-9])\s*([ap]\.?m))\b/gi,
      (original, first: string, rest: string, second: string, meridiem: string) =>
        Number(first) % 12 <= Number(second) % 12 ? first + " " + meridiem + rest : original,
    );
  const slots = readDates(input, now, zone ?? localZone(), locale);
  // In “Thursday or Friday at 2”, the trailing time applies to both days.
  for (let i = slots.length - 2; i >= 0; i--) {
    const slot = slots[i],
      next = slots[i + 1];
    if (
      slot &&
      next?.alternative &&
      !slot.startTime &&
      next.startTime &&
      slot.day === slot.endDay &&
      next.day === next.endDay &&
      !/\ball[ -]day\b/i.test(slot.text)
    ) {
      slot.startTime = next.startTime;
      slot.endTime = next.endTime;
    }
  }
  const options = new Map<string, CalendarOption>();
  for (const slot of slots) {
    for (const option of formatSlot(slot, locale)) {
      options.set(option.dates + "|" + (option.zone ?? ""), option);
    }
  }
  return [...options.values()];
}

export function selectionTask(text: string, now = new Date(), zone?: string, locale?: string) {
  const input = text.trim().slice(0, limit);
  const slots = readDates(input, now, zone ?? localZone(), locale);
  let title = input;
  let due = slots.length === 1 && slots[0]?.day === slots[0]?.endDay ? (slots[0]?.day ?? "") : "";
  for (const slot of slots) {
    const prefix = input.slice(0, slot.startIndex),
      suffix = input.slice(slot.endIndex);
    const consumedOn = /^on\s/i.test(input.slice(slot.startIndex, slot.endIndex)) && prefix.trim();
    const trailing = /\s+(?:by|due(?:\s+on)?|on)\s*$/i.exec(prefix);
    if ((trailing || consumedOn) && /^[.!\s]*$/.test(suffix) && !slot.alternative) {
      title = (trailing ? prefix.slice(0, trailing.index) : prefix).trimEnd();
      due = slot.endDay;
      break;
    }
    if (
      /^\s*(?:by|due(?:\s+on)?)\s*$/i.test(prefix) &&
      (/^\s*[,;:–—-]/.test(suffix) || /[,;:]\s*$/.test(input.slice(0, slot.endIndex)))
    ) {
      const rest = suffix.replace(/^[\s,;:–—-]+/, "");
      if (rest) {
        title = rest;
        due = slot.endDay;
        break;
      }
    }
  }
  return { title: title.replace(/\s+/g, " ").slice(0, 1024), due };
}
