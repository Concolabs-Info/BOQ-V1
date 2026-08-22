"use client";

import { useEffect, useState } from "react";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import type { FloorCrop, FloorPlanDocument } from "@/features/floor-plans/types";
import type { DrawingTypeOption, FloorDrawing } from "../types";
import { DrawingRevisionDrawer } from "./DrawingRevisionDrawer";
import { DrawingTypeTabs } from "./DrawingTypeTabs";

export function DrawingSlotCard({
  floorName,
  architecturalCrop,
  architecturalSource,
  drawings,
  drawingTypes,
  busy,
  error,
  onEditArchitectural,
  onEditDrawing,
  onAdd,
  onRemove,
}: {
  floorName: string;
  architecturalCrop: FloorCrop | null;
  architecturalSource?: FloorPlanDocument;
  drawings: FloorDrawing[];
  drawingTypes: DrawingTypeOption[];
  busy: boolean;
  error?: string | null;
  onEditArchitectural: () => void;
  onEditDrawing: (drawing: FloorDrawing) => void;
  onAdd: (type: DrawingTypeOption) => Promise<FloorDrawing | null>;
  onRemove: (drawing: FloorDrawing) => void;
}) {
  const [selected, setSelected] = useState("architectural");
  const [selectedType, setSelectedType] = useState("");
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState<FloorDrawing | null>(null);
  const drawing = drawings.find((item) => item.id === selected) || null;
  useEffect(() => {
    if (selected !== "architectural" && !drawing) setSelected("architectural");
  }, [drawing, selected]);

  const preview = useAssetUrl(drawing?.preview_asset_url || (selected === "architectural" ? architecturalCrop?.preview_asset_url : null));
  const existing = new Set(drawings.map((item) => item.drawing_type));
  const availableTypes = drawingTypes.filter(
    (item) => !existing.has(item.key) || item.key === "other" || item.key === "section_detail",
  );
  const sourceDescription = drawing
    ? drawing.file_name
      ? `${drawing.file_name} · Page ${drawing.source_page_number}`
      : "Source not selected"
    : architecturalSource
      ? `${architecturalSource.file_name} · Page ${architecturalCrop?.source_page_number}`
      : "Architectural source not selected";
  const status = drawing?.status || architecturalCrop?.status || "not_ready";

  async function addDrawing() {
    const type = drawingTypes.find((item) => item.key === selectedType);
    if (!type) return;

    setAdding(true);
    try {
      const added = await onAdd(type);
      if (added) {
        setSelected(added.id);
        setSelectedType("");
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <DrawingTypeTabs drawings={drawings} selectedId={selected} onSelect={setSelected} />

        <div className="flex flex-wrap items-center gap-2">
          <label>
            <span className="sr-only">Drawing type</span>
            <select
              disabled={busy || adding || availableTypes.length === 0}
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="h-9 min-w-40 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">Choose drawing type</option>
              {availableTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || adding || !selectedType}
            onClick={() => void addDrawing()}
            className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {adding ? "Adding…" : "+ Add drawing"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div role="tabpanel" className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
        <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 md:w-60">
          {preview ? (
            <img src={preview} alt={`${floorName} ${drawing?.name || "floor plan"}`} loading="lazy" decoding="async" className="h-full w-full object-contain" />
          ) : (
            <span className="px-3 text-center text-xs text-slate-400">
              {drawing?.revision_id || architecturalCrop ? "Preview is processing" : "No crop saved"}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{drawing?.name || "Floor Plan"}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{sourceDescription}</p>
          <p className={`mt-2 text-xs font-semibold capitalize ${status === "ready" ? "text-emerald-700" : "text-amber-700"}`}>
            {String(status).replaceAll("_", " ")}
          </p>
          {drawing?.specification_links.length ? (
            <p className="mt-1 text-xs text-blue-700">{drawing.specification_links.length} linked specification source(s)</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => drawing ? onEditDrawing(drawing) : onEditArchitectural()}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
          >
            {drawing?.revision_id || architecturalCrop ? "Edit crop" : "Select and crop"}
          </button>
          {drawing ? (
            <>
              <button type="button" onClick={() => setHistory(drawing)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">History</button>
              <button type="button" onClick={() => onRemove(drawing)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Remove drawing</button>
            </>
          ) : null}
        </div>
      </div>

      {history ? <DrawingRevisionDrawer drawing={history} open onClose={() => setHistory(null)} /> : null}
    </section>
  );
}
