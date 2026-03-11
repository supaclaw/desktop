import type { WizardState } from "../App";

interface Props {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  setError: (e: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepConfigure({ state, onNext, onBack }: Props) {
  return (
    <div className="step-card">
      <h2>Configure OpenClaw</h2>
      <p>
        OpenClaw is installed at <code>{state.installPath}</code>. You can
        configure environment variables or settings in that directory or via the
        OpenClaw CLI after setup.
      </p>
      <p>
        Optionally add the install directory to your PATH so you can run{" "}
        <code>openclaw</code> from any terminal.
      </p>
      <div className="step-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Next: Run Gateway
        </button>
      </div>
    </div>
  );
}
