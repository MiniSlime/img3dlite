import type { ViewKey } from "./UploadPanel";

type GeminiPreviewPanelProps = {
  images: Record<ViewKey, string | null>;
};

const orderedViews: ViewKey[] = ["front", "top", "side"];

export function GeminiPreviewPanel({ images }: GeminiPreviewPanelProps) {
  return (
    <section className="panel">
      <h2>Gemini Returned Images</h2>
      <div className="gemini-preview-grid">
        {orderedViews.map((view) => (
          <div key={view} className="gemini-preview-card">
            <span>{view.toUpperCase()}</span>
            {images[view] ? (
              <img src={images[view] as string} alt={`${view} gemini output`} />
            ) : (
              <div className="gemini-preview-empty">未生成</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
