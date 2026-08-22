"use client";

import { Button } from "@/shared/components/Button";
import type { CeilingDefinition, CeilingFeature, CeilingFeaturePayload, CeilingFeatureType, CeilingQuantity, CeilingScopeState, CeilingZone } from "../types";

export const FEATURE_TYPES: Array<{ value: CeilingFeatureType; label: string; basis: "area" | "length" | "number" }> = [
  { value: "bulkhead", label: "Bulkhead", basis: "area" },
  { value: "beam", label: "Beam", basis: "area" },
  { value: "soffit", label: "Soffit", basis: "area" },
  { value: "isolated_strip", label: "Isolated strip", basis: "length" },
  { value: "upstand", label: "Upstand", basis: "length" },
  { value: "cornice", label: "Cornice", basis: "length" },
  { value: "cove", label: "Cove", basis: "length" },
  { value: "moulding", label: "Moulding", basis: "length" },
  { value: "edge_trim", label: "Edge trim", basis: "length" },
  { value: "angle_trim", label: "Angle trim", basis: "length" },
  { value: "shadow_gap", label: "Shadow gap", basis: "length" },
  { value: "fire_barrier", label: "Fire barrier", basis: "length" },
  { value: "service_collar", label: "Service collar", basis: "number" },
  { value: "fitting", label: "Ceiling fitting", basis: "number" },
  { value: "access_panel", label: "Access panel", basis: "number" },
  { value: "insulation", label: "Insulation", basis: "area" },
  { value: "repair", label: "Repair area", basis: "area" },
];

const scopes: CeilingScopeState[] = ["new", "existing_to_remain", "repair_and_match", "reuse", "relocate", "demolish_remove", "alternate", "no_work"];

export function CeilingDetailList({ features, selectedId, onSelect, onNew }: { features: CeilingFeature[]; selectedId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  return <aside className="border-r border-slate-200 bg-slate-50 p-4">
    <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-950">Ceiling details</h3><p className="text-xs text-slate-500">Extra ceiling items</p></div><Button variant="secondary" onClick={onNew}>New</Button></div>
    <div className="mt-4 space-y-2">{features.map((feature) => <button key={feature.id} type="button" className={`w-full rounded-xl border p-3 text-left ${selectedId === feature.id ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`} onClick={() => onSelect(feature.id)}><p className="text-sm font-semibold text-slate-900">{feature.name || FEATURE_TYPES.find((item) => item.value === feature.feature_type)?.label || feature.feature_type}</p><p className="mt-1 text-xs text-slate-500">{Number(feature.net_quantity || 0).toFixed(feature.measurement_unit === "nr" ? 0 : 2)} {feature.measurement_unit} · {feature.status === "confirmed" ? "Ready" : "Needs review"}</p></button>)}{!features.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No ceiling details have been added.</p> : null}</div>
  </aside>;
}

export function CeilingDetailInspector({ feature, draft, definitions, zones, quantities, saving, onClose, onDraft, onDraw, onSave, onConfirm, onDelete }: {
  feature: CeilingFeature | null;
  draft: CeilingFeaturePayload;
  definitions: CeilingDefinition[];
  zones: CeilingZone[];
  quantities: CeilingQuantity[];
  saving: boolean;
  onClose?: () => void;
  onDraft: (draft: CeilingFeaturePayload) => void;
  onDraw: () => void;
  onSave: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const measured = feature ? quantities.filter((item) => item.feature_id === feature.id) : [];
  const selectedType = FEATURE_TYPES.find((item) => item.value === draft.feature_type) || FEATURE_TYPES[0];
  return <aside className="overflow-y-auto border-l border-slate-200 bg-white p-5">
    <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase text-slate-500">{feature ? "Edit detail" : "New detail"}</p><h3 className="mt-1 font-semibold text-slate-950">{feature?.name || selectedType.label}</h3></div>{onClose ? <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600" onClick={onClose}>Close</button> : null}</div>
    <div className="mt-5 space-y-3">
      <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Detail type</span><select className="input mt-2 w-full" value={draft.feature_type} onChange={(event) => { const item = FEATURE_TYPES.find((current) => current.value === event.target.value)!; onDraft({ ...draft, feature_type: item.value, measurement_basis: item.basis, geometry: {} }); }}>{FEATURE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <Field label="Name" value={draft.name || ""} onChange={(value) => onDraft({ ...draft, name: value })} />
      <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Ceiling area</span><select className="input mt-2 w-full" value={draft.zone_id || ""} onChange={(event) => onDraft({ ...draft, zone_id: event.target.value || null })}><option value="">Choose an area</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.zone_number} · {zone.name || zone.rooms[0]?.room_name || "Ceiling area"}</option>)}</select></label>
      <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Ceiling finish</span><select className="input mt-2 w-full" value={draft.definition_id || ""} onChange={(event) => onDraft({ ...draft, definition_id: event.target.value || null })}><option value="">Use the area&apos;s finish</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.code ? `${definition.code} · ` : ""}{definition.name}</option>)}</select></label>
      <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Work required</span><select className="input mt-2 w-full" value={draft.scope_state} onChange={(event) => onDraft({ ...draft, scope_state: event.target.value as CeilingScopeState })}>{scopes.map((scope) => <option key={scope} value={scope}>{scope.replaceAll("_", " ")}</option>)}</select></label>
      <Field label="Option / alternate code" value={draft.option_code || ""} onChange={(value) => onDraft({ ...draft, option_code: value })} />
      <div className="grid grid-cols-2 gap-3"><NumberField label="Width (mm)" value={draft.width_mm} onChange={(value) => onDraft({ ...draft, width_mm: value })} /><NumberField label="Height (mm)" value={draft.height_mm} onChange={(value) => onDraft({ ...draft, height_mm: value })} /><NumberField label="Depth (mm)" value={draft.depth_mm} onChange={(value) => onDraft({ ...draft, depth_mm: value })} />{draft.measurement_basis === "number" ? <NumberField label="Quantity" value={Number(draft.geometry.quantity || 1)} onChange={(value) => onDraft({ ...draft, geometry: { ...draft.geometry, quantity: value || 1 } })} /> : null}</div>
      <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium"><span>Include in BOQ</span><input type="checkbox" checked={draft.include_in_boq} onChange={(event) => onDraft({ ...draft, include_in_boq: event.target.checked })} /></label>
      <Button className="w-full" variant="secondary" disabled={saving} onClick={onDraw}>{feature ? "Draw again" : `Draw ${selectedType.basis === "number" ? "location" : selectedType.basis}`}</Button>
      <Button className="w-full" disabled={saving || !Object.keys(draft.geometry || {}).length} onClick={() => void onSave()}>{feature ? "Save detail" : "Create detail"}</Button>
    </div>
    {feature ? <div className="mt-6 grid grid-cols-2 gap-2"><Button variant="secondary" disabled={saving} onClick={() => void onConfirm()}>Confirm</Button><Button variant="danger" disabled={saving} onClick={() => void onDelete()}>Delete</Button></div> : null}
    {measured.length ? <div className="mt-6 border-t border-slate-200 pt-5"><h4 className="text-sm font-semibold text-slate-900">BOQ quantity</h4>{measured.map((quantity) => <div key={quantity.id} className="mt-2 rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-700">NRM {quantity.nrm_work_section}{quantity.nrm_item ? `/${quantity.nrm_item}` : ""}</p><p className="mt-1 text-lg font-semibold text-slate-950">{Number(quantity.net_quantity).toFixed(quantity.measurement_unit === "nr" ? 0 : 2)} {quantity.measurement_unit}</p><p className="text-xs text-slate-500">Order: {Number(quantity.order_quantity).toFixed(2)} {quantity.measurement_unit}</p></div>)}</div> : null}
  </aside>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value?: number | null; onChange: (value: number | null) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} /></label>; }
