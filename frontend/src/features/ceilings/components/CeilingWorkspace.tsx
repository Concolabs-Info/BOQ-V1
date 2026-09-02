"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Point } from "@/features/drawing/types";
import { confirmDrawingRegistration } from "@/features/drawings/api";
import { DrawingOverlayControls, type DrawingViewMode } from "@/features/drawings/components/DrawingOverlayControls";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import { useOptimisticMutationQueue } from "@/shared/hooks/useOptimisticMutationQueue";
import {
  analyzeCeilings, applyTypicalCeilingFloor, assignCeilingSystem, checkCeilingPlan,
  confirmCeilings, createCeilingDefinition, createCeilingFeature, createCeilingOpening,
  createCeilingZone, deleteCeilingFeature, deleteCeilingZone, getCeilingState,
  mergeCeilingZones, restoreCeilingHistory, reviewCeilingCandidates, splitCeilingZone,
  updateCeilingFeature, updateCeilingRegistration, updateCeilingZone,
} from "../api";
import type { CeilingDefinitionPayload, CeilingFeaturePayload, CeilingProfile, CeilingState, CeilingZone, CeilingZoneUpdate } from "../types";
import { CeilingDetailInspector, FEATURE_TYPES } from "./CeilingDetailsPanel";
import { CeilingFinishDialog } from "./CeilingFinishDialog";
import { CeilingHistoryDrawer } from "./CeilingHistoryDrawer";
import { CeilingPlanCanvas } from "./CeilingPlanCanvas";
import { CeilingZoneInspector } from "./CeilingZoneInspector";

type DrawMode = "zone" | "split" | "opening" | "feature" | null;

const emptyFeature = (): CeilingFeaturePayload => ({
  zone_id: null, definition_id: null, feature_type: "bulkhead", name: "", geometry: {},
  measurement_basis: "area", width_mm: null, height_mm: null, depth_mm: null,
  scope_state: "new", option_code: "", include_in_boq: true,
});

function filterStatus(zone: CeilingZone) {
  if (!zone.definition_id && !["no_ceiling", "exposed_structure", "no_work"].includes(zone.scope_state)) return "unassigned";
  if (zone.status === "confirmed" && zone.assignment_confirmed) return "confirmed";
  return "needs_review";
}

function statusLabel(zone: CeilingZone) {
  const status = filterStatus(zone);
  return status === "confirmed" ? "Ready" : status === "unassigned" ? "Needs a finish" : "Needs review";
}

function updateZone(zoneId: string, patch: CeilingZoneUpdate) {
  return (state: CeilingState): CeilingState => ({
    ...state,
    zones: state.zones.map((zone) => zone.id === zoneId ? {
      ...zone, ...patch,
      geometry: patch.points ? { points: patch.points } : zone.geometry,
      status: "confirmed", user_confirmed: true,
    } : zone),
  });
}

function assignZones(zoneIds: Set<string>, definitionId: string | null) {
  return (state: CeilingState): CeilingState => {
    const definition = state.definitions.find((item) => item.id === definitionId);
    return {
      ...state,
      zones: state.zones.map((zone) => zoneIds.has(zone.id) ? {
        ...zone, definition_id: definitionId, definition_code: definition?.code || null,
        definition_name: definition?.name || null, system_type: definition?.system_type || null,
        material: definition?.material || null, finish: definition?.finish || null,
        display_colour: definition?.display_colour || zone.display_colour,
        assignment_status: definition ? "confirmed" : "unassigned",
        assignment_confirmed: Boolean(definition), status: definition ? "confirmed" : "needs_review",
      } : zone),
    };
  };
}

export function CeilingWorkspace({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [featureDraft, setFeatureDraft] = useState<CeilingFeaturePayload>(emptyFeature);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoRequested, setAutoRequested] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingViewMode>("architectural");
  const [overlayOpacity, setOverlayOpacity] = useState(0.55);
  const editQueue = useOptimisticMutationQueue();

  const query = useQuery({
    queryKey: ["ceilings", projectId, floorId],
    queryFn: () => getCeilingState(projectId, floorId),
    staleTime: 30_000, refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    refetchInterval: (result) => result.state.data?.active_jobs.length ? 2000 : false,
  });
  const state = query.data;
  const selectedFloorId = floorId || state?.selected_floor_id || null;

  useEffect(() => {
    if (!state?.floors.length) return;
    const floor = state.floors.find((item) => item.id === floorId) || state.floors[0];
    if (floor.id !== floorId) setFloorId(floor.id);
  }, [floorId, state?.floors]);

  useEffect(() => {
    setSelectedZoneIds(new Set()); setSelectedFeatureId(null); setEditingDetail(false);
    setDrawMode(null); setDraftPoints([]); setDrawingMode("architectural");
  }, [floorId]);

  useEffect(() => {
    if (!floorId || !state || state.zones.length || autoRequested === floorId) return;
    setAutoRequested(floorId);
    void analyzeCeilings(projectId, floorId)
      .then(() => void client.invalidateQueries({ queryKey: ["ceilings", projectId] }))
      .catch(() => undefined);
  }, [autoRequested, client, floorId, projectId, state]);

  const floor = state?.floors.find((item) => item.id === selectedFloorId) || null;
  const architecturalUrl = useAssetUrl(floor?.architectural_drawing_url);
  const rcpUrl = useAssetUrl(floor?.rcp_drawing_url);
  const rcpDrawing = floor?.coordination_drawings.find((item) => item.drawing_type === "reflected_ceiling_plan") || null;
  const imageUrl = drawingMode === "drawing" ? (rcpUrl || architecturalUrl) : (architecturalUrl || rcpUrl);
  const overlayImageUrl = drawingMode === "overlay" && architecturalUrl && rcpUrl ? rcpUrl : null;
  const selectedZones = (state?.zones || []).filter((zone) => selectedZoneIds.has(zone.id));
  const selectedFeature = state?.features.find((feature) => feature.id === selectedFeatureId) || null;
  const filteredZones = useMemo(() => (state?.zones || []).filter((zone) => zoneFilter === "all" || filterStatus(zone) === zoneFilter), [state?.zones, zoneFilter]);
  const pendingCandidates = (state?.zone_candidates || []).filter((candidate) => candidate.status === "needs_review");
  const planEvidence = (state?.evidence || []).filter((item) => item.field_name === "profile" || item.field_name === "height_mm");
  const checkingPlan = Boolean(state?.active_jobs.some((job) => job.task_type === "ceilings.detect_drawing"));

  useEffect(() => {
    if (!selectedFeature) return;
    setFeatureDraft({
      zone_id: selectedFeature.zone_id, definition_id: selectedFeature.definition_id,
      feature_type: selectedFeature.feature_type, name: selectedFeature.name,
      geometry: selectedFeature.geometry || {}, measurement_basis: selectedFeature.measurement_basis,
      width_mm: selectedFeature.width_mm, height_mm: selectedFeature.height_mm,
      depth_mm: selectedFeature.depth_mm, scope_state: selectedFeature.scope_state,
      option_code: selectedFeature.option_code, include_in_boq: selectedFeature.include_in_boq,
    });
  }, [selectedFeature?.id]);

  function invalidate() {
    for (const key of [["ceilings", projectId], ["review", projectId], ["boq", projectId], ["workflow", projectId, "summary"]]) void client.invalidateQueries({ queryKey: key, refetchType: "active" });
  }

  async function act(action: () => Promise<unknown>, message = "The ceiling change could not be saved.", optimistic?: (current: CeilingState) => CeilingState) {
    if (optimistic) {
      await editQueue.enqueue<CeilingState>({
        queryKey: ["ceilings", projectId, floorId], mutation: action, optimistic,
        invalidations: [
          { queryKey: ["review", projectId], refetchType: "none" },
          { queryKey: ["boq", projectId], refetchType: "none" },
          { queryKey: ["workflow", projectId, "summary"], refetchType: "none" },
        ],
        errorMessage: message, onError: setError,
      });
      return;
    }
    setSaving(true); setError(null);
    try { await action(); invalidate(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : message); }
    finally { setSaving(false); }
  }

  function selectZone(zoneId: string, additive: boolean) {
    setSelectedFeatureId(null); setEditingDetail(false);
    setSelectedZoneIds((current) => {
      if (!additive) return new Set([zoneId]);
      const next = new Set(current); next.has(zoneId) ? next.delete(zoneId) : next.add(zoneId); return next;
    });
  }

  function beginDrawing(mode: Exclude<DrawMode, null>) {
    if ((mode === "split" || mode === "opening") && selectedZones.length !== 1) { setError(`Select one ceiling area before ${mode === "split" ? "splitting it" : "adding an opening"}.`); return; }
    setError(null); setDrawMode(mode); setDraftPoints([]);
  }

  async function finishDrawing() {
    if (!floorId || !drawMode) return;
    if (drawMode === "zone" && draftPoints.length < 3) { setError("A ceiling area needs at least three points."); return; }
    if (drawMode === "split" && draftPoints.length !== 2) { setError("A split line needs exactly two points."); return; }
    if (drawMode === "opening" && draftPoints.length < 3) { setError("A ceiling opening needs at least three points."); return; }
    if (drawMode === "feature") {
      const needed = featureDraft.measurement_basis === "area" ? 3 : featureDraft.measurement_basis === "length" ? 2 : 1;
      if (draftPoints.length < needed) { setError(`This detail needs at least ${needed} point${needed === 1 ? "" : "s"}.`); return; }
      const geometry = featureDraft.measurement_basis === "number" ? { point: draftPoints[0], quantity: featureDraft.geometry.quantity || 1 } : { points: draftPoints };
      setFeatureDraft((current) => ({ ...current, geometry })); setDrawMode(null); setDraftPoints([]); return;
    }
    await act(async () => {
      if (drawMode === "zone") await createCeilingZone(projectId, floorId, { points: draftPoints, profile_type: "flat", scope_state: "new", include_in_boq: true, definition_id: null });
      else if (drawMode === "split") await splitCeilingZone(projectId, floorId, selectedZones[0].id, draftPoints);
      else await createCeilingOpening(projectId, floorId, { zone_id: selectedZones[0].id, opening_type: "void", name: "Ceiling opening", geometry: { points: draftPoints }, deduction_rule: "explicit", deduct_from_area: true });
      setDrawMode(null); setDraftPoints([]);
    });
  }

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4">
      <label className="min-w-52"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Floor</span><select className="input mt-2 w-full" value={selectedFloorId || ""} onChange={(event) => setFloorId(event.target.value)}>{state?.floors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="flex flex-wrap gap-2">{floor?.rcp_available ? <Button variant="secondary" disabled={saving || checkingPlan || !selectedFloorId} onClick={() => { if (selectedFloorId) void act(() => checkCeilingPlan(projectId, selectedFloorId, true), "We could not check this ceiling plan."); }}>{checkingPlan ? "Checking plan…" : "Check ceiling plan"}</Button> : null}<Button variant="secondary" onClick={() => setFinishOpen(true)}>Add finish</Button><Button variant="secondary" onClick={() => { setEditingDetail(true); setSelectedFeatureId(null); setFeatureDraft(emptyFeature()); }}>Add detail</Button><Button variant="secondary" onClick={() => setHistoryOpen(true)}>History</Button></div>
    </div>
    {error ? <div className="p-4 pb-0"><ErrorMessage message={error} /></div> : null}
    <div className="mx-4 mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><strong>Areas from your floor plan.</strong><span className="ml-2">Choose a finish for each area.{floor?.rcp_available ? " You can also check the ceiling plan for heights, slopes and special details." : ""}</span></div>
    {checkingPlan ? <div className="mx-4 mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">Checking the ceiling plan for extra information. You can continue reviewing the areas while this runs.</div> : null}

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => beginDrawing("zone")}>Draw ceiling area</Button><Button variant="secondary" disabled={selectedZones.length !== 1} onClick={() => beginDrawing("split")}>Split area</Button><Button variant="secondary" disabled={selectedZones.length !== 1} onClick={() => beginDrawing("opening")}>Add opening</Button></div>
      <div className="flex flex-wrap items-center gap-3">{rcpUrl ? <DrawingOverlayControls mode={drawingMode} opacity={overlayOpacity} hasDrawing onMode={setDrawingMode} onOpacity={setOverlayOpacity} labels={{ architectural: "Floor plan", drawing: "Ceiling plan", overlay: "Both plans" }} opacityLabel="Show ceiling plan" /> : null}{rcpDrawing && rcpDrawing.registration_status !== "confirmed" ? <Button variant="secondary" disabled={saving} onClick={() => void act(() => confirmDrawingRegistration(projectId, rcpDrawing), "We could not save the plan position.")}>Confirm plan position</Button> : null}<p className="text-xs text-slate-500"><strong className="text-slate-800">{state?.summary.zones || 0}</strong> areas · <strong className="text-slate-800">{Number(state?.summary.area_m2 || 0).toFixed(2)}</strong> m² · <strong className="text-amber-700">{(state?.summary.needs_review || 0) + (state?.summary.unassigned || 0)}</strong> to review</p></div>
    </div>

    <div className="grid min-h-[640px] grid-cols-1 overflow-hidden xl:grid-cols-[290px_minmax(0,1fr)_340px]">
      <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Ceiling areas</h3><select className="input h-9 text-xs" value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}><option value="all">All</option><option value="needs_review">Needs review</option><option value="unassigned">Needs a finish</option><option value="confirmed">Ready</option></select></div>
        <div className="mt-3 space-y-2">{filteredZones.map((zone) => <button type="button" key={zone.id} onClick={(event) => selectZone(zone.id, event.shiftKey || event.ctrlKey || event.metaKey)} className={`lazy-list-item w-full rounded-xl border p-3 text-left ${selectedZoneIds.has(zone.id) && !editingDetail ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="flex gap-3"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: zone.display_colour || "#94a3b8" }} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{zone.zone_number} · {zone.name || zone.rooms[0]?.room_name || "Ceiling area"}</p><p className="mt-1 truncate text-xs text-slate-500">{zone.definition_code || "No finish selected"} · {Number(zone.net_area_m2 || 0).toFixed(2)} m²</p><p className={`mt-1 text-[11px] font-semibold ${filterStatus(zone) === "confirmed" ? "text-emerald-700" : "text-amber-700"}`}>{statusLabel(zone)}</p></div></div></button>)}{!filteredZones.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No ceiling areas match this filter.</p> : null}</div>

        <details className="mt-5 border-t border-slate-200 pt-4" open={editingDetail || Boolean(state?.features.length)}><summary className="cursor-pointer text-sm font-semibold text-slate-800">Special details ({state?.features.length || 0})</summary><div className="mt-2 space-y-2">{state?.features.map((feature) => <button key={feature.id} type="button" className={`w-full rounded-lg border p-2 text-left text-xs ${selectedFeatureId === feature.id ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`} onClick={() => { setSelectedFeatureId(feature.id); setEditingDetail(true); }}><span className="font-semibold text-slate-800">{feature.name || FEATURE_TYPES.find((item) => item.value === feature.feature_type)?.label}</span><span className="mt-1 block text-slate-500">{Number(feature.net_quantity || 0).toFixed(feature.measurement_unit === "nr" ? 0 : 2)} {feature.measurement_unit}</span></button>)}</div></details>

        {pendingCandidates.length ? <details className="mt-5 border-t border-violet-200 pt-4" open><summary className="cursor-pointer text-sm font-semibold text-violet-900">Items found on the ceiling plan ({pendingCandidates.length})</summary><p className="mt-2 text-xs leading-5 text-slate-500">Use an item to attach it to the matching floor-plan area, or ignore it.</p><div className="mt-2 space-y-2">{pendingCandidates.map((candidate) => <div key={candidate.id} className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs"><p className="font-semibold text-violet-950">{candidate.label || "Ceiling plan item"}</p><div className="mt-2 flex gap-2"><button type="button" disabled={saving || !selectedFloorId} onClick={() => { if (selectedFloorId) void act(() => reviewCeilingCandidates(projectId, selectedFloorId, [candidate.id], "accept")); }} className="rounded-md bg-violet-700 px-2 py-1 font-semibold text-white disabled:bg-slate-300">Use</button><button type="button" disabled={saving || !selectedFloorId} onClick={() => { if (selectedFloorId) void act(() => reviewCeilingCandidates(projectId, selectedFloorId, [candidate.id], "reject", "Not needed")); }} className="rounded-md border border-violet-300 px-2 py-1 font-semibold text-violet-800">Ignore</button></div></div>)}</div></details> : null}
        {planEvidence.length ? <details className="mt-5 border-t border-blue-200 pt-4"><summary className="cursor-pointer text-sm font-semibold text-blue-900">Heights and slopes found ({planEvidence.length})</summary><p className="mt-2 text-xs leading-5 text-slate-500">Select one ceiling area, then use the information that applies to it.</p><div className="mt-2 space-y-2">{planEvidence.map((item) => <div key={item.id} className="rounded-lg border border-blue-200 bg-white p-3 text-xs"><p className="font-semibold text-slate-800">{item.source_text || item.value_text || (item.field_name === "profile" ? "Sloped ceiling" : "Ceiling height")}</p><p className="mt-1 text-slate-500">{item.source_file_name || "Ceiling plan"}{item.source_page ? ` · page ${item.source_page}` : ""}</p><button type="button" className="mt-2 font-semibold text-blue-700 disabled:text-slate-400" disabled={saving || selectedZones.length !== 1 || !floorId} onClick={() => { if (!floorId || selectedZones.length !== 1) return; const zoneId = selectedZones[0].id; const payload = item.field_name === "profile" ? { profile_type: "sloped" as const, profile: { ...(item.metadata as CeilingProfile), source: "ceiling_plan" as const, needs_confirmation: true } } : { height_mm: Number(item.value_text) }; void act(() => updateCeilingZone(projectId, floorId, zoneId, payload), "The ceiling information could not be saved.", updateZone(zoneId, payload)); }}>Use on selected area</button></div>)}</div></details> : null}
      </aside>

      <div className="relative flex min-w-0 flex-col bg-slate-100"><CeilingPlanCanvas floor={floor} imageUrl={imageUrl} overlayImageUrl={overlayImageUrl} overlayOpacity={overlayOpacity} zones={state?.zones || []} candidates={state?.zone_candidates || []} features={state?.features || []} openings={state?.openings || []} devices={state?.devices || []} selectedZoneIds={selectedZoneIds} selectedFeatureId={selectedFeatureId} drawing={Boolean(drawMode)} draftPoints={draftPoints} onPoint={(point) => { if (!drawMode) return; setDraftPoints((current) => drawMode === "split" && current.length >= 2 ? current : [...current, point]); }} onZone={selectZone} onFeature={(id) => { setSelectedFeatureId(id); setEditingDetail(true); }} />{drawMode ? <DrawingActions mode={drawMode} points={draftPoints.length} saving={saving} onUndo={() => setDraftPoints((current) => current.slice(0, -1))} onCancel={() => { setDrawMode(null); setDraftPoints([]); }} onFinish={() => void finishDrawing()} /> : null}</div>

      {editingDetail ? <CeilingDetailInspector feature={selectedFeature} draft={featureDraft} definitions={state?.definitions || []} zones={state?.zones || []} quantities={state?.quantities || []} saving={saving} onClose={() => { setEditingDetail(false); setSelectedFeatureId(null); }} onDraft={setFeatureDraft} onDraw={() => beginDrawing("feature")} onSave={async () => { if (!floorId) return; await act(() => selectedFeature ? updateCeilingFeature(projectId, floorId, selectedFeature.id, featureDraft) : createCeilingFeature(projectId, floorId, featureDraft)); }} onConfirm={async () => { if (selectedFeature) { const id = selectedFeature.id; await act(() => confirmCeilings(projectId, "feature", [id]), "The ceiling detail could not be confirmed.", (current) => ({ ...current, features: current.features.map((item) => item.id === id ? { ...item, status: "confirmed", user_confirmed: true } : item) })); } }} onDelete={async () => { if (!floorId || !selectedFeature || !window.confirm("Delete this ceiling detail?")) return; const id = selectedFeature.id; setSelectedFeatureId(null); setFeatureDraft(emptyFeature()); setEditingDetail(false); await act(() => deleteCeilingFeature(projectId, floorId, id), "The ceiling detail could not be deleted.", (current) => ({ ...current, features: current.features.filter((item) => item.id !== id), quantities: current.quantities.filter((item) => item.feature_id !== id) })); }} /> : <CeilingZoneInspector zones={selectedZones} definitions={state?.definitions || []} floors={state?.floors || []} floorId={floorId || ""} saving={saving} onAddFinish={() => setFinishOpen(true)} onAssign={async (definitionId) => { const ids = new Set(selectedZoneIds); await act(() => assignCeilingSystem(projectId, [...ids], definitionId), "The ceiling finish could not be assigned.", assignZones(ids, definitionId)); }} onSave={async (zoneId, payload) => { if (floorId) await act(() => updateCeilingZone(projectId, floorId, zoneId, payload), "The ceiling area could not be saved.", updateZone(zoneId, payload)); }} onConfirm={async () => { const ids = new Set(selectedZoneIds); await act(async () => { await confirmCeilings(projectId, "zone", [...ids]); const assignments = selectedZones.map((zone) => zone.assignment_id).filter((id): id is string => Boolean(id)); if (assignments.length) await confirmCeilings(projectId, "assignment", assignments); }, "The ceiling areas could not be confirmed.", (current) => ({ ...current, zones: current.zones.map((zone) => ids.has(zone.id) ? { ...zone, status: "confirmed", user_confirmed: true, assignment_status: zone.definition_id ? "confirmed" : zone.assignment_status, assignment_confirmed: Boolean(zone.definition_id) } : zone) })); }} onDelete={async (zone) => { if (!floorId || !window.confirm(`Delete ${zone.zone_number || "this ceiling area"}?`)) return; const id = zone.id; setSelectedZoneIds(new Set()); await act(() => deleteCeilingZone(projectId, floorId, id), "The ceiling area could not be deleted.", (current) => ({ ...current, zones: current.zones.filter((item) => item.id !== id), openings: current.openings.filter((item) => item.zone_id !== id), features: current.features.filter((item) => item.zone_id !== id), quantities: current.quantities.filter((item) => item.zone_id !== id) })); }} onMerge={async () => { if (floorId) await act(() => mergeCeilingZones(projectId, floorId, [...selectedZoneIds])); setSelectedZoneIds(new Set()); }} onTypical={async (targets) => { if (floorId) await act(() => applyTypicalCeilingFloor(projectId, floorId, targets)); }} />}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{state?.can_continue ? "The ceiling areas and finishes are ready." : "Check each ceiling area and choose its finish before continuing."}</p><Link href={appRoutes.workflowStep(projectId, "review")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${state?.can_continue ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-200 bg-slate-50 text-slate-500"}`}>Continue to Review</Link></div>
    <CeilingFinishDialog open={finishOpen} saving={saving} onClose={() => setFinishOpen(false)} onSave={async (payload: CeilingDefinitionPayload) => { await act(() => createCeilingDefinition(projectId, payload)); setFinishOpen(false); }} />
    <CeilingHistoryDrawer open={historyOpen} history={state?.history || []} saving={saving} onClose={() => setHistoryOpen(false)} onRestore={async (id) => { await act(() => restoreCeilingHistory(projectId, id)); }} />
  </div>;
}

function DrawingActions({ mode, points, saving, onUndo, onCancel, onFinish }: { mode: Exclude<DrawMode, null>; points: number; saving: boolean; onUndo: () => void; onCancel: () => void; onFinish: () => void }) {
  const labels: Record<Exclude<DrawMode, null>, string> = { zone: "ceiling area", split: "split line", opening: "opening", feature: "ceiling detail" };
  return <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"><span className="px-2 text-xs font-medium text-slate-600">Drawing {labels[mode]} · {points} point(s)</span><Button variant="secondary" disabled={!points} onClick={onUndo}>Undo</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving} onClick={onFinish}>Finish</Button></div>;
}
