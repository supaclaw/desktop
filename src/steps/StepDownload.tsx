import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  const [logs, setLogs] = useState<string[]>([]);
  const lastPctRef = useRef(0);
  const usingCustomUrl = state.downloadUrl.trim().length > 0;

  useEffect(() => {
    if (!downloading) return;

    lastPctRef.current = 0;

    const unlistenProgress = listen<{ loaded: number; total?: number; done: boolean }>(
      "download-progress",
      (e) => {
        const { loaded, total, done } = e.payload;
        if (typeof total === "number" && total > 0) {
          const pct = Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
          if (pct > lastPctRef.current) {
            lastPctRef.current = pct;
            setProgress(pct);
          }
        }
        if (done && lastPctRef.current !== 100) {
          lastPctRef.current = 100;
          setProgress(100);
        }
      }
    );

    const unlistenLog = listen<string>("download-log", (e) => {
      setLogs((prev) => [...prev, e.payload]);
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenLog.then((fn) => fn());
    };
  }, [downloading]);

  const handleDownload = async () => {
    setError(null);
    setDownloading(true);
    setProgress(0);
    setLogs([]);
    try {
      const path = await invoke<string>("download_openclaw", {
        version: state.selectedVersion,
        assetName: state.selectedAsset,
        proxyUrl: state.httpsProxy?.trim() || null,
        downloadUrl: state.downloadUrl?.trim() || null,
        username: state.downloadUsername?.trim() || null,
        password: state.downloadPassword || null,
      });
      setState({ downloadPath: path });
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
      {usingCustomUrl ? (
        <p>
          Download from <strong>custom URL</strong>: <code>{state.downloadUrl.trim()}</code>
        </p>
      ) : (
        <p>
          Download <strong>{state.selectedAsset}</strong> from release{" "}
          <strong>{state.selectedVersion}</strong>.
        </p>
      )}
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
      <div style={{ display: downloading ? "block" : "none" }}>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <pre
          style={{
            display: logs.length > 0 ? "block" : "none",
            maxHeight: "10rem",
            overflow: "auto",
            background: "#f8f9fa",
            border: "1px solid #dee2e6",
            borderRadius: "6px",
            padding: "0.75rem",
            margin: "0 0 1rem 0",
            color: "#212529",
            fontSize: "0.8125rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {logs.join("\n")}
        </pre>
      </div>
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        {!state.downloadPath ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={
              downloading ||
              (usingCustomUrl ? !state.downloadUrl.trim() : !state.selectedVersion || !state.selectedAsset)
            }
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
