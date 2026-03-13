/**
 * Desktop cache for model providers and selected models.
 * Step "Configure model providers and models" writes here;
 * Step "Configure OpenClaw" merges this into openclaw.json.
 */

export const PROVIDERS_MODELS_CACHE_KEY = "openclaw-desktop-wizard.providers-models.v1";

export interface CachedModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  contextWindow?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface CachedProvider {
  baseUrl: string;
  apiKey?: string;
  api?: string;
  models: CachedModel[];
}

export interface CachedProvidersModels {
  providers: Record<string, CachedProvider>;
  /** Full model keys e.g. ["alibaba-cloud/qwen3-max-2026-01-23"] */
  selectedModelKeys: string[];
  /** Primary model key e.g. "alibaba-cloud/qwen3-max-2026-01-23" */
  primaryModelKey: string | null;
  /**
   * Provider IDs that are managed by the desktop wizard.
   * Providers in this list that are missing from `providers` will be removed
   * from openclaw.json when merging, so deletions in the wizard propagate.
   */
  managedProviderIds?: string[];
}

export function getCachedProvidersModels(): CachedProvidersModels | null {
  try {
    const raw = localStorage.getItem(PROVIDERS_MODELS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProvidersModels;
    if (!parsed || typeof parsed !== "object") return null;
    const providers = parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {};
    const managedProviderIds = Array.isArray(parsed.managedProviderIds)
      ? parsed.managedProviderIds
      : Object.keys(providers);
    return {
      providers,
      selectedModelKeys: Array.isArray(parsed.selectedModelKeys) ? parsed.selectedModelKeys : [],
      primaryModelKey:
        typeof parsed.primaryModelKey === "string" ? parsed.primaryModelKey : null,
      managedProviderIds,
    };
  } catch {
    return null;
  }
}

export function setCachedProvidersModels(data: CachedProvidersModels): void {
  try {
    localStorage.setItem(PROVIDERS_MODELS_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
}

/**
 * Merges desktop-cached providers and model selection into an openclaw config object.
 * Does not mutate the input; returns a new object (shallow copy at top level, deep merge for models.providers and agents.defaults).
 */
export function mergeCacheIntoOpenClawConfig(
  config: Record<string, unknown>,
  cache: CachedProvidersModels | null
): Record<string, unknown> {
  if (!cache || !cache.providers || Object.keys(cache.providers).length === 0) {
    return config;
  }

  const out = { ...config };

  // Merge models.providers
  const existingModels = (out.models as Record<string, unknown>) ?? {};
  const existingProviders = (existingModels.providers as Record<string, unknown>) ?? {};
  const mergedProviders = { ...existingProviders };

  // Remove providers that are managed by the wizard but no longer present in cache.providers.
  const managedIds =
    Array.isArray(cache.managedProviderIds) && cache.managedProviderIds.length > 0
      ? cache.managedProviderIds
      : Object.keys(cache.providers ?? {});
  for (const id of managedIds) {
    if (!(id in cache.providers) && id in mergedProviders) {
      delete mergedProviders[id];
    }
  }

  for (const [id, prov] of Object.entries(cache.providers)) {
    if (prov && typeof prov === "object" && typeof (prov as CachedProvider).baseUrl === "string") {
      const typedProv = prov as CachedProvider;
      const safeModels = Array.isArray(typedProv.models)
        ? typedProv.models.map((m) => ({
            ...m,
            // Some server-side schemas expect `name` to be a string; fall back to id when missing.
            name: typeof m.name === "string" && m.name.length > 0 ? m.name : m.id,
          }))
        : [];

      mergedProviders[id] = {
        ...typedProv,
        models: safeModels,
      };
    }
  }
  out.models = { ...existingModels, providers: mergedProviders };

  // Apply agents.defaults.model and agents.defaults.models from cache
  if (cache.selectedModelKeys.length > 0 || cache.primaryModelKey) {
    const existingAgents = (out.agents as Record<string, unknown>) ?? {};
    const existingDefaults = (existingAgents.defaults as Record<string, unknown>) ?? {};
    const defaults = { ...existingDefaults };

    const existingModelsMap = (defaults.models as Record<string, unknown>) ?? {};
    const modelsMap = { ...existingModelsMap };

    // Drop models from managed providers that are no longer selected in cache.selectedModelKeys.
    const managedIds =
      Array.isArray(cache.managedProviderIds) && cache.managedProviderIds.length > 0
        ? cache.managedProviderIds
        : Object.keys(cache.providers ?? {});
    const selectedSet = new Set(cache.selectedModelKeys);
    for (const key of Object.keys(modelsMap)) {
      const slash = key.indexOf("/");
      if (slash <= 0) continue;
      const providerId = key.slice(0, slash);
      if (managedIds.includes(providerId) && !selectedSet.has(key)) {
        delete modelsMap[key];
      }
    }
    for (const key of cache.selectedModelKeys) {
      modelsMap[key] = modelsMap[key] ?? {};
    }
    defaults.models = modelsMap;

    if (cache.primaryModelKey) {
      defaults.model =
        typeof defaults.model === "object" && defaults.model !== null
          ? { ...(defaults.model as object), primary: cache.primaryModelKey }
          : { primary: cache.primaryModelKey };
    }
    out.agents = { ...existingAgents, defaults };
  }

  return out;
}

/**
 * Build cache from existing openclaw config (for seeding the Models step from openclaw.json).
 */
export function configToCache(config: Record<string, unknown>): CachedProvidersModels {
  const providers: Record<string, CachedProvider> = {};
  const modelsObj = config?.models as Record<string, unknown> | undefined;
  const providersObj = (modelsObj?.providers as Record<string, unknown>) ?? {};
  for (const [id, p] of Object.entries(providersObj)) {
    if (!p || typeof p !== "object") continue;
    const baseUrl = (p as Record<string, unknown>).baseUrl;
    if (typeof baseUrl !== "string") continue;
    const modelsArr = (p as Record<string, unknown>).models;
    const models: CachedModel[] = Array.isArray(modelsArr)
      ? (modelsArr as unknown[]).map((m) => {
          const o = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
          return {
            id: String(o.id ?? ""),
            name: typeof o.name === "string" ? o.name : undefined,
            reasoning: typeof o.reasoning === "boolean" ? o.reasoning : undefined,
            input: Array.isArray(o.input) ? (o.input as string[]) : undefined,
            cost:
              o.cost && typeof o.cost === "object"
                ? (o.cost as CachedModel["cost"])
                : undefined,
            contextWindow:
              typeof (o as CachedModel).contextWindow === "number"
                ? (o as CachedModel).contextWindow
                : undefined,
            maxTokens:
              typeof (o as CachedModel).maxTokens === "number"
                ? (o as CachedModel).maxTokens
                : undefined,
          };
        }).filter((m) => m.id)
      : [];
    providers[id] = {
      baseUrl,
      apiKey: typeof (p as Record<string, unknown>).apiKey === "string" ? (p as Record<string, unknown>).apiKey as string : undefined,
      api: typeof (p as Record<string, unknown>).api === "string" ? (p as Record<string, unknown>).api as string : undefined,
      models,
    };
  }

  const defaults = (config?.agents as Record<string, unknown>)?.defaults as Record<string, unknown> | undefined;
  const defaultsModels = (defaults?.models as Record<string, unknown>) ?? {};
  const selectedModelKeys = Object.keys(defaultsModels);
  const primary =
    (defaults?.model as Record<string, unknown>)?.primary;
  const primaryModelKey =
    typeof primary === "string" && primary.length > 0 ? primary : null;

  return {
    providers,
    selectedModelKeys,
    primaryModelKey,
    managedProviderIds: Object.keys(providers),
  };
}
