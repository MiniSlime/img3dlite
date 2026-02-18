type ParameterControlsProps = {
  epsilonRatio: number;
  exactTolerance: number;
  nearTolerance: number;
  onEpsilonRatioChange: (value: number) => void;
  onExactToleranceChange: (value: number) => void;
  onNearToleranceChange: (value: number) => void;
};

export function ParameterControls({
  epsilonRatio,
  exactTolerance,
  nearTolerance,
  onEpsilonRatioChange,
  onExactToleranceChange,
  onNearToleranceChange,
}: ParameterControlsProps) {
  return (
    <section className="panel">
      <h2>Parameter Controls</h2>
      <label className="control">
        <span>Smoothness (approxPolyDP epsilon): {epsilonRatio.toFixed(4)}</span>
        <input
          type="range"
          min={0.001}
          max={0.05}
          step={0.001}
          value={epsilonRatio}
          onChange={(event) => onEpsilonRatioChange(Number(event.target.value))}
        />
      </label>
      <label className="control">
        <span>Blue Exact Tolerance: {exactTolerance}</span>
        <input
          type="range"
          min={0}
          max={32}
          step={1}
          value={exactTolerance}
          onChange={(event) => onExactToleranceChange(Number(event.target.value))}
        />
      </label>
      <label className="control">
        <span>Blue Near Tolerance: {nearTolerance}</span>
        <input
          type="range"
          min={0}
          max={64}
          step={1}
          value={nearTolerance}
          onChange={(event) => onNearToleranceChange(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
