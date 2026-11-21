import {
  attachmentCategories,
  type AttachmentCategory,
  type FileKind,
} from "@ggmail/shared/attachments";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ggmail/ui/components/popover";
import { Plural, useLingui } from "@lingui/react/macro";
import { CheckIcon, FilesIcon, LayersIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AccountFilters, FilterButton } from "@/components/account-filters";
import type { FacetCounts } from "@/lib/attachment-filters";
import { categoryIcons } from "./categories";
import { kindIcons } from "./file-mark";

export type KindFilter = FileKind | "all";
export type KindOption = { value: KindFilter; label: string };

export function FormatFilters({
  kinds,
  selected,
  counts,
  onKind,
}: {
  kinds: KindOption[];
  selected: FileKind[];
  counts: FacetCounts<FileKind>;
  onKind: (value: KindFilter) => void;
}) {
  const { t } = useLingui();
  return (
    <div role="group" aria-label={t`File type`} className="attachment-formats">
      {kinds.map(({ value, label }) => {
        const Icon = value === "all" ? FilesIcon : kindIcons[value];
        return (
          <FilterButton
            key={value}
            label={label}
            active={value === "all" ? !selected.length : selected.includes(value)}
            icon={<Icon />}
            count={value === "all" ? counts.total : (counts.values.get(value) ?? 0)}
            onClick={() => onKind(value)}
          />
        );
      })}
    </div>
  );
}

export function LibraryFilters({
  categories,
  categoryLabels,
  categoryCounts,
  onCategory,
  accounts,
  chosen,
  accountCounts,
  onAccount,
}: {
  categories: AttachmentCategory[];
  categoryLabels: Record<AttachmentCategory, string>;
  categoryCounts: FacetCounts<AttachmentCategory>;
  onCategory: (value: AttachmentCategory | "all") => void;
  accounts: AccountConfig[];
  chosen: string[];
  accountCounts: FacetCounts<string>;
  onAccount: (id: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="attachment-facets">
      <div role="group" aria-label={t`Category`}>
        <h2>{t`Category`}</h2>
        <FilterButton
          label={t`All categories`}
          active={!categories.length}
          icon={<LayersIcon />}
          count={categoryCounts.total}
          onClick={() => onCategory("all")}
        />
        {attachmentCategories.map((value) => {
          const selected = categories.includes(value);
          const Icon = selected ? CheckIcon : categoryIcons[value];
          return (
            <FilterButton
              key={value}
              label={categoryLabels[value]}
              active={selected}
              icon={<Icon data-attachment-category={value} />}
              count={categoryCounts.values.get(value) ?? 0}
              onClick={() => onCategory(value)}
            />
          );
        })}
      </div>
      {accounts.length > 1 && (
        <AccountFilters
          label={t`Filter by account`}
          accounts={accounts}
          chosen={chosen}
          counts={accountCounts}
          onAccount={onAccount}
        />
      )}
    </div>
  );
}

export function FilterMenu({
  title,
  applied,
  count,
  onClear,
  children,
}: {
  title: string;
  applied: number;
  count: number;
  onClear?: () => void;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant={applied ? "secondary" : "outline"} size="sm" aria-label={title} />}
      >
        <SlidersHorizontalIcon />
        <span>{title}</span>
        {applied > 0 && <span className="tabular-nums">{applied}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="attachment-filter-popover">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b px-3 py-2">
          <div>
            <PopoverTitle>{title}</PopoverTitle>
            <span className="text-xs text-muted-foreground tabular-nums">
              <Plural value={count} one="# file" other="# files" />
            </span>
          </div>
        </div>
        <div className="attachment-filter-scroll">{children}</div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!onClear}
            onClick={onClear}
          >{t`Clear filters`}</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>{t`Done`}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
