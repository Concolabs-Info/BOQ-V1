"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/Button";
import type { WallFace, WallFinishDefinition, WallFinishDefinitionPayload, WallFinishZone } from "../wallFinishTypes";

const value = (number: number | null | undefined, digits = 2) => number == null ? "—" : number.toFixed(digits);

export function WallFinishInspector({
  face,
  wallFaces,
  zone,
  definitions,
  saving,
  onSelectFace,
  onSelectZone,
  onAssign,
  onCreateZone,
  onUpdateZone,
  onDeleteZone,
  onSaveDefinition,
  onDeleteDefinition,
}: {
  face: WallFace | null;
  wallFaces: WallFace[];
  zone: WallFinishZone | null;
  definitions: WallFinishDefinition[];
  saving: boolean;
  onSelectFace: (faceId: string) => void;
  onSelectZone: (zoneId: string) => void;
  onAssign: (zoneId: string, finishId: string | null) => Promise<void>;
  onCreateZone: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateZone: (zoneId: string, payload: Record<string, unknown>) => Promise<void>;
  onDeleteZone: (zoneId: string) => Promise<void>;
  onSaveDefinition: (payload: WallFinishDefinitionPayload, finishId?: string) => Promise<void>;
  onDeleteDefinition: (finishId: string) => Promise<void>;
}) {
  const [finishId, setFinishId] = useState("");
  const [editingZone, setEditingZone] = useState(false);
  const [zoneDraft, setZoneDraft] = useState({ name: "", from_x_mm: 0, to_x_mm: 0, from_z_mm: 0, to_z_mm: 1200 });
  const [showFinishEditor, setShowFinishEditor] = useState(false);
  const [editingFinishId, setEditingFinishId] = useState<string | undefined>();

  useEffect(() => {
    setFinishId(zone?.finish_id || "");
    if (zone) setZoneDraft({
      name: zone.name || "",
      from_x_mm: zone.from_x_mm || 0,
      to_x_mm: zone.to_x_mm || face?.length_mm || 0,
      from_z_mm: zone.from_z_mm || 0,
      to_z_mm: zone.to_z_mm || face?.height_mm || 1200,
    });
    setEditingZone(false);
  }, [face?.height_mm, face?.length_mm, zone]);

  const profile = useMemo(() => {
    const width = Math.max(face?.length_mm || 1, 1);
    const height = Math.max(face?.height_mm || 2700, 1);
    return { width, height };
  }, [face]);

  if (!face) return <div className="p-6 text-sm text-slate-500">Select a coloured wall-face line to review its finish, quantity and source evidence.</div>;

  async function saveZone() {
    if (!zone) return;
    await onUpdateZone(zone.id, zoneDraft);
    setEditingZone(false);
  }

  return (
    <div className="space-y-5 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Selected wall face</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-semibold text-slate-950">{face.friendly_number}</h3><p className="text-xs text-slate-500">{face.adjacent_room_number ? `${face.adjacent_room_number} · ` : ""}{face.adjacent_room_name || face.adjacent_space || "External"} · {face.room_relative_direction || "direction unknown"}</p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Side {face.side_code}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[...wallFaces].sort((left, right) => left.side_code.localeCompare(right.side_code)).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectFace(item.id)}
              className={item.id === face.id
                ? "rounded-xl border border-blue-500 bg-blue-50 px-3 py-2 text-left text-xs text-blue-900"
                : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:border-blue-300"}
            >
              <span className="block font-semibold">Side {item.side_code}</span>
              <span className="mt-0.5 block truncate">{item.adjacent_room_number ? `${item.adjacent_room_number} · ` : ""}{item.adjacent_room_name || item.adjacent_space || "External"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wall elevation</p><span className="text-xs text-slate-500">{value(profile.width / 1000)} × {value(profile.height / 1000)} m</span></div>
        <svg className="h-40 w-full rounded-lg border border-slate-200 bg-white" viewBox={`0 0 ${profile.width} ${profile.height}`} preserveAspectRatio="none">
          <rect x={0} y={0} width={profile.width} height={profile.height} fill="#f8fafc" />
          {face.zones.map((item) => {
            const x = item.from_x_mm || 0;
            const width = Math.max((item.to_x_mm ?? profile.width) - x, 1);
            const low = item.from_z_mm || 0;
            const high = item.to_z_mm ?? profile.height;
            const y = profile.height - high;
            const height = Math.max(high - low, 1);
            const selected = zone?.id === item.id;
            return <rect key={item.id} x={x} y={y} width={width} height={height} fill={item.display_colour || "#cbd5e1"} fillOpacity={item.finish_id ? 0.75 : 0.25} stroke={selected ? "#0f172a" : "#64748b"} strokeWidth={selected ? 18 : 6} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={() => onSelectZone(item.id)} />;
          })}
        </svg>
        <div className="mt-2 flex flex-wrap gap-1.5">{face.zones.map((item) => <button key={item.id} type="button" onClick={() => onSelectZone(item.id)} className={zone?.id === item.id ? "rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white" : "rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"}>{item.name || item.friendly_number}</button>)}</div>
      </div>

      {zone ? <>
        <div>
          <div className="flex items-center justify-between"><label className="text-sm font-medium">Finish for {zone.name || "zone"}</label><button type="button" className="text-xs font-semibold text-blue-700" onClick={() => { setEditingFinishId(finishId || undefined); setShowFinishEditor(true); }}>{finishId ? "Edit finish" : "Add finish"}</button></div>
          <select className="input mt-1 w-full" value={finishId} onChange={(event) => setFinishId(event.target.value)}>
            <option value="">Unassigned</option>
            {definitions.map((item) => <option key={item.id} value={item.id}>{item.original_tag ? `${item.original_tag} · ` : ""}{item.name}</option>)}
          </select>
          <Button className="mt-2 w-full" disabled={saving || finishId === (zone.finish_id || "")} onClick={() => void onAssign(zone.id, finishId || null)}>Apply and confirm</Button>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex justify-between"><span>Gross area</span><strong>{value(zone.gross_area_m2)} m²</strong></div>
          <div className="mt-2 flex justify-between"><span>Openings</span><strong>− {value(zone.opening_deduction_m2)} m²</strong></div>
          <div className="mt-2 flex justify-between"><span>Other finish zones</span><strong>− {value(zone.excluded_area_m2)} m²</strong></div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span>Net finish area</span><strong>{value(zone.net_area_m2)} m²</strong></div>
          {zone.order_area_m2 != null ? <div className="mt-2 flex justify-between"><span>Order quantity</span><strong>{value(zone.order_area_m2)} m²</strong></div> : null}
          {zone.tile_count != null ? <div className="mt-2 flex justify-between"><span>Tiles / panels</span><strong>{zone.tile_count}</strong></div> : null}
          {zone.finish_litres != null ? <div className="mt-2 flex justify-between"><span>Finish paint</span><strong>{value(zone.finish_litres)} L</strong></div> : null}
        </div>

        <div>
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Zone dimensions</p><button type="button" className="text-xs font-semibold text-blue-700" onClick={() => setEditingZone((current) => !current)}>{editingZone ? "Cancel" : "Edit"}</button></div>
          {editingZone ? <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
            <input className="input w-full" placeholder="Zone name" value={zoneDraft.name} onChange={(event) => setZoneDraft({ ...zoneDraft, name: event.target.value })} />
            <div className="grid grid-cols-2 gap-2"><label className="text-xs">Start height (mm)<input className="input mt-1 w-full" type="number" value={zoneDraft.from_z_mm} onChange={(event) => setZoneDraft({ ...zoneDraft, from_z_mm: Number(event.target.value) })} /></label><label className="text-xs">End height (mm)<input className="input mt-1 w-full" type="number" value={zoneDraft.to_z_mm} onChange={(event) => setZoneDraft({ ...zoneDraft, to_z_mm: Number(event.target.value) })} /></label></div>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs">Start along wall (mm)<input className="input mt-1 w-full" type="number" value={zoneDraft.from_x_mm} onChange={(event) => setZoneDraft({ ...zoneDraft, from_x_mm: Number(event.target.value) })} /></label><label className="text-xs">End along wall (mm)<input className="input mt-1 w-full" type="number" value={zoneDraft.to_x_mm} onChange={(event) => setZoneDraft({ ...zoneDraft, to_x_mm: Number(event.target.value) })} /></label></div>
            <Button className="w-full" disabled={saving} onClick={() => void saveZone()}>Save zone</Button>
            {zone.zone_type !== "background" ? <Button className="w-full" variant="danger" disabled={saving} onClick={() => window.confirm("Delete this wall-finish zone?") && void onDeleteZone(zone.id)}>Delete zone</Button> : null}
          </div> : null}
        </div>

        <div>
          <p className="text-sm font-semibold">Why this finish</p>
          <div className="mt-2 space-y-2">{zone.evidence?.length ? zone.evidence.map((item) => <div key={item.id} className={item.accepted ? "rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs" : "rounded-lg border border-slate-200 p-2.5 text-xs"}><div className="flex justify-between gap-2"><span className="font-semibold capitalize">{item.evidence_type.replaceAll("_", " ")}</span><span>{item.confidence == null ? "" : `${Math.round(item.confidence * 100)}%`}</span></div><p className="mt-1 line-clamp-3 text-slate-600">{item.source_text || item.value_text}</p>{item.source_page ? <p className="mt-1 text-slate-400">Page {item.source_page}</p> : null}</div>) : <p className="text-xs text-slate-500">No matching schedule or plan evidence was found. Choose a finish above.</p>}</div>
        </div>
      </> : null}

      <div className="border-t border-slate-200 pt-4">
        <p className="text-sm font-semibold">Add a partial-height or feature zone</p>
        <p className="mt-1 text-xs text-slate-500">The new zone is measured on this wall elevation and deducted from the full-wall background.</p>
        <Button className="mt-2 w-full" variant="secondary" disabled={saving} onClick={() => void onCreateZone({ name: "Feature finish", zone_type: "feature", from_x_mm: 0, to_x_mm: profile.width, from_z_mm: 0, to_z_mm: Math.min(1200, profile.height), finish_id: finishId || null })}>Add 1.2 m high zone</Button>
      </div>

      {showFinishEditor ? <FinishEditor definitions={definitions} finishId={editingFinishId} saving={saving} onClose={() => setShowFinishEditor(false)} onSave={async (payload, id) => { await onSaveDefinition(payload, id); setShowFinishEditor(false); }} onDelete={async (id) => { await onDeleteDefinition(id); setShowFinishEditor(false); }} /> : null}
    </div>
  );
}

function FinishEditor({ definitions, finishId, saving, onClose, onSave, onDelete }: { definitions: WallFinishDefinition[]; finishId?: string; saving: boolean; onClose: () => void; onSave: (payload: WallFinishDefinitionPayload, id?: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const current = definitions.find((item) => item.id === finishId);
  const [draft, setDraft] = useState<WallFinishDefinitionPayload>({
    original_tag: current?.original_tag || "", name: current?.name || "", description: current?.description || "",
    material_category: current?.material_category || "Paint", material: current?.material || "", manufacturer: current?.manufacturer || "",
    product_code: current?.product_code || "", colour: current?.colour || "", display_colour: current?.display_colour || "#64748b",
    width_mm: current?.width_mm, height_mm: current?.height_mm, thickness_mm: current?.thickness_mm,
    surface_finish: current?.surface_finish || "", pattern: current?.pattern || "", installation_direction: current?.installation_direction || "",
    substrate: current?.substrate || "", preparation: current?.preparation || "", primer: current?.primer || "",
    adhesive: current?.adhesive || "", grout: current?.grout || "", joint_size_mm: current?.joint_size_mm,
    coat_count: current?.coat_count, coverage_m2_per_litre: current?.coverage_m2_per_litre,
    default_waste_percent: current?.default_waste_percent || 0, nrm2_work_section: current?.nrm2_work_section || "29",
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-5" onMouseDown={onClose}><div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{current ? "Edit wall finish" : "Add wall finish"}</h3><button type="button" className="text-slate-500" onClick={onClose}>Close</button></div><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm">Code<input className="input mt-1 w-full" value={draft.original_tag || ""} onChange={(event) => setDraft({ ...draft, original_tag: event.target.value })} /></label><label className="text-sm">Name<input className="input mt-1 w-full" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="col-span-2 text-sm">Description<textarea className="input mt-1 min-h-20 w-full" value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label className="text-sm">Category<select className="input mt-1 w-full" value={draft.material_category || ""} onChange={(event) => setDraft({ ...draft, material_category: event.target.value, nrm2_work_section: event.target.value === "Paint" || event.target.value === "Wallpaper" ? "29" : "28" })}><option>Paint</option><option>Tile</option><option>Wallpaper</option><option>Plaster</option><option>Render</option><option>Cladding</option><option>Panel</option><option>Other</option></select></label><label className="text-sm">Material<input className="input mt-1 w-full" value={draft.material || ""} onChange={(event) => setDraft({ ...draft, material: event.target.value })} /></label><label className="text-sm">Substrate<input className="input mt-1 w-full" value={draft.substrate || ""} onChange={(event) => setDraft({ ...draft, substrate: event.target.value })} /></label><label className="text-sm">Surface finish<input className="input mt-1 w-full" value={draft.surface_finish || ""} onChange={(event) => setDraft({ ...draft, surface_finish: event.target.value })} /></label><label className="text-sm">Pattern<input className="input mt-1 w-full" value={draft.pattern || ""} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} /></label><label className="text-sm">Installation direction<input className="input mt-1 w-full" value={draft.installation_direction || ""} onChange={(event) => setDraft({ ...draft, installation_direction: event.target.value })} /></label><label className="text-sm">Preparation<input className="input mt-1 w-full" value={draft.preparation || ""} onChange={(event) => setDraft({ ...draft, preparation: event.target.value })} /></label><label className="text-sm">Primer<input className="input mt-1 w-full" value={draft.primer || ""} onChange={(event) => setDraft({ ...draft, primer: event.target.value })} /></label><label className="text-sm">Adhesive<input className="input mt-1 w-full" value={draft.adhesive || ""} onChange={(event) => setDraft({ ...draft, adhesive: event.target.value })} /></label><label className="text-sm">Grout<input className="input mt-1 w-full" value={draft.grout || ""} onChange={(event) => setDraft({ ...draft, grout: event.target.value })} /></label><label className="text-sm">Joint size (mm)<input className="input mt-1 w-full" type="number" value={draft.joint_size_mm ?? ""} onChange={(event) => setDraft({ ...draft, joint_size_mm: event.target.value ? Number(event.target.value) : null })} /></label><label className="text-sm">Manufacturer<input className="input mt-1 w-full" value={draft.manufacturer || ""} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value })} /></label><label className="text-sm">Product code<input className="input mt-1 w-full" value={draft.product_code || ""} onChange={(event) => setDraft({ ...draft, product_code: event.target.value })} /></label><label className="text-sm">Colour<input className="input mt-1 w-full" value={draft.colour || ""} onChange={(event) => setDraft({ ...draft, colour: event.target.value })} /></label><label className="text-sm">Plan colour<input className="mt-1 h-10 w-full" type="color" value={draft.display_colour || "#64748b"} onChange={(event) => setDraft({ ...draft, display_colour: event.target.value })} /></label><label className="text-sm">Module width (mm)<input className="input mt-1 w-full" type="number" value={draft.width_mm ?? ""} onChange={(event) => setDraft({ ...draft, width_mm: event.target.value ? Number(event.target.value) : null })} /></label><label className="text-sm">Module height (mm)<input className="input mt-1 w-full" type="number" value={draft.height_mm ?? ""} onChange={(event) => setDraft({ ...draft, height_mm: event.target.value ? Number(event.target.value) : null })} /></label><label className="text-sm">Thickness (mm)<input className="input mt-1 w-full" type="number" value={draft.thickness_mm ?? ""} onChange={(event) => setDraft({ ...draft, thickness_mm: event.target.value ? Number(event.target.value) : null })} /></label><label className="text-sm">Coats<input className="input mt-1 w-full" type="number" value={draft.coat_count ?? ""} onChange={(event) => setDraft({ ...draft, coat_count: event.target.value ? Number(event.target.value) : null })} /></label><label className="text-sm">Coverage m²/L<input className="input mt-1 w-full" type="number" value={draft.coverage_m2_per_litre ?? ""} onChange={(event) => setDraft({ ...draft, coverage_m2_per_litre: event.target.value ? Number(event.target.value) : null })} /></label><label className="text-sm">Waste %<input className="input mt-1 w-full" type="number" value={draft.default_waste_percent ?? 0} onChange={(event) => setDraft({ ...draft, default_waste_percent: Number(event.target.value) })} /></label><label className="text-sm">NRM2 section<select className="input mt-1 w-full" value={draft.nrm2_work_section || "28"} onChange={(event) => setDraft({ ...draft, nrm2_work_section: event.target.value as "28" | "29" })}><option value="28">28 · Wall finishes</option><option value="29">29 · Decoration</option></select></label></div><div className="mt-5 flex items-center justify-between gap-2">{current ? <Button variant="danger" disabled={saving || current.assignment_count > 0} onClick={() => window.confirm("Delete this unused wall finish?") && void onDelete(current.id)}>Delete</Button> : <span />}<div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !draft.name.trim()} onClick={() => void onSave(draft, current?.id)}>Save finish</Button></div></div>{current?.assignment_count ? <p className="mt-2 text-xs text-slate-500">This finish is in use. Reassign those wall faces before deleting it.</p> : null}</div></div>;
}
