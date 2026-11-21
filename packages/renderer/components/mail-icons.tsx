import { type ComponentProps, useId } from "react";
import { WorkspaceAppIcon } from "./workspace-app-icon";

type IconProps = ComponentProps<"svg">;

export function MailIcon(props: IconProps) {
  return <WorkspaceAppIcon app="gmail" aria-hidden="true" {...props} />;
}

export function AllMailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4.5" y="2.5" width="18.5" height="14.5" rx="2.75" fill="#34A853" />
      <rect x="1" y="6.5" width="19" height="15" rx="2.5" fill="#4285F4" />
      <path
        fill="#1967D2"
        d="m20 9.25-8.3 7a1.9 1.9 0 0 1-2.4 0L1 9.25V9a2.5 2.5 0 0 1 2.5-2.5h14A2.5 2.5 0 0 1 20 9z"
      />
      <path
        fill="#A8C7FA"
        d="M1.2 8a2.5 2.5 0 0 1 2.3-1.5h14A2.5 2.5 0 0 1 19.8 8l-8.5 6.2a1.4 1.4 0 0 1-1.6 0z"
      />
    </svg>
  );
}

export function AttachmentIcon(props: IconProps) {
  const enamel = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={enamel} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop stopColor="#1967D2" />
          <stop offset=".45" stopColor="#4285F4" />
          <stop offset=".8" stopColor="#00A88A" />
          <stop offset="1" stopColor="#34A853" />
        </linearGradient>
      </defs>
      <path
        transform="rotate(40 12 12)"
        d="M5.75 9.25v6.5a6.25 6.25 0 0 0 12.5 0V6a4 4 0 0 0-8 0v10a1.75 1.75 0 0 0 3.5 0V7.5"
        stroke={`url(#${enamel})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WaitingIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10.5" fill="#E99500" />
      <path fill="#FBBC04" d="M12 1.5a10.5 10.5 0 0 1 7.42 17.92L12 12Z" />
      <circle cx="12" cy="12" r="7.6" fill="#FFF1CB" />
      <path
        d="M12 6.8V12l4.25 2.7"
        stroke="#80501B"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailAssistantIcon(props: IconProps) {
  const sparkle = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={sparkle} x1="10%" y1="92%" x2="84%" y2="2%">
          <stop stopColor="#185ABC" />
          <stop offset=".36" stopColor="#4285F4" />
          <stop offset=".68" stopColor="#7467E8" />
          <stop offset="1" stopColor="#D77DC8" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${sparkle})`}
        d="M12 .75c.4 0 .63.28.74.7 1.43 5.6 4.2 8.38 9.81 9.81.42.11.7.34.7.74s-.28.63-.7.74c-5.6 1.43-8.38 4.2-9.81 9.81-.11.42-.34.7-.74.7s-.63-.28-.74-.7c-1.43-5.6-4.2-8.38-9.81-9.81-.42-.11-.7-.34-.7-.74s.28-.63.7-.74c5.6-1.43 8.38-4.2 9.81-9.81.11-.42.34-.7.74-.7Z"
      />
      <path
        fill="#8DE0FF"
        d="M.75 12c0-.4.28-.63.7-.74 5.6-1.43 8.38-4.2 9.81-9.81.11-.42.34-.7.74-.7.15 4.53-.72 8.27-3.24 10.22C6.82 12.48 3.88 12.58.75 12Z"
      />
    </svg>
  );
}

export function WorkspaceSettingsIcon(props: IconProps) {
  const gear = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={gear} x1="12%" y1="95%" x2="84%" y2="2%">
          <stop stopColor="#0022CF" />
          <stop offset=".22" stopColor="#0499FC" />
          <stop offset=".45" stopColor="#2831F7" />
          <stop offset=".72" stopColor="#854DFB" />
          <stop offset="1" stopColor="#DEA7FB" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gear})`}
        fillRule="evenodd"
        stroke={`url(#${gear})`}
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="M10.5 2h3l.6 2.3 1.8.75 2.1-1.2L20.15 6l-1.2 2.1.75 1.8 2.3.6v3l-2.3.6-.75 1.8 1.2 2.1L18 20.15l-2.1-1.2-1.8.75-.6 2.3h-3l-.6-2.3-1.8-.75-2.1 1.2L3.85 18l1.2-2.1-.75-1.8L2 13.5v-3l2.3-.6.75-1.8L3.85 6 6 3.85l2.1 1.2 1.8-.75ZM12 7.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Z"
      />
    </svg>
  );
}
