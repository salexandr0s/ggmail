import {
  attachmentCategories,
  type AttachmentCategory,
  type MailAttachment,
} from "@ggmail/shared/attachments";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@ggmail/ui/components/select";
import { useLingui } from "@lingui/react/macro";
import {
  BanknoteIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  FileSignatureIcon,
  LandmarkIcon,
  PackageIcon,
  ReceiptTextIcon,
  TagIcon,
  TicketIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const categoryIcons = {
  invoice: BanknoteIcon,
  receipt: ReceiptTextIcon,
  contract: FileSignatureIcon,
  ticket: TicketIcon,
  booking: CalendarCheckIcon,
  statement: LandmarkIcon,
  order: PackageIcon,
  quote: ClipboardListIcon,
  uncategorized: TagIcon,
} satisfies Record<AttachmentCategory, typeof TagIcon>;

export function useCategoryLabels(): Record<AttachmentCategory, string> {
  const { t } = useLingui();
  return {
    invoice: t`Invoice`,
    receipt: t`Receipt`,
    contract: t`Contract`,
    ticket: t`Ticket`,
    booking: t`Reservation`,
    statement: t`Bank statement`,
    order: t`Order`,
    quote: t`Price quote`,
    uncategorized: t`Uncategorized`,
  };
}

export function CategoryPicker({
  file,
  onChange,
}: {
  file: MailAttachment;
  onChange: (category: AttachmentCategory | null) => Promise<void>;
}) {
  const { t } = useLingui();
  const labels = useCategoryLabels();
  const [saving, setSaving] = useState(false);
  const detected = labels[file.detectedCategory];
  const name = file.name;
  const category = file.categoryOverride ?? file.detectedCategory;
  const Icon = categoryIcons[category];
  const items = [
    { value: "auto" as const, label: t`Automatic (${detected})` },
    ...attachmentCategories.map((value) => ({ value, label: labels[value] })),
  ];
  return (
    <Select<AttachmentCategory | "auto">
      items={items}
      value={file.categoryOverride ?? "auto"}
      disabled={saving}
      onValueChange={async (choice) => {
        if (!choice) {
          return;
        }
        setSaving(true);
        try {
          await onChange(choice === "auto" ? null : choice);
        } catch {
          toast.error(t`Couldn’t save the category. Try again.`);
        } finally {
          setSaving(false);
        }
      }}
    >
      <SelectTrigger
        aria-label={t`Category for ${name}`}
        title={t`Category for ${name}`}
        className="attachment-category-picker"
        data-assigned={category !== "uncategorized"}
        data-attachment-category={category}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        <SelectValue>{labels[category]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
