import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { t } from "@lingui/core/macro";
import type { AssistantConnection, AssistantModel } from "@ggmail/shared/assistant";
import { ms } from "@ggmail/shared/ms";
import { app, safeStorage, shell } from "electron";
import { z } from "zod";
import {
  browserAuthorization,
  buildCredentials,
  credentialsSchema,
  exchangeTokens,
  hasPlanPermission,
  InvalidGrantError,
  registrationSchema,
  revokeSession,
  verifyIdentity,
} from "./chatgpt-auth";
import { AssistantError, isUnauthorized, listModels } from "./responses";

const storageSchema = z
  .object({
    hostId: z.string().regex(/^urn:uuid:[\da-f-]{36}$/i),
    registration: registrationSchema.optional(),
    credentials: credentialsSchema.optional(),
  })
  .refine((record) => !record.credentials || record.registration);

type Record = z.infer<typeof storageSchema>;

function credentialPath() {
  return path.join(app.getPath("userData"), "assistant-credentials");
}

function requireProtectedStorage() {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
  ) {
    throw new AssistantError(t`Unlock your system credential store to connect ChatGPT.`);
  }
}

function loadRecord(): Record {
  const file = credentialPath();
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Local credential filename or host identifier.
  if (!fs.existsSync(file)) {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Stable OAuth host identifier.
    return { hostId: `urn:uuid:${randomUUID()}` };
  }

  requireProtectedStorage();
  try {
    return storageSchema.parse(JSON.parse(safeStorage.decryptString(fs.readFileSync(file))));
  } catch {
    throw new AssistantError(
      t`Couldn't read the saved ChatGPT connection. Disconnect it and sign in again.`,
    );
  }
}

function storeRecord(record: Record) {
  requireProtectedStorage();
  const file = credentialPath();
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- Local credential filename or host identifier.
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(record)), {
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export class ChatGPTConnection {
  private record: Record | undefined;
  private models: AssistantModel[] = [];
  private modelRequest: Promise<void> | undefined;
  private authorizing: AbortController | undefined;
  private renewing: Promise<string> | undefined;
  private disconnecting = false;
  private needsSignIn = false;

  private get saved() {
    this.record ??= loadRecord();
    return this.record;
  }

  private store(record: Record) {
    storeRecord(record);
    this.record = record;
  }

  private snapshot(error?: string): AssistantConnection {
    const record = this.record;
    const connected =
      this.needsSignIn === false &&
      record?.credentials &&
      hasPlanPermission(record.credentials.scopes);
    return {
      status: this.authorizing ? "connecting" : connected ? "connected" : "disconnected",
      email: record?.registration?.identity.email,
      models: connected ? this.models : [],
      error,
    };
  }

  async status(): Promise<AssistantConnection> {
    if (this.authorizing || this.disconnecting) {
      return this.snapshot();
    }
    try {
      if (
        this.saved.credentials &&
        hasPlanPermission(this.saved.credentials.scopes) &&
        !this.needsSignIn &&
        this.models.length === 0
      ) {
        await this.refreshModels();
      }
      return this.snapshot(this.needsSignIn ? t`Sign in to ChatGPT again to continue.` : undefined);
    } catch (error) {
      return this.snapshot(connectionMessage(error));
    }
  }

  async connect(): Promise<AssistantConnection> {
    if (this.authorizing || this.disconnecting) {
      return this.snapshot();
    }
    const controller = new AbortController();
    this.authorizing = controller;
    let errorMessage: string | undefined;

    try {
      const previous = this.saved;
      this.store(previous);
      const attempt = await browserAuthorization(
        previous.hostId,
        previous.registration,
        controller.signal,
        (url) => shell.openExternal(url),
        Boolean(
          previous.registration &&
          (!previous.credentials || !hasPlanPermission(previous.credentials.scopes)),
        ),
      );
      controller.signal.throwIfAborted();
      const tokens = await exchangeTokens({
        grant_type: "authorization_code",
        client_id: attempt.clientId,
        code: attempt.code,
        code_verifier: attempt.verifier,
        redirect_uri: attempt.redirectUri,
      });
      const credentials = buildCredentials(tokens);
      const identity = await verifyIdentity(credentials.idToken, attempt.clientId, attempt.nonce);
      controller.signal.throwIfAborted();

      if (previous.registration && previous.registration.identity.sub !== identity.sub) {
        throw new AssistantError(
          t`This sign-in used a different ChatGPT account. Use the account you originally connected.`,
        );
      }
      this.store({
        hostId: previous.hostId,
        registration: { clientId: attempt.clientId, identity },
        credentials,
      });
      this.needsSignIn = false;
      this.models = [];

      if (!hasPlanPermission(credentials.scopes)) {
        throw new AssistantError(
          t`Allow ggmail to use your ChatGPT plan in the browser and try again.`,
        );
      }
      await this.refreshModels();
    } catch (error) {
      errorMessage = controller.signal.aborted ? undefined : connectionMessage(error);
    } finally {
      this.authorizing = undefined;
    }

    return this.snapshot(errorMessage);
  }

  cancelSignIn() {
    this.authorizing?.abort();
  }

  async disconnect(): Promise<AssistantConnection> {
    if (this.authorizing || this.disconnecting) {
      return this.snapshot();
    }
    this.disconnecting = true;
    try {
      await this.renewing?.catch(() => {});
      await this.modelRequest?.catch(() => {});
      let record: Record | undefined;
      try {
        record = this.saved;
      } catch {
        // A damaged or inaccessible record can still be removed locally.
      }
      const revoked =
        record?.credentials && record.registration
          ? await revokeSession(
              record.registration.clientId,
              record.credentials.refreshToken,
            ).catch(() => false)
          : record !== undefined;
      if (record) {
        this.store({ hostId: record.hostId, registration: record.registration });
      } else {
        fs.rmSync(credentialPath(), { force: true });
        this.record = undefined;
      }
      this.models = [];
      this.needsSignIn = false;
      return this.snapshot(
        revoked
          ? undefined
          : t`Signed out here. Open ChatGPT settings to revoke ggmail's access there.`,
      );
    } catch (error) {
      return this.snapshot(connectionMessage(error));
    } finally {
      this.disconnecting = false;
    }
  }

  allowsModel(model: string) {
    return this.models.some(({ id }) => id === model);
  }

  async accessToken() {
    if (this.disconnecting || this.needsSignIn) {
      throw new AssistantError(t`Sign in to ChatGPT again to continue.`);
    }

    const { credentials, registration } = this.saved;
    if (!registration || !credentials || !hasPlanPermission(credentials.scopes)) {
      throw new AssistantError(t`Connect ChatGPT to use the mail assistant.`);
    }

    const now = Date.now();
    if (
      credentials.expiresAt > now + ms("1 minute") ||
      (credentials.expiresAt > now && credentials.refreshAt > now)
    ) {
      return credentials.accessToken;
    }

    this.renewing ??= this.renew().finally(() => {
      this.renewing = undefined;
    });
    return this.renewing;
  }

  invalidate(error: unknown) {
    if (isUnauthorized(error)) {
      this.needsSignIn = true;
    }
  }

  private async refreshModels() {
    this.modelRequest ??= (async () => {
      try {
        const models = await listModels(await this.accessToken());
        if (models.length === 0) {
          throw new AssistantError(t`No models are available for this ChatGPT account.`);
        }
        this.models = models;
      } catch (error) {
        this.invalidate(error);
        throw error;
      }
    })().finally(() => {
      this.modelRequest = undefined;
    });
    await this.modelRequest;
  }

  private async renew() {
    const record = this.saved;
    const { credentials, registration } = record;
    if (!credentials || !registration) {
      throw new AssistantError(t`Connect ChatGPT to use the mail assistant.`);
    }

    try {
      if (credentials.refreshAt > Date.now()) {
        throw new AssistantError(t`ChatGPT can't renew this session yet. Try again in a moment.`);
      }
      const tokens = await exchangeTokens({
        grant_type: "refresh_token",
        client_id: registration.clientId,
        refresh_token: credentials.refreshToken,
      });
      const replacement = buildCredentials(tokens, credentials);
      if (
        replacement.refreshToken === credentials.refreshToken ||
        replacement.scopes.some((scope) => !credentials.scopes.includes(scope))
      ) {
        throw new InvalidGrantError();
      }
      if (tokens.id_token) {
        const identity = await verifyIdentity(tokens.id_token, registration.clientId);
        if (identity.sub !== registration.identity.sub) {
          throw new InvalidGrantError();
        }
      }
      this.store({ ...record, credentials: replacement });
      if (!hasPlanPermission(replacement.scopes)) {
        this.needsSignIn = true;
      }
    } catch (error) {
      if (error instanceof AssistantError) {
        throw error;
      }
      // The server may have rotated the token even if the response was lost.
      this.needsSignIn = true;
    }

    if (this.needsSignIn) {
      throw new AssistantError(t`Your ChatGPT session couldn't be renewed. Sign in again.`);
    }

    const renewed = this.saved.credentials;
    if (!renewed) {
      throw new AssistantError(t`Sign in to ChatGPT again to continue.`);
    }
    return renewed.accessToken;
  }
}

function connectionMessage(error: unknown) {
  if (error instanceof AssistantError || error instanceof InvalidGrantError) {
    return error.message || t`Sign in to ChatGPT again to continue.`;
  }
  return t`Couldn't connect to ChatGPT. Try again.`;
}
