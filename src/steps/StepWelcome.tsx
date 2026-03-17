import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";
import type { GitHubRelease } from "../types";
import type { Language } from "../i18n";

interface Props {
  language: Language;
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
}

function loadReleases(
  proxyUrl: string,
  setState: (patch: Partial<WizardState>) => void,
  setError: (e: string | null) => void
) {
  const proxy = proxyUrl.trim() || undefined;
  setError(null);
  invoke<GitHubRelease[]>("fetch_openclaw_releases", {
    proxyUrl: proxy ? proxy : null,
  })
    .then((releases) => {
      if (releases?.length) {
        setState({ releases });
        const latest = releases[0];
        const winAsset = latest.assets.find(
          (a) =>
            a.name.includes("windows") &&
            a.name.endsWith(".exe")
        );
        if (winAsset) {
          setState({
            selectedVersion: latest.tag_name,
            selectedAsset: winAsset.name,
          });
        }
      }
    })
    .catch((e) => setError(String(e)));
}

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function StepWelcome({ language, state, setState, setError, onNext }: Props) {
  useEffect(() => {
    let cancelled = false;
    invoke<GitHubRelease[]>("fetch_openclaw_releases", { proxyUrl: null })
      .then((releases) => {
        if (!cancelled && releases?.length) {
          setState({ releases });
          const latest = releases[0];
          const winAsset = latest.assets.find(
            (a) =>
              a.name.includes("windows") &&
              a.name.endsWith(".exe")
          );
          if (winAsset) {
            setState({
              selectedVersion: latest.tag_name,
              selectedAsset: winAsset.name,
            });
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [setState, setError]);

  const loadReleasesCb = useCallback(
    () => loadReleases(state.httpsProxy, setState, setError),
    [state.httpsProxy, setState, setError]
  );

  const usingCustomUrl = state.downloadUrl.trim().length > 0;
  const customUrlValid = !usingCustomUrl || isValidHttpUrl(state.downloadUrl);
  const canProceed = usingCustomUrl
    ? customUrlValid
    : Boolean(state.selectedVersion && state.selectedAsset);

  return (
    <div className="step-card">
      <h2>{language === "zh" ? "欢迎使用 OpenClaw 桌面版" : "Welcome to OpenClaw Desktop"}</h2>
      {language === "zh" ? (
        <p>
          本向导将帮助你下载、安装并配置 OpenClaw（例如来自{" "}
          <a
            href="https://github.com/supaclaw/openclaw/releases"
            target="_blank"
            rel="noreferrer"
          >
            supaclaw/openclaw 发布页
          </a>
          ），运行网关，并安装技能和工具。
        </p>
      ) : (
        <p>
          This wizard will download, install, and configure OpenClaw (e.g. from{" "}
          <a
            href="https://github.com/supaclaw/openclaw/releases"
            target="_blank"
            rel="noreferrer"
          >
            supaclaw/openclaw releases
          </a>
          ), run the gateway, and install skills and tools.
        </p>
      )}
      <div className="form-group">
        <label htmlFor="https-proxy">
          {language === "zh" ? "HTTPS 代理（可选）" : "HTTPS proxy (optional)"}
        </label>
        <input
          id="https-proxy"
          type="text"
          placeholder={
            language === "zh"
              ? "例如：http://proxy.example.com:8080"
              : "e.g. http://proxy.example.com:8080"
          }
          value={state.httpsProxy}
          onChange={(e) => setState({ httpsProxy: e.target.value })}
        />
        <p className="field-hint">
          {language === "zh"
            ? "如果你在公司网络或需要通过代理访问外网，请在此设置。"
            : "Set this if downloads hang behind a corporate proxy."}
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="download-url">
          {language === "zh" ? "下载地址（可选）" : "Download URL (optional)"}
        </label>
        <input
          id="download-url"
          type="text"
          placeholder={
            language === "zh"
              ? "例如：https://downloads.example.com/openclaw/openclaw-windows-x64.exe"
              : "e.g. https://downloads.example.com/openclaw/openclaw-windows-x64.exe"
          }
          value={state.downloadUrl}
          onChange={(e) => {
            const next = e.target.value;
            setState({
              downloadUrl: next,
              ...(next.trim() ? { selectedVersion: "", selectedAsset: "" } : {}),
            });
          }}
        />
        <p className="field-hint">
          {language === "zh"
            ? "如果设置了下载地址，向导将直接从该地址下载，而不是使用 GitHub 发布页。"
            : "If set, the wizard will download directly from this URL (instead of GitHub releases)."}
        </p>
        {usingCustomUrl && !customUrlValid && (
          <p className="field-hint field-error">
            {language === "zh" ? "请输入有效的 http(s) URL。" : "Please enter a valid http(s) URL."}
          </p>
        )}
      </div>

      {usingCustomUrl && (
        <>
          <div className="form-group">
            <label htmlFor="download-username">
              {language === "zh" ? "用户名（可选）" : "Username (optional)"}
            </label>
            <input
              id="download-username"
              type="text"
              autoComplete="username"
              value={state.downloadUsername}
              onChange={(e) => setState({ downloadUsername: e.target.value })}
              placeholder={language === "zh" ? "例如：your.name" : "e.g. your.name"}
            />
          </div>
          <div className="form-group">
            <label htmlFor="download-password">
              {language === "zh" ? "密码（可选）" : "Password (optional)"}
            </label>
            <input
              id="download-password"
              type="password"
              autoComplete="current-password"
              value={state.downloadPassword}
              onChange={(e) => setState({ downloadPassword: e.target.value })}
              placeholder="••••••••"
            />
            <p className="field-hint">
              {language === "zh"
                ? "如果填写了用户名，将使用该用户名和此密码进行 HTTP Basic 认证。"
                : "Used for HTTP Basic Auth if a username is provided."}
            </p>
          </div>
        </>
      )}

      {(state.httpsProxy || state.releases.length === 0) && (
        <button
          type="button"
          className="btn btn-secondary mb-1"
          onClick={loadReleasesCb}
        >
          {state.releases.length === 0
            ? language === "zh"
              ? "加载发布版本"
              : "Load releases"
            : language === "zh"
            ? "重新加载发布版本"
            : "Reload releases"}
        </button>
      )}
      {state.releases.length === 0 && !state.selectedVersion && !usingCustomUrl && (
        <p className="loading">
          <span className="spinner" />
          {language === "zh" ? "正在加载发布版本…" : "Loading releases…"}
        </p>
      )}
      {!usingCustomUrl && state.releases.length > 0 && (
        <>
          <label>{language === "zh" ? "OpenClaw 版本" : "OpenClaw version"}</label>
          <select
            value={state.selectedVersion}
            onChange={(e) =>
              setState({
                selectedVersion: e.target.value,
                selectedAsset: "",
              })
            }
          >
            {state.releases.map((r) => (
              <option key={r.tag_name} value={r.tag_name}>
                {r.tag_name} {r.name ? `— ${r.name}` : ""}
              </option>
            ))}
          </select>
          {state.selectedVersion && (
            <>
              <label>{language === "zh" ? "Windows 安装包" : "Windows asset"}</label>
              <select
                value={state.selectedAsset}
                onChange={(e) => setState({ selectedAsset: e.target.value })}
              >
                <option value="">{language === "zh" ? "请选择…" : "Select…"}</option>
                {state.releases
                  .find((r) => r.tag_name === state.selectedVersion)
                  ?.assets.filter(
                    (a) =>
                      a.name.includes("windows") &&
                      a.name.endsWith(".exe")
                  )
                  .map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} ({(a.size / 1024 / 1024).toFixed(1)} MB)
                    </option>
                  ))}
              </select>
            </>
          )}
        </>
      )}
      <div className="step-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canProceed}
        >
          {language === "zh" ? "下一步：下载" : "Next: Download"}
        </button>
      </div>
    </div>
  );
}
