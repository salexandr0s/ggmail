import type { PhrasingContent, Root } from "mdast";
import { findAndReplace } from "mdast-util-find-and-replace";

// Both the source list and the inline buttons follow the same Markdown tree.
// A number in a code sample or a link label is ordinary content.
export function markCitations(sources: ReadonlyMap<number, unknown>, cited?: Set<number>) {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        /\[\s*(\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)\s*\]/g,
        (_match: string, group: string) => {
          const numbers = new Set<number>();
          for (const part of group.split(",")) {
            const [first, last = first] = part.split(/[-–]/).map(Number);
            if (
              !first ||
              !last ||
              last < first ||
              last - first >= sources.size ||
              !sources.has(first)
            ) {
              return false;
            }
            for (let n = first; n <= last; n++) {
              if (!sources.has(n)) {
                return false;
              }
              numbers.add(n);
            }
          }
          return Array.from(numbers, (number): PhrasingContent => {
            cited?.add(number);
            return {
              type: "emphasis",
              data: { hName: "sup", hProperties: { dataSource: number } },
              children: [{ type: "text", value: String(number) }],
            };
          });
        },
      ],
      { ignore: ["link", "linkReference"] },
    );
  };
}
