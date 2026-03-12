import { useState } from "react";
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

export function StepGateway({ language, state, setState, setError, onNext, onBack }: Props) {
  const [starting, setStarting] = useState(false);

  const handleStartGateway = async () => {
    setError(null);
    setStarting(true);
    try {
      await invoke("stop_all_gateways");
      await invoke("run_gateway", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
      });

      let port = 18789;
      try {
        const cfgText = (await invoke("read_openclaw_config")) as string;
        const cfg = JSON.parse(cfgText) as unknown;
        const rawPort = (cfg as any)?.gateway?.port;
        const maybePort =
          typeof rawPort === "number"
            ? rawPort
            : typeof rawPort === "string"
              ? Number(rawPort)
              : NaN;
        if (Number.isFinite(maybePort) && maybePort > 0 && maybePort < 65536) {
          port = maybePort;
        }
      } catch {
        // ignore - fall back to default
      }

      // Don't open the Web UI until the gateway is actually listening.
      await invoke("wait_for_local_port", { port, timeoutMs: 30_000 });

      setState({ gatewayRunning: true });

      // Best-effort: opening the browser shouldn't fail the step once gateway is up.
      try {
        await invoke("open_url", { url: `http://127.0.0.1:${port}` });
      } catch {
        // ignore
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="step-card">
      <h2>{language === "zh" ? "运行网关" : "Run Gateway"}</h2>
      {language === "zh" ? (
        <p>
          启动 OpenClaw 网关，使其可以接受连接并管理代理。网关会在后台运行。
        </p>
      ) : (
        <p>
          Start the OpenClaw gateway so it can accept connections and manage
          agents. The gateway will run in the background.
        </p>
      )}
      {state.gatewayRunning && (
        <p className="loading">
          {language === "zh" ? "网关已启动。" : "Gateway has been started."}
        </p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
        <button type="button" className="btn btn-link" onClick={onNext}>
          {language === "zh" ? "跳过" : "Skip"}
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
                {language === "zh" ? "正在启动…" : "Starting…"}
              </>
            ) : (
              language === "zh" ? "启动网关" : "Start Gateway"
            )}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {language === "zh" ? "下一步：技能与工具" : "Next: Skills & Tools"}
          </button>
        )}
      </div>
    </div>
  );
}
