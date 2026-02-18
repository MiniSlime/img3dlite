type ParameterControlsProps = {
  epsilonRatio: number;
  onEpsilonRatioChange: (value: number) => void;
};

export function ParameterControls({
  epsilonRatio,
  onEpsilonRatioChange,
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
    </section>
  );
}
