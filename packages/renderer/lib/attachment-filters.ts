import {
  attachmentExtension,
  fileKind,
  foldAttachmentText,
  type AttachmentCategory,
  type FileKind,
  type MailAttachment,
} from "@ggmail/shared/attachments";

export type SizeBand = "small" | "medium" | "large";
export type AttachmentFilters = {
  accountIds: string[];
  kinds: FileKind[];
  categories: AttachmentCategory[];
  query: string;
  sender: string;
  extension: string | null;
  from: string;
  through: string;
  size: SizeBand | null;
};

export const emptyAttachmentFilters: AttachmentFilters = {
  accountIds: [],
  kinds: [],
  categories: [],
  query: "",
  sender: "",
  extension: null,
  from: "",
  through: "",
  size: null,
};

export function toggleValue<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

// Gmail's print view gives a rounded, localized size (for example "842K" or "2,4 Mo").
export function attachmentSizeBand(size: string): SizeBand | null {
  const match = /^([\d\s.,]+?)\s*([kmgt]?)(?:i?[bo]|bytes?|octets?)?$/i.exec(size.trim());
  if (!match) {
    return null;
  }
  const [, raw = "", prefix = ""] = match;
  let number = raw.replace(/\s/g, "");
  if (/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(number)) {
    number = number.replaceAll(",", "");
  } else if (/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(number)) {
    number = number.replaceAll(".", "");
  }
  const value = Number(number.replace(",", "."));
  if (!Number.isFinite(value)) {
    return null;
  }
  const unit = ["", "k", "m", "g", "t"].indexOf(prefix.toLowerCase());
  const megabytes = value * 1024 ** (unit - 2);
  return megabytes < 1 ? "small" : megabytes < 10 ? "medium" : "large";
}

const fold = (text: string) => foldAttachmentText(text).replace(/\s+/g, " ").trim();

function searchTerms(query: string) {
  return Array.from(
    fold(query)
      .replace(/[«»„“”]/g, '"')
      .matchAll(/"([^"]*)"?|([^\s"]+)/g),
    (match) => (match[1] ?? match[2] ?? "").trim(),
  ).filter(Boolean);
}

export function indexAttachment<T extends MailAttachment & { accountId: string }>(file: T) {
  const sender = fold(file.sender);
  return {
    file,
    sender,
    fields: [fold(file.name), fold(file.subject), sender],
    kind: fileKind(file.name),
    extension: attachmentExtension(file.name),
    categories: file.categoryOverride ?? file.detectedCategories,
    size: attachmentSizeBand(file.size),
  } as const;
}

// Use local calendar midnights. The exclusive next day also works through daylight-saving changes.
export function dateBoundary(day: string, nextDay = false) {
  const [year, month, dateOfMonth] = day.split("-").map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year ?? NaN, (month ?? NaN) - 1, (dateOfMonth ?? NaN) + Number(nextDay));
  return date;
}

export type FacetCounts<T> = { total: number; values: Map<T, number> };
function facet<T>(): FacetCounts<T> {
  return { total: 0, values: new Map() };
}
function count<T>(facet: FacetCounts<T>, ...values: T[]) {
  facet.total++;
  for (const value of values) {
    facet.values.set(value, (facet.values.get(value) ?? 0) + 1);
  }
}

export function filterAttachments<T extends MailAttachment & { accountId: string }>(
  index: ReturnType<typeof indexAttachment<T>>[],
  filters: AttachmentFilters,
) {
  const accounts = facet<string>();
  const kinds = facet<FileKind>();
  const categories = facet<AttachmentCategory>();
  const extensions = facet<string>();
  const sizes = facet<SizeBand | null>();
  const results: T[] = [];
  const terms = searchTerms(filters.query);
  const senderTerms = fold(filters.sender).split(" ").filter(Boolean);
  const from = filters.from ? +dateBoundary(filters.from) : -Infinity;
  const until = filters.through ? +dateBoundary(filters.through, true) : Infinity;

  for (const item of index) {
    if (
      item.file.receivedAt < from ||
      item.file.receivedAt >= until ||
      !senderTerms.every((term) => item.sender.includes(term)) ||
      !terms.every((term) => item.fields.some((field) => field.includes(term)))
    ) {
      continue;
    }
    const account = !filters.accountIds.length || filters.accountIds.includes(item.file.accountId);
    const kind = !filters.kinds.length || filters.kinds.includes(item.kind);
    const category =
      !filters.categories.length ||
      item.categories.some((label) => filters.categories.includes(label));
    const extension = filters.extension === null || filters.extension === item.extension;
    const size = filters.size === null || filters.size === item.size;
    // Each facet ignores only its own selection, so alternatives keep meaningful counts.
    const misses =
      Number(!account) + Number(!kind) + Number(!category) + Number(!extension) + Number(!size);
    if (!misses) {
      results.push(item.file);
    }
    if (misses > 1) {
      continue;
    }
    if (!misses || !account) {
      count(accounts, item.file.accountId);
    }
    if (!misses || !kind) {
      count(kinds, item.kind);
    }
    if (!misses || !category) {
      count(categories, ...item.categories);
    }
    if (!misses || !extension) {
      count(extensions, item.extension);
    }
    if (!misses || !size) {
      count(sizes, item.size);
    }
  }
  return { results, accounts, kinds, categories, extensions, sizes };
}
