import fs from "node:fs";
import path from "node:path";
import {
  assistantProviderSchema,
  type AssistantConnection,
  type AssistantProvider,
  type AssistantModel,
  type ApiProvider,
  type ConnectionState,
} from "@ggmail/shared/assistant";
import { t } from "@lingui/core/macro";
import { app } from "electron";
import { CachedStore } from "@/lib/cached-store";
import { anthropicReply } from "./anthropic";
import { cliIdentity, cliModels, claudeCliReply } from "./claude-cli";
import { ChatGPTConnection, readSecret, writeSecret } from "./connection";
import {
  AssistantError,
  isUnauthorized,
  listApiModels,
  respond,
  type ResponseOptions,
} from "./responses";

function keyPath(provider: ApiProvider) {
  return path.join(app.getPath("userData"), `assistant-key-${provider}`);
}

function failure(error: unknown) {
  return error instanceof AssistantError
    ? error.message
    : t`Couldn't connect to the AI provider. Try again.`;
}

export class AssistantProviders {
  private readonly settings = new CachedStore<{ provider: AssistantProvider; cliAccount: string }>({
    name: "assistant-settings",
    defaults: { provider: "chatgpt", cliAccount: "" },
  });
  private readonly chatgpt = new ChatGPTConnection();
  private models: AssistantModel[] = [];
  private generation = 0;
  private pending?: AssistantConnection;

  get provider() {
    return assistantProviderSchema.parse(this.settings.get("provider"));
  }

  async status(): Promise<AssistantConnection> {
    const provider = this.provider;
    const generation = this.generation;
    if (this.pending) {
      return this.pending;
    }
    let state: ConnectionState = { status: "disconnected", models: [] };
    try {
      if (provider === "chatgpt") {
        state = await this.chatgpt.status();
      } else if (provider === "claude-cli") {
        const bound = this.settings.get("cliAccount");
        if (bound) {
          state.configured = true;
          const { fingerprint, email } = await cliIdentity();
          if (bound !== fingerprint) {
            throw new AssistantError(t`The Claude Code account changed. Reconnect in AI settings.`);
          }
          state = { configured: true, status: "connected", models: cliModels, email };
        }
      } else if (fs.existsSync(keyPath(provider))) {
        state.configured = true;
        const models = this.models.length
          ? this.models
          : await listApiModels(provider, readSecret(keyPath(provider)));
        state = { configured: true, status: "connected", models };
      }
    } catch (error) {
      state.error = failure(error);
    }
    if (generation !== this.generation) {
      return this.status();
    }
    this.models = state.models;
    return { ...state, provider };
  }

  // All mutations originate in Settings. Invalidate in-flight catalogue reads before
  // changing credentials, including a replacement key for the same provider.
  async change(
    provider: AssistantProvider,
    action: "select" | "connect" | "disconnect",
    key: string | undefined,
    publish: (state: AssistantConnection) => void,
  ) {
    if (this.pending || (action !== "select" && this.provider !== provider)) {
      return this.status();
    }
    this.generation++;
    this.models = [];
    this.pending = {
      provider,
      status: "connecting",
      models: [],
      signingIn: action === "connect" && provider === "chatgpt",
    };
    let errorMessage: string | undefined;
    let oauthState: ConnectionState | undefined;
    try {
      if (action === "select") {
        this.settings.set("provider", provider);
      }
      publish(this.pending);
      if (action === "connect") {
        if (provider === "chatgpt") {
          oauthState = await this.chatgpt.connect();
        } else if (provider === "claude-cli") {
          this.settings.set("cliAccount", (await cliIdentity()).fingerprint);
        } else {
          if (!key || !/^[!-~]{1,4096}$/.test(key)) {
            throw new AssistantError(t`Enter a valid API key.`);
          }
          const models = await listApiModels(provider, key);
          writeSecret(keyPath(provider), key);
          this.models = models;
        }
      } else if (action === "disconnect") {
        if (provider === "chatgpt") {
          oauthState = await this.chatgpt.disconnect();
        } else if (provider === "claude-cli") {
          this.settings.set("cliAccount", "");
        } else {
          fs.rmSync(keyPath(provider), { force: true });
        }
      }
    } catch (error) {
      errorMessage = failure(error);
    } finally {
      this.pending = undefined;
    }
    const generation = this.generation;
    const state = oauthState ? { ...oauthState, provider } : await this.status();
    if (generation !== this.generation) {
      return this.status();
    }
    this.models = state.models;
    if (errorMessage) {
      state.error = errorMessage;
    }
    publish(state);
    return state;
  }

  cancelSignIn() {
    this.chatgpt.cancelSignIn();
  }

  allowsModel(provider: AssistantProvider, model: string) {
    return (
      !this.pending && provider === this.provider && this.models.some((entry) => entry.id === model)
    );
  }

  async reply(provider: AssistantProvider, options: ResponseOptions) {
    if (!this.allowsModel(provider, options.model)) {
      throw new AssistantError(t`Choose an available model in the mail assistant.`);
    }
    if (provider === "claude-cli") {
      return claudeCliReply(options, this.settings.get("cliAccount"));
    }
    if (provider === "chatgpt") {
      return respond({ ...options, token: await this.chatgpt.accessToken() });
    }
    const token = readSecret(keyPath(provider));
    return provider === "anthropic"
      ? anthropicReply(options, token)
      : respond({ ...options, provider, token });
  }

  invalidate(error: unknown) {
    if (this.provider === "chatgpt") {
      this.chatgpt.invalidate(error);
    }
    if (isUnauthorized(error)) {
      this.models = [];
    }
  }
}
