export const attachmentCategories = [
  "invoice",
  "receipt",
  "contract",
  "ticket",
  "booking",
  "statement",
  "order",
  "quote",
  "uncategorized",
] as const;

export type AttachmentCategory = (typeof attachmentCategories)[number];

export function isAttachmentCategory(value: unknown): value is AttachmentCategory {
  return attachmentCategories.some((category) => category === value);
}

export function normalizeAttachmentCategories(
  values: readonly AttachmentCategory[],
): AttachmentCategory[] {
  const selected = attachmentCategories.filter(
    (value) => value !== "uncategorized" && values.includes(value),
  );
  return selected.length ? selected : ["uncategorized"];
}

export function isCategorySelection(value: unknown): value is AttachmentCategory[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= attachmentCategories.length &&
    value.every(isAttachmentCategory) &&
    new Set(value).size === value.length &&
    (value.length === 1 || !value.includes("uncategorized"))
  );
}

export type MailAttachment = {
  id: string;
  /** Changes when discovery replaces this part during the current visit. */
  previewRevision?: number;
  name: string;
  /** Set for images once their message has been checked for embedded graphics. */
  isEmbeddedImage?: boolean;
  subject: string;
  detectedCategories: AttachmentCategory[];
  categoryOverride?: AttachmentCategory[];
  sender: string;
  senderPhotoUrl?: string;
  receivedAt: number;
  size: string;
};

export type AttachmentBatch = {
  mailboxKey: string;
  files: MailAttachment[];
  removedIds?: string[];
  status: "loading" | "ready" | "incomplete";
};

export type AttachmentAction = "message" | "download";

export type AttachmentPreview = {
  mime: string;
  bytes: ArrayBuffer;
};

export function foldAttachmentText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("ς", "σ")
    .replaceAll("ß", "ss");
}

export function attachmentExtension(filename: string) {
  const name = filename.trim();
  const dot = name.lastIndexOf(".");
  const suffix = dot > 0 ? name.slice(dot + 1) : "";
  return /^[\p{L}\p{N}][\p{L}\p{N}_+-]*$/u.test(suffix) ? suffix.toLowerCase() : "";
}

export function fileKind(filename: string) {
  const ext = attachmentExtension(filename);
  if (/^(png|jpe?g|gif|webp|avif|heic|heif|tiff?|bmp|svg)$/.test(ext)) {
    return "image";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  if (/^(xlsx?|xlsm|csv|tsv|ods|numbers)$/.test(ext)) {
    return "sheet";
  }
  if (/^(docx?|odt|rtf|txt|md|pages|pptx?|odp|key)$/.test(ext)) {
    return "document";
  }
  return "other";
}

export type FileKind = ReturnType<typeof fileKind>;
