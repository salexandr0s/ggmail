import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { useLingui } from "@lingui/react/macro";
import { Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMenuButton } from "@/components/app-menu-button";
import { AppSidebar, settingsPages } from "@/components/app-sidebar";
import { AppToaster } from "@/components/app-toaster";
import { Titlebar, TitlebarTitle } from "@/components/titlebar";
import { renderApp } from "@/lib/react";
import "@/lib/ipc";
import "./settings.css";

function SettingsPage() {
  const [location] = useLocation();

  return (
    <main className="settings-main">
      <ScrollArea key={location} className="h-full">
        <div className="settings-page">
          {settingsPages.map(({ path, component: Page }) => (
            <Route key={path} path={path}>
              <Page />
            </Route>
          ))}
        </div>
      </ScrollArea>
    </main>
  );
}

function Settings() {
  const { t } = useLingui();

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen flex-col overflow-hidden">
        <Titlebar>
          <TitlebarTitle>
            {t({ message: "Settings", comment: "Title of the Settings window, in its titlebar" })}
          </TitlebarTitle>
          <AppMenuButton className="ml-auto" />
        </Titlebar>
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <SettingsPage />
        </div>
      </div>
      <AppToaster />
    </Router>
  );
}

renderApp(Settings);
