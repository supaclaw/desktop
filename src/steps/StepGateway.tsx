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

export function StepGateway({ state, setState, setError, onNext, onBack }: Props) {
  const [starting, setStarting] = useState(false);

  const handleStartGateway = async () => {
    setError(null);
    setStarting(true);
    try {
      await invoke("run_gateway", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
      });
      setState({ gatewayRunning: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="step-card">
      <h2>Run Gateway</h2>
      <p>
        Start the OpenClaw gateway so it can accept connections and manage
        agents. The gateway will run in the background.
      </p>
      {state.gatewayRunning && (
        <p className="loading">Gateway has been started.</p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-link" onClick={onNext}>
          Skip
        </button>
        {!state.gatewayRunning ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStartGateway}
            disabled={starting}
          >
            {starting ? (
              <>
                <span className="spinner" />
                Starting…
              </>
            ) : (
              "Start Gateway"
            )}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Next: Skills & Tools
          </button>
        )}
      </div>
    </div>
  );
}
