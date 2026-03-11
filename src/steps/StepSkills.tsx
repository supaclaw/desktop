import type { WizardState } from "../App";

interface Props {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepSkills({ state, setState, setError, onNext, onBack }: Props) {
  return (
    <div className="step-card">
      <h2>Install Skills & Tools (Coming soon)</h2>
      <p>
        Installing OpenClaw skills and tools from the desktop wizard is not available yet.
        This step will let you run <code>openclaw skills install</code> and{" "}
        <code>openclaw tools install</code> from here in a future release.
      </p>
      {state.skillsInstalled && (
        <p className="loading">Skills and tools install has been triggered.</p>
      )}
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-link" onClick={onNext}>
          Skip
        </button>
        <button type="button" className="btn btn-primary" disabled>
          Coming soon
        </button>
      </div>
    </div>
  );
}
