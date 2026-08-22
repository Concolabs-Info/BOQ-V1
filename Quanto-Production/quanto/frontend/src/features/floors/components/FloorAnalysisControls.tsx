"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { downloadFloorCrop, importFloorJson, type FloorAnalysisQuality } from "../api";
import type { FloorsState } from "../types";

export function FloorAnalysisControls({
  projectId,
  floorId,
  floorName,
  quality,
  onQuality,
  processing,
  state,
  onAnalyze,
  onRefresh,
}: {
  projectId: string;
  floorId: string;
  floorName: string;
  quality: FloorAnalysisQuality;
  onQuality: (quality: FloorAnalysisQuality) => void;
  processing: boolean;
  state: FloorsState | undefined;
  onAnalyze: () => void;
  onRefresh: () => void;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [applying, setApplying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAfter, setSubmittedAfter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const latest = state?.detection_runs.find((run) => run.floor_id === floorId);

  useEffect(() => {
    if (!submitted || latest?.analysis_method !== "manual_json") return;
    const createdAt = Date.parse(latest.created_at || "");
    if (Number.isFinite(createdAt) && createdAt + 1000 < submittedAfter) return;
    if (latest.status === "ready") {
      setJsonText("");
      setSubmitted(false);
      setApplying(false);
    } else if (latest.status === "failed") {
      setError(latest.message || "The floor JSON could not be applied.");
      setSubmitted(false);
      setApplying(false);
    }
  }, [latest, submitted, submittedAfter]);

  async function applyJson() {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      setError("Paste one valid floor-detection-v2 JSON object.");
      return;
    }
    setApplying(true);
    setSubmittedAfter(Date.now());
    try {
      await importFloorJson(projectId, floorId, parsed, quality);
      setSubmitted(true);
      onRefresh();
    } catch (reason) {
      setApplying(false);
      setError(reason instanceof Error ? reason.message : "The floor JSON could not be applied.");
    }
  }

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadFloorCrop(projectId, floorId, floorName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The floor crop could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Source drawing</div>
          <div className="text-sm font-medium text-slate-800">{floorName}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="floor-analysis-quality">Quality</label>
          <select
            id="floor-analysis-quality"
            value={quality}
            disabled={processing}
            onChange={(event) => onQuality(event.target.value as FloorAnalysisQuality)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="expert">Expert</option>
            <option value="maximum">Maximum</option>
          </select>
          <Button variant="secondary" disabled={downloading || processing} onClick={() => void download()}>
            {downloading ? "Downloading…" : "Download crop"}
          </Button>
          <Button variant="secondary" disabled={processing} onClick={onAnalyze}>
            {processing ? "Analyzing…" : "Analyze floor"}
          </Button>
        </div>
      </div>
      {state?.analysis.json_import_enabled ? (
        <div className="border-t border-slate-100 px-4 py-2">
          <button type="button" className="text-xs font-semibold text-slate-600" onClick={() => setJsonOpen((value) => !value)}>
            {jsonOpen ? "▾" : "▸"} JSON test import
          </button>
          {jsonOpen ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                placeholder="Paste floor-detection-v2 JSON returned for the downloaded crop"
                className="h-28 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">JSON dimensions must match the exact downloaded crop.</span>
                <Button variant="secondary" disabled={!jsonText.trim() || applying || processing} onClick={() => void applyJson()}>
                  {applying ? "Applying…" : "Validate and apply"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
    </section>
  );
}
