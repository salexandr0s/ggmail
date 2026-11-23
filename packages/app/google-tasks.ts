/* oxlint-disable lingui/no-unlocalized-strings -- OAuth and Google Tasks protocols, internal errors and URL components. */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";

export const desktopClient = z.object({
  client_id: z.string().regex(/^[\w.-]+\.apps\.googleusercontent\.com$/),
  client_secret: z.string().min(1).max(512),
});
export type Client = z.infer<typeof desktopClient>;
export const taskEdits = z.object({
  title: z.string().trim().min(1).max(1024),
  due: z.union([z.literal(""), z.iso.date()]),
});
const tasksScope = "https://www.googleapis.com/auth/tasks";

export async function connectTasks(
  client: Client,
  owner: string,
  signal: AbortSignal,
  open: (url: string) => Promise<void>,
  /**
   * What the browser tab shows once Google hands back. It cannot promise the
   * connection: the token exchange and the account check come after it.
   */
  finished = "ggmail",
  fetcher: typeof globalThis.fetch = fetch,
) {
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(32).toString("hex");
  const { code, redirect } = await new Promise<{ code: string; redirect: string }>(
    (resolve, reject) => {
      let redirect = "";
      const server = createServer((request, response) => {
        const url = URL.parse(request.url ?? "", redirect);
        if (
          !url ||
          request.method !== "GET" ||
          url.origin + url.pathname !== redirect ||
          request.headers.host !== url.host ||
          url.searchParams.get("state") !== state
        ) {
          response.writeHead(400).end();
          return;
        }
        const result = url.searchParams.get("code");
        response
          .writeHead(200, {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
          })
          .end(finished);
        cleanup();
        if (result) {
          resolve({ code: result, redirect });
        } else {
          reject(new Error("Google authorization declined"));
        }
      });
      function cleanup() {
        signal.removeEventListener("abort", abort);
        server.close();
        server.closeAllConnections();
      }
      function abort() {
        cleanup();
        reject(new Error("Google authorization interrupted"));
      }
      signal.addEventListener("abort", abort, { once: true });
      server.once("error", abort);
      if (signal.aborted) {
        return abort();
      }
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          return abort();
        }
        redirect = "http://127.0.0.1:" + address.port + "/tasks/callback";
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: redirect,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          state,
          scope: tasksScope + " email",
          login_hint: owner,
          code_challenge_method: "S256",
          code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        }).toString();
        void open(url.href).catch(abort);
      });
    },
  );
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal,
    body: new URLSearchParams({
      ...client,
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error("Google token exchange failed");
  }
  const auth = tokenResult(await response.json());
  const identity = await fetcher("https://www.googleapis.com/oauth2/v2/userinfo", {
    signal,
    headers: { Authorization: "Bearer " + auth.token },
  });
  const user =
    identity.ok &&
    z.object({ email: z.email(), verified_email: z.literal(true) }).safeParse(await identity.json())
      .data;
  if (!user || user.email.toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Google account mismatch");
  }
  return auth;
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
});
function tokenResult(raw: unknown) {
  const { access_token, expires_in, refresh_token } = tokenSchema.parse(raw);
  return {
    token: access_token,
    expires: Date.now() + (expires_in - 30) * 1000,
    refreshToken: refresh_token,
  };
}

export async function refreshTasks(
  client: Client,
  refreshToken: string,
  fetcher: typeof globalThis.fetch = fetch,
) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      ...client,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json();
  if (
    response.status === 400 &&
    z.object({ error: z.literal("invalid_grant") }).safeParse(body).success
  ) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Google token refresh failed");
  }
  return tokenResult(body);
}

export async function insertGoogleTask(
  token: string,
  edits: z.infer<typeof taskEdits>,
  notes: string,
  fetcher: typeof globalThis.fetch = fetch,
) {
  const { title, due } = taskEdits.parse(edits);
  const result = await fetcher("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ title, notes, due: due ? due + "T00:00:00.000Z" : undefined }),
  });
  // A successful insert has already committed, even if its optional link is missing.
  const task = result.ok ? await result.json().catch(() => null) : null;
  const href = z.object({ webViewLink: z.string() }).safeParse(task).data?.webViewLink;
  const link = href ? URL.parse(href) : null;
  return {
    status: result.status,
    url: link?.origin === "https://tasks.google.com" ? link : undefined,
  };
}
