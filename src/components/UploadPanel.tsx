type ViewKey = "front" | "top" | "side";

type UploadPanelProps = {
  files: Record<ViewKey, File | null>;
  onChangeFile: (view: ViewKey, file: File | null) => void;
};

const labels: Record<ViewKey, string> = {
  front: "Front",
  top: "Top",
  side: "Side",
};

export function UploadPanel({ files, onChangeFile }: UploadPanelProps) {
  return (
    <section className="panel">
      <h2>Upload Images</h2>
      <div className="upload-grid">
        {(Object.keys(labels) as ViewKey[]).map((view) => (
          <label key={view} className="upload-card">
            <span>{labels[view]}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => onChangeFile(view, event.target.files?.[0] ?? null)}
            />
            <small>{files[view]?.name ?? "未選択"}</small>
          </label>
        ))}
      </div>
    </section>
  );
}

export type { ViewKey };
