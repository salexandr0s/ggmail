import {
  assistantProviderSchema,
  providerNames,
  type AssistantProvider,
} from "@ggmail/shared/assistant";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@ggmail/ui/components/field";
import { Input } from "@ggmail/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ggmail/ui/components/select";
import { Trans, useLingui } from "@lingui/react/macro";
import { CircleCheckIcon } from "lucide-react";
import { useState } from "react";
import chatGPTLogo from "@/components/assistant/chatgpt-logo.svg";
import { ModelLogo } from "@/components/assistant/model-logo";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";
import { useAssistantConnection } from "@/lib/use-assistant-connection";
import { useAssistantModel } from "@/lib/use-assistant-model";

const providers = assistantProviderSchema.options.map((value) => ({
  value,
  label: providerNames[value],
  provider: value,
}));

type Choice<Value extends string> = {
  value: Value;
  label: string;
  provider: AssistantProvider;
  model?: string;
};

function IdentityPicker<Value extends string>({
  id,
  label,
  items,
  value,
  disabled,
  onSelect,
}: {
  id: string;
  label: string;
  items: Choice<Value>[];
  value: Value;
  disabled: boolean;
  onSelect: (value: Value) => void;
}) {
  const selected = items.find((item) => item.value === value);
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => next && onSelect(next)}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0 gap-3 bg-background px-3 shadow-none hover:bg-muted/50 data-[size=default]:h-11 dark:bg-background"
          title={selected?.label}
        >
          {selected && (
            <ModelLogo provider={selected.provider} model={selected.model} className="size-5" />
          )}
          <SelectValue className="min-w-0">
            <span className="truncate">{selected?.label}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              title={item.label}
              className="min-h-9 px-3 pr-8 [&>span:first-child]:min-w-0 [&>span:first-child]:shrink [&>span:first-child]:items-center"
            >
              <ModelLogo provider={item.provider} model={item.model} className="size-5" />
              <span className="truncate">{item.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function AISettings() {
  const { t } = useLingui();
  const { connection, refresh } = useAssistantConnection();
  const [key, setKey] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const provider = connection?.provider ?? "chatgpt";
  const api = provider !== "chatgpt" && provider !== "claude-cli";
  const busy = working || !connection || connection.status === "connecting";
  const email = connection?.email;
  const connected = connection?.status === "connected";
  const models = connection?.models ?? [];
  const { model, chooseModel } = useAssistantModel(provider, models);
  const showKey = api && !connected;
  const issue = error || connection?.error;
  const canConnect = !busy && !connected && (!api || Boolean(key.trim()));

  async function update(
    action: "connect" | "disconnect" | "select",
    selected: AssistantProvider = provider,
  ) {
    setWorking(true);
    setError("");
    setKey("");
    try {
      if (action === "select") {
        await ipc.main.invoke("assistant.selectProvider", selected);
      } else if (action === "disconnect") {
        await ipc.main.invoke("assistant.disconnect", selected);
      } else {
        await ipc.main.invoke("assistant.connect", selected, api ? key.trim() : undefined);
      }
    } catch {
      setError(t`Couldn't update the AI connection. Try again.`);
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Settings>
      <SettingsHeader className="mb-5">
        <SettingsTitle>{t(settingsPageLabels.ai)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
          <FieldGroup className="p-4">
            <IdentityPicker
              id="ai-provider"
              label={t`Mail assistant provider`}
              items={providers}
              value={provider}
              disabled={busy}
              onSelect={(value) => void update("select", value)}
            />
            {connected && model && (
              <IdentityPicker
                id="ai-model"
                label={t`Assistant model`}
                items={models.map(({ id, label }) => ({ value: id, label, provider, model: id }))}
                value={model.id}
                disabled={busy}
                onSelect={chooseModel}
              />
            )}
          </FieldGroup>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canConnect) {
                void update("connect");
              }
            }}
            className="space-y-3 rounded-b-xl border-t bg-muted/35 px-4 py-3"
          >
            {showKey && (
              <Field>
                <FieldLabel htmlFor="ai-api-key">
                  <Trans>API key</Trans>
                </FieldLabel>
                <Input
                  id="ai-api-key"
                  type="password"
                  aria-describedby={issue ? "ai-connection-error" : "ai-key-note"}
                  aria-invalid={Boolean(issue) || undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  maxLength={4096}
                  disabled={busy}
                  onChange={(event) => setKey(event.target.value)}
                />
                <FieldDescription id="ai-key-note" className="text-xs">
                  <Trans>ggmail encrypts your key on this device.</Trans>
                </FieldDescription>
              </Field>
            )}
            {provider === "claude-cli" && !connected && (
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Use the Claude Code subscription signed in on this computer. To sign in, run{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                    claude auth login
                  </code>{" "}
                  in a terminal.
                </Trans>
              </p>
            )}
            {connection?.signingIn && (
              <p role="status" className="text-sm">
                <Trans>Finish signing in in your browser.</Trans>
              </p>
            )}
            {issue && (
              <p id="ai-connection-error" role="alert" className="text-sm text-destructive">
                {issue}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {connected && (
                <p role="status" className="mr-auto flex min-w-0 items-center gap-2 text-sm">
                  <CircleCheckIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="wrap-anywhere">
                    {email ? t`Connected as ${email}` : t`Connected`}
                  </span>
                </p>
              )}
              {!connected && (
                <Button
                  type="submit"
                  disabled={!canConnect}
                  data-oai-siwc-button={provider === "chatgpt" ? "" : undefined}
                  className={
                    provider === "chatgpt" ? "bg-black text-white hover:bg-neutral-800" : undefined
                  }
                >
                  {provider === "chatgpt" ? (
                    <>
                      <img src={chatGPTLogo} className="size-4" alt="" />
                      <Trans>Continue with ChatGPT</Trans>
                    </>
                  ) : provider === "claude-cli" ? (
                    <Trans>Use Claude Code session</Trans>
                  ) : (
                    <Trans>Connect</Trans>
                  )}
                </Button>
              )}
              {(connected ||
                connection?.configured ||
                connection?.email ||
                (provider === "chatgpt" && connection?.error)) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void update("disconnect")}
                >
                  <Trans>Disconnect</Trans>
                </Button>
              )}
              {connection?.signingIn && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => ipc.main.send("assistant.cancelSignIn")}
                >
                  <Trans>Cancel sign-in</Trans>
                </Button>
              )}
              {connected && !connection.models.length && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  <Trans>Reload models</Trans>
                </Button>
              )}
            </div>
          </form>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          <Trans>
            ggmail sends your prompt and relevant mail to this provider when you ask a question.
            Switching providers starts a new chat.
          </Trans>
        </p>
      </SettingsContent>
    </Settings>
  );
}
