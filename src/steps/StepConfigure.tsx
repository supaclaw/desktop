import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";
import type { Language } from "../i18n";
import { getCachedProvidersModels, mergeCacheIntoOpenClawConfig } from "../providersModelsCache";

interface Props {
  language: Language;
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ModelSelectionHelperProps {
  language: Language;
  configText: string;
  selectedProvider: string | null;
  setSelectedProvider: (p: string | null) => void;
  selectedModels: string[];
  onToggleModel: (id: string) => void;
  onApply: () => void;
}

function ModelSelectionHelper({
  language,
  configText,
  selectedProvider,
  setSelectedProvider,
  selectedModels,
  onToggleModel,
  onApply,
}: ModelSelectionHelperProps) {
  let providers: { id: string; label: string }[] = [];
  let modelsForProvider: { id: string; name?: string }[] = [];
  let hasAnyProviderModels = false;

  try {
    const raw = configText.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as any;
      const providersObj = parsed?.models?.providers;
      if (providersObj && typeof providersObj === "object") {
        const ids = Object.keys(providersObj);
        providers = ids.map((id) => {
          const baseUrl = providersObj[id]?.baseUrl;
          const label =
            typeof baseUrl === "string" && baseUrl.length > 0
              ? `${id} (${baseUrl})`
              : id;
          return { id, label };
        });

        const idsWithModels = ids.filter((id) => {
          const m = providersObj[id]?.models;
          return Array.isArray(m) && m.length > 0;
        });
        hasAnyProviderModels = idsWithModels.length > 0;

        if (selectedProvider && providersObj[selectedProvider]) {
          const arr = providersObj[selectedProvider]?.models;
          if (Array.isArray(arr)) {
            modelsForProvider = arr
              .map((m: any) =>
                m && typeof m === "object" && "id" in m
                  ? { id: String(m.id), name: typeof m.name === "string" ? m.name : undefined }
                  : null
              )
              .filter(Boolean) as { id: string; name?: string }[];
          }
        }
      }
    }
  } catch {
    // ignore; validation happens in main editor
  }

  if (!hasAnyProviderModels) {
    return (
      <div className="config-helper">
        {language === "zh" ? (
          <p>
            当前配置中还没有在 <code>models.providers</code> 下声明可用的模型（参见{" "}
            <code>https://docs.openclaw.ai/concepts/model-providers</code>）。你可以跳过本步骤，
            稍后直接在编辑器中手动填写多个提供商和模型。
          </p>
        ) : (
          <p>
            No providers with models are defined under <code>models.providers</code> yet (see{" "}
            <code>https://docs.openclaw.ai/concepts/model-providers</code>). You can safely skip
            provider/model selection for now and edit multiple providers and models manually later.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="config-helper">
      <h4>{language === "zh" ? "模型提供商与模型选择" : "Model providers and models"}</h4>
      {language === "zh" ? (
        <p>
          这里会根据 <code>models.providers</code> 中的配置，帮助你为一个提供商选择多个模型，并同步更新{" "}
          <code>agents.defaults.model.primary</code> 与 <code>agents.defaults.models</code>。
        </p>
      ) : (
        <p>
          This helper reads <code>models.providers</code> and lets you choose multiple models from
          a provider, then updates <code>agents.defaults.model.primary</code> and{" "}
          <code>agents.defaults.models</code> for you.
        </p>
      )}

      <div className="config-helper-row">
        <label>
          {language === "zh" ? "模型提供商：" : "Model provider:"}
          <select
            value={selectedProvider ?? ""}
            onChange={(e) => setSelectedProvider(e.target.value || null)}
          >
            <option value="">
              {language === "zh" ? "请选择提供商…" : "Select a provider…"}
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedProvider && modelsForProvider.length > 0 && (
        <div className="config-helper-row">
          <div className="model-list">
            {modelsForProvider.map((m) => {
              const checked = selectedModels.includes(m.id);
              const label = m.name ? `${m.id} – ${m.name}` : m.id;
              return (
                <label key={m.id} className="model-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleModel(m.id)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {selectedProvider && (
        <div className="config-helper-row">
          <button type="button" className="btn btn-secondary" onClick={onApply}>
            {language === "zh"
              ? "应用到 agents.defaults 模型配置"
              : "Apply to agents.defaults models"}
          </button>
        </div>
      )}
    </div>
  );
}

export function StepConfigure({ language, state, setState, setError, onNext, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [configText, setConfigText] = useState<string>("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configParseError, setConfigParseError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const isWindows = navigator.userAgent.includes("Windows");
  const onboardCommand = isWindows
    ? "openclaw onboard --non-interactive --accept-risk --install-daemon"
    : "openclaw onboard --non-interactive --accept-risk";

  const handleRunOnboardNonInteractive = async () => {
    setError(null);
    setRunning(true);
    try {
      // If an existing config file is present but empty, initialize it to a minimal
      // JSON object so the OpenClaw CLI's JSON5 parser does not fail with
      // "invalid end of input". This mirrors what `openclaw doctor --fix` would do.
      try {
        const existing = await invoke<string>("read_openclaw_config");
        if (typeof existing === "string" && existing.trim().length === 0) {
          await invoke("write_openclaw_config", {
            installDir: state.installPath,
            config: {},
          });
        }
      } catch {
        // Ignore read/write errors here; the onboard command below will surface them if relevant.
      }

      const args: string[] = ["--accept-risk"];
      if (isWindows) {
        args.push("--install-daemon");
      }
      await invoke("run_onboard", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
        args,
      });
      let text = await invoke<string>("read_openclaw_config");
      try {
        let parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && (parsed as any).bind === "loopback") {
          (parsed as any).bind = "lan";
          await invoke("write_openclaw_config", {
            installDir: state.installPath,
            config: parsed,
          });
        }
        const cache = getCachedProvidersModels();
        parsed = mergeCacheIntoOpenClawConfig(parsed, cache) as Record<string, unknown>;
        text = JSON.stringify(parsed, null, 2) + "\n";
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

  // Derive a default provider + model selection from models.providers and
  // agents.defaults.models so the helper UI starts in a sensible state.
  useEffect(() => {
    try {
      const raw = configText.trim();
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      const providersObj = parsed?.models?.providers;
      if (!providersObj || typeof providersObj !== "object") return;

      const providerIds = Object.keys(providersObj);
      const providersWithModels = providerIds.filter((id) => {
        const m = providersObj[id]?.models;
        return Array.isArray(m) && m.length > 0;
      });
      if (providersWithModels.length === 0) return;

      const initialProvider =
        selectedProvider && providersWithModels.includes(selectedProvider)
          ? selectedProvider
          : providersWithModels[0];

      if (!selectedProvider || selectedProvider !== initialProvider) {
        setSelectedProvider(initialProvider);
      }

      const defaultsModels =
        parsed?.agents?.defaults?.models && typeof parsed.agents.defaults.models === "object"
          ? (parsed.agents.defaults.models as Record<string, unknown>)
          : {};
      const fromDefaults = Object.keys(defaultsModels)
        .filter((key) => key.startsWith(initialProvider + "/"))
        .map((key) => key.slice(initialProvider.length + 1));

      const providerModels = Array.isArray(providersObj[initialProvider]?.models)
        ? (providersObj[initialProvider].models as any[])
        : [];
      const allModelIds = providerModels
        .map((m) => (m && typeof m === "object" && "id" in m ? String(m.id) : ""))
        .filter((id) => id);

      const nextSelected =
        fromDefaults.length > 0 ? fromDefaults.filter((id) => allModelIds.includes(id)) : allModelIds;

      if (nextSelected.length > 0) {
        setSelectedModels(nextSelected);
      }
    } catch {
      // ignore JSON parse errors here; they are surfaced via live validation below
    }
  }, [configText, selectedProvider]);

  const handleToggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
    );
  };

  const handleApplyModelsToConfig = () => {
    if (!selectedProvider) {
      return;
    }
    try {
      const raw = configText.trim() || "{}";
      const cfg = JSON.parse(raw) as any;

      const providersObj = cfg?.models?.providers;
      if (!providersObj || typeof providersObj !== "object" || !providersObj[selectedProvider]) {
        throw new Error("Selected provider not found in models.providers");
      }
      const providerModels = Array.isArray(providersObj[selectedProvider].models)
        ? (providersObj[selectedProvider].models as any[])
        : [];
      const validModelIds = providerModels
        .map((m) => (m && typeof m === "object" && "id" in m ? String(m.id) : ""))
        .filter((id) => id);

      const effectiveSelected = selectedModels.filter((id) => validModelIds.includes(id));

      cfg.agents = cfg.agents && typeof cfg.agents === "object" ? cfg.agents : {};
      cfg.agents.defaults =
        cfg.agents.defaults && typeof cfg.agents.defaults === "object" ? cfg.agents.defaults : {};
      const defaults = cfg.agents.defaults as any;
      defaults.models =
        defaults.models && typeof defaults.models === "object" ? defaults.models : {};

      const modelsMap = defaults.models as Record<string, unknown>;

      // Drop models from this provider that are no longer selected.
      for (const key of Object.keys(modelsMap)) {
        if (key.startsWith(selectedProvider + "/")) {
          const shortId = key.slice(selectedProvider.length + 1);
          if (!effectiveSelected.includes(shortId)) {
            delete modelsMap[key];
          }
        }
      }

      // Ensure all selected models exist under agents.defaults.models.
      for (const id of effectiveSelected) {
        const fq = `${selectedProvider}/${id}`;
        if (!(fq in modelsMap)) {
          modelsMap[fq] = {};
        }
      }

      if (effectiveSelected.length > 0) {
        defaults.model =
          defaults.model && typeof defaults.model === "object" ? defaults.model : {};
        defaults.model.primary = `${selectedProvider}/${effectiveSelected[0]}`;
      }

      const next = JSON.stringify(cfg, null, 2) + "\n";
      setConfigText(next);
      setConfigDirty(true);
      setConfigParseError(null);
    } catch {
      setConfigParseError(
        language === "zh"
          ? "无法根据当前 JSON 结构应用模型选择，请先修复 openclaw.json。"
          : "Could not apply model selection based on the current JSON structure. Please fix openclaw.json first."
      );
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
            <code>{onboardCommand}</code>。在 Windows
            上，这还会安装托管网关守护进程，避免非交互式模式仅等待一个已在运行的 gateway。引导过程会把配置保存到 <code>%USERPROFILE%\.openclaw\openclaw.json</code>，这是
            OpenClaw 默认的配置路径（参见 <code>https://docs.openclaw.ai/cli/onboard</code> 和{" "}
            <code>https://docs.openclaw.ai/security</code>）。
          </p>
        ) : (
          <p>
            This runs <code>{onboardCommand}</code> using OpenClaw defaults. On Windows,
            this also installs the managed gateway daemon so non-interactive onboarding does not only wait for an already-running gateway. Onboarding saves configuration to <code>%USERPROFILE%\.openclaw\openclaw.json</code>, the default OpenClaw config
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
              disabled={running}
            >
              {running ? (
                <>
                  <span className="spinner" />
                  {language === "zh" ? "正在启动非交互式引导…" : "Starting non-interactive onboarding…"}
                </>
              ) : (
                language === "zh"
                  ? `运行 ${onboardCommand}`
                  : `Run ${onboardCommand}`
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
              下面是 <code>%USERPROFILE%\.openclaw\openclaw.json</code> 当前的内容。上一步在「本机缓存」中配置的提供商与模型已合并进下方 JSON；你可以在此直接编辑并保存。
            </p>
          ) : (
            <p>
              This is the current contents of <code>%USERPROFILE%\.openclaw\openclaw.json</code>. Provider and model
              settings from the previous step (desktop cache) have been merged in; you can edit and save here.
            </p>
          )}
          <ModelSelectionHelper
            language={language}
            configText={configText}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            selectedModels={selectedModels}
            onToggleModel={handleToggleModel}
            onApply={handleApplyModelsToConfig}
          />
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
                  let fresh = await invoke<string>("read_openclaw_config");
                  try {
                    const parsed = JSON.parse(fresh) as Record<string, unknown>;
                    const cache = getCachedProvidersModels();
                    const merged = mergeCacheIntoOpenClawConfig(parsed, cache);
                    fresh = JSON.stringify(merged, null, 2) + "\n";
                  } catch {
                    // leave fresh as-is if merge fails
                  }
                  setConfigText(fresh);
                  setConfigDirty(false);
                  setConfigParseError(null);
                } catch (e) {
                  setError(String(e));
                }
              }}
              disabled={running}
            >
              {language === "zh" ? "从磁盘重新加载（并合并缓存）" : "Reload from disk (merge cache)"}
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
