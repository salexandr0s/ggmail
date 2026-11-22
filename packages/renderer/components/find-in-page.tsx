import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useFindInPageStore } from "@/lib/stores";
import "./find-in-page.css";

function startSearch(text: string) {
  ipc.main.send("findInPage", text, { forward: true, findNext: true });
}

export function FindInPage() {
  const { t } = useLingui();
  const { activation, activeMatch, totalMatches } = useFindInPageStore();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const search = useDebouncedCallback(startSearch, 250);

  useEffect(() => {
    if (activation && input.current) {
      input.current.focus();
      input.current.select();
      if (input.current.value) {
        startSearch(input.current.value);
      }
    }
    return () => search.cancel();
  }, [activation, search]);

  if (!activation) {
    return null;
  }

  function move(forward: boolean) {
    if (!text || totalMatches === 0) {
      return;
    }
    const newQuery = search.isPending();
    search.cancel();
    ipc.main.send("findInPage", text, { forward, findNext: newQuery });
  }

  function close() {
    search.cancel();
    useFindInPageStore.setState({ activation: 0, activeMatch: 0, totalMatches: null });
    ipc.main.send("findInPage", null);
  }

  return (
    <div
      role="search"
      aria-label={t`Find…`}
      className="titlebar-find draggable-none"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          close();
        }
      }}
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={input}
        aria-label={t`Find…`}
        placeholder={t`Find…`}
        value={text}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          useFindInPageStore.setState({ activeMatch: 0, totalMatches: null });
          if (value) {
            search(value);
          } else {
            search.cancel();
            startSearch("");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            move(!event.shiftKey);
          }
        }}
      />
      <span role="status" aria-atomic="true" className="titlebar-find-count">
        {text && totalMatches !== null && `${activeMatch}/${totalMatches}`}
      </span>
      <div className="titlebar-find-actions">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!text || totalMatches === 0}
          onClick={() => move(false)}
          title={t`Find previous match`}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!text || totalMatches === 0}
          onClick={() => move(true)}
          title={t`Find next match`}
        >
          <ChevronDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={close} title={t`Close find in page`}>
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
