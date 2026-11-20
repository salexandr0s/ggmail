import { expect, test } from "bun:test";
import { parseCallback } from "./chatgpt-auth";

function callback(parameters: string) {
  return new URL(`http://127.0.0.1:8647/auth/callback?${parameters}`);
}

test("a new sign-in uses the issued ChatGPT client ID", () => {
  expect(
    parseCallback(callback("state=state&client_id=oaiapp_example&code=code"), "state"),
  ).toEqual({
    canceled: false,
    clientId: "oaiapp_example",
    code: "code",
  });
  expect(parseCallback(callback("state=state&code=code"), "state")).toBeUndefined();
});

test("a returning sign-in rejects duplicate state or a different client ID", () => {
  const registered = "oaiapp_example";
  expect(parseCallback(callback("state=state&code=code"), "state", registered)?.canceled).toBe(
    false,
  );
  expect(
    parseCallback(callback("state=wrong&error=access_denied"), "state", registered),
  ).toBeUndefined();
  expect(
    parseCallback(callback("state=state&state=state&code=code"), "state", registered),
  ).toBeUndefined();
  expect(
    parseCallback(callback("state=state&client_id=oaiapp_other&code=code"), "state", registered),
  ).toBeUndefined();
});
