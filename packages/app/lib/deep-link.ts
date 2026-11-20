import { getWorkspaceAppFromUrl } from "@ggmail/shared/google";

export const GGMAIL_PROTOCOL = "ggmail";

const GGMAIL_URL_PREFIX = `${GGMAIL_PROTOCOL}://`;

/**
 * A `ggmail://` URL that resolved to something the app knows how to carry out.
 * The address is optional on the open route and required on the message route,
 * which is what tells `ggmail://open?url=…` apart from `ggmail://<email>/open?url=…`.
 */
export type GgmailDeepLink =
  | { type: "message"; email: string; messageId: string }
  | { type: "open"; url: string; email: string | undefined };

export function isGgmailUrl(url: string) {
  return url.startsWith(GGMAIL_URL_PREFIX);
}

const HTTP_URL_PREFIX = "http://";

const HTTPS_URL_PREFIX = "https://";

const WEB_URL_PREFIXES = [HTTP_URL_PREFIX, HTTPS_URL_PREFIX];

/**
 * A plain web URL, as the desktop hands one over once ggmail holds the http or
 * https association. Matched on the prefix alone, which is what keeps a switch
 * carrying a URL, such as `--proxy-server=https://…`, out of it.
 */
export function isWebUrl(url: string) {
  return WEB_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * The same URL over https, the host untouched.
 *
 * A link router hands over what was clicked, and a Google link written `http://`
 * in an old message would otherwise reach `resolveRoutableUrl`, be refused for
 * its scheme and open nothing at all. Every workspace app this can open is
 * https-only and redirects there anyway, and the host check still runs after
 * this, so the upgrade widens no host.
 */
export function upgradeToHttps(url: string) {
  return url.startsWith(HTTP_URL_PREFIX)
    ? `${HTTPS_URL_PREFIX}${url.slice(HTTP_URL_PREFIX.length)}`
    : url;
}

export function createGgmailMessageUrl(userEmail: string, messageId: string) {
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a URL
  return `${GGMAIL_URL_PREFIX}${userEmail}/message/${messageId}`;
}

/**
 * Deliberately hand-parsed rather than handed to `new URL`. `ggmail:` is not a
 * special scheme, so the parser reads the address as userinfo and splits
 * `ggmail://someone@gmail.com/message/x` into a username and a host that have to
 * be glued back together. The query is a genuine query string, so that half
 * does go through `URLSearchParams`.
 */
export function parseGgmailUrl(url: string): GgmailDeepLink | undefined {
  if (!isGgmailUrl(url)) {
    return undefined;
  }

  const body = url.slice(GGMAIL_URL_PREFIX.length);

  const queryIndex = body.indexOf("?");

  const pathname = queryIndex === -1 ? body : body.slice(0, queryIndex);

  const searchParams = new URLSearchParams(queryIndex === -1 ? "" : body.slice(queryIndex + 1));

  const segments = pathname.split("/");

  // An address is the only segment that can carry an "@", so it is what says
  // whether the route name is the first segment or the second.
  const email = segments[0]?.includes("@") ? segments[0] : undefined;

  const [route, argument] = email ? [segments[1], segments[2]] : [segments[0], segments[1]];

  if (route === "open") {
    const openedUrl = searchParams.get("url");

    if (!openedUrl) {
      return undefined;
    }

    return { type: "open", url: openedUrl, email };
  }

  // Addressed to nobody, a message id resolves to no account, so the route
  // needs the address the open route can do without.
  if (route === "message" && email && argument) {
    return { type: "message", email, messageId: argument };
  }

  return undefined;
}

const GOOGLE_HOSTNAME = "google.com";

function isGoogleHostname(hostname: string) {
  return hostname === GOOGLE_HOSTNAME || hostname.endsWith(`.${GOOGLE_HOSTNAME}`);
}

/**
 * The URL a deep link asked for, when the app may open it in one of its own
 * views, and undefined otherwise.
 *
 * A `ggmail://` URL is reachable from any page and any message, so this is an
 * untrusted entry point and neither check below is optional.
 * `getWorkspaceAppFromUrl` matches a substring rather than a host, so it alone
 * resolves `https://evil.com/meet.google.com/x` to Meet; and `Tabs.openUrl`
 * asks `canOpenWorkspaceAppInApp`, which answers true for a URL belonging to no
 * workspace app at all. The host is parsed and verified first, and only then is
 * the matcher asked which app it belongs to.
 */
export function resolveRoutableUrl(rawUrl: string): string | undefined {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== "https:") {
    return undefined;
  }

  // Credentials in the authority are never something a link router meant to
  // send, and they are how a lookalike host gets read as a real one.
  if (parsedUrl.username || parsedUrl.password) {
    return undefined;
  }

  if (!isGoogleHostname(parsedUrl.hostname)) {
    return undefined;
  }

  if (!getWorkspaceAppFromUrl(parsedUrl.href)) {
    return undefined;
  }

  return parsedUrl.href;
}
