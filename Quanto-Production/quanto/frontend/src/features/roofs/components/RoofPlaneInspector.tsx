"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import type { RoofDefinition, RoofEdge, RoofEvidence, RoofPlane, RoofPlanePayload, RoofSlopeInputMethod } from "../types";

const shapes = ["flat","mono_pitch","gable","hip","pyramid_hip","intersecting_gable","intersecting_hip","dutch_gable","saltbox","gambrel","mansard","butterfly","sawtooth","a_frame","barrel","dome","conical","canopy","green_roof","glazed_roof","unknown"] as const;
const surfaces = ["flat_planar","sloping_planar","curved","mesh"] as const;
const edgeTypes = ["eave","verge","rake","ridge","hip","valley","abutment","parapet","upstand","downstand","gutter","valley_gutter","channel","kerb","step","unknown"] as const;

export function RoofPlaneInspector({ planes, edge, definitions, evidence = [], saving, onSave, onAssign, onConfirm, onDelete, onMerge, onEdgeSave, onEdgeDelete }: {
  planes: RoofPlane[]; edge: RoofEdge | null; definitions: RoofDefinition[]; evidence?: RoofEvidence[]; saving: boolean;
  onSave: (id: string, payload: RoofPlanePayload) => Promise<void>; onAssign: (definitionId: string | null) => Promise<void>;
  onConfirm: () => Promise<void>; onDelete: (plane: RoofPlane) => Promise<void>; onMerge: () => Promise<void>;
  onEdgeSave: (edgeId: string, edgeType: string) => Promise<void>; onEdgeDelete: (edgeId: string) => Promise<void>;
}) {
  const plane = planes.length === 1 ? planes[0] : null;
  const [draft, setDraft] = useState<RoofPlanePayload>({});
  const [edgeType, setEdgeType] = useState("unknown");
  const [slopeMethod, setSlopeMethod] = useState<RoofSlopeInputMethod>("degrees");
  const [slopePercent, setSlopePercent] = useState<number | null>(null);
  const [slopeError, setSlopeError] = useState<string | null>(null);
  useEffect(() => setDraft(plane ? { name: plane.name || "", surface_class: plane.surface_class, shape_group: plane.shape_group, pitch_degrees: plane.pitch_degrees, rise: plane.rise, run: plane.run, slope_direction_degrees: plane.slope_direction_degrees, eave_elevation_mm: plane.eave_elevation_mm, ridge_elevation_mm: plane.ridge_elevation_mm, definition_id: plane.definition_id, include_in_boq: plane.include_in_boq, boq_owner: plane.boq_owner } : {}), [plane]);
  useEffect(() => {
    const method: RoofSlopeInputMethod = plane?.rise != null && plane?.run != null ? "rise_run" : "degrees";
    setSlopeMethod(method);
    setSlopePercent(plane?.pitch_degrees == null ? null : Number((Math.tan(plane.pitch_degrees * Math.PI / 180) * 100).toFixed(3)));
    setSlopeError(null);
  }, [plane]);
  useEffect(() => setEdgeType(edge?.edge_type || "unknown"), [edge]);

  const slopeResult = slopePayload(slopeMethod, draft, slopePercent);
  const previewArea = plane?.projected_area_m2 != null && slopeResult.pitch != null
    ? Number(plane.projected_area_m2) / Math.cos(slopeResult.pitch * Math.PI / 180)
    : null;

  async function applySlope() {
    if (!plane) return;
    const payload = slopeResult.payload;
    if (!payload) {
      setSlopeError(slopeResult.error || "Enter valid roof slope information.");
      return;
    }
    setSlopeError(null);
    await onSave(plane.id, payload);
    setDraft((current) => ({ ...current, ...payload }));
  }

  if (edge) return <aside className="overflow-y-auto border-l border-slate-200 bg-white p-5">
    <p className="text-xs font-semibold uppercase text-slate-500">Selected roof line</p>
    <h3 className="mt-1 font-semibold capitalize text-slate-950">{edge.edge_type.replaceAll("_", " ")}</h3>
    <div className="mt-5 rounded-xl bg-slate-50 p-3"><Metric label="Plan length" value={`${Number(edge.plan_length_m || 0).toFixed(2)} m`} /><Metric label="True length" value={`${Number(edge.true_length_m || 0).toFixed(2)} m`} /></div>
    <Select label="Line type" value={edgeType} options={edgeTypes} onChange={setEdgeType} />
    <Button className="mt-3 w-full" disabled={saving} onClick={() => void onEdgeSave(edge.id, edgeType)}>Save roof line</Button>
    <Button className="mt-2 w-full" variant="danger" disabled={saving} onClick={() => void onEdgeDelete(edge.id)}>Delete roof line</Button>
  </aside>;

  if (!planes.length) return <aside className="border-l border-slate-200 bg-white p-5"><h3 className="font-semibold text-slate-900">Roof area</h3><p className="mt-2 text-sm leading-6 text-slate-500">Select a detected roof to check its area, pitch and material.</p></aside>;
  const planeEvidence = plane ? evidence.filter((item) => item.plane_id === plane.id) : [];
  const pitchEvidence = planeEvidence.find((item) => item.evidence_type === "pitch");
  const materialEvidence = planeEvidence.find((item) => item.evidence_type === "material");

  return <aside className="overflow-y-auto border-l border-slate-200 bg-white p-5">
    <p className="text-xs font-semibold uppercase text-slate-500">Selected roof</p>
    <h3 className="mt-1 font-semibold text-slate-950">{plane ? plane.name || "Roof area" : `${planes.length} roof areas`}</h3>
    {plane ? <>
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3"><Metric label="Projected area" value={`${Number(plane.projected_area_m2 || 0).toFixed(2)} m²`} /><Metric label="Actual area" value={`${Number(plane.net_area_m2 || plane.true_area_m2 || 0).toFixed(2)} m²`} /><Metric label="Pitch" value={plane.pitch_degrees == null ? "Not found" : `${Number(plane.pitch_degrees).toFixed(1)}°`} /><Metric label="Material" value={plane.covering_material || "Not found"} /></div>
      {pitchEvidence || materialEvidence ? <div className="mt-3 rounded-xl border border-slate-200 p-3 text-xs text-slate-600"><p className="font-semibold text-slate-800">Evidence</p>{pitchEvidence ? <p className="mt-2">Pitch from {sourceLabel(pitchEvidence)}</p> : null}{materialEvidence ? <p className="mt-1">Material from {sourceLabel(materialEvidence)}</p> : null}</div> : null}
      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-semibold text-slate-900">Roof slope</p>
        <label className="mt-3 block"><span className="text-xs font-semibold uppercase text-slate-500">Input method</span><select className="input mt-2 w-full" value={slopeMethod} onChange={(event) => { setSlopeMethod(event.target.value as RoofSlopeInputMethod); setSlopeError(null); }}><option value="degrees">Degrees</option><option value="rise_run">Rise : Run</option><option value="percentage">Percentage</option></select></label>
        {slopeMethod === "degrees" ? <NumberField label="Angle (°)" value={draft.pitch_degrees} min={0} max={88.999} step={0.1} onChange={(value) => setDraft({ ...draft, pitch_degrees: value })} /> : null}
        {slopeMethod === "rise_run" ? <div className="mt-3 grid grid-cols-2 gap-2"><NumberField label="Rise" value={draft.rise} min={0} step={0.01} onChange={(value) => setDraft({ ...draft, rise: value })} /><NumberField label="Run" value={draft.run} min={0.001} step={0.01} onChange={(value) => setDraft({ ...draft, run: value })} /></div> : null}
        {slopeMethod === "percentage" ? <NumberField label="Slope (%)" value={slopePercent} min={0} step={0.1} onChange={setSlopePercent} /> : null}
        {previewArea != null ? <p className="mt-3 text-xs text-slate-600">Calculated actual area: <strong className="text-slate-900">{previewArea.toFixed(2)} m²</strong>{slopeResult.pitch != null ? ` · ${slopeResult.pitch.toFixed(1)}°` : ""}</p> : null}
        {slopeError ? <p className="mt-2 text-xs font-medium text-red-600">{slopeError}</p> : null}
        <Button className="mt-3 w-full" disabled={saving} onClick={() => void applySlope()}>Calculate area</Button>
      </div>
      <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-slate-800">More details</summary><div className="mt-4 space-y-3">
        <Field label="Roof name" value={String(draft.name || "")} onChange={(value) => setDraft({ ...draft, name: value })} />
        <Select label="Roof shape" value={String(draft.shape_group || "unknown")} options={shapes} onChange={(value) => setDraft({ ...draft, shape_group: value as RoofPlane["shape_group"] })} />
        <Select label="Surface" value={String(draft.surface_class || "sloping_planar")} options={surfaces} onChange={(value) => setDraft({ ...draft, surface_class: value as RoofPlane["surface_class"] })} />
        <NumberField label="Slope direction (°)" value={draft.slope_direction_degrees} onChange={(value) => setDraft({ ...draft, slope_direction_degrees: value })} />
        <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Roof material/build-up</span><select className="input mt-2 w-full" value={draft.definition_id || ""} onChange={(event) => setDraft({ ...draft, definition_id: event.target.value || null })}><option value="">Choose material</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.code ? `${definition.code} · ` : ""}{definition.name}</option>)}</select></label>
        <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium"><span>Include in BOQ</span><input type="checkbox" checked={Boolean(draft.include_in_boq)} onChange={(event) => setDraft({ ...draft, include_in_boq: event.target.checked })} /></label>
        <Button className="w-full" disabled={saving} onClick={() => void onSave(plane.id, draft)}>Save roof</Button>
      </div></details>
    </> : <p className="mt-4 text-sm text-slate-500">Apply one material or confirm all selected roof areas together.</p>}
    <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="secondary" disabled={saving} onClick={() => void onConfirm()}>Confirm</Button>{planes.length > 1 ? <Button variant="secondary" disabled={saving} onClick={() => void onMerge()}>Merge</Button> : plane ? <Button variant="danger" disabled={saving} onClick={() => void onDelete(plane)}>Delete</Button> : null}</div>
    <label className="mt-5 block"><span className="text-xs font-semibold uppercase text-slate-500">Apply material to selection</span><select className="input mt-2 w-full" defaultValue="" onChange={(event) => { if (event.target.value) void onAssign(event.target.value); }}><option value="">Choose material</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
  </aside>;
}

function sourceLabel(item: RoofEvidence) { return `${item.source_kind.replaceAll("_", " ")}${item.source_page_number ? ` · page ${item.source_page_number}` : ""}`; }
function slopePayload(method: RoofSlopeInputMethod, draft: RoofPlanePayload, percentage: number | null): { payload: RoofPlanePayload | null; pitch: number | null; error?: string } {
  if (method === "degrees") {
    const pitch = draft.pitch_degrees;
    if (pitch == null || !Number.isFinite(pitch) || pitch < 0 || pitch >= 89) return { payload: null, pitch: null, error: "Enter an angle from 0° to less than 89°." };
    return { payload: { pitch_degrees: pitch, rise: null, run: null }, pitch };
  }
  if (method === "rise_run") {
    const rise = draft.rise;
    const run = draft.run;
    if (rise == null || run == null || !Number.isFinite(rise) || !Number.isFinite(run) || rise < 0 || run <= 0) return { payload: null, pitch: null, error: "Enter a rise of 0 or more and a run greater than 0." };
    const pitch = Math.atan(rise / run) * 180 / Math.PI;
    return { payload: { pitch_degrees: null, rise, run }, pitch };
  }
  if (percentage == null || !Number.isFinite(percentage) || percentage < 0) return { payload: null, pitch: null, error: "Enter a slope percentage of 0 or more." };
  const pitch = Math.atan(percentage / 100) * 180 / Math.PI;
  if (pitch >= 89) return { payload: null, pitch: null, error: "The slope percentage is too steep." };
  return { payload: { pitch_degrees: pitch, rise: null, run: null }, pitch };
}
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-sm font-medium capitalize text-slate-800">{value}</p></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, min, max, step, onChange }: { label: string; value?: number | null; min?: number; max?: number; step?: number; onChange: (value: number | null) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" type="number" min={min} max={max} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) { return <label className="mt-4 block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><select className="input mt-2 w-full capitalize" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>; }
