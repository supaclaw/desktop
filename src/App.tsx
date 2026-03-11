import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GitHubRelease } from "./types";
import { StepWelcome } from "./steps/StepWelcome";
import { StepDownload } from "./steps/StepDownload";
import { StepInstall } from "./steps/StepInstall";
import { StepConfigure } from "./steps/StepConfigure";
import { StepGateway } from "./steps/StepGateway";
import { StepSkills } from "./steps/StepSkills";
import { StepDone } from "./steps/StepDone";
import "./App.css";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "download", title: "Download" },
  { id: "install", title: "Install" },
  { id: "configure", title: "Configure" },
  { id: "gateway", title: "Gateway" },
  { id: "skills", title: "Skills & Tools" },
  { id: "done", title: "Done" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export interface WizardState {
  releases: GitHubRelease[];
  selectedVersion: string;
  selectedAsset: string;
  /** Optional direct download URL (overrides GitHub release/asset selection) */
  downloadUrl: string;
  /** Optional basic auth username for `downloadUrl` */
  downloadUsername: string;
  /** Optional basic auth password for `downloadUrl` (kept in-memory by default) */
  downloadPassword: string;
  downloadPath: string;
  installPath: string;
  gatewayRunning: boolean;
  skillsInstalled: boolean;
  onboardRan: boolean;
  /** Optional HTTPS proxy URL for downloads (e.g. http://proxy.example.com:8080) */
  httpsProxy: string;
}

const defaultState: WizardState = {
  releases: [],
  selectedVersion: "",
  selectedAsset: "",
  downloadUrl: "",
  downloadUsername: "",
  downloadPassword: "",
  downloadPath: "",
  installPath: "",
  gatewayRunning: false,
  skillsInstalled: false,
  onboardRan: false,
  httpsProxy: "",
};

const SETTINGS_STORAGE_KEY = "openclaw-desktop-wizard.settings.v1";
type PersistedSettings = Pick<WizardState, "httpsProxy" | "downloadUrl" | "downloadUsername">;

function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<WizardState>(defaultState);
  const [error, setError] = useState<string | null>(null);

  const stepId = STEPS[stepIndex].id;

  const setStatePartial = useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      setState((s) => ({
        ...s,
        httpsProxy: typeof parsed.httpsProxy === "string" ? parsed.httpsProxy : s.httpsProxy,
        downloadUrl: typeof parsed.downloadUrl === "string" ? parsed.downloadUrl : s.downloadUrl,
        downloadUsername:
          typeof parsed.downloadUsername === "string"
            ? parsed.downloadUsername
            : s.downloadUsername,
      }));
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    const payload: PersistedSettings = {
      httpsProxy: state.httpsProxy,
      downloadUrl: state.downloadUrl,
      downloadUsername: state.downloadUsername,
    };
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failures (e.g. disabled)
    }
  }, [state.httpsProxy, state.downloadUrl, state.downloadUsername]);

  useEffect(() => {
    const unlisten = listen<{ loaded: number; total?: number; done: boolean }>(
      "download-progress",
      (e) => {
        if (e.payload.done) setError(null);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const goNext = useCallback(() => {
    setError(null);
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  }, [stepIndex]);

  const goBack = useCallback(() => {
    setError(null);
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const goTo = useCallback((id: StepId) => {
    const idx = STEPS.findIndex((s) => s.id === id);
    if (idx >= 0) setStepIndex(idx);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>OpenClaw Desktop Wizard</h1>
        <nav className="step-nav">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`step-dot ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
              title={s.title}
              onClick={() => goTo(s.id)}
              aria-current={i === stepIndex ? "step" : undefined}
            >
              <span className="step-num">{i + 1}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {stepId === "welcome" && (
          <StepWelcome
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
          />
        )}
        {stepId === "download" && (
          <StepDownload
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "install" && (
          <StepInstall
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "configure" && (
          <StepConfigure
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "gateway" && (
          <StepGateway
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "skills" && (
          <StepSkills
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "done" && (
          <StepDone state={state} onBack={goBack} />
        )}
      </main>
    </div>
  );
}

export default App;
