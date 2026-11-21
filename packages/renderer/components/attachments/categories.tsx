import {
  attachmentCategories,
  normalizeAttachmentCategories,
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
import { useMemo, useState } from "react";
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
  onChange: (category: AttachmentCategory[] | null) => Promise<void>;
}) {
  const { t, i18n } = useLingui();
  const labels = useCategoryLabels();
  const [saving, setSaving] = useState(false);
  const formatter = useMemo(
    () => new Intl.ListFormat(i18n.locale, { type: "unit" }),
    [i18n.locale],
  );
  const formatLabels = (values: AttachmentCategory[]) =>
    formatter.format(values.map((value) => labels[value]));
  const detected = formatLabels(file.detectedCategories);
  const name = file.name;
  const categories = file.categoryOverride ?? file.detectedCategories;
  const label = formatLabels(categories);
  const [first] = categories;
  const Icon = first && categories.length === 1 ? categoryIcons[first] : TagIcon;
  const items = [
    { value: "auto" as const, label: t`Automatic (${detected})` },
    ...attachmentCategories.map((value) => ({ value, label: labels[value] })),
  ];
  return (
    <Select<AttachmentCategory | "auto", true>
      multiple
      items={items}
      value={file.categoryOverride ?? ["auto", ...categories]}
      onValueChange={async (choice) => {
        if (saving || (!file.categoryOverride && !choice.includes("auto"))) {
          return;
        }
        setSaving(true);
        try {
          if (file.categoryOverride && choice.includes("auto")) {
            await onChange(null);
          } else if (!categories.includes("uncategorized") && choice.includes("uncategorized")) {
            await onChange(["uncategorized"]);
          } else {
            await onChange(
              normalizeAttachmentCategories(choice.filter((value) => value !== "auto")),
            );
          }
        } catch {
          toast.error(t`Couldn’t save the category. Try again.`);
        } finally {
          setSaving(false);
        }
      }}
    >
      <SelectTrigger
        aria-label={t`Category for ${name}`}
        aria-description={label}
        title={label}
        className="attachment-category-picker"
        data-assigned={!categories.includes("uncategorized")}
        data-multiple={categories.length > 1}
        data-attachment-category={categories.join(" ")}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map(({ value, label }) => (
          <SelectItem key={value} value={value} disabled={saving}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
