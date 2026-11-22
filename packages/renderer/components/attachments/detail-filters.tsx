import { Checkbox } from "@ggmail/ui/components/checkbox";
import { Input } from "@ggmail/ui/components/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@ggmail/ui/components/select";
import { useLingui } from "@lingui/react/macro";
import { useId } from "react";
import {
  dateBoundary,
  type AttachmentFilters,
  type FacetCounts,
  type SizeBand,
} from "@/lib/attachment-filters";

export function useSizeLabels(): Record<SizeBand, string> {
  const { t, i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, { style: "unit", unit: "megabyte" });
  const small = format.format(1);
  const large = format.format(10);
  return {
    small: t`Under ${small}`,
    medium: t`${small} to under ${large}`,
    large: t`${large} or more`,
  };
}

export function DetailFilters({
  filters,
  onChange,
  extensionCounts,
  sizeCounts,
  sizeLabels,
}: {
  filters: AttachmentFilters;
  onChange: (change: Partial<AttachmentFilters>) => void;
  extensionCounts: FacetCounts<string>;
  sizeCounts: FacetCounts<SizeBand | null>;
  sizeLabels: Record<SizeBand, string>;
}) {
  const { t } = useLingui();
  const dateError = useId();
  const extensionLabel = useId();
  const sizeLabel = useId();
  const embeddedLabel = useId();
  const extensions = new Set(extensionCounts.values.keys());
  if (filters.extension !== null) {
    extensions.add(filters.extension);
  }
  const extensionOptions = [
    { value: "*", label: `${t`Any extension`} (${extensionCounts.total})` },
    ...[...extensions].sort().map((extension) => ({
      value: extension,
      label: `${extension ? "." + extension : t`No extension`} (${extensionCounts.values.get(extension) ?? 0})`,
    })),
  ];
  const sizeOptions = [
    { value: "any" as const, label: `${t`Any size`} (${sizeCounts.total})` },
    ...(["small", "medium", "large"] as const).map((band) => ({
      value: band,
      label: `${sizeLabels[band]} (${sizeCounts.values.get(band) ?? 0})`,
    })),
  ];
  const invalidRange = !!(
    filters.from &&
    filters.through &&
    +dateBoundary(filters.from) > +dateBoundary(filters.through)
  );
  return (
    <div className="attachment-detail-filters">
      <label>
        <span>{t`Sender`}</span>
        <Input
          type="text"
          placeholder={t`Name or email address`}
          value={filters.sender}
          onChange={(e) => onChange({ sender: e.target.value })}
        />
      </label>
      <div className="attachment-filter-field">
        <label htmlFor={extensionLabel}>{t`File extension`}</label>
        <Select
          items={extensionOptions}
          value={filters.extension ?? "*"}
          onValueChange={(value) => {
            if (value !== null) {
              onChange({ extension: value === "*" ? null : value });
            }
          }}
        >
          <SelectTrigger id={extensionLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {extensionOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="attachment-date-range">
        <label>
          <span>{t`Received from`}</span>
          <Input
            type="date"
            value={filters.from}
            max={filters.through || undefined}
            aria-invalid={invalidRange}
            aria-describedby={invalidRange ? dateError : undefined}
            onChange={(e) => onChange({ from: e.target.value })}
          />
        </label>
        <label>
          <span>{t`Received through`}</span>
          <Input
            type="date"
            value={filters.through}
            min={filters.from || undefined}
            aria-invalid={invalidRange}
            aria-describedby={invalidRange ? dateError : undefined}
            onChange={(e) => onChange({ through: e.target.value })}
          />
        </label>
      </div>
      {invalidRange && (
        <p
          role="alert"
          id={dateError}
          className="text-xs text-destructive"
        >{t`The end date must be on or after the start date.`}</p>
      )}
      <div className="attachment-filter-field">
        <label htmlFor={sizeLabel}>{t`Size`}</label>
        <Select<SizeBand | "any">
          items={sizeOptions}
          value={filters.size ?? "any"}
          onValueChange={(value) => {
            if (value !== null) {
              onChange({ size: value === "any" ? null : value });
            }
          }}
        >
          <SelectTrigger id={sizeLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizeOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={embeddedLabel}
          checked={filters.includeEmbeddedImages}
          onCheckedChange={(checked) => onChange({ includeEmbeddedImages: checked })}
        />
        <label htmlFor={embeddedLabel}>{t`Include embedded images`}</label>
      </div>
    </div>
  );
}
