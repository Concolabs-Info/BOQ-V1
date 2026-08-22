"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QuantoPageShell } from "./QuantoPageShell";
import { DemoDrawing } from "./components/DemoDrawing";
import { DemoChat } from "./components/DemoChat";
import {
  ResizableThreePane,
  ResizableTwoPane,
} from "./components/ResizablePanels";
import {
  ElementEditorDialog,
  type ElementFormField,
  type ElementFormValues,
} from "./components/ElementEditorDialog";
import {
  OpeningOverlays,
  RoofOverlays,
  WallOverlays,
  ZoneOverlays,
} from "./components/ElementOverlays";
import { useDemoStore } from "@/features/demo/store";
import { appRoutes } from "@/shared/constants/appRoutes";
import type {
  DemoStatus,
  Point,
  RoofZone,
  Wall,
  Zone,
} from "@/features/demo/types";
import {
  roofNetAreaM2,
  roofUpstandM,
  wallGrossAreaM2,
  wallNetAreaM2,
  wallOpeningDeductM2,
  wallFinishAreaM2,
  zoneNetAreaM2,
  floorFactor,
  floorName,
  openingFamily,
  scaleForViewport,
} from "@/features/demo/builders";
import { distance } from "@/features/demo/geometry";
import { StructuralTakeoff } from "./StructuralTakeoff";
import type { StructuralElement } from "./structuralTypes";
import { SpecialTakeoff } from "./SpecialTakeoff";
import type { SpecialElement } from "./specialTypes";
import { copilotQuestionPending } from "./copilot/demoCopilot";
import { useDrawingZoom } from "@/features/drawing/components/DrawingCanvas";
import {
  MeasurementOverlay,
  useMeasurementTool,
} from "./measurements/MeasurementOverlay";
import { beginLiveEdit } from "./editing/editSessionStore";
import {
  MATTEGODA_FLOOR_AREAS,
  MATTEGODA_MASONRY,
  MATTEGODA_OPENING_SCHEDULE,
  type WorkbookSourceStatus,
} from "@/features/demo/mattegodaWorkbookData";

const elementNames: Record<string, string> = {
  beams: "Beams",
  columns: "Columns",
  slab: "Slab",
  floor: "Floor",
  ceiling: "Ceiling",
  roof: "Roof",
  "stairs-ramps": "Stairs & Ramps",
  "doors-windows": "Doors & Windows",
  doors: "Doors",
  windows: "Windows",
  walls: "Walls",
  foundation: "Foundation",
};
const planned = new Set([
  "columns",
  "beams",
  "slab",
  "doors-windows",
  "doors",
  "windows",
  "floor",
  "walls",
  "ceiling",
  "roof",
  "stairs-ramps",
  "foundation",
]);
const viewportsByElement: Record<string, string[]> = {
  "doors-windows": [
    "VP-GROUND",
    "VP-FIRST",
    "VP-TYP",
    "VP-TERRACE",
    "VP-ROOF",
  ],
  doors: ["VP-GROUND", "VP-FIRST", "VP-TYP", "VP-TERRACE", "VP-ROOF"],
  windows: ["VP-GROUND", "VP-FIRST", "VP-TYP", "VP-TERRACE", "VP-ROOF"],
  floor: ["VP-GROUND", "VP-FIRST", "VP-TYP", "VP-TERRACE", "VP-ROOF"],
  walls: [
    "VP-GROUND",
    "VP-FIRST",
    "VP-TYP",
    "VP-TERRACE",
    "VP-ROOF",
  ],
  ceiling: ["VP-GROUND", "VP-FIRST", "VP-TYP", "VP-TERRACE", "VP-ROOF"],
  roof: ["VP-TERRACE", "VP-ROOF"],
};
export function TakeoffPage({
  projectId,
  element,
  view,
}: {
  projectId: string;
  element: string;
  view: string;
}) {
  const name = elementNames[element] || element;
  return (
    <QuantoPageShell
      projectId={projectId}
      title={name}
      subtitle={
        planned.has(element)
          ? "Review, correct and quantify this element"
          : "This element is listed in the workflow, but its detailed workspace is not available yet."
      }
    >
      <TakeoffTabs projectId={projectId} element={element} view={view} />
      {isStructuralElement(element) ? (
        <StructuralTakeoff
          projectId={projectId}
          element={element}
          view={view}
        />
      ) : isSpecialElement(element) ? (
        <SpecialTakeoff projectId={projectId} element={element} view={view} />
      ) : !planned.has(element) ? (
        <Unplanned name={name} />
      ) : view === "workbook" ? (
        <WorkbookView projectId={projectId} element={element} />
      ) : view === "3d" ? (
        <SceneView projectId={projectId} element={element} />
      ) : (
        <DimensionView projectId={projectId} element={element} />
      )}
    </QuantoPageShell>
  );
}
function TakeoffTabs({
  projectId,
  element,
  view,
}: {
  projectId: string;
  element: string;
  view: string;
}) {
  return (
    <div className="mb-4 flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
      {["dimension", "workbook", "3d"].map((v) => (
        <Link
          key={v}
          href={appRoutes.takeoff(projectId, element, v)}
          className={
            view === v
              ? "rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold capitalize text-white"
              : "rounded-xl px-5 py-2.5 text-sm font-semibold capitalize text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          }
        >
          {v === "3d" ? "3D" : v}
        </Link>
      ))}
    </div>
  );
}
function Unplanned({ name }: { name: string }) {
  return (
    <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
      <div className="max-w-lg text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xl">
          ＋
        </div>
        <h3 className="mt-5 text-xl font-semibold">{name}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The navigation position is included in Quanto. The detailed Dimension,
          Workbook and 3D behaviour is intentionally left for the next design
          pass, matching the supplied UI plan.
        </p>
      </div>
    </div>
  );
}
function isSpecialElement(element: string): element is SpecialElement {
  return element === "stairs-ramps" || element === "foundation";
}

type Mode = "select" | "pan" | "measure" | "draw";
type SnapPreview = { point: Point; label: string };
const toolClass =
  "list-none rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50";
const activeTool =
  "list-none rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white";
function DimensionView({
  projectId,
  element,
}: {
  projectId: string;
  element: string;
}) {
  const search = useSearchParams();
  const st = useDemoStore();
  const viewports = st.viewports,
    selectedViewportId = st.selectedViewportId,
    setViewport = st.setSelectedViewport,
    selectedEntityId = st.selectedEntityId,
    setSelected = st.setSelectedEntity,
    leftCollapsed = st.leftCollapsed,
    setLeftCollapsed = st.setLeftCollapsed;
  const [leftTab, setLeftTab] = useState<"viewports" | "families">("viewports");
  const [mode, setMode] = useState<Mode>("select");
  const [shape, setShape] = useState<"line" | "box" | "polyline">(
    element === "walls" ? "line" : "box",
  );
  const [sign, setSign] = useState<"add" | "remove">("add");
  const [draft, setDraft] = useState<Point[]>([]);
  const [drawHover, setDrawHover] = useState<Point | null>(null);
  const [measureMode, setMeasureMode] = useState<
    "horizontal" | "vertical" | "any"
  >("any");
  const [snap, setSnapState] = useState(false);
  const [snapTarget, setSnapTarget] = useState<SnapPreview | null>(null);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showDrawing, setShowDrawing] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [addElementOpen, setAddElementOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<ElementFormValues | null>(null);
  const altPressed = useRef(false);
  const canvasScale = useRef(1);
  useEffect(() => {
    setSnapState(window.localStorage.getItem("quanto.snap.enabled") === "true");
  }, []);
  useEffect(() => {
    if (!pendingAdd) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPendingAdd(null); setDraft([]); setMode("select");
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [pendingAdd]);
  function setSnap(value: boolean | ((current: boolean) => boolean)) {
    setSnapState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      window.localStorage.setItem("quanto.snap.enabled", String(next));
      return next;
    });
  }
  const familyParam = search.get("family");
  const entityParam = search.get("entity");
  const defaultFamily = familyParam || familyIdsFor(element)[0] || "";
  const [activeFamily, setActiveFamily] = useState(defaultFamily);
  const allowed = viewportsByElement[element] || [];
  const viewport = useMemo(
    () =>
      viewports.find(
        (v) => v.id === selectedViewportId && allowed.includes(v.id),
      ) || viewports.find((v) => v.id === allowed[0])!,
    [allowed.join("|"), selectedViewportId, viewports],
  );
  const measurement = useMeasurementTool({
    viewportId: element === "walls" ? `walls:${viewport.id}` : viewport.id,
    scale: viewport.scaleMPerPx || 0.018,
    active: mode === "measure",
    deleteEnabled: mode === "select" || mode === "measure",
    mode: measureMode,
  });
  useEffect(() => {
    if (selectedEntityId) measurement.clearSelection();
  }, [selectedEntityId]);
  useEffect(() => {
    if (viewport && selectedViewportId !== viewport.id)
      setViewport(viewport.id);
  }, [viewport?.id]);
  useEffect(() => {
    if (familyParam) setActiveFamily(familyParam);
  }, [familyParam]);
  useEffect(() => {
    if (!entityParam) return;
    const target = findEntityTarget(element, entityParam);
    if (target?.viewportId) setViewport(target.viewportId);
    if (target) setSelected(entityParam);
  }, [entityParam, element]);
  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (event.key === "Alt") altPressed.current = true;
    }
    function up(event: KeyboardEvent) {
      if (event.key === "Alt") altPressed.current = false;
    }
    function reset() {
      altPressed.current = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);
  function resolveSnap(
    point: Point,
    origin?: Point,
  ): { point: Point; target: SnapPreview | null } {
    if (!snap || altPressed.current) return { point, target: null };
    const candidates = snapCandidatePoints(element, viewport.id, point);
    let best: Point | undefined,
      bestD = Math.min(
        80,
        Math.max(2, 24 / Math.max(0.01, canvasScale.current)),
      );
    for (const candidate of candidates) {
      const candidateDistance = distance(candidate, point);
      if (candidateDistance < bestD) {
        best = candidate;
        bestD = candidateDistance;
      }
    }
    if (best)
      return {
        point: best,
        target: { point: best, label: snapLabel(element) },
      };
    return origin
      ? genericOrthogonalSnap(origin, point)
      : { point, target: null };
  }
  function click(raw: Point, scale = canvasScale.current) {
    canvasScale.current = scale;
    const origin =
      mode === "draw"
        ? shape === "polyline"
          ? draft[draft.length - 1]
          : draft[0]
        : undefined;
    const result = resolveSnap(raw, origin);
    const point = result.point;
    setSnapTarget(null);
    if (mode === "measure") {
      measurement.canvasClick(point);
      return;
    }
    if (mode === "draw") {
      if (
        shape === "polyline" &&
        draft.length >= 3 &&
        distance(point, draft[0]) <= Math.max(6, 14 / Math.max(0.01, scale))
      ) {
        finish(draft);
        return;
      }
      setDraft((d) => [...d, point]);
    }
  }
  function finish(points = draft) {
    st.captureGeometryUndo();
    if (isOpeningElement(element) && points.length >= 2) {
      const a = points[0], b = points[points.length - 1];
      const requested =
        element === "doors"
          ? "door"
          : element === "windows"
            ? "window"
            : undefined;
      const f =
        st.openingFamilies.find(
          (x) =>
            x.id === activeFamily && (!requested || x.parent === requested),
        ) ||
        st.openingFamilies.find((x) => !requested || x.parent === requested)!;
      const floorId = pendingAdd ? String(pendingAdd.floorId) : floorForViewport(viewport.id);
      const id = pendingAdd ? String(pendingAdd.id) : `OP-${Date.now()}`;
      st.addOpening({
        id,
        familyId: pendingAdd ? String(pendingAdd.familyId) : f.id,
        kind: f.parent,
        floorId,
        viewportId: viewport.id,
        bbox: {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.max(18, Math.abs(a.x - b.x)),
          height: Math.max(18, Math.abs(a.y - b.y)),
        },
        hostWallId: pendingAdd && String(pendingAdd.hostWallId || "") ? String(pendingAdd.hostWallId) : undefined,
        status: pendingAdd ? String(pendingAdd.status) as DemoStatus : "ready",
      });
      setSelected(id);
    } else if (
      (element === "floor" || element === "ceiling") &&
      points.length >= 2
    ) {
      const kind = element as "floor" | "ceiling";
      const boundary =
        shape === "box" ? boxPoints(points[0], points[points.length - 1]) : points;
      if (sign === "remove") {
        const zones = (
          kind === "floor"
            ? useDemoStore.getState().floorZones
            : useDemoStore.getState().ceilingZones
        ).filter((z) => z.viewportId === viewport.id);
        const host = zones.find((z) => z.id === selectedEntityId) || zones[0];
        if (host)
          st.updateZone(kind, host.id, { deducts: [...host.deducts, boundary] });
      } else if (boundary.length >= 3) {
        const id = pendingAdd ? String(pendingAdd.id) : `${kind === "floor" ? "FZ" : "CZ"}-${Date.now()}`;
        st.addZone(kind, {
          id,
          kind,
          familyId: pendingAdd ? String(pendingAdd.familyId) : activeFamily || familyIdsFor(element)[0],
          floorId: pendingAdd ? String(pendingAdd.floorId) : floorForViewport(viewport.id),
          viewportId: viewport.id,
          points: boundary,
          deducts: [],
          room: pendingAdd ? String(pendingAdd.room) : "Added zone",
          status: pendingAdd ? String(pendingAdd.status) as DemoStatus : "ready",
        });
        setSelected(id);
      }
    } else if (element === "walls" && points.length >= 2) {
      const id = pendingAdd ? String(pendingAdd.id) : `W-${Date.now()}`;
      st.addWall({
        id,
        familyId: pendingAdd ? String(pendingAdd.familyId) : st.wallFamilies.some((f) => f.id === activeFamily)
          ? activeFamily
          : st.wallFamilies[0]?.id || "M01",
        floorId: pendingAdd ? String(pendingAdd.floorId) : floorForViewport(viewport.id),
        viewportId: viewport.id,
        start: points[0],
        end: points[points.length - 1],
        heightM: pendingAdd ? Number(pendingAdd.heightM) : st.storeys.find((s) => s.id === floorForViewport(viewport.id))?.heightM || 3.35,
        side1Finish: pendingAdd ? String(pendingAdd.side1Finish) : "W01",
        side2Finish: pendingAdd ? String(pendingAdd.side2Finish) : "W01",
        status: pendingAdd ? String(pendingAdd.status) as DemoStatus : "ready",
      });
      setSelected(id);
    } else if (element === "roof" && points.length >= 2) {
      const boundary =
        shape === "box" ? boxPoints(points[0], points[points.length - 1]) : points;
      if (sign === "remove") {
        const zones = st.roofZones.filter((z) => z.viewportId === viewport.id);
        const host = zones.find((z) => z.id === selectedEntityId) || zones[0];
        if (host)
          st.updateRoofZone(host.id, { deducts: [...host.deducts, boundary] });
      } else if (boundary.length >= 3) {
        const id = pendingAdd ? String(pendingAdd.id) : `RZ-${Date.now()}`;
        st.addRoofZone({
          id,
          familyId: pendingAdd ? String(pendingAdd.familyId) : st.roofFamilies.some((f) => f.id === activeFamily)
            ? activeFamily
            : st.roofFamilies[0]?.id || "R01",
          upstandFamilyId: pendingAdd ? String(pendingAdd.upstandFamilyId) : "U01",
          scope: pendingAdd ? String(pendingAdd.scope) as "Terrace" | "Upper roof" : viewport.id === "VP-ROOF" ? "Upper roof" : "Terrace",
          floorId: "RF",
          viewportId: viewport.id,
          points: boundary,
          deducts: [],
          upstandEdges: boundary.map(() => true),
          status: pendingAdd ? String(pendingAdd.status) as DemoStatus : "ready",
        });
        setSelected(id);
      }
    }
    setDraft([]);
    setDrawHover(null);
    setPendingAdd(null);
    setMode("select");
  }
  function deleteSelected() {
    if (!selectedEntityId) return;
    st.captureGeometryUndo();
    if (st.openings.some((x) => x.id === selectedEntityId))
      st.deleteOpening(selectedEntityId);
    else if (st.floorZones.some((x) => x.id === selectedEntityId))
      st.deleteZone("floor", selectedEntityId);
    else if (st.ceilingZones.some((x) => x.id === selectedEntityId))
      st.deleteZone("ceiling", selectedEntityId);
    else if (st.walls.some((x) => x.id === selectedEntityId))
      st.deleteWall(selectedEntityId);
    else if (st.roofZones.some((x) => x.id === selectedEntityId))
      st.deleteRoofZone(selectedEntityId);
  }
  return (
    <>
      <ResizableThreePane
        storageKey={`takeoff:${element}:dimension`}
        defaultLeft={235}
        defaultRight={330}
        collapsedLeft={leftCollapsed}
        className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <aside className="relative border-r border-slate-200">
          <button
            type="button"
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 shadow-sm"
          >
            {leftCollapsed ? "›" : "‹"}
          </button>
          {leftCollapsed ? null : (
            <>
              <div className="grid grid-cols-2 border-b border-slate-200 p-2 pr-12">
                <button
                  onClick={() => setLeftTab("viewports")}
                  className={
                    leftTab === "viewports"
                      ? "rounded-lg bg-slate-950 px-2 py-2 text-xs font-semibold text-white"
                      : "rounded-lg px-2 py-2 text-xs font-semibold text-slate-500"
                  }
                >
                  Viewports
                </button>
                <button
                  onClick={() => setLeftTab("families")}
                  className={
                    leftTab === "families"
                      ? "rounded-lg bg-slate-950 px-2 py-2 text-xs font-semibold text-white"
                      : "rounded-lg px-2 py-2 text-xs font-semibold text-slate-500"
                  }
                >
                  Families
                </button>
              </div>
              {leftTab === "viewports" ? (
                <ViewportList
                  allowed={allowed}
                  selected={viewport.id}
                  onSelect={setViewport}
                />
              ) : (
                <FamilyList
                  element={element}
                  active={activeFamily}
                  onSelect={setActiveFamily}
                />
              )}
            </>
          )}
        </aside>
        <main className="min-w-0 bg-slate-100 p-3">
          <DemoDrawing
            viewportId={viewport.id}
            tool={
              mode === "pan"
                ? "pan"
                : mode === "draw" || mode === "measure"
                  ? "draw"
                  : "select"
            }
            onCanvasClick={click}
            onCanvasDragStart={shape === "polyline" ? undefined : (point, scale) => {
              if (mode !== "draw" || !pendingAdd) return;
              canvasScale.current = scale; const start = resolveSnap(point).point; setDraft([start, start]);
            }}
            onCanvasDragMove={shape === "polyline" ? undefined : (point, scale) => {
              if (mode !== "draw" || !pendingAdd || draft.length < 2) return;
              canvasScale.current = scale; const end = resolveSnap(point, draft[0]).point;
              setDraft((current) => current.length ? [current[0], end] : current);
            }}
            onCanvasDragEnd={shape === "polyline" ? undefined : (point, scale) => {
              if (mode !== "draw" || !pendingAdd || draft.length < 2) return;
              canvasScale.current = scale; const end = resolveSnap(point, draft[0]).point;
              if (Math.max(Math.abs(end.x-draft[0].x), Math.abs(end.y-draft[0].y)) < 8) { setDraft([]); return; }
              finish([draft[0], end]);
            }}
            onCanvasMove={(point) => {
              if (mode === "measure") {
                const result = resolveSnap(point);
                setSnapTarget(result.target);
                measurement.canvasMove(result.point);
                return;
              }
              if (mode !== "draw") {
                setSnapTarget(null);
                setDrawHover(null);
                return;
              }
              const result = resolveSnap(point, shape === "polyline" ? draft[draft.length - 1] : undefined);
              setSnapTarget(result.target);
              setDrawHover(shape === "polyline" && draft.length ? result.point : null);
            }}
            showMinimap={showMinimap}
            showDrawing={showDrawing}
            toolbar={
              <DimensionToolbar
                element={element}
                mode={mode}
                setMode={(m) => {
                  setMode(m);
                  if (m === "draw" && ["floor", "ceiling", "roof"].includes(element)) {
                    setShape("polyline");
                    setSign("add");
                  }
                  if (m !== "draw") setPendingAdd(null);
                  setSnapTarget(null);
                  if (m !== "draw") setDraft([]);
                  if (m !== "draw") setDrawHover(null);
                  if (m !== "measure") measurement.clearDraft();
                }}
                measureMode={measureMode}
                setMeasureMode={setMeasureMode}
                snap={snap}
                setSnap={(value) => {
                  setSnap(value);
                  if (!value) setSnapTarget(null);
                }}
                onAddElement={() => setAddElementOpen(true)}
                onFinish={() => finish()}
                canFinish={
                  shape === "polyline" ? draft.length >= 3 : draft.length >= 2
                }
                onClear={() => {
                  setDraft([]);
                  setDrawHover(null);
                  measurement.clearDraft();
                  setSnapTarget(null);
                }}
                hidden={hidden}
                setHidden={setHidden}
                showDrawing={showDrawing}
                setShowDrawing={setShowDrawing}
              />
            }
            toolbarRight={
              <DimensionActions
                minimap={showMinimap}
                setMinimap={setShowMinimap}
                onUndo={st.undoGeometry}
                canUndo={st.geometryUndo.length > 0}
                onDelete={
                  !isOpeningElement(element) && measurement.selected
                    ? measurement.deleteSelected
                    : deleteSelected
                }
                canDelete={Boolean(
                  (!isOpeningElement(element) && measurement.selected) ||
                    selectedEntityId,
                )}
              />
            }
          >
            <g
              className="quanto-scaled-elements"
              pointerEvents={mode === "select" ? "auto" : "none"}
            >
              {isOpeningElement(element) ? (
                <OpeningOverlays
                  viewportId={viewport.id}
                  kind={
                    element === "doors"
                      ? "door"
                      : element === "windows"
                        ? "window"
                        : undefined
                  }
                  hiddenFamilies={hidden}
                />
              ) : element === "floor" ? (
                <ZoneOverlays
                  kind="floor"
                  viewportId={viewport.id}
                  hiddenFamilies={hidden}
                />
              ) : element === "walls" ? (
                <>
                  <WallOverlays
                    viewportId={viewport.id}
                    hiddenFamilies={hidden}
                  />
                  <OpeningOverlays viewportId={viewport.id} ghost />
                </>
              ) : element === "ceiling" ? (
                <ZoneOverlays
                  kind="ceiling"
                  viewportId={viewport.id}
                  hiddenFamilies={hidden}
                />
              ) : (
                <RoofOverlays
                  viewportId={viewport.id}
                  hiddenFamilies={hidden}
                />
              )}
            </g>
            {draft.length ? (
              <DraftOverlay
                points={shape === "polyline" && drawHover ? [...draft, drawHover] : draft}
                shape={shape}
                fixedPointCount={draft.length}
              />
            ) : null}
            {!isOpeningElement(element) ? (
              <MeasurementOverlay
                measurements={measurement.measurements}
                selectedId={measurement.selectedId}
                scale={viewport.scaleMPerPx || 0.018}
                editable={mode === "select" || mode === "measure"}
                previewStart={measurement.start}
                previewEnd={measurement.previewEnd}
              />
            ) : null}
            {snapTarget ? <GenericSnapIndicator target={snapTarget} /> : null}
          </DemoDrawing>
        </main>
        <aside className="border-l border-slate-200">
          <RightPane projectId={projectId} element={element} />
        </aside>
      </ResizableThreePane>
      <GenericAddElementDialog
        open={addElementOpen}
        element={element}
        currentViewportId={viewport.id}
        onClose={() => setAddElementOpen(false)}
        onPrepare={(values) => {
          const nextViewportId = String(values.viewportId);
          setViewport(nextViewportId); setActiveFamily(String(values.familyId)); setSelected(null);
          setPendingAdd(values);
          setShape(
            element === "walls"
              ? "line"
              : element === "floor" || element === "ceiling" || element === "roof"
                ? "polyline"
                : "box",
          );
          setSign("add"); setDraft([]); setDrawHover(null); setMode("draw");
          setAddElementOpen(false);
        }}
      />
    </>
  );
}

function GenericAddElementDialog({
  open,
  element,
  currentViewportId,
  onClose,
  onPrepare,
}: {
  open: boolean;
  element: string;
  currentViewportId: string;
  onClose: () => void;
  onPrepare: (values: ElementFormValues) => void;
}) {
  const st = useDemoStore();
  const allowed = viewportsByElement[element] || [];
  const viewportOptions = st.viewports
    .filter((viewport) => allowed.includes(viewport.id))
    .map((viewport) => ({
      value: viewport.id,
      label: `${viewport.name} · ${viewport.category}`,
    }));
  const familyOptions = familiesFor(element)
    .filter(
      (family: any) =>
        !isOpeningElement(element) ||
        element === "doors-windows" ||
        family.parent === (element === "doors" ? "door" : "window"),
    )
    .map((family: any) => ({
      value: family.id,
      label: `${family.mark} — ${family.description}`,
    }));
  const prefix = isOpeningElement(element)
    ? "OP"
    : element === "floor"
      ? "FZ"
      : element === "ceiling"
        ? "CZ"
        : element === "walls"
          ? "W"
          : "RZ";
  const generatedId = `${prefix}-${Date.now().toString().slice(-6)}`;
  const firstFamily = familyOptions[0]?.value || "";
  const currentFloor = floorForViewport(currentViewportId);
  const initialValues: ElementFormValues = {
    id: generatedId,
    familyId: firstFamily,
    viewportId: currentViewportId,
    floorId: element === "roof" ? "RF" : currentFloor,
    status: "ready",
    room: `New ${elementNames[element] || element}`,
    heightM:
      st.storeys.find((storey) => storey.id === currentFloor)?.heightM || 3.35,
    side1Finish: st.wallFinishFamilies[0]?.id || "",
    side2Finish: st.wallFinishFamilies[0]?.id || "",
    upstandFamilyId: st.upstandFamilies[0]?.id || "",
    scope: currentViewportId === "VP-ROOF" ? "Upper roof" : "Terrace",
    hostWallId: "",
  };
  const fields: ElementFormField[] = [
    {
      key: "id",
      label: "Element ID",
      required: true,
      section: "General",
      help: "Stable identifier used across Dimension, Workbook, 3D, Review and BOQ.",
    },
    {
      key: "familyId",
      label: "Family",
      type: "select",
      required: true,
      options: familyOptions,
      section: "General",
    },
    {
      key: "viewportId",
      label: "Drawing / viewport",
      type: "select",
      required: true,
      options: viewportOptions,
      section: "Location",
    },
    {
      key: "floorId",
      label: "Storey",
      type: "select",
      required: true,
      options: st.storeys.map((storey) => ({
        value: storey.id,
        label: storey.name,
      })),
      section: "Location",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [
        { value: "ready", label: "Ready" },
        { value: "needs_review", label: "Needs review" },
        { value: "confirmed", label: "Confirmed" },
      ],
      section: "Location",
    },
  ];
  if (isOpeningElement(element))
    fields.push({
      key: "hostWallId",
      label: "Host wall",
      type: "select",
      options: [
        { value: "", label: "Not assigned" },
        ...st.walls.map((wall) => ({
          value: wall.id,
          label: `${wall.id} · ${floorName(wall.floorId)}`,
        })),
      ],
      section: "Properties",
      help: "The host wall controls opening deductions.",
    });
  if (element === "floor" || element === "ceiling")
    fields.push({
      key: "room",
      label: "Room / scope name",
      required: true,
      section: "Properties",
    });
  if (element === "walls")
    fields.push(
      {
        key: "heightM",
        label: "Height (m)",
        type: "number",
        required: true,
        min: 0.1,
        step: 0.05,
        section: "Properties",
      },
      {
        key: "side1Finish",
        label: "Side 1 finish",
        type: "select",
        required: true,
        options: st.wallFinishFamilies.map((f) => ({
          value: f.id,
          label: `${f.mark} — ${f.description}`,
        })),
        section: "Properties",
      },
      {
        key: "side2Finish",
        label: "Side 2 finish",
        type: "select",
        required: true,
        options: st.wallFinishFamilies.map((f) => ({
          value: f.id,
          label: `${f.mark} — ${f.description}`,
        })),
        section: "Properties",
      },
    );
  if (element === "roof")
    fields.push(
      {
        key: "scope",
        label: "Roof scope",
        type: "select",
        required: true,
        options: [
          { value: "Terrace", label: "Terrace" },
          { value: "Upper roof", label: "Upper roof" },
        ],
        section: "Properties",
      },
      {
        key: "upstandFamilyId",
        label: "Upstand family",
        type: "select",
        required: true,
        options: st.upstandFamilies.map((f) => ({
          value: f.id,
          label: `${f.mark} — ${f.description}`,
        })),
        section: "Properties",
      },
    );
  const ids = [
    ...st.openings,
    ...st.floorZones,
    ...st.ceilingZones,
    ...st.walls,
    ...st.roofZones,
  ].map((item) => item.id);
  return (
    <ElementEditorDialog
      open={open}
      title={`Add ${elementNames[element] || element} element`}
      description="Choose the project family and location, then drag the element's actual geometry on the selected drawing. Press Escape to cancel."
      fields={fields}
      initialValues={initialValues}
      submitLabel="Start drawing"
      validate={(values) =>
        ids.includes(String(values.id).trim())
          ? { id: "This element ID already exists" }
          : ({} as Record<string, string>)
      }
      onClose={onClose}
      onSubmit={onPrepare}
    />
  );
}

function ViewportList({
  allowed,
  selected,
  onSelect,
}: {
  allowed: string[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const viewports = useDemoStore((s) => s.viewports);
  const vs = viewports.filter((v) => allowed.includes(v.id));
  return (
    <div className="space-y-2 p-3">
      {vs.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          className={
            selected === v.id
              ? "w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left"
              : "w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-200"
          }
        >
          <p className="text-sm font-semibold">{v.name}</p>
          <p className="mt-1 text-xs capitalize text-slate-500">{v.category}</p>
        </button>
      ))}
    </div>
  );
}
function FamilyList({
  element,
  active,
  onSelect,
}: {
  element: string;
  active: string;
  onSelect: (id: string) => void;
}) {
  const st = useDemoStore();
  const fams = familiesFor(element);
  const family = fams.find((f: any) => f.id === active) || fams[0];
  const [draft, setDraft] = useState<any>(family ? { ...family } : null);
  const [expandedId, setExpandedId] = useState<string | null>(
    active || family?.id || null,
  );
  useEffect(() => {
    const next =
      familiesFor(element).find((f: any) => f.id === active) ||
      familiesFor(element)[0];
    setDraft(next ? { ...next } : null);
  }, [
    active,
    element,
    st.openingFamilies,
    st.floorFamilies,
    st.ceilingFamilies,
    st.wallFamilies,
    st.wallFinishFamilies,
    st.roofFamilies,
    st.upstandFamilies,
  ]);
  useEffect(() => {
    if (active) setExpandedId(active);
  }, [active]);
  const groups = isOpeningElement(element)
    ? element === "doors-windows"
      ? [
          {
            label: "Doors",
            items: st.openingFamilies.filter((x) => x.parent === "door"),
          },
          {
            label: "Windows",
            items: st.openingFamilies.filter((x) => x.parent === "window"),
          },
        ]
      : [
          {
            label: element === "doors" ? "Doors" : "Windows",
            items: st.openingFamilies.filter(
              (x) => x.parent === (element === "doors" ? "door" : "window"),
            ),
          },
        ]
    : element === "walls"
      ? [
          { label: "Walls", items: st.wallFamilies },
          { label: "Finishes", items: st.wallFinishFamilies },
        ]
      : element === "roof"
        ? [
            { label: "Coverings", items: st.roofFamilies },
            { label: "Upstands", items: st.upstandFamilies },
          ]
        : [
            {
              label: element === "floor" ? "Floors" : "Ceilings",
              items:
                element === "floor" ? st.floorFamilies : st.ceilingFamilies,
            },
          ];
  function save() {
    if (!draft) return;
    if (isOpeningElement(element)) st.updateOpeningFamily(draft.id, draft);
    else if (element === "floor" || element === "ceiling")
      st.updateFinishFamily(element, draft.id, draft);
    else if (element === "walls") {
      if (st.wallFamilies.some((x) => x.id === draft.id))
        st.updateWallFamily(draft.id, draft);
      else st.updateWallFinishFamily(draft.id, draft);
    } else if (element === "roof") {
      if (st.roofFamilies.some((x) => x.id === draft.id))
        st.updateRoofFamily(draft.id, draft);
      else st.updateUpstandFamily(draft.id, draft);
    }
  }
  function nextId(prefix: string, ids: string[]) {
    let n = 1;
    while (
      ids.includes(`${prefix}${String(n).padStart(2, "0")}`) ||
      ids.includes(`${prefix}${n}`)
    )
      n++;
    return `${prefix}${String(n).padStart(2, "0")}`;
  }
  function create(kind: string) {
    if (isOpeningElement(element)) {
      const parent =
        kind === "window" || element === "windows" ? "window" : "door";
      const prefix = parent === "door" ? "D" : "W";
      const id = nextId(
        prefix,
        st.openingFamilies.map((x) => x.id),
      );
      st.addOpeningFamily({
        id,
        parent,
        mark: id,
        description: `New ${parent} family`,
        widthMm: 900,
        heightMm: 2100,
        thicknessMm: 40,
        material: "To be confirmed",
        fittings: "To be confirmed",
        source: "User created",
        color: parent === "door" ? "#6366f1" : "#14b8a6",
      });
      onSelect(id);
      return;
    }
    if (element === "floor" || element === "ceiling") {
      const prefix = element === "floor" ? "F" : "C";
      const source =
        element === "floor" ? st.floorFamilies : st.ceilingFamilies;
      const id = nextId(
        prefix,
        source.map((x) => x.id),
      );
      st.addFinishFamily(element, {
        id,
        kind: element,
        mark: id,
        description: `New ${element} family`,
        material: "To be confirmed",
        source: "User created",
        color: "#64748b",
        ...(element === "floor"
          ? { screed: "To be confirmed", falls: "Level" }
          : {}),
      });
      onSelect(id);
      return;
    }
    if (element === "walls") {
      if (kind === "finish") {
        const id = nextId(
          "W",
          st.wallFinishFamilies.map((x) => x.id),
        );
        st.addWallFinishFamily({
          id,
          mark: id,
          description: "New wall finish",
          material: "To be confirmed",
          thicknessMm: 15,
          source: "User created",
          color: "#64748b",
        });
        onSelect(id);
      } else {
        const id = nextId(
          "M",
          st.wallFamilies.map((x) => x.id),
        );
        st.addWallFamily({
          id,
          mark: id,
          description: "New wall family",
          thicknessMm: 115,
          classification: "Internal",
          material: "Masonry",
          color: "#64748b",
        });
        onSelect(id);
      }
      return;
    }
    if (element === "roof") {
      if (kind === "upstand") {
        const id = nextId(
          "U",
          st.upstandFamilies.map((x) => x.id),
        );
        st.addUpstandFamily({
          id,
          mark: id,
          description: "New roof upstand",
          heightMm: 300,
          source: "User created",
          color: "#64748b",
        });
        onSelect(id);
      } else {
        const id = nextId(
          "R",
          st.roofFamilies.map((x) => x.id),
        );
        st.addRoofFamily({
          id,
          mark: id,
          description: "New roof covering",
          layers: "To be confirmed",
          falls: "To outlets",
          source: "User created",
          color: "#64748b",
        });
        onSelect(id);
      }
    }
  }
  const sourceViewport =
    element === "ceiling"
      ? "VP-FIRST"
      : element === "floor"
        ? "VP-FIRST"
      : element === "roof"
      ? "VP-SCHED"
      : element === "walls"
        ? "VP-SCHED"
        : "VP-SCHED";
  return (
    <div className="p-3">
      {groups.map((group) => (
        <div key={group.label} className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.label}
            </p>
            <button
              type="button"
              onClick={() =>
                create(
                  isOpeningElement(element)
                    ? group.label === "Windows"
                      ? "window"
                      : "door"
                    : element === "walls"
                      ? group.label === "Finishes"
                        ? "finish"
                        : "wall"
                      : element === "roof"
                        ? group.label === "Upstands"
                          ? "upstand"
                          : "covering"
                        : element,
                )
              }
              className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              + New
            </button>
          </div>
          <div className="space-y-2">
            {group.items.map((f: any) => {
              const open = expandedId === f.id;
              return (
                <div
                  key={f.id}
                  className={
                    open
                      ? "overflow-hidden rounded-xl border border-blue-200 bg-blue-50/40"
                      : "overflow-hidden rounded-xl border border-slate-200 bg-white"
                  }
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      onSelect(f.id);
                      setExpandedId((current) =>
                        current === f.id ? null : f.id,
                      );
                    }}
                    className="w-full p-3 text-left hover:bg-blue-50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: f.color }}
                      />
                      <span className="min-w-0 flex-1 text-sm font-semibold">
                        {f.mark}
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        {open ? "⌃" : "⌄"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 pr-5 text-xs text-slate-500">
                      {f.description}
                    </p>
                  </button>
                  {open && draft?.id === f.id ? (
                    <StandardFamilyEditor
                      draft={draft}
                      setDraft={setDraft}
                      onSave={save}
                      onShowSource={() =>
                        st.setSelectedViewport(sourceViewport)
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
function StandardFamilyEditor({
  draft,
  setDraft,
  onSave,
  onShowSource,
}: {
  draft: any;
  setDraft: (value: any) => void;
  onSave: () => void;
  onShowSource: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-blue-100 bg-white p-3">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          General
        </p>
        <div className="space-y-2">
          <MiniInput
            label="Name"
            value={draft.mark || ""}
            onChange={(v) => setDraft({ ...draft, mark: v })}
          />
          <MiniInput
            label="Description"
            value={draft.description || ""}
            onChange={(v) => setDraft({ ...draft, description: v })}
          />
        </div>
      </div>
      {"widthMm" in draft ||
      "thicknessMm" in draft ||
      ("heightMm" in draft && !("widthMm" in draft)) ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Dimensions
          </p>
          <div className="space-y-2">
            {"widthMm" in draft ? (
              <>
                <MiniInput
                  label="Width (mm)"
                  type="number"
                  value={String(draft.widthMm || 0)}
                  onChange={(v) => setDraft({ ...draft, widthMm: Number(v) })}
                />
                <MiniInput
                  label="Height (mm)"
                  type="number"
                  value={String(draft.heightMm || 0)}
                  onChange={(v) => setDraft({ ...draft, heightMm: Number(v) })}
                />
              </>
            ) : null}
            {"thicknessMm" in draft ? (
              <MiniInput
                label="Thickness (mm)"
                type="number"
                value={String(draft.thicknessMm || 0)}
                onChange={(v) => setDraft({ ...draft, thicknessMm: Number(v) })}
              />
            ) : null}
            {"heightMm" in draft && !("widthMm" in draft) ? (
              <MiniInput
                label="Height (mm)"
                type="number"
                value={String(draft.heightMm || 0)}
                onChange={(v) => setDraft({ ...draft, heightMm: Number(v) })}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Details
        </p>
        <div className="space-y-2">
          {"material" in draft ? (
            <MiniInput
              label="Material"
              value={draft.material || ""}
              onChange={(v) => setDraft({ ...draft, material: v })}
            />
          ) : null}
          {"classification" in draft ? (
            <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
              <span>Classification</span>
              <select
                className="input w-full min-w-0"
                value={draft.classification}
                onChange={(e) =>
                  setDraft({ ...draft, classification: e.target.value })
                }
              >
                <option>External</option>
                <option>Internal</option>
              </select>
            </label>
          ) : null}
          {"screed" in draft ? (
            <MiniInput
              label="Screed"
              value={draft.screed || ""}
              onChange={(v) => setDraft({ ...draft, screed: v })}
            />
          ) : null}
          {"falls" in draft ? (
            <MiniInput
              label="Falls"
              value={draft.falls || ""}
              onChange={(v) => setDraft({ ...draft, falls: v })}
            />
          ) : null}
          {"layers" in draft ? (
            <MiniInput
              label="Layers"
              value={draft.layers || ""}
              onChange={(v) => setDraft({ ...draft, layers: v })}
            />
          ) : null}
          {"fittings" in draft ? (
            <MiniInput
              label="Fittings"
              value={draft.fittings || ""}
              onChange={(v) => setDraft({ ...draft, fittings: v })}
            />
          ) : null}
          {"source" in draft ? (
            <MiniInput
              label="Source"
              value={draft.source || ""}
              onChange={(v) => setDraft({ ...draft, source: v })}
            />
          ) : null}
        </div>
      </div>
      {"color" in draft ? (
        <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
          <span>Display colour</span>
          <input
            type="color"
            value={draft.color || "#64748b"}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
          />
        </label>
      ) : null}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={onSave}
          className="h-9 rounded-lg bg-slate-950 text-xs font-semibold text-white"
        >
          Save family
        </button>
        <button
          type="button"
          onClick={onShowSource}
          className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-blue-600"
        >
          Source
        </button>
      </div>
    </div>
  );
}
function MiniInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
      <span>{label}</span>
      <input
        className="input w-full min-w-0"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function DimensionToolbar({
  element,
  mode,
  setMode,
  measureMode,
  setMeasureMode,
  snap,
  setSnap,
  onAddElement,
  onFinish,
  canFinish,
  onClear,
  hidden,
  setHidden,
  showDrawing,
  setShowDrawing,
}: {
  element: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  measureMode: "horizontal" | "vertical" | "any";
  setMeasureMode: (s: "horizontal" | "vertical" | "any") => void;
  snap: boolean;
  setSnap: (v: boolean) => void;
  onAddElement: () => void;
  onFinish: () => void;
  canFinish: boolean;
  onClear: () => void;
  hidden: Set<string>;
  setHidden: (s: Set<string>) => void;
  showDrawing: boolean;
  setShowDrawing: (v: boolean) => void;
}) {
  const fams = familiesFor(element);
  const [openMenu, setOpenMenu] = useState<"measure" | "layers" | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const drawsAreaPolygon = ["floor", "ceiling", "roof"].includes(element);
  useEffect(() => {
    if (!openMenu) return;
    const close = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [openMenu]);
  return (
    <div ref={toolbarRef} className="flex flex-wrap items-center gap-1">
      <button
        onClick={() => setMode("select")}
        className={mode === "select" ? activeTool : toolClass}
      >
        Select
      </button>
      <button
        title="Pan the drawing. Use Select to move elements."
        onClick={() => setMode("pan")}
        className={mode === "pan" ? activeTool : toolClass}
      >
        Hand
      </button>
      <button
        type="button"
        onClick={onAddElement}
        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
      >
        ＋ Add element
      </button>
      {!isOpeningElement(element) ? (
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenMenu((current) =>
                current === "measure" ? null : "measure",
              )
            }
            className={mode === "measure" ? activeTool : toolClass}
          >
            Measure
          </button>
          {openMenu === "measure" ? (
            <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {(["horizontal", "vertical", "any"] as const).map((x) => (
                <button
                  key={x}
                  onClick={() => {
                    setMeasureMode(x);
                    setMode("measure");
                    setOpenMenu(null);
                  }}
                  className={
                    measureMode === x && mode === "measure"
                      ? "w-full rounded-lg bg-blue-50 px-3 py-2 text-left text-xs font-semibold capitalize text-blue-700"
                      : "w-full rounded-lg px-3 py-2 text-left text-xs font-semibold capitalize text-slate-600 hover:bg-slate-50"
                  }
                >
                  {x}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        title={mode === "draw" ? "Exit drawing mode" : "Draw on the plan"}
        onClick={() => setMode(mode === "draw" ? "select" : "draw")}
        className={mode === "draw" ? activeTool : toolClass}
      >
        {mode === "draw" ? "Drawing" : "Draw"}
      </button>
      {mode === "draw" ? (
        <div className="flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 p-1">
          {drawsAreaPolygon ? (
            <span className="px-2 text-xs font-semibold text-blue-700">
              {canFinish
                ? "Click the first point to close, or press Finish"
                : "Click 3 or more boundary points"}
            </span>
          ) : null}
          <button
            disabled={!canFinish}
            onClick={onFinish}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300"
          >
            Finish
          </button>
          <button onClick={() => setMode("select")} className={toolClass}>
            Cancel
          </button>
        </div>
      ) : null}
      {mode !== "draw" ? (
        <>
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenMenu((current) =>
                  current === "layers" ? null : "layers",
                )
              }
              className={toolClass}
            >
              Layers
            </button>
            {openMenu === "layers" ? (
            <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <label className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={showDrawing}
                  onChange={(e) => setShowDrawing(e.target.checked)}
                />{" "}
                Viewport drawing
              </label>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Element families
              </p>
              {fams.map((f: any) => (
                <label
                  key={f.id}
                  className="flex items-center gap-2 py-1 text-xs text-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={!hidden.has(f.id)}
                    onChange={(e) => {
                      const n = new Set(hidden);
                      e.target.checked ? n.delete(f.id) : n.add(f.id);
                      setHidden(n);
                    }}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: f.color }}
                  />
                  {f.mark} · {f.description}
                </label>
              ))}
            </div>
            ) : null}
          </div>
          <button
            title={
              snap ? "Snapping is on · hold Alt to bypass" : "Snapping is off"
            }
            onClick={() => setSnap(!snap)}
            className={
              snap
                ? "rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                : toolClass
            }
          >
            Snap {snap ? "On" : "Off"}
          </button>
        </>
      ) : null}
      {mode === "measure" ? (
        <button onClick={onClear} className={toolClass}>
          Clear
        </button>
      ) : null}
    </div>
  );
}
function DimensionActions({
  minimap,
  setMinimap,
  onUndo,
  canUndo,
  onDelete,
  canDelete,
}: {
  minimap: boolean;
  setMinimap: (v: boolean) => void;
  onUndo: () => void;
  canUndo: boolean;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        disabled={!canUndo}
        onClick={onUndo}
        className={
          canUndo
            ? toolClass
            : "rounded-lg px-3 py-2 text-xs font-semibold text-slate-300"
        }
      >
        Undo
      </button>
      <button
        disabled={!canDelete}
        onClick={onDelete}
        className={
          canDelete
            ? "rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
            : "rounded-lg px-3 py-2 text-xs font-semibold text-slate-300"
        }
      >
        Delete
      </button>
      <button
        onClick={() => setMinimap(!minimap)}
        className={
          minimap
            ? "rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
            : toolClass
        }
      >
        Minimap
      </button>
    </div>
  );
}
function DraftOverlay({ points, shape, fixedPointCount = points.length }: { points: Point[]; shape: string; fixedPointCount?: number }) {
  const ps =
    shape === "box" && points.length >= 2
      ? boxPoints(points[0], points[points.length - 1])
      : points;
  return (
    <g pointerEvents="none">
      <polygon
        points={ps.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={shape === "polyline" && ps.length >= 3 ? "rgba(37,99,235,.18)" : ps.length >= 3 ? "rgba(37,99,235,.12)" : "none"}
        stroke="#2563eb"
        strokeWidth={4}
        strokeDasharray="7 5"
        vectorEffect="non-scaling-stroke"
      />
      {ps.slice(0, fixedPointCount).map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 && fixedPointCount >= 3 ? 9 : 6}
          fill={i === 0 && fixedPointCount >= 3 ? "#10b981" : "#2563eb"}
          stroke="white"
          strokeWidth={2}
        />
      ))}
    </g>
  );
}
function MeasureOverlay({
  points,
  label,
}: {
  points: Point[];
  label: string | null;
}) {
  if (!points.length) return null;
  const a = points[0],
    b = points[1] || points[0];
  return (
    <g pointerEvents="none">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#dc2626"
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={a.x}
        cy={a.y}
        r={6}
        fill="white"
        stroke="#dc2626"
        strokeWidth={3}
      />
      <circle
        cx={b.x}
        cy={b.y}
        r={6}
        fill="white"
        stroke="#dc2626"
        strokeWidth={3}
      />
      {label ? (
        <>
          <rect
            x={(a.x + b.x) / 2 - 50}
            y={(a.y + b.y) / 2 - 28}
            width={100}
            height={24}
            rx={8}
            fill="white"
            stroke="#fecaca"
          />
          <text
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 - 12}
            textAnchor="middle"
            fontSize={13}
            fontWeight={800}
            fill="#b91c1c"
          >
            {label}
          </text>
        </>
      ) : null}
    </g>
  );
}
function GenericSnapIndicator({ target }: { target: SnapPreview }) {
  const zoom = useDrawingZoom(),
    scale = 1 / Math.max(0.2, zoom),
    width = Math.max(96, target.label.length * 8 + 20);
  return (
    <g
      pointerEvents="none"
      transform={
        "translate(" +
        target.point.x +
        " " +
        target.point.y +
        ") scale(" +
        scale +
        ")"
      }
    >
      <path
        d="M-20 0h40M0 -20v40"
        stroke="#059669"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={-width / 2}
        y={-48}
        width={width}
        height={25}
        rx={8}
        fill="#ecfdf5"
        stroke="#10b981"
        strokeWidth={1.5}
      />
      <text
        x={0}
        y={-31}
        textAnchor="middle"
        fontSize={13}
        fontWeight={800}
        fill="#047857"
      >
        {target.label}
      </text>
    </g>
  );
}

function RightPane({
  projectId,
  element,
}: {
  projectId: string;
  element: string;
}) {
  const tab = useDemoStore((s) => s.rightTab);
  const setTab = useDemoStore((s) => s.setRightTab);
  useEffect(() => {
    const chatKey = `takeoff.${element}`;
    const messages = useDemoStore.getState().chat[chatKey];
    if (copilotQuestionPending(chatKey, messages || [])) setTab("takeoff");
  }, [element, setTab]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 p-2">
        <button
          onClick={() => setTab("takeoff")}
          className={
            tab === "takeoff"
              ? "rounded-lg bg-slate-950 px-2 py-2 text-xs font-semibold text-white"
              : "rounded-lg px-2 py-2 text-xs font-semibold text-slate-500"
          }
        >
          Copilot
        </button>
        <button
          onClick={() => setTab("item")}
          className={
            tab === "item"
              ? "rounded-lg bg-slate-950 px-2 py-2 text-xs font-semibold text-white"
              : "rounded-lg px-2 py-2 text-xs font-semibold text-slate-500"
          }
        >
          Item
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "takeoff" ? (
          <DemoChat
            chatKey={`takeoff.${element}`}
            onOpenItem={() => setTab("item")}
          />
        ) : (
          <ItemInspector element={element} />
        )}
      </div>
    </div>
  );
}
function ItemInspector({ element }: { element: string }) {
  const id = useDemoStore((s) => s.selectedEntityId);
  const st = useDemoStore();
  if (!id)
    return (
      <div className="p-5 text-sm text-slate-500">
        Select an item on the drawing.
      </div>
    );
  const opening = st.openings.find((x) => x.id === id);
  if (opening) return <OpeningInspector id={opening.id} element={element} />;
  const zone = (
    element === "floor"
      ? st.floorZones
      : element === "ceiling"
        ? st.ceilingZones
        : []
  ).find((x) => x.id === id);
  if (zone) return <ZoneInspector id={zone.id} kind={zone.kind} />;
  const wall = st.walls.find((x) => x.id === id);
  if (wall) return <WallInspector id={wall.id} />;
  const roof = st.roofZones.find((x) => x.id === id);
  if (roof) return <RoofInspector id={roof.id} />;
  return (
    <div className="p-5 text-sm text-slate-500">
      The selected entity is not visible in this element.
    </div>
  );
}
function OpeningInspector({ id, element }: { id: string; element: string }) {
  const st = useDemoStore();
  const opening = st.openings.find((x) => x.id === id)!;
  const [draft, setDraft] = useState({
    familyId: opening.familyId,
    floorId: opening.floorId,
    viewportId: opening.viewportId,
    status: opening.status,
    hostWallId: opening.hostWallId || "",
  });
  useEffect(
    () =>
      setDraft({
        familyId: opening.familyId,
        floorId: opening.floorId,
        viewportId: opening.viewportId,
        status: opening.status,
        hostWallId: opening.hostWallId || "",
      }),
    [
      opening.id,
      opening.familyId,
      opening.floorId,
      opening.viewportId,
      opening.status,
      opening.hostWallId,
    ],
  );
  function apply(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    st.updateOpening(opening.id, {
      ...next,
      hostWallId: next.hostWallId || undefined,
    });
  }
  const f =
    st.openingFamilies.find((x) => x.id === draft.familyId) ||
    openingFamily(opening.familyId);
  return (
    <Inspector
      title={opening.id}
      subtitle={`${f.mark} · ${f.description}`}
      onDelete={() => {
        st.captureGeometryUndo();
        st.deleteOpening(opening.id);
      }}
    >
      <Field label="Family">
        <select
          className="input w-full"
          value={draft.familyId}
          onChange={(e) => apply({ familyId: e.target.value })}
        >
          {st.openingFamilies
            .filter((x) => x.parent === opening.kind)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.mark} · {x.description}
              </option>
            ))}
        </select>
      </Field>
      <ElementLocationFields
        element={element}
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={apply}
      />
      <Field label="Host wall">
        <select
          className="input w-full"
          value={draft.hostWallId}
          onChange={(e) => apply({ hostWallId: e.target.value })}
        >
          <option value="">Not assigned</option>
          {st.walls
            .filter((wall) => wall.floorId === draft.floorId)
            .map((wall) => (
              <option key={wall.id} value={wall.id}>
                {wall.id}
              </option>
            ))}
        </select>
      </Field>
      <InfoRow label="Size" value={`${f.widthMm} × ${f.heightMm} mm`} />
      <InfoRow label="Material" value={f.material} />
      <SavedState />
    </Inspector>
  );
}
function ZoneInspector({
  id,
  kind,
}: {
  id: string;
  kind: "floor" | "ceiling";
}) {
  const st = useDemoStore();
  const zone = (kind === "floor" ? st.floorZones : st.ceilingZones).find(
    (x) => x.id === id,
  )!;
  const fam = kind === "floor" ? st.floorFamilies : st.ceilingFamilies;
  const [draft, setDraft] = useState({
    familyId: zone.familyId,
    room: zone.room,
    floorId: zone.floorId,
    viewportId: zone.viewportId,
    status: zone.status,
  });
  useEffect(
    () =>
      setDraft({
        familyId: zone.familyId,
        room: zone.room,
        floorId: zone.floorId,
        viewportId: zone.viewportId,
        status: zone.status,
      }),
    [
      zone.id,
      zone.familyId,
      zone.room,
      zone.floorId,
      zone.viewportId,
      zone.status,
    ],
  );
  function apply(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    st.updateZone(kind, zone.id, next);
  }
  const preview = fam.find((x) => x.id === draft.familyId) || fam[0];
  return (
    <Inspector
      title={zone.id}
      subtitle={`${preview.mark} · ${draft.room}`}
      onDelete={() => {
        st.captureGeometryUndo();
        st.deleteZone(kind, zone.id);
      }}
    >
      <Field label="Family">
        <select
          className="input w-full"
          value={draft.familyId}
          onChange={(e) => apply({ familyId: e.target.value })}
        >
          {fam.map((x) => (
            <option key={x.id} value={x.id}>
              {x.mark} · {x.description}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Room / scope name">
        <input
          className="input w-full"
          value={draft.room}
          onChange={(e) => apply({ room: e.target.value })}
        />
      </Field>
      <ElementLocationFields
        element={kind}
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={apply}
      />
      <InfoRow label="Area" value={`${zoneNetAreaM2(zone).toFixed(2)} m²`} />
      <InfoRow label="Material" value={preview.material} />
      {kind === "floor" ? (
        <InfoRow label="Screed" value={preview.screed || "None"} />
      ) : (
        <InfoRow
          label="Height band"
          value={`${st.storeys.find((s) => s.id === draft.floorId)?.heightM.toFixed(2) || "0.00"} m`}
        />
      )}
      <SavedState />
    </Inspector>
  );
}
function WallInspector({ id }: { id: string }) {
  const st = useDemoStore();
  const wall = st.walls.find((x) => x.id === id)!;
  const f = st.wallFamilies.find((x) => x.id === wall.familyId)!;
  const [draft, setDraft] = useState({
    familyId: wall.familyId,
    heightM: wall.heightM,
    side1Finish: wall.side1Finish,
    side2Finish: wall.side2Finish,
    floorId: wall.floorId,
    viewportId: wall.viewportId,
    status: wall.status,
  });
  useEffect(
    () =>
      setDraft({
        familyId: wall.familyId,
        heightM: wall.heightM,
        side1Finish: wall.side1Finish,
        side2Finish: wall.side2Finish,
        floorId: wall.floorId,
        viewportId: wall.viewportId,
        status: wall.status,
      }),
    [
      wall.id,
      wall.familyId,
      wall.heightM,
      wall.side1Finish,
      wall.side2Finish,
      wall.floorId,
      wall.viewportId,
      wall.status,
    ],
  );
  function apply(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    st.updateWall(wall.id, next);
  }
  const preview = st.wallFamilies.find((x) => x.id === draft.familyId) || f;
  const candidates = mergeCandidates(wall, st.walls);
  return (
    <Inspector
      title={wall.id}
      subtitle={`${preview.mark} · ${preview.description}`}
      onDelete={() => {
        st.captureGeometryUndo();
        st.deleteWall(wall.id);
      }}
    >
      <Field label="Family">
        <select
          className="input w-full"
          value={draft.familyId}
          onChange={(e) => apply({ familyId: e.target.value })}
        >
          {st.wallFamilies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.mark} · {x.description}
            </option>
          ))}
        </select>
      </Field>
      <ElementLocationFields
        element="walls"
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={apply}
      />
      <InfoRow
        label="Length"
        value={`${(distance(wall.start, wall.end) * scaleForViewport(wall.viewportId)).toFixed(2)} m`}
      />
      <Field label="Height override">
        <input
          className="input w-full"
          type="number"
          min="0.1"
          step="0.05"
          value={draft.heightM}
          onChange={(e) => apply({ heightM: Number(e.target.value) })}
        />
      </Field>
      <InfoRow label="Thickness" value={`${preview.thicknessMm} mm`} />
      <InfoRow
        label="Gross area"
        value={`${wallGrossAreaM2({ ...wall, heightM: draft.heightM }).toFixed(2)} m²`}
      />
      <InfoRow
        label="Opening deduct"
        value={`${wallOpeningDeductM2(wall).toFixed(2)} m²`}
      />
      <InfoRow
        label="Net area"
        value={`${Math.max(0, wallGrossAreaM2({ ...wall, heightM: draft.heightM }) - wallOpeningDeductM2(wall)).toFixed(2)} m²`}
      />
      <Field label="Side 1 finish">
        <select
          className="input w-full"
          value={draft.side1Finish}
          onChange={(e) => apply({ side1Finish: e.target.value })}
        >
          {st.wallFinishFamilies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.mark} · {x.description}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Side 2 finish">
        <select
          className="input w-full"
          value={draft.side2Finish}
          onChange={(e) => apply({ side2Finish: e.target.value })}
        >
          {st.wallFinishFamilies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.mark} · {x.description}
            </option>
          ))}
        </select>
      </Field>
      <SavedState />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => splitWall(wall.id)}
          className="h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Split at midpoint
        </button>
        <button
          type="button"
          disabled={!candidates.length}
          onClick={() => mergeWall(wall.id, candidates[0]?.id)}
          className="h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Merge{candidates.length ? ` ${candidates[0].id}` : ""}
        </button>
      </div>
      <p className="text-[11px] leading-5 text-slate-400">
        Split creates two same-family runs. Merge is enabled for a touching,
        collinear run of the same family.
      </p>
    </Inspector>
  );
}
function RoofInspector({ id }: { id: string }) {
  const st = useDemoStore();
  const roof = st.roofZones.find((x) => x.id === id)!;
  const f = st.roofFamilies.find((x) => x.id === roof.familyId)!;
  const u = st.upstandFamilies.find((x) => x.id === roof.upstandFamilyId)!;
  const [draft, setDraft] = useState({
    familyId: roof.familyId,
    upstandFamilyId: roof.upstandFamilyId,
    scope: roof.scope,
    floorId: roof.floorId,
    viewportId: roof.viewportId,
    status: roof.status,
  });
  useEffect(
    () =>
      setDraft({
        familyId: roof.familyId,
        upstandFamilyId: roof.upstandFamilyId,
        scope: roof.scope,
        floorId: roof.floorId,
        viewportId: roof.viewportId,
        status: roof.status,
      }),
    [
      roof.id,
      roof.familyId,
      roof.upstandFamilyId,
      roof.scope,
      roof.floorId,
      roof.viewportId,
      roof.status,
    ],
  );
  function apply(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    st.updateRoofZone(roof.id, next);
  }
  const rf = st.roofFamilies.find((x) => x.id === draft.familyId) || f;
  const uf =
    st.upstandFamilies.find((x) => x.id === draft.upstandFamilyId) || u;
  return (
    <Inspector
      title={roof.id}
      subtitle={`${rf.mark} · ${draft.scope}`}
      onDelete={() => {
        st.captureGeometryUndo();
        st.deleteRoofZone(roof.id);
      }}
    >
      <Field label="Covering family">
        <select
          className="input w-full"
          value={draft.familyId}
          onChange={(e) => apply({ familyId: e.target.value })}
        >
          {st.roofFamilies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.mark} · {x.description}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Upstand family">
        <select
          className="input w-full"
          value={draft.upstandFamilyId}
          onChange={(e) => apply({ upstandFamilyId: e.target.value })}
        >
          {st.upstandFamilies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.mark} · {x.description}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Scope">
        <select
          className="input w-full"
          value={draft.scope}
          onChange={(e) =>
            apply({ scope: e.target.value as RoofZone["scope"] })
          }
        >
          <option>Terrace</option>
          <option>Upper roof</option>
        </select>
      </Field>
      <ElementLocationFields
        element="roof"
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={apply}
      />
      <InfoRow label="Area" value={`${roofNetAreaM2(roof).toFixed(2)} m²`} />
      <InfoRow label="Falls" value={rf.falls} />
      <InfoRow label="Layers" value={rf.layers} />
      <InfoRow
        label="Upstand"
        value={`${roofUpstandM(roof).toFixed(2)} m · ${uf.heightMm} mm`}
      />
      <SavedState />
      <button
        onClick={() => {
          st.captureGeometryUndo();
          st.updateRoofZone(roof.id, {
            upstandEdges: roof.points.map(() => true),
          });
        }}
        className="h-9 w-full rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
      >
        All edges upstand
      </button>
    </Inspector>
  );
}
function ElementLocationFields({
  element,
  floorId,
  viewportId,
  status,
  onChange,
}: {
  element: string;
  floorId: string;
  viewportId: string;
  status: DemoStatus;
  onChange: (patch: {
    floorId?: string;
    viewportId?: string;
    status?: DemoStatus;
  }) => void;
}) {
  const st = useDemoStore();
  const allowed = viewportsByElement[element] || [];
  return (
    <>
      <Field label="Storey">
        <select
          className="input w-full"
          value={floorId}
          onChange={(e) => onChange({ floorId: e.target.value })}
        >
          {st.storeys.map((storey) => (
            <option key={storey.id} value={storey.id}>
              {storey.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Drawing / viewport">
        <select
          className="input w-full"
          value={viewportId}
          onChange={(e) => onChange({ viewportId: e.target.value })}
        >
          {st.viewports
            .filter((viewport) => allowed.includes(viewport.id))
            .map((viewport) => (
              <option key={viewport.id} value={viewport.id}>
                {viewport.name} · {viewport.category}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Status">
        <select
          className="input w-full"
          value={status}
          onChange={(e) => onChange({ status: e.target.value as DemoStatus })}
        >
          <option value="ready">Ready</option>
          <option value="needs_review">Needs review</option>
          <option value="confirmed">Confirmed</option>
        </select>
      </Field>
    </>
  );
}
function SavedState() {
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
      Changes appear immediately · use Save changes below
    </div>
  );
}
function splitWall(id: string) {
  const st = useDemoStore.getState();
  const wall = st.walls.find((x) => x.id === id);
  if (
    !wall ||
    !beginLiveEdit(
      `geometry:split-wall:${id}`,
      `split wall ${id}`,
      st.undoGeometry,
    )
  )
    return;
  st.captureGeometryUndo();
  const mid = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
  const originalEnd = { ...wall.end };
  st.updateWall(id, { end: mid });
  const nextId = `${id}-B-${Date.now().toString().slice(-4)}`;
  st.addWall({
    ...wall,
    id: nextId,
    start: mid,
    end: originalEnd,
    status: "ready",
  });
  for (const opening of st.openings.filter((o) => o.hostWallId === id)) {
    const c = {
      x: opening.bbox.x + opening.bbox.width / 2,
      y: opening.bbox.y + opening.bbox.height / 2,
    };
    if (distance(c, originalEnd) < distance(c, wall.start))
      st.updateOpening(opening.id, { hostWallId: nextId });
  }
  st.setSelectedEntity(nextId);
}
function mergeCandidates(wall: Wall, walls: Wall[]) {
  return walls.filter(
    (x) =>
      x.id !== wall.id &&
      x.viewportId === wall.viewportId &&
      x.floorId === wall.floorId &&
      x.familyId === wall.familyId &&
      wallCollinearTouching(wall, x),
  );
}
function wallCollinearTouching(a: Wall, b: Wall) {
  const va = { x: a.end.x - a.start.x, y: a.end.y - a.start.y },
    vb = { x: b.end.x - b.start.x, y: b.end.y - b.start.y };
  const denom = Math.max(1, Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y));
  const cross = Math.abs(va.x * vb.y - va.y * vb.x) / denom;
  if (cross > 0.025) return false;
  const ends = [
    distance(a.start, b.start),
    distance(a.start, b.end),
    distance(a.end, b.start),
    distance(a.end, b.end),
  ];
  return Math.min(...ends) <= 8;
}
function mergeWall(id: string, neighborId?: string) {
  if (!neighborId) return;
  const st = useDemoStore.getState();
  const a = st.walls.find((x) => x.id === id),
    b = st.walls.find((x) => x.id === neighborId);
  if (
    !a ||
    !b ||
    !wallCollinearTouching(a, b) ||
    !beginLiveEdit(
      `geometry:merge-wall:${id}`,
      `merge wall ${id}`,
      st.undoGeometry,
    )
  )
    return;
  st.captureGeometryUndo();
  const pts = [a.start, a.end, b.start, b.end];
  let best: [Point, Point] = [pts[0], pts[1]],
    bestD = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = distance(pts[i], pts[j]);
      if (d > bestD) {
        bestD = d;
        best = [pts[i], pts[j]];
      }
    }
  st.updateWall(a.id, { start: best[0], end: best[1] });
  st.openings
    .filter((o) => o.hostWallId === b.id)
    .forEach((o) => st.updateOpening(o.id, { hostWallId: a.id }));
  st.deleteWall(b.id);
  st.setSelectedEntity(a.id);
}
function Inspector({
  title,
  subtitle,
  children,
  onDelete,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Selected item
        </p>
        <h3 className="mt-1 text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
      <button
        onClick={onDelete}
        className="h-10 w-full rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right text-slate-800">{value}</strong>
    </div>
  );
}

// ---------------- Workbook ----------------
type WorkbookRow = {
  key: string;
  parent: string;
  familyId: string;
  familyLabel: string;
  scope: string;
  floorId?: string;
  calc: string;
  qty: number;
  unit: string;
  source: string;
  extra?: string;
  importedQty?: number;
  importedStatus?: WorkbookSourceStatus;
  note?: string;
};
function WorkbookView({
  projectId,
  element,
}: {
  projectId: string;
  element: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const rows = useWorkbookRows(element);
  const overrides = useDemoStore((s) => s.workbookOverrides);
  const confirmed = useDemoStore((s) => s.workbookConfirmed);
  const leftCollapsed = useDemoStore((s) => s.leftCollapsed);
  const setLeftCollapsed = useDemoStore((s) => s.setLeftCollapsed);
  const setOverride = useDemoStore((s) => s.setWorkbookOverride);
  const setConfirmed = useDemoStore((s) => s.setWorkbookConfirmed);
  const rowParam = search.get("row");
  const [selected, setSelected] = useState(
    rowParam && rows.some((r) => r.key === rowParam)
      ? rowParam
      : rows[0]?.key || "",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (rowParam && rows.find((r) => r.key === rowParam)) setSelected(rowParam);
    else if (!rows.find((r) => r.key === selected))
      setSelected(rows[0]?.key || "");
  }, [rowParam, rows.map((r) => r.key).join("|")]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!Object.keys(drafts).length) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  const row = rows.find((r) => r.key === selected) || rows[0];
  const acceptedQuantity = (r: WorkbookRow) =>
    overrides[r.key] ?? r.importedQty ?? r.qty;
  const rowValue = (r: WorkbookRow) =>
    drafts[r.key] ?? String(acceptedQuantity(r).toFixed(2));
  const hasDraft = (key: string) =>
    Object.prototype.hasOwnProperty.call(drafts, key);
  const saveRow = (r: WorkbookRow) => {
    const value = Number(drafts[r.key]);
    if (Number.isFinite(value)) setOverride(r.key, value);
    setDrafts((d) => {
      const n = { ...d };
      delete n[r.key];
      return n;
    });
  };
  const discardRow = (key: string) =>
    setDrafts((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
  const groupRows = row
    ? rows.filter((r) => r.parent === row.parent && r.unit === row.unit)
    : rows;
  const groupTotal = groupRows.reduce(
    (sum, r) => sum + acceptedQuantity(r),
    0,
  );
  const visibleTotal = rows.reduce(
    (sum, r) => sum + (r.unit === row?.unit ? acceptedQuantity(r) : 0),
    0,
  );
  return (
    <ResizableThreePane
      storageKey={`takeoff:${element}:workbook`}
      defaultLeft={230}
      defaultRight={300}
      collapsedLeft={leftCollapsed}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <aside className="relative border-r border-slate-200 p-3">
        <button
          type="button"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 shadow-sm"
        >
          {leftCollapsed ? "›" : "‹"}
        </button>
        {leftCollapsed ? null : (
          <>
            <p className="mb-3 pr-9 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Family → floor
            </p>
            {[...new Set(rows.map((r) => r.parent))].map((parent) => (
              <details key={parent} open className="mb-2">
                <summary className="cursor-pointer rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  {parent}
                </summary>
                <div className="mt-1">
                  {[
                    ...new Set(
                      rows
                        .filter((r) => r.parent === parent)
                        .map((r) => r.familyId),
                    ),
                  ].map((fid) => (
                    <div key={fid} className="mb-1">
                      <div className="px-3 py-1.5 text-xs font-semibold text-slate-600">
                        {fid}
                      </div>
                      {rows
                        .filter(
                          (r) => r.parent === parent && r.familyId === fid,
                        )
                        .map((r) => (
                          <button
                            key={r.key}
                            onClick={() => setSelected(r.key)}
                            className={
                              selected === r.key
                                ? "w-full rounded-lg bg-blue-50 px-4 py-2 text-left text-xs font-semibold text-blue-700"
                                : "w-full rounded-lg px-4 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
                            }
                          >
                            {r.scope}
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </>
        )}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Family</th>
                <th className="px-4 py-3 text-left">Scope</th>
                <th className="px-4 py-3 text-left">Measured</th>
                <th className="px-4 py-3 text-left">Imported</th>
                <th className="px-4 py-3 text-left">Accepted</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.key}
                  onClick={() => setSelected(r.key)}
                  className={
                    selected === r.key
                      ? "cursor-pointer border-t border-slate-200 bg-blue-50"
                      : "cursor-pointer border-t border-slate-200 hover:bg-slate-50"
                  }
                >
                  <td className="px-4 py-3">
                    <strong>{r.familyId}</strong>
                    <div className="mt-1 text-xs text-slate-500">
                      {r.familyLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.scope}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.qty.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700">
                    {r.importedQty === undefined ? "—" : r.importedQty.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className={
                        hasDraft(r.key)
                          ? "input w-24 border-amber-300 bg-amber-50"
                          : "input w-24"
                      }
                      type="number"
                      step="0.01"
                      value={rowValue(r)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [r.key]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3">{r.unit}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        hasDraft(r.key)
                          ? "rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                          : confirmed[r.key]
                            ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                            : r.importedStatus === "CONFIRMED"
                              ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                              : r.importedStatus === "CONTROL"
                                ? "rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                                : r.importedStatus
                                  ? "rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                                  : "rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600"
                      }
                    >
                      {hasDraft(r.key)
                        ? "Unsaved"
                        : confirmed[r.key]
                          ? "Confirmed"
                          : r.importedStatus || "Review"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
          <span className="text-sm text-slate-500">
            {row
              ? `${row.parent}: ${groupTotal.toFixed(2)} ${row.unit} · all ${row.unit}: ${visibleTotal.toFixed(2)} ${row.unit}`
              : "No quantity lines"}
          </span>
          <span className="text-xs text-slate-400">
            Quantities only · bill lines are created in BOQ
          </span>
        </div>
      </main>
      <aside className="border-l border-slate-200 p-5">
        {row ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Selected line
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {row.familyId} · {row.scope}
            </h3>
            <div className="mt-4 space-y-2">
              <InfoRow label="Calculation" value={row.calc} />
              <InfoRow label="Measured" value={`${row.qty.toFixed(2)} ${row.unit}`} />
              {row.importedQty !== undefined ? (
                <>
                  <InfoRow label="Imported" value={`${row.importedQty.toFixed(2)} ${row.unit}`} />
                  <InfoRow label="Difference" value={`${(row.qty-row.importedQty).toFixed(2)} ${row.unit}`} />
                  <InfoRow label="Source status" value={row.importedStatus || "—"} />
                </>
              ) : null}
              <InfoRow
                label="Accepted quantity"
                value={`${Number(rowValue(row) || 0).toFixed(2)} ${row.unit}`}
              />
              <InfoRow label="Source" value={row.source} />
              {row.note ? <InfoRow label="Workbook note" value={row.note} /> : null}
              {row.extra ? <InfoRow label="Detail" value={row.extra} /> : null}
            </div>
            {hasDraft(row.key) ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => discardRow(row.key)}
                  className="h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  Discard
                </button>
                <button
                  onClick={() => saveRow(row)}
                  className="h-10 rounded-xl bg-slate-950 text-sm font-semibold text-white"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmed(row.key, true)}
                className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white"
              >
                {confirmed[row.key] ? "Confirmed" : "Confirm"}
              </button>
            )}
            <button
              onClick={() => {
                if (
                  Object.keys(drafts).length &&
                  !window.confirm(
                    "You have unsaved quantity edits. Discard them and open the drawing?",
                  )
                )
                  return;
                setDrafts({});
                const target = targetViewport(row);
                useDemoStore.getState().setSelectedViewport(target);
                router.push(
                  `${appRoutes.takeoff(projectId, element, "dimension")}?family=${encodeURIComponent(row.familyId)}`,
                );
              }}
              className="mt-2 h-10 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Show on drawing
            </button>
          </>
        ) : null}
      </aside>
    </ResizableThreePane>
  );
}
function useWorkbookRows(element: string) {
  const st = useDemoStore();
  return useMemo<WorkbookRow[]>(() => {
    const rows: WorkbookRow[] = [];
    if (isOpeningElement(element)) {
      const schedule = MATTEGODA_OPENING_SCHEDULE.filter((item) =>
        element === "doors-windows" || item.kind === (element === "doors" ? "door" : "window"),
      );
      for (const item of schedule) {
        const measured = st.openings
          .filter((opening) => opening.familyId === item.ref)
          .reduce((total, opening) => total + floorFactor(opening.floorId), 0);
        rows.push({
          key: `import:opening:${item.ref}`,
          parent: item.kind === "door" ? "Doors" : "Windows",
          familyId: item.ref,
          familyLabel: item.description,
          scope: item.location,
          calc: `${measured} drawing instances after storey repetition`,
          qty: measured,
          importedQty: item.scheduledQty,
          importedStatus: item.status,
          unit: "nr",
          source: "Mattegoda Preliminary Partial BOQ · Openings",
          extra: `${Math.round(item.widthMm)} × ${Math.round(item.heightMm)} mm · host ${item.provisionalHost}`,
          note: item.note,
        });
      }
    } else if (element === "floor") {
      for (const family of st.floorFamilies) {
        for (const floorId of ["GF","FF","TYP","RF"]) {
          const zones=st.floorZones.filter((zone)=>zone.familyId===family.id&&zone.floorId===floorId);
          if(!zones.length) continue;
          const base=zones.reduce((total,zone)=>total+zoneNetAreaM2(zone),0), factor=floorFactor(floorId);
          rows.push({
            key:`floor:${family.id}:${floorId}`,
            parent:"Floor finishes",
            familyId:family.id,
            familyLabel:`${family.mark} · ${family.description}`,
            scope:floorId==="GF"?"Ground":floorId==="FF"?"First":floorId==="TYP"?"Typical 2nd–6th":zones.every((zone)=>zone.viewportId==="VP-ROOF")?"Upper roof":"Terrace",
            floorId,
            calc:`${base.toFixed(2)} m²${factor>1?` × ${factor}`:""}`,
            qty:base*factor,
            unit:"m²",
            source:family.source,
            extra:`${family.material}${family.screed?` · ${family.screed}`:""}`,
          });
        }
      }
      for (const item of MATTEGODA_FLOOR_AREAS) {
        const floorId = item.ref === "FA-01" ? "GF" : item.ref === "FA-02" || item.ref === "FA-03" ? "FF" : item.ref === "FA-04" || item.ref === "FA-05" ? "TYP" : "RF";
        const measured = st.floorZones
          .filter((zone) => zone.floorId === floorId)
          .reduce((total, zone) => total + zoneNetAreaM2(zone), 0) * floorFactor(floorId);
        rows.push({
          key: item.key,
          parent: "Area controls",
          familyId: item.ref,
          familyLabel: item.finishRef,
          scope: item.scope,
          floorId,
          calc: item.inputUnit === "ft²" ? `${item.input.toFixed(0)} ft² × ${item.repetition}` : `${item.input.toFixed(2)} m²`,
          qty: measured,
          importedQty: item.totalM2,
          importedStatus: item.status,
          unit: "m²",
          source: "Mattegoda Preliminary Partial BOQ · Floor Areas",
          note: item.note,
        });
      }
    } else if (element === "walls") {
      for (const item of MATTEGODA_MASONRY) {
        const familyIds = st.wallFamilies.filter((family) => family.thicknessMm === item.thicknessMm).map((family) => family.id);
        const measured = st.walls
          .filter((wall) => wall.floorId === item.floorId && familyIds.includes(wall.familyId))
          .reduce((total, wall) => total + wallNetAreaM2(wall), 0) * floorFactor(item.floorId);
        rows.push({
          key: item.key,
          parent: "Masonry",
          familyId: item.familyLabel,
          familyLabel: `${item.thicknessMm} mm masonry`,
          scope: item.scope,
          floorId: item.floorId,
          calc: `${item.centrelineM.toFixed(3)} m × ${item.heightM.toFixed(4)} m × ${item.repetition} − ${item.deductionM2.toFixed(2)} m²`,
          qty: measured,
          importedQty: item.netM2,
          importedStatus: item.status,
          unit: "m²",
          source: "Mattegoda Preliminary Partial BOQ · Masonry Take-off",
          extra: `Imported gross ${item.grossM2.toFixed(2)} m²; deductions ${item.deductionM2.toFixed(2)} m²`,
          note: item.note,
        });
      }
      for (const f of st.wallFinishFamilies) {
        const ws = st.walls.filter(
          (w) => w.side1Finish === f.id || w.side2Finish === f.id,
        );
        for (const fid of [...new Set(ws.map((w) => w.floorId))]) {
          const base = wallFinishAreaM2(f.id, fid),
            factor = floorFactor(fid),
            qty = base * factor;
          const faces = ws
            .filter((w) => w.floorId === fid)
            .reduce(
              (n, w) =>
                n +
                (w.side1Finish === f.id ? 1 : 0) +
                (w.side2Finish === f.id ? 1 : 0),
              0,
            );
          rows.push({
            key: `wall-finish:${f.id}:${fid}`,
            parent: "Finishes",
            familyId: f.id,
            familyLabel: f.description,
            scope: floorName(fid),
            floorId: fid,
            calc:
              factor > 1 ? `${base.toFixed(2)} × ${factor}` : base.toFixed(2),
            qty,
            unit: "m²",
            source: f.source,
            extra: `${faces} faces · ${f.thicknessMm} mm`,
          });
        }
      }
    } else if (element === "ceiling") {
      for (const f of st.ceilingFamilies) {
        const zs = st.ceilingZones.filter((z) => z.familyId === f.id);
        for (const fid of [...new Set(zs.map((z) => z.floorId))]) {
          const base = zs
              .filter((z) => z.floorId === fid)
              .reduce((s, z) => s + zoneNetAreaM2(z), 0),
            factor = floorFactor(fid);
          rows.push({
            key: `ceiling:${f.id}:${fid}`,
            parent: "Ceilings",
            familyId: f.id,
            familyLabel: f.description,
            scope: floorName(fid),
            floorId: fid,
            calc:
              factor > 1 ? `${base.toFixed(2)} × ${factor}` : base.toFixed(2),
            qty: base * factor,
            unit: "m²",
            source: f.source,
            extra: `Height band ${st.storeys.find((s) => s.id === fid)?.heightM.toFixed(2)} m`,
          });
        }
      }
    } else if (element === "roof") {
      for (const f of st.roofFamilies) {
        const zs = st.roofZones.filter((z) => z.familyId === f.id);
        for (const scope of [...new Set(zs.map((z) => z.scope))]) {
          const qty = zs
            .filter((z) => z.scope === scope)
            .reduce((s, z) => s + roofNetAreaM2(z), 0);
          rows.push({
            key: `roof:${f.id}:${scope}`,
            parent: "Coverings",
            familyId: f.id,
            familyLabel: f.description,
            scope,
            calc: qty.toFixed(2),
            qty,
            unit: "m²",
            source: f.source,
            extra: `${f.layers}; ${f.falls}`,
          });
        }
      }
      for (const u of st.upstandFamilies) {
        const zs = st.roofZones.filter((z) => z.upstandFamilyId === u.id);
        for (const scope of [...new Set(zs.map((z) => z.scope))]) {
          const qty = zs
            .filter((z) => z.scope === scope)
            .reduce((s, z) => s + roofUpstandM(z), 0);
          rows.push({
            key: `roof-upstand:${u.id}:${scope}`,
            parent: "Upstands",
            familyId: u.id,
            familyLabel: u.description,
            scope,
            calc: qty.toFixed(2),
            qty,
            unit: "m",
            source: u.source,
            extra: `${u.heightMm} mm high`,
          });
        }
      }
    }
    return rows;
  }, [
    element,
    st.openings,
    st.floorZones,
    st.walls,
    st.ceilingZones,
    st.roofZones,
    st.storeys,
    st.openingFamilies,
    st.floorFamilies,
    st.wallFamilies,
    st.wallFinishFamilies,
    st.ceilingFamilies,
    st.roofFamilies,
    st.upstandFamilies,
  ]);
}

// ---------------- 3D ----------------
type Visibility = "on" | "faded" | "off";
type ColourMode = "type" | "status" | "category" | "consistent";
function sceneDefaults(element: string): Record<string, Visibility> {
  const off: Record<string, Visibility> = {
    doors: "off",
    windows: "off",
    walls: "off",
    floors: "off",
    ceilings: "off",
    roof: "off",
  };
  if (element === "doors-windows")
    return { ...off, doors: "on", windows: "on", walls: "faded" };
  if (element === "doors") return { ...off, doors: "on", walls: "faded" };
  if (element === "windows") return { ...off, windows: "on", walls: "faded" };
  if (element === "floor") return { ...off, floors: "on", walls: "faded" };
  if (element === "walls")
    return { ...off, walls: "on", doors: "faded", windows: "faded" };
  if (element === "ceiling")
    return { ...off, ceilings: "on", walls: "faded", floors: "faded" };
  return { ...off, roof: "on", walls: "faded", floors: "faded" };
}
function SceneView({
  projectId,
  element,
}: {
  projectId: string;
  element: string;
}) {
  const router = useRouter();
  const [selectedStorey, setSelectedStorey] = useState<string>(
    element === "roof" ? "roof" : "TYP",
  );
  const [section, setSection] = useState("off");
  const [visible, setVisible] = useState<Record<string, Visibility>>(() =>
    sceneDefaults(element),
  );
  const [colour, setColour] = useState<ColourMode>("type");
  const [rotation, setRotation] = useState(45);
  const [zoom, setZoom] = useState(1);
  const st = useDemoStore();
  const selected = st.selectedEntityId;
  const meta = selected ? sceneMeta(element, selected) : null;
  function cycle(key: string) {
    setVisible((v) => ({
      ...v,
      [key]: v[key] === "on" ? "faded" : v[key] === "faded" ? "off" : "on",
    }));
  }
  return (
    <ResizableTwoPane
      storageKey={`takeoff:${element}:3d`}
      defaultRight={300}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <main className="relative overflow-hidden bg-slate-900">
        <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/75 p-2 backdrop-blur">
          <button
            onClick={() => setSelectedStorey(stepStorey(selectedStorey, -1))}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white"
          >
            ‹
          </button>
          <select
            value={selectedStorey}
            onChange={(e) => setSelectedStorey(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            <option value="GF">Ground</option>
            <option value="FF">First</option>
            <option value="TYP">Typical 2nd–6th</option>
            <option value="all">All</option>
            <option value="roof">Roof</option>
          </select>
          <button
            onClick={() => setSelectedStorey(stepStorey(selectedStorey, 1))}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white"
          >
            ›
          </button>
          <button
            onClick={() => setSelectedStorey("all")}
            className={
              selectedStorey === "all"
                ? "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                : "rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white"
            }
          >
            All
          </button>
          <button
            onClick={() => setSelectedStorey("roof")}
            className={
              selectedStorey === "roof"
                ? "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                : "rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white"
            }
          >
            Roof
          </button>
        </div>
        <div className="absolute left-4 top-20 z-20 flex flex-wrap gap-1.5">
          {Object.entries(visible).map(([k, v]) => (
            <button
              key={k}
              onClick={() => cycle(k)}
              className={
                v === "on"
                  ? "rounded-full border border-blue-400/50 bg-blue-500/25 px-3 py-1.5 text-xs font-semibold capitalize text-blue-100"
                  : v === "faded"
                    ? "rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold capitalize text-slate-300"
                    : "rounded-full border border-white/10 bg-slate-950/50 px-3 py-1.5 text-xs font-semibold capitalize text-slate-500"
              }
            >
              {k} · {v}
            </button>
          ))}
        </div>
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 p-1.5">
          <button
            onClick={() => setRotation((r) => r - 15)}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            ↶
          </button>
          <button
            onClick={() => {
              setRotation(45);
              setZoom(1);
            }}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Fit
          </button>
          <button
            onClick={() => setRotation(0)}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Top
          </button>
          <button
            onClick={() => setRotation((r) => r + 15)}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            ↷
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            −
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            +
          </button>
        </div>
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/75 p-2">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Colour
          </span>
          <select
            value={colour}
            onChange={(e) => setColour(e.target.value as ColourMode)}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            <option value="type">Type</option>
            <option value="status">Status</option>
            <option value="category">Category</option>
            <option value="consistent">Consistent</option>
          </select>
        </div>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="absolute bottom-4 right-4 z-30 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
        >
          <option value="off">Section: Off</option>
          <option value="aa">Section A-A</option>
          <option value="bb">Section B-B</option>
        </select>
        <IsometricScene
          element={element}
          storey={selectedStorey}
          section={section}
          visible={visible}
          colour={colour}
          rotation={rotation}
          zoom={zoom}
        />
      </main>
      <aside className="overflow-y-auto border-l border-slate-200 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Item
        </p>
        {meta ? (
          <>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              {meta.title}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{meta.subtitle}</p>
            <div className="mt-4 space-y-2">
              {meta.rows.map(([label, value]) => (
                <InfoRow key={label} label={label} value={value} />
              ))}
            </div>
            <button
              onClick={() =>
                router.push(
                  `${appRoutes.takeoff(projectId, element, "dimension")}?entity=${encodeURIComponent(selected!)}`,
                )
              }
              className="mt-5 h-10 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Show on plan
            </button>
            <button
              onClick={() =>
                router.push(
                  `${appRoutes.takeoff(projectId, element, "workbook")}?row=${encodeURIComponent(meta.workbookKey)}`,
                )
              }
              className="mt-2 h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white"
            >
              Show in workbook
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-500">
              Click a model element to inspect it.
            </p>
            <div className="mt-5 space-y-2">
              <InfoRow
                label="Storeys"
                value={
                  selectedStorey === "all"
                    ? "All"
                    : selectedStorey === "TYP"
                      ? "Typical 2nd–6th"
                      : selectedStorey === "roof"
                        ? "Roof"
                        : selectedStorey === "GF"
                          ? "Ground"
                          : selectedStorey === "FF"
                            ? "First"
                            : "Storey"
                }
              />
              <InfoRow label="Colour" value={colour} />
            </div>
          </>
        )}
        <p className="mt-6 text-xs leading-5 text-slate-500">
          Review only. Add, move and delete stay in Dimension; quantity
          confirmation stays in Workbook.
        </p>
      </aside>
    </ResizableTwoPane>
  );
}
function stepStorey(current: string, direction: -1 | 1) {
  const order = ["GF", "FF", "TYP", "roof"];
  const i = order.includes(current) ? order.indexOf(current) : 1;
  return order[Math.max(0, Math.min(order.length - 1, i + direction))];
}
function IsometricScene({
  element,
  storey,
  section,
  visible,
  colour,
  rotation,
  zoom,
}: {
  element: string;
  storey: string;
  section: string;
  visible: Record<string, Visibility>;
  colour: ColourMode;
  rotation: number;
  zoom: number;
}) {
  const st = useDemoStore();
  const setSelected = st.setSelectedEntity;
  const selected = st.selectedEntityId;
  const floorIds =
    storey === "all"
      ? ["GF", "FF", "TYP", "RF"]
      : storey === "roof"
        ? ["RF"]
        : [storey];
  const baseFor = (fid: string) =>
    fid === "GF" ? 0 : fid === "FF" ? 4.0 : fid === "TYP" ? 7.6 : 11.2;
  const theta = (rotation * Math.PI) / 180;
  const project = (p: Point, y: number) => {
    const x = (p.x - 900) * 0.32,
      z = (p.y - 1050) * 0.25;
    const rx = x * Math.cos(theta) - z * Math.sin(theta),
      rz = x * Math.sin(theta) + z * Math.cos(theta);
    return { x: 520 + rx * 0.82, y: 425 + rz * 0.38 - y * 38 };
  };
  const opacity = (v: Visibility, active: boolean) =>
    v === "faded" ? 0.22 : active ? 0.88 : 0.68;
  const statusColor = (status: string) =>
    status === "confirmed"
      ? "#10b981"
      : status === "needs_review"
        ? "#f59e0b"
        : "#3b82f6";
  const entityColor = (kind: string, typeColor: string, status: string) =>
    colour === "status"
      ? statusColor(status)
      : colour === "category"
        ? kind === "walls"
          ? "#f97316"
          : kind === "floors"
            ? "#eab308"
            : kind === "ceilings"
              ? "#38bdf8"
              : kind === "roof"
                ? "#6366f1"
                : kind === "doors"
                  ? "#2563eb"
                  : "#10b981"
        : colour === "consistent"
          ? "#94a3b8"
          : typeColor;
  return (
    <svg viewBox="0 0 1040 680" className="h-full w-full">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stopColor="#0f1f2d" />
          <stop offset="1" stopColor="#09131d" />
        </linearGradient>
      </defs>
      <rect width="1040" height="680" fill="url(#g)" />
      <g
        transform={`translate(${520 * (1 - zoom)} ${340 * (1 - zoom)}) scale(${zoom})`}
      >
        <g opacity=".28" stroke="#334155">
          {Array.from({ length: 14 }).map((_, i) => (
            <line
              key={i}
              x1={80 + i * 70}
              y1={600}
              x2={520 + i * 35}
              y2={420}
            />
          ))}
        </g>
        {visible.floors !== "off" &&
          floorIds
            .filter((f) => f !== "RF")
            .map((fid) => {
              const y = baseFor(fid);
              const ps = [
                { x: 320, y: 510 },
                { x: 1470, y: 510 },
                { x: 1470, y: 1610 },
                { x: 320, y: 1610 },
              ].map((p) => project(p, y));
              const active = element === "floor";
              return (
                <polygon
                  key={fid}
                  points={ps.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={entityColor("floors", "#eab308", "ready")}
                  fillOpacity={opacity(visible.floors, active)}
                  stroke="#64748b"
                />
              );
            })}
        {visible.walls !== "off" &&
          st.walls
            .filter((w) => floorIds.includes(w.floorId))
            .map((w) => {
              const y = baseFor(w.floorId),
                h = w.heightM;
              const a = project(w.start, y),
                b = project(w.end, y),
                bt = project(w.end, y + h),
                at = project(w.start, y + h);
              const f = st.wallFamilies.find((x) => x.id === w.familyId);
              const active = selected === w.id || element === "walls";
              return (
                <polygon
                  key={w.id}
                  points={`${a.x},${a.y} ${b.x},${b.y} ${bt.x},${bt.y} ${at.x},${at.y}`}
                  fill={entityColor("walls", f?.color || "#f97316", w.status)}
                  fillOpacity={opacity(visible.walls, active)}
                  stroke={selected === w.id ? "#fff" : "#94a3b8"}
                  strokeWidth={selected === w.id ? 3 : 1}
                  onClick={() => setSelected(w.id)}
                  className="cursor-pointer"
                />
              );
            })}
        {st.openings
          .filter((o) => floorIds.includes(o.floorId))
          .map((o) => {
            const key = o.kind === "door" ? "doors" : "windows";
            const vis = visible[key];
            if (vis === "off") return null;
            const c = {
                x: o.bbox.x + o.bbox.width / 2,
                y: o.bbox.y + o.bbox.height / 2,
              },
              p = project(c, baseFor(o.floorId) + 1.5);
            const f = st.openingFamilies.find((x) => x.id === o.familyId);
            const active =
              selected === o.id ||
              element === "doors-windows" ||
              (element === "doors" && o.kind === "door") ||
              (element === "windows" && o.kind === "window");
            return (
              <g
                key={o.id}
                opacity={opacity(vis, active)}
                onClick={() => setSelected(o.id)}
                className="cursor-pointer"
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 8 : 5}
                  fill={entityColor(
                    key,
                    f?.color || (o.kind === "door" ? "#2563eb" : "#10b981"),
                    o.status,
                  )}
                  stroke={selected === o.id ? "white" : "none"}
                  strokeWidth={2}
                />
                <text
                  x={p.x + 10}
                  y={p.y - 7}
                  fill="white"
                  fontSize="10"
                  opacity=".8"
                >
                  {o.familyId}
                </text>
              </g>
            );
          })}
        {visible.ceilings !== "off" &&
          st.ceilingZones
            .filter((z) => floorIds.includes(z.floorId))
            .map((z) => {
              const y =
                baseFor(z.floorId) +
                (st.storeys.find((s) => s.id === z.floorId)?.heightM || 3.35);
              const ps = z.points.map((p) => project(p, y));
              const f = st.ceilingFamilies.find((x) => x.id === z.familyId);
              const active = selected === z.id || element === "ceiling";
              return (
                <polygon
                  key={z.id}
                  points={ps.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={entityColor(
                    "ceilings",
                    f?.color || "#38bdf8",
                    z.status,
                  )}
                  fillOpacity={opacity(visible.ceilings, active)}
                  stroke="#93c5fd"
                  onClick={() => setSelected(z.id)}
                  className="cursor-pointer"
                />
              );
            })}
        {visible.roof !== "off" &&
          st.roofZones.map((z) => {
            if (storey !== "roof" && storey !== "all" && element !== "roof")
              return null;
            const ps = z.points.map((p) => project(p, 8.3));
            const f = st.roofFamilies.find((x) => x.id === z.familyId);
            const active = selected === z.id || element === "roof";
            return (
              <polygon
                key={z.id}
                points={ps.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={entityColor("roof", f?.color || "#6366f1", z.status)}
                fillOpacity={opacity(visible.roof, active)}
                stroke="#60a5fa"
                onClick={() => setSelected(z.id)}
                className="cursor-pointer"
              />
            );
          })}
        {section !== "off" ? (
          <g opacity=".72">
            <rect
              x="395"
              y="90"
              width="260"
              height="470"
              fill="white"
              stroke="#38bdf8"
              strokeWidth="3"
            />
            <image
              href={
                section === "aa"
                  ? "/demo/sections/section-aa.jpg"
                  : "/demo/sections/section-bb.jpg"
              }
              x="400"
              y="95"
              width="250"
              height="460"
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        ) : null}
      </g>
      <text x="32" y="648" fill="#94a3b8" fontSize="13">
        Model review · click an entity to select it · rotate and zoom with the
        controls
      </text>
    </svg>
  );
}
function sceneMeta(element: string, id: string) {
  const st = useDemoStore.getState();
  const o = st.openings.find((x) => x.id === id);
  if (o) {
    const f = openingFamily(o.familyId);
    return {
      title: o.id,
      subtitle: `${f.mark} · ${f.description}`,
      rows: [
        ["Floor", floorName(o.floorId)],
        ["Size", `${f.widthMm} × ${f.heightMm} mm`],
        ["Source", f.source],
      ] as [string, string][],
      workbookKey: `${element === "doors-windows" ? "doors-windows" : o.kind === "door" ? "doors" : "windows"}:${f.id}:${o.floorId}`,
    };
  }
  const w = st.walls.find((x) => x.id === id);
  if (w) {
    const f = st.wallFamilies.find((x) => x.id === w.familyId)!;
    return {
      title: w.id,
      subtitle: `${f.mark} · ${f.description}`,
      rows: [
        ["Floor", floorName(w.floorId)],
        ["Height", `${w.heightM.toFixed(2)} m`],
        ["Net area", `${wallNetAreaM2(w).toFixed(2)} m²`],
      ] as [string, string][],
      workbookKey: `walls:${f.id}:${w.floorId}`,
    };
  }
  const z = (
    element === "floor"
      ? st.floorZones
      : element === "ceiling"
        ? st.ceilingZones
        : []
  ).find((x) => x.id === id);
  if (z) {
    const f = (z.kind === "floor" ? st.floorFamilies : st.ceilingFamilies).find(
      (x) => x.id === z.familyId,
    )!;
    return {
      title: z.id,
      subtitle: `${f.mark} · ${z.room}`,
      rows: [
        ["Floor", floorName(z.floorId)],
        ["Area", `${zoneNetAreaM2(z).toFixed(2)} m²`],
        ["Source", f.source],
      ] as [string, string][],
      workbookKey: `${z.kind}:${f.id}:${z.floorId}`,
    };
  }
  const r = st.roofZones.find((x) => x.id === id);
  if (r) {
    const f = st.roofFamilies.find((x) => x.id === r.familyId)!;
    return {
      title: r.id,
      subtitle: `${f.mark} · ${r.scope}`,
      rows: [
        ["Scope", r.scope],
        ["Area", `${roofNetAreaM2(r).toFixed(2)} m²`],
        ["Upstand", `${roofUpstandM(r).toFixed(2)} m`],
      ] as [string, string][],
      workbookKey: `roof:${f.id}:${r.scope}`,
    };
  }
  return null;
}

function measureText(
  a: Point,
  b: Point,
  scale: number,
  mode: "horizontal" | "vertical" | "any",
) {
  const metres = distance(a, b) * scale;
  if (mode !== "any") return `${metres.toFixed(2)} m`;
  const angle = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  return `${metres.toFixed(2)} m · ${Math.abs(angle).toFixed(0)}°`;
}
function genericOrthogonalSnap(
  origin: Point,
  point: Point,
): { point: Point; target: SnapPreview | null } {
  const dx = point.x - origin.x,
    dy = point.y - origin.y;
  if (Math.hypot(dx, dy) < 20) return { point, target: null };
  const tolerance = Math.tan((7 * Math.PI) / 180);
  if (Math.abs(dy) <= Math.abs(dx) * tolerance) {
    const aligned = { x: point.x, y: origin.y };
    return { point: aligned, target: { point: aligned, label: "Horizontal" } };
  }
  if (Math.abs(dx) <= Math.abs(dy) * tolerance) {
    const aligned = { x: origin.x, y: point.y };
    return { point: aligned, target: { point: aligned, label: "Vertical" } };
  }
  return { point, target: null };
}
function snapLabel(element: string) {
  if (element === "walls") return "Wall end / opening";
  if (isOpeningElement(element)) return "Opening corner";
  if (element === "roof") return "Roof vertex";
  if (element === "floor") return "Floor vertex";
  if (element === "ceiling") return "Ceiling vertex";
  return "Snap point";
}
function nearestGenericPoint(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.0001) return start;
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return { x: start.x + ratio * dx, y: start.y + ratio * dy };
}
function addGenericSegment(
  points: Point[],
  probe: Point,
  start: Point,
  end: Point,
) {
  points.push(
    { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    nearestGenericPoint(probe, start, end),
  );
}
function addGenericPolygon(points: Point[], probe: Point, polygon: Point[]) {
  points.push(...polygon);
  polygon.forEach((point, index) =>
    addGenericSegment(
      points,
      probe,
      point,
      polygon[(index + 1) % polygon.length],
    ),
  );
}
function snapCandidatePoints(
  element: string,
  viewportId: string,
  probe: Point,
): Point[] {
  const st = useDemoStore.getState();
  const points: Point[] = [];
  if (isOpeningElement(element) || element === "walls") {
    for (const o of st.openings.filter((x) => x.viewportId === viewportId)) {
      const box = [
        { x: o.bbox.x, y: o.bbox.y },
        { x: o.bbox.x + o.bbox.width, y: o.bbox.y },
        { x: o.bbox.x + o.bbox.width, y: o.bbox.y + o.bbox.height },
        { x: o.bbox.x, y: o.bbox.y + o.bbox.height },
      ];
      addGenericPolygon(points, probe, box);
    }
  }
  if (element === "walls") {
    for (const w of st.walls.filter((x) => x.viewportId === viewportId)) {
      points.push(w.start, w.end);
      addGenericSegment(points, probe, w.start, w.end);
    }
  }
  if (element === "floor" || element === "ceiling") {
    const zones = (
      element === "floor" ? st.floorZones : st.ceilingZones
    ).filter((x) => x.viewportId === viewportId);
    for (const z of zones) {
      addGenericPolygon(points, probe, z.points);
      z.deducts.forEach((deduct) => addGenericPolygon(points, probe, deduct));
    }
  }
  if (element === "roof") {
    for (const z of st.roofZones.filter((x) => x.viewportId === viewportId)) {
      addGenericPolygon(points, probe, z.points);
      z.deducts.forEach((deduct) => addGenericPolygon(points, probe, deduct));
    }
  }
  return points;
}
function findEntityTarget(
  element: string,
  id: string,
): { viewportId: string; familyId: string } | null {
  const st = useDemoStore.getState();
  if (isOpeningElement(element)) {
    const x = st.openings.find((o) => o.id === id);
    return x ? { viewportId: x.viewportId, familyId: x.familyId } : null;
  }
  if (element === "walls") {
    const x = st.walls.find((o) => o.id === id);
    return x ? { viewportId: x.viewportId, familyId: x.familyId } : null;
  }
  if (element === "floor" || element === "ceiling") {
    const xs = element === "floor" ? st.floorZones : st.ceilingZones;
    const x = xs.find((o) => o.id === id);
    return x ? { viewportId: x.viewportId, familyId: x.familyId } : null;
  }
  if (element === "roof") {
    const x = st.roofZones.find((o) => o.id === id);
    return x ? { viewportId: x.viewportId, familyId: x.familyId } : null;
  }
  return null;
}

function isOpeningElement(element: string) {
  return (
    element === "doors-windows" || element === "doors" || element === "windows"
  );
}
function isStructuralElement(element: string): element is StructuralElement {
  return element === "columns" || element === "beams" || element === "slab";
}
function familiesFor(element: string): any[] {
  const st = useDemoStore.getState();
  return element === "doors-windows"
    ? st.openingFamilies
    : element === "doors"
      ? st.openingFamilies.filter((x) => x.parent === "door")
      : element === "windows"
        ? st.openingFamilies.filter((x) => x.parent === "window")
        : element === "floor"
          ? st.floorFamilies
          : element === "walls"
            ? [...st.wallFamilies, ...st.wallFinishFamilies]
            : element === "ceiling"
              ? st.ceilingFamilies
              : element === "roof"
                ? [...st.roofFamilies, ...st.upstandFamilies]
                : [];
}
function familyIdsFor(element: string) {
  return familiesFor(element).map((x) => x.id);
}
function floorForViewport(viewport: string) {
  return viewport === "VP-TYP"
    ? "TYP"
    : viewport === "VP-TERRACE" || viewport === "VP-ROOF"
      ? "RF"
      : viewport === "VP-GROUND"
        ? "GF"
        : "FF";
}
function boxPoints(a: Point, b: Point) {
  return [
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
  ];
}
function targetViewport(row: WorkbookRow) {
  if (row.scope === "Upper roof") return "VP-ROOF";
  if (row.scope === "Terrace") return "VP-TERRACE";
  if (row.floorId === "TYP") return "VP-TYP";
  if (row.floorId === "GF") return "VP-GROUND";
  return "VP-FIRST";
}
