"use client";

import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import { apiUrl } from "@/shared/services/apiClient";
import { assignFinishToRooms, confirmFinishAssignments, getFloorFinishState, updateFloorRoomBoundary } from "@/features/floor-finishes/api";
import type { FinishAssignment, FinishDefinition, FinishRoom } from "@/features/floor-finishes/types";
import type { Point } from "@/features/drawing/types";
import { assignFloorWork, confirmFloorWorks, getFloorWorkState, updateSkirtingEdge } from "@/features/floor-works/api";
import type { FloorWorkAssignment, FloorWorkDefinition, FloorWorkRoom, FloorWorkType, SkirtingEdge } from "@/features/floor-works/types";
import type { FloorPart } from "./FloorSubelementWorkspace";
import { compactRoomLabel, friendlyRoomLabel } from "../friendlyLabels";

type Props = { projectId: string; part: Exclude<FloorPart, "areas"> };
type Filter = "all" | "review" | "confirmed";

const labels: Record<Exclude<FloorPart, "areas">, string> = {
  finishes: "Floor finish",
  screed: "Screed / floor bed",
  waterproofing: "Waterproofing",
  underlay: "Underlay",
  board_insulation: "Board insulation",
  quilt_insulation: "Quilt insulation",
  isolation_membrane: "Isolation membrane",
  sealer: "Sealer / coating",
  skirting: "Skirting",
};

function statusText(status?: string) {
  if (!status || status === "unassigned") return "Not assigned";
  if (status === "auto_confirmed") return "Automatically assigned";
  if (status === "needs_review" || status === "suggested") return "Needs review";
  if (status === "not_required") return "Not required";
  return status.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function statusColour(status?: string) {
  if (status === "confirmed" || status === "auto_confirmed") return "#059669";
  if (status === "conflict") return "#dc2626";
  if (status === "not_required") return "#94a3b8";
  return "#d97706";
}

function Status({ value }: { value?: string }) {
  const ready = value === "confirmed" || value === "auto_confirmed";
  return <span className={ready ? "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700" : value === "not_required" ? "rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600" : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700"}>{statusText(value)}</span>;
}

function finishAssignment(room: FinishRoom): FinishAssignment | undefined {
  return room.assignments.find((item) => !item.zone_id) || room.assignments[0];
}

function workAssignment(room: FloorWorkRoom, type: FloorWorkType): FloorWorkAssignment | undefined {
  return room.assignments.find((item) => item.work_type === type && !item.zone_id) || room.assignments.find((item) => item.work_type === type);
}

function definitionLabel(item: FinishDefinition | FloorWorkDefinition) {
  const code = "original_tag" in item ? item.original_tag : item.code;
  return code ? `${code} · ${item.name}` : item.name;
}

function boundaryVerified(room: FinishRoom | FloorWorkRoom | null) {
  return Boolean(room && ["wall_verified", "user_verified"].includes(room.geometry_status));
}

function boundaryEvidence(room: FinishRoom | FloorWorkRoom | null) {
  return room?.source_evidence?.find((item) => item.kind === "pdf_wall_vectors");
}

export function FloorLayerDrawingWorkspace({ projectId, part }: Props) {
  const client = useQueryClient();
  const isFinish = part === "finishes";
  const workType = isFinish ? null : part as FloorWorkType;
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [systemId, setSystemId] = useState("");
  const [waste, setWaste] = useState("0");
  const [thickness, setThickness] = useState("");
  const [layers, setLayers] = useState("1");
  const [upturn, setUpturn] = useState(false);
  const [upturnHeight, setUpturnHeight] = useState("150");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBoundary, setEditingBoundary] = useState(false);
  const [editPoints, setEditPoints] = useState<Point[]>([]);
  const [draggingVertex, setDraggingVertex] = useState<number | null>(null);

  const finishQuery = useQuery({ queryKey: ["floor-finishes", projectId, floorId, "takeoff-native"], queryFn: () => getFloorFinishState(projectId, floorId), enabled: isFinish, refetchOnWindowFocus: false });
  const workQuery = useQuery({ queryKey: ["floor-works", projectId, floorId, "takeoff-native"], queryFn: () => getFloorWorkState(projectId, floorId), enabled: !isFinish, refetchOnWindowFocus: false });
  const state = isFinish ? finishQuery.data : workQuery.data;
  const loading = isFinish ? finishQuery.isLoading : workQuery.isLoading;
  const queryError = isFinish ? finishQuery.error : workQuery.error;

  useEffect(() => {
    if (!state?.floors.length) return;
    const next = state.floors.find((floor) => floor.id === floorId) || state.floors[0];
    if (next.id !== floorId) setFloorId(next.id);
  }, [floorId, state?.floors]);
  useEffect(() => { setSelectedRoomId(null); setEditingBoundary(false); setEditPoints([]); }, [floorId, part]);

  const floor = state?.floors.find((item) => item.id === floorId) || null;
  const imageUrl = floor?.drawing_url ? apiUrl(floor.drawing_url) : null;
  const finishRooms = isFinish ? finishQuery.data?.rooms || [] : [];
  const workRooms = !isFinish ? workQuery.data?.rooms || [] : [];
  const rooms = (isFinish ? finishRooms : workRooms) as Array<FinishRoom | FloorWorkRoom>;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;
  const selectedFinishAssignment = isFinish && selectedRoom ? finishAssignment(selectedRoom as FinishRoom) : undefined;
  const selectedWorkAssignment = !isFinish && selectedRoom && workType ? workAssignment(selectedRoom as FloorWorkRoom, workType) : undefined;
  const selectedAssignment = selectedFinishAssignment || selectedWorkAssignment;
  const selectedBoundaryVerified = boundaryVerified(selectedRoom);
  const selectedBoundaryEvidence = boundaryEvidence(selectedRoom);

  function beginBoundaryEdit() {
    if (!selectedRoom) return;
    setEditPoints((selectedRoom.geometry?.points || []).map((point) => ({ ...point })));
    setEditingBoundary(true);
    setError(null);
  }

  function moveVertex(event: ReactPointerEvent<SVGCircleElement>, index: number) {
    if (draggingVertex !== index) return;
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const drawingPoint = point.matrixTransform(matrix.inverse());
    setEditPoints((current) => current.map((value, pointIndex) => pointIndex === index ? { x: Math.round(drawingPoint.x), y: Math.round(drawingPoint.y) } : value));
  }

  async function saveBoundary() {
    if (!selectedRoom || !floorId || editPoints.length < 3) return;
    await run(async () => {
      await updateFloorRoomBoundary(projectId, floorId, selectedRoom.id, editPoints);
      setEditingBoundary(false);
      setDraggingVertex(null);
    });
  }

  useEffect(() => {
    if (isFinish) {
      setSystemId(selectedFinishAssignment?.finish_id || "");
      setWaste(String(selectedFinishAssignment?.waste_percent || 0));
    } else {
      setSystemId(selectedWorkAssignment?.definition_id || "");
      setWaste(String(selectedWorkAssignment?.waste_percent || 0));
      setThickness(selectedWorkAssignment?.thickness_mm == null ? "" : String(selectedWorkAssignment.thickness_mm));
      setLayers(String(selectedWorkAssignment?.layer_count || 1));
      setUpturn(Boolean(selectedWorkAssignment?.upturn_required));
      setUpturnHeight(String(selectedWorkAssignment?.upturn_height_mm || 150));
    }
  }, [isFinish, selectedFinishAssignment?.id, selectedWorkAssignment?.id]);

  const roomStatus = (room: FinishRoom | FloorWorkRoom) => isFinish ? finishAssignment(room as FinishRoom)?.status || "unassigned" : workAssignment(room as FloorWorkRoom, workType!)?.status || "unassigned";
  const filteredRooms = useMemo(() => rooms.filter((room) => {
    const status = roomStatus(room);
    if (filter === "confirmed") return status === "confirmed" || status === "auto_confirmed";
    if (filter === "review") return !boundaryVerified(room) || !["confirmed", "auto_confirmed", "not_required"].includes(status);
    return true;
  }), [filter, isFinish, rooms, workType]);

  async function run(action: () => Promise<unknown>) {
    setSaving(true); setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: [isFinish ? "floor-finishes" : "floor-works", projectId] });
      await client.invalidateQueries({ queryKey: ["boq", projectId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The floor-layer assignment could not be saved.");
    } finally { setSaving(false); }
  }

  async function saveAssignment() {
    if (!selectedRoom || !systemId) { setError("Select a room and a system first."); return; }
    if (isFinish) {
      await run(() => assignFinishToRooms(projectId, [selectedRoom.id], systemId, Number(waste || 0), "Confirmed from Floor drawing", "area"));
    } else {
      await run(() => assignFloorWork(projectId, { room_ids: [selectedRoom.id], work_type: workType!, definition_id: systemId, required: true, coverage_type: "whole_room", thickness_mm: thickness ? Number(thickness) : null, layer_count: layers ? Number(layers) : null, waste_percent: Number(waste || 0), upturn_required: workType === "waterproofing" && upturn, upturn_height_mm: workType === "waterproofing" && upturn ? Number(upturnHeight || 0) : null, reason: "Confirmed from Floor drawing" }));
    }
  }

  async function confirmCurrent() {
    if (!selectedAssignment) return;
    await run(() => isFinish ? confirmFinishAssignments(projectId, [selectedAssignment.id], "selected", floorId) : confirmFloorWorks(projectId, [selectedAssignment.id], "selected", floorId));
  }

  async function markNotRequired() {
    if (!selectedRoom || isFinish || !workType) return;
    await run(() => assignFloorWork(projectId, { room_ids: [selectedRoom.id], work_type: workType, definition_id: selectedWorkAssignment?.definition_id || null, required: false, coverage_type: "whole_room", reason: "Marked not required from Floor drawing" }));
  }

  const definitions = isFinish ? finishQuery.data?.definitions || [] : (workQuery.data?.definitions || []).filter((item) => item.work_type === workType);
  const partAssignments = isFinish ? finishQuery.data?.assignments || [] : (workQuery.data?.assignments || []).filter((item) => item.work_type === workType);
  const boundaryReviewCount = rooms.filter((room) => !boundaryVerified(room)).length;
  const selectedDefinition = definitions.find((item) => item.id === systemId);
  const quantity = isFinish ? selectedFinishAssignment?.nrm_quantity ?? (selectedRoom as FinishRoom | null)?.area_m2 : workType === "skirting" ? (selectedRoom as FloorWorkRoom | null)?.measurement?.net_skirting_length_m : selectedWorkAssignment?.nrm_quantity ?? (selectedRoom as FloorWorkRoom | null)?.measurement?.area_m2;
  const unit = workType === "skirting" ? "m" : "m²";

  if (loading) return <div className="flex min-h-[520px] items-center justify-center bg-white text-sm text-slate-500">Loading automatically detected {labels[part].toLowerCase()} data…</div>;
  if (queryError) return <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The floor-layer data could not be loaded. Refresh the page after confirming that the backend is running.</div>;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
        <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Storey</label>
        <select className="input mt-2 w-full text-sm" value={floorId || ""} onChange={(event) => setFloorId(event.target.value)}>{(state?.floors || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <div className="mt-3 grid grid-cols-3 gap-1">{([['all','All'],['review','Review'],['confirmed','Ready']] as Array<[Filter,string]>).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={filter === value ? "rounded-md bg-slate-900 px-2 py-2 text-[10px] font-semibold text-white" : "rounded-md border border-slate-200 px-2 py-2 text-[10px] font-semibold text-slate-600"}>{label}</button>)}</div>
        <div className="mt-4 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Rooms and areas</span><span className="text-[10px] text-slate-400">{filteredRooms.length}</span></div>
        <div className="mt-2 space-y-1.5">{filteredRooms.map((room) => { const assignment = isFinish ? finishAssignment(room as FinishRoom) : workAssignment(room as FloorWorkRoom, workType!); const invalidBoundary = !boundaryVerified(room); return <button key={room.id} type="button" onClick={() => setSelectedRoomId(room.id)} className={room.id === selectedRoomId ? invalidBoundary ? "w-full rounded-lg border-2 border-red-500 bg-red-50 p-2.5 text-left" : "w-full rounded-lg border-2 border-blue-500 bg-blue-50 p-2.5 text-left" : invalidBoundary ? "w-full rounded-lg border border-red-300 bg-red-50/50 p-2.5 text-left hover:border-red-500" : "w-full rounded-lg border border-slate-200 p-2.5 text-left hover:border-blue-200"}><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-xs font-semibold text-slate-900">{friendlyRoomLabel(room.name)}</p>{invalidBoundary ? <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-700">Boundary</span> : <Status value={assignment?.status} />}</div><p className="mt-1 truncate text-[10px] text-slate-500">{isFinish ? (assignment as FinishAssignment | undefined)?.finish_name || "No finish assigned" : (assignment as FloorWorkAssignment | undefined)?.definition_name || statusText(assignment?.status)}</p></button>; })}</div>
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-100">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 text-xs"><div><strong className="text-slate-900">{labels[part]}</strong><span className="ml-2 text-slate-500">Loaded from detected floor rooms and project specifications</span></div><div className="flex items-center gap-3">{boundaryReviewCount ? <span className="font-semibold text-red-700">{boundaryReviewCount} boundar{boundaryReviewCount === 1 ? "y" : "ies"} to review</span> : <span className="font-semibold text-emerald-700">All boundaries verified</span>}<span className="text-slate-500">{partAssignments.length} assignment{partAssignments.length === 1 ? "" : "s"}</span></div></div>
        {floor ? <DrawingCanvas key={floor.id} imageUrl={imageUrl} width={floor.drawing_width} height={floor.drawing_height} hideToolbar className="min-h-0 flex-1">
          {rooms.map((room) => {
            const assignment = isFinish ? finishAssignment(room as FinishRoom) : workAssignment(room as FloorWorkRoom, workType!);
            const points = editingBoundary && room.id === selectedRoomId ? editPoints : room.geometry?.points || [];
            const colour = isFinish ? (assignment as FinishAssignment | undefined)?.display_colour : (assignment as FloorWorkAssignment | undefined)?.display_colour;
            const area = isFinish ? (room as FinishRoom).area_m2 : workType === "skirting" ? (room as FloorWorkRoom).measurement?.net_skirting_length_m : (room as FloorWorkRoom).measurement?.area_m2;
            const invalidBoundary = !boundaryVerified(room);
            return <g key={room.id} onClick={(event) => { event.stopPropagation(); if (!editingBoundary) setSelectedRoomId(room.id); }} className="cursor-pointer"><polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill={invalidBoundary ? "#ef4444" : colour || "#64748b"} fillOpacity={assignment?.status === "not_required" ? .04 : invalidBoundary ? .12 : assignment ? .28 : .10} stroke={editingBoundary && room.id === selectedRoomId ? "#2563eb" : invalidBoundary ? "#dc2626" : room.id === selectedRoomId ? "#2563eb" : statusColour(assignment?.status)} strokeWidth={invalidBoundary || room.id === selectedRoomId ? 4 : 2} strokeDasharray={editingBoundary && room.id === selectedRoomId ? "5 4" : invalidBoundary ? "10 6" : assignment ? undefined : "7 5"} vectorEffect="non-scaling-stroke"/>{editingBoundary && room.id === selectedRoomId ? points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={8} fill="white" stroke="#2563eb" strokeWidth={4} vectorEffect="non-scaling-stroke" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingVertex(index); }} onPointerMove={(event) => moveVertex(event, index)} onPointerUp={(event) => { event.stopPropagation(); setDraggingVertex(null); }} />) : <text x={points.length ? points.reduce((sum,point)=>sum+point.x,0)/points.length : 0} y={points.length ? points.reduce((sum,point)=>sum+point.y,0)/points.length : 0} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0f172a" stroke="white" strokeWidth={3} paintOrder="stroke" pointerEvents="none"><tspan x={points.length ? points.reduce((sum,point)=>sum+point.x,0)/points.length : 0}>{compactRoomLabel(room.name, 30)}</tspan><tspan x={points.length ? points.reduce((sum,point)=>sum+point.x,0)/points.length : 0} dy="14" fontSize={10}>{invalidBoundary ? "Boundary review · " : ""}{Number(area || 0).toFixed(2)} {unit}</tspan></text>}</g>;
          })}
          {workType === "skirting" && selectedRoom ? (selectedRoom as FloorWorkRoom).skirting_edges.map((edge) => <line key={edge.id} x1={edge.point_a.x} y1={edge.point_a.y} x2={edge.point_b.x} y2={edge.point_b.y} stroke={edge.edge_type === "skirting" ? "#4f46e5" : edge.edge_type === "door_opening" ? "#f59e0b" : "#dc2626"} strokeWidth={6} strokeDasharray={edge.edge_type === "skirting" ? undefined : "7 5"} vectorEffect="non-scaling-stroke" pointerEvents="none" />) : null}
        </DrawingCanvas> : <div className="flex flex-1 items-center justify-center text-sm text-slate-500">No floor drawing is available.</div>}
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Selected item</p>
        <h3 className="mt-2 text-base font-bold text-slate-900">{selectedRoom ? friendlyRoomLabel(selectedRoom.name) : "Select a room on the drawing"}</h3>
        {selectedRoom ? <><div className="mt-2 flex items-center justify-between">{selectedBoundaryVerified ? <Status value={selectedAssignment?.status}/> : <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-700">Boundary needs review</span>}<strong className="text-sm text-slate-800">{Number(quantity || 0).toFixed(2)} {unit}</strong></div>{selectedBoundaryVerified && !editingBoundary ? <button type="button" onClick={beginBoundaryEdit} className="mt-3 w-full rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit room outline</button> : null}{!selectedBoundaryVerified || editingBoundary ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800"><strong>{editingBoundary ? "Editing room boundary" : "Not safe to confirm"}</strong><p>{editingBoundary ? "Drag the blue corner handles onto the visible inner faces of the room walls. Keep the outline inside the room." : selectedBoundaryEvidence?.text || "This outline is not sufficiently supported by the drawing’s wall faces."}</p>{!editingBoundary && selectedBoundaryEvidence?.support_ratio != null ? <p className="mt-1 font-semibold">Wall support: {Math.round(selectedBoundaryEvidence.support_ratio * 100)}%</p> : null}{editingBoundary ? <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={saving} onClick={() => { setEditingBoundary(false); setDraggingVertex(null); }} className="rounded-md border border-red-300 bg-white px-2 py-2 font-semibold">Cancel</button><button type="button" disabled={saving} onClick={() => void saveBoundary()} className="rounded-md bg-blue-600 px-2 py-2 font-semibold text-white disabled:bg-slate-300">Save & verify</button></div> : <button type="button" onClick={beginBoundaryEdit} className="mt-3 w-full rounded-md border border-red-300 bg-white px-2 py-2 font-semibold text-red-800">Edit room outline</button>}</div> : null}<div className="mt-5 space-y-4"><label className="block"><span className="text-xs font-semibold text-slate-700">{labels[part]} system</span><select className="input mt-2 w-full text-sm" value={systemId} onChange={(event) => setSystemId(event.target.value)}><option value="">Select a system</option>{definitions.map((item) => <option key={item.id} value={item.id}>{definitionLabel(item)}</option>)}</select></label>{selectedDefinition ? <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900"><strong>{definitionLabel(selectedDefinition)}</strong><p>{selectedDefinition.description || selectedDefinition.material || "No additional specification details."}</p>{selectedDefinition.material && selectedDefinition.description ? <p className="text-blue-700">Material: {selectedDefinition.material}</p> : null}</div> : null}{!definitions.length ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">No project system was identified for this layer. Add the required system in the dedicated Floor Works setup before confirming a room.</p> : null}{!isFinish && workType !== "skirting" ? <label className="block"><span className="text-xs font-semibold text-slate-700">Thickness (mm)</span><input className="input mt-2 w-full" type="number" value={thickness} onChange={(event) => setThickness(event.target.value)}/></label> : null}{!isFinish && (workType === "waterproofing" || workType === "sealer" || workType?.includes("insulation")) ? <label className="block"><span className="text-xs font-semibold text-slate-700">Layers or coats</span><input className="input mt-2 w-full" type="number" min={1} value={layers} onChange={(event) => setLayers(event.target.value)}/></label> : null}<label className="block"><span className="text-xs font-semibold text-slate-700">Waste allowance (%)</span><input className="input mt-2 w-full" type="number" min={0} value={waste} onChange={(event) => setWaste(event.target.value)}/></label>{workType === "waterproofing" ? <div className="rounded-lg border border-slate-200 p-3"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={upturn} onChange={(event) => setUpturn(event.target.checked)}/> Include perimeter upturn</label>{upturn ? <input className="input mt-2 w-full" type="number" value={upturnHeight} onChange={(event) => setUpturnHeight(event.target.value)} placeholder="Upturn height (mm)"/> : null}</div> : null}<button type="button" disabled={!selectedBoundaryVerified || editingBoundary || !systemId || saving} onClick={() => void saveAssignment()} className="h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? "Saving…" : selectedBoundaryVerified ? "Apply and confirm" : "Fix boundary before confirming"}</button>{selectedAssignment && selectedAssignment.status !== "confirmed" ? <button type="button" disabled={!selectedBoundaryVerified || editingBoundary || saving || !systemId} onClick={() => void confirmCurrent()} className="h-10 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 disabled:text-slate-300">Confirm current assignment</button> : null}{!isFinish ? <button type="button" disabled={!selectedBoundaryVerified || editingBoundary || saving} onClick={() => void markNotRequired()} className="h-9 w-full rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:text-slate-300">Mark as not required</button> : null}</div>{workType === "skirting" && selectedBoundaryVerified && !editingBoundary && (selectedRoom as FloorWorkRoom).skirting_edges.length ? <div className="mt-6 border-t border-slate-200 pt-4"><p className="text-xs font-bold text-slate-800">Skirting edges</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Exclude door openings, built-in furniture and full-height finishes.</p><div className="mt-3 space-y-2">{(selectedRoom as FloorWorkRoom).skirting_edges.map((edge) => <SkirtingEdgeControl key={edge.id} edge={edge} saving={saving} onChange={(value) => floorId && run(() => updateSkirtingEdge(projectId, floorId, selectedRoom.id, edge.id, value, "Updated from Floor drawing"))}/>)}</div></div> : null}</> : <p className="mt-2 text-xs leading-5 text-slate-500">Click a coloured room boundary to review or edit its assignment.</p>}
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
      </aside>
    </div>
  );
}

function SkirtingEdgeControl({ edge, saving, onChange }: { edge: SkirtingEdge; saving: boolean; onChange: (value: SkirtingEdge["edge_type"]) => void }) {
  return <div className="rounded-lg border border-slate-200 p-2.5"><div className="flex justify-between text-[10px]"><strong>Edge {edge.edge_index + 1}</strong><span>{Number(edge.length_m).toFixed(2)} m</span></div><select disabled={saving} className="input mt-2 w-full text-xs" value={edge.edge_type} onChange={(event) => onChange(event.target.value as SkirtingEdge["edge_type"])}><option value="skirting">Include skirting</option><option value="door_opening">Door opening</option><option value="built_in_furniture">Built-in furniture</option><option value="full_height_finish">Full-height finish</option><option value="no_skirting">No skirting</option><option value="unknown">Needs review</option></select></div>;
}
