import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { connectTasks, insertGoogleTask } from "./google-tasks";

const client = { client_id: "fixture.apps.googleusercontent.com", client_secret: "fixture" };
test("Google Tasks sign-in binds the loopback response, PKCE verifier and selected account", async () => {
  let challenge = "";
  let owner = "writer@example.test";
  const open = async (href: string) => {
    const params = new URL(href).searchParams;
    expect(params.get("login_hint")).toBe("writer@example.test");
    challenge = params.get("code_challenge") ?? "";
    const redirect = new URL(params.get("redirect_uri") ?? "");
    redirect.search = new URLSearchParams({ state: "other", code: "fixture" }).toString();
    expect((await fetch(redirect)).status).toBe(400);
    redirect.searchParams.set("state", params.get("state") ?? "");
    expect((await fetch(redirect)).status).toBe(200);
  };
  const google: typeof fetch = Object.assign(
    async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(url).includes("/token")) {
        const verifier = new URLSearchParams(String(init?.body)).get("code_verifier") ?? "";
        expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
        return Response.json({ access_token: "test-token", expires_in: 3600 });
      }
      return Response.json({ email: owner, verified_email: true });
    },
    fetch,
  );
  const connect = () =>
    connectTasks(client, "writer@example.test", AbortSignal.timeout(5000), open, google);
  expect((await connect()).token).toBe("test-token");
  owner = "other@example.test";
  await expect(connect()).rejects.toThrow("account mismatch");
});

test("clearing the date omits it, and a successful insert without a view link still succeeds", async () => {
  const google: typeof fetch = Object.assign(
    async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        title: "Revised proposal",
        notes: "Source email",
      });
      return Response.json({ webViewLink: "https://example.test/unrelated" });
    },
    fetch,
  );
  expect(
    await insertGoogleTask(
      "test-token",
      { title: "Revised proposal", due: "" },
      "Source email",
      google,
    ),
  ).toEqual({ status: 200, url: undefined });
});
