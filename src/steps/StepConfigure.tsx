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

export function StepConfigure({ language, state, setState, setError, onNext, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [configText, setConfigText] = useState<string>("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configParseError, setConfigParseError] = useState<string | null>(null);

  const handleRunOnboardNonInteractive = async () => {
    setError(null);
    setRunning(true);
    try {
      const args: string[] = ["--accept-risk"];
      await invoke("run_onboard", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
        args,
      });
      let text = await invoke<string>("read_openclaw_config");
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && (parsed as any).bind === "loopback") {
          (parsed as any).bind = "lan";
          await invoke("write_openclaw_config", {
            installDir: state.installPath,
            config: parsed,
          });
          text = JSON.stringify(parsed, null, 2) + "\n";
        }
      } catch {
        // If the existing config isn't valid JSON, just surface it as-is in the editor.
      }
      setConfigText(text);
      setConfigDirty(false);
      setConfigParseError(null);
      setState({ configSaved: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="step-card">
      <h2>{language === "zh" ? "配置 OpenClaw" : "Configure OpenClaw"}</h2>
      {language === "zh" ? (
        <>
          <p>
            OpenClaw 已安装在 <code>{state.installPath}</code>。你可以在该目录或通过 OpenClaw
            CLI 配置环境变量和其他设置。
          </p>
          <p>
            你也可以选择将安装目录加入 PATH，这样就可以在任意终端中直接运行 <code>openclaw</code>。
          </p>
        </>
      ) : (
        <>
          <p>
            OpenClaw is installed at <code>{state.installPath}</code>. You can
            configure environment variables or settings in that directory or via the
            OpenClaw CLI after setup.
          </p>
          <p>
            Optionally add the install directory to your PATH so you can run{" "}
            <code>openclaw</code> from any terminal.
          </p>
        </>
      )}

      <div className="step-section">
        <h3>
          {language === "zh" ? "非交互式引导" : "Non-interactive onboarding"}
        </h3>
        {language === "zh" ? (
          <p>
            这将使用 OpenClaw 默认配置运行{" "}
            <code>openclaw onboard --non-interactive --accept-risk</code>。在 Windows
            上，引导过程会把配置保存到 <code>%USERPROFILE%\.openclaw\openclaw.json</code>，这是
            OpenClaw 默认的配置路径（参见 <code>https://docs.openclaw.ai/cli/onboard</code> 和{" "}
            <code>https://docs.openclaw.ai/security</code>）。
          </p>
        ) : (
          <p>
            This runs <code>openclaw onboard --non-interactive --accept-risk</code> using OpenClaw defaults. On Windows,
            onboarding saves configuration to <code>%USERPROFILE%\.openclaw\openclaw.json</code>, the default OpenClaw config
            path (see <code>https://docs.openclaw.ai/cli/onboard</code> and{" "}
            <code>https://docs.openclaw.ai/security</code>).
          </p>
        )}

        <div className="step-actions">
          {!state.configSaved ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunOnboardNonInteractive}
              disabled={running || !state.installPath}
              title={!state.installPath ? "Install OpenClaw first" : undefined}
            >
              {running ? (
                <>
                  <span className="spinner" />
                  {language === "zh" ? "正在启动非交互式引导…" : "Starting non-interactive onboarding…"}
                </>
              ) : (
                language === "zh"
                  ? "运行 openclaw onboard --non-interactive"
                  : "Run openclaw onboard --non-interactive"
              )}
            </button>
          ) : (
            <p className="loading">
              {language === "zh"
                ? "非交互式引导已被触发。"
                : "Non-interactive onboarding has been triggered."}
            </p>
          )}
        </div>
      </div>

      {state.configSaved && (
        <div className="step-section">
          <h3>
            {language === "zh" ? "编辑 openclaw.json" : "Edit openclaw.json"}
          </h3>
          {language === "zh" ? (
            <p>
              下面是 <code>%USERPROFILE%\.openclaw\openclaw.json</code> 当前的内容。你可以在此直接编辑并保存。
            </p>
          ) : (
            <p>
              This is the current contents of <code>%USERPROFILE%\.openclaw\openclaw.json</code>. You can edit it directly
              here and save.
            </p>
          )}
          <textarea
            className="config-textarea"
            value={configText}
            onChange={(e) => {
              setConfigText(e.target.value);
              setConfigDirty(true);
              // Lightweight live JSON validation
              const raw = e.target.value.trim();
              if (!raw) {
                setConfigParseError(
                  language === "zh" ? "openclaw.json 不能为空。" : "openclaw.json cannot be empty."
                );
              } else {
                try {
                  JSON.parse(raw);
                  setConfigParseError(null);
                } catch {
                  setConfigParseError(
                    language === "zh"
                      ? "JSON 无效：请在保存前修复语法错误。"
                      : "Invalid JSON: fix syntax before saving."
                  );
                }
              }
            }}
            spellCheck={false}
          />
          {configParseError && (
            <p className="error-text">
              {configParseError}
            </p>
          )}
          <div className="step-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const fresh = await invoke<string>("read_openclaw_config");
                  setConfigText(fresh);
                  setConfigDirty(false);
                  setConfigParseError(null);
                } catch (e) {
                  setError(String(e));
                }
              }}
              disabled={running}
            >
              {language === "zh" ? "从磁盘重新加载" : "Reload from disk"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                setError(null);
                setRunning(true);
                try {
                  let parsed: unknown;
                  try {
                    parsed = JSON.parse(configText);
                  } catch {
                    throw new Error(
                      language === "zh"
                        ? "保存前 openclaw.json 必须是有效的 JSON。"
                        : "openclaw.json must be valid JSON before saving."
                    );
                  }
                  await invoke("write_openclaw_config", {
                    installDir: state.installPath,
                    config: parsed,
                  });
                  setConfigDirty(false);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setRunning(false);
                }
              }}
              disabled={running || !configDirty || Boolean(configParseError)}
            >
              {language === "zh" ? "保存 openclaw.json" : "Save openclaw.json"}
            </button>
          </div>
        </div>
      )}

      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {language === "zh" ? "下一步：运行网关" : "Next: Run Gateway"}
        </button>
      </div>
    </div>
  );
}
