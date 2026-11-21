import type { AssistantProvider } from "@ggmail/shared/assistant";
import { cn } from "@ggmail/ui/lib/utils";
import openai from "./chatgpt-logo.svg?inline";
import claude from "./claude-logo.svg?inline";
import deepseek from "./deepseek-logo.svg?inline";

// Claude and DeepSeek silhouettes from Simple Icons (CC0-1.0):
// https://github.com/simple-icons/simple-icons/tree/32e030086fdc605196391aab28519b14dc4295b4/icons
const marks = { openai, claude, deepseek };

const providerBrand = {
  anthropic: "claude",
  "claude-cli": "claude",
  chatgpt: "openai",
  openai: "openai",
  deepseek: "deepseek",
} as const satisfies Record<AssistantProvider, keyof typeof marks>;

export function ModelLogo({
  provider,
  model,
  className,
}: {
  provider: AssistantProvider;
  model?: string;
  className?: string;
}) {
  // CLI aliases such as "default" and provider-specific IDs use the connected brand.
  const family = model?.toLowerCase().split("/").at(-1)?.split(/[-: ]/, 1)[0];
  const brand = family === "claude" || family === "deepseek" ? family : providerBrand[provider];
  return (
    <span
      aria-hidden="true"
      data-brand={brand}
      className={cn(
        "inline-block size-4 shrink-0 bg-current mask-contain mask-center mask-no-repeat",
        className,
      )}
      style={{ maskImage: `url("${marks[brand]}")` }}
    />
  );
}
