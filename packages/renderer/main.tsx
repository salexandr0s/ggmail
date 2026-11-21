import { useState } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppToaster } from "@/components/app-toaster";
import { AssistantDrawer } from "@/components/assistant/assistant-panel";
import { VerticalTabs } from "@/components/vertical-tabs";
import { useMouseAccountSwitching } from "@/lib/hooks";
import { renderApp } from "@/lib/react";
import { Attachments } from "@/routes/attachments";
import "@/lib/ipc";

function Main() {
  useMouseAccountSwitching();
  const [showAssistant, setShowAssistant] = useState(false);

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen flex-col overflow-hidden">
        <AppTitlebar
          showAssistant={showAssistant}
          toggleAssistant={() => setShowAssistant((value) => !value)}
        />
        <div className="relative flex flex-1 overflow-hidden">
          <Switch>
            <Route path="/">
              <VerticalTabs />
              <div className="min-w-0 flex-1" />
              <AssistantDrawer
                open={showAssistant}
                close={(focusToggle = true) => {
                  setShowAssistant(false);
                  if (focusToggle) {
                    document.getElementById("mail-assistant-toggle")?.focus();
                  }
                }}
              />
            </Route>
            <Route path="/unified-inbox">
              <AppMain />
            </Route>
            <Route path="/attachments" component={Attachments} />
            <Route path="/download-history">
              <AppMain />
            </Route>
          </Switch>
        </div>
      </div>
      <AppToaster />
    </Router>
  );
}

renderApp(Main);
