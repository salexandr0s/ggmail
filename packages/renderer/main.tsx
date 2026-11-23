import { workspaceSidebarWidth } from "@ggmail/shared/constants";
import { ipc } from "@ggmail/shared/renderer/ipc";
import { useEffect, useState, type CSSProperties } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppToaster } from "@/components/app-toaster";
import { AssistantDrawer } from "@/components/assistant/assistant-panel";
import { appendAssistantQuote } from "@/components/assistant/prompt";
import { FollowUps } from "@/components/follow-ups";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { useMouseAccountSwitching } from "@/lib/hooks";
import { renderApp } from "@/lib/react";
import { useWindowWidthValue } from "@/lib/use-window-width";
import { Attachments } from "@/routes/attachments";
import { DownloadHistory } from "@/routes/download-history";
import { UnifiedInbox } from "@/routes/unified-inbox";
import "@/lib/ipc";

function Main() {
  const sidebarWidth = useWindowWidthValue(workspaceSidebarWidth);
  useMouseAccountSwitching();
  const [location] = useHashLocation();
  const [showAssistant, setShowAssistant] = useState(false);
  useEffect(
    () =>
      ipc.renderer.on("assistant.quote", (_event, text) => {
        appendAssistantQuote(text);
        setShowAssistant(true);
      }),
    [],
  );

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen flex-col overflow-hidden">
        <AppTitlebar
          showAssistant={showAssistant}
          toggleAssistant={() => setShowAssistant((value) => !value)}
        />
        <div
          className="relative flex flex-1 overflow-hidden"
          style={{ "--workspace-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
        >
          <WorkspaceSidebar />
          <Switch>
            <Route path="/">
              <div className="min-w-0 flex-1" />
            </Route>
            <Route path="/unified-inbox">
              <AppMain className="mail-workspace all-mail-page">
                <UnifiedInbox />
              </AppMain>
            </Route>
            <Route path="/attachments" component={Attachments} />
            <Route path="/waiting" nest>
              <AppMain className="mail-workspace follow-up-page-container">
                <FollowUps />
              </AppMain>
            </Route>
            <Route path="/download-history">
              <AppMain className="mail-workspace download-history">
                <DownloadHistory />
              </AppMain>
            </Route>
          </Switch>
          <AssistantDrawer
            open={showAssistant && location === "/"}
            close={(focusToggle = true) => {
              setShowAssistant(false);
              if (focusToggle) {
                document.getElementById("mail-assistant-toggle")?.focus();
              }
            }}
          />
        </div>
      </div>
      <AppToaster />
    </Router>
  );
}

renderApp(Main);
