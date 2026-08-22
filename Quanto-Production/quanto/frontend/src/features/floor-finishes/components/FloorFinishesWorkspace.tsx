"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import { confirmDrawingRegistration } from "@/features/drawings/api";
import { DrawingOverlayControls, drawingSvgTransform, type DrawingViewMode } from "@/features/drawings/components/DrawingOverlayControls";
import type { Point } from "@/features/drawing/types";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import {
  analyzeFloorFinishes,
  assignFinishToRooms,
  confirmFinishAssignments,
  createCanonicalFinishZone,
  createFinishDefinition,
  deactivateFinishDefinition,
  deleteCanonicalFinishZone,
  getFloorFinishState,
  getFinishHistory,
  restoreFinishHistory,
  updateCanonicalFinishZone,
  updateFinishDefinition,
} from "../api";
import type {
  FinishAssignment,
  FinishDefinition,
  FinishDefinitionPayload,
  FinishRoom,
  FinishStatus,
  FinishZone,
} from "../types";

type Filter = "all" | "needs_review" | "conflict" | "unassigned" | "confirmed";

const queryKey = (projectId: string, floorId: string | null) =>
  ["floor-finishes", projectId, floorId] as const;

const emptyDraft: FinishDefinitionPayload = {
  original_tag: "",
  name: "",
  description: "",
  material_category: "",
  material: "",
  display_colour: "#60a5fa",
  measurement_unit: "m²",
  work_type: "floor_finish",
  nrm_work_section: "28",
  nrm_item: "2",
  internal_external: "both",
  measurement_basis: "auto",
  default_waste_percent: 0,
};

function wholeAssignment(room: FinishRoom): FinishAssignment | null {
  return room.assignments.find((item) => !item.zone_id) || null;
}

function roomStatus(room: FinishRoom): FinishStatus {
  const assignments = room.assignments;
  if (!assignments.length) return "unassigned";
  if (assignments.some((item) => item.status === "conflict")) return "conflict";
  if (assignments.some((item) => item.status === "unassigned"))
    return "unassigned";
  if (assignments.some((item) => item.status === "needs_review"))
    return "needs_review";
  return assignments.every((item) => item.status === "confirmed")
    ? "confirmed"
    : "auto_confirmed";
}

function statusClasses(status: FinishStatus) {
  if (status === "conflict") return "border-red-300 bg-red-50 text-red-700";
  if (status === "unassigned") return "border-slate-300 bg-slate-50 text-slate-600";
  if (status === "needs_review")
    return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-emerald-300 bg-emerald-50 text-emerald-700";
}

function statusStroke(status: FinishStatus) {
  if (status === "conflict") return "#dc2626";
  if (status === "unassigned") return "#64748b";
  if (status === "needs_review") return "#d97706";
  if (status === "auto_confirmed") return "#16a34a";
  return "#0f766e";
}

export function FloorFinishesWorkspace({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [finishId, setFinishId] = useState("");
  const [waste, setWaste] = useState("0");
  const [measurementBasis, setMeasurementBasis] = useState<"auto" | "area" | "linear">("auto");
  const [measurementReason, setMeasurementReason] = useState("");
  const [drawingZone, setDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<Point[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingFinish, setEditingFinish] = useState<string | null>(null);
  const [definitionDraft, setDefinitionDraft] =
    useState<FinishDefinitionPayload>(emptyDraft);
  const [planDrawingMode, setPlanDrawingMode] = useState<DrawingViewMode>("overlay");
  const [overlayOpacity, setOverlayOpacity] = useState(0.55);

  const query = useQuery({
    queryKey: queryKey(projectId, floorId),
    queryFn: () => getFloorFinishState(projectId, floorId),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    placeholderData: (previous) => previous,
    refetchInterval: (result) =>
      result.state.data?.active_jobs.length ? 2000 : false,
  });
  const state = query.data;
  const historyQuery = useQuery({
    queryKey: ["floor-finishes", projectId, floorId, "history"],
    queryFn: () => getFinishHistory(projectId, floorId),
    enabled: showHistory,
  });

  useEffect(() => {
    if (!state?.floors.length) return;
    const next =
      state.floors.find((item) => item.id === floorId) || state.floors[0];
    if (next.id !== floorId) setFloorId(next.id);
  }, [floorId, state?.floors]);

  useEffect(() => {
    setSelectedRoomIds(new Set());
    setSelectedZoneId(null);
    setZonePoints([]);
    setDrawingZone(false);
  }, [floorId]);

  const floor = state?.floors.find((item) => item.id === floorId) || null;
  const architecturalUrl = useAssetUrl(floor?.architectural_drawing_url);
  const finishPlanUrl = useAssetUrl(floor?.floor_finish_drawing_url);
  const floorFinishDrawing = floor?.finish_drawings.find((item) => item.drawing_type === "floor_finish_plan") || null;
  const imageUrl = planDrawingMode === "drawing" ? (finishPlanUrl || architecturalUrl) : (architecturalUrl || finishPlanUrl);
  const overlayImageUrl = planDrawingMode === "overlay" && architecturalUrl && finishPlanUrl ? finishPlanUrl : null;
  const selectedRooms = (state?.rooms || []).filter((room) =>
    selectedRoomIds.has(room.id),
  );
  const selectedRoom = selectedRooms.length === 1 ? selectedRooms[0] : null;
  const selectedZone =
    selectedRoom?.zones.find((zone) => zone.id === selectedZoneId) || null;
  const selectedAssignment = selectedZone
    ? selectedRoom?.assignments.find(
        (item) => item.zone_id === selectedZone.id,
      ) || null
    : selectedRoom
      ? wholeAssignment(selectedRoom)
      : null;

  useEffect(() => {
    setFinishId(selectedAssignment?.finish_id || "");
    setWaste(String(selectedAssignment?.waste_percent || 0));
    setMeasurementBasis(selectedAssignment?.measurement_reason ? selectedAssignment.measurement_basis : "auto");
    setMeasurementReason(selectedAssignment?.measurement_reason || "");
  }, [selectedAssignment?.id, selectedAssignment?.finish_id, selectedAssignment?.waste_percent]);

  const filteredRooms = useMemo(
    () =>
      (state?.rooms || []).filter((room) => {
        const status = roomStatus(room);
        if (filter === "all") return true;
        if (filter === "confirmed")
          return status === "confirmed" || status === "auto_confirmed";
        return status === filter;
      }),
    [filter, state?.rooms],
  );

  function refresh() {
    void client.invalidateQueries({
      queryKey: ["floor-finishes", projectId],
      refetchType: "active",
    });
    void client.invalidateQueries({
      queryKey: ["review", projectId],
      refetchType: "active",
    });
    void client.invalidateQueries({
      queryKey: ["boq", projectId],
      refetchType: "active",
    });
    void client.invalidateQueries({
      queryKey: ["workflow", projectId, "summary"],
      refetchType: "active",
    });
  }

  async function act(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The floor finish could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  function selectRoom(roomId: string, additive = false) {
    setSelectedZoneId(null);
    setSelectedRoomIds((current) => {
      if (!additive) return new Set([roomId]);
      const next = new Set(current);
      next.has(roomId) ? next.delete(roomId) : next.add(roomId);
      return next;
    });
  }

  async function applyFinish() {
    const wasteValue = Number(waste || 0);
    if (selectedZone && selectedRoom && floorId) {
      await act(() =>
        updateCanonicalFinishZone(
          projectId,
          floorId,
          selectedRoom.id,
          selectedZone.id,
          { finish_id: finishId || null, waste_percent: wasteValue },
        ),
      );
      return;
    }
    if (!selectedRoomIds.size) {
      setError("Select one or more rooms first.");
      return;
    }
    await act(() =>
      assignFinishToRooms(
        projectId,
        [...selectedRoomIds],
        finishId || null,
        wasteValue,
        finishId
          ? "Assigned from Floor finishes"
          : "Floor finish assignment cleared",
        measurementBasis === "auto" ? null : measurementBasis,
        measurementReason,
      ),
    );
  }

  async function saveZone() {
    if (!floorId || !selectedRoom || zonePoints.length < 3) {
      setError("Select one room and draw at least three zone points.");
      return;
    }
    await act(() =>
      createCanonicalFinishZone(projectId, floorId, selectedRoom.id, {
        points: zonePoints,
        finish_id: finishId || undefined,
        waste_percent: Number(waste || 0),
      }),
    );
    setDrawingZone(false);
    setZonePoints([]);
  }

  async function saveDefinition() {
    if (!definitionDraft.name.trim()) {
      setError("Enter a finish name.");
      return;
    }
    await act(() =>
      editingFinish
        ? updateFinishDefinition(projectId, editingFinish, definitionDraft)
        : createFinishDefinition(projectId, definitionDraft),
    );
    setEditingFinish(null);
    setDefinitionDraft(emptyDraft);
  }

  function editDefinition(item: FinishDefinition) {
    setEditingFinish(item.id);
    setDefinitionDraft({
      original_tag: item.original_tag || "",
      name: item.name,
      description: item.description || "",
      material_category: item.material_category || "",
      material: item.material || "",
      tile_width_mm: item.tile_width_mm,
      tile_length_mm: item.tile_length_mm,
      thickness_mm: item.thickness_mm,
      colour: item.colour || "",
      display_colour: item.display_colour,
      surface_finish: item.surface_finish || "",
      pattern: item.pattern || "",
      manufacturer: item.manufacturer || "",
      product_code: item.product_code || "",
      work_type: "floor_finish",
      nrm_work_section: item.nrm_work_section,
      nrm_item: item.nrm_item,
      bedding: item.bedding || "",
      underlay_reference: item.underlay_reference || "",
      internal_external: item.internal_external,
      measurement_basis: item.measurement_basis,
      measurement_unit: item.measurement_unit,
      default_waste_percent: item.default_waste_percent,
    });
    setShowLibrary(true);
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-[720px] grid-cols-[250px_minmax(0,1fr)_340px] overflow-hidden">
        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <label className="block text-xs font-semibold uppercase tracking-[.14em] text-slate-400">
            Floor
          </label>
          <select
            className="input mt-2 w-full"
            value={floorId || ""}
            onChange={(event) => setFloorId(event.target.value)}
          >
            {(state?.floors || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(
              [
                ["all", "All"],
                ["needs_review", "Review"],
                ["conflict", "Conflicts"],
                ["unassigned", "Unassigned"],
                ["confirmed", "Confirmed"],
              ] as Array<[Filter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={
                  filter === value
                    ? "rounded-lg bg-slate-950 px-2 py-2 text-xs font-semibold text-white"
                    : "rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600"
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">
              Rooms
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-blue-600"
              onClick={() =>
                setSelectedRoomIds(
                  new Set(filteredRooms.map((room) => room.id)),
                )
              }
            >
              Select all
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {filteredRooms.map((room) => {
              const assignment = wholeAssignment(room);
              const status = roomStatus(room);
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={(event) => selectRoom(room.id, event.shiftKey || event.ctrlKey)}
                  className={
                    selectedRoomIds.has(room.id)
                      ? "w-full rounded-xl border-2 border-blue-500 bg-blue-50 p-3 text-left"
                      : "w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-200"
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {room.friendly_number} {room.name || "Room"}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {assignment?.finish_code || assignment?.finish_name || "No finish"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClasses(status)}`}
                    >
                      {status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    {Number(room.area_m2 || 0).toFixed(2)} m²
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex gap-2">
              <Button
                disabled={!floorId || saving || Boolean(state?.active_jobs.length)}
                onClick={() =>
                  void act(() => analyzeFloorFinishes(projectId, floorId))
                }
              >
                {state?.active_jobs.length ? "Detecting…" : "Detect finishes"}
              </Button>
              <Button
                variant="secondary"
                disabled={!selectedRoom || saving}
                onClick={() => {
                  setDrawingZone(true);
                  setZonePoints([]);
                }}
              >
                Draw finish zone
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2"><DrawingOverlayControls mode={planDrawingMode} opacity={overlayOpacity} hasDrawing={Boolean(finishPlanUrl)} onMode={setPlanDrawingMode} onOpacity={setOverlayOpacity} />{floorFinishDrawing && floorFinishDrawing.registration_status !== "confirmed" ? <Button variant="secondary" disabled={saving} onClick={() => void act(() => confirmDrawingRegistration(projectId, floorFinishDrawing))}>Confirm alignment</Button> : null}</div>
            <div className="text-right text-xs text-slate-500">
              <p>
                <strong className="text-slate-800">
                  {state?.summary.confirmed || 0}
                </strong>{" "}
                confirmed ·{" "}
                <strong className="text-amber-700">
                  {(state?.summary.needs_review || 0) +
                    (state?.summary.conflicts || 0) +
                    (state?.summary.unassigned || 0)}
                </strong>{" "}
                to review
              </p>
              <p className="mt-1">{Number(state?.summary.area_m2 || 0).toFixed(2)} m² assigned</p>
            </div>
          </div>

          {floor ? (
            <DrawingCanvas
              key={floor.id}
              imageUrl={imageUrl}
              width={floor.drawing_width}
              height={floor.drawing_height}
              tool={drawingZone ? "draw" : "select"}
              onCanvasClick={(point) => {
                if (drawingZone) setZonePoints((current) => [...current, point]);
              }}
              className="min-h-0 flex-1"
            >
              {overlayImageUrl ? <image href={overlayImageUrl} x={0} y={0} width={floor.drawing_width} height={floor.drawing_height} preserveAspectRatio="none" opacity={overlayOpacity} transform={drawingSvgTransform(floorFinishDrawing)} className="pointer-events-none" /> : null}
              {(state?.rooms || []).map((room) => {
                const assignment = wholeAssignment(room);
                const status = roomStatus(room);
                const points = room.geometry.points || [];
                return (
                  <polygon
                    key={room.id}
                    points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill={assignment?.display_colour || "#94a3b8"}
                    fillOpacity={assignment?.finish_id ? 0.34 : 0.16}
                    stroke={
                      selectedRoomIds.has(room.id)
                        ? "#2563eb"
                        : statusStroke(status)
                    }
                    strokeWidth={selectedRoomIds.has(room.id) ? 4 : 2}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      selectRoom(
                        room.id,
                        event.shiftKey || event.ctrlKey || event.metaKey,
                      );
                    }}
                  />
                );
              })}
              {(state?.rooms || []).flatMap((room) =>
                room.zones.map((zone) => {
                  const assignment = room.assignments.find(
                    (item) => item.zone_id === zone.id,
                  );
                  return (
                    <polygon
                      key={zone.id}
                      points={(zone.geometry.points || [])
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      fill={assignment?.display_colour || "#cbd5e1"}
                      fillOpacity={0.58}
                      stroke={selectedZoneId === zone.id ? "#2563eb" : "#334155"}
                      strokeDasharray={selectedZoneId === zone.id ? undefined : "6 4"}
                      strokeWidth={selectedZoneId === zone.id ? 4 : 2}
                      vectorEffect="non-scaling-stroke"
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedRoomIds(new Set([room.id]));
                        setSelectedZoneId(zone.id);
                      }}
                    />
                  );
                }),
              )}
              {zonePoints.length ? (
                <>
                  <polyline
                    points={zonePoints
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                    fill={
                      zonePoints.length >= 3
                        ? "rgba(37,99,235,.16)"
                        : "none"
                    }
                    stroke="#2563eb"
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                  />
                  {zonePoints.map((point, index) => (
                    <circle
                      key={index}
                      cx={point.x}
                      cy={point.y}
                      r={4}
                      fill="#2563eb"
                      stroke="white"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </>
              ) : null}
            </DrawingCanvas>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              No floor drawing is ready.
            </div>
          )}

          {drawingZone ? (
            <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <Button
                variant="secondary"
                onClick={() => {
                  setDrawingZone(false);
                  setZonePoints([]);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={zonePoints.length < 3 || saving}
                onClick={() => void saveZone()}
              >
                Save zone
              </Button>
            </div>
          ) : null}
        </main>

        <aside className="min-h-0 overflow-y-auto bg-white p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">
              {selectedZone ? "Selected finish zone" : "Selected rooms"}
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {selectedZone
                ? selectedZone.name
                : selectedRooms.length
                  ? `${selectedRooms.length} room${selectedRooms.length === 1 ? "" : "s"}`
                  : "Select rooms on the plan"}
            </h3>
            {selectedRooms.length ? (
              <p className="mt-1 text-sm text-slate-500">
                {selectedRooms
                  .map((room) => room.name || room.friendly_number)
                  .join(", ")}
              </p>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Floor finish</span>
              <select
                className="input mt-2 w-full"
                value={finishId}
                onChange={(event) => setFinishId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {(state?.definitions || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.original_tag ? `${item.original_tag} — ` : ""}
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {!selectedZone ? <label className="block"><span className="text-sm font-semibold">NRM measurement basis</span><select className="input mt-2 w-full" value={measurementBasis} onChange={(event) => setMeasurementBasis(event.target.value as "auto" | "area" | "linear")}><option value="auto">Automatic — 600 mm width rule</option><option value="area">Area — m²</option><option value="linear">Linear — m</option></select></label> : null}
            {!selectedZone && measurementBasis !== "auto" ? <label className="block"><span className="text-sm font-semibold">Override reason</span><input className="input mt-2 w-full" value={measurementReason} onChange={(event) => setMeasurementReason(event.target.value)} placeholder="Why is the basis overridden?" /></label> : null}
            <label className="block">
              <span className="text-sm font-semibold">Waste percentage</span>
              <input
                className="input mt-2 w-full"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={waste}
                onChange={(event) => setWaste(event.target.value)}
              />
            </label>
            <Button
              className="w-full"
              disabled={!selectedRoomIds.size || saving || (!selectedZone && measurementBasis !== "auto" && !measurementReason.trim())}
              onClick={() => void applyFinish()}
            >
              {finishId ? "Apply and confirm" : "Clear assignment"}
            </Button>
            {selectedAssignment ? (
              <Button
                className="w-full"
                variant="secondary"
                disabled={!selectedAssignment.finish_id || saving}
                onClick={() =>
                  void act(() =>
                    confirmFinishAssignments(
                      projectId,
                      [selectedAssignment.id],
                      "selected",
                      floorId,
                    ),
                  )
                }
              >
                Confirm current assignment
              </Button>
            ) : null}
          </div>

          {selectedAssignment ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <Metric label="Status" value={selectedAssignment.status.replace("_", " ")} />
              <Metric label="BOQ measured quantity" value={`${Number(selectedAssignment.nrm_quantity || 0).toFixed(2)} ${selectedAssignment.measurement_unit}`} />
              <Metric label="Measurement basis" value={selectedAssignment.measurement_basis} />
              <Metric label="Net area" value={`${Number(selectedAssignment.net_area_m2 || 0).toFixed(2)} m²`} />
              <Metric
                label="Procurement order area"
                value={`${Number(selectedAssignment.order_area_m2 || 0).toFixed(2)} m²`}
              />
              {selectedAssignment.tile_count != null ? (
                <Metric label="Tiles" value={String(selectedAssignment.tile_count)} />
              ) : null}
              <Metric
                label="Confidence"
                value={`${selectedAssignment.confidence_label}${selectedAssignment.confidence != null ? ` · ${Math.round(selectedAssignment.confidence * 100)}%` : ""}`}
              />
              <Metric
                label="Source"
                value={selectedAssignment.assignment_method.replaceAll("_", " ")}
              />
            </div>
          ) : null}

          {selectedRoom?.evidence.length ? (
            <div className="mt-5">
              <p className="text-sm font-semibold">Detected evidence</p>
              <div className="mt-2 space-y-2">
                {selectedRoom.evidence.map((item) => (
                  <div
                    key={item.id}
                    className={
                      item.accepted
                        ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs"
                        : "rounded-lg border border-slate-200 p-3 text-xs"
                    }
                  >
                    <div className="flex justify-between gap-2">
                      <strong>{item.evidence_type.replaceAll("_", " ")}</strong>
                      <span>
                        {item.confidence != null
                          ? `${Math.round(item.confidence * 100)}%`
                          : "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {item.value_text || item.source_text || "Saved evidence"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {selectedRoom?.zones.length ? (
            <div className="mt-5">
              <p className="text-sm font-semibold">Finish zones</p>
              <div className="mt-2 space-y-2">
                {selectedRoom.zones.map((zone) => (
                  <div
                    key={zone.id}
                    className="rounded-lg border border-slate-200 p-3 text-xs"
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedZoneId(zone.id)}
                    >
                      <strong>{zone.name}</strong>
                      <span className="float-right">
                        {Number(zone.net_area_m2 || 0).toFixed(2)} m²
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mt-2 font-semibold text-red-600"
                      onClick={() =>
                        floorId &&
                        void act(() =>
                          deleteCanonicalFinishZone(
                            projectId,
                            floorId,
                            selectedRoom.id,
                            zone.id,
                          ),
                        )
                      }
                    >
                      Delete zone
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setShowLibrary((value) => !value)}>
              Finish library
            </Button>
            <Button variant="secondary" onClick={() => setShowHistory((value) => !value)}>
              History
            </Button>
          </div>

          {showLibrary ? (
            <FinishLibrary
              definitions={state?.definitions || []}
              draft={definitionDraft}
              editingId={editingFinish}
              saving={saving}
              onDraft={setDefinitionDraft}
              onSave={() => void saveDefinition()}
              onEdit={editDefinition}
              onDuplicate={(item) => {
                setEditingFinish(null);
                setDefinitionDraft({
                  ...emptyDraft,
                  original_tag: item.original_tag ? `${item.original_tag}-COPY` : "",
                  name: `${item.name} Copy`,
                  description: item.description || "",
                  material_category: item.material_category || "",
                  material: item.material || "",
                  tile_width_mm: item.tile_width_mm,
                  tile_length_mm: item.tile_length_mm,
                  thickness_mm: item.thickness_mm,
                  display_colour: item.display_colour,
                  surface_finish: item.surface_finish || "",
                  pattern: item.pattern || "",
                  manufacturer: item.manufacturer || "",
                  product_code: item.product_code || "",
                  work_type: "floor_finish",
                  nrm_work_section: item.nrm_work_section,
                  nrm_item: item.nrm_item,
                  bedding: item.bedding || "",
                  underlay_reference: item.underlay_reference || "",
                  internal_external: item.internal_external,
                  measurement_basis: item.measurement_basis,
                  default_waste_percent: item.default_waste_percent,
                });
              }}
              onDeactivate={(item) =>
                void act(() => deactivateFinishDefinition(projectId, item.id))
              }
              onCancel={() => {
                setEditingFinish(null);
                setDefinitionDraft(emptyDraft);
              }}
            />
          ) : null}

          {showHistory ? (
            <div className="mt-5">
              <p className="text-sm font-semibold">Change history</p>
              <div className="mt-2 space-y-2">
                {(historyQuery.data?.history || []).slice(0, 20).map((item, index) => (
                  <div key={String(item.id || index)} className="rounded-lg border border-slate-200 p-3 text-xs">
                    <strong className="capitalize">{String(item.action || "change").replaceAll("_", " ")}</strong>
                    <p className="mt-1 text-slate-500">
                      {item.created_at ? new Date(String(item.created_at)).toLocaleString() : ""}
                    </p>
                    {item.action !== "restore" ? (
                      <button
                        type="button"
                        className="mt-2 font-semibold text-blue-600"
                        onClick={() =>
                          void act(() =>
                            restoreFinishHistory(
                              projectId,
                              String(item.id),
                              "Restored from finish history",
                            ),
                          )
                        }
                      >
                        Restore this change
                      </button>
                    ) : null}
                  </div>
                ))}
                {historyQuery.data && !historyQuery.data.history.length ? (
                  <p className="text-xs text-slate-500">No finish changes yet.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {error || query.error ? (
            <div className="mt-5">
              <ErrorMessage
                message={
                  error ||
                  (query.error instanceof Error
                    ? query.error.message
                    : "Floor finishes could not be loaded.")
                }
              />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-200 py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right capitalize">{value}</strong>
    </div>
  );
}

function FinishLibrary({
  definitions,
  draft,
  editingId,
  saving,
  onDraft,
  onSave,
  onEdit,
  onDuplicate,
  onDeactivate,
  onCancel,
}: {
  definitions: FinishDefinition[];
  draft: FinishDefinitionPayload;
  editingId: string | null;
  saving: boolean;
  onDraft: (value: FinishDefinitionPayload) => void;
  onSave: () => void;
  onEdit: (value: FinishDefinition) => void;
  onDuplicate: (value: FinishDefinition) => void;
  onDeactivate: (value: FinishDefinition) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 border-t border-slate-200 pt-5">
      <p className="text-sm font-semibold">
        {editingId ? "Edit finish" : "Add finish"}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          className="input"
          placeholder="Tag"
          value={draft.original_tag || ""}
          onChange={(event) => onDraft({ ...draft, original_tag: event.target.value })}
        />
        <input
          className="input"
          type="color"
          aria-label="Display colour"
          value={draft.display_colour || "#60a5fa"}
          onChange={(event) => onDraft({ ...draft, display_colour: event.target.value })}
        />
        <input
          className="input col-span-2"
          placeholder="Finish name"
          value={draft.name}
          onChange={(event) => onDraft({ ...draft, name: event.target.value })}
        />
        <input
          className="input col-span-2"
          placeholder="Material"
          value={draft.material || ""}
          onChange={(event) => onDraft({ ...draft, material: event.target.value })}
        />
        <input
          className="input col-span-2"
          type="number"
          min={0.1}
          placeholder="Finish thickness mm"
          value={draft.thickness_mm ?? ""}
          onChange={(event) => onDraft({ ...draft, thickness_mm: event.target.value ? Number(event.target.value) : null })}
        />
        <input
          className="input"
          type="number"
          placeholder="Tile width mm"
          value={draft.tile_width_mm ?? ""}
          onChange={(event) =>
            onDraft({
              ...draft,
              tile_width_mm: event.target.value ? Number(event.target.value) : null,
            })
          }
        />
        <input
          className="input"
          type="number"
          placeholder="Tile length mm"
          value={draft.tile_length_mm ?? ""}
          onChange={(event) =>
            onDraft({
              ...draft,
              tile_length_mm: event.target.value ? Number(event.target.value) : null,
            })
          }
        />
        <input
          className="input col-span-2"
          type="number"
          min={0}
          max={100}
          placeholder="Default waste %"
          value={draft.default_waste_percent ?? 0}
          onChange={(event) =>
            onDraft({
              ...draft,
              default_waste_percent: Number(event.target.value || 0),
            })
          }
        />
        <textarea
          className="input col-span-2 min-h-20 py-2"
          placeholder="Description"
          value={draft.description || ""}
          onChange={(event) => onDraft({ ...draft, description: event.target.value })}
        />
        <details className="col-span-2 rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">More details and NRM2</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">NRM2: WS{draft.nrm_work_section || "28"} / Item {draft.nrm_item || "2"} · Floor finish</div>
            <input className="input col-span-2" placeholder="Bedding or adhesive" value={draft.bedding || ""} onChange={(event) => onDraft({ ...draft, bedding: event.target.value })} />
            <input className="input col-span-2" placeholder="Underlay reference" value={draft.underlay_reference || ""} onChange={(event) => onDraft({ ...draft, underlay_reference: event.target.value })} />
            <select className="input" value={draft.internal_external || "both"} onChange={(event) => onDraft({ ...draft, internal_external: event.target.value as "internal" | "external" | "both" })}><option value="both">Internal and external</option><option value="internal">Internal</option><option value="external">External</option></select>
            <select className="input" value={draft.measurement_basis || "auto"} onChange={(event) => onDraft({ ...draft, measurement_basis: event.target.value as "auto" | "area" | "linear" })}><option value="auto">Automatic basis</option><option value="area">Area (m²)</option><option value="linear">Linear (m)</option></select>
            <input className="input col-span-2" placeholder="Surface finish / texture" value={draft.surface_finish || ""} onChange={(event) => onDraft({ ...draft, surface_finish: event.target.value })} />
          </div>
        </details>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button disabled={saving || !draft.name.trim()} onClick={onSave}>
          {editingId ? "Save finish" : "Add finish"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Clear
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {definitions.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/10"
                style={{ backgroundColor: item.display_colour }}
              />
              <div className="min-w-0 flex-1">
                <strong>
                  {item.original_tag ? `${item.original_tag} — ` : ""}
                  {item.name}
                </strong>
                <p className="mt-1 text-slate-500">
                  NRM WS{item.nrm_work_section}/{item.nrm_item} · {item.measurement_basis} · {item.assignment_count} assignment{item.assignment_count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 font-semibold">
              <button type="button" className="text-blue-600" onClick={() => onEdit(item)}>
                Edit
              </button>
              <button type="button" className="text-blue-600" onClick={() => onDuplicate(item)}>
                Duplicate
              </button>
              <button type="button" className="text-red-600" onClick={() => onDeactivate(item)}>
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
