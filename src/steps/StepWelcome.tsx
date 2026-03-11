import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";
import type { GitHubRelease } from "../types";

interface Props {
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
            (a.name.endsWith(".exe") || a.name.endsWith(".zip"))
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

export function StepWelcome({ state, setState, setError, onNext }: Props) {
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
              (a.name.endsWith(".exe") || a.name.endsWith(".zip"))
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
      <h2>Welcome to OpenClaw Desktop</h2>
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
      <div className="form-group">
        <label htmlFor="https-proxy">HTTPS proxy (optional)</label>
        <input
          id="https-proxy"
          type="text"
          placeholder="e.g. http://proxy.example.com:8080"
          value={state.httpsProxy}
          onChange={(e) => setState({ httpsProxy: e.target.value })}
        />
        <p className="field-hint">
          Set this if downloads hang behind a corporate proxy.
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="download-url">Download URL (optional)</label>
        <input
          id="download-url"
          type="text"
          placeholder="e.g. https://downloads.example.com/openclaw/openclaw-windows-x64.zip"
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
          If set, the wizard will download directly from this URL (instead of GitHub releases).
        </p>
        {usingCustomUrl && !customUrlValid && (
          <p className="field-hint" style={{ color: "#b00020" }}>
            Please enter a valid http(s) URL.
          </p>
        )}
      </div>

      {usingCustomUrl && (
        <>
          <div className="form-group">
            <label htmlFor="download-username">Username (optional)</label>
            <input
              id="download-username"
              type="text"
              autoComplete="username"
              value={state.downloadUsername}
              onChange={(e) => setState({ downloadUsername: e.target.value })}
              placeholder="e.g. your.name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="download-password">Password (optional)</label>
            <input
              id="download-password"
              type="password"
              autoComplete="current-password"
              value={state.downloadPassword}
              onChange={(e) => setState({ downloadPassword: e.target.value })}
              placeholder="••••••••"
            />
            <p className="field-hint">Used for HTTP Basic Auth if a username is provided.</p>
          </div>
        </>
      )}

      {(state.httpsProxy || state.releases.length === 0) && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={loadReleasesCb}
          style={{ marginBottom: "1rem" }}
        >
          {state.releases.length === 0 ? "Load releases" : "Reload releases"}
        </button>
      )}
      {state.releases.length === 0 && !state.selectedVersion && !usingCustomUrl && (
        <p className="loading">
          <span className="spinner" />
          Loading releases…
        </p>
      )}
      {!usingCustomUrl && state.releases.length > 0 && (
        <>
          <label>OpenClaw version</label>
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
              <label>Windows asset</label>
              <select
                value={state.selectedAsset}
                onChange={(e) => setState({ selectedAsset: e.target.value })}
              >
                <option value="">Select…</option>
                {state.releases
                  .find((r) => r.tag_name === state.selectedVersion)
                  ?.assets.filter(
                    (a) =>
                      a.name.includes("windows") &&
                      (a.name.endsWith(".exe") || a.name.endsWith(".zip"))
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
          Next: Download
        </button>
      </div>
    </div>
  );
}
