import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";

interface Props {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepConfigure({ state, setState, setError, onNext, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [configText, setConfigText] = useState<string>("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configParseError, setConfigParseError] = useState<string | null>(null);

  const handleRunOnboardNonInteractive = async () => {
    setError(null);
    setRunning(true);
    try {
      const args: string[] = ["--accept-risk"];
      await invoke("run_onboard", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
        args,
      });
      let text = await invoke<string>("read_openclaw_config");
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && (parsed as any).bind === "loopback") {
          (parsed as any).bind = "lan";
          await invoke("write_openclaw_config", {
            installDir: state.installPath,
            config: parsed,
          });
          text = JSON.stringify(parsed, null, 2) + "\n";
        }
      } catch {
        // If the existing config isn't valid JSON, just surface it as-is in the editor.
      }
      setConfigText(text);
      setConfigDirty(false);
      setConfigParseError(null);
      setState({ configSaved: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="step-card">
      <h2>Configure OpenClaw</h2>
      <p>
        OpenClaw is installed at <code>{state.installPath}</code>. You can
        configure environment variables or settings in that directory or via the
        OpenClaw CLI after setup.
      </p>
      <p>
        Optionally add the install directory to your PATH so you can run{" "}
        <code>openclaw</code> from any terminal.
      </p>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: "12px 0 8px" }}>Non-interactive onboarding</h3>
        <p>
          This runs <code>openclaw onboard --non-interactive --accept-risk</code> using OpenClaw defaults. On Windows,
          onboarding saves configuration to <code>%USERPROFILE%\.openclaw\openclaw.json</code>, the default OpenClaw config
          path (see <code>https://docs.openclaw.ai/cli/onboard</code> and{" "}
          <code>https://docs.openclaw.ai/security</code>).
        </p>

        <div className="step-actions" style={{ marginTop: 12 }}>
          {!state.configSaved ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunOnboardNonInteractive}
              disabled={running || !state.installPath}
              title={!state.installPath ? "Install OpenClaw first" : undefined}
            >
              {running ? (
                <>
                  <span className="spinner" />
                  Starting non-interactive onboarding…
                </>
              ) : (
                "Run openclaw onboard --non-interactive"
              )}
            </button>
          ) : (
            <p className="loading">Non-interactive onboarding has been triggered.</p>
          )}
        </div>
      </div>

      {state.configSaved && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ margin: "12px 0 8px" }}>Edit openclaw.json</h3>
          <p>
            This is the current contents of <code>%USERPROFILE%\.openclaw\openclaw.json</code>. You can edit it directly
            here and save.
          </p>
          <textarea
            value={configText}
            onChange={(e) => {
              setConfigText(e.target.value);
              setConfigDirty(true);
              // Lightweight live JSON validation
              const raw = e.target.value.trim();
              if (!raw) {
                setConfigParseError("openclaw.json cannot be empty.");
              } else {
                try {
                  JSON.parse(raw);
                  setConfigParseError(null);
                } catch {
                  setConfigParseError("Invalid JSON: fix syntax before saving.");
                }
              }
            }}
            spellCheck={false}
            style={{ width: "100%", minHeight: 220, fontFamily: "monospace", fontSize: 12 }}
          />
          {configParseError && (
            <p className="error-text" style={{ color: "#d33", marginTop: 6 }}>
              {configParseError}
            </p>
          )}
          <div className="step-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const fresh = await invoke<string>("read_openclaw_config");
                  setConfigText(fresh);
                  setConfigDirty(false);
                  setConfigParseError(null);
                } catch (e) {
                  setError(String(e));
                }
              }}
              disabled={running}
            >
              Reload from disk
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                setError(null);
                setRunning(true);
                try {
                  let parsed: unknown;
                  try {
                    parsed = JSON.parse(configText);
                  } catch {
                    throw new Error("openclaw.json must be valid JSON before saving.");
                  }
                  await invoke("write_openclaw_config", {
                    installDir: state.installPath,
                    config: parsed,
                  });
                  setConfigDirty(false);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setRunning(false);
                }
              }}
              disabled={running || !configDirty || Boolean(configParseError)}
            >
              Save openclaw.json
            </button>
          </div>
        </div>
      )}

      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: Run Gateway
        </button>
      </div>
    </div>
  );
}
