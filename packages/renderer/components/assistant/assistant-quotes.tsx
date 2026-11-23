import type { AssistantQuote } from "@ggmail/shared/assistant";
import { createGgmailMessageUrl } from "@ggmail/shared/message-links";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { useLingui } from "@lingui/react/macro";
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import { memo, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { QuoteInsertion } from "./prompt";
import "./assistant-quotes.css";

export const QuoteCards = memo(function QuoteCards({
  quotes,
  remove,
  arrival,
}: {
  quotes: AssistantQuote[];
  remove?: (id: string) => void;
  arrival?: Extract<QuoteInsertion, { quoteId: string }>;
}) {
  const { t } = useLingui();
  const prefix = useId();
  const list = useRef<HTMLUListElement>(null);
  const arriving = useRef<HTMLLIElement>(null);
  useLayoutEffect(() => {
    const item = arriving.current;
    const tray = list.current;
    if (!arrival || !item || !tray) {
      return;
    }
    const row = item.getBoundingClientRect();
    const bounds = tray.getBoundingClientRect();
    if (row.top < bounds.top || row.height > tray.clientHeight) {
      tray.scrollTop += row.top - bounds.top;
    } else if (row.bottom > bounds.bottom) {
      tray.scrollTop += row.bottom - bounds.bottom;
    }
  }, [arrival]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [clipped, setClipped] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    if (!list.current) {
      return;
    }
    const excerpts = list.current.querySelectorAll<HTMLQuoteElement>("blockquote");
    const measure = () => {
      const next = new Set<string>();
      for (const excerpt of excerpts) {
        if (excerpt.scrollHeight > excerpt.clientHeight + 1) {
          next.add(excerpt.id);
        }
      }
      setClipped((previous) =>
        previous.size === next.size && [...previous].every((id) => next.has(id)) ? previous : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const excerpt of excerpts) {
      observer.observe(excerpt);
    }
    return () => observer.disconnect();
  }, [quotes, expanded]);
  if (!quotes.length) {
    return null;
  }
  return (
    <ul
      ref={list}
      aria-label={t`Quoted passages`}
      className={remove ? "quote-list" : "quote-list quote-list-sent"}
    >
      {quotes.map((quote) => {
        const id = prefix + quote.id;
        const open = expanded.has(quote.id);
        const source = id + "-source";
        return (
          <li
            key={quote.id}
            className="quote-item"
            ref={arrival?.quoteId === quote.id ? arriving : undefined}
            data-arriving={arrival?.quoteId === quote.id || undefined}
          >
            <div className="quote-passage">
              <blockquote
                id={id}
                className={open ? "quote-excerpt" : "quote-excerpt quote-clamped"}
              >
                {quote.text}
              </blockquote>
              {remove && (
                <button
                  type="button"
                  className="quote-remove"
                  aria-label={t`Remove quote`}
                  aria-describedby={source}
                  title={t`Remove quote`}
                  onClick={() => remove(quote.id)}
                >
                  <XIcon size={15} aria-hidden />
                </button>
              )}
            </div>
            {(open || clipped.has(id)) && (
              <button
                className="quote-expand"
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() =>
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (open) {
                      next.delete(quote.id);
                    } else {
                      next.add(quote.id);
                    }
                    return next;
                  })
                }
              >
                {open ? t`Show less` : t`Show more`}
              </button>
            )}

            {quote.truncated && (
              <p className="quote-truncation">{t`The quote was shortened to fit your assistant draft.`}</p>
            )}
            <div className="quote-attribution">
              <div id={source} className="quote-source">
                <strong title={quote.subject}>{quote.subject || t`(no subject)`}</strong>
                <span title={quote.sender}>{quote.sender || t`Unknown sender`}</span>
              </div>
              <a
                href={quote.owner ? createGgmailMessageUrl(quote.owner, quote.messageId) : "#"}
                aria-describedby={source}
                onClick={(event) => {
                  event.preventDefault();
                  const { accountId, owner, mailbox, messageId } = quote;
                  void ipc.main
                    .invoke("assistant.openQuote", { accountId, owner, mailbox, messageId })
                    .then((ok) => {
                      if (!ok) {
                        toast(t`Couldn't open the email source.`);
                      }
                    })
                    .catch(() => toast(t`Couldn't open the email source.`));
                }}
              >
                {t`Open original`} <ArrowUpRightIcon size={14} aria-hidden />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
});
