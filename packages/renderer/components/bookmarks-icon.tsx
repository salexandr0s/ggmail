import type { ComponentProps } from "react";

export function BookmarksIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path fill="#669DF6" d="M8 2h10a2 2 0 0 1 2 2v14l-6-3.75L8 18V2Z" />
      <path
        fill="#4285F4"
        d="M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v15.3a.6.6 0 0 1-.92.5L10.5 18.3l-5.58 3.5a.6.6 0 0 1-.92-.5V6Z"
      />
      <path fill="#1967D2" d="m10.5 18.3 6.5-6.5v9.5a.6.6 0 0 1-.92.5l-5.58-3.5Z" />
    </svg>
  );
}
