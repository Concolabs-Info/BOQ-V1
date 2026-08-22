"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import type { Point } from "@/features/drawing/types";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import {
  analyzeFloorWorks,
  assignFloorWork,
  confirmFloorWorks,
  createFloorWorkDefinition,
  createFloorWorkZone,
  deactivateFloorWorkDefinition,
  deleteFloorWorkZone,
  getFloorWorkHistory,
  getFloorWorkState,
  recalculateFloorWorks,
  restoreFloorWorkHistory,
  updateFloorWorkDefinition,
  updateSkirtingEdge,
} from "../api";
import type {
  FloorWorkAssignment,
  FloorWorkDefinition,
  FloorWorkDefinitionPayload,
  FloorWorkRoom,
  FloorWorkStatus,
  FloorWorkType,
  SkirtingEdge,
} from "../types";

const categories: Array<{ type: FloorWorkType; label: string; short: string }> = [
  { type: "screed", label: "Screed / floor bed", short: "Screed" },
  { type: "waterproofing", label: "Waterproofing", short: "Waterproofing" },
  { type: "underlay", label: "Underlay", short: "Underlay" },
  { type: "board_insulation", label: "Board insulation", short: "Board" },
  { type: "quilt_insulation", label: "Quilt insulation", short: "Quilt" },
  { type: "isolation_membrane", label: "Isolation membrane", short: "Membrane" },
  { type: "sealer", label: "Sealer / coating", short: "Sealer" },
  { type: "skirting", label: "Skirting / floor base", short: "Skirting" },
];

const category = (type: FloorWorkType) => categories.find((item) => item.type === type)!;
const queryKey = (projectId: string, floorId: string | null) => ["floor-works", projectId, floorId] as const;
type Filter = "all" | "needs_review" | "not_found" | "confirmed";

function assignmentsFor(room: FloorWorkRoom, type: FloorWorkType) {
  return room.assignments.filter((item) => item.work_type === type);
}

function roomStatus(room: FloorWorkRoom, type: FloorWorkType): FloorWorkStatus {
  const items = assignmentsFor(room, type);
  if (!items.length) return "unassigned";
  const active = items.filter((item) => item.status !== "not_required");
  if (!active.length) return "not_required";
  if (active.some((item) => item.status === "conflict")) return "conflict";
  if (active.some((item) => item.status === "needs_review")) return "needs_review";
  if (active.some((item) => item.status === "unassigned")) return "unassigned";
  return active.every((item) => item.status === "confirmed") ? "confirmed" : "auto_confirmed";
}

function badge(status: FloorWorkStatus) {
  if (status === "conflict") return "border-red-200 bg-red-50 text-red-700";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "unassigned" || status === "not_required") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function stroke(status: FloorWorkStatus) {
  if (status === "conflict") return "#dc2626";
  if (status === "needs_review") return "#d97706";
  if (status === "unassigned" || status === "not_required") return "#64748b";
  return "#059669";
}

const blankDefinition = (workType: FloorWorkType): FloorWorkDefinitionPayload => ({
  work_type: workType,
  code: "",
  name: "",
  description: "",
  material: "",
  thickness_mm: null,
  layer_count: null,
  height_mm: workType === "skirting" ? 100 : null,
  default_waste_percent: 0,
  display_colour: "#60a5fa",
});

export function FloorWorksWorkspace({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [workType, setWorkType] = useState<FloorWorkType>("screed");
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [definitionId, setDefinitionId] = useState("");
  const [waste, setWaste] = useState("0");
  const [thickness, setThickness] = useState("");
  const [layers, setLayers] = useState("1");
  const [upturn, setUpturn] = useState(false);
  const [upturnHeight, setUpturnHeight] = useState("150");
  const [filter, setFilter] = useState<Filter>("all");
  const [drawingZone, setDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<Point[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<string | null>(null);
  const [definitionDraft, setDefinitionDraft] = useState<FloorWorkDefinitionPayload>(blankDefinition("screed"));
  const [autoRequested, setAutoRequested] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKey(projectId, floorId),
    queryFn: () => getFloorWorkState(projectId, floorId),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    refetchInterval: (result) => result.state.data?.active_jobs.length ? 2000 : false,
  });
  const state = query.data;
  const historyQuery = useQuery({
    queryKey: ["floor-works", projectId, floorId, "history"],
    queryFn: () => getFloorWorkHistory(projectId, floorId),
    enabled: showHistory,
  });

  useEffect(() => {
    if (!state?.floors.length) return;
    const next = state.floors.find((item) => item.id === floorId) || state.floors[0];
    if (next.id !== floorId) setFloorId(next.id);
  }, [floorId, state?.floors]);

  useEffect(() => {
    setSelectedRoomIds(new Set());
    setSelectedAssignmentId(null);
    setSelectedZoneId(null);
    setZonePoints([]);
    setDrawingZone(false);
  }, [floorId, workType]);

  useEffect(() => {
    if (!floorId || !state?.needs_automatic_sync || state.active_jobs.length || autoRequested === floorId) return;
    setAutoRequested(floorId);
    void analyzeFloorWorks(projectId, floorId).then(() => {
      void client.invalidateQueries({ queryKey: ["floor-works", projectId] });
    }).catch(() => undefined);
  }, [autoRequested, client, floorId, projectId, state?.active_jobs.length, state?.needs_automatic_sync]);

  const floor = state?.floors.find((item) => item.id === floorId) || null;
  const imageUrl = useAssetUrl(floor?.drawing_url);
  const selectedRooms = (state?.rooms || []).filter((room) => selectedRoomIds.has(room.id));
  const selectedRoom = selectedRooms.length === 1 ? selectedRooms[0] : null;
  const selectedZone = selectedRoom?.zones.find((item) => item.id === selectedZoneId) || null;
  const selectedAssignments = selectedRoom ? assignmentsFor(selectedRoom, workType) : [];
  const selectedAssignment = selectedAssignments.find((item) => item.id === selectedAssignmentId)
    || selectedAssignments.find((item) => selectedZoneId ? item.zone_id === selectedZoneId : !item.zone_id)
    || selectedAssignments[0]
    || null;
  const definitions = (state?.definitions || []).filter((item) => item.work_type === workType);

  useEffect(() => {
    setDefinitionId(selectedAssignment?.definition_id || "");
    setWaste(String(selectedAssignment?.waste_percent || 0));
    setThickness(selectedAssignment?.thickness_mm == null ? "" : String(selectedAssignment.thickness_mm));
    setLayers(String(selectedAssignment?.layer_count || 1));
    setUpturn(Boolean(selectedAssignment?.upturn_required));
    setUpturnHeight(String(selectedAssignment?.upturn_height_mm || 150));
  }, [selectedAssignment?.id]);

  const filteredRooms = useMemo(() => (state?.rooms || []).filter((room) => {
    const status = roomStatus(room, workType);
    if (filter === "all") return true;
    if (filter === "confirmed") return status === "confirmed" || status === "auto_confirmed";
    if (filter === "not_found") return status === "unassigned";
    return status === "needs_review" || status === "conflict";
  }), [filter, state?.rooms, workType]);

  function refresh() {
    for (const key of [["floor-works", projectId], ["review", projectId], ["boq", projectId], ["workflow", projectId, "summary"]]) {
      void client.invalidateQueries({ queryKey: key, refetchType: "active" });
    }
  }

  async function act(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The floor work could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  function selectRoom(roomId: string, additive = false) {
    setSelectedZoneId(null);
    setSelectedAssignmentId(null);
    setSelectedRoomIds((current) => {
      if (!additive) return new Set([roomId]);
      const next = new Set(current);
      next.has(roomId) ? next.delete(roomId) : next.add(roomId);
      return next;
    });
  }

  async function applyWork(required = true) {
    if (!selectedRoomIds.size) {
      setError("Select one or more rooms first.");
      return;
    }
    if (required && !definitionId) {
      setError(`Select a ${category(workType).label.toLowerCase()} definition.`);
      return;
    }
    await act(() => assignFloorWork(projectId, {
      room_ids: [...selectedRoomIds],
      work_type: workType,
      definition_id: required ? definitionId : selectedAssignment?.definition_id || definitionId || null,
      required,
      coverage_type: selectedZone ? "selected_zone" : "whole_room",
      zone_id: selectedZone?.id || null,
      thickness_mm: thickness ? Number(thickness) : null,
      layer_count: layers ? Number(layers) : null,
      waste_percent: Number(waste || 0),
      upturn_required: workType === "waterproofing" && upturn,
      upturn_height_mm: workType === "waterproofing" && upturn ? Number(upturnHeight || 0) : null,
      reason: required ? "Assigned from Floor works" : "Marked not required from Floor works",
    }));
  }

  async function saveZone() {
    if (!floorId || !selectedRoom || zonePoints.length < 3) {
      setError("Select one room and draw at least three zone points.");
      return;
    }
    await act(() => createFloorWorkZone(projectId, floorId, selectedRoom.id, workType, zonePoints, `${category(workType).short} zone`));
    setDrawingZone(false);
    setZonePoints([]);
  }

  async function saveDefinition() {
    if (!definitionDraft.name.trim()) {
      setError("Enter a definition name.");
      return;
    }
    await act(() => editingDefinition
      ? updateFloorWorkDefinition(projectId, editingDefinition, definitionDraft)
      : createFloorWorkDefinition(projectId, definitionDraft));
    setEditingDefinition(null);
    setDefinitionDraft(blankDefinition(workType));
  }

  function editDefinition(item: FloorWorkDefinition) {
    setEditingDefinition(item.id);
    setDefinitionDraft({
      work_type: item.work_type,
      code: item.code || "",
      name: item.name,
      description: item.description || "",
      material: item.material || "",
      manufacturer: item.manufacturer || "",
      product_code: item.product_code || "",
      system_type: item.system_type || "",
      thickness_mm: item.thickness_mm,
      layer_count: item.layer_count,
      condition: item.condition || "",
      height_mm: item.height_mm,
      default_waste_percent: item.default_waste_percent,
      display_colour: item.display_colour,
    });
    setShowLibrary(true);
  }

  const selectedMetric = workType === "skirting"
    ? selectedRoom?.measurement?.net_skirting_length_m
    : selectedRoom?.measurement?.area_m2 ?? selectedRoom?.area_m2;

  return (
    <div className="min-h-0">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((item) => {
            const count = (state?.assignments || []).filter((assignment) => assignment.work_type === item.type).length;
            return (
              <button key={item.type} type="button" onClick={() => setWorkType(item.type)} className={workType === item.type ? "shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-left text-xs font-semibold text-white" : "shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-xs font-semibold text-slate-600 hover:border-blue-300"}>
                <span className="block">{item.short}</span>
                <span className={workType === item.type ? "mt-0.5 block text-[10px] text-slate-300" : "mt-0.5 block text-[10px] text-slate-400"}>{count ? `${count} assignment${count === 1 ? "" : "s"}` : "Not found"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-[720px] grid-cols-[255px_minmax(0,1fr)_360px] overflow-hidden">
        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <label className="block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Floor</label>
          <select className="input mt-2 w-full" value={floorId || ""} onChange={(event) => setFloorId(event.target.value)}>
            {(state?.floors || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {([ ["all", "All"], ["needs_review", "Review"], ["not_found", "Not found"], ["confirmed", "Confirmed"] ] as Array<[Filter, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={filter === value ? "rounded-lg bg-slate-950 px-2 py-2 text-xs font-semibold text-white" : "rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600"}>{label}</button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Rooms</p>
            <button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setSelectedRoomIds(new Set(filteredRooms.map((room) => room.id)))}>Select all</button>
          </div>
          <div className="mt-2 space-y-2">
            {filteredRooms.map((room) => {
              const items = assignmentsFor(room, workType);
              const status = roomStatus(room, workType);
              return (
                <button key={room.id} type="button" onClick={(event) => selectRoom(room.id, event.shiftKey || event.ctrlKey || event.metaKey)} className={selectedRoomIds.has(room.id) ? "w-full rounded-xl border-2 border-blue-500 bg-blue-50 p-3 text-left" : "w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-200"}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{room.friendly_number} {room.name || "Room"}</p><p className="mt-1 truncate text-xs text-slate-500">{items.map((item) => item.definition_code || item.definition_name).filter(Boolean).join(", ") || (status === "not_required" ? "Not required" : "Not found")}</p></div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${badge(status)}`}>{status === "unassigned" ? "not found" : status.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-600">{workType === "skirting" ? `${Number(room.measurement?.net_skirting_length_m || 0).toFixed(2)} m net` : `${Number(room.measurement?.area_m2 ?? room.area_m2 ?? 0).toFixed(2)} m²`}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex gap-2">
              <Button disabled={!floorId || saving || Boolean(state?.active_jobs.length)} onClick={() => void act(() => analyzeFloorWorks(projectId, floorId, true))}>{state?.active_jobs.length ? "Analyzing…" : "Analyze floor works"}</Button>
              <Button variant="secondary" disabled={!floorId || saving} onClick={() => floorId && void act(() => recalculateFloorWorks(projectId, floorId))}>Recalculate</Button>
              {workType !== "skirting" ? <Button variant="secondary" disabled={!selectedRoom || saving} onClick={() => { setDrawingZone(true); setZonePoints([]); }}>Draw partial zone</Button> : null}
            </div>
            <div className="text-right text-xs text-slate-500"><p><strong className="text-slate-800">{state?.summary.confirmed || 0}</strong> confirmed · <strong className="text-amber-700">{(state?.summary.needs_review || 0) + (state?.summary.conflicts || 0)}</strong> review</p><p className="mt-1">{Number(state?.summary.area_m2 || 0).toFixed(2)} m² · {Number(state?.summary.linear_m || 0).toFixed(2)} m</p></div>
          </div>
          {floor ? (
            <DrawingCanvas key={floor.id} imageUrl={imageUrl} width={floor.drawing_width} height={floor.drawing_height} tool={drawingZone ? "draw" : "select"} onCanvasClick={(point) => drawingZone && setZonePoints((current) => [...current, point])} className="min-h-0 flex-1">
              {(state?.rooms || []).map((room) => {
                const items = assignmentsFor(room, workType);
                const first = items[0];
                const points = room.display_polygon?.points?.length ? room.display_polygon.points : room.geometry.points || [];
                return <polygon key={room.id} points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill={first?.display_colour || "#94a3b8"} fillOpacity={first?.definition_id ? 0.3 : 0.1} stroke={selectedRoomIds.has(room.id) ? "#2563eb" : stroke(roomStatus(room, workType))} strokeWidth={selectedRoomIds.has(room.id) ? 4 : 2} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); selectRoom(room.id, event.shiftKey || event.ctrlKey || event.metaKey); }} />;
              })}
              {(state?.zones || []).filter((zone) => zone.work_type === workType).map((zone) => <polygon key={zone.id} points={(zone.geometry.points || []).map((point) => `${point.x},${point.y}`).join(" ")} fill="#2563eb" fillOpacity={0.22} stroke={selectedZoneId === zone.id ? "#1d4ed8" : "#475569"} strokeDasharray="6 4" strokeWidth={selectedZoneId === zone.id ? 4 : 2} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); setSelectedRoomIds(new Set([zone.room_id])); setSelectedZoneId(zone.id); }} />)}
              {workType === "skirting" && selectedRoom ? selectedRoom.skirting_edges.map((edge) => <line key={edge.id} x1={edge.point_a.x} y1={edge.point_a.y} x2={edge.point_b.x} y2={edge.point_b.y} stroke={edge.edge_type === "skirting" ? "#4f46e5" : edge.edge_type === "door_opening" ? "#f59e0b" : "#dc2626"} strokeWidth={5} strokeDasharray={edge.edge_type === "skirting" ? undefined : "7 5"} vectorEffect="non-scaling-stroke" />) : null}
              {zonePoints.length ? <><polyline points={zonePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill={zonePoints.length >= 3 ? "rgba(37,99,235,.16)" : "none"} stroke="#2563eb" strokeWidth={3} vectorEffect="non-scaling-stroke" />{zonePoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={4} fill="#2563eb" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}</> : null}
            </DrawingCanvas>
          ) : <div className="flex flex-1 items-center justify-center text-sm text-slate-500">No floor drawing is ready.</div>}
          {drawingZone ? <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"><Button variant="secondary" onClick={() => { setDrawingZone(false); setZonePoints([]); }}>Cancel</Button><Button disabled={zonePoints.length < 3 || saving} onClick={() => void saveZone()}>Save zone</Button></div> : null}
        </main>

        <aside className="min-h-0 overflow-y-auto bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">{category(workType).label}</p>
          <h3 className="mt-1 text-lg font-semibold">{selectedRooms.length ? `${selectedRooms.length} room${selectedRooms.length === 1 ? "" : "s"} selected` : "Select rooms on the plan"}</h3>
          {selectedRooms.length ? <p className="mt-1 text-sm text-slate-500">{selectedRooms.map((room) => room.name || room.friendly_number).join(", ")}</p> : null}
          <div className="mt-5 space-y-4">
            <label className="block"><span className="text-sm font-semibold">Definition / system</span><select className="input mt-2 w-full" value={definitionId} onChange={(event) => setDefinitionId(event.target.value)}><option value="">Not required / not found</option>{definitions.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} — ` : ""}{item.name}</option>)}</select></label>
            {workType !== "skirting" ? <label className="block"><span className="text-sm font-semibold">Thickness (mm)</span><input className="input mt-2 w-full" type="number" min={0.1} value={thickness} onChange={(event) => setThickness(event.target.value)} placeholder="Use definition value" /></label> : null}
            {workType === "sealer" || workType.includes("insulation") || workType === "waterproofing" ? <label className="block"><span className="text-sm font-semibold">Layer / coat count</span><input className="input mt-2 w-full" type="number" min={1} value={layers} onChange={(event) => setLayers(event.target.value)} /></label> : null}
            <label className="block"><span className="text-sm font-semibold">Waste percentage</span><input className="input mt-2 w-full" type="number" min={0} max={100} step={0.5} value={waste} onChange={(event) => setWaste(event.target.value)} /></label>
            {workType === "waterproofing" ? <div className="rounded-xl border border-slate-200 p-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={upturn} onChange={(event) => setUpturn(event.target.checked)} />Include perimeter upturn</label>{upturn ? <input className="input mt-3 w-full" type="number" min={1} value={upturnHeight} onChange={(event) => setUpturnHeight(event.target.value)} placeholder="Upturn height mm" /> : null}</div> : null}
            <Button className="w-full" disabled={!selectedRoomIds.size || !definitionId || saving} onClick={() => void applyWork(true)}>Apply and confirm</Button>
            <Button className="w-full" variant="secondary" disabled={!selectedRoomIds.size || saving} onClick={() => void applyWork(false)}>Mark not required</Button>
            {selectedAssignment?.definition_id ? <Button className="w-full" variant="secondary" disabled={saving} onClick={() => void act(() => confirmFloorWorks(projectId, [selectedAssignment.id], "selected", floorId))}>Confirm current assignment</Button> : null}
          </div>

          {selectedRoom ? <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"><Metric label={workType === "skirting" ? "Net skirting" : "Measured area"} value={`${Number(selectedMetric || 0).toFixed(2)} ${workType === "skirting" ? "m" : "m²"}`} /><Metric label="Measurement" value={selectedRoom.measurement?.measurement_status.replaceAll("_", " ") || "not calculated"} />{selectedAssignment ? <><Metric label="NRM quantity" value={`${Number(selectedAssignment.nrm_quantity || 0).toFixed(2)} ${selectedAssignment.measurement_unit}`} /><Metric label="Order quantity" value={`${Number(selectedAssignment.order_quantity || 0).toFixed(2)} ${selectedAssignment.measurement_unit}`} /><Metric label="Status" value={selectedAssignment.status.replaceAll("_", " ")} /><Metric label="Source" value={selectedAssignment.assignment_method.replaceAll("_", " ")} /></> : null}</div> : null}

          {workType === "skirting" && selectedRoom?.skirting_edges.length ? <div className="mt-5"><p className="text-sm font-semibold">Skirting edges</p><p className="mt-1 text-xs text-slate-500">Exclude doors, fixed furniture, and full-height finishes from the net length.</p><div className="mt-2 space-y-2">{selectedRoom.skirting_edges.map((edge) => <SkirtingEdgeEditor key={edge.id} edge={edge} disabled={saving || !floorId} onChange={(edgeType) => floorId && void act(() => updateSkirtingEdge(projectId, floorId, selectedRoom.id, edge.id, edgeType, "Updated in Floor works"))} />)}</div></div> : null}

          {selectedRoom?.zones.filter((zone) => zone.work_type === workType).length ? <div className="mt-5"><p className="text-sm font-semibold">Partial zones</p><div className="mt-2 space-y-2">{selectedRoom.zones.filter((zone) => zone.work_type === workType).map((zone) => <div key={zone.id} className="rounded-lg border border-slate-200 p-3 text-xs"><button type="button" className="w-full text-left" onClick={() => setSelectedZoneId(zone.id)}><strong>{zone.name || `${category(workType).short} zone`}</strong><span className="float-right">{Number(zone.net_area_m2 || 0).toFixed(2)} m²</span></button><button type="button" className="mt-2 font-semibold text-red-600" onClick={() => floorId && void act(() => deleteFloorWorkZone(projectId, floorId, selectedRoom.id, zone.id))}>Delete zone</button></div>)}</div></div> : null}

          {selectedRoom?.evidence.filter((item) => !item.assignment_id || item.assignment_id === selectedAssignment?.id).length ? <div className="mt-5"><p className="text-sm font-semibold">Evidence</p><div className="mt-2 space-y-2">{selectedRoom.evidence.filter((item) => !item.assignment_id || item.assignment_id === selectedAssignment?.id).map((item) => <div key={item.id} className={item.accepted ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs" : "rounded-lg border border-slate-200 p-3 text-xs"}><div className="flex justify-between gap-2"><strong>{item.evidence_type.replaceAll("_", " ")}</strong><span>{item.confidence == null ? "—" : `${Math.round(item.confidence * 100)}%`}</span></div><p className="mt-1 text-slate-600">{item.value_text || item.source_text || "Saved evidence"}</p>{item.source_page ? <p className="mt-1 text-slate-400">Page {item.source_page}</p> : null}</div>)}</div></div> : null}

          <div className="mt-6 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => { setDefinitionDraft(blankDefinition(workType)); setEditingDefinition(null); setShowLibrary((value) => !value); }}>System library</Button><Button variant="secondary" onClick={() => setShowHistory((value) => !value)}>History</Button></div>
          {showLibrary ? <FloorWorkLibrary definitions={definitions} draft={definitionDraft} editingId={editingDefinition} saving={saving} onDraft={setDefinitionDraft} onSave={() => void saveDefinition()} onEdit={editDefinition} onDeactivate={(id) => void act(() => deactivateFloorWorkDefinition(projectId, id))} onCancel={() => { setEditingDefinition(null); setDefinitionDraft(blankDefinition(workType)); }} /> : null}
          {showHistory ? <div className="mt-5"><p className="text-sm font-semibold">Change history</p><div className="mt-2 space-y-2">{(historyQuery.data?.history || []).slice(0, 20).map((item) => <div key={String(item.id)} className="rounded-lg border border-slate-200 p-3 text-xs"><strong>{String(item.action || "change").replaceAll("_", " ")}</strong><p className="mt-1 text-slate-500">{String(item.entity_type || "floor work")} · {String(item.created_at || "")}</p><button type="button" className="mt-2 font-semibold text-blue-600" onClick={() => void act(() => restoreFloorWorkHistory(projectId, String(item.id)))}>Restore</button></div>)}{historyQuery.isLoading ? <p className="text-xs text-slate-500">Loading history…</p> : null}</div></div> : null}
          {error ? <div className="mt-5"><ErrorMessage message={error} /></div> : null}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-b border-slate-200 py-2 last:border-0"><span className="text-slate-500">{label}</span><strong className="text-right text-slate-800">{value}</strong></div>;
}

function SkirtingEdgeEditor({ edge, disabled, onChange }: { edge: SkirtingEdge; disabled: boolean; onChange: (value: SkirtingEdge["edge_type"]) => void }) {
  return <div className="rounded-lg border border-slate-200 p-3 text-xs"><div className="flex items-center justify-between"><strong>Edge {edge.edge_index + 1}</strong><span>{Number(edge.length_m || 0).toFixed(2)} m</span></div><select className="input mt-2 w-full text-xs" disabled={disabled} value={edge.edge_type} onChange={(event) => onChange(event.target.value as SkirtingEdge["edge_type"])}><option value="skirting">Include skirting</option><option value="no_skirting">No skirting</option><option value="door_opening">Door opening</option><option value="built_in_furniture">Built-in furniture</option><option value="full_height_finish">Full-height finish</option><option value="unknown">Needs review</option></select></div>;
}

function FloorWorkLibrary({ definitions, draft, editingId, saving, onDraft, onSave, onEdit, onDeactivate, onCancel }: { definitions: FloorWorkDefinition[]; draft: FloorWorkDefinitionPayload; editingId: string | null; saving: boolean; onDraft: (value: FloorWorkDefinitionPayload) => void; onSave: () => void; onEdit: (item: FloorWorkDefinition) => void; onDeactivate: (id: string) => void; onCancel: () => void }) {
  const number = (value: string) => value === "" ? null : Number(value);
  return <div className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{editingId ? "Edit definition" : "Add definition"}</p>{editingId ? <button type="button" className="text-xs font-semibold text-slate-500" onClick={onCancel}>Cancel</button> : null}</div><div className="mt-3 grid grid-cols-2 gap-2"><input className="input" placeholder="Code" value={draft.code || ""} onChange={(event) => onDraft({ ...draft, code: event.target.value })} /><input className="input" type="color" value={draft.display_colour || "#60a5fa"} onChange={(event) => onDraft({ ...draft, display_colour: event.target.value })} /></div><input className="input mt-2 w-full" placeholder="System / product name" value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} /><textarea className="input mt-2 min-h-20 w-full" placeholder="Description" value={draft.description || ""} onChange={(event) => onDraft({ ...draft, description: event.target.value })} /><input className="input mt-2 w-full" placeholder="Material" value={draft.material || ""} onChange={(event) => onDraft({ ...draft, material: event.target.value })} /><div className="mt-2 grid grid-cols-2 gap-2"><input className="input" type="number" min={0.1} placeholder="Thickness mm" value={draft.thickness_mm ?? ""} onChange={(event) => onDraft({ ...draft, thickness_mm: number(event.target.value) })} /><input className="input" type="number" min={1} placeholder={draft.work_type === "skirting" ? "Height mm" : "Layers"} value={draft.work_type === "skirting" ? draft.height_mm ?? "" : draft.layer_count ?? ""} onChange={(event) => onDraft(draft.work_type === "skirting" ? { ...draft, height_mm: number(event.target.value) } : { ...draft, layer_count: number(event.target.value) })} /></div><Button className="mt-3 w-full" disabled={saving || !draft.name.trim()} onClick={onSave}>{editingId ? "Save definition" : "Add definition"}</Button><div className="mt-4 space-y-2">{definitions.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs"><div className="flex items-start gap-2"><span className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ backgroundColor: item.display_colour }} /><div className="min-w-0 flex-1"><strong>{item.code ? `${item.code} — ` : ""}{item.name}</strong><p className="mt-1 text-slate-500">{item.measurement_unit} · NRM {item.nrm_work_section}{item.nrm_item ? `/${item.nrm_item}` : ""} · {item.assignment_count || 0} assignments</p></div></div><div className="mt-2 flex gap-3"><button type="button" className="font-semibold text-blue-600" onClick={() => onEdit(item)}>Edit</button><button type="button" className="font-semibold text-red-600" disabled={Boolean(item.assignment_count)} onClick={() => onDeactivate(item.id)}>Deactivate</button></div></div>)}</div></div>;
}
