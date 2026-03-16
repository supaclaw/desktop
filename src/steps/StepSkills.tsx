import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WizardState } from "../App";
import type { Language } from "../i18n";

/** Format Hub API JSON for display: list of skills as lines, or pretty-printed JSON. */
function formatHubSearchResults(json: string): string {
  try {
    const data = JSON.parse(json);
    const arr = Array.isArray(data) ? data : data?.skills ?? data?.data;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr
        .map((s: Record<string, unknown>) => {
          const name = s.name ?? s.slug ?? "?";
          const slug = typeof s.slug === "string" ? ` (${s.slug})` : "";
          const desc = s.description ?? "";
          return `- ${name}${slug}${desc ? ": " + String(desc) : ""}`;
        })
        .join("\n");
    }
    return JSON.stringify(data, null, 2);
  } catch {
    return json;
  }
}

interface Props {
  language: Language;
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepSkills({ language, state, setState, setError, onNext, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string | null>(null);
  const [hubSearchQuery, setHubSearchQuery] = useState("");
  const [hubSearching, setHubSearching] = useState(false);
  const [hubSearchResults, setHubSearchResults] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const handleHubSearch = async () => {
    setError(null);
    setHubSearching(true);
    setHubSearchResults(null);
    try {
      const json = await invoke<string>("hub_search_skills", {
        query: hubSearchQuery.trim(),
        baseUrl: undefined,
      });
      setHubSearchResults(json);
    } catch (e) {
      setError(String(e));
    }
    setHubSearching(false);
  };

  const handleSearchSkills = async () => {
    setError(null);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const output = await invoke<string>("clawhub_search", { query: q });
      setSearchResults(output);
    } catch (e) {
      setError(String(e));
      setSearchResults(null);
    }
    setSearching(false);
  };

  const handleInstallSkillsTools = async () => {
    setError(null);
    setInstalling(true);
    try {
      await invoke("install_skills_tools", {
        installDir: state.installPath,
        downloadedPath: state.downloadPath?.trim() || null,
      });
      setState({ skillsInstalled: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="step-card">
      <h2>
        {language === "zh" ? "搜索技能" : "Search Skills"}
      </h2>

      <div className="step-section">
        <h3>{language === "zh" ? "使用 SupaClaw Hub 搜索技能" : "Search skills with SupaClaw Hub"}</h3>
        {language === "zh" ? (
          <p>
            SupaClaw Hub 是技能目录，部署在本地 <strong>http://localhost:3002</strong>。
            下方通过 Hub API 搜索技能（兼容 ClawHub 格式），并在浏览器中使用 Hub 页面中提供的
            <code>curl</code> 安装命令将技能安装到当前 OpenClaw 工作区的
            <code>~/.openclaw/workspace/skills</code> 目录中。请确保 Hub 已启动。
          </p>
        ) : (
          <p>
            SupaClaw Hub is a skill directory at <strong>http://localhost:3002</strong>.
            Search skills via the Hub API below (ClawHub-compatible), then in your browser use the
            <code>curl</code>-based install command shown on the Hub skill page to install skills into this
            OpenClaw workspace at <code>~/.openclaw/workspace/skills</code>. Ensure the hub is running.
          </p>
        )}
        <div className="config-helper">
          <div className="config-helper-row">
            <input
              type="text"
              value={hubSearchQuery}
              onChange={(e) => setHubSearchQuery(e.target.value)}
              placeholder={
                language === "zh"
                  ? "例如：find-skill、知识库…"
                  : "e.g. find-skill, knowledge base…"
              }
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleHubSearch}
              disabled={hubSearching || !hubSearchQuery.trim()}
            >
              {hubSearching
                ? language === "zh"
                  ? "正在搜索…"
                  : "Searching…"
                : language === "zh"
                  ? "使用 supaclaw hub 搜索"
                  : "Search with supaclaw hub"}
            </button>
          </div>
          {hubSearchResults !== null && (
            <pre className="config-textarea" style={{ whiteSpace: "pre-wrap" }}>
              {formatHubSearchResults(hubSearchResults)}
            </pre>
          )}
        </div>
      </div>

      <div className="step-section">
        <h3>{language === "zh" ? "使用 ClawHub 搜索技能" : "Search skills with ClawHub"}</h3>
        {language === "zh" ? (
          <p>
            本步骤通过运行 <code>clawhub search</code>（参见{" "}
            <code>https://docs.openclaw.ai/tools/clawhub</code>）在当前工作区中搜索技能。
            请确保已全局安装 ClawHub CLI（例如 <code>npm i -g clawhub</code>），并在你的
            OpenClaw 工作区目录中运行本向导。
          </p>
        ) : (
          <p>
            This step uses <code>clawhub search</code> (see{" "}
            <code>https://docs.openclaw.ai/tools/clawhub</code>) to search skills in your
            current workspace. Make sure the ClawHub CLI is installed globally
            (for example <code>npm i -g clawhub</code>) and that you run the wizard
            from your OpenClaw workspace directory.
          </p>
        )}
        <div className="config-helper">
          <div className="config-helper-row">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === "zh"
                  ? "例如：postgres backups、监控、知识库…"
                  : "e.g. postgres backups, monitoring, knowledge base…"
              }
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSearchSkills}
              disabled={searching || !searchQuery.trim()}
            >
              {searching
                ? language === "zh"
                  ? "正在搜索…"
                  : "Searching…"
                : language === "zh"
                  ? "使用 clawhub search 搜索"
                  : "Search with clawhub"}
            </button>
          </div>
          {searchResults && (
            <pre className="config-textarea" style={{ whiteSpace: "pre-wrap" }}>
              {searchResults}
            </pre>
          )}
        </div>
      </div>

      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {language === "zh" ? "下一步：完成" : "Next: Finish"}
        </button>
      </div>
    </div>
  );
}
