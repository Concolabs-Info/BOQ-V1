"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Point } from "@/features/drawing/types";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import {
  addRoofLayer, analyzeRoofs, confirmRoofEntities, createRoofComponent, createRoofDefinition,
  createRoofEdge, createRoofLevel, createRoofOpening, createRoofPlane, deleteRoofComponent,
  deleteRoofEdge, deleteRoofOpening, deleteRoofPlane, downloadRoofCrop, getRoofState, importRoofJson, restoreRoofHistory,
  splitRoofPlane, updateRoofEdge, updateRoofPlane,
} from "../api";
import type { RoofAnalysisQuality } from "../api";
import type { RoofComponent, RoofOpening, RoofPlane, RoofPlanePayload, RoofState } from "../types";
import { RoofAnalysisControls } from "./RoofAnalysisControls";
import { RoofBuildUpsPanel } from "./RoofBuildUpsPanel";
import { RoofJsonImportPanel } from "./RoofJsonImportPanel";
import { RoofPlanCanvas } from "./RoofPlanCanvas";
import { RoofPlaneInspector } from "./RoofPlaneInspector";

type DrawMode = "plane" | "split" | "edge" | "opening" | "component" | null;
type SidePanel = "roof" | "build-ups" | "components";
type OptimisticRoofUpdate = (state: RoofState) => RoofState;
type JsonImportRequest = { floorId: string; jobId: string; previousRunId: string | null };

function planeState(plane: RoofPlane) {
  if (!plane.definition_id) return "Needs material";
  if (plane.surface_class === "sloping_planar" && plane.pitch_degrees == null) return "Needs pitch";
  return plane.status === "confirmed" ? "Ready" : "Needs review";
}

function safeUserError(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback;
  const message = reason.message.trim();
  if (!message || /https?:|roboflow|api[_-]?key|client error|server error|traceback|exception/i.test(message)) return fallback;
  return message;
}

export function RoofWorkspace({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [sidePanel, setSidePanel] = useState<SidePanel>("roof");
  const [saving, setSaving] = useState(false);
  const [queuedChanges, setQueuedChanges] = useState(0);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState<string | null>(null);
  const [analysisRequest, setAnalysisRequest] = useState<{ floorId: string; previousRunId: string | null } | null>(null);
  const [jsonImportRequest, setJsonImportRequest] = useState<JsonImportRequest | null>(null);
  const [completedJsonJobId, setCompletedJsonJobId] = useState<string | null>(null);
  const [jsonImportFeedback, setJsonImportFeedback] = useState<{ status: "idle" | "failed"; message: string | null }>({ status: "idle", message: null });
  const [analysisQuality, setAnalysisQuality] = useState<RoofAnalysisQuality>("medium");
  const [downloadingCrop, setDownloadingCrop] = useState(false);
  const qualityInitialized = useRef(false);
  const [componentType, setComponentType] = useState("eaves_gutter");
  const [componentBasis, setComponentBasis] = useState<"area" | "length" | "number">("length");

  const roofQueryKey = ["roofs", projectId, floorId] as const;
  const query = useQuery({ queryKey: roofQueryKey, queryFn: () => getRoofState(projectId, null, floorId), staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, placeholderData: (previous) => previous, refetchInterval: (result) => result.state.data?.active_jobs.length ? 2000 : false });
  const state = query.data;
  const selectedFloorId = floorId || state?.selected_floor_id || null;
  const selectedLevelId = state?.selected_level_id || null;
  const selectedRoofJob = state?.active_jobs.find((job) => job.task_type === "roofs.detect" && (!job.floor_id || job.floor_id === selectedFloorId));
  const calculationJob = state?.active_jobs.find((job) => job.task_type === "roofs.recalculate" && (!job.floor_id || job.floor_id === selectedFloorId));
  const roofResultsPending = Boolean(selectedRoofJob);
  const automaticResultsPending = Boolean(selectedRoofJob && selectedRoofJob.id !== jsonImportRequest?.jobId);
  const quantitiesUpdating = Boolean(calculationJob);
  const visiblePlanes = automaticResultsPending ? [] : state?.planes || [];
  const visibleEdges = automaticResultsPending ? [] : state?.edges || [];
  const visibleOpenings = automaticResultsPending ? [] : state?.openings || [];
  const visibleComponents = automaticResultsPending ? [] : state?.components || [];
  const visibleArea = visiblePlanes.reduce((sum, plane) => sum + Number(plane.net_area_m2 || plane.true_area_m2 || 0), 0);
  const selectedPlane = visiblePlanes.find((item) => item.id === selectedPlaneId) || null;
  const selectedEdge = visibleEdges.find((item) => item.id === selectedEdgeId) || null;
  const latestDetectionRun = state?.detection_runs.find((run) => run.host_floor_id === selectedFloorId);
  const latestManualRun = state?.detection_runs.find((run) => run.host_floor_id === selectedFloorId && run.analysis_method === "manual_json");
  const importedRun = jsonImportRequest?.floorId === selectedFloorId && latestManualRun?.id !== jsonImportRequest.previousRunId ? latestManualRun : null;
  const activeImportJob = jsonImportRequest ? state?.active_jobs.find((job) => job.id === jsonImportRequest.jobId) : null;
  const jsonImportStatus: "idle" | "queued" | "processing" | "failed" = jsonImportRequest
    ? importedRun?.status === "failed" ? "failed" : importedRun?.status === "running" || activeImportJob?.status === "running" ? "processing" : "queued"
    : jsonImportFeedback.status;
  const detectionError = analysisRequest?.floorId === selectedFloorId
    && latestDetectionRun?.id !== analysisRequest.previousRunId
    && latestDetectionRun?.status === "failed"
    ? latestDetectionRun.user_message || "Automatic roof detection is currently unavailable. Review the drawing or add the roof manually."
    : null;
  useEffect(() => {
    if (!state?.available_floors.length) return;
    if (!state.available_floors.some((item) => item.id === floorId)) {
      setFloorId(state.selected_floor_id || state.available_floors[state.available_floors.length - 1].id);
    }
  }, [floorId, state?.available_floors, state?.selected_floor_id]);
  useEffect(() => { setSelectedPlaneId(null); setSelectedEdgeId(null); setDrawMode(null); setDraftPoints([]); setAnalysisRequest(null); setJsonImportRequest(null); setJsonImportFeedback({ status: "idle", message: null }); setError(null); }, [floorId]);
  useEffect(() => {
    if (!qualityInitialized.current && state?.analysis.default_quality) {
      setAnalysisQuality(state.analysis.default_quality);
      qualityInitialized.current = true;
    }
  }, [state?.analysis.default_quality]);
  useEffect(() => {
    if (!jsonImportRequest || !importedRun || !["completed", "failed"].includes(importedRun.status)) return;
    if (importedRun.status === "completed") {
      setCompletedJsonJobId(jsonImportRequest.jobId);
      setJsonImportFeedback({ status: "idle", message: "Roof JSON applied successfully." });
    } else {
      setJsonImportFeedback({
        status: "failed",
        message: importedRun.user_message || "The roof JSON could not be applied. Check its format and crop dimensions.",
      });
    }
    setJsonImportRequest(null);
    invalidate();
  }, [importedRun?.id, importedRun?.status, jsonImportRequest?.jobId]);

  const roofUrl = useAssetUrl(state?.drawing?.roof_drawing_url);
  // Roof geometry is always stored in the exact roof-crop coordinate space.
  // Keep that crop as the base image so an architectural crop cannot shift it.
  const imageUrl = roofUrl;
  const hasRoofCrop = Boolean(state?.drawing?.roof_drawing_url);
  function invalidate() {
    void client.invalidateQueries({ queryKey: ["roofs", projectId], refetchType: "active" });
    for (const key of [["review", projectId], ["boq", projectId], ["workflow", projectId, "summary"]]) {
      void client.invalidateQueries({ queryKey: key, refetchType: "none" });
    }
  }
  async function act(action: () => Promise<unknown>, message = "The roof change could not be saved.", optimistic?: OptimisticRoofUpdate) {
    setSaving(true); setError(null);
    const previous = client.getQueryData<RoofState>(roofQueryKey);
    if (previous && optimistic) {
      void client.cancelQueries({ queryKey: roofQueryKey });
      client.setQueryData<RoofState>(roofQueryKey, optimistic(previous));
    }
    try { await action(); invalidate(); return true; }
    catch (reason) {
      if (previous && optimistic) client.setQueryData(roofQueryKey, previous);
      setError(safeUserError(reason, message)); return false;
    } finally { setSaving(false); }
  }
  function queueOptimisticMutation(action: () => Promise<unknown>, message: string, optimistic: OptimisticRoofUpdate) {
    setError(null);
    const queryKey = roofQueryKey;
    const current = client.getQueryData<RoofState>(queryKey);
    if (current) {
      void client.cancelQueries({ queryKey });
      client.setQueryData<RoofState>(queryKey, optimistic(current));
    }
    setQueuedChanges((count) => count + 1);
    let queued: Promise<void>;
    queued = mutationQueue.current
      .catch(() => undefined)
      .then(async () => { await action(); })
      .catch((reason) => { setError(safeUserError(reason, message)); })
      .finally(() => {
        setQueuedChanges((count) => Math.max(0, count - 1));
        if (mutationQueue.current === queued) invalidate();
      });
    mutationQueue.current = queued;
  }
  async function analyzeSelectedFloor() {
    if (!selectedFloorId) return;
    setAnalysisRequest({ floorId: selectedFloorId, previousRunId: latestDetectionRun?.id || null });
    const started = await act(
      () => analyzeRoofs(projectId, selectedFloorId, true, analysisQuality),
      "Automatic roof detection could not start. Please try again.",
    );
    if (!started) setAnalysisRequest(null);
  }
  async function downloadSelectedCrop() {
    if (!selectedFloorId || downloadingCrop) return;
    setDownloadingCrop(true);
    setError(null);
    try {
      await downloadRoofCrop(projectId, selectedFloorId);
    } catch (reason) {
      setError(safeUserError(reason, "The original roof crop could not be downloaded. Please try again."));
    } finally {
      setDownloadingCrop(false);
    }
  }
  async function applyImportedJson(result: Record<string, unknown>) {
    if (!selectedFloorId) return null;
    setSaving(true);
    setError(null);
    setCompletedJsonJobId(null);
    setJsonImportFeedback({ status: "idle", message: null });
    try {
      const response = await importRoofJson(projectId, selectedFloorId, result, analysisQuality);
      if (response.job.status === "completed") {
        setCompletedJsonJobId(response.job.id);
        setJsonImportFeedback({ status: "idle", message: "This roof JSON was already applied." });
      } else {
        setJsonImportRequest({ floorId: selectedFloorId, jobId: response.job.id, previousRunId: latestManualRun?.id || null });
      }
      invalidate();
      return response.job.id;
    } catch (reason) {
      setJsonImportFeedback({ status: "failed", message: safeUserError(reason, "The roof JSON could not be submitted. Check its format and try again.") });
      return null;
    } finally {
      setSaving(false);
    }
  }
  function choosePlane(id: string) { setSelectedPlaneId(id); setSelectedEdgeId(null); setSidePanel("roof"); }
  function begin(mode: Exclude<DrawMode, null>) { if (!selectedLevelId) { setError("Analyze this floor or add a roof level before drawing roof items."); return; } if ((mode === "split" || mode === "opening") && !selectedPlane) { setError("Select one roof area first."); return; } setDrawMode(mode); setDraftPoints([]); setError(null); }

  async function finishDrawing() {
    if (!selectedLevelId || !drawMode) return;
    const required = drawMode === "plane" || drawMode === "opening" || (drawMode === "component" && componentBasis === "area") ? 3 : drawMode === "component" && componentBasis === "number" ? 1 : 2;
    if (draftPoints.length < required) { setError(`Add at least ${required} point${required === 1 ? "" : "s"}.`); return; }
    await act(async () => {
      if (drawMode === "plane") await createRoofPlane(projectId, selectedLevelId, { points: draftPoints, surface_class: "sloping_planar", shape_group: "unknown", include_in_boq: true, boq_owner: "roofs" });
      if (drawMode === "split" && selectedPlane) await splitRoofPlane(projectId, selectedLevelId, selectedPlane.id, draftPoints.slice(0, 2));
      if (drawMode === "edge") await createRoofEdge(projectId, selectedLevelId, { plane_id: selectedPlane?.id || null, edge_type: "unknown", points: draftPoints.slice(0, 2), include_in_boq: true, boq_owner: "roofs" });
      if (drawMode === "opening" && selectedPlane) await createRoofOpening(projectId, selectedLevelId, { plane_id: selectedPlane.id, opening_type: "rooflight", name: "Rooflight", geometry: { points: draftPoints }, quantity: 1, deduct_from_area: true, include_in_boq: true, boq_owner: "roofs" });
      if (drawMode === "component") { const geometry = componentBasis === "number" ? { point: draftPoints[0], quantity: 1 } : { points: draftPoints }; await createRoofComponent(projectId, selectedLevelId, { plane_id: selectedPlane?.id || null, component_type: componentType, category: componentType.includes("gutter") || ["outlet","downpipe","channel"].includes(componentType) ? "drainage" : ["rafter","purlin","truss","roof_joist","wall_plate"].includes(componentType) ? "structure" : "feature", geometry, measurement_basis: componentBasis, include_in_boq: true, boq_owner: "roofs" }); }
      setDrawMode(null); setDraftPoints([]);
    });
  }

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Source drawing</p><p className="mt-1 text-sm font-semibold text-slate-800">{state?.drawing?.roof_drawing?.name || "No roof drawing added"}</p>{state?.drawing?.scale_source === "required" ? <p className="mt-1 text-xs font-medium text-amber-700">This separate drawing needs its own scale before quantities are ready.</p> : state?.drawing?.scale_source === "inherited" ? <p className="mt-1 text-xs text-slate-500">Scale inherited from its source drawing.</p> : null}</div>
      <RoofAnalysisControls
        floorId={selectedFloorId}
        quality={analysisQuality}
        onQuality={setAnalysisQuality}
        onDownload={() => void downloadSelectedCrop()}
        onAnalyze={() => void analyzeSelectedFloor()}
        downloading={downloadingCrop}
        busy={saving || roofResultsPending}
        enabled={Boolean(state?.analysis.enabled)}
        hasRoofCrop={hasRoofCrop}
        progress={latestDetectionRun?.progress || selectedRoofJob?.progress || 0}
        hasResults={Boolean(selectedLevelId)}
      />
    </div>
    <RoofJsonImportPanel visible={Boolean(state?.analysis.json_import_enabled && hasRoofCrop)} busy={saving || roofResultsPending} onApply={applyImportedJson} status={jsonImportStatus} message={jsonImportFeedback.message} completedJobId={completedJsonJobId} />
    {error || detectionError ? <div className="p-4 pb-0"><ErrorMessage message={error || detectionError || "Roof analysis failed."} /></div> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setDrawMode(null); setDraftPoints([]); }}>Select</Button><Button variant="secondary" disabled={roofResultsPending || !selectedLevelId} onClick={() => begin("plane")}>Draw</Button><Button variant="secondary" disabled={roofResultsPending || !selectedLevelId || !selectedPlane} onClick={() => begin("split")}>Split</Button><Button variant="secondary" disabled={roofResultsPending || !selectedLevelId || !selectedPlane} onClick={() => { if (selectedLevelId && selectedPlane) { const id = selectedPlane.id; setSelectedPlaneId(null); queueOptimisticMutation(() => deleteRoofPlane(projectId, selectedLevelId, id), "The roof area could not be deleted.", removePlane(id)); } }}>Delete</Button><Button variant="secondary" disabled={!draftPoints.length} onClick={() => setDraftPoints((items) => items.slice(0, -1))}>Undo</Button><details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">More details</summary><div className="absolute left-0 z-30 mt-2 w-48 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><MenuButton label="Roof build-ups" onClick={() => setSidePanel("build-ups")} /><MenuButton label="Components" onClick={() => setSidePanel("components")} /><MenuButton label="Add roof line" onClick={() => begin("edge")} /><MenuButton label="Add opening" onClick={() => begin("opening")} /><MenuButton label="Add roof level" onClick={() => void act(() => createRoofLevel(projectId, { name: `Roof candidates — ${state?.drawing?.host_floor_name || "Floor"}`, host_floor_id: selectedFloorId, role: "independent_roof", roof_type: "unknown", include_in_boq: true }))} /></div></details></div>
      <div className="flex items-center gap-3"><p className="text-xs text-slate-500">{roofResultsPending ? "Preparing roof results in the background" : <><strong>{visiblePlanes.length}</strong> roof areas identified · <strong>{visibleArea.toFixed(2)}</strong> m²{queuedChanges ? ` · Saving ${queuedChanges} change${queuedChanges === 1 ? "" : "s"}…` : quantitiesUpdating ? " · Updating quantities…" : ""}</>}</p></div>
    </div>
    <div className="grid min-h-[680px] grid-cols-1 overflow-hidden xl:grid-cols-[270px_minmax(0,1fr)_350px]">
      <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
        <label className="block"><span className="text-xs font-semibold uppercase text-slate-500">Floor / roof level</span><select className="input mt-2 w-full" value={selectedFloorId || ""} disabled={!state?.available_floors.length} onChange={(event) => setFloorId(event.target.value)}>{state?.available_floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
        <div className="mt-5 flex items-center justify-between"><h3 className="font-semibold text-slate-950">Detected roof areas</h3><span className="text-xs text-slate-500">{visiblePlanes.length}</span></div>
        <div className="mt-3 space-y-2">{visiblePlanes.map((plane) => <button key={plane.id} type="button" onClick={() => choosePlane(plane.id)} className={`lazy-list-item w-full rounded-xl border p-3 text-left ${selectedPlaneId === plane.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}><p className="truncate text-sm font-semibold text-slate-900">{plane.name || "Roof area"}</p><p className="mt-1 text-xs text-slate-500">{Number(plane.net_area_m2 || plane.true_area_m2 || 0).toFixed(2)} m² · {plane.covering_material || "Material not found"}</p><p className={`mt-1 text-[11px] font-semibold ${planeState(plane) === "Ready" ? "text-emerald-700" : "text-amber-700"}`}>{planeState(plane)}</p></button>)}{roofResultsPending ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">Roof results are being prepared in the background. Completed areas will appear automatically.</p> : state && !visiblePlanes.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">Roof drawing ready for review. Roof areas will appear here after background processing.</p> : null}</div>
        <details className="mt-5 border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">History ({state?.history.length || 0})</summary><div className="mt-2 space-y-2">{state?.history.slice(0, 20).map((item) => <div key={item.id} className="rounded-lg border bg-white p-2 text-xs"><p className="font-semibold capitalize">{item.action} {item.entity_type}</p><button className="mt-1 font-semibold text-blue-700" type="button" disabled={saving || !["plane","level"].includes(item.entity_type)} onClick={() => void act(() => restoreRoofHistory(projectId, item.id))}>Restore</button></div>)}</div></details>
      </aside>
      <div className="relative flex min-w-0 flex-col bg-slate-100">{hasRoofCrop ? <RoofPlanCanvas drawing={state?.drawing || null} imageUrl={imageUrl} overlayImageUrl={null} overlayOpacity={0} planes={visiblePlanes} edges={visibleEdges} openings={visibleOpenings} components={visibleComponents} selectedPlaneIds={new Set(selectedPlaneId ? [selectedPlaneId] : [])} selectedEdgeId={selectedEdgeId} drawingMode={Boolean(drawMode)} draftPoints={draftPoints} onPoint={(point) => { if (drawMode) setDraftPoints((items) => ["split","edge"].includes(drawMode) && items.length >= 2 ? items : [...items, point]); }} onPlane={(id) => choosePlane(id)} onEdge={(id) => { setSelectedEdgeId(id); setSelectedPlaneId(null); setSidePanel("roof"); }} onVertices={(id, points) => { if (selectedLevelId) void act(() => updateRoofPlane(projectId, selectedLevelId, id, { points }), "The roof shape could not be saved.", updatePlane(id, { points })); }} /> : <div className="flex min-h-[590px] flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">Add a Roof drawing in Plans to begin.</div>}{drawMode ? <DrawingActions mode={drawMode} points={draftPoints.length} saving={saving} onCancel={() => { setDrawMode(null); setDraftPoints([]); }} onFinish={() => void finishDrawing()} /> : null}</div>
      {sidePanel === "build-ups" ? <RoofBuildUpsPanel definitions={state?.definitions || []} saving={saving} onCreate={async (payload) => { await act(() => createRoofDefinition(projectId, payload)); }} onLayer={async (id, payload) => { await act(() => addRoofLayer(projectId, id, payload)); }} /> : sidePanel === "components" ? <ComponentPanel openings={visibleOpenings} components={visibleComponents} saving={saving} type={componentType} basis={componentBasis} onType={setComponentType} onBasis={setComponentBasis} onDraw={() => begin("component")} onDelete={async (id) => { if (selectedLevelId) queueOptimisticMutation(() => deleteRoofComponent(projectId, selectedLevelId, id), "The roof component could not be deleted.", (current) => ({ ...current, components: current.components.filter((item) => item.id !== id) })); }} onDeleteOpening={async (id) => { if (selectedLevelId) queueOptimisticMutation(() => deleteRoofOpening(projectId, selectedLevelId, id), "The roof opening could not be deleted.", (current) => ({ ...current, openings: current.openings.filter((item) => item.id !== id) })); }} /> : <RoofPlaneInspector planes={selectedPlane ? [selectedPlane] : []} edge={selectedEdge} definitions={state?.definitions || []} evidence={roofResultsPending ? [] : state?.evidence || []} saving={saving} onSave={async (id, payload) => { if (selectedLevelId) await act(() => updateRoofPlane(projectId, selectedLevelId, id, payload), "The roof details could not be saved.", updatePlane(id, payload)); }} onAssign={async (definitionId) => { if (selectedLevelId && selectedPlane) await act(() => updateRoofPlane(projectId, selectedLevelId, selectedPlane.id, { definition_id: definitionId }), "The roof material could not be saved.", updatePlane(selectedPlane.id, { definition_id: definitionId })); }} onConfirm={async () => { if (selectedPlane) await act(() => confirmRoofEntities(projectId, "plane", [selectedPlane.id]), "The roof area could not be confirmed.", updatePlane(selectedPlane.id, { status: "confirmed", user_confirmed: true } as Partial<RoofPlane>)); }} onDelete={async (plane) => { if (selectedLevelId) { setSelectedPlaneId(null); queueOptimisticMutation(() => deleteRoofPlane(projectId, selectedLevelId, plane.id), "The roof area could not be deleted.", removePlane(plane.id)); } }} onMerge={async () => undefined} onEdgeSave={async (id, edgeType) => { if (selectedLevelId) await act(() => updateRoofEdge(projectId, selectedLevelId, id, { edge_type: edgeType }), "The roof line could not be saved.", (current) => ({ ...current, edges: current.edges.map((item) => item.id === id ? { ...item, edge_type: edgeType as typeof item.edge_type, status: "confirmed", user_confirmed: true } : item) })); }} onEdgeDelete={async (id) => { if (selectedLevelId) { setSelectedEdgeId(null); queueOptimisticMutation(() => deleteRoofEdge(projectId, selectedLevelId, id), "The roof line could not be deleted.", (current) => ({ ...current, edges: current.edges.filter((item) => item.id !== id) })); } }} />}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4"><p className="text-sm text-slate-500">{roofResultsPending ? "Roof results are being prepared in the background." : quantitiesUpdating ? "Change saved. Quantities and BOQ are updating in the background." : state?.can_continue ? "Roof geometry, pitch and materials are ready." : "Review warnings before continuing."}</p><Link href={appRoutes.workflowStep(projectId, "ceilings")} className={`rounded-xl px-4 py-2 text-sm font-semibold ${!roofResultsPending && state?.can_continue ? "bg-blue-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-500"}`}>Continue to Ceilings</Link></div>
  </div>;
}

function updatePlane(id: string, patch: RoofPlanePayload | Partial<RoofPlane>): OptimisticRoofUpdate {
  return (state) => ({
    ...state,
    planes: state.planes.map((plane) => {
      if (plane.id !== id) return plane;
      const definition = patch.definition_id ? state.definitions.find((item) => item.id === patch.definition_id) : null;
      const geometry = "points" in patch && patch.points ? { points: patch.points } : plane.geometry;
      let pitch = "pitch_degrees" in patch ? patch.pitch_degrees : plane.pitch_degrees;
      if ("rise" in patch && "run" in patch && Number(patch.run) > 0) pitch = Math.atan(Number(patch.rise) / Number(patch.run)) * 180 / Math.PI;
      const projected = Number(plane.projected_area_m2 || 0);
      const trueArea = pitch == null || !projected ? plane.true_area_m2 : projected / Math.cos(Number(pitch) * Math.PI / 180);
      return {
        ...plane, ...patch, geometry, pitch_degrees: pitch, true_area_m2: trueArea,
        gross_area_m2: trueArea, net_area_m2: trueArea == null ? plane.net_area_m2 : Math.max(0, Number(trueArea) - Number(plane.deduction_area_m2 || 0)),
        definition_name: definition?.name ?? plane.definition_name,
        system_type: definition?.system_type ?? plane.system_type,
        covering_material: definition?.covering_material ?? plane.covering_material,
        display_colour: definition?.display_colour ?? plane.display_colour,
        status: "status" in patch ? String(patch.status) : "confirmed",
        user_confirmed: "user_confirmed" in patch ? Boolean(patch.user_confirmed) : true,
      };
    }),
  });
}

function removePlane(id: string): OptimisticRoofUpdate {
  return (state) => ({
    ...state,
    planes: state.planes.filter((item) => item.id !== id),
    edges: state.edges.filter((item) => item.plane_id !== id && item.adjacent_plane_id !== id),
    openings: state.openings.filter((item) => item.plane_id !== id),
    components: state.components.filter((item) => item.plane_id !== id),
    quantities: state.quantities.filter((item) => item.plane_id !== id),
  });
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) { return <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={onClick}>{label}</button>; }
function DrawingActions({ mode, points, saving, onCancel, onFinish }: { mode: Exclude<DrawMode, null>; points: number; saving: boolean; onCancel: () => void; onFinish: () => void }) { return <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-white p-2 shadow-lg"><span className="px-2 text-xs">Drawing {mode} · {points} point(s)</span><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving} onClick={onFinish}>Finish</Button></div>; }
function ComponentPanel({ openings, components, saving, type, basis, onType, onBasis, onDraw, onDelete, onDeleteOpening }: { openings: RoofOpening[]; components: RoofComponent[]; saving: boolean; type: string; basis: "area" | "length" | "number"; onType: (value: string) => void; onBasis: (value: "area" | "length" | "number") => void; onDraw: () => void; onDelete: (id: string) => Promise<void>; onDeleteOpening: (id: string) => Promise<void> }) {
  const types = ["eaves_gutter","box_gutter","outlet","downpipe","flashing","capping","walkway","vent","fall_arrest","rafter","purlin","truss","roof_joist","wall_plate","fascia","bargeboard","soffit"];
  return <aside className="overflow-y-auto border-l border-slate-200 bg-white p-5"><button type="button" className="text-xs font-semibold text-blue-700" onClick={() => undefined}>More details</button><h3 className="mt-2 font-semibold">Roof components</h3><label className="mt-4 block"><span className="text-xs font-semibold uppercase text-slate-500">Component</span><select className="input mt-2 w-full" value={type} onChange={(event) => onType(event.target.value)}>{types.map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label className="mt-3 block"><span className="text-xs font-semibold uppercase text-slate-500">Measure as</span><select className="input mt-2 w-full" value={basis} onChange={(event) => onBasis(event.target.value as typeof basis)}><option value="length">Length</option><option value="area">Area</option><option value="number">Number</option></select></label><Button className="mt-3 w-full" disabled={saving} onClick={onDraw}>Draw component</Button><div className="mt-5 space-y-2 border-t pt-4">{openings.map((item) => <Item key={item.id} name={item.name || item.opening_type} value={`${Number(item.area_m2 || 0).toFixed(2)} m²`} onDelete={() => onDeleteOpening(item.id)} />)}{components.map((item) => <Item key={item.id} name={item.name || item.component_type} value={`${Number(item.net_quantity || 0).toFixed(2)} ${item.measurement_unit}`} onDelete={() => onDelete(item.id)} />)}</div></aside>;
}
function Item({ name, value, onDelete }: { name: string; value: string; onDelete: () => Promise<void> }) { return <div className="rounded-xl border p-3"><p className="text-sm font-semibold capitalize">{name.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{value}</p><button type="button" className="mt-2 text-xs font-semibold text-red-600" onClick={() => void onDelete()}>Delete</button></div>; }
