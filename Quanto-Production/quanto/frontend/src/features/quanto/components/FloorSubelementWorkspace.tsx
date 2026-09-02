"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getFloorFinishState } from "@/features/floor-finishes/api";
import { getFloorWorkState } from "@/features/floor-works/api";
import type { FloorWorkType } from "@/features/floor-works/types";
import { appRoutes } from "@/shared/constants/appRoutes";
import { friendlyRoomLabel } from "../friendlyLabels";

export type FloorPart = "areas" | "finishes" | FloorWorkType;

export const FLOOR_PARTS: Array<{ value: FloorPart; label: string; description: string; unit: "m²" | "m" }> = [
  { value: "areas", label: "Floor areas", description: "Detected rooms and physical floor boundaries", unit: "m²" },
  { value: "finishes", label: "Floor finishes", description: "Tiles, timber, vinyl and other visible finishes", unit: "m²" },
  { value: "screed", label: "Screed / floor bed", description: "Screed or bedding below the floor finish", unit: "m²" },
  { value: "waterproofing", label: "Waterproofing", description: "Floor waterproofing and perimeter upturns", unit: "m²" },
  { value: "underlay", label: "Underlay", description: "Underlay below the selected finish", unit: "m²" },
  { value: "board_insulation", label: "Board insulation", description: "Rigid floor-insulation layers", unit: "m²" },
  { value: "quilt_insulation", label: "Quilt insulation", description: "Quilt or flexible floor-insulation layers", unit: "m²" },
  { value: "isolation_membrane", label: "Isolation membrane", description: "Separation and isolation membranes", unit: "m²" },
  { value: "sealer", label: "Sealer / coating", description: "Applied sealers and protective floor coatings", unit: "m²" },
  { value: "skirting", label: "Skirting", description: "Room perimeter excluding doors and omitted edges", unit: "m" },
];

const floorPartValues = new Set(FLOOR_PARTS.map((item) => item.value));

export function normalizeFloorPart(value: string | null): FloorPart {
  return value && floorPartValues.has(value as FloorPart) ? value as FloorPart : "areas";
}

export function floorPartSuffix(part: FloorPart): string {
  return `?floorPart=${encodeURIComponent(part)}`;
}

export function FloorSubelementSelector({
  projectId,
  view,
  part,
  detectionStatus,
  cached,
  retrying,
  onRunFresh,
}: {
  projectId: string;
  view: string;
  part: FloorPart;
  detectionStatus?: string | null;
  cached?: boolean;
  retrying?: boolean;
  onRunFresh?: () => void;
}) {
  const router = useRouter();
  const selected = FLOOR_PARTS.find((item) => item.value === part) || FLOOR_PARTS[0];
  const needsReview = detectionStatus === "pass_with_flags" || detectionStatus === "needs_review";
  return (
    <div className="mb-1.5 flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <label className="shrink-0 text-xs font-bold uppercase tracking-[.12em] text-slate-500" htmlFor="floor-part-selector">Floor section</label>
        <select
          id="floor-part-selector"
          className="h-8 min-w-[210px] rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
          value={part}
          onChange={(event) => router.push(`${appRoutes.takeoff(projectId, "floor", view)}${floorPartSuffix(event.target.value as FloorPart)}`)}
        >
          {FLOOR_PARTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <span className="hidden truncate text-xs text-slate-500 lg:inline">{selected.description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
        <span className={needsReview ? "rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700" : "rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700"}>
          {needsReview ? "Assignments need review" : "Detection checked"}
        </span>
        {cached ? <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">Saved result</span> : null}
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{selected.unit}</span>
        {cached && onRunFresh ? <button type="button" disabled={retrying} onClick={onRunFresh} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50">{retrying ? "Running…" : "Run fresh"}</button> : null}
      </div>
    </div>
  );
}

function readableStatus(value: string) {
  if (value === "auto_confirmed") return "Automatically assigned";
  if (value === "needs_review") return "Needs review";
  if (value === "not_required") return "Not required";
  if (value === "unassigned") return "Not assigned";
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function StatusBadge({ value }: { value: string }) {
  const ready = value === "confirmed" || value === "auto_confirmed";
  const omitted = value === "not_required";
  return <span className={ready ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700" : omitted ? "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600" : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"}>{readableStatus(value)}</span>;
}

export function FloorSubelementWorkbook({ projectId, part }: { projectId: string; part: Exclude<FloorPart, "areas"> }) {
  const isFinish = part === "finishes";
  const finishQuery = useQuery({
    queryKey: ["floor-finishes", projectId, "workbook"],
    queryFn: async () => {
      const first = await getFloorFinishState(projectId);
      const states = await Promise.all(first.floors.map((floor) => floor.id === first.selected_floor_id ? Promise.resolve(first) : getFloorFinishState(projectId, floor.id)));
      return { ...first, rooms: states.flatMap((state) => state.rooms), assignments: states.flatMap((state) => state.assignments), zones: states.flatMap((state) => state.zones) };
    },
    enabled: isFinish,
    refetchOnWindowFocus: false,
  });
  const worksQuery = useQuery({
    queryKey: ["floor-works", projectId, "workbook"],
    queryFn: async () => {
      const first = await getFloorWorkState(projectId);
      const states = await Promise.all(first.floors.map((floor) => floor.id === first.selected_floor_id ? Promise.resolve(first) : getFloorWorkState(projectId, floor.id)));
      return { ...first, rooms: states.flatMap((state) => state.rooms), assignments: states.flatMap((state) => state.assignments), zones: states.flatMap((state) => state.zones) };
    },
    enabled: !isFinish,
    refetchOnWindowFocus: false,
  });
  const loading = isFinish ? finishQuery.isLoading : worksQuery.isLoading;
  const error = isFinish ? finishQuery.error : worksQuery.error;
  const floorNames = new Map((isFinish ? finishQuery.data?.floors : worksQuery.data?.floors)?.map((floor) => [floor.id, floor.name]) || []);
  const rows = isFinish
    ? (finishQuery.data?.assignments || []).map((item) => ({
        id: item.id,
        room: friendlyRoomLabel(item.room_name || item.room_number),
        floor: floorNames.get(item.floor_id) || "Floor",
        system: item.finish_name || item.finish_description || "Finish not assigned",
        quantity: item.nrm_quantity ?? item.net_area_m2,
        unit: item.measurement_unit || "m²",
        order: item.order_area_m2,
        status: item.status,
      }))
    : (worksQuery.data?.assignments || []).filter((item) => item.work_type === part).map((item) => {
        const room = worksQuery.data?.rooms.find((candidate) => candidate.id === item.room_id);
        return {
          id: item.id,
          room: friendlyRoomLabel(room?.name || room?.friendly_number),
          floor: floorNames.get(item.floor_id) || "Floor",
          system: item.definition_name || item.definition_description || (item.status === "not_required" ? "Not required" : "System not assigned"),
          quantity: item.nrm_quantity,
          unit: item.measurement_unit || (part === "skirting" ? "m" : "m²"),
          order: item.order_quantity,
          status: item.status,
        };
      });
  const selected = FLOOR_PARTS.find((item) => item.value === part)!;
  const total = rows.filter((row) => row.status !== "not_required").reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const review = rows.filter((row) => !["confirmed", "auto_confirmed", "not_required"].includes(row.status)).length;

  if (loading) return <div className="flex min-h-[420px] items-center justify-center bg-white text-sm text-slate-500">Loading {selected.label.toLowerCase()} workbook…</div>;
  if (error) return <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The {selected.label.toLowerCase()} workbook could not be loaded.</div>;
  return (
    <section className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div><h2 className="text-base font-bold text-slate-900">{selected.label} workbook</h2><p className="mt-1 text-xs text-slate-500">Quantities reuse the confirmed room geometry. Edit assignments from the Drawing view.</p></div>
        <div className="flex gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-3 py-2 font-semibold">{rows.length} assignments</span><span className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-700">{total.toFixed(2)} {selected.unit}</span>{review ? <span className="rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-700">{review} need review</span> : null}</div>
      </header>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Room or area</th><th className="px-4 py-3">Storey</th><th className="px-4 py-3">System</th><th className="px-4 py-3 text-right">Measured quantity</th><th className="px-4 py-3 text-right">Order quantity</th><th className="px-5 py-3">Status</th></tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold text-slate-900">{row.room}</td><td className="px-4 py-3 text-slate-600">{row.floor}</td><td className="px-4 py-3 text-slate-700">{row.system}</td><td className="px-4 py-3 text-right font-semibold">{row.quantity == null ? "—" : `${Number(row.quantity).toFixed(2)} ${row.unit}`}</td><td className="px-4 py-3 text-right text-slate-600">{row.order == null ? "—" : `${Number(row.order).toFixed(2)} ${row.unit}`}</td><td className="px-5 py-3"><StatusBadge value={row.status} /></td></tr>) : <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-500">No {selected.label.toLowerCase()} assignments have been found yet. Open Drawing and run analysis or assign the system to rooms.</td></tr>}</tbody>
      </table>
    </section>
  );
}

export function FloorSubelement3DNotice({ part }: { part: Exclude<FloorPart, "areas"> }) {
  const selected = FLOOR_PARTS.find((item) => item.value === part)!;
  return <div className="mb-2 flex shrink-0 items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-900"><span><strong>{selected.label} layer:</strong> the 3D view uses the same detected room geometry and storey positions.</span><span className="font-semibold">Quantities remain {selected.unit === "m" ? "linear" : "area-based"}</span></div>;
}
