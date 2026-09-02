import type { RoofAnalysisQuality } from "../api";
import { Button } from "@/shared/components/Button";

export function RoofAnalysisControls({
  floorId,
  quality,
  onQuality,
  onDownload,
  onAnalyze,
  downloading,
  busy,
  enabled,
  hasRoofCrop,
  progress,
  hasResults,
}: {
  floorId: string | null;
  quality: RoofAnalysisQuality;
  onQuality: (quality: RoofAnalysisQuality) => void;
  onDownload: () => void;
  onAnalyze: () => void;
  downloading: boolean;
  busy: boolean;
  enabled: boolean;
  hasRoofCrop: boolean;
  progress: number;
  hasResults: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        Quality
        <select
          className="input min-w-28 py-2 text-sm"
          value={quality}
          disabled={busy || !enabled}
          onChange={(event) => onQuality(event.target.value as RoofAnalysisQuality)}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="expert">Expert</option>
          <option value="maximum">Maximum</option>
        </select>
      </label>
      {floorId && hasRoofCrop ? (
        <Button variant="secondary" disabled={busy || downloading} onClick={onDownload}>
          {downloading ? "Downloading…" : "Download crop"}
        </Button>
      ) : null}
      <Button variant="secondary" disabled={busy || !enabled || !floorId || !hasRoofCrop} onClick={onAnalyze}>
        {busy ? `Analyzing ${progress}%` : hasResults ? "Re-analyze roof" : "Analyze roof"}
      </Button>
    </div>
  );
}
