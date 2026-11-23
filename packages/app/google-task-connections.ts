import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import { canStoreSecrets, readSecret, writeSecret } from "./assistant/connection";
import { desktopClient, refreshTasks, type Client, type connectTasks } from "./google-tasks";

type Access = Awaited<ReturnType<typeof connectTasks>>;
const grantSchema = z.object({ client: desktopClient, refreshToken: z.string().min(1) });
function fileKey(value: string) {
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Filesystem-safe identifier.
  return createHash("sha256").update(value).digest("hex");
}
function accountDir(id: string) {
  return path.join(app.getPath("userData"), "google-task-connections", fileKey(id));
}
const accounts = new Map<string, Map<string, TaskConnection>>();
export function taskConnection(accountId: string, owner: string) {
  let byOwner = accounts.get(accountId);
  if (!byOwner) {
    byOwner = new Map();
    accounts.set(accountId, byOwner);
  }
  const key = owner.toLowerCase();
  let connection = byOwner.get(key);
  if (!connection) {
    connection = new TaskConnection(path.join(accountDir(accountId), fileKey(key)));
    byOwner.set(key, connection);
  }
  return connection;
}
export function resetTaskConnections() {
  for (const accountId of accounts.keys()) {
    forgetTaskAccount(accountId);
  }
  rmSync(path.join(app.getPath("userData"), "google-task-connections"), {
    recursive: true,
    force: true,
  });
  rmSync(path.join(app.getPath("userData"), "google-tasks-desktop-client"), { force: true });
}
export function forgetTaskAccount(accountId: string) {
  for (const connection of accounts.get(accountId)?.values() ?? []) {
    connection.forget();
  }
  accounts.delete(accountId);
  rmSync(accountDir(accountId), { recursive: true, force: true });
}

export class TaskConnection {
  private access?: Access;
  private grant?: z.infer<typeof grantSchema>;
  private renewal?: Promise<string | undefined>;
  generation = 0;
  constructor(private readonly file: string) {}
  get connected() {
    return !!this.validToken || !!this.grant || existsSync(this.file);
  }
  private get validToken() {
    return this.access && this.access.expires > Date.now() ? this.access.token : undefined;
  }
  forget(rejectedToken?: string) {
    if (rejectedToken && this.access?.token !== rejectedToken) {
      return;
    }
    this.generation++;
    this.access = undefined;
    this.grant = undefined;
    this.renewal = undefined;
    rmSync(this.file, { force: true });
  }
  remember(client: Client, auth: Access) {
    this.generation++;
    this.renewal = undefined;
    this.grant = auth.refreshToken ? { client, refreshToken: auth.refreshToken } : undefined;
    if (this.grant && canStoreSecrets()) {
      mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      writeSecret(this.file, JSON.stringify(this.grant));
    } else {
      rmSync(this.file, { force: true });
    }
    this.access = auth;
  }
  rejectToken(token: string) {
    if (this.access?.token === token) {
      this.access = undefined;
    }
  }
  async token() {
    if (this.validToken) {
      return this.validToken;
    }
    if (!this.grant && !existsSync(this.file)) {
      return;
    }
    if (!this.renewal) {
      const generation = this.generation;
      this.renewal = this.refresh(generation).finally(() => {
        if (this.generation === generation) {
          this.renewal = undefined;
        }
      });
    }
    return this.renewal;
  }
  private readGrant() {
    try {
      return grantSchema.parse(JSON.parse(readSecret(this.file)));
    } catch {
      // A saved grant that can no longer be read cannot be renewed either.
      // Kept, it would show the account as connected while every save failed.
      return undefined;
    }
  }
  private async refresh(generation: number) {
    const grant = this.grant ?? this.readGrant();
    if (!grant) {
      this.forget();
      return;
    }
    const auth = await refreshTasks(grant.client, grant.refreshToken);
    if (generation !== this.generation) {
      return;
    }
    if (!auth) {
      this.forget();
      return;
    }
    if (auth.refreshToken && auth.refreshToken !== grant.refreshToken) {
      this.grant = { ...grant, refreshToken: auth.refreshToken };
      if (canStoreSecrets()) {
        writeSecret(this.file, JSON.stringify(this.grant));
      }
    }
    this.access = auth;
    return auth.token;
  }
}
