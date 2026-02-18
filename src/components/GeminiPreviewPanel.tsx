import type { ViewKey } from "./UploadPanel";

type GeminiPreviewPanelProps = {
  geminiImages: Record<ViewKey, string | null>;
  transparentImages: Record<ViewKey, string | null>;
};

const orderedViews: ViewKey[] = ["front", "top", "side"];

export function GeminiPreviewPanel({ geminiImages, transparentImages }: GeminiPreviewPanelProps) {
  return (
    <section className="panel">
      <h2>Gemini Returned Images</h2>
      <div className="gemini-preview-grid">
        {orderedViews.map((view) => (
          <div key={view} className="gemini-preview-card">
            <span>{view.toUpperCase()}</span>
            <div className="gemini-preview-pair">
              <div className="gemini-preview-slot">
                <small>Gemini</small>
                {geminiImages[view] ? (
                  <img src={geminiImages[view] as string} alt={`${view} gemini output`} />
                ) : (
                  <div className="gemini-preview-empty">未生成</div>
                )}
              </div>
              <div className="gemini-preview-slot">
                <small>Transparent</small>
                {transparentImages[view] ? (
                  <img src={transparentImages[view] as string} alt={`${view} transparent output`} />
                ) : (
                  <div className="gemini-preview-empty">未生成</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
