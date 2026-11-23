import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "ggmail-task-grants-"));
mock.module("electron", () => ({ app: { getPath: () => dir } }));
mock.module("./assistant/connection", () => ({
  canStoreSecrets: () => true,
  readSecret: (f: string) => readFileSync(f, "utf8"),
  writeSecret: (f: string, s: string) => writeFileSync(f, s),
}));
const { TaskConnection } = await import("./google-task-connections");
const client = { client_id: "test.apps.googleusercontent.com", client_secret: "fixture" };
const file = path.join(dir, "fixture");
const auth = { token: "expired", refreshToken: "offline", expires: 0 };
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  mock.restore();
  rmSync(file, { force: true });
});
test("two drafts share one renewal after restart, rotated grants survive, disconnect removes it", async () => {
  new TaskConnection(file).remember(client, auth);
  const restored = new TaskConnection(file);
  const exchange = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ access_token: "current", expires_in: 3600, refresh_token: "rotated" }),
  );
  expect(await Promise.all([restored.token(), restored.token()])).toEqual(["current", "current"]);
  expect(await restored.token()).toBe("current");
  expect(exchange).toHaveBeenCalledTimes(1);
  expect(JSON.parse(readFileSync(file, "utf8")).refreshToken).toBe("rotated");
  restored.forget();
  expect(restored.connected).toBe(false);
  expect(existsSync(file)).toBe(false);
});
test("revoked consent prompts reconnection, and a late refresh cannot undo disconnect", async () => {
  const session = new TaskConnection(file);
  session.remember(client, auth);
  const exchange = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ error: "invalid_grant" }, { status: 400 }),
  );
  expect(await session.token()).toBeUndefined();
  expect(session.connected).toBe(false);
  session.remember(client, auth);
  const waiting = Promise.withResolvers<Response>();
  exchange.mockReturnValue(waiting.promise);
  const pending = session.token();
  session.forget();
  waiting.resolve(Response.json({ access_token: "late", expires_in: 3600 }));
  expect(await pending).toBeUndefined();
  expect(session.connected).toBe(false);
});
test("a saved grant that cannot be read asks for a new connection", async () => {
  writeFileSync(file, "{");
  const restored = new TaskConnection(file);
  expect(restored.connected).toBe(true);
  expect(await restored.token()).toBeUndefined();
  expect(restored.connected).toBe(false);
});
