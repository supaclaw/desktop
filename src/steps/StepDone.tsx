import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import confetti from "canvas-confetti";
import type { WizardState } from "../App";
import type { Language } from "../i18n";

interface Props {
  language: Language;
  state: WizardState;
  onBack: () => void;
}

export function StepDone({ language, state, onBack }: Props) {
  useEffect(() => {
    // Fire a quick celebratory burst when the final step is shown
    const duration = 2_000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.4 },
        disableForReducedMotion: true,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  const openReleases = () => {
    invoke("open_url", {
      url: "https://github.com/supaclaw/openclaw/releases",
    }).catch(() => {});
  };

  return (
    <div className="step-card">
      <h2>{language === "zh" ? "全部就绪" : "You’re all set"}</h2>
      {language === "zh" ? (
        <p>
          OpenClaw 已安装在 <code>{state.installPath}</code>。
          {state.gatewayRunning && " 网关已启动。"}
          {state.skillsInstalled && " 技能与工具安装已触发。"}
          {state.configSaved && " openclaw.json 已保存。"}
        </p>
      ) : (
        <p>
          OpenClaw is installed at <code>{state.installPath}</code>.
          {state.gatewayRunning && " The gateway has been started."}
          {state.skillsInstalled && " Skills and tools install was triggered."}
          {state.configSaved && " openclaw.json was saved."}
        </p>
      )}
      {language === "zh" ? (
        <p>
          如需查看更多发布版本和文档，请访问{" "}
          <button
            type="button"
            className="btn btn-link"
            onClick={openReleases}
          >
            supaclaw/openclaw 发布页
          </button>
          。
        </p>
      ) : (
        <p>
          For more releases and docs, visit{" "}
          <button
            type="button"
            className="btn btn-link"
            onClick={openReleases}
          >
            supaclaw/openclaw releases
          </button>
          .
        </p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          {language === "zh" ? "上一步" : "Back"}
        </button>
      </div>
    </div>
  );
}
