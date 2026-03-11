import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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

export function StepInstall({ language, state, setState, setError, onNext, onBack }: Props) {
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (state.installPath) return;
    invoke<string>("get_install_path")
      .then((p) => setState({ installPath: p }))
      .catch(() => setState({ installPath: "" }));
  }, [state.installPath, setState]);

  const handleInstall = async () => {
    const downloadPath = state.downloadPath.trim();
    const installPath = state.installPath.trim();
    if (!downloadPath || !installPath) {
      setError(
        "Missing path. Go back to Download, or paste the path to an existing OpenClaw .zip/.exe, and choose an install directory."
      );
      return;
    }
    setError(null);
    setInstalling(true);
    try {
      await invoke("install_openclaw", {
        archivePath: downloadPath,
        installDir: installPath,
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
      <h2>{language === "zh" ? "安装 OpenClaw" : "Install OpenClaw"}</h2>
      {language === "zh" ? (
        <p>
          请将下载的文件解压或复制到安装目录。你可以在下面修改路径。
        </p>
      ) : (
        <p>
          Extract or copy the downloaded file to an install directory. You can
          change the path below.
        </p>
      )}
      <label>
        {language === "zh" ? "下载文件路径（.zip 或 .exe）" : "Downloaded file path (.zip or .exe)"}
      </label>
      <input
        type="text"
        value={state.downloadPath}
        onChange={(e) => setState({ downloadPath: e.target.value })}
        placeholder={
          language === "zh"
            ? "例如：C:\\Users\\You\\Downloads\\openclaw-v1.5.0-windows-x64-portable.zip"
            : "e.g. C:\\Users\\You\\Downloads\\openclaw-v1.5.0-windows-x64-portable.zip"
        }
      />
      <label>{language === "zh" ? "安装目录" : "Install directory"}</label>
      <input
        type="text"
        value={state.installPath}
        onChange={(e) => setState({ installPath: e.target.value })}
        placeholder={
          language === "zh"
            ? "例如：C:\\Users\\You\\AppData\\Local\\OpenClaw"
            : "e.g. C:\\Users\\You\\AppData\\Local\\OpenClaw"
        }
      />
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleInstall}
          disabled={installing || !state.installPath.trim() || !state.downloadPath.trim()}
        >
          {installing ? (
            <>
              <span className="spinner" />
              {language === "zh" ? "正在安装…" : "Installing…"}
            </>
          ) : (
            language === "zh" ? "开始安装" : "Install"
          )}
        </button>
      </div>
    </div>
  );
}
