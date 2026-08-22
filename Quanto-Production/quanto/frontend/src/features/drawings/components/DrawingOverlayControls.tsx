export type DrawingViewMode = "architectural" | "drawing" | "overlay";

export function drawingSvgTransform(value?: { transform?: { matrix?: number[] } } | null): string | undefined {
  const matrix=value?.transform?.matrix;
  return Array.isArray(matrix) && matrix.length === 6 && matrix.every((item) => Number.isFinite(Number(item)))
    ? `matrix(${matrix.map(Number).join(" ")})`
    : undefined;
}

export function DrawingOverlayControls({ mode, opacity, hasDrawing, onMode, onOpacity, labels, opacityLabel = "Opacity" }: { mode: DrawingViewMode; opacity: number; hasDrawing: boolean; onMode: (mode: DrawingViewMode) => void; onOpacity: (opacity: number) => void; labels?: Partial<Record<DrawingViewMode,string>>; opacityLabel?: string }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm">
    {(["architectural", "drawing", "overlay"] as DrawingViewMode[]).map((item) => <button type="button" key={item} disabled={!hasDrawing && item !== "architectural"} onClick={() => onMode(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${mode === item ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-600 disabled:opacity-40"}`}>{labels?.[item] || item}</button>)}
    {mode === "overlay" ? <label className="ml-2 flex items-center gap-2 text-xs font-medium text-slate-600">{opacityLabel}<input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} /></label> : null}
  </div>;
}
