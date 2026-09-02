"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import type { CeilingDefinitionPayload, CeilingSystemType } from "../types";

const blank: CeilingDefinitionPayload = {
  code: "", name: "", description: "", system_type: "other", material: "", finish: "",
  manufacturer: "", product_code: "", panel_width_mm: null, panel_length_mm: null,
  thickness_mm: null, layer_count: null, grid_type: "", suspension_system: "",
  fire_rating: "", acoustic_rating: "", moisture_rating: "", default_waste_percent: 0,
  scope_state: "new", option_code: "", display_colour: "#60a5fa",
};

const systems: Array<{ value: CeilingSystemType; label: string }> = [
  { value: "suspended_grid", label: "Suspended tile or panel" },
  { value: "suspended_gypsum", label: "Suspended gypsum board" },
  { value: "cement_plaster", label: "Plaster finish" },
  { value: "applied_finish", label: "Applied finish" },
  { value: "exposed_structure", label: "Exposed structure" },
  { value: "no_ceiling", label: "No ceiling" },
  { value: "other", label: "Other" },
];

export function CeilingFinishDialog({ open, saving, onClose, onSave }: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: CeilingDefinitionPayload) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CeilingDefinitionPayload>({ ...blank });
  useEffect(() => { if (open) setDraft({ ...blank }); }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Add ceiling finish" onMouseDown={onClose}>
    <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-slate-950">Add ceiling finish</h3><p className="mt-1 text-sm text-slate-500">Add only the information available in the specification.</p></div><button type="button" className="h-10 w-10 rounded-lg border border-slate-200 text-slate-500" onClick={onClose}>×</button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Type code" value={draft.code || ""} onChange={(value) => setDraft({ ...draft, code: value })} />
        <Field label="Finish name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
        <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Ceiling type</span><select className="input mt-2 w-full" value={draft.system_type} onChange={(event) => setDraft({ ...draft, system_type: event.target.value as CeilingSystemType })}>{systems.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <Field label="Material" value={draft.material || ""} onChange={(value) => setDraft({ ...draft, material: value })} />
        <Field label="Surface finish" value={draft.finish || ""} onChange={(value) => setDraft({ ...draft, finish: value })} />
        <NumberField label="Thickness (mm)" value={draft.thickness_mm} onChange={(value) => setDraft({ ...draft, thickness_mm: value })} />
        <NumberField label="Panel width (mm)" value={draft.panel_width_mm} onChange={(value) => setDraft({ ...draft, panel_width_mm: value })} />
        <NumberField label="Panel length (mm)" value={draft.panel_length_mm} onChange={(value) => setDraft({ ...draft, panel_length_mm: value })} />
        <NumberField label="Waste (%)" value={draft.default_waste_percent} onChange={(value) => setDraft({ ...draft, default_waste_percent: value || 0 })} />
        <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Plan colour</span><input className="input mt-2 h-11 w-full" type="color" value={draft.display_colour || "#60a5fa"} onChange={(event) => setDraft({ ...draft, display_colour: event.target.value })} /></label>
      </div>
      <label className="mt-4 block"><span className="text-xs font-semibold uppercase text-slate-500">Description</span><textarea className="input mt-2 min-h-20 w-full" value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !draft.name.trim()} onClick={() => void onSave(draft)}>Save finish</Button></div>
    </div>
  </div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, onChange }: { label: string; value?: number | null; onChange: (value: number | null) => void }) { return <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">{label}</span><input className="input mt-2 w-full" type="number" min="0" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} /></label>; }
