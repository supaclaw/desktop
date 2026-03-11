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

export function StepDownload({ state, setState, setError, onNext, onBack }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownload = async () => {
    setError(null);
    setDownloading(true);
    setProgress(0);
    try {
      const path = await invoke<string>("download_openclaw", {
        version: state.selectedVersion,
        assetName: state.selectedAsset,
        proxyUrl: state.httpsProxy?.trim() || null,
      });
      setState({ downloadPath: path });
      setProgress(100);
      onNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="step-card">
      <h2>Download OpenClaw</h2>
      <p>
        Download <strong>{state.selectedAsset}</strong> from release{" "}
        <strong>{state.selectedVersion}</strong>.
      </p>
      {state.httpsProxy?.trim() && (
        <p className="field-hint">
          Using proxy: <code>{state.httpsProxy.trim()}</code>
        </p>
      )}
      {state.downloadPath && (
        <p className="loading">
          Saved to: <code>{state.downloadPath}</code>
        </p>
      )}
      {downloading && (
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        {!state.downloadPath ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <span className="spinner" />
                Downloading…
              </>
            ) : (
              "Download"
            )}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Next: Install
          </button>
        )}
      </div>
    </div>
  );
}
