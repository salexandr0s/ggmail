import type { AssistantEffort, AssistantModel } from "@ggmail/shared/assistant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { useLingui } from "@lingui/react/macro";
import { GaugeIcon } from "lucide-react";

export function EffortPicker({
  model,
  effort,
  chooseEffort,
  compact,
  disabled,
  id,
}: {
  model: AssistantModel;
  effort?: AssistantEffort;
  chooseEffort: (level?: AssistantEffort) => void;
  compact?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useLingui();
  if (!model.efforts?.length) {
    return null;
  }
  const labels: Record<AssistantEffort | "default", string> = {
    default: t`Default`,
    none: t`None`,
    minimal: t`Minimal`,
    low: t`Low`,
    medium: t`Medium`,
    high: t`High`,
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Provider effort name.
    xhigh: "XHigh",
    max: t`Max`,
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Provider effort name.
    ultra: "Ultra",
  };
  const value = effort ?? "default";
  const choices = (["default", ...model.efforts] as const).map((level) => ({
    value: level,
    label: labels[level],
  }));
  return (
    <Select<AssistantEffort | "default">
      items={choices}
      value={value}
      disabled={disabled}
      onValueChange={(level) => {
        if (level) {
          chooseEffort(level === "default" ? undefined : level);
        }
      }}
    >
      <SelectTrigger
        id={id}
        size={compact ? "sm" : "default"}
        aria-label={t`Reasoning effort`}
        title={t`Reasoning effort`}
        className={
          compact
            ? "max-w-32 min-w-0 shrink border-transparent px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-muted"
            : "w-full gap-3 bg-background px-3 shadow-none data-[size=default]:min-h-11 dark:bg-background"
        }
      >
        <GaugeIcon className={compact ? "size-3.5" : "size-5"} />
        <SelectValue className="min-w-0 truncate">{labels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent side={compact ? "top" : "bottom"} align="start">
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
