import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";
import type { Language } from "../i18n";
import {
  type CachedProvidersModels,
  type CachedProvider,
  type CachedModel,
  getCachedProvidersModels,
  setCachedProvidersModels,
  configToCache,
} from "../providersModelsCache";

interface Props {
  language: Language;
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

const API_TYPES = [
  "openai-completions",
  "anthropic-messages",
] as const;

export function StepModels({ language, setError, onNext, onBack }: Props) {
  const [cache, setCache] = useState<CachedProvidersModels>(() => getCachedProvidersModels() ?? { providers: {}, selectedModelKeys: [], primaryModelKey: null });
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);

  const providerIds = Object.keys(cache.providers);
  const providersWithModels = providerIds.filter(
    (id) => Array.isArray(cache.providers[id]?.models) && cache.providers[id].models.length > 0
  );

  const currentProvider = selectedProvider && cache.providers[selectedProvider] ? selectedProvider : providersWithModels[0] ?? null;
  const modelsForProvider = currentProvider
    ? (cache.providers[currentProvider]?.models ?? [])
    : [];

  // Seed cache from openclaw.json if cache has no providers (once on mount)
  useEffect(() => {
    if (providerIds.length > 0) {
      setLoading(false);
      if (!selectedProvider && providersWithModels[0]) setSelectedProvider(providersWithModels[0]);
      return;
    }
    setLoading(true);
    invoke<string>("read_openclaw_config")
      .then((text) => {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const seeded = configToCache(parsed);
          if (Object.keys(seeded.providers).length > 0) {
            setCachedProvidersModels(seeded);
            setCache(seeded);
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!currentProvider || loading) return;
    const fromCache = cache.selectedModelKeys
      .filter((k) => k.startsWith(currentProvider + "/"))
      .map((k) => k.slice(currentProvider.length + 1));
    const valid = modelsForProvider.map((m) => m.id);
    const initial = fromCache.length > 0 ? fromCache.filter((id) => valid.includes(id)) : valid;
    setSelectedModelIds(initial);
  }, [currentProvider, cache.selectedModelKeys, modelsForProvider]);

  const handleToggleModel = useCallback((modelId: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
    );
  }, []);

  const saveToCacheAndNext = useCallback(() => {
    let selectedModelKeys = cache.selectedModelKeys;
    if (currentProvider) {
      const other = selectedModelKeys.filter((k) => !k.startsWith(currentProvider + "/"));
      const forCurrent = selectedModelIds.map((id) => `${currentProvider}/${id}`);
      selectedModelKeys = [...other, ...forCurrent];
    }
    const primaryModelKey = selectedModelKeys[0] ?? cache.primaryModelKey;
    const next: CachedProvidersModels = {
      ...cache,
      selectedModelKeys,
      primaryModelKey,
    };
    setCachedProvidersModels(next);
    setCache(next);
    onNext();
  }, [cache, currentProvider, selectedModelIds, onNext]);

  return (
    <div className="step-card">
      <h2>
        {language === "zh"
          ? "配置模型提供商与模型"
          : "Configure model providers and models"}
      </h2>

      {language === "zh" ? (
        <p>
          在此步骤中配置的提供商和模型会保存在本机缓存中，在下一步「配置 OpenClaw」中会合并进{" "}
          <code>openclaw.json</code>。如暂不配置，可跳过。
        </p>
      ) : (
        <p>
          Providers and models configured here are stored in desktop cache and will be merged into{" "}
          <code>openclaw.json</code> in the next step &quot;Configure OpenClaw&quot;. You can skip
          if you prefer to configure later.
        </p>
      )}

      {loading ? (
        <p className="loading">
          {language === "zh" ? "正在加载…" : "Loading…"}
        </p>
      ) : (
        <>
          <div className="config-helper">
            <h4>{language === "zh" ? "提供商列表" : "Providers"}</h4>
            {providerIds.length === 0 ? (
              <p className="muted">
                {language === "zh"
                  ? "暂无提供商。可从下方「从 openclaw.json 导入」或稍后在「配置 OpenClaw」中编辑。"
                  : "No providers yet. Import from openclaw.json below or edit in Configure OpenClaw later."}
              </p>
            ) : (
              <ul className="provider-list">
                {providerIds.map((id) => {
                  const p = cache.providers[id];
                  const modelCount = Array.isArray(p?.models) ? p.models.length : 0;
                  return (
                    <li key={id} className="provider-item">
                      <span>
                        <strong>{id}</strong>
                        {p?.baseUrl && ` — ${p.baseUrl}`}
                        {modelCount > 0 && ` (${modelCount} model${modelCount === 1 ? "" : "s"})`}
                      </span>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => setEditProviderId(id)}
                      >
                        {language === "zh" ? "编辑" : "Edit"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="config-helper-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAddProviderOpen(true)}
              >
                {language === "zh" ? "添加提供商" : "Add provider"}
              </button>
            </div>
          </div>

          {providersWithModels.length > 0 && (
            <div className="config-helper">
              <h4>{language === "zh" ? "选择模型" : "Select models"}</h4>
              <div className="config-helper-row">
                <label>
                  {language === "zh" ? "提供商：" : "Provider:"}
                  <select
                    value={currentProvider ?? ""}
                    onChange={(e) => setSelectedProvider(e.target.value || null)}
                  >
                    {providersWithModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {currentProvider && modelsForProvider.length > 0 && (
                <div className="config-helper-row">
                  <div className="model-list">
                    {modelsForProvider.map((m) => {
                      const checked = selectedModelIds.includes(m.id);
                      const label = m.name ? `${m.id} – ${m.name}` : m.id;
                      return (
                        <label key={m.id} className="model-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleModel(m.id)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {(addProviderOpen || editProviderId) && (
            <ProviderForm
              language={language}
              cache={cache}
              editId={editProviderId}
              setError={setError}
              onSave={(next) => {
                setCachedProvidersModels(next);
                setCache(next);
                setAddProviderOpen(false);
                setEditProviderId(null);
              }}
              onCancel={() => {
                setAddProviderOpen(false);
                setEditProviderId(null);
              }}
            />
          )}
        </>
      )}

      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
        <button type="button" className="btn btn-link" onClick={onNext}>
          {language === "zh" ? "跳过" : "Skip"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={saveToCacheAndNext}
          disabled={loading}
        >
          {language === "zh" ? "下一步：配置 OpenClaw" : "Next: Configure OpenClaw"}
        </button>
      </div>
    </div>
  );
}

interface ProviderFormProps {
  language: Language;
  cache: CachedProvidersModels;
  editId: string | null;
  setError: (e: string | null) => void;
  onSave: (next: CachedProvidersModels) => void;
  onCancel: () => void;
}

function ProviderForm({ language, cache, editId, setError, onSave, onCancel }: ProviderFormProps) {
  const existing = editId ? cache.providers[editId] : null;
  const [id, setId] = useState(editId ?? "");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
  const [api, setApi] = useState(existing?.api ?? "openai-completions");
  const [models, setModels] = useState<CachedModel[]>(existing?.models ?? []);
  const [fetchLoading, setFetchLoading] = useState(false);

  useEffect(() => {
    if (editId) {
      const p = cache.providers[editId];
      setId(editId);
      setBaseUrl(p?.baseUrl ?? "");
      setApiKey(p?.apiKey ?? "");
      setApi(p?.api ?? "openai-completions");
      setModels(p?.models ?? []);
    } else {
      setId("");
      setBaseUrl("");
      setApiKey("");
      setApi("openai-completions");
      setModels([]);
    }
  }, [editId, cache.providers]);

  const addModel = () => {
    setModels((prev) => [...prev, { id: "" }]);
  };
  const removeModel = (index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index));
  };
  const updateModel = (index: number, field: "id" | "name", value: string) => {
    setModels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    const tid = id.trim();
    if (!tid) {
      return;
    }
    const validModels = models
      .map((m) => ({ id: String(m.id).trim(), name: m.name?.trim() }))
      .filter((m) => m.id);
    const provider: CachedProvider = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      api: api || undefined,
      models: validModels,
    };
    const nextProviders = { ...cache.providers };
    if (editId && editId !== tid) delete nextProviders[editId];
    nextProviders[tid] = provider;
    onSave({
      ...cache,
      providers: nextProviders,
    });
  };

  const handleFetchModels = async () => {
    const url = baseUrl.trim();
    if (!url) {
      setError(language === "zh" ? "请先填写 baseUrl。" : "Please enter baseUrl first.");
      return;
    }
    setError(null);
    setFetchLoading(true);
    try {
      const result = await invoke<{ id: string; name?: string }[]>("fetch_models_from_provider", {
        baseUrl: url,
        apiKey: apiKey.trim() || null,
      });
      setModels(result.map((m) => ({ id: m.id, name: m.name ?? undefined })));
    } catch (e) {
      setError(String(e));
    } finally {
      setFetchLoading(false);
    }
  };

  return (
    <div className="config-helper provider-form">
      <h4>{editId ? (language === "zh" ? "编辑提供商" : "Edit provider") : (language === "zh" ? "添加提供商" : "Add provider")}</h4>
      <div className="form-row">
        <label>
          {language === "zh" ? "ID（英文标识）" : "ID (identifier)"}
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. alibaba-cloud"
            disabled={!!editId}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          baseUrl
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://..."
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          apiKey
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          api
          <select value={api} onChange={(e) => setApi(e.target.value)}>
            {API_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <strong>{language === "zh" ? "模型" : "Models"}</strong>
        <div className="form-row-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleFetchModels}
            disabled={fetchLoading || !baseUrl.trim()}
          >
            {fetchLoading
              ? (language === "zh" ? "获取中…" : "Fetching…")
              : (language === "zh" ? "从 baseUrl 自动获取模型列表" : "Fetch models from baseUrl")}
          </button>
        </div>
        {models.map((m, i) => (
          <div key={i} className="model-row">
            <input
              type="text"
              value={m.id}
              onChange={(e) => updateModel(i, "id", e.target.value)}
              placeholder="model id"
            />
            <input
              type="text"
              value={m.name ?? ""}
              onChange={(e) => updateModel(i, "name", e.target.value)}
              placeholder="name (optional)"
            />
            <button type="button" className="btn btn-small" onClick={() => removeModel(i)}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" onClick={addModel}>
          {language === "zh" ? "添加模型" : "Add model"}
        </button>
      </div>
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {language === "zh" ? "取消" : "Cancel"}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!id.trim()}>
          {language === "zh" ? "保存到缓存" : "Save to cache"}
        </button>
      </div>
    </div>
  );
}
