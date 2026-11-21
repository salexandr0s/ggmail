import { useLingui } from "@lingui/react/macro";
import { RotateCwIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { ExtraProps } from "react-markdown";

function webUrl(value?: string) {
  const url = value && URL.parse(value);
  if (
    url &&
    (url.protocol === "https:" || url.protocol === "http:") &&
    !url.username &&
    !url.password
  ) {
    return url;
  }
}

function containsImage(node: NonNullable<ExtraProps["node"]>): boolean {
  return (
    node.tagName === "img" ||
    node.children.some((child) => child.type === "element" && containsImage(child))
  );
}

export function AnswerLink({ href, children, node }: ComponentProps<"a"> & ExtraProps) {
  const url = webUrl(href);
  if (!url) {
    return <>{children}</>;
  }
  // Keep the link accessible even when the image is replaced by its retry button.
  const hasImage = node && containsImage(node);
  return (
    <>
      {hasImage && children}
      <a href={url.href} target="_blank" rel="noopener noreferrer" title={url.href}>
        {hasImage ? url.host : children}
      </a>
    </>
  );
}

function RemoteImage({ url, alt, title }: { url: URL; alt: string; title?: string }) {
  const { t } = useLingui();
  const [failed, setFailed] = useState(false);
  return (
    <span className="answer-image">
      {failed ? (
        <button type="button" title={url.href} onClick={() => setFailed(false)}>
          <RotateCwIcon aria-hidden="true" />
          <span>
            <strong>{t`Retry`}</strong>
            {alt && <span> · {alt}</span>}
            <small>
              {t`No preview available`} · {url.host}
            </small>
          </span>
        </button>
      ) : (
        <img
          src={url.href}
          alt={alt}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function AnswerImage({ src, alt, title }: ComponentProps<"img">) {
  const { t } = useLingui();
  const url = typeof src === "string" && webUrl(src);
  return url && url.protocol === "https:" ? (
    <RemoteImage key={url.href} url={url} alt={alt ?? ""} title={title} />
  ) : (
    <>{alt || t`No preview available`}</>
  );
}
