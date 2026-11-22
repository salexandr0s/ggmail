import { Button } from "@ggmail/ui/components/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@ggmail/ui/components/dialog";
import { ScrollArea } from "@ggmail/ui/components/scroll-area";
import { useIsMobile } from "@ggmail/ui/hooks/use-mobile";
import { useLingui } from "@lingui/react/macro";
import { MenuIcon } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMenuButton } from "@/components/app-menu-button";
import { AppSidebar, settingsPages } from "@/components/app-sidebar";
import { AppToaster } from "@/components/app-toaster";
import { Titlebar, TitlebarTitle } from "@/components/titlebar";
import { renderApp } from "@/lib/react";
import "@/lib/ipc";
import "./settings.css";

function SettingsPage({ main }: { main: RefObject<HTMLElement | null> }) {
  const [location] = useLocation();

  return (
    <main ref={main} tabIndex={-1} className="settings-main">
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

function SettingsLayout() {
  const { t } = useLingui();
  const title = t({
    message: "Settings",
    comment: "Title of the Settings window, in its titlebar",
  });
  const compact = useIsMobile();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const chosePage = useRef(false);

  useEffect(() => {
    setOpen(false);
  }, [compact, location]);

  useHotkeys(
    "/",
    (event) => {
      if (
        document.querySelector(
          ':is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]):not([data-closed])',
        )
      ) {
        return;
      }
      event.preventDefault();
      if (compact) {
        chosePage.current = false;
        setOpen(true);
      } else {
        input.current?.focus();
      }
    },
    { useKey: true },
    [compact],
  );

  return (
    <>
      <div className="flex h-screen flex-col overflow-hidden">
        <Titlebar>
          {compact ? (
            <Dialog
              open={open}
              onOpenChange={(next) => {
                if (next) {
                  chosePage.current = false;
                }
                setOpen(next);
              }}
            >
              <DialogTrigger
                ref={trigger}
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="settings-nav-trigger draggable-none"
                  />
                }
                aria-keyshortcuts="/"
                title={t`Filter pages`}
              >
                <MenuIcon aria-hidden="true" />
                {title}
              </DialogTrigger>
              <DialogContent
                className="settings-nav-dialog"
                initialFocus={input}
                finalFocus={() =>
                  chosePage.current
                    ? (main.current?.querySelector("h1") ?? main.current)
                    : trigger.current
                }
                closeLabel={t`Close`}
              >
                <DialogTitle>{title}</DialogTitle>
                <AppSidebar
                  input={input}
                  onChoose={() => {
                    chosePage.current = true;
                    setOpen(false);
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : (
            <TitlebarTitle>{title}</TitlebarTitle>
          )}
          <AppMenuButton className="ml-auto" />
        </Titlebar>
        <div className="flex min-h-0 flex-1 overflow-hidden bg-sidebar">
          {!compact && <AppSidebar input={input} />}
          <SettingsPage main={main} />
        </div>
      </div>
      <AppToaster />
    </>
  );
}

function Settings() {
  return (
    <Router hook={useHashLocation}>
      <SettingsLayout />
    </Router>
  );
}

renderApp(Settings);
