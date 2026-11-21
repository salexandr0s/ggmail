import type { AssistantReply } from "@ggmail/shared/assistant";
import { useLingui } from "@lingui/react/macro";
import type { PhrasingContent, Root } from "mdast";
import { findAndReplace } from "mdast-util-find-and-replace";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SenderAvatar } from "./sender-avatar";
import "./answer.css";

type Citation = AssistantReply["citations"][number];

function markCitations(sources: Map<number, Citation>) {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        /\[(\d+(?:\s*,\s*\d+)*)\]/g,
        (match: string, group: string) => {
          const numbers = group.split(",").map(Number);
          if (!numbers.every((number) => sources.has(number))) {
            return match;
          }
          return numbers.map(
            (number): PhrasingContent => ({
              type: "emphasis",
              data: { hName: "sup", hProperties: { dataSource: number } },
              children: [{ type: "text", value: String(number) }],
            }),
          );
        },
      ],
      { ignore: ["link", "linkReference"] },
    );
  };
}

function elements(children: ReactNode) {
  return Children.toArray(children).filter(isValidElement<{ children?: ReactNode }>);
}

function textLength(children: ReactNode): number {
  return Children.toArray(children).reduce<number>((length, child) => {
    return (
      length +
      (isValidElement<{ children?: ReactNode }>(child)
        ? textLength(child.props.children)
        : String(child).length)
    );
  }, 0);
}

function AnswerTable({ children }: { children?: ReactNode }) {
  const [head, body] = elements(children);
  const [headerRow] = elements(head?.props.children);
  const headers = elements(headerRow?.props.children);
  const rows = elements(body?.props.children);
  if (headers.length < 3 || !rows.length) {
    return (
      <div className="answer-table">
        <table>{children}</table>
      </div>
    );
  }

  // Keep a descriptive first column in place. If it mostly contains short
  // labels, promote the column with the most detail across the whole table.
  const cells = rows.map((row) => elements(row.props.children));
  const lengths = headers.map(
    (_, column) =>
      cells.reduce(
        (total, row) => total + Math.min(textLength(row[column]?.props.children), 120),
        0,
      ) / cells.length,
  );
  const longest = Math.max(...lengths);
  const lead = (lengths[0] ?? 0) >= 22 || longest < 16 ? 0 : lengths.indexOf(longest);
  const order = [lead, ...headers.map((_, index) => index).filter((index) => index !== lead)];
  return (
    <div className="answer-records">
      {cells.map((row, index) => (
        <dl className="answer-record" key={rows[index]?.key}>
          {order.map((column) => {
            const cell = row[column];
            if (!cell) {
              return null;
            }
            return (
              <div
                key={cell.key}
                className={
                  column === lead
                    ? "answer-record-lead"
                    : textLength(cell.props.children) > 40
                      ? "answer-record-long"
                      : undefined
                }
              >
                <dt>{headers[column]?.props.children}</dt>
                <dd>{cell.props.children}</dd>
              </div>
            );
          })}
        </dl>
      ))}
    </div>
  );
}

export function Answer({
  text,
  citations = [],
  openSource,
  showSenderIcons = false,
}: {
  text: string;
  citations?: Citation[];
  openSource?: (id: string, trigger: HTMLButtonElement) => void;
  showSenderIcons?: boolean;
}) {
  const { t } = useLingui();
  if (!text) {
    return null;
  }
  const sources = new Map(citations.map((source) => [source.number, source]));
  return (
    <div className="assistant-answer">
      <ReactMarkdown
        remarkPlugins={sources.size ? [remarkGfm, [markCitations, sources]] : [remarkGfm]}
        allowedElements={[
          "p",
          "em",
          "strong",
          "del",
          "ul",
          "ol",
          "li",
          "code",
          "pre",
          "blockquote",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "br",
          "hr",
          "table",
          "thead",
          "tbody",
          "tr",
          "td",
          "th",
          "sup",
          "input",
        ]}
        skipHtml
        unwrapDisallowed
        components={{
          table: AnswerTable,
          input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} disabled />,

          sup: ({ node, children }) => {
            const source = sources.get(Number(node?.properties.dataSource));
            if (!source || !openSource) {
              return <sup>{children}</sup>;
            }
            const label = source.subject || t`Email source`;
            return (
              <sup className="answer-citation">
                <button
                  type="button"
                  title={[label, source.senders?.map((sender) => sender.name).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                  aria-label={`${source.number}. ${label}`}
                  data-source-id={source.id}
                  onClick={(event) => openSource(source.id, event.currentTarget)}
                >
                  {showSenderIcons && source.senders?.[0] && (
                    <SenderAvatar sender={source.senders[0]} className="size-4 text-sm" />
                  )}
                  {source.number}
                </button>
              </sup>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
