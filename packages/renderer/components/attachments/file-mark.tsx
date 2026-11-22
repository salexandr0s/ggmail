import { attachmentExtension, fileKind } from "@ggmail/shared/attachments";
import { cn } from "@ggmail/ui/lib/utils";
import { ProductIcon, type ProductIconProps } from "../product-icon";

function PdfIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <path
        d="M6.1 19c3.2-3.8 6.6-10.4 6.3-14.1-.2-2.6-2.5-2.5-2.4.1.2 4.9 4.4 10.3 8.3 11.3 2.8.7 3.4-1.6.9-2.2-4.1-1-12.5 1.5-14.9 4.3-1.7 2 .1 2.8 1.8.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ProductIcon>
  );
}
function DocumentIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </ProductIcon>
  );
}
function SpreadsheetIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <rect x="2.5" y="3.5" width="19" height="17" rx="2" stroke="currentColor" strokeWidth="2.2" />
      <path d="M3 10h18M10 10v10" stroke="currentColor" strokeWidth="2.2" />
    </ProductIcon>
  );
}
function ImageFileIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <rect
        x="2.5"
        y="3.5"
        width="19"
        height="17"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <circle cx="8" cy="8.6" r="1.8" fill="currentColor" />
      <path d="m3.3 17 4.3-4.4L11 16l5.3-6.2 4.8 5.4v3.2l-1.3 1.7H4.4Z" fill="currentColor" />
    </ProductIcon>
  );
}
function GenericFileIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <path
        d="M5 3.3c0-.8.6-1.5 1.5-1.5h7.3l5.2 5.3v13.5c0 .9-.6 1.6-1.5 1.6h-11c-.9 0-1.5-.7-1.5-1.6ZM13.6 2.2v5.3h5.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </ProductIcon>
  );
}

export const kindIcons = {
  pdf: PdfIcon,
  document: DocumentIcon,
  sheet: SpreadsheetIcon,
  image: ImageFileIcon,
  other: GenericFileIcon,
};

export function FileMark({ name, large = false }: { name: string; large?: boolean }) {
  const kind = fileKind(name);
  const Icon = kindIcons[kind];
  const suffix = attachmentExtension(name);
  const extension = suffix.length <= 6 ? suffix.toUpperCase() : "";
  return (
    <span
      className={cn("attachment-mark", large && "attachment-mark-large")}
      data-file-kind={kind}
      aria-hidden="true"
    >
      <span className="attachment-paper">
        <Icon />
        {extension && (
          <span className="attachment-extension" data-long={extension.length > 4 || undefined}>
            {extension}
          </span>
        )}
      </span>
    </span>
  );
}
