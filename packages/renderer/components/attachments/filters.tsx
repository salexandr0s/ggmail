import {
  attachmentCategories,
  type AttachmentCategory,
  type FileKind,
} from "@ggmail/shared/attachments";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@ggmail/ui/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ggmail/ui/components/popover";
import { Plural, useLingui } from "@lingui/react/macro";
import { CheckIcon, FilesIcon, LayersIcon, SlidersHorizontalIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
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
  const groupId = useId();
  return (
    <div role="group" aria-label={t`File type`} className="attachment-formats">
      {kinds.map(({ value, label }) => {
        const pressed = value === "all" ? !selected.length : selected.includes(value);
        const Icon = pressed ? CheckIcon : value === "all" ? FilesIcon : kindIcons[value];
        const countId = groupId + value;
        return (
          <button
            type="button"
            key={value}
            className="attachment-format"
            data-file-kind={value}
            aria-label={label}
            aria-describedby={countId}
            aria-pressed={pressed}
            title={label}
            onClick={() => onKind(value)}
          >
            <Icon aria-hidden="true" />
            <span className="attachment-format-name">{label}</span>
            <span className="attachment-format-count" id={countId}>
              {value === "all" ? counts.total : (counts.values.get(value) ?? 0)}
            </span>
          </button>
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
        <h2 className="mail-nav-heading">{t`Category`}</h2>
        <FilterButton
          label={t`All categories`}
          active={!categories.length}
          icon={<LayersIcon />}
          count={categoryCounts.total}
          onClick={() => onCategory("all")}
        />
        {attachmentCategories.map((value) => {
          const selected = categories.includes(value);
          const Icon = categoryIcons[value];
          return (
            <FilterButton
              key={value}
              label={categoryLabels[value]}
              active={selected}
              icon={<Icon />}
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
  sheet = false,
  children,
}: {
  title: string;
  applied: number;
  count: number;
  onClear?: () => void;
  sheet?: boolean;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const trigger = (
    <Button variant={applied ? "secondary" : "outline"} size="sm" aria-label={title}>
      <SlidersHorizontalIcon />
      <span>{title}</span>
      {applied > 0 && <span className="tabular-nums">{applied}</span>}
    </Button>
  );
  const Title = sheet ? DialogTitle : PopoverTitle;
  const content = (
    <>
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 border-b px-4 py-3">
        <Title>{title}</Title>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-muted-foreground tabular-nums"
        >
          <Plural value={count} one="# file" other="# files" />
        </span>
      </header>
      <div className="attachment-filter-scroll">{children}</div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!onClear}
          onClick={onClear}
        >{t`Clear filters`}</Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>{t`Done`}</Button>
      </footer>
    </>
  );
  if (sheet) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={trigger} />
        <DialogContent showCloseButton={false} className="attachment-filter-sheet">
          {content}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="attachment-filter-popover">
        {content}
      </PopoverContent>
    </Popover>
  );
}
