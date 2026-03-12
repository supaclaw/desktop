import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BuildInfo, GitHubRelease } from "./types";
import { StepWelcome } from "./steps/StepWelcome";
import { StepDownload } from "./steps/StepDownload";
import { StepInstall } from "./steps/StepInstall";
import { StepConfigure } from "./steps/StepConfigure";
import { StepGateway } from "./steps/StepGateway";
import { StepSkills } from "./steps/StepSkills";
import { StepDone } from "./steps/StepDone";
import { LANGUAGE_LABELS, STEP_TITLES, TEXT, type Language } from "./i18n";
import "./App.css";

const PROJECT_GITHUB_URL = "https://github.com/supaclaw/desktop";

const STEPS = [
  { id: "welcome" },
  { id: "download" },
  { id: "install" },
  { id: "configure" },
  { id: "gateway" },
  { id: "skills" },
  { id: "done" },
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
  configSaved: boolean;
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
  configSaved: false,
  httpsProxy: "",
};

const SETTINGS_STORAGE_KEY = "openclaw-desktop-wizard.settings.v1";
type PersistedSettings = Pick<WizardState, "httpsProxy" | "downloadUrl" | "downloadUsername">;

function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<WizardState>(defaultState);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("zh");
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

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

  useEffect(() => {
    invoke<BuildInfo>("get_build_info")
      .then((info) => setBuildInfo(info))
      .catch(() => setBuildInfo(null));
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

  const handleCleanTemp = useCallback(() => {
    setError(null);
    invoke<number>("clean_openclaw_temp")
      .then((count) => {
        const msgZh =
          count > 0
            ? `已清理 ${count} 个 OpenClaw 临时项。`
            : "没有找到可清理的 OpenClaw 临时数据。";
        const msgEn =
          count > 0
            ? `Cleaned ${count} OpenClaw temp item${count === 1 ? "" : "s"}.`
            : "No OpenClaw temp data found to clean.";
        window.alert(language === "zh" ? msgZh : msgEn);
      })
      .catch((e) => {
        const msg =
          language === "zh"
            ? `清理 OpenClaw 临时数据失败：${String(e)}`
            : `Failed to clean OpenClaw temp data: ${String(e)}`;
        setError(msg);
      });
  }, [language]);

  const openProjectGitHub = useCallback(() => {
    invoke("open_url", { url: PROJECT_GITHUB_URL }).catch(() => {
      // Fallback for non-Tauri contexts (e.g. browser preview)
      window.open(PROJECT_GITHUB_URL, "_blank", "noreferrer");
    });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{TEXT.appTitle[language]}</h1>
        {buildInfo && (
          <div className="build-info" aria-label="Build information">
            v{buildInfo.version} · {buildInfo.commit}
            {buildInfo.dirty ? "*" : ""}
            {buildInfo.commit_date ? ` · ${buildInfo.commit_date}` : ""}
          </div>
        )}
        <div className="header-actions" aria-label="Header actions">
          <button
            type="button"
            className="icon-button"
            onClick={handleCleanTemp}
            aria-label={language === "zh" ? "清理 OpenClaw 临时数据" : "Clean OpenClaw temp data"}
            title={
              language === "zh"
                ? "从本机临时目录中删除 OpenClaw 相关缓存（例如 C:\\Users\\<你>\\AppData\\Local\\Temp）"
                : "Delete OpenClaw-related cache from local temp directories (e.g. C:\\Users\\<you>\\AppData\\Local\\Temp)"
            }
          >
            <span className="icon">🧹</span>
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={openProjectGitHub}
            aria-label={language === "zh" ? "打开项目 GitHub" : "Open project on GitHub"}
            title={language === "zh" ? "GitHub：supaclaw/desktop" : "GitHub: supaclaw/desktop"}
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.38 6.84 9.74.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05.8-.23 1.66-.34 2.51-.34.85 0 1.71.12 2.51.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.82-4.57 5.08.36.32.68.96.68 1.94 0 1.4-.01 2.52-.01 2.86 0 .26.18.58.69.48A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
            </svg>
          </button>

          <button
            type="button"
            className="language-toggle"
            onClick={() => setLanguage((prev) => (prev === "en" ? "zh" : "en"))}
            aria-label={language === "en" ? "Switch to Chinese" : "切换到英文"}
          >
            {language === "en" ? "EN" : "中文"}
          </button>
        </div>
        <nav className="step-nav">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`step-dot ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
              title={STEP_TITLES[s.id][language]}
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
            language={language}
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
          />
        )}
        {stepId === "download" && (
          <StepDownload
            language={language}
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "install" && (
          <StepInstall
            language={language}
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "configure" && (
          <StepConfigure
            language={language}
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "gateway" && (
          <StepGateway
            language={language}
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "skills" && (
          <StepSkills
            language={language}
            state={state}
            setState={setStatePartial}
            setError={setError}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {stepId === "done" && (
          <StepDone language={language} state={state} onBack={goBack} />
        )}
      </main>
    </div>
  );
}

export default App;
