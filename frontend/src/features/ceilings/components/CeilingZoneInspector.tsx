"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import type { CeilingDefinition, CeilingFloor, CeilingProfileType, CeilingScopeState, CeilingZone, CeilingZoneUpdate } from "../types";

const scopes: CeilingScopeState[] = ["new", "existing_to_remain", "repair_and_match", "reuse", "relocate", "demolish_remove", "alternate", "no_work", "no_ceiling", "exposed_structure"];
const profiles: CeilingProfileType[] = ["flat", "stepped", "sloped", "varies", "curved", "unknown"];

function areaSource(value: string) {
  if (value === "room_seed") return "Floor plan";
  if (value.includes("rcp") || value.includes("model")) return "Ceiling plan";
  if (value.includes("user")) return "Added by you";
  return "Plan";
}

function areaStatus(value: string) {
  if (value === "confirmed") return "Ready";
  if (value === "needs_review") return "Needs review";
  return "Not ready";
}

export function CeilingZoneInspector({ zones, definitions, floors, floorId, saving, onAssign, onAddFinish, onSave, onConfirm, onDelete, onMerge, onTypical }: {
  zones: CeilingZone[];
  definitions: CeilingDefinition[];
  floors: CeilingFloor[];
  floorId: string;
  saving: boolean;
  onAssign: (definitionId: string | null) => Promise<void>;
  onAddFinish: () => void;
  onSave: (zoneId: string, payload: CeilingZoneUpdate) => Promise<void>;
  onConfirm: () => Promise<void>;
  onDelete: (zone: CeilingZone) => Promise<void>;
  onMerge: () => Promise<void>;
  onTypical: (targetFloorIds: string[]) => Promise<void>;
}) {
  const zone = zones.length === 1 ? zones[0] : null;
  const [definitionId, setDefinitionId] = useState("");
  const [draft, setDraft] = useState<CeilingZoneUpdate>({});
  const [typicalTargets, setTypicalTargets] = useState<Set<string>>(new Set());
  useEffect(() => {
    setDefinitionId(zone?.definition_id || "");
    setDraft(zone ? { name: zone.name || "", profile_type: zone.profile_type, profile: zone.profile || {}, height_mm: zone.height_mm, underside_level_mm: zone.underside_level_mm, support_level_mm: zone.support_level_mm, suspension_depth_mm: zone.suspension_depth_mm, scope_state: zone.scope_state, option_code: zone.option_code || "", include_in_boq: zone.include_in_boq } : {});
  }, [zone?.id]);

  if (!zones.length) return <aside className="border-l border-slate-200 bg-white p-5"><h3 className="font-semibold text-slate-900">Ceiling area</h3><p className="mt-2 text-sm text-slate-500">Select an area on the plan or from the list to check its finish and height.</p></aside>;
  return <aside className="overflow-y-auto border-l border-slate-200 bg-white p-5">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected</p><h3 className="mt-1 font-semibold text-slate-950">{zone ? zone.name || zone.zone_number || "Ceiling area" : `${zones.length} ceiling areas`}</h3>{zone ? <p className="mt-1 text-xs text-slate-500">{zone.rooms.map((room) => room.room_name || room.room_number).filter(Boolean).join(", ") || "No room selected"}</p> : null}</div>

    <div className="mt-5 flex items-end gap-2"><label className="min-w-0 flex-1"><span className="text-xs font-semibold uppercase text-slate-500">Ceiling finish</span><select className="input mt-2 w-full" value={definitionId} onChange={(event) => setDefinitionId(event.target.value)}><option value="">Choose a finish</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.code ? `${definition.code} · ` : ""}{definition.name}</option>)}</select></label><Button variant="secondary" onClick={onAddFinish}>Add new</Button></div>
    <Button className="mt-3 w-full" disabled={saving} onClick={() => void onAssign(definitionId || null)}>Apply to {zones.length === 1 ? "this area" : `${zones.length} areas`}</Button>

    {zone ? <>
      <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><Metric label="Floor area" value={`${Number(zone.gross_area_m2 || 0).toFixed(2)} m²`} /><Metric label="Measured ceiling" value={`${Number(zone.surface_area_m2 || zone.gross_area_m2 || 0).toFixed(2)} m²`} /><Metric label="Status" value={areaStatus(zone.status)} /><Metric label="Area taken from" value={areaSource(zone.geometry_source)} /></div>
      <div className="mt-5 space-y-3">
        <Field label="Area name" value={String(draft.name || "")} onChange={(value) => setDraft({ ...draft, name: value })} />
        <Select label="Ceiling shape" value={String(draft.profile_type || "flat")} options={profiles} onChange={(value) => setDraft({ ...draft, profile_type: value as CeilingProfileType })} />
        {draft.profile_type === "sloped" ? <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3"><p className="text-sm font-semibold text-slate-900">Slope measurements</p><p className="mt-1 text-xs leading-5 text-slate-500">Enter an angle, a rise and run, or two heights with the horizontal distance. One complete method is enough.</p><div className="mt-3 grid grid-cols-2 gap-3"><NumberField label="Angle (degrees)" value={draft.profile?.angle_degrees} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, angle_degrees: value, source: "user", needs_confirmation: false } })} /><NumberField label="Rise" value={draft.profile?.rise} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, rise: value, source: "user", needs_confirmation: false } })} /><NumberField label="Run" value={draft.profile?.run} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, run: value, source: "user", needs_confirmation: false } })} /><NumberField label="Slope direction (°)" value={draft.profile?.direction_degrees} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, direction_degrees: value, source: "user" } })} /><NumberField label="Lower height (mm)" value={draft.profile?.lower_height_mm} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, lower_height_mm: value, source: "user", needs_confirmation: false } })} /><NumberField label="Upper height (mm)" value={draft.profile?.upper_height_mm} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, upper_height_mm: value, source: "user", needs_confirmation: false } })} /><NumberField label="Horizontal distance (mm)" value={draft.profile?.run_length_mm} onChange={(value) => setDraft({ ...draft, profile: { ...draft.profile, run_length_mm: value, source: "user", needs_confirmation: false } })} /></div></div> : null}
        <NumberField label="Ceiling height (mm)" value={draft.height_mm} onChange={(value) => setDraft({ ...draft, height_mm: value })} />
        <NumberField label="Suspension depth (mm)" value={draft.suspension_depth_mm} onChange={(value) => setDraft({ ...draft, suspension_depth_mm: value })} />
        <NumberField label="Underside level (mm)" value={draft.underside_level_mm} onChange={(value) => setDraft({ ...draft, underside_level_mm: value })} />
        <NumberField label="Support level (mm)" value={draft.support_level_mm} onChange={(value) => setDraft({ ...draft, support_level_mm: value })} />
        <Select label="Work required" value={String(draft.scope_state || "new")} options={scopes} onChange={(value) => setDraft({ ...draft, scope_state: value as CeilingScopeState })} />
        <Field label="Option / alternate code" value={String(draft.option_code || "")} onChange={(value) => setDraft({ ...draft, option_code: value })} />
        <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium"><span>Include in BOQ</span><input type="checkbox" checked={Boolean(draft.include_in_boq)} onChange={(event) => setDraft({ ...draft, include_in_boq: event.target.checked })} /></label>
        <Button className="w-full" disabled={saving} onClick={() => void onSave(zone.id, draft)}>Save area</Button>
      </div>
    </> : null}

    <div className="mt-6 grid grid-cols-2 gap-2"><Button variant="secondary" disabled={saving} onClick={() => void onConfirm()}>Confirm</Button>{zones.length > 1 ? <Button variant="secondary" disabled={saving} onClick={() => void onMerge()}>Merge</Button> : zone ? <Button variant="danger" disabled={saving} onClick={() => void onDelete(zone)}>Delete</Button> : null}</div>

    <details className="mt-6 border-t border-slate-200 pt-5"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Copy to other floors</summary><p className="mt-2 text-xs text-slate-500">Use the same ceiling areas and finishes on similar floors.</p><div className="mt-3 space-y-2">{floors.filter((floor) => floor.id !== floorId).map((floor) => <label key={floor.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={typicalTargets.has(floor.id)} onChange={() => setTypicalTargets((current) => { const next = new Set(current); next.has(floor.id) ? next.delete(floor.id) : next.add(floor.id); return next; })} />{floor.name}</label>)}</div><Button className="mt-3 w-full" variant="secondary" disabled={saving || !typicalTargets.size} onClick={() => void onTypical([...typicalTargets])}>Copy to selected floors</Button></details>
  </aside>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 font-medium capitalize text-slate-800">{value}</p></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value?: number | null; onChange: (value: number | null) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} /></label>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><select className="input mt-2 w-full capitalize" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>; }
