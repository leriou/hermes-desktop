import {
  checkInstall,
  getConnectionConfig,
  setConnectionConfig,
  startSshTunnel,
  testRemoteConnection,
  verifyInstall,
} from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Welcome from "./screens/Welcome/Welcome";
import Install from "./screens/Install/Install";
import Setup from "./screens/Setup/Setup";
import Layout from "./screens/Layout/Layout";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import { captureScreenView } from "./utils/analytics";

type Screen = "splash" | "welcome" | "installing" | "setup" | "main";

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("splash");
  const [installError, setInstallError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<
    "local" | "remote" | "ssh"
  >("local");
  const [verifyWarning, setVerifyWarning] = useState(false);
  const isMac =
    !!(window as any).__TAURI_INTERNALS__ &&
    navigator.userAgent.includes("Macintosh");
  const runInstallCheck = useCallback(async () => {
    let next: Screen = "welcome";
    let error: string | null = null;
    let isRemote = false;

    try {
      const conn = await getConnectionConfig();
      isRemote = conn.mode === "remote" || conn.mode === "ssh";
      setConnectionMode(conn.mode);

      if (conn.mode === "ssh" && conn.ssh) {
        try {
          await startSshTunnel();
          next = "main";
        } catch (tunnelErr) {
          error = `SSH tunnel failed to start: ${(tunnelErr as Error).message}`;
          next = "welcome";
        }
      } else if (conn.mode === "remote" && conn.remoteUrl) {
        const ok = await testRemoteConnection(conn.remoteUrl);
        if (ok) {
          next = "main";
        } else {
          error = `Cannot reach remote Hermes at ${conn.remoteUrl}. Check the URL or switch to local mode.`;
          next = "welcome";
        }
      } else {
        const status = await checkInstall();
        if (!status.installed) {
          next = "welcome";
        } else if (!status.hasApiKey) {
          next = "setup";
        } else {
          next = "main";
        }
      }
    } catch {
      next = "welcome";
    }

    if (error) setInstallError(error);
    setScreen(next);

    // Background deep-verify after UI is up. Non-blocking.
    if ((next === "main" || next === "setup") && !isRemote) {
      verifyInstall().then((ok) => {
        if (!ok) setVerifyWarning(true);
      });
    }
  }, []);

  useEffect(() => {
    runInstallCheck();
  }, [runInstallCheck]);

  useEffect(() => {
    captureScreenView(screen);
  }, [screen]);

  const handleSplashFinished = useCallback(() => {
    /* splash transition is driven by the install check */
  }, []);

  function handleInstallComplete(): void {
    setInstallError(null);
    setScreen("setup");
  }

  function handleInstallFailed(error: string): void {
    setInstallError(error);
    setScreen("welcome");
  }

  function handleRetryInstall(): void {
    setInstallError(null);
    setScreen("installing");
  }

  function handleRecheck(): void {
    setInstallError(null);
    setScreen("splash");
    runInstallCheck();
  }

  async function handleSwitchToLocal(): Promise<void> {
    await setConnectionConfig("local", "", "");
    setConnectionMode("local");
    handleRecheck();
  }

  function handleVerifyReinstall(): void {
    setVerifyWarning(false);
    setInstallError(null);
    setScreen("installing");
  }

  function handleDismissVerifyWarning(): void {
    setVerifyWarning(false);
  }

  function renderScreen(): React.JSX.Element {
    switch (screen) {
      case "splash":
        return <SplashScreen onFinished={handleSplashFinished} />;
      case "welcome":
        return (
          <Welcome
            error={installError}
            connectionMode={connectionMode}
            onStart={handleRetryInstall}
            onRecheck={handleRecheck}
            onSwitchToLocal={handleSwitchToLocal}
          />
        );
      case "installing":
        return (
          <Install
            onComplete={handleInstallComplete}
            onFailed={handleInstallFailed}
            onCancel={() => setScreen("welcome")}
          />
        );
      case "setup":
        return (
          <Setup
            onComplete={() => setScreen("main")}
            verifyWarning={verifyWarning}
            onReinstall={handleVerifyReinstall}
            onDismissVerifyWarning={handleDismissVerifyWarning}
          />
        );
      case "main":
        return (
          <Layout
            verifyWarning={verifyWarning}
            onReinstall={handleVerifyReinstall}
            onDismissVerifyWarning={handleDismissVerifyWarning}
          />
        );
    }
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <div className="app">
          {isMac && <div className="drag-region" data-tauri-drag-region />}
          <div className="app-content">{renderScreen()}</div>
        </div>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
