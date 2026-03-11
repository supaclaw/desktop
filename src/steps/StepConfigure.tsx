import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";

type OnboardFlag = {
  flag: string;
  description: string;
};

function parseOnboardFlags(helpText: string): OnboardFlag[] {
  const seen = new Set<string>();
  const out: OnboardFlag[] = [];
  const lines = helpText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.includes("--")) continue;

    // Common clap/help style:
    //   -y, --yes     ...
    //       --foo     ...
    const m =
      line.match(/^\s*(?:-[A-Za-z],\s*)?(--[A-Za-z0-9][A-Za-z0-9-]*)(?:[ =][A-Z\[\]<>{}a-z0-9_-]+)?\s+(.*)$/) ??
      line.match(/^\s*(--[A-Za-z0-9][A-Za-z0-9-]*)(?:[ =][A-Z\[\]<>{}a-z0-9_-]+)?\s*(.*)$/);
    if (!m) continue;
    const flag = m[1];
    const description = (m[2] ?? "").trim();
    if (seen.has(flag)) continue;
    seen.add(flag);
    out.push({ flag, description });
  }
  return out;
}

function splitArgs(input: string): string[] {
  const s = input.trim();
  if (!s) return [];
  const args: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        args.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) args.push(cur);
  return args;
}

interface Props {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepConfigure({ state, setState, setError, onNext, onBack }: Props) {
  const [helpText, setHelpText] = useState<string>("");
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<Record<string, boolean>>({});
  const [extraArgs, setExtraArgs] = useState("");
  const [running, setRunning] = useState(false);
  const defaultsAppliedRef = useRef(false);

  const flags = useMemo(() => parseOnboardFlags(helpText), [helpText]);

  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (flags.length === 0) return;
    defaultsAppliedRef.current = true;
    setSelectedFlags((prev) => {
      // Don't override any existing user selection (if present)
      const next: Record<string, boolean> = { ...prev };
      for (const f of flags) {
        if (typeof next[f.flag] === "boolean") continue;
        if (f.flag.startsWith("--skip-")) next[f.flag] = true;
      }
      return next;
    });
  }, [flags]);

  useEffect(() => {
    let cancelled = false;
    if (!state.installPath) return;
    setLoadingHelp(true);
    invoke<string>("get_onboard_help", {
      installDir: state.installPath,
      downloadedPath: state.downloadPath?.trim() || null,
    })
      .then((t) => {
        if (cancelled) return;
        setHelpText(t);
      })
      .catch(() => {
        // If help isn't available, we still allow manual args.
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingHelp(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.installPath]);

  const handleSaveConfig = async () => {
    setError(null);
    setRunning(true);
    try {
      const chosen = Object.entries(selectedFlags)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const args = [...chosen, ...splitArgs(extraArgs)];
      await invoke("write_openclaw_config", {
        installDir: state.installPath,
        config: {
          cliDefaults: {
            onboardArgs: args,
          },
        },
      });
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
        <h3 style={{ margin: "12px 0 8px" }}>Save config</h3>
        <p>
          Pick options below (if available for your OpenClaw version) and save them into <code>openclaw.json</code> in the
          install directory.
        </p>

        {loadingHelp ? (
          <p className="loading">
            <span className="spinner" /> Loading onboarding options…
          </p>
        ) : flags.length > 0 ? (
          <div style={{ display: "grid", gap: 8, margin: "10px 0" }}>
            {flags.map((f) => (
              <label key={f.flag} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedFlags[f.flag])}
                  onChange={(e) =>
                    setSelectedFlags((s) => ({
                      ...s,
                      [f.flag]: e.target.checked,
                    }))
                  }
                />
                <span>
                  <code>{f.flag}</code>
                  {f.description ? <span style={{ marginLeft: 10, opacity: 0.85 }}>{f.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="loading">
            No onboard flags detected from <code>--help</code>. You can still run onboarding using manual args below.
          </p>
        )}

        <label style={{ display: "block", marginTop: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Extra args (optional)</div>
          <input
            value={extraArgs}
            onChange={(e) => setExtraArgs(e.target.value)}
            placeholder='Example: --profile "my-profile" --yes'
            spellCheck={false}
          />
        </label>

        <div className="step-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              defaultsAppliedRef.current = false;
              setSelectedFlags({});
              setExtraArgs("");
            }}
            disabled={running}
          >
            Reset
          </button>
          {!state.configSaved ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveConfig}
              disabled={running || loadingHelp || !state.installPath}
              title={
                !state.installPath
                  ? "Install OpenClaw first"
                  : loadingHelp
                    ? "Loading onboarding options…"
                    : undefined
              }
            >
              {running ? (
                <>
                  <span className="spinner" />
                  Saving…
                </>
              ) : (
                "Save openclaw.json"
              )}
            </button>
          ) : (
            <p className="loading">Config saved to openclaw.json.</p>
          )}
        </div>
      </div>

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
