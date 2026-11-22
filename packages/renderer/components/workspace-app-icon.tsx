import type { SupportedWorkspaceApp } from "@ggmail/shared/workspace-apps";
import { useId, type ReactElement } from "react";
import { IconGradient, ProductIcon, type ProductIconProps } from "./product-icon";

// The artwork shares a 24-unit canvas. Broad faces and open counters carry the
// identity at the 14px size used in Settings as well as in the workspace rail.
function artwork(app: SupportedWorkspaceApp, id: string): ReactElement {
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Local SVG paint reference.
  const tone = `url(#${id})`;
  switch (app) {
    case "admin":
      return (
        <>
          <path
            fill="#4285F4"
            fillRule="evenodd"
            d="M8.1 2.4h7.8c1 0 1.8.5 2.3 1.3l4.1 7a2.6 2.6 0 0 1 0 2.6l-4.1 7a2.6 2.6 0 0 1-2.3 1.3H8.1c-1 0-1.8-.5-2.3-1.3l-4.1-7a2.6 2.6 0 0 1 0-2.6l4.1-7c.5-.8 1.3-1.3 2.3-1.3ZM9.6 7.8 7.2 12l2.4 4.2h4.8l2.4-4.2-2.4-4.2Z"
          />
          <path
            fill="#1967D2"
            d="M5.8 3.7a2.6 2.6 0 0 1 2.3-1.3h5.1l-3.6 5.4H3.4Zm11 8.3 3.1-5.4 2.4 4.1a2.6 2.6 0 0 1 0 2.6l-2.4 4.1Zm-13.4 4.2h6.2l3.6 5.4H8.1c-1 0-1.8-.5-2.3-1.3Z"
          />
        </>
      );
    case "ads":
      return (
        <>
          <path d="m4.7 18.7 7-13" stroke="#FBBC04" strokeWidth="7.1" strokeLinecap="round" />
          <path d="m11.8 5.5 7.5 13.1" stroke="#4285F4" strokeWidth="7.1" strokeLinecap="round" />
          <circle cx="4.7" cy="18.6" r="3.55" fill="#34A853" />
        </>
      );
    case "analytics":
      return (
        <>
          <rect x="15.55" y="1.25" width="6.3" height="21.5" rx="3.15" fill="#F6AA1B" />
          <rect x="8.1" y="8.9" width="5.6" height="13.85" rx="2.8" fill="#E27625" />
          <circle cx="4.05" cy="19.9" r="2.85" fill="#E27625" />
        </>
      );
    case "appsScript":
      return (
        <>
          <path d="M4.1 17.8h12" stroke="#EA4335" strokeWidth="5.3" strokeLinecap="round" />
          <path d="m5.3 9.6 10.8 8.2" stroke="#FBBC04" strokeWidth="5.3" strokeLinecap="round" />
          <path d="m10.6 4.6 5.5 13.2" stroke="#34A853" strokeWidth="5.3" strokeLinecap="round" />
          <path d="m20 4.9-3.9 12.9" stroke="#4285F4" strokeWidth="5.3" strokeLinecap="round" />
          <g fill="#FFFFFF">
            <circle cx="4.1" cy="17.8" r="1" />
            <circle cx="5.3" cy="9.6" r="1" />
            <circle cx="10.6" cy="4.6" r="1" />
            <circle cx="20" cy="4.9" r="1" />
          </g>
        </>
      );
    case "calendar":
      return (
        <>
          <IconGradient id={id} dark="#3186FF" light="#4FA0FF" />
          <rect x="4" y="1" width="16" height="9" rx="3" fill="#BBE2FF" />
          <rect x="1.6" y="3.1" width="20.8" height="19.7" rx="3.4" fill={tone} />
          <path
            d="M5 3.1h14c1.9 0 3.4 1.5 3.4 3.4v.7H1.6v-.7C1.6 4.6 3.1 3.1 5 3.1Z"
            fill="#A9A8FF"
          />
          <path
            d="M5.9 10.9c1.1-1.3 4.7-1.5 4.7.9 0 1.4-1.4 2.2-3.1 2.2 2.1 0 3.4.8 3.4 2.3 0 2.6-3.6 3.1-5.1 1.4m8-6.3 2.8-1.6v9"
            stroke="white"
            strokeWidth="1.95"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "chat":
      return (
        <>
          <IconGradient id={id} dark="#00AF57" light="#0EBC5F" />
          <rect x="2.5" y="2" width="18.5" height="13" rx="6.5" fill="#78C9FF" />
          <path
            fill={tone}
            d="M8 5h8a7 7 0 0 1 0 14h-4.2l-5.1 3.2c-.5.3-1.1 0-1.1-.6v-3.1A7 7 0 0 1 8 5Z"
          />
          <path
            d="M7.3 11.6a5.3 5.3 0 0 0 9.4 0"
            stroke="white"
            strokeWidth="2.15"
            strokeLinecap="round"
          />
        </>
      );
    case "classroom":
      return (
        <>
          <rect x="1" y="3" width="22" height="18" rx="2.2" fill="#F4B400" />
          <rect x="3.1" y="5.1" width="17.8" height="13.8" rx="1" fill="#0F9D58" />
          <g fill="#57BB8A">
            <circle cx="6.8" cy="10.5" r="1.45" />
            <circle cx="17.2" cy="10.5" r="1.45" />
            <path d="M4.3 15.5c0-4.6 5.1-4.6 5.1 0Zm10.3 0c0-4.6 5.1-4.6 5.1 0Z" />
          </g>
          <g fill="#F7F7F7">
            <circle cx="12" cy="9.7" r="2.15" />
            <path d="M8 15.7c0-4.5 8-4.5 8 0Z" />
            <rect x="14.6" y="17.45" width="4.3" height="1.45" rx=".55" />
          </g>
        </>
      );
    case "contacts":
      return (
        <>
          <circle cx="12" cy="6.35" r="4.85" fill="#0057CC" />
          <path
            fill="#578CFF"
            d="M2.6 18.6a6 6 0 0 1 6-6h6.8a6 6 0 0 1 6 6v1.7a2.2 2.2 0 0 1-2.2 2.2H4.8a2.2 2.2 0 0 1-2.2-2.2Z"
          />
          <path
            fill="#0057CC"
            d="M7 18.7a6.1 6.1 0 0 1 6.1-6.1h2.3a6 6 0 0 1 6 6v1.7a2.2 2.2 0 0 1-2.2 2.2H7Z"
          />
        </>
      );
    case "docs":
      return (
        <>
          <IconGradient id={id} dark="#3186FF" light="#76BBFF" />
          <path
            fill={tone}
            d="M5.7 1.2h8.5l6.3 6.3v13a2.3 2.3 0 0 1-2.3 2.3H5.7a2.3 2.3 0 0 1-2.3-2.3v-17a2.3 2.3 0 0 1 2.3-2.3Z"
          />
          <path fill="#A9A8FF" d="M14.2 1.2v4.6c0 1 .7 1.7 1.7 1.7h4.6Z" />
          <path
            d="M7.8 12.1H16m-8.2 4.2h5.6"
            stroke="white"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </>
      );
    case "drive":
      return (
        <>
          <path
            fill="#0EBC5F"
            d="M8.1 2.9h6.7L5 20.7a2.2 2.2 0 0 1-1.1-1l-2.5-4.4a2.2 2.2 0 0 1 0-2.1l5.3-9.3c.3-.6.8-1 1.4-1Z"
          />
          <path fill="#FEC700" d="M8.1 2.9h6.7c.9 0 1.7.5 2.1 1.2l5.7 9.9-3.7 6.5Z" />
          <path
            fill="#3186FF"
            d="M8.6 14h14a2 2 0 0 1-.2 1.5l-2.7 4.7c-.4.6-1 1-1.7 1H5.7c-.6 0-1-.2-1.4-.5Z"
          />
          <path fill="#78C9FF" d="m8.1 2.9 3.7 6.2 3.4-6.2Z" />
          <path fill="#A9A8FF" d="M15.1 14h7.5l-3.7 6.5Z" />
        </>
      );
    case "forms":
      return (
        <>
          <IconGradient id={id} dark="#5746E3" light="#7372FE" />
          <g fill="#969DFF">
            <circle cx="3.4" cy="6" r="2.4" />
            <circle cx="3.4" cy="12" r="2.4" />
            <circle cx="3.4" cy="18" r="2.4" />
          </g>
          <rect x="7.8" y="3.5" width="15" height="5" rx="2.5" fill={tone} />
          <rect x="7.8" y="9.5" width="11.6" height="5" rx="2.5" fill="#969DFF" />
          <rect x="7.8" y="15.5" width="15" height="5" rx="2.5" fill={tone} />
        </>
      );
    case "gemini":
      return (
        <>
          <defs>
            <linearGradient id={id} x1="4%" y1="86%" x2="89%" y2="18%">
              <stop stopColor="#00B95C" />
              <stop offset=".26" stopColor="#FFEE48" />
              <stop offset=".48" stopColor="#FC413D" />
              <stop offset=".7" stopColor="#969DFF" />
              <stop offset="1" stopColor="#3186FF" />
            </linearGradient>
          </defs>
          <path
            fill={tone}
            d="M11.5 1.6c.1-.6.9-.6 1 0 1.2 5.3 4.6 8.7 9.9 9.9.6.1.6.9 0 1-5.3 1.2-8.7 4.6-9.9 9.9-.1.6-.9.6-1 0C10.3 17.1 6.9 13.7 1.6 12.5c-.6-.1-.6-.9 0-1 5.3-1.2 8.7-4.6 9.9-9.9Z"
          />
        </>
      );
    case "gmail":
      return (
        <>
          <path fill="#3186FF" d="M1 5.7h4.6v15H2.8A1.8 1.8 0 0 1 1 18.9Z" />
          <path fill="#0EBC5F" d="M18.4 5.7H23v13.2a1.8 1.8 0 0 1-1.8 1.8h-2.8Z" />
          <path fill="#FC413D" d="M5.6 4.2 12 9l6.4-4.8v5.9L12 15l-6.4-4.9Z" />
          <path fill="#FC5C30" d="M1 5.6c0-2 2.2-3.1 3.9-1.9l.7.5v5.9L1 6.7Z" />
          <path fill="#FEC700" d="m18.4 4.2.7-.5C20.8 2.5 23 3.6 23 5.6v1.1l-4.6 3.4Z" />
        </>
      );
    case "groups":
      return (
        <>
          <g fill="#4384F4">
            <circle cx="7" cy="7.5" r="3.6" />
            <path d="M1 20v-2.3a6 6 0 0 1 6-6c1.5 0 2.8.4 3.9 1.2A8.1 8.1 0 0 0 8 19.2v.8Z" />
          </g>
          <g fill="#1C66D2">
            <circle cx="16" cy="6.3" r="4.2" />
            <path d="M9.4 19.1a6.8 6.8 0 0 1 13.6 0v1.2c0 .9-.7 1.6-1.6 1.6H11c-.9 0-1.6-.7-1.6-1.6Z" />
          </g>
        </>
      );
    case "keep":
      return (
        <>
          <IconGradient id={id} dark="#F6A100" light="#FFE921" />
          <path
            fill={tone}
            d="M12 1.1a8.4 8.4 0 0 1 6.1 14.2c-1.4 1.4-2.1 2.2-2.4 4.1H8.3c-.3-1.9-1-2.7-2.4-4.1A8.4 8.4 0 0 1 12 1.1Z"
          />
          <path
            d="m9.3 10.8 2.7 2.8 2.7-2.8M12 13.6v4.3"
            stroke="#FDFD6D"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path fill="#FFB5E8" d="M8.2 18.3h7.6v1.1a3.8 3.8 0 1 1-7.6 0Z" />
        </>
      );
    case "meet":
      return (
        <>
          <IconGradient id={id} dark="#F6A100" light="#FFE921" />
          <path
            fill={tone}
            d="M4.4 4.1h9.1a3.4 3.4 0 0 1 3.4 3.4v9a3.4 3.4 0 0 1-3.4 3.4H4.4A3.4 3.4 0 0 1 1 16.5v-9a3.4 3.4 0 0 1 3.4-3.4Z"
          />
          <path
            fill="#FFE921"
            d="m15.4 9.6 5.8-4.1c.8-.6 1.8 0 1.8.9v11.2c0 .9-1 1.5-1.8.9l-5.8-4.1Z"
          />
          <path fill="#FFB5E8" d="M11 13.7h5.9v2.8a3.4 3.4 0 0 1-3.4 3.4H11Z" />
        </>
      );
    case "myaccount":
      return (
        <>
          <IconGradient id={id} dark="#0057CC" light="#78C9FF" />
          <circle cx="12" cy="12" r="10.8" fill={tone} />
          <circle cx="12" cy="9" r="3.6" fill="white" />
          <path fill="white" d="M4.45 19.7a8.8 8.8 0 0 1 15.1 0 10.8 10.8 0 0 1-15.1 0Z" />
        </>
      );
    case "notebook":
      return (
        <>
          <path
            d="M2 18.7v-4a9.9 9.9 0 0 1 19.8 0v4"
            stroke="#3186FF"
            strokeWidth="2.65"
            strokeLinecap="round"
          />
          <path
            d="M2.2 15.2a7 7 0 0 1 13.9.7v2.8"
            stroke="#76BBFF"
            strokeWidth="2.65"
            strokeLinecap="round"
          />
          <path
            d="M2.2 16a4.1 4.1 0 0 1 8 .9v1.8"
            stroke="#A9A8FF"
            strokeWidth="2.65"
            strokeLinecap="round"
          />
        </>
      );
    case "photos":
      return (
        <>
          <path fill="#FEC700" d="M1 12a5.5 5.5 0 0 1 11 0Z" />
          <path fill="#FC413D" d="M12 1a5.5 5.5 0 0 1 0 11Z" />
          <path fill="#3186FF" d="M23 12a5.5 5.5 0 0 1-11 0Z" />
          <path fill="#00AF57" d="M12 23a5.5 5.5 0 0 1 0-11Z" />
          <path fill="#FFE921" d="M1 12a5.5 5.5 0 0 1 5.5-5.5c-1.5 1.6-2.2 3.5-2.2 5.5Z" />
          <path fill="#FF96DA" d="M12 1a5.5 5.5 0 0 1 5.5 5.5C16 5 14 4.3 12 4.3Z" />
          <path fill="#A9A8FF" d="M23 12a5.5 5.5 0 0 1-5.5 5.5c1.5-1.6 2.2-3.5 2.2-5.5Z" />
          <path fill="#78C9FF" d="M12 23a5.5 5.5 0 0 1-5.5-5.5C8 19 10 19.7 12 19.7Z" />
        </>
      );
    case "searchConsole":
      return (
        <>
          <rect x="16" y="2" width="6.6" height="17.5" rx="3.3" fill="#4285F4" />
          <rect x="9.4" y="7" width="6.6" height="12.5" rx="3.3" fill="#34A853" />
          <path d="m6.1 17.1-3.9 4" stroke="#FBBC04" strokeWidth="2.7" strokeLinecap="round" />
          <circle cx="8.6" cy="14.8" r="4.7" fill="#FBBC04" />
          <circle cx="8.6" cy="14.8" r="2.2" fill="#1967D2" />
        </>
      );
    case "tasks":
      return (
        <>
          <path fill="#A9A8FF" d="M2.1 12.1a9.9 9.9 0 0 0 19.8 0v1a9.9 9.9 0 0 1-19.8 0Z" />
          <IconGradient id={id} dark="#3186FF" light="#3C90FF" />
          <circle cx="12" cy="11.3" r="10.2" fill={tone} />
          <path
            d="m6.7 11.5 3.5 3.5 7.2-7.6"
            stroke="white"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "sheets":
      return (
        <>
          <IconGradient id={id} dark="#009954" light="#0EBC5F" />
          <rect x="1.1" y="4" width="18" height="16" rx="2.8" fill="#78C9FF" />
          <rect x="4.7" y="2.7" width="18.2" height="18.6" rx="2.6" fill={tone} />
          <path
            d="M9 7.8h9.7v8.4H9zm0 3.7h9.7m-5.6 0v4.7"
            stroke="white"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </>
      );
    case "sites":
      return (
        <>
          <rect x="1.1" y="3.2" width="17.6" height="15.9" rx="2.5" fill="#9DD2FF" />
          <rect x="4.3" y="5" width="18.6" height="15.9" rx="2.5" fill="#3186FF" />
          <path
            fill="#A9A8FF"
            d="M6.8 5h13.6c1.4 0 2.5 1.1 2.5 2.5v2H4.3v-2C4.3 6.1 5.4 5 6.8 5Z"
          />
          <rect x="7.5" y="12" width="4.3" height="5.8" rx=".8" fill="#9DD2FF" />
          <path
            d="M14.5 13h4.9m-4.9 3.6h3.3"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      );
    case "slides":
      return (
        <>
          <rect x="1" y="4.7" width="18.4" height="15.8" rx="2.8" fill="#FFBE00" />
          <IconGradient id={id} dark="#FEC700" light="#FFDB0F" />
          <rect x="4.5" y="2.8" width="18.5" height="16.3" rx="2.6" fill={tone} />
          <rect x="7.9" y="6.3" width="11.7" height="8.9" rx="1" stroke="white" strokeWidth="2" />
          <path
            fill="#FFA8E3"
            d="M4.5 16.3v.2a2.6 2.6 0 0 0 2.6 2.6h12.3v.2c0 .7-.6 1.2-1.3 1.2H7Z"
          />
        </>
      );
    case "vids":
      return (
        <>
          <rect x="1.2" y="4.2" width="15.2" height="15.6" rx="4" fill="#d0d9ff" />
          <rect x="4.2" y="3" width="15.7" height="18" rx="4.4" fill="#b8c0ff" />
          <IconGradient id={id} dark="#7372fe" light="#64afff" />
          <rect x="7.3" y="2" width="15.5" height="20" rx="4.5" fill={tone} />
          <path
            fill="#fff"
            d="M12.5 8.4c0-.6.6-1 1.1-.7l5.1 3.5c.6.4.6 1.2 0 1.6l-5.1 3.5c-.5.3-1.1 0-1.1-.7Z"
          />
        </>
      );
    case "voice":
      return (
        <>
          <IconGradient id={id} dark="#00AF57" light="#60D673" />
          <path
            d="M12.8 2.1a9.8 9.8 0 0 1 9.1 9.2c0 .6-.5 1-1.1 1h-2.3c-.5 0-.9-.3-.9-.8a5.6 5.6 0 0 0-5.1-5.2c-.5 0-.8-.4-.8-.9V3.2c0-.6.5-1.1 1.1-1.1Z"
            fill="#78C9FF"
          />
          <path
            fill={tone}
            d="m5.3 2.6 3.1 3.6c.6.7.6 1.6 0 2.3l-1.7 1.8a14.2 14.2 0 0 0 6.9 6.9l1.9-1.8a1.7 1.7 0 0 1 2.3 0l3.6 3.1c.7.6.8 1.5.3 2.2-1 1.5-2.4 2.2-4 2-7.4-1-15.3-8.9-16.3-16.3-.2-1.6.5-3 2-4 .7-.5 1.4-.4 1.9.2Z"
          />
        </>
      );
  }
}

export function WorkspaceAppIcon({
  app,
  ...props
}: { app: SupportedWorkspaceApp } & ProductIconProps) {
  // SVG paint servers are document-scoped, including copies in hidden toolbars.
  const id = useId();
  return <ProductIcon {...props}>{artwork(app, id)}</ProductIcon>;
}
