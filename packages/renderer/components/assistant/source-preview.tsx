import { getAccountLabel } from "@ggmail/shared/accounts";
import { getSenderDomain, type AssistantReply, type SourceMessage } from "@ggmail/shared/assistant";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { ButtonGroup } from "@ggmail/ui/components/button-group";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCwIcon,
  Loader2Icon,
  MailIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useConfig } from "@/lib/react-query";
import { useAccountsStore } from "@/lib/stores";
import { AccountBadge } from "../account-badge";
import { AssistantMailCard, CitationNumber } from "./mail-card";
import { SenderAvatar } from "./sender-avatar";

type Citation = AssistantReply["citations"][number];

function PreviewMessage({
  message,
  collapsible,
  showIcon,
}: {
  message: SourceMessage;
  collapsible: boolean;
  showIcon: boolean;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  const { sender, date, body } = message;
  // Only separate an unambiguous terminal address. Display other sender headers verbatim.
  const address = sender.match(/^([^<>]+?)\s*<([^<>\s@]+@[^<>\s@]+)>$/u);
  const name = address?.[1]?.trim() || sender || t`Unknown sender`;
  const byline = (
    <>
      {showIcon && (
        <SenderAvatar
          sender={{
            name,
            domain: getSenderDomain(address?.[2] ?? sender),
            photoUrl: message.senderPhotoUrl,
          }}
          className="size-7 shrink-0 text-lg"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-y-0.5 @[18rem]:flex-row @[18rem]:items-baseline @[18rem]:gap-x-2">
        <span className="min-w-0 flex-1">
          <span
            id={id + "-sender"}
            className="block text-sm leading-snug font-semibold wrap-anywhere"
          >
            {name}
          </span>
          {address && (
            <span
              id={id + "-address"}
              className="block text-xs font-normal wrap-anywhere text-muted-foreground"
            >
              {address[2]}
            </span>
          )}
        </span>
        <span
          id={id + "-date"}
          className="text-xs leading-snug font-normal wrap-anywhere text-muted-foreground @[18rem]:max-w-[35%] @[18rem]:text-end"
        >
          {date}
        </span>
      </span>
      {collapsible && (
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-[expanded=false]:-rotate-90 motion-reduce:transition-none"
        />
      )}
    </>
  );
  return (
    <section className="@container py-3.5 first:pt-3 last:pb-0">
      <h3 className="text-sm">
        {collapsible ? (
          <button
            type="button"
            aria-labelledby={id + "-sender"}
            aria-describedby={address ? id + "-address " + id + "-date" : id + "-date"}
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((open) => !open)}
            className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {byline}
          </button>
        ) : (
          <span className="flex items-center gap-2 py-1">{byline}</span>
        )}
      </h3>
      <div
        id={id}
        hidden={collapsible && !expanded}
        className="mt-2 text-sm leading-6 wrap-anywhere whitespace-pre-wrap"
      >
        {body}
      </div>
      {collapsible && !expanded && (
        <p aria-hidden="true" className="mt-1 truncate text-xs text-muted-foreground">
          {body}
        </p>
      )}
    </section>
  );
}

export function SourcePreview({
  initial,
  citations,
  onBack,
}: {
  initial: Citation;
  citations: AssistantReply["citations"];
  onBack: () => void;
}) {
  const { t } = useLingui();
  const back = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(initial);
  const [openFailedId, setOpenFailedId] = useState<string>();
  const index = citations.findIndex((citation) => citation.id === current.id);
  const previous = citations[index - 1];
  const next = citations[index + 1];
  useEffect(() => back.current?.focus(), []);
  function changeSource(citation: Citation | undefined) {
    if (citation) {
      ipc.main.send("assistant.closePreview", current.id);
      setOpenFailedId(undefined);
      setCurrent(citation);
    }
  }
  function returnToAnswer() {
    ipc.main.send("assistant.closePreview", current.id);
    onBack();
  }
  return (
    <section
      data-source-preview=""
      aria-label={t`Email source`}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          returnToAnswer();
        }
      }}
    >
      <nav className="flex shrink-0 flex-wrap items-center justify-between gap-x-1 gap-y-1 px-2 py-2">
        <Button ref={back} size="sm" variant="ghost" onClick={returnToAnswer}>
          <ArrowLeftIcon aria-hidden="true" />
          <Trans>Back to answer</Trans>
        </Button>
        {citations.length > 1 && (
          <ButtonGroup aria-label={t`Email sources`}>
            <Button
              variant="outline"
              size="icon-sm"
              title={
                previous
                  ? [t`Previous source`, previous.subject || t`(no subject)`].join(" · ")
                  : t`Previous source`
              }
              aria-label={t`Previous source`}
              disabled={!previous}
              className="aria-disabled:opacity-50"
              focusableWhenDisabled
              onClick={() => changeSource(previous)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              title={
                next
                  ? [t`Next source`, next.subject || t`(no subject)`].join(" · ")
                  : t`Next source`
              }
              aria-label={t`Next source`}
              disabled={!next}
              className="aria-disabled:opacity-50"
              focusableWhenDisabled
              onClick={() => changeSource(next)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </ButtonGroup>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpenFailedId(undefined);
            void ipc.main
              .invoke("assistant.openSource", current.id)
              .catch(() => setOpenFailedId(current.id));
          }}
        >
          <Trans>Open in Gmail</Trans>
          <ArrowUpRightIcon aria-hidden="true" />
        </Button>
      </nav>
      {openFailedId === current.id && (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          <Trans>Couldn't open the email source.</Trans>
        </p>
      )}
      <p className="sr-only" role="status">
        <Trans>Email source</Trans> {current.number} · {current.subject || t`(no subject)`}
      </p>
      <SourceDocument key={current.id} source={current} />
    </section>
  );
}

function SourceDocument({ source }: { source: Citation }) {
  const { t } = useLingui();
  const { config } = useConfig();
  // Main keeps one paginated source snapshot. A return visit starts a fresh one.
  const visit = useId();
  const preview = useInfiniteQuery({
    queryKey: ["assistantSource", source.id, visit],
    queryFn: ({ pageParam }) => ipc.main.invoke("assistant.previewSource", source.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    networkMode: "always",
  });
  const first = preview.data?.pages[0];
  const account = useAccountsStore(
    (state) => state.accounts.find(({ config }) => config.id === first?.accountId)?.config,
  );
  const messages: SourceMessage[] = [];
  for (const page of preview.data?.pages ?? []) {
    if ("messages" in page) {
      for (const part of page.messages) {
        const previous = messages.at(-1);
        if (previous?.index === part.index) {
          previous.body += part.body;
        } else {
          messages.push({ ...part });
        }
      }
    }
  }

  return (
    <div className="min-h-0 flex-1 px-4 pb-4">
      <AssistantMailCard
        scrollable
        subject={source.subject || t`(no subject)`}
        icon={MailIcon}
        title={
          <>
            <Trans>Email source</Trans>
            <CitationNumber number={source.number} />
          </>
        }
        tools={
          account && (
            <div className="max-w-[48%]">
              <AccountBadge label={getAccountLabel(account.label)} color={account.color} />
            </div>
          )
        }
      >
        {first && "excerpt" in first && (
          <div className="space-y-2 py-4">
            <h3 className="text-xs font-semibold text-muted-foreground">
              <Trans>Email excerpt</Trans>
            </h3>
            <p className="border-s-2 ps-3 text-sm leading-6 wrap-anywhere whitespace-pre-wrap">
              {first.excerpt}
            </p>
          </div>
        )}
        {messages.length > 0 && (
          <div className="divide-y">
            {messages.map((message) => (
              <PreviewMessage
                key={message.index}
                message={message}
                collapsible={messages.length > 1 || Boolean(preview.hasNextPage)}
                showIcon={Boolean(config?.["gmail.showSenderIcons"])}
              />
            ))}
          </div>
        )}
        {preview.isFetching && (
          <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2Icon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            <Trans>Loading email…</Trans>
          </p>
        )}
        {preview.isError && (
          <p role="alert" className="py-2 text-xs text-destructive">
            <Trans>Couldn't open the email source.</Trans>
          </p>
        )}
        {!preview.isFetching && (preview.hasNextPage || preview.isError) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => (preview.data ? preview.fetchNextPage() : preview.refetch())}
          >
            {preview.isError ? (
              <RotateCwIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
            {preview.isError ? t`Retry` : t`Load more`}
          </Button>
        )}
      </AssistantMailCard>
    </div>
  );
}
