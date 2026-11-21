import { attachmentExtension, fileKind } from "@ggmail/shared/attachments";
import { cn } from "@ggmail/ui/lib/utils";
import { FileIcon, FileTextIcon, ImageIcon, SheetIcon, TextIcon } from "lucide-react";

export const kindIcons = {
  pdf: FileTextIcon,
  document: TextIcon,
  sheet: SheetIcon,
  image: ImageIcon,
  other: FileIcon,
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
        {(large || !extension) && <Icon strokeWidth={1.6} />}
        {extension && (
          <span className="attachment-extension" data-long={extension.length > 4 || undefined}>
            {extension}
          </span>
        )}
      </span>
    </span>
  );
}
