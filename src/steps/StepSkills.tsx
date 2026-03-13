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

export function StepSkills({ language, state, setState, setError, onNext, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

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
        {language === "zh"
          ? "安装技能与工具"
          : "Install Skills & Tools"}
      </h2>

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

      <div className="step-section">
        <h3>
          {language === "zh"
            ? "将技能安装到当前 OpenClaw 工作区"
            : "Install skills into this OpenClaw workspace"}
        </h3>
        {language === "zh" ? (
          <p>
            点击下方按钮将在当前安装目录中运行{" "}
            <code>openclaw skills install</code> 和{" "}
            <code>openclaw tools install</code>，以便根据配置将技能与工具安装到
            OpenClaw 工作区。
          </p>
        ) : (
          <p>
            Click the button below to run{" "}
            <code>openclaw skills install</code> and{" "}
            <code>openclaw tools install</code> in the current install directory,
            installing configured skills and tools into your OpenClaw workspace.
          </p>
        )}
        {state.skillsInstalled && (
          <p className="loading">
            {language === "zh"
              ? "技能与工具安装命令已触发，你可以在 OpenClaw 终端或日志中查看详细进度。"
              : "Skills and tools install has been triggered; check your OpenClaw terminal or logs for detailed progress."}
          </p>
        )}
        <div className="step-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleInstallSkillsTools}
            disabled={installing || !state.installPath}
          >
            {installing
              ? language === "zh"
                ? "正在触发安装…"
                : "Triggering install…"
              : language === "zh"
                ? "运行 openclaw skills/tools install"
                : "Run openclaw skills/tools install"}
          </button>
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
