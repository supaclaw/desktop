import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";

interface Props {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepInstall({ state, setState, setError, onNext, onBack }: Props) {
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (state.installPath) return;
    invoke<string>("get_install_path")
      .then((p) => setState({ installPath: p }))
      .catch(() => setState({ installPath: "" }));
  }, [state.installPath, setState]);

  const handleInstall = async () => {
    if (!state.downloadPath || !state.installPath) {
      setError("Download path or install path is missing.");
      return;
    }
    setError(null);
    setInstalling(true);
    try {
      await invoke("install_openclaw", {
        archivePath: state.downloadPath,
        installDir: state.installPath,
      });
      onNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="step-card">
      <h2>Install OpenClaw</h2>
      <p>
        Extract or copy the downloaded file to an install directory. You can
        change the path below.
      </p>
      <label>Install directory</label>
      <input
        type="text"
        value={state.installPath}
        onChange={(e) => setState({ installPath: e.target.value })}
        placeholder="e.g. C:\Users\You\AppData\Local\OpenClaw"
      />
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleInstall}
          disabled={installing || !state.installPath.trim()}
        >
          {installing ? (
            <>
              <span className="spinner" />
              Installing…
            </>
          ) : (
            "Install"
          )}
        </button>
      </div>
    </div>
  );
}
