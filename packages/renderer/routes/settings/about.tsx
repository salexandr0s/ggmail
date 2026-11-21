import { ipc } from "@ggmail/shared/renderer/ipc";
import { Button } from "@ggmail/ui/components/button";
import { Field, FieldDescription, FieldTitle } from "@ggmail/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@ggmail/ui/components/item";
import { Skeleton } from "@ggmail/ui/components/skeleton";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import {
  Settings,
  SettingsContent,
  SettingsHeader,
  SettingsPanel,
  SettingsTitle,
} from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";

function DiagnosticInfo() {
  const { t } = useLingui();

  const { data: info, isPending } = useQuery({
    queryKey: ["about", "info"],
    queryFn: () => ipc.main.invoke("about.getInfo"),
  });

  if (isPending || !info) {
    return (
      <ItemGroup>
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </ItemGroup>
    );
  }

  const rows = [
    { label: t`Application version`, value: info.version },
    { label: t`Operating system`, value: info.os },
  ];

  return (
    <ItemGroup>
      {rows.map(({ label, value }) => (
        <Item key={label} variant="muted">
          <ItemContent className="min-w-0">
            <ItemTitle>{label}</ItemTitle>
            <ItemDescription className="truncate" data-truncated>
              {value}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <CopyButton value={value} />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function ExportLogsField() {
  const { t } = useLingui();

  const exportLogsMutation = useMutation({
    mutationFn: () => ipc.main.invoke("about.exportLogs"),
    onError: () => {
      toast.error(t`Couldn't export the logs.`);
    },
  });

  return (
    <Field>
      <FieldTitle>
        <Trans comment="Heading of the About ggmail section for exporting the application's logs">
          Logs
        </Trans>
      </FieldTitle>
      <FieldDescription>
        <Trans>
          Export the application logs to a file, to diagnose a problem or to share with support.
        </Trans>
      </FieldDescription>
      <div>
        <Button
          variant="outline"
          onClick={() => {
            exportLogsMutation.mutate();
          }}
          disabled={exportLogsMutation.isPending}
        >
          <Trans>Export logs</Trans>
        </Button>
      </div>
    </Field>
  );
}

export function AboutSettings() {
  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.about)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <DiagnosticInfo />

        <SettingsPanel>
          <ExportLogsField />
        </SettingsPanel>
      </SettingsContent>
    </Settings>
  );
}
