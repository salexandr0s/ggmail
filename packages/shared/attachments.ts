export type MailAttachment = {
  id: string;
  name: string;
  subject: string;
  sender: string;
  receivedAt: number;
  size: string;
};

export type AttachmentBatch = {
  files: MailAttachment[];
  complete: boolean;
  partial: boolean;
};

export type AttachmentAction = "preview" | "message" | "download";

export function fileKind(filename: string) {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? "";
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
