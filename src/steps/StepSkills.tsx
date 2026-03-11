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
  return (
    <div className="step-card">
      <h2>
        {language === "zh"
          ? "安装技能与工具（即将推出）"
          : "Install Skills & Tools (Coming soon)"}
      </h2>
      {language === "zh" ? (
        <p>
          目前还不能在桌面向导中直接安装 OpenClaw 技能与工具。
          将来你可以在这里运行 <code>openclaw skills install</code> 和{" "}
          <code>openclaw tools install</code>。
        </p>
      ) : (
        <p>
          Installing OpenClaw skills and tools from the desktop wizard is not available yet.
          This step will let you run <code>openclaw skills install</code> and{" "}
          <code>openclaw tools install</code> from here in a future release.
        </p>
      )}
      {state.skillsInstalled && (
        <p className="loading">
          {language === "zh"
            ? "技能与工具安装已触发。"
            : "Skills and tools install has been triggered."}
        </p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
        <button type="button" className="btn btn-link" onClick={onNext}>
          {language === "zh" ? "跳过" : "Skip"}
        </button>
        <button type="button" className="btn btn-primary" disabled>
          {language === "zh" ? "敬请期待" : "Coming soon"}
        </button>
      </div>
    </div>
  );
}
