import { describe, expect, test } from "bun:test";
import type { MailAttachment } from "@ggmail/shared/attachments";
import {
  attachmentSizeBand,
  dateBoundary,
  emptyAttachmentFilters,
  filterAttachments,
  indexAttachment,
  type AttachmentFilters,
} from "./attachment-filters";

function file(name: string, account: string, properties: Partial<MailAttachment> = {}) {
  return indexAttachment({
    id: name,
    name,
    account: { id: account },
    receivedAt: +new Date(2026, 2, 29, 12),
    sender: "Inès Weiß <πληροφορίες@example.test>",
    subject: "March studio work",
    detectedCategories: ["invoice"],
    size: "1,2 Mo",
    ...properties,
  });
}
const index = [
  file("Τιμολόγιο_Μαρτίου.PDF", "work"),
  file("Draft.tsv", "team", { categoryOverride: ["quote"], size: "17K" }),
  file("Notes", "personal", { detectedCategories: ["uncategorized"], size: "" }),
  file("Old.pdf", "work", {
    detectedCategories: ["receipt"],
    receivedAt: +new Date(2026, 2, 28, 23, 59),
  }),
  file("April.pdf", "team", { receivedAt: +new Date(2026, 2, 30) }),
];
const match = (filters: Partial<AttachmentFilters>) =>
  filterAttachments(index, { ...emptyAttachmentFilters, ...filters });

describe("attachment filters", () => {
  test("words span metadata fields in any order, and quoted phrases stay together", () => {
    expect(match({ query: " WEISS μαρτιου studio " }).results).toHaveLength(1);
    expect(match({ query: "«March studio» τιμολογιο" }).results).toHaveLength(1);
    expect(match({ query: '"studio March"' }).results).toHaveLength(0);
    expect(match({ sender: "ΠΛΗΡΟΦΟΡΙΕΣ ines", query: "draft" }).results).toHaveLength(1);
    expect(match({ sender: "studio", query: "draft" }).results).toHaveLength(0);
  });

  test("combines account, format and category unions with an inclusive local date range", () => {
    const state: Partial<AttachmentFilters> = {
      accountIds: ["work", "team"],
      kinds: ["pdf", "sheet"],
      categories: ["invoice", "quote"],
      from: "2026-03-29",
      through: "2026-03-29",
    };
    const filtered = match(state);
    expect(filtered.results.map((f) => f.name)).toEqual(["Τιμολόγιο_Μαρτίου.PDF", "Draft.tsv"]);
    expect(filtered.accounts.total).toBe(2);
    expect(filtered.categories.values.get("quote")).toBe(1);
    const narrowed = match({ ...state, size: "small", extension: "pdf" });
    expect(narrowed.results).toBeEmpty();
    expect(narrowed.extensions.values.get("tsv")).toBe(1);
    expect(narrowed.sizes.values.get("medium")).toBe(1);
    expect(narrowed.kinds.total).toBe(0);
    expect(match({ extension: "" }).results.map((f) => f.name)).toEqual(["Notes"]);
    expect(match({ from: "2026-03-30", through: "2026-03-29" }).results).toBeEmpty();
  });

  test("midnight and the last millisecond of a local day have unambiguous boundaries", () => {
    for (const [month, day, iso] of [
      [2, 29, "2026-03-29"],
      [9, 25, "2026-10-25"],
    ] as const) {
      const start = +new Date(2026, month, day);
      const end = +new Date(2026, month, day + 1);
      expect(+dateBoundary(iso)).toBe(start);
      expect(+dateBoundary(iso, true)).toBe(end);
      const dates = [start - 1, start, end - 1, end].map((value) =>
        file(String(value), "work", { receivedAt: value }),
      );
      expect(
        filterAttachments(dates, {
          ...emptyAttachmentFilters,
          from: iso,
          through: iso,
        }).results.map((f) => f.receivedAt),
      ).toEqual([start, end - 1]);
    }
  });

  test("uses Gmail's displayed sizes, including shorthand, localized decimals and missing values", () => {
    for (const size of ["0 bytes", "840K", "1 024 octets", "0,9 Mo", "0,999 Mo", "1023 KiB"]) {
      expect(attachmentSizeBand(size)).toBe("small");
    }
    for (const size of [
      "1M",
      "1.2 MB",
      "2,4 Mo",
      "1,024 KB",
      "1.024,5 KB",
      "1,024.5 KB",
      "9,9 MiB",
    ]) {
      expect(attachmentSizeBand(size)).toBe("medium");
    }
    for (const size of ["10 MB", "1 GB", "20M"]) {
      expect(attachmentSizeBand(size)).toBe("large");
    }
    for (const size of ["", "unknown", "2 KB extra", "-5 MB"]) {
      expect(attachmentSizeBand(size)).toBeNull();
    }
    expect(match({}).sizes.total).toBe(5);
    expect(match({ size: "small" }).results.map((f) => f.name)).toEqual(["Draft.tsv"]);
  });
});

test("counts a dual-purpose file once in the results and in each of its category buckets", () => {
  const files = [
    file("Booking eTicket.pdf", "work", { detectedCategories: ["ticket", "booking"] }),
    file("Reservation.pdf", "work", { detectedCategories: ["booking"] }),
  ];
  for (const [categories, count] of [
    [["ticket"], 1],
    [["booking"], 2],
    [["ticket", "booking"], 2],
  ] as const) {
    const result = filterAttachments(files, {
      ...emptyAttachmentFilters,
      categories: [...categories],
    });
    expect(result.results).toHaveLength(count);
    expect(result.categories.total).toBe(2);
    expect(result.categories.values.get("ticket")).toBe(1);
    expect(result.categories.values.get("booking")).toBe(2);
  }
});
