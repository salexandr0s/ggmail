import { Button } from "@ggmail/ui/components/button";
import { Input } from "@ggmail/ui/components/input";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

type FindInPageProps = {
  isActive: boolean;
  activeMatch: number;
  totalMatches: number;
  onFind: (text: string, options: { forward?: boolean; findNext: boolean }) => void;
  onClose: () => void;
};

export function FindInPage({
  isActive,
  activeMatch,
  totalMatches,
  onFind,
  onClose,
}: FindInPageProps) {
  const { t } = useLingui();

  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");

  const debouncedOnFind = useDebouncedCallback((text: string) => {
    onFind(text, { findNext: true });
  }, 250);

  useEffect(() => {
    if (isActive && text) {
      onFind(text, { findNext: true });

      if (inputRef.current) {
        inputRef.current.select();
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: refire when reactivated
  }, [isActive]);

  if (!isActive) {
    return;
  }

  return (
    <div className="titlebar-find flex min-w-0 items-center gap-1 draggable-none">
      <div className="flex min-w-0 items-center rounded-full border border-transparent bg-(--search-surface) focus-within:border-ring focus-within:bg-card">
        <Input
          ref={inputRef}
          aria-label={t`Find…`}
          placeholder={t`Find…`}
          className="h-6 rounded-full border-0 bg-transparent px-2.5 text-xs focus-visible:ring-0 md:text-xs"
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);

            debouncedOnFind(event.target.value);
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case "Enter": {
                onFind(text, { forward: true, findNext: false });

                break;
              }
              case "Escape": {
                onClose();

                break;
              }
            }
          }}
        />
        <div className="shrink-0 pe-2 text-xs text-muted-foreground tabular-nums">
          {activeMatch}/{totalMatches}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFind(text, { forward: false, findNext: false });
          }}
          title={t`Find previous match`}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onFind(text, { findNext: false });
          }}
          title={t`Find next match`}
        >
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title={t`Close find in page`}>
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
