import { useId } from "react";
import { ProductIcon, type ProductIconProps } from "./product-icon";
import { WorkspaceAppIcon } from "./workspace-app-icon";

export function MailIcon(props: ProductIconProps) {
  return <WorkspaceAppIcon app="gmail" {...props} />;
}

export function AllMailIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <path
        fill="#34A853"
        d="M7.2 2.1h13.5A2.3 2.3 0 0 1 23 4.4v10.1a2.3 2.3 0 0 1-2.3 2.3h-.5V8.6a3 3 0 0 0-3-3H4.9V4.4a2.3 2.3 0 0 1 2.3-2.3Z"
      />
      <rect x="1" y="7" width="18.8" height="14.9" rx="2.6" fill="#4285F4" />
      <path
        fill="#1967D2"
        d="m1 9.1 8.4 5.8a1.8 1.8 0 0 0 2 0l8.4-5.8v2.6l-8.4 5.8a1.8 1.8 0 0 1-2 0L1 11.7Z"
      />
      <path
        fill="#A8C7FA"
        d="M3.6 7h13.6a2.6 2.6 0 0 1 2.5 1.9l-8.3 5.7a1.8 1.8 0 0 1-2 0L1.1 8.9A2.6 2.6 0 0 1 3.6 7Z"
      />
    </ProductIcon>
  );
}

export function AttachmentIcon(props: ProductIconProps) {
  const id = useId();
  return (
    <ProductIcon {...props}>
      <defs>
        <linearGradient id={id} x1="15%" y1="92%" x2="86%" y2="8%">
          <stop stopColor="#1967D2" />
          <stop offset=".45" stopColor="#4285F4" />
          <stop offset=".7" stopColor="#00A88A" />
          <stop offset="1" stopColor="#34A853" />
        </linearGradient>
      </defs>
      <path
        d="m8.5 6.9-5 5a5.75 5.75 0 0 0 8.1 8.15l8-8a4.1 4.1 0 0 0-5.8-5.8l-7.5 7.5a2.1 2.1 0 0 0 3 3l6.65-6.65"
        stroke={`url(#${id})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        transform="translate(.6 -1.1)"
      />
    </ProductIcon>
  );
}

export function WaitingIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <circle cx="12" cy="12" r="10.9" fill="#E99500" />
      <path fill="#FBBC04" d="M12 1.1A10.9 10.9 0 0 1 21.4 17.5L12 12Z" />
      <circle cx="12" cy="12" r="7.55" fill="#FFF1CB" />
      <path
        d="M12 6.8v5.4l3.9 2.5"
        stroke="#80501B"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ProductIcon>
  );
}

export function MailAssistantIcon(props: ProductIconProps) {
  const id = useId();
  return (
    <ProductIcon {...props}>
      <defs>
        <linearGradient id={id} x1="10%" y1="95%" x2="78%" y2="5%">
          <stop stopColor="#185ABC" />
          <stop offset=".38" stopColor="#4285F4" />
          <stop offset=".74" stopColor="#7467E8" />
          <stop offset="1" stopColor="#D77DC8" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M10.1 4c.15-.6.9-.6 1.05 0 1.4 4.7 3.7 7 8.35 8.35.6.2.6.9 0 1.1-4.65 1.35-6.95 3.7-8.35 8.35-.15.6-.9.6-1.05 0-1.4-4.65-3.7-7-8.35-8.35-.6-.2-.6-.9 0-1.1C6.4 11 8.7 8.7 10.1 4Z"
      />
      <path
        fill="#8DE0FF"
        d="M10.6 3.6c.1 4.7-.8 7.1-3 8.5-1.5 1-3.6 1.2-6.3.8 0-.25.15-.45.45-.55C6.4 11 8.7 8.7 10.1 4c.1-.25.25-.4.5-.4Z"
      />
      <path
        fill="#D77DC8"
        d="M19.3 1.1c.65 2.4 1.8 3.55 4.1 4.15-2.3.7-3.45 1.85-4.1 4.15-.65-2.3-1.85-3.45-4.15-4.15 2.3-.6 3.5-1.75 4.15-4.15Z"
      />
    </ProductIcon>
  );
}

export function WorkspaceSettingsIcon(props: ProductIconProps) {
  const id = useId();
  return (
    <ProductIcon {...props}>
      <defs>
        <linearGradient id={id} x1="12%" y1="90%" x2="84%" y2="8%">
          <stop stopColor="#0022CF" />
          <stop offset=".27" stopColor="#0499FC" />
          <stop offset=".54" stopColor="#2831F7" />
          <stop offset=".8" stopColor="#854DFB" />
          <stop offset="1" stopColor="#DEA7FB" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        fillRule="evenodd"
        d="M10.1 1h3.8l.6 2.6 1.55.65 2.3-1.4 2.7 2.7-1.4 2.3.65 1.55 2.6.6v3.8l-2.6.6-.65 1.55 1.4 2.3-2.7 2.7-2.3-1.4-1.55.65-.6 2.6h-3.8l-.6-2.6-1.55-.65-2.3 1.4-2.7-2.7 1.4-2.3-.65-1.55-2.6-.6v-3.8l2.6-.6.65-1.55-1.4-2.3 2.7-2.7 2.3 1.4 1.55-.65Z
        M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z"
      />
    </ProductIcon>
  );
}

export function WorkspaceAppsIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <g fill="currentColor">
        <circle cx="5" cy="5" r="2.15" />
        <circle cx="12" cy="5" r="2.15" />
        <circle cx="19" cy="5" r="2.15" />
        <circle cx="5" cy="12" r="2.15" />
        <circle cx="12" cy="12" r="2.15" />
        <circle cx="19" cy="12" r="2.15" />
        <circle cx="5" cy="19" r="2.15" />
        <circle cx="12" cy="19" r="2.15" />
        <circle cx="19" cy="19" r="2.15" />
      </g>
    </ProductIcon>
  );
}
