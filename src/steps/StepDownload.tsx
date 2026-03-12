import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { WizardState } from "../App";
import type { Language } from "../i18n";

interface Props {
  language: Language;
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepDownload({ language, state, setState, setError, onNext, onBack }: Props) {
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
      <h2>{language === "zh" ? "下载 OpenClaw" : "Download OpenClaw"}</h2>
      {usingCustomUrl ? (
        <p>
          {language === "zh" ? "从自定义地址下载：" : "Download from "}
          {language === "zh" ? (
            <>
              <strong>自定义 URL</strong>：<code>{state.downloadUrl.trim()}</code>
            </>
          ) : (
            <>
              <strong>custom URL</strong>: <code>{state.downloadUrl.trim()}</code>
            </>
          )}
        </p>
      ) : (
        <p>
          {language === "zh" ? "从发布版本 " : "Download "}
          <strong>{state.selectedAsset}</strong>
          {language === "zh" ? "（版本 " : " from release "}
          <strong>{state.selectedVersion}</strong>
          {language === "zh" ? "）进行下载。" : "."}
        </p>
      )}
      {state.httpsProxy?.trim() && (
        <p className="field-hint">
          {language === "zh" ? "使用代理：" : "Using proxy:"}{" "}
          <code>{state.httpsProxy.trim()}</code>
        </p>
      )}
      {state.downloadPath && (
        <p className="loading">
          {language === "zh" ? "已保存到：" : "Saved to:"}{" "}
          <code>{state.downloadPath}</code>
        </p>
      )}
      <div style={{ display: downloading ? "block" : "none" }}>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        {logs.length > 0 && (
          <pre className="download-log">{logs.join("\n")}</pre>
        )}
      </div>
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
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
                {language === "zh" ? "正在下载…" : "Downloading…"}
              </>
            ) : (
              language === "zh" ? "开始下载" : "Download"
            )}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {language === "zh" ? "下一步：安装" : "Next: Install"}
          </button>
        )}
      </div>
    </div>
  );
}
