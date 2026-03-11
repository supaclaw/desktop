import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import confetti from "canvas-confetti";
import type { WizardState } from "../App";

interface Props {
  state: WizardState;
  onBack: () => void;
}

export function StepDone({ state, onBack }: Props) {
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
      <h2>You’re all set</h2>
      <p>
        OpenClaw is installed at <code>{state.installPath}</code>.
        {state.gatewayRunning && " The gateway has been started."}
        {state.skillsInstalled && " Skills and tools install was triggered."}
        {state.configSaved && " openclaw.json was saved."}
      </p>
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
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
