"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import { confirmDrawingRegistration } from "@/features/drawings/api";
import { DrawingOverlayControls, drawingSvgTransform, type DrawingViewMode } from "@/features/drawings/components/DrawingOverlayControls";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import {
  assignWallFinish,
  confirmWallFinishes,
  createWallFinishDefinition,
  createWallFinishZone,
  deactivateWallFinishDefinition,
  deleteWallFinishZone,
  ensureWallFinishes,
  getWallFinishState,
  updateWallFinishDefinition,
  updateWallFinishNorth,
  updateWallFinishZone,
} from "../wallFinishApi";
import type { WallFinishDefinitionPayload } from "../wallFinishTypes";
import { WallFinishInspector } from "./WallFinishInspector";
import { WallFinishOverlay } from "./WallFinishOverlay";

const queryKey = (projectId: string, floorId: string | null) => ["wall-finishes", projectId, floorId] as const;

export function WallFinishesWorkspace({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const requested = useRef(new Set<string>());
  const [floorId, setFloorId] = useState<string | null>(null);
  const [faceId, setFaceId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [batchFaceIds, setBatchFaceIds] = useState<Set<string>>(new Set());
  const [batchFinishId, setBatchFinishId] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "confirmed">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [northDraft, setNorthDraft] = useState(0);
  const [planDrawingMode, setPlanDrawingMode] = useState<DrawingViewMode>("overlay");
  const [overlayOpacity, setOverlayOpacity] = useState(0.55);
  const query = useQuery({
    queryKey: queryKey(projectId, floorId),
    queryFn: () => getWallFinishState(projectId, floorId),
    placeholderData: (previous) => previous,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: (result) => result.state.data?.active_jobs.length ? 1500 : false,
  });
  const state = query.data;

  useEffect(() => {
    if (!state?.floors.length) return;
    const next = state.floors.find((item) => item.id === floorId) || state.floors[0];
    if (next.id !== floorId) setFloorId(next.id);
  }, [floorId, state?.floors]);

  useEffect(() => {
    setBatchFaceIds(new Set());
    setBatchFinishId("");
  }, [floorId]);

  useEffect(() => {
    if (!state || !floorId || state.active_jobs.length || !state.needs_automatic_sync) return;
    const key = `${floorId}:${state.floors.find((item) => item.id === floorId)?.wall_finish_version || 0}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    void ensureWallFinishes(projectId, floorId).then(() => client.invalidateQueries({ queryKey: ["wall-finishes", projectId] })).catch((reason) => setError(reason instanceof Error ? reason.message : "Wall finishes could not be prepared."));
  }, [client, floorId, projectId, state]);

  useEffect(() => {
    const face = state?.faces.find((item) => item.id === faceId) || state?.faces[0];
    if (!face) { setFaceId(null); setZoneId(null); return; }
    if (face.id !== faceId) setFaceId(face.id);
    if (!face.zones.some((item) => item.id === zoneId)) {
      setZoneId(face.zones.find((item) => item.zone_type === "background")?.id || face.zones[0]?.id || null);
    }
  }, [faceId, state?.faces, zoneId]);

  const floor = state?.floors.find((item) => item.id === floorId) || null;
  useEffect(() => setNorthDraft(floor?.plan_north_degrees || 0), [floor?.id, floor?.plan_north_degrees]);
  const architecturalUrl = useAssetUrl(floor?.architectural_drawing_url);
  const finishPlanUrl = useAssetUrl(floor?.wall_finish_drawing_url);
  const wallFinishDrawing = floor?.finish_drawings.find((item) => item.drawing_type === "wall_finish_plan") || null;
  const imageUrl = planDrawingMode === "drawing" ? (finishPlanUrl || architecturalUrl) : (architecturalUrl || finishPlanUrl);
  const overlayImageUrl = planDrawingMode === "overlay" && architecturalUrl && finishPlanUrl ? finishPlanUrl : null;
  const faces = useMemo(() => (state?.faces || []).filter((face) => {
    const assigned = face.zones.filter((item) => item.finish_id);
    const confirmed = assigned.length === face.zones.length && assigned.every((item) => item.assignment_status === "confirmed" || item.assignment_status === "auto_confirmed");
    if (filter === "confirmed") return confirmed;
    if (filter === "review") return !confirmed;
    return true;
  }), [filter, state?.faces]);
  const wallGroups = useMemo(() => {
    const groups = new Map<string, typeof faces>();
    for (const face of faces) {
      const current = groups.get(face.wall_id) || [];
      current.push(face);
      groups.set(face.wall_id, current);
    }
    return [...groups.entries()].map(([wallId, wallFaces]) => ({ wallId, faces: wallFaces }));
  }, [faces]);
  const selectedFace = state?.faces.find((item) => item.id === faceId) || null;
  const selectedWallFaces = selectedFace
    ? (state?.faces || []).filter((item) => item.wall_id === selectedFace.wall_id)
    : [];
  const selectedZone = selectedFace?.zones.find((item) => item.id === zoneId) || null;

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["wall-finishes", projectId], refetchType: "active" }),
      client.invalidateQueries({ queryKey: ["review", projectId], refetchType: "active" }),
      client.invalidateQueries({ queryKey: ["boq", projectId], refetchType: "active" }),
      client.invalidateQueries({ queryKey: ["walls", projectId], refetchType: "active" }),
      client.invalidateQueries({ queryKey: ["workflow", projectId, "summary"], refetchType: "active" }),
    ]);
  }

  async function act(action: () => Promise<unknown>) {
    setSaving(true); setError(null);
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The wall-finish change could not be saved."); }
    finally { setSaving(false); }
  }

  function selectFace(nextFaceId: string, nextZoneId?: string) {
    const face = state?.faces.find((item) => item.id === nextFaceId);
    setFaceId(nextFaceId);
    setZoneId(nextZoneId || face?.zones.find((item) => item.zone_type === "background")?.id || face?.zones[0]?.id || null);
  }

  function toggleBatchFace(targetFaceId: string) {
    setBatchFaceIds((current) => {
      const next = new Set(current);
      if (next.has(targetFaceId)) next.delete(targetFaceId);
      else next.add(targetFaceId);
      return next;
    });
  }

  const processing = Boolean(state?.active_jobs.length);
  return <>
    <div className="grid h-[calc(100dvh-340px)] min-h-[680px] max-h-[1060px] grid-cols-[240px_minmax(0,1fr)_340px] overflow-hidden">
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Floors</p>
        <select className="input w-full" value={floorId || ""} onChange={(event) => setFloorId(event.target.value)}>{state?.floors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">{(["all", "review", "confirmed"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? "rounded-lg bg-white px-2 py-2 text-xs font-semibold capitalize text-slate-900 shadow-sm" : "px-2 py-2 text-xs font-semibold capitalize text-slate-500"}>{item}</button>)}</div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Wall faces</p><button type="button" className="text-xs font-semibold text-blue-700" onClick={() => setBatchFaceIds(batchFaceIds.size === faces.length ? new Set() : new Set(faces.map((face) => face.id)))}>{batchFaceIds.size === faces.length && faces.length ? "Clear" : "Select all"}</button></div>{batchFaceIds.size ? <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-2.5"><p className="text-xs font-semibold text-blue-900">{batchFaceIds.size} face{batchFaceIds.size === 1 ? "" : "s"} selected</p><select className="input mt-2 w-full bg-white" value={batchFinishId} onChange={(event) => setBatchFinishId(event.target.value)}><option value="">Choose finish</option>{state?.definitions.map((item) => <option key={item.id} value={item.id}>{item.original_tag ? `${item.original_tag} · ` : ""}{item.name}</option>)}</select><Button className="mt-2 w-full" disabled={saving || !batchFinishId} onClick={() => void act(() => assignWallFinish(projectId, { wall_face_ids: [...batchFaceIds], finish_id: batchFinishId, confirm: true })).then(() => setBatchFaceIds(new Set()))}>Apply to selected</Button></div> : null}<div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{faces.map((face) => {
          const background = face.zones.find((item) => item.zone_type === "background") || face.zones[0];
          const needsReview = face.zones.some((item) => !item.finish_id || !["confirmed", "auto_confirmed"].includes(item.assignment_status || ""));
          return <div key={face.id} className="flex items-stretch gap-1"><button type="button" aria-label={`Select ${face.friendly_number} for batch editing`} onClick={() => toggleBatchFace(face.id)} className={batchFaceIds.has(face.id) ? "w-8 shrink-0 rounded-lg bg-blue-600 text-xs font-bold text-white" : "w-8 shrink-0 rounded-lg border border-slate-200 text-xs font-bold text-slate-400 hover:border-blue-300"}>{batchFaceIds.has(face.id) ? "✓" : "+"}</button><button type="button" onClick={() => selectFace(face.id)} className={face.id === faceId ? "min-w-0 flex-1 rounded-xl border border-blue-300 bg-blue-50 p-3 text-left" : "min-w-0 flex-1 rounded-xl border border-transparent p-3 text-left hover:border-slate-200 hover:bg-slate-50"}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{face.friendly_number}</span><span className={needsReview ? "text-[10px] font-semibold text-amber-700" : "text-[10px] font-semibold text-emerald-700"}>{needsReview ? "Review" : "Confirmed"}</span></div><p className="mt-1 truncate text-xs text-slate-600">{face.adjacent_room_number ? `${face.adjacent_room_number} · ` : ""}{face.adjacent_room_name || face.adjacent_space || "External"}</p><div className="mt-2 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: background?.display_colour || "#cbd5e1" }} /><span className="min-w-0 flex-1 truncate text-xs text-slate-500">{background?.finish_code || background?.finish_name || "Unassigned"}</span><span className="text-xs text-slate-400">{face.room_relative_direction}</span></div></button></div>;
        })}{!faces.length ? <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">{processing ? "Building wall faces and matching finishes…" : "Wall faces will appear automatically after walls and rooms are ready."}</p> : null}</div></div>
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-100">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2"><div><p className="text-sm font-semibold">Wall-finish plan</p><p className="text-xs text-slate-500">Exact detected wall lines on the saved floor crop. Choose Side A or B in the inspector.</p></div><DrawingOverlayControls mode={planDrawingMode} opacity={overlayOpacity} hasDrawing={Boolean(finishPlanUrl)} onMode={setPlanDrawingMode} onOpacity={setOverlayOpacity} /><div className="flex items-center gap-2">{wallFinishDrawing && wallFinishDrawing.registration_status !== "confirmed" ? <Button variant="secondary" disabled={saving} onClick={() => void act(() => confirmDrawingRegistration(projectId, wallFinishDrawing))}>Confirm alignment</Button> : null}<label className="flex items-center gap-2 text-xs text-slate-600">Plan north<input className="input w-20" type="number" value={northDraft} onChange={(event) => setNorthDraft(Number(event.target.value))} onBlur={() => { if (floorId && northDraft !== (floor?.plan_north_degrees || 0)) void act(() => updateWallFinishNorth(projectId, floorId, northDraft)); }} />°</label><Button disabled={processing || saving || !(state?.zones.some((item) => item.finish_id))} onClick={() => void act(() => confirmWallFinishes(projectId, { assignment_ids: [], scope: "floor", floor_id: floorId }))}>Confirm assigned</Button></div></div>
        {floor ? <DrawingCanvas imageUrl={imageUrl} width={floor.drawing_width} height={floor.drawing_height} tool="select" className="min-h-0 flex-1">{overlayImageUrl ? <image href={overlayImageUrl} x={0} y={0} width={floor.drawing_width} height={floor.drawing_height} preserveAspectRatio="none" opacity={overlayOpacity} transform={drawingSvgTransform(wallFinishDrawing)} className="pointer-events-none" /> : null}{wallGroups.map((wall) => <WallFinishOverlay key={wall.wallId} faces={wall.faces} selectedFaceId={faceId} onSelect={(nextFaceId) => selectFace(nextFaceId)} />)}</DrawingCanvas> : <div className="flex h-full items-center justify-center text-sm text-slate-500">No floor drawing is ready.</div>}
        {processing ? <div className="absolute bottom-8 left-5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow">Reading schedules and applying wall finishes…</div> : null}
        <div className="absolute bottom-5 right-5 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow"><div className="flex gap-4"><span><strong>{state?.summary.confirmed || 0}</strong> confirmed</span><span><strong>{state?.summary.needs_review || 0}</strong> review</span><span><strong>{state?.summary.unassigned || 0}</strong> unassigned</span><span><strong>{state?.summary.area_m2.toFixed(2) || "0.00"}</strong> m²</span></div></div>
      </main>

      <aside className="min-h-0 overflow-y-auto bg-white"><WallFinishInspector face={selectedFace} wallFaces={selectedWallFaces} zone={selectedZone} definitions={state?.definitions || []} saving={saving} onSelectFace={(nextFaceId) => selectFace(nextFaceId)} onSelectZone={setZoneId} onAssign={async (targetZoneId, targetFinishId) => { await act(() => assignWallFinish(projectId, { zone_ids: [targetZoneId], finish_id: targetFinishId, confirm: true })); }} onCreateZone={async (payload) => { if (!selectedFace) return; await act(() => createWallFinishZone(projectId, selectedFace.id, payload)); }} onUpdateZone={async (targetZoneId, payload) => { await act(() => updateWallFinishZone(projectId, targetZoneId, payload)); }} onDeleteZone={async (targetZoneId) => { await act(() => deleteWallFinishZone(projectId, targetZoneId)); setZoneId(null); }} onSaveDefinition={async (payload: WallFinishDefinitionPayload, finishId?: string) => { await act(() => finishId ? updateWallFinishDefinition(projectId, finishId, payload) : createWallFinishDefinition(projectId, payload)); }} onDeleteDefinition={async (finishId) => { await act(() => deactivateWallFinishDefinition(projectId, finishId)); }} />{error ? <div className="px-5 pb-5"><ErrorMessage message={error} /></div> : null}</aside>
    </div>
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4"><Link className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700" href={appRoutes.workflowStep(projectId, "model-review")}>Back to Model Review</Link><Link className="inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white" href={appRoutes.workflowStep(projectId, "floors")}>Continue to Floors</Link></div>
  </>;
}
