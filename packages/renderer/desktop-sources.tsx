import { ipc } from "@ggmail/shared/renderer/ipc";
import type { DesktopSource, DesktopSources } from "@ggmail/shared/types";
import { Button } from "@ggmail/ui/components/button";
import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ggmail/ui/components/tabs";
import { Trans } from "@lingui/react/macro";
import { AppWindowIcon, CheckIcon, MonitorIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PopupWindow } from "@/components/popup-window";
import { renderApp } from "@/lib/react";

function DesktopSources() {
  const [desktopSources, setDesktopSources] = useState<DesktopSources>([]);
  const [selectedDesktopSourceId, setSelectedDesktopSourceId] = useState<string>("");

  useEffect(() => {
    (async () => {
      setDesktopSources(await ipc.main.invoke("desktopSources.getSources"));
    })();
  }, []);

  const renderDesktopSources = (sources: DesktopSource[]) =>
    sources.map((source) => (
      <button
        key={source.id}
        type="button"
        aria-label={source.name}
        aria-pressed={selectedDesktopSourceId === source.id}
        title={source.name}
        className="relative grid min-w-0 content-start gap-2 rounded-2xl border border-border bg-card p-2.5 text-start text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-selected-foreground aria-pressed:bg-selected aria-pressed:text-selected-foreground"
        onClick={() => setSelectedDesktopSourceId(source.id)}
      >
        <span className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-canvas">
          <img src={source.thumbnail} alt="" className="size-full object-contain" />
        </span>
        <span className="truncate px-1 py-0.5 font-medium">{source.name}</span>
        {selectedDesktopSourceId === source.id && (
          <span
            aria-hidden="true"
            className="absolute end-3 top-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <CheckIcon className="size-3.5" />
          </span>
        )}
      </button>
    ));

  const screens: DesktopSources = [];
  const windows: DesktopSources = [];

  for (const desktopSource of desktopSources) {
    (desktopSource.id.startsWith("screen") ? screens : windows).push(desktopSource);
  }

  return (
    <div className="flex h-screen flex-col">
      <Tabs
        defaultValue="windows"
        onValueChange={() => setSelectedDesktopSourceId("")}
        className="flex-1 gap-0 overflow-hidden"
      >
        <div className="border-b bg-toolbar px-5 py-3">
          <TabsList className="min-h-10 w-full rounded-full">
            <TabsTrigger value="windows" className="rounded-full">
              <AppWindowIcon aria-hidden="true" />
              <Trans comment="Tab of the screen sharing picker listing the open application windows to share, never the Windows operating system">
                Windows
              </Trans>
            </TabsTrigger>
            <TabsTrigger value="screens" className="rounded-full">
              <MonitorIcon aria-hidden="true" />
              <Trans comment="Tab of the screen sharing picker listing the displays to share">
                Screens
              </Trans>
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="flex-1 overflow-hidden">
          <TabsContent
            value="windows"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-3 p-4"
          >
            {renderDesktopSources(windows)}
          </TabsContent>
          <TabsContent
            value="screens"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-3 p-4"
          >
            {renderDesktopSources(screens)}
          </TabsContent>
        </ScrollArea>
      </Tabs>
      <div className="flex justify-end gap-2 border-t px-5 py-3.5">
        <Button
          className="rounded-full px-5"
          variant="outline"
          onClick={() => {
            window.close();
          }}
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          className="rounded-full px-5"
          disabled={!selectedDesktopSourceId}
          onClick={() => {
            const selectedDesktopSource = desktopSources.find(
              (source) => source.id === selectedDesktopSourceId,
            );

            if (!selectedDesktopSource) {
              throw new Error("Couldn't find selected desktop source");
            }

            ipc.main.send("desktopSources.select", selectedDesktopSource);
          }}
        >
          <Trans
            context="screen sharing"
            comment="Button of the screen sharing picker that shares the window or screen picked"
          >
            Share
          </Trans>
        </Button>
      </div>
    </div>
  );
}

function DesktopSourcesPopup() {
  return (
    <PopupWindow>
      <DesktopSources />
    </PopupWindow>
  );
}

renderApp(DesktopSourcesPopup);
