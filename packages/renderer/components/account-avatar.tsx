import { accountColorsMap, getAccountLabel } from "@ggmail/shared/accounts";
import type { AccountConfig } from "@ggmail/shared/schemas";
import { cn } from "@ggmail/ui/lib/utils";
import { useAccountsStore } from "@/lib/stores";

type AccountIdentity = Pick<AccountConfig, "id" | "label" | "color" | "logo">;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function AccountAvatar({
  account,
  photo,
  large = false,
}: {
  account: AccountIdentity;
  photo?: string;
  large?: boolean;
}) {
  const live = useAccountsStore((state) =>
    state.accounts.find(({ config }) => config.id === account.id),
  );
  const logo = account.logo ?? live?.config.logo;
  const src = logo || live?.gmail.profilePhoto || photo;
  const label = getAccountLabel(account.label).trim();
  const initial = graphemes.segment(label).containing(0)?.segment.toLocaleUpperCase();

  return (
    <span
      aria-hidden="true"
      data-slot="account-avatar"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        large ? "size-9 text-base" : "size-5 text-[0.6875rem]",
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className={cn("size-full", logo ? "object-contain" : "rounded-full object-cover")}
        />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-secondary leading-none font-medium text-foreground">
          {initial}
        </span>
      )}
      {account.color && (
        <span
          className={cn(
            "pointer-events-none absolute -end-px bottom-0 rounded-full ring-1 ring-background",
            large ? "size-2.5" : "size-1.5",
            accountColorsMap[account.color].className,
          )}
        />
      )}
    </span>
  );
}
