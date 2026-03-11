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

export function StepSkills({ state, setState, setError, onNext, onBack }: Props) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setError(null);
    setInstalling(true);
    try {
      await invoke("install_skills_tools", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
      });
      setState({ skillsInstalled: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="step-card">
      <h2>Install Skills & Tools</h2>
      <p>
        Install OpenClaw skills and tools so agents can use them. This runs{" "}
        <code>openclaw skills install</code> and <code>openclaw tools install</code>{" "}
        if supported by your OpenClaw version.
      </p>
      {state.skillsInstalled && (
        <p className="loading">Skills and tools install has been triggered.</p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-link" onClick={onNext}>
          Skip
        </button>
        {!state.skillsInstalled ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <>
                <span className="spinner" />
                Installing…
              </>
            ) : (
              "Install Skills & Tools"
            )}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
