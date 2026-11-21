import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { createServer } from "node:http";
import { ms } from "@ggmail/shared/ms";
import { t } from "@lingui/core/macro";
import { z } from "zod";
import { providerRequest, readJson } from "./http";

// oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
const issuer = "https://auth.openai.com";
// oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
const resource = "https://api.openai.com/v1";
// oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
const callbackPath = "/auth/callback";
const dynamicClient = "dynamic_agent_client";
// oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

export const clientIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\w.-]+$/)
  .refine((id) => id !== dynamicClient);

const tokenSchema = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[\x21-\x7e]+$/);
const tokenResponseSchema = z.object({
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
  token_type: z.literal("Bearer"),
  access_token: tokenSchema,
  refresh_token: tokenSchema,
  id_token: tokenSchema.optional(),
  scope: z.string().max(4096).optional(),
  expires_in: z.number().int().positive().max(3600),
  earliest_refresh_at: z
    .union([z.number().positive(), z.iso.datetime({ offset: true })])
    .optional(),
});

export const identitySchema = z.object({
  sub: z.string().min(1).max(512),
  email: z.email().optional(),
});

const claimsSchema = identitySchema.extend({
  iss: z.literal(issuer),
  aud: z.union([z.string(), z.array(z.string()).min(1).max(32)]),
  azp: z.string().optional(),
  exp: z.number(),
  iat: z.number(),
  nbf: z.number().optional(),
  nonce: z.string().optional(),
});

export const registrationSchema = z.object({
  clientId: clientIdSchema,
  identity: identitySchema,
});

export const credentialsSchema = z.object({
  accessToken: tokenSchema,
  refreshToken: tokenSchema,
  idToken: tokenSchema,
  scopes: z.array(z.string()).max(32),
  expiresAt: z.number(),
  refreshAt: z.number(),
});

export type Registration = z.infer<typeof registrationSchema>;
export type Credentials = z.infer<typeof credentialsSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export function hasPlanPermission(granted: string[]) {
  return granted.includes("resource.invoke") && granted.includes("chatgpt.tokens.use.direct");
}

export async function verifyIdentity(idToken: string, clientId: string, nonce?: string) {
  const parts = idToken.split(".");
  const [header, payload, signature] = parts;
  if (
    parts.length !== 3 ||
    !header ||
    !payload ||
    !signature ||
    parts.some((part) => !/^[\w-]+$/.test(part))
  ) {
    throw new Error(t`ChatGPT returned an invalid identity token.`);
  }

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
  const { kid } = z.object({ alg: z.literal("RS256"), kid: z.string().min(1) }).parse(
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
    JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
  );
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  const now = Date.now() / 1000;

  if (
    !audiences.includes(clientId) ||
    new Set(audiences).size !== audiences.length ||
    ((audiences.length > 1 || claims.azp) && claims.azp !== clientId) ||
    claims.exp <= now ||
    claims.iat > now + 60 ||
    (claims.nbf ?? 0) > now + 60 ||
    (nonce !== undefined && claims.nonce !== nonce)
  ) {
    throw new Error(t`ChatGPT returned an invalid identity token.`);
  }

  const response = await providerRequest(new URL("/.well-known/jwks.json", issuer));
  const keys = z
    .object({
      keys: z
        .array(
          z.object({
            kid: z.string(),
            kty: z.string(),
            alg: z.string().optional(),
            use: z.string().optional(),
            n: z.string().optional(),
            e: z.string().optional(),
          }),
        )
        .max(128),
    })
    .parse(await readJson(response, 131_072)).keys;
  const matching = keys.filter((key) => key.kid === kid);
  const [key] = matching;

  if (
    !response.ok ||
    matching.length !== 1 ||
    key?.kty !== "RSA" ||
    !key.n ||
    !key.e ||
    (key.alg && key.alg !== "RS256") ||
    (key.use && key.use !== "sig") ||
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
    !verify(
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- Wire value from the OAuth protocol.
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      createPublicKey({ key: { kty: "RSA", n: key.n, e: key.e }, format: "jwk" }),
      // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
      Buffer.from(signature, "base64url"),
    )
  ) {
    throw new Error(t`ChatGPT returned an invalid identity token.`);
  }

  return identitySchema.parse(claims);
}

export class InvalidGrantError extends Error {}

export async function exchangeTokens(form: Record<string, string>) {
  const response = await providerRequest(new URL("/api/accounts/oauth/token", issuer), {
    method: "POST",
    body: new URLSearchParams({ ...form, resource }),
  });
  const result = await readJson(response, 131_072);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    if (error.success && error.data.error === "invalid_grant") {
      throw new InvalidGrantError(t`Your ChatGPT session expired. Sign in again.`);
    }

    throw new Error(t`ChatGPT couldn't complete sign-in. Try again.`);
  }

  return tokenResponseSchema.parse(result);
}

export function buildCredentials(tokens: TokenResponse, previous?: Credentials): Credentials {
  const now = Date.now();
  const earliest = tokens.earliest_refresh_at;
  const parsed = typeof earliest === "string" ? Date.parse(earliest) : (earliest ?? 0) * 1000;

  return credentialsSchema.parse({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token ?? previous?.idToken,
    scopes: tokens.scope?.split(/ +/).filter(Boolean) ?? previous?.scopes,
    expiresAt: now + tokens.expires_in * 1000,
    refreshAt: Number.isFinite(parsed) ? parsed : 0,
  });
}

export async function revokeSession(clientId: string, refreshToken: string) {
  const response = await providerRequest(
    new URL("/api/accounts/oauth/revoke", issuer),
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    },
    ms("10 seconds"),
  );
  await response.body?.cancel();

  return response.ok;
}

export function parseCallback(url: URL, expectedState: string, registeredClient?: string) {
  for (const key of ["state", "code", "error", "client_id"]) {
    if (url.searchParams.getAll(key).length > 1) {
      return;
    }
  }

  const state = Buffer.from(url.searchParams.get("state") ?? "");
  const expected = Buffer.from(expectedState);
  if (state.length !== expected.length || !timingSafeEqual(state, expected)) {
    return;
  }
  if (url.searchParams.has("error")) {
    return { canceled: true } as const;
  }

  const callbackClient = url.searchParams.get("client_id");
  const issuedClient = clientIdSchema.safeParse(callbackClient ?? registeredClient);
  const code = tokenSchema.safeParse(url.searchParams.get("code"));
  if (
    !issuedClient.success ||
    !code.success ||
    (registeredClient && issuedClient.data !== registeredClient)
  ) {
    return;
  }

  return { canceled: false, clientId: issuedClient.data, code: code.data } as const;
}

export async function browserAuthorization(
  hostId: string,
  registration: Registration | undefined,
  signal: AbortSignal,
  openBrowser: (url: string) => Promise<void>,
  requestConsent: boolean,
) {
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
  const state = randomBytes(32).toString("base64url");
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
  const nonce = randomBytes(32).toString("base64url");
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
  const verifier = randomBytes(32).toString("base64url");

  return new Promise<{
    clientId: string;
    code: string;
    nonce: string;
    verifier: string;
    redirectUri: string;
  }>((resolve, reject) => {
    let finished = false;
    let redirectUri: string;
    const finish = (settle: () => void) => {
      if (finished) {
        return;
      }
      finished = true;
      signal.removeEventListener("abort", abort);
      clearTimeout(timeout);
      server.close();
      settle();
    };
    const abort = () => finish(() => reject(new Error(t`ChatGPT sign-in was canceled.`)));
    const server = createServer({ requestTimeout: ms("10 seconds") }, (request, response) => {
      const expectedHost = new URL(redirectUri).host;
      const url = URL.parse(request.url ?? "", redirectUri);
      if (
        request.method !== "GET" ||
        request.headers.host !== expectedHost ||
        url?.host !== expectedHost ||
        url?.pathname !== callbackPath
      ) {
        response.writeHead(404).end();
        return;
      }

      const callback = parseCallback(url, state, registration?.clientId);
      if (!callback || finished) {
        response.writeHead(400).end();
        return;
      }

      response
        .writeHead(200, {
          // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          Connection: "close",
        })
        .end(t`Return to ggmail to finish signing in.`);
      if (callback.canceled) {
        abort();
        return;
      }

      finish(() =>
        resolve({ clientId: callback.clientId, code: callback.code, nonce, verifier, redirectUri }),
      );
    });
    const timeout = setTimeout(() => {
      finish(() => reject(new Error(t`ChatGPT sign-in timed out. Try again.`)));
    }, ms("10 minutes"));

    server.on("error", () =>
      finish(() => reject(new Error(t`Couldn't open the local ChatGPT sign-in page.`))),
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }

    server.listen(0, "127.0.0.1", () => {
      if (finished) {
        return;
      }
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(() => reject(new Error(t`Couldn't open the local ChatGPT sign-in page.`)));
        return;
      }

      // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
      redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;
      const url = new URL("/api/accounts/authorize", issuer);
      url.search = new URLSearchParams({
        client_id: registration?.clientId ?? dynamicClient,
        ext_agent_host_id: hostId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: scopes,
        resource,
        state,
        nonce,
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
        code_challenge_method: "S256",
        // oxlint-disable-next-line lingui/no-unlocalized-strings -- OAuth endpoint, wire value or encoding.
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      }).toString();

      if (!registration) {
        url.searchParams.set("agent_name_hint", "ggmail");
      }
      if (registration?.identity.email) {
        url.searchParams.set("login_hint", registration.identity.email);
      }

      if (requestConsent) {
        url.searchParams.set("prompt", "consent");
      }

      void openBrowser(url.href).catch(() => {
        finish(() => reject(new Error(t`Couldn't open your browser for ChatGPT sign-in.`)));
      });
    });
  });
}
