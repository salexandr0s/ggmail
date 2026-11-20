import { useLingui } from "@lingui/react/macro";
import { Button } from "@ggmail/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCopied } from "@/lib/hooks";

export function CopyButton({
  value,
  onCopyError,
  variant = "outline",
  size = "icon",
  ...props
}: { value: string; onCopyError?: () => void } & ComponentProps<typeof Button>) {
  const { t } = useLingui();
  const { copied, markCopied } = useCopied();

  return (
    <Button
      variant={variant}
      size={size}
      aria-label={t({
        message: "Copy",
        comment: "Screen reader label of an icon button that copies the value beside it",
      })}
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          markCopied();
        } catch {
          onCopyError?.();
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
