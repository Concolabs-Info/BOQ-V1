"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { DemoDrawing, svgPoint } from "./components/DemoDrawing";
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
import { useDemoStore } from "@/features/demo/store";
import { centroid, distance, zoneAreaM2 } from "@/features/demo/geometry";
import {
  floorFactor,
  floorName,
  scaleForViewport,
} from "@/features/demo/builders";
import type { BBox, DemoStatus, Point } from "@/features/demo/types";
import { appRoutes } from "@/shared/constants/appRoutes";
import { useStructuralStore } from "./structuralStore";
import type {
  BeamRun,
  ColumnFamily,
  ColumnInstance,
  SlabPlate,
  StructuralElement,
} from "./structuralTypes";
import { copilotQuestionPending } from "./copilot/demoCopilot";
import { useDrawingZoom } from "@/features/drawing/components/DrawingCanvas";
import {
  MeasurementOverlay,
  useMeasurementTool,
} from "./measurements/MeasurementOverlay";
import {
  beginLiveEdit,
  requestGuardedAction,
} from "./editing/editSessionStore";

const elementLabel: Record<StructuralElement, string> = {
  columns: "Columns",
  beams: "Beams",
  slab: "Slab",
};
const viewports: Record<StructuralElement, string[]> = {
  columns: [
    "VP-STRUCT-COL-GF",
    "VP-STRUCT-COL-TYP",
  ],
  beams: [
    "VP-STRUCT-BEAM-FF",
    "VP-STRUCT-BEAM-TYP",
    "VP-STRUCT-SLAB-ROOF",
    "VP-STRUCT-ROOF-PLAN",
    "VP-STRUCT-MACHINE-WATER",
  ],
  slab: [
    "VP-STRUCT-BEAM-FF",
    "VP-STRUCT-BEAM-TYP",
    "VP-STRUCT-SLAB-ROOF",
    "VP-STRUCT-ROOF-PLAN",
    "VP-STRUCT-MACHINE-WATER",
    "VP-SEC-AA",
    "VP-SEC-BB",
  ],
};

export function StructuralTakeoff({
  projectId,
  element,
  view,
}: {
  projectId: string;
  element: StructuralElement;
  view: string;
}) {
  if (view === "workbook")
    return <StructuralWorkbook projectId={projectId} element={element} />;
  if (view === "3d")
    return <Structural3D projectId={projectId} element={element} />;
  return <StructuralDimension element={element} />;
}

type Tool = "select" | "pan" | "measure" | "draw";
type PendingBeam = Omit<BeamRun, "start" | "end">;
type PendingSlab = Omit<SlabPlate, "points" | "voids" | "sectionProfile">;
type PendingColumn = Omit<ColumnInstance, "bbox">;
type SnapCandidate = { point: Point; label: string };
type SnapResult = { point: Point; target: SnapCandidate | null };
const button =
  "rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50";
const active =
  "rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white";
// Architectural sections render at about 20 mm per source pixel. Keeping the
// real ratio prevents a 150–250 mm plate being drawn as a heavy 30–50 px band.
const SECTION_SLAB_MM_PER_PX = 20;

function StructuralDimension({ element }: { element: StructuralElement }) {
  const search = useSearchParams();
  const drawings = useDemoStore((s) => s.viewports);
  const store = useStructuralStore();
  const [viewportId, setViewportId] = useState(viewports[element][0]);
  const [leftTab, setLeftTab] = useState<"viewports" | "families">("viewports");
  const [rightTab, setRightTab] = useState<"takeoff" | "item">("takeoff");
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<Point[]>([]);
  const [minimap, setMinimap] = useState(false);
  const [snap, setSnapState] = useState(false);
  const [snapTarget, setSnapTarget] = useState<SnapCandidate | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [addElementOpen, setAddElementOpen] = useState(false);
  const [pendingBeam, setPendingBeam] = useState<PendingBeam | null>(null);
  const [pendingSlab, setPendingSlab] = useState<PendingSlab | null>(null);
  const [pendingColumn, setPendingColumn] = useState<PendingColumn | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [activeFamily, setActiveFamily] = useState(
    families(element)[0]?.id || "",
  );
  const [slabSign, setSlabSign] = useState<"add" | "remove">("add");
  const altPressed = useRef(false);
  const canvasScale = useRef(1);
  useEffect(() => {
    setSnapState(window.localStorage.getItem("quanto.snap.enabled") === "true");
  }, []);
  function setSnap(value: boolean | ((current: boolean) => boolean)) {
    setSnapState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      window.localStorage.setItem("quanto.snap.enabled", String(next));
      return next;
    });
  }
  const viewport = drawings.find((v) => v.id === viewportId) || drawings[0];
  const measurement = useMeasurementTool({
    viewportId,
    scale: scaleForViewport(viewportId),
    active: tool === "measure",
    deleteEnabled: tool === "select" || tool === "measure",
  });
  // Structural GA sheets are catalogued as details, but they are still plan
  // viewports and must render selectable takeoff overlays.
  const isSection = viewport?.category === "section";
  const selected = selectedItem(element, store.selectedId);

  useEffect(() => {
    const id = search.get("entity");
    const item = selectedItem(element, id);
    if (!item) return;
    store.select(item.id);
    setViewportId(item.viewportId);
    setRightTab("item");
  }, [element, search, store.select]);

  useEffect(() => {
    const chatKey = `takeoff.${element}`;
    const messages = useDemoStore.getState().chat[chatKey];
    if (copilotQuestionPending(chatKey, messages || [])) setRightTab("takeoff");
  }, [element]);

  useEffect(() => {
    if (!pendingBeam && !pendingSlab && !pendingColumn) return;
    function cancel(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPendingBeam(null);
      setPendingSlab(null);
      setPendingColumn(null);
      setDraft([]);
      setHoverPoint(null);
      setTool("select");
    }
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [pendingBeam, pendingSlab, pendingColumn]);

  function dragStart(raw: Point, scale: number) {
    if (tool !== "draw" || (!pendingColumn && !pendingBeam && !pendingSlab)) return;
    // Plan slabs are point-defined polygons. Drag creation is reserved for
    // columns, beams, and the rectangular section representation of a slab.
    if (pendingSlab && !isSection) return;
    canvasScale.current = scale;
    const point = resolveSnap(raw).point;
    setDraft([point, point]);
    setHoverPoint(point);
  }

  function dragMove(raw: Point, scale: number) {
    if (tool !== "draw" || draft.length < 2) return;
    canvasScale.current = scale;
    const point = resolveSnap(raw, undefined, draft[0]).point;
    setDraft((current) => current.length ? [current[0], point] : current);
    setHoverPoint(point);
  }

  function dragEnd(raw: Point, scale: number) {
    if (tool !== "draw" || draft.length < 2) return;
    canvasScale.current = scale;
    const end = resolveSnap(raw, undefined, draft[0]).point;
    const start = draft[0];
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (Math.max(width, height) < 8) { setDraft([]); setHoverPoint(null); return; }
    store.captureUndo();
    if (pendingColumn) {
      store.addColumn({ ...pendingColumn, bbox: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(8, width), height: Math.max(8, height) } });
      store.select(pendingColumn.id);
      setPendingColumn(null);
    } else if (pendingBeam) {
      store.addBeam({ ...pendingBeam, start, end });
      store.select(pendingBeam.id);
      setPendingBeam(null);
    } else if (pendingSlab) {
      const x0 = Math.min(start.x, end.x), x1 = Math.max(start.x, end.x), y0 = Math.min(start.y, end.y), y1 = Math.max(start.y, end.y);
      if (isSection) {
        const thicknessPx = Math.max(1, pendingSlab.thicknessOverrideMm || 150) / SECTION_SLAB_MM_PER_PX;
        store.addSlab({ ...pendingSlab, points: [], voids: [], sectionProfile: { x0, x1, stepX: (x0 + x1) / 2, topY: start.y, bottomY: start.y + thicknessPx, stepOffset: 0 } });
      } else {
        store.addSlab({ ...pendingSlab, points: [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], voids: [] });
      }
      store.select(pendingSlab.id);
      setPendingSlab(null);
    }
    setDraft([]); setHoverPoint(null); setRightTab("item"); setTool("select");
  }

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Alt") altPressed.current = true;
    }
    function keyUp(event: KeyboardEvent) {
      if (event.key === "Alt") altPressed.current = false;
    }
    function reset() {
      altPressed.current = false;
    }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
    };
  }, []);

  function resolveSnap(
    point: Point,
    excludeId?: string,
    origin?: Point,
    threshold = 24 / Math.max(0.01, canvasScale.current),
  ): SnapResult {
    if (!snap || altPressed.current) return { point, target: null };
    const geometry = nearestStructuralSnap(
      point,
      structuralSnapCandidates(viewportId, store, point, excludeId),
      Math.min(80, Math.max(2, threshold)),
    );
    return geometry.target || !origin
      ? geometry
      : orthogonalSnap(origin, point);
  }

  function canvasClick(point: Point, scale = canvasScale.current) {
    canvasScale.current = scale;
    const origin =
      tool === "draw"
        ? element === "slab" && !isSection
          ? draft[draft.length - 1]
          : draft[0]
        : undefined;
    const result = resolveSnap(point, undefined, origin);
    const next = result.point;
    setSnapTarget(null);
    if (tool === "measure") {
      measurement.canvasClick(next);
      return;
    }
    if (tool !== "draw") return;
    if (isSection) {
      if (element !== "slab" || slabSign === "remove") return;
      setDraft((value) => {
        if (!value.length) return [next];
        const first = value[0];
        const slab = pendingSlab || {
          id: `SLP-${Date.now()}`,
          familyId: activeFamily,
          floorId: floorForViewport(viewportId),
          viewportId,
          thicknessOverrideMm:
            store.slabFamilies.find((family) => family.id === activeFamily)
              ?.thicknessMm || 150,
          status: "ready" as const,
        };
        const thicknessMm = Math.max(1, slab.thicknessOverrideMm || 150);
        const thicknessPx = thicknessMm / SECTION_SLAB_MM_PER_PX;
        const x0 = Math.min(first.x, next.x);
        const x1 = Math.max(first.x, next.x);
        const topY = first.y;
        store.captureUndo();
        store.addSlab({
          ...slab,
          viewportId,
          points: [],
          voids: [],
          sectionProfile: {
            x0,
            x1,
            stepX: (x0 + x1) / 2,
            topY,
            bottomY: topY + thicknessPx,
            stepOffset: 0,
          },
        });
        setPendingSlab(null);
        setHoverPoint(null);
        setRightTab("item");
        setTool("select");
        return [];
      });
      return;
    }
    if (element === "columns") {
      store.captureUndo();
      const id = `COL-${Date.now()}`;
      store.addColumn({
        id,
        familyId: activeFamily,
        floorId: floorForViewport(viewportId),
        viewportId,
        bbox: { x: next.x - 18, y: next.y - 18, width: 36, height: 36 },
        heightM: heightForFloor(floorForViewport(viewportId)),
        status: "ready",
      });
      setRightTab("item");
      setTool("select");
      return;
    }
    setDraft((value) => {
      const points = [...value, next];
      if (element === "beams" && points.length === 2) {
        const beam = pendingBeam || {
          id: `BM-${Date.now()}`,
          familyId: activeFamily,
          kind: "Downstand" as const,
          floorId: floorForViewport(viewportId),
          viewportId,
          dropMm: 300,
          status: "ready" as const,
        };
        store.captureUndo();
        store.addBeam({ ...beam, start: points[0], end: points[1] });
        setPendingBeam(null);
        setHoverPoint(null);
        setRightTab("item");
        setTool("select");
        return [];
      }
      return points;
    });
  }

  function finishSlab() {
    if (element !== "slab" || draft.length < 3) return;
    store.captureUndo();
    if (slabSign === "remove") {
      const host =
        store.slabPlates.find(
          (x) => x.id === store.selectedId && x.viewportId === viewportId,
        ) || store.slabPlates.find((x) => x.viewportId === viewportId);
      if (host) store.updateSlab(host.id, { voids: [...host.voids, draft] });
    } else
      store.addSlab({
        ...(pendingSlab || {
          id: `SLP-${Date.now()}`,
          familyId: activeFamily,
          floorId: floorForViewport(viewportId),
          viewportId,
          status: "ready" as const,
        }),
        viewportId,
        points: draft,
        voids: [],
      });
    setPendingSlab(null);
    setDraft([]);
    setTool("select");
    setRightTab("item");
  }

  const allowedDrawings = drawings.filter((v) =>
    viewports[element].includes(v.id),
  );
  return (
    <>
      <ResizableThreePane
        storageKey={`takeoff:${element}:dimension`}
        defaultLeft={230}
        defaultRight={340}
        className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <aside className="border-r border-slate-200">
          <div className="grid grid-cols-2 border-b border-slate-200 p-2">
            <button
              className={leftTab === "viewports" ? active : button}
              onClick={() => setLeftTab("viewports")}
            >
              Viewports
            </button>
            <button
              className={leftTab === "families" ? active : button}
              onClick={() => setLeftTab("families")}
            >
              Families
            </button>
          </div>
          {leftTab === "viewports" ? (
            <div className="space-y-2 p-3">
              {allowedDrawings.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setViewportId(v.id);
                    store.select(null);
                  }}
                  className={
                    v.id === viewportId
                      ? "w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left"
                      : "w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-200"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{v.name}</span>
                    <span
                      className={
                        v.status === "confirmed"
                          ? "h-2.5 w-2.5 rounded-full bg-emerald-500"
                          : "h-2.5 w-2.5 rounded-full bg-blue-400"
                      }
                    />
                  </div>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {v.category}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <StructuralFamilies
              element={element}
              activeId={activeFamily}
              onSelect={setActiveFamily}
            />
          )}
        </aside>
        <main className="min-w-0 bg-slate-100 p-3">
          <DemoDrawing
            viewportId={viewportId}
            tool={
              tool === "pan"
                ? "pan"
                : tool === "draw" || tool === "measure"
                  ? "draw"
                  : "select"
            }
            onCanvasClick={canvasClick}
            onCanvasDragStart={element === "slab" && !isSection ? undefined : dragStart}
            onCanvasDragMove={element === "slab" && !isSection ? undefined : dragMove}
            onCanvasDragEnd={element === "slab" && !isSection ? undefined : dragEnd}
            onCanvasMove={(point) => {
              if (tool !== "draw" && tool !== "measure") {
                setSnapTarget(null);
                return;
              }
              const result = resolveSnap(
                point,
                undefined,
                tool === "draw" && draft.length
                  ? element === "slab" && !isSection
                    ? draft[draft.length - 1]
                    : element === "beams" || isSection
                      ? draft[0]
                      : undefined
                  : undefined,
              );
              setSnapTarget(result.target);
              if (tool === "measure") measurement.canvasMove(result.point);
              if (
                tool === "draw" &&
                (element === "beams" || element === "slab") &&
                draft.length
              )
                setHoverPoint(result.point);
            }}
            showMinimap={minimap}
            toolbar={
              <div className="flex min-w-max items-center gap-0 [&_button]:px-2">
                {tool !== "draw" ? (
                  <>
                    <button
                      className={tool === "select" ? active : button}
                      onClick={() => {
                        setTool("select");
                        setPendingBeam(null);
                        setPendingSlab(null);
                        setDraft([]);
                        setHoverPoint(null);
                        setSnapTarget(null);
                        measurement.clearDraft();
                      }}
                    >
                      Select
                    </button>
                    <button
                      title="Pan the drawing. Use Select to move elements."
                      className={tool === "pan" ? active : button}
                      onClick={() => {
                        setTool("pan");
                        setSnapTarget(null);
                        measurement.clearDraft();
                      }}
                    >
                      Hand
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        requestGuardedAction(
                          () => setAddElementOpen(true),
                          `add another ${elementLabel[element].toLowerCase()}`,
                        )
                      }
                      className="rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      ＋ Add element
                    </button>
                    <button
                      className={tool === "measure" ? active : button}
                      onClick={() => {
                        setTool("measure");
                        setSnapTarget(null);
                      }}
                    >
                      Measure
                    </button>
                    <button
                      disabled={isSection && element !== "slab"}
                      className={`${button} disabled:text-slate-300`}
                      onClick={() => {
                        setPendingBeam(null);
                        setPendingSlab(null);
                        setHoverPoint(null);
                        setSnapTarget(null);
                        setTool("draw");
                        setDraft([]);
                        measurement.clearDraft();
                      }}
                    >
                      Draw
                    </button>
                  </>
                ) : (
                  <span className="mr-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
                    Drawing {elementLabel[element].replace(/s$/, "")}
                  </span>
                )}
                {pendingBeam ? (
                  <>
                    <span className="ml-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                      {draft.length
                        ? "Click the beam end"
                        : "Click the beam start"}
                    </span>
                  </>
                ) : null}
                {pendingSlab ? (
                  <>
                    <span className="ml-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                      {isSection
                        ? draft.length
                          ? "Click the slab section end"
                          : "Click the slab section start"
                        : draft.length
                          ? "Continue the slab boundary, then Finish"
                          : "Click the first slab boundary point"}
                    </span>
                  </>
                ) : null}
                {element === "slab" &&
                tool === "draw" &&
                !isSection &&
                !pendingSlab ? (
                  <>
                    <button
                      className={
                        slabSign === "add"
                          ? "rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                          : button
                      }
                      onClick={() => setSlabSign("add")}
                    >
                      Add
                    </button>
                    <button
                      className={
                        slabSign === "remove"
                          ? "rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                          : button
                      }
                      onClick={() => setSlabSign("remove")}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
                {tool !== "draw" ? (
                  <LayerMenu
                    element={element}
                    hidden={hidden}
                    setHidden={setHidden}
                  />
                ) : null}
                <button
                  title={snap ? "Snapping is on" : "Snapping is off"}
                  aria-pressed={snap}
                  className={
                    snap
                      ? "rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                      : button
                  }
                  onClick={() => {
                    setSnap((value) => !value);
                    setSnapTarget(null);
                  }}
                >
                  Snap {snap ? "On" : "Off"}
                </button>
                {tool === "draw" ? (
                  <button
                    onClick={() => {
                      setPendingBeam(null);
                      setPendingSlab(null);
                      setDraft([]);
                      setHoverPoint(null);
                      setSnapTarget(null);
                      setTool("select");
                    }}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                ) : null}
                {element === "slab" && !isSection && draft.length >= 3 ? (
                  <button
                    onClick={finishSlab}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Finish
                  </button>
                ) : null}
              </div>
            }
            toolbarRight={
              tool === "draw" ? null : (
                <div className="flex items-center gap-0 [&_button]:px-2">
                  <button
                    onClick={store.undo}
                    className={
                      store.geometryUndo.length
                        ? button
                        : "rounded-lg px-3 py-2 text-xs font-semibold text-slate-300"
                    }
                    disabled={!store.geometryUndo.length}
                  >
                    Undo
                  </button>
                  <button
                    className={
                      (measurement.selected || store.selectedId)
                        ? "rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                        : "rounded-lg px-3 py-2 text-xs font-semibold text-slate-300"
                    }
                    disabled={
                      !Boolean(
                        measurement.selected || store.selectedId,
                      )
                    }
                    onClick={() =>
                      measurement.selected
                        ? measurement.deleteSelected()
                        : deleteSelected(element, store.selectedId)
                    }
                  >
                    Delete
                  </button>
                  <button
                    className={
                      minimap
                        ? "rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                        : button
                    }
                    onClick={() => setMinimap(!minimap)}
                  >
                    Minimap
                  </button>
                </div>
              )
            }
          >
            {isSection ? (
              <SectionEvidence element={element} viewportId={viewportId} />
            ) : (
              <StructuralOverlays
                element={element}
                viewportId={viewportId}
                hidden={hidden}
                interactive={tool === "select"}
                snap={snap}
                resolveSnap={resolveSnap}
                onSnapTarget={setSnapTarget}
                onSelect={() => {
                  measurement.clearSelection();
                  setRightTab("item");
                }}
              />
            )}
            {pendingColumn && draft.length > 1 ? (
              <rect
                x={Math.min(draft[0].x, draft[1].x)} y={Math.min(draft[0].y, draft[1].y)}
                width={Math.abs(draft[1].x - draft[0].x)} height={Math.abs(draft[1].y - draft[0].y)}
                fill="#2563eb" fillOpacity={0.16} stroke="#2563eb" strokeWidth={4}
                strokeDasharray="8 5" vectorEffect="non-scaling-stroke" pointerEvents="none"
              />
            ) : draft.length ? (
              <Draft
                points={
                  hoverPoint && (element === "beams" || (element === "slab" && isSection))
                    ? [draft[0], hoverPoint]
                    : hoverPoint && element === "slab" && !isSection
                      ? [...draft, hoverPoint]
                      : draft
                }
              />
            ) : null}
            <MeasurementOverlay
              measurements={measurement.measurements}
              selectedId={measurement.selectedId}
              scale={scaleForViewport(viewportId)}
              editable={tool === "select" || tool === "measure"}
              previewStart={measurement.start}
              previewEnd={measurement.previewEnd}
            />
            {snapTarget ? <SnapIndicator target={snapTarget} /> : null}
          </DemoDrawing>
        </main>
        <aside className="border-l border-slate-200">
          <div className="grid grid-cols-2 border-b border-slate-200 p-2">
            <button
              onClick={() => setRightTab("takeoff")}
              className={rightTab === "takeoff" ? active : button}
            >
              Copilot
            </button>
            <button
              onClick={() => setRightTab("item")}
              className={rightTab === "item" ? active : button}
            >
              Item
            </button>
          </div>
          {rightTab === "takeoff" ? (
            <DemoChat
              chatKey={`takeoff.${element}`}
              contextLabel={viewport?.name}
              onOpenItem={() => setRightTab("item")}
            />
          ) : selected ? (
            <StructuralInspector element={element} id={selected.id} />
          ) : (
            <div className="p-5 text-sm leading-6 text-slate-500">
              Select an item on the drawing to inspect and edit it.
            </div>
          )}
        </aside>
      </ResizableThreePane>
      <StructuralAddElementDialog
        open={addElementOpen}
        element={element}
        currentViewportId={viewportId}
        onClose={() => setAddElementOpen(false)}
        onPrepareBeam={(beam) => {
          setViewportId(beam.viewportId);
          setActiveFamily(beam.familyId);
          store.select(null);
          setRightTab("item");
          setPendingBeam(beam);
          setSnap(true);
          setDraft([]);
          setHoverPoint(null);
          setTool("draw");
          setAddElementOpen(false);
        }}
        onPrepareColumn={(column) => {
          setViewportId(column.viewportId); setActiveFamily(column.familyId); store.select(null);
          setPendingColumn(column); setPendingBeam(null); setPendingSlab(null); setDraft([]);
          setHoverPoint(null); setRightTab("item"); setTool("draw"); setAddElementOpen(false);
        }}
        onPrepareSlab={(slab) => {
          setViewportId(slab.viewportId);
          setActiveFamily(slab.familyId);
          store.select(null);
          setRightTab("item");
          setPendingSlab(slab);
          setPendingBeam(null);
          setDraft([]);
          setHoverPoint(null);
          setSlabSign("add");
          setTool("draw");
          setAddElementOpen(false);
        }}
        onCreated={(id, nextViewportId, familyId) => {
          setViewportId(nextViewportId);
          setActiveFamily(familyId);
          store.select(id);
          setRightTab("item");
          setTool("select");
          setAddElementOpen(false);
        }}
      />
    </>
  );
}

function StructuralAddElementDialog({
  open,
  element,
  currentViewportId,
  onClose,
  onCreated,
  onPrepareBeam,
  onPrepareSlab,
  onPrepareColumn,
}: {
  open: boolean;
  element: StructuralElement;
  currentViewportId: string;
  onClose: () => void;
  onCreated: (id: string, viewportId: string, familyId: string) => void;
  onPrepareBeam: (beam: PendingBeam) => void;
  onPrepareSlab: (slab: PendingSlab) => void;
  onPrepareColumn: (column: PendingColumn) => void;
}) {
  const store = useStructuralStore();
  const drawings = useDemoStore((s) => s.viewports);
  const storeys = useDemoStore((s) => s.storeys);
  const familyList = families(element);
  const ids =
    element === "columns"
      ? store.columns.map((item) => item.id)
      : element === "beams"
        ? store.beams.map((item) => item.id)
        : store.slabPlates.map((item) => item.id);
  const availableDrawings = drawings.filter(
    (drawing) =>
      viewports[element].includes(drawing.id) &&
      (element === "slab" || drawing.category === "plan"),
  );
  const safeViewportId = availableDrawings.some(
    (drawing) => drawing.id === currentViewportId,
  )
    ? currentViewportId
    : availableDrawings[0]?.id || currentViewportId;
  const floorId = floorForViewport(safeViewportId);
  const prefix =
    element === "columns" ? "COL" : element === "beams" ? "BM" : "SLP";
  const initialValues: ElementFormValues = {
    id: `${prefix}-${Date.now().toString().slice(-6)}`,
    familyId: familyList[0]?.id || "",
    viewportId: safeViewportId,
    floorId,
    status: "ready",
    heightM: heightForFloor(floorId),
    kind: "Downstand",
    dropMm: 300,
    thicknessOverrideMm:
      element === "slab" ? store.slabFamilies[0]?.thicknessMm || 150 : 0,
  };
  const fields: ElementFormField[] = [
    {
      key: "id",
      label: "Element ID",
      required: true,
      section: "General",
      help: "Stable ID used by drawing, workbook, review and BOQ data.",
    },
    {
      key: "familyId",
      label: "Family",
      type: "select",
      required: true,
      options: familyList.map((family) => ({
        value: family.id,
        label: `${family.mark} — ${family.description}`,
      })),
      section: "General",
    },
    {
      key: "viewportId",
      label: "Drawing / viewport",
      type: "select",
      required: true,
      options: availableDrawings.map((drawing) => ({
        value: drawing.id,
        label: `${drawing.name} · ${drawing.category}`,
      })),
      section: "Location",
    },
    {
      key: "floorId",
      label: "Storey",
      type: "select",
      required: true,
      options: storeys.map((storey) => ({
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
  if (element === "columns")
    fields.push({
      key: "heightM",
      label: "Height (m)",
      type: "number",
      required: true,
      min: 0.1,
      step: 0.05,
      section: "Properties",
    });
  if (element === "beams")
    fields.push(
      {
        key: "kind",
        label: "Beam kind",
        type: "select",
        required: true,
        options: [
          { value: "Downstand", label: "Downstand" },
          { value: "Through", label: "Through / within slab" },
        ],
        section: "Properties",
      },
      {
        key: "dropMm",
        label: "Drop (mm)",
        type: "number",
        required: true,
        min: 0,
        step: 10,
        section: "Properties",
      },
    );
  if (element === "slab")
    fields.push({
      key: "thicknessOverrideMm",
      label: "Thickness (mm)",
      type: "number",
      required: true,
      min: 1,
      step: "any",
      help: "Enter any slab thickness in millimetres.",
      section: "Properties",
    });
  function create(values: ElementFormValues) {
    const id = String(values.id).trim(),
      familyId = String(values.familyId),
      viewportId = String(values.viewportId),
      floorId = String(values.floorId),
      status = String(values.status) as DemoStatus;
    if (element === "beams") {
      onPrepareBeam({
        id,
        familyId,
        kind: String(values.kind) as BeamRun["kind"],
        floorId,
        viewportId,
        dropMm: Number(values.dropMm),
        status,
      });
      return;
    }
    if (element === "slab") {
      onPrepareSlab({
        id,
        familyId,
        floorId,
        viewportId,
        thicknessOverrideMm: Number(values.thicknessOverrideMm),
        status,
      });
      return;
    }
    if (element === "columns") {
      onPrepareColumn({
        id,
        familyId,
        floorId,
        viewportId,
        heightM: Number(values.heightM),
        status,
      });
      return;
    }
    onCreated(id, viewportId, familyId);
  }
  return (
    <ElementEditorDialog
      open={open}
      title={`Add ${elementLabel[element]} element`}
      description={
        element === "beams"
          ? "Choose the beam data, then click its start and end points on the drawing. Press Escape to cancel."
          : element === "slab"
            ? "Choose any slab thickness and a plan or section viewport, then draw its geometry directly on that drawing."
            : "Choose the column data, then drag its actual footprint on the drawing. Press Escape to cancel."
      }
      fields={fields}
      initialValues={initialValues}
      submitLabel={
        element === "beams" || element === "slab"
          ? "Start drawing"
          : "Start drawing"
      }
      validate={(values) =>
        ids.includes(String(values.id).trim())
          ? { id: "This element ID already exists" }
          : ({} as Record<string, string>)
      }
      onClose={onClose}
      onSubmit={create}
    />
  );
}

function StructuralFamilies({
  element,
  activeId,
  onSelect,
}: {
  element: StructuralElement;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const store = useStructuralStore();
  const list = families(element);
  const selected = list.find((x) => x.id === activeId) || list[0];
  const [draft, setDraft] = useState<any>(selected ? { ...selected } : null);
  const [expandedId, setExpandedId] = useState<string | null>(
    activeId || selected?.id || null,
  );
  useEffect(() => setDraft(selected ? { ...selected } : null), [selected?.id]);
  useEffect(() => {
    if (activeId) setExpandedId(activeId);
  }, [activeId]);
  function create() {
    const n = list.length + 1;
    if (element === "columns") {
      const id = `C${n}`;
      store.addColumnFamily({
        id,
        mark: id,
        description: "New RCC column family",
        shape: "Rectangular",
        widthMm: 230,
        depthMm: 450,
        source: "User created",
        color: "#64748b",
      });
      onSelect(id);
    } else if (element === "beams") {
      const id = `B${n}`;
      store.addBeamFamily({
        id,
        mark: id,
        description: "New RCC beam family",
        widthMm: 230,
        depthMm: 450,
        source: "User created",
        color: "#64748b",
      });
      onSelect(id);
    } else {
      const id = `S${n}`;
      store.addSlabFamily({
        id,
        mark: id,
        description: "New RCC slab family",
        thicknessMm: 150,
        falls: "Level",
        source: "User created",
        color: "#64748b",
      });
      onSelect(id);
    }
  }
  function save() {
    if (!draft) return;
    if (element === "columns") store.updateColumnFamily(draft.id, draft);
    else if (element === "beams") store.updateBeamFamily(draft.id, draft);
    else store.updateSlabFamily(draft.id, draft);
  }
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {elementLabel[element]}
        </p>
        <button
          onClick={create}
          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500"
        >
          + New
        </button>
      </div>
      <div className="space-y-2">
        {list.map((f) => {
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
                  setExpandedId((current) => (current === f.id ? null : f.id));
                }}
                className="w-full p-3 text-left hover:bg-blue-50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: f.color }}
                  />
                  <strong className="min-w-0 flex-1 text-sm">{f.mark}</strong>
                  <span className="text-xs font-bold text-slate-400">
                    {open ? "⌃" : "⌄"}
                  </span>
                </div>
                <p className="mt-1 pr-5 text-xs text-slate-500">
                  {f.description}
                </p>
              </button>
              {open && draft?.id === f.id ? (
                <StructuralFamilyEditor
                  element={element}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={save}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StructuralFamilyEditor({
  element,
  draft,
  setDraft,
  onSave,
}: {
  element: StructuralElement;
  draft: any;
  setDraft: (value: any) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-blue-100 bg-white p-3">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          General
        </p>
        <div className="space-y-2">
          <FamilyTextField
            label="Name"
            value={draft.mark || ""}
            onChange={(value) => setDraft({ ...draft, mark: value })}
          />
          <FamilyTextField
            label="Description"
            value={draft.description || ""}
            onChange={(value) => setDraft({ ...draft, description: value })}
          />
          {element === "columns" ? (
            <FamilySelect
              label="Shape"
              value={draft.shape}
              options={["Rectangular", "Circular"]}
              onChange={(value) => setDraft({ ...draft, shape: value })}
            />
          ) : null}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Dimensions
        </p>
        <div className="space-y-2">
          {"widthMm" in draft ? (
            <>
              <FamilyNumberField
                label="Width (mm)"
                value={draft.widthMm}
                onChange={(value) => setDraft({ ...draft, widthMm: value })}
              />
              <FamilyNumberField
                label="Depth (mm)"
                value={draft.depthMm}
                onChange={(value) => setDraft({ ...draft, depthMm: value })}
              />
              {element === "columns" && draft.shape === "Circular" ? (
                <FamilyNumberField
                  label="Diameter (mm)"
                  value={draft.diameterMm || draft.widthMm}
                  onChange={(value) =>
                    setDraft({ ...draft, diameterMm: value })
                  }
                />
              ) : null}
            </>
          ) : (
            <FamilyNumberField
              label="Thickness (mm)"
              value={draft.thicknessMm}
              onChange={(value) => setDraft({ ...draft, thicknessMm: value })}
            />
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Details
        </p>
        <div className="space-y-2">
          {"falls" in draft ? (
            <FamilyTextField
              label="Falls"
              value={draft.falls || ""}
              onChange={(value) => setDraft({ ...draft, falls: value })}
            />
          ) : null}
          <FamilyTextField
            label="Source"
            value={draft.source || ""}
            onChange={(value) => setDraft({ ...draft, source: value })}
          />
        </div>
      </div>
      <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
        <span>Display colour</span>
        <input
          type="color"
          value={draft.color || "#64748b"}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
        />
      </label>
      <button
        onClick={onSave}
        className="h-9 w-full rounded-lg bg-slate-950 text-xs font-semibold text-white"
      >
        Save family
      </button>
    </div>
  );
}

function FamilyTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
      <span>{label}</span>
      <input
        className="input w-full min-w-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function FamilyNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
      <span>{label}</span>
      <input
        type="number"
        className="input w-full min-w-0"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function FamilySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 text-[11px] font-medium text-slate-500">
      <span>{label}</span>
      <select
        className="input w-full min-w-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function LayerMenu({
  element,
  hidden,
  setHidden,
}: {
  element: StructuralElement;
  hidden: Set<string>;
  setHidden: (value: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const fs = families(element);
  function toggle(id: string) {
    const next = new Set(hidden);
    next.has(id) ? next.delete(id) : next.add(id);
    setHidden(next);
  }
  return (
    <div className="relative">
      <button className={button} onClick={() => setOpen(!open)}>
        Layers
      </button>
      {open ? (
        <div className="absolute left-0 top-10 z-50 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Visible layers
          </p>
          {fs.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={!hidden.has(f.id)}
                onChange={() => toggle(f.id)}
              />
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: f.color }}
              />
              {f.mark}
            </label>
          ))}
          {element === "slab" ? (
            <div className="border-t border-slate-100 px-2 pt-2 text-xs text-slate-500">
              Through-beams and deducts are shown.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function nearestStructuralSnap(
  point: Point,
  candidates: SnapCandidate[],
  threshold = 30,
): SnapResult {
  let target: SnapCandidate | null = null;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const candidateDistance = distance(point, candidate.point);
    if (candidateDistance < bestDistance) {
      target = candidate;
      bestDistance = candidateDistance;
    }
  }
  return target ? { point: target.point, target } : { point, target: null };
}

function orthogonalSnap(origin: Point, point: Point): SnapResult {
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

function effectiveColumnSection(item: ColumnInstance, family: ColumnFamily) {
  const diameterMm =
    item.diameterOverrideMm ?? family.diameterMm ?? family.widthMm;
  return {
    widthMm:
      family.shape === "Circular"
        ? diameterMm
        : (item.widthOverrideMm ?? family.widthMm),
    depthMm:
      family.shape === "Circular"
        ? diameterMm
        : (item.depthOverrideMm ?? family.depthMm),
    diameterMm,
  };
}

function columnDrawingBox(item: ColumnInstance, family: ColumnFamily): BBox {
  // Detected structural-sheet boxes already describe the printed column marks.
  // Keep that geometry exact; family dimensions remain the quantity source.
  return item.bbox;
}

function columnSnapCandidates(item: ColumnInstance): SnapCandidate[] {
  const family = useStructuralStore
    .getState()
    .columnFamilies.find((value) => value.id === item.familyId);
  const b = family ? columnDrawingBox(item, family) : item.bbox,
    cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;
  return [
    { point: { x: cx, y: cy }, label: item.id + " centre" },
    { point: { x: b.x, y: b.y }, label: item.id + " corner" },
    { point: { x: b.x + b.width, y: b.y }, label: item.id + " corner" },
    {
      point: { x: b.x + b.width, y: b.y + b.height },
      label: item.id + " corner",
    },
    { point: { x: b.x, y: b.y + b.height }, label: item.id + " corner" },
    { point: { x: cx, y: b.y }, label: item.id + " edge" },
    { point: { x: b.x + b.width, y: cy }, label: item.id + " edge" },
    { point: { x: cx, y: b.y + b.height }, label: item.id + " edge" },
    { point: { x: b.x, y: cy }, label: item.id + " edge" },
  ];
}

function nearestPointOnSegment(point: Point, start: Point, end: Point): Point {
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

function addSegmentCandidates(
  candidates: SnapCandidate[],
  probe: Point,
  start: Point,
  end: Point,
  label: string,
) {
  candidates.push({
    point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    label: label + " midpoint",
  });
  const nearest = nearestPointOnSegment(probe, start, end);
  if (distance(nearest, start) > 0.2 && distance(nearest, end) > 0.2)
    candidates.push({ point: nearest, label: label + " nearest point" });
}

function segmentIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  const abx = b.x - a.x,
    aby = b.y - a.y,
    cdx = d.x - c.x,
    cdy = d.y - c.y;
  const denominator = abx * cdy - aby * cdx;
  if (Math.abs(denominator) < 0.0001) return null;
  const acx = c.x - a.x,
    acy = c.y - a.y;
  const t = (acx * cdy - acy * cdx) / denominator,
    u = (acx * aby - acy * abx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * abx, y: a.y + t * aby };
}

function structuralSnapCandidates(
  viewportId: string,
  store: ReturnType<typeof useStructuralStore.getState>,
  probe: Point,
  excludeId?: string,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  const segments: { start: Point; end: Point; label: string }[] = [];
  function addSegment(start: Point, end: Point, label: string) {
    segments.push({ start, end, label });
    addSegmentCandidates(candidates, probe, start, end, label);
  }
  for (const column of store.columns.filter(
    (item) => item.viewportId === viewportId && item.id !== excludeId,
  )) {
    candidates.push(...columnSnapCandidates(column));
    const family = store.columnFamilies.find(
      (value) => value.id === column.familyId,
    );
    const b = family ? columnDrawingBox(column, family) : column.bbox;
    const corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ];
    corners.forEach((corner, index) =>
      addSegment(
        corner,
        corners[(index + 1) % corners.length],
        column.id + " edge",
      ),
    );
  }
  for (const beam of store.beams.filter(
    (item) => item.viewportId === viewportId && item.id !== excludeId,
  )) {
    candidates.push(
      { point: beam.start, label: beam.id + " start" },
      { point: beam.end, label: beam.id + " end" },
    );
    addSegment(beam.start, beam.end, beam.id);
  }
  for (const slab of store.slabPlates.filter(
    (item) => item.viewportId === viewportId && item.id !== excludeId,
  )) {
    slab.points.forEach((point) =>
      candidates.push({ point, label: slab.id + " vertex" }),
    );
    slab.points.forEach((point, index) =>
      addSegment(
        point,
        slab.points[(index + 1) % slab.points.length],
        slab.id + " edge",
      ),
    );
    slab.voids.forEach((opening, openingIndex) => {
      opening.forEach((point) =>
        candidates.push({ point, label: slab.id + " opening" }),
      );
      opening.forEach((point, index) =>
        addSegment(
          point,
          opening[(index + 1) % opening.length],
          slab.id + " opening " + (openingIndex + 1),
        ),
      );
    });
  }
  for (let first = 0; first < segments.length; first++)
    for (let second = first + 1; second < segments.length; second++) {
      const a = segments[first],
        b = segments[second],
        intersection = segmentIntersection(a.start, a.end, b.start, b.end);
      if (intersection)
        candidates.push({ point: intersection, label: "Intersection" });
    }
  return candidates.filter(
    (candidate, index, items) =>
      items.findIndex(
        (other) => distance(candidate.point, other.point) < 0.1,
      ) === index,
  );
}

function StructuralOverlays({
  element,
  viewportId,
  hidden,
  interactive,
  snap,
  resolveSnap,
  onSnapTarget,
  onSelect,
}: {
  element: StructuralElement;
  viewportId: string;
  hidden: Set<string>;
  interactive: boolean;
  snap: boolean;
  resolveSnap: (
    point: Point,
    excludeId?: string,
    origin?: Point,
    threshold?: number,
  ) => SnapResult;
  onSnapTarget: (target: SnapCandidate | null) => void;
  onSelect: () => void;
}) {
  const store = useStructuralStore();
  if (element === "columns")
    return (
      <g
        className="quanto-scaled-elements"
        pointerEvents={interactive ? "auto" : "none"}
      >
        {store.columns
          .filter((x) => x.viewportId === viewportId && !hidden.has(x.familyId))
          .map((x) => (
            <ColumnBox
              key={x.id}
              item={x}
              snap={snap}
              resolveSnap={resolveSnap}
              onSnapTarget={onSnapTarget}
              onSelect={onSelect}
            />
          ))}
      </g>
    );
  if (element === "beams")
    return (
      <g
        className="quanto-scaled-elements"
        pointerEvents={interactive ? "auto" : "none"}
      >
        {store.columns
          .filter((x) => x.viewportId === viewportId)
          .map((x) => (
            <ColumnGhost key={x.id} item={x} />
          ))}
        {store.beams
          .filter((x) => x.viewportId === viewportId && !hidden.has(x.familyId))
          .map((x) => (
            <BeamLine
              key={x.id}
              item={x}
              interactive={interactive}
              snap={snap}
              resolveSnap={resolveSnap}
              onSnapTarget={onSnapTarget}
              onSelect={onSelect}
            />
          ))}
      </g>
    );
  return (
    <g
      className="quanto-scaled-elements"
      pointerEvents={interactive ? "auto" : "none"}
    >
      {store.slabPlates
        .filter((x) => x.viewportId === viewportId && !hidden.has(x.familyId))
        .map((x) => (
          <SlabShape
            key={x.id}
            item={x}
            snap={snap}
            resolveSnap={resolveSnap}
            onSnapTarget={onSnapTarget}
            onSelect={onSelect}
          />
        ))}
      {store.beams
        .filter((x) => x.viewportId === viewportId && x.kind === "Through")
        .map((x) => (
          <line
            key={x.id}
            x1={x.start.x}
            y1={x.start.y}
            x2={x.end.x}
            y2={x.end.y}
            stroke="#f97316"
            strokeWidth={14}
            opacity={0.35}
            strokeDasharray="8 5"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      {store.columns
        .filter((x) => x.viewportId === viewportId)
        .map((x) => (
          <ColumnGhost key={x.id} item={x} />
        ))}
    </g>
  );
}

function ColumnBox({
  item,
  snap,
  resolveSnap,
  onSnapTarget,
  onSelect,
}: {
  item: ColumnInstance;
  snap: boolean;
  resolveSnap: (
    point: Point,
    excludeId?: string,
    origin?: Point,
    threshold?: number,
  ) => SnapResult;
  onSnapTarget: (target: SnapCandidate | null) => void;
  onSelect: () => void;
}) {
  const store = useStructuralStore();
  const canvasScale = useDrawingZoom();
  const family = store.columnFamilies.find((x) => x.id === item.familyId)!;
  const selected = store.selectedId === item.id;
  const [hovered, setHovered] = useState(false);
  const [drag, setDrag] = useState<{ start: Point; box: BBox } | null>(null);
  const b = columnDrawingBox(item, family);
  function down(e: ReactPointerEvent<SVGRectElement>) {
    const p = svgPoint(e as any);
    if (!p) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    store.captureUndo();
    setDrag({ start: p, box: { ...b } });
    store.select(item.id);
    onSelect();
  }
  function move(e: ReactPointerEvent<SVGRectElement>) {
    if (!drag) return;
    const p = svgPoint(e as any);
    if (!p) return;
    const rawCenter = {
      x: drag.box.x + drag.box.width / 2 + p.x - drag.start.x,
      y: drag.box.y + drag.box.height / 2 + p.y - drag.start.y,
    };
    const result = snap
      ? resolveSnap(
          rawCenter,
          item.id,
          undefined,
          24 / Math.max(0.01, canvasScale),
        )
      : { point: rawCenter, target: null };
    onSnapTarget(result.target);
    store.updateColumn(item.id, {
      bbox: {
        ...drag.box,
        x: result.point.x - drag.box.width / 2,
        y: result.point.y - drag.box.height / 2,
      },
    });
  }
  function stop() {
    setDrag(null);
    onSnapTarget(null);
  }
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        store.select(item.id);
        onSelect();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <title>{item.id + " · " + family.description}</title>
      <rect
        x={b.x}
        y={b.y}
        width={b.width}
        height={b.height}
        rx={family.shape === "Circular" ? 18 : 2}
        fill={hovered ? "#0ea5e9" : family.color}
        fillOpacity={selected ? 0.35 : hovered ? 0.3 : 0.18}
        stroke={hovered ? "#0284c7" : family.color}
        strokeWidth={selected ? 5 : hovered ? 4 : 3}
        vectorEffect="non-scaling-stroke"
        className="cursor-move"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      <rect
        x={b.x + b.width / 2 - Math.max(18, b.width) / 2}
        y={b.y + b.height / 2 - Math.max(18, b.height) / 2}
        width={Math.max(18, b.width)}
        height={Math.max(18, b.height)}
        fill="transparent"
        className="cursor-pointer"
      />
      {selected || hovered ? <text
        x={b.x + b.width + 8}
        y={b.y + 18}
        fontSize={16}
        fontWeight={800}
        fill={hovered ? "#0284c7" : family.color}
        paintOrder="stroke"
        stroke="white"
        strokeWidth={5}
      >
        {item.id} · {family.mark}
      </text> : null}
    </g>
  );
}
function ColumnGhost({ item }: { item: ColumnInstance }) {
  const family = useStructuralStore((s) =>
    s.columnFamilies.find((value) => value.id === item.familyId),
  );
  const box = family ? columnDrawingBox(item, family) : item.bbox;
  return (
    <rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      fill="#64748b"
      opacity={0.18}
      stroke="#64748b"
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

function BeamLine({
  item,
  interactive,
  snap,
  resolveSnap,
  onSnapTarget,
  onSelect,
}: {
  item: BeamRun;
  interactive: boolean;
  snap: boolean;
  resolveSnap: (
    point: Point,
    excludeId?: string,
    origin?: Point,
    threshold?: number,
  ) => SnapResult;
  onSnapTarget: (target: SnapCandidate | null) => void;
  onSelect: () => void;
}) {
  type BeamDrag =
    | { type: "start" | "end" }
    | { type: "move"; origin: Point; start: Point; end: Point };
  const store = useStructuralStore();
  const canvasScale = useDrawingZoom();
  const family = store.beamFamilies.find((x) => x.id === item.familyId)!;
  const selected = store.selectedId === item.id;
  const [hovered, setHovered] = useState(false);
  const [drag, setDrag] = useState<BeamDrag | null>(null);
  function move(e: ReactPointerEvent<SVGElement>) {
    if (!drag) return;
    const p = svgPoint(e as any);
    if (!p) return;
    if (drag.type === "move") {
      const dx = p.x - drag.origin.x,
        dy = p.y - drag.origin.y;
      const rawStart = { x: drag.start.x + dx, y: drag.start.y + dy };
      const rawEnd = { x: drag.end.x + dx, y: drag.end.y + dy };
      if (!snap) {
        onSnapTarget(null);
        store.updateBeam(item.id, { start: rawStart, end: rawEnd });
        return;
      }
      const threshold = 24 / Math.max(0.01, canvasScale);
      const startSnap = resolveSnap(rawStart, item.id, undefined, threshold);
      const endSnap = resolveSnap(rawEnd, item.id, undefined, threshold);
      const choices = [
        { raw: rawStart, result: startSnap },
        { raw: rawEnd, result: endSnap },
      ].filter((choice) => choice.result.target);
      const choice = choices.sort(
        (a, b) =>
          distance(a.raw, a.result.point) - distance(b.raw, b.result.point),
      )[0];
      if (!choice) {
        onSnapTarget(null);
        store.updateBeam(item.id, { start: rawStart, end: rawEnd });
        return;
      }
      const snapDx = choice.result.point.x - choice.raw.x,
        snapDy = choice.result.point.y - choice.raw.y;
      onSnapTarget(choice.result.target);
      store.updateBeam(item.id, {
        start: { x: rawStart.x + snapDx, y: rawStart.y + snapDy },
        end: { x: rawEnd.x + snapDx, y: rawEnd.y + snapDy },
      });
      return;
    }
    const origin = drag.type === "start" ? item.end : item.start;
    const result = snap
      ? resolveSnap(p, item.id, origin, 24 / Math.max(0.01, canvasScale))
      : { point: p, target: null };
    onSnapTarget(result.target);
    store.updateBeam(
      item.id,
      drag.type === "start" ? { start: result.point } : { end: result.point },
    );
  }
  function moveWhole(e: ReactPointerEvent<SVGLineElement>) {
    const p = svgPoint(e as any);
    if (!p) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    store.captureUndo();
    store.select(item.id);
    onSelect();
    setDrag({
      type: "move",
      origin: p,
      start: { ...item.start },
      end: { ...item.end },
    });
  }
  function stop() {
    setDrag(null);
    onSnapTarget(null);
  }
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        store.select(item.id);
        onSelect();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <title>{item.id + " · " + family.description}</title>
      <line
        x1={item.start.x}
        y1={item.start.y}
        x2={item.end.x}
        y2={item.end.y}
        stroke={hovered ? "#0ea5e9" : family.color}
        strokeWidth={selected ? 8 : hovered ? 7 : item.kind === "Through" ? 4 : 5}
        opacity={hovered || selected ? 0.95 : item.kind === "Through" ? 0.7 : 0.58}
        strokeDasharray={item.kind === "Through" ? "9 5" : undefined}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <line
        x1={item.start.x}
        y1={item.start.y}
        x2={item.end.x}
        y2={item.end.y}
        stroke="transparent"
        strokeWidth={28}
        vectorEffect="non-scaling-stroke"
        className="cursor-move"
        onPointerDown={moveWhole}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      {selected || hovered ? <text
        x={(item.start.x + item.end.x) / 2}
        y={(item.start.y + item.end.y) / 2 - 14}
        textAnchor="middle"
        fontSize={16}
        fontWeight={800}
        fill={hovered ? "#0284c7" : family.color}
        paintOrder="stroke"
        stroke="white"
        strokeWidth={5}
        pointerEvents="none"
      >
        {item.id} · {family.mark}
      </text> : null}
      {selected && interactive
        ? [item.start, item.end].map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={1}
              fill="transparent"
              stroke="transparent"
              strokeWidth={18}
              vectorEffect="non-scaling-stroke"
              pointerEvents="all"
              className="cursor-crosshair"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                store.captureUndo();
                setDrag({ type: i ? "end" : "start" });
              }}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
            />
          ))
        : null}
    </g>
  );
}

function SlabShape({
  item,
  snap,
  resolveSnap,
  onSnapTarget,
  onSelect,
}: {
  item: SlabPlate;
  snap: boolean;
  resolveSnap: (
    point: Point,
    excludeId?: string,
    origin?: Point,
    threshold?: number,
  ) => SnapResult;
  onSnapTarget: (target: SnapCandidate | null) => void;
  onSelect: () => void;
}) {
  type SlabDrag =
    | { type: "vertex"; index: number }
    | { type: "move"; origin: Point; points: Point[]; voids: Point[][] };
  const store = useStructuralStore();
  const canvasScale = useDrawingZoom();
  const family = store.slabFamilies.find((x) => x.id === item.familyId)!;
  const selected = store.selectedId === item.id;
  const [hovered, setHovered] = useState(false);
  const [drag, setDrag] = useState<SlabDrag | null>(null);
  const c = centroid(item.points);
  const area = zoneAreaM2(
    item.points,
    item.voids,
    scaleForViewport(item.viewportId),
  );
  function move(e: ReactPointerEvent<SVGElement>) {
    if (!drag) return;
    const p = svgPoint(e as any);
    if (!p) return;
    if (drag.type === "vertex") {
      const result = snap
        ? resolveSnap(p, item.id, undefined, 24 / Math.max(0.01, canvasScale))
        : { point: p, target: null };
      onSnapTarget(result.target);
      store.updateSlab(item.id, {
        points: item.points.map((value, index) =>
          index === drag.index ? result.point : value,
        ),
      });
      return;
    }
    const dx = p.x - drag.origin.x,
      dy = p.y - drag.origin.y,
      rawPoints = drag.points.map((value) => ({
        x: value.x + dx,
        y: value.y + dy,
      })),
      rawVoids = drag.voids.map((voidPoints) =>
        voidPoints.map((value) => ({ x: value.x + dx, y: value.y + dy })),
      );
    if (!snap) {
      onSnapTarget(null);
      store.updateSlab(item.id, { points: rawPoints, voids: rawVoids });
      return;
    }
    const threshold = 24 / Math.max(0.01, canvasScale),
      choices = rawPoints
        .map((raw) => ({
          raw,
          result: resolveSnap(raw, item.id, undefined, threshold),
        }))
        .filter((choice) => choice.result.target)
        .sort(
          (a, b) =>
            distance(a.raw, a.result.point) - distance(b.raw, b.result.point),
        ),
      choice = choices[0];
    if (!choice) {
      onSnapTarget(null);
      store.updateSlab(item.id, { points: rawPoints, voids: rawVoids });
      return;
    }
    const snapDx = choice.result.point.x - choice.raw.x,
      snapDy = choice.result.point.y - choice.raw.y;
    onSnapTarget(choice.result.target);
    store.updateSlab(item.id, {
      points: rawPoints.map((value) => ({
        x: value.x + snapDx,
        y: value.y + snapDy,
      })),
      voids: rawVoids.map((voidPoints) =>
        voidPoints.map((value) => ({
          x: value.x + snapDx,
          y: value.y + snapDy,
        })),
      ),
    });
  }
  function stop() {
    setDrag(null);
    onSnapTarget(null);
  }
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        store.select(item.id);
        onSelect();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <title>{item.id + " · " + family.description}</title>
      <polygon
        points={points(item.points)}
        fill={hovered ? "#0ea5e9" : family.color}
        fillOpacity={selected ? 0.3 : hovered ? 0.27 : 0.18}
        stroke={selected ? "#0f172a" : hovered ? "#0284c7" : family.color}
        strokeWidth={selected ? 5 : hovered ? 4 : 3}
        vectorEffect="non-scaling-stroke"
        className="cursor-move"
        onPointerDown={(e) => {
          const point = svgPoint(e as any);
          if (!point) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          store.captureUndo();
          store.select(item.id);
          onSelect();
          setDrag({
            type: "move",
            origin: point,
            points: item.points.map((value) => ({ ...value })),
            voids: item.voids.map((voidPoints) =>
              voidPoints.map((value) => ({ ...value })),
            ),
          });
        }}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      <text
        x={c.x}
        y={c.y}
        textAnchor="middle"
        fontSize={17}
        fontWeight={800}
        fill="#0f172a"
        paintOrder="stroke"
        stroke="white"
        strokeWidth={5}
        pointerEvents="none"
      >
        {family.mark} · {area.toFixed(1)} m²
      </text>
      {item.voids.map((v, i) => (
        <polygon
          key={i}
          points={points(v)}
          fill="white"
          fillOpacity={0.85}
          stroke="#ef4444"
          strokeWidth={3}
          strokeDasharray="8 5"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}
      {selected
        ? item.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={8}
              fill="white"
              stroke="#2563eb"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              className="cursor-crosshair"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                store.captureUndo();
                setDrag({ type: "vertex", index: i });
              }}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
            />
          ))
        : null}
    </g>
  );
}

function SectionEvidence({
  element,
  viewportId,
}: {
  element: StructuralElement;
  viewportId: string;
}) {
  if (element === "slab")
    return <SectionSlabOverlays viewportId={viewportId} />;
  if (element === "beams")
    return (
      <g pointerEvents="none">
        <line
          x1="340"
          y1="1120"
          x2="1420"
          y2="1120"
          stroke="#e11d48"
          strokeWidth={18}
        />
        <rect
          x="770"
          y="1120"
          width="180"
          height="115"
          fill="#e11d48"
          opacity={0.35}
          stroke="#e11d48"
          strokeWidth={5}
        />
        <text
          x="860"
          y="1080"
          textAnchor="middle"
          fontSize={22}
          fontWeight={800}
          fill="#be123c"
        >
          B2 · 300 × 600 · Downstand
        </text>
      </g>
    );
  return (
    <g pointerEvents="none">
      <rect
        x="790"
        y="750"
        width="90"
        height="950"
        fill="#2563eb"
        opacity={0.16}
        stroke="#2563eb"
        strokeWidth={6}
      />
      <line
        x1="760"
        y1="750"
        x2="910"
        y2="750"
        stroke="#2563eb"
        strokeWidth={4}
      />
      <line
        x1="760"
        y1="1700"
        x2="910"
        y2="1700"
        stroke="#2563eb"
        strokeWidth={4}
      />
      <text x="920" y="1230" fontSize={22} fontWeight={800} fill="#2563eb">
        C1 · 230 × 450 · 3.35 m
      </text>
    </g>
  );
}

type StoredSectionDrag = {
  id: string;
  part: "shape" | "top" | "bottom" | "start" | "end" | "step";
  origin: Point;
  profile: NonNullable<SlabPlate["sectionProfile"]>;
};

function SectionSlabOverlays({ viewportId }: { viewportId: string }) {
  const store = useStructuralStore();
  const [drag, setDrag] = useState<StoredSectionDrag | null>(null);
  const slabs = store.slabPlates.filter(
    (item) => item.viewportId === viewportId && item.sectionProfile,
  );
  const drawingScale = Math.max(0.0001, scaleForViewport(viewportId));
  function begin(
    event: ReactPointerEvent<SVGElement>,
    item: SlabPlate,
    part: StoredSectionDrag["part"],
  ) {
    const point = svgPoint(event as any);
    if (!point || !item.sectionProfile) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    store.captureUndo();
    store.select(item.id);
    setDrag({
      id: item.id,
      part,
      origin: point,
      profile: { ...item.sectionProfile },
    });
  }
  function move(event: ReactPointerEvent<SVGElement>) {
    if (!drag) return;
    const point = svgPoint(event as any);
    if (!point) return;
    const dx = point.x - drag.origin.x;
    const dy = point.y - drag.origin.y;
    const original = drag.profile;
    let profile = { ...original };
    if (drag.part === "shape")
      profile = {
        ...original,
        x0: original.x0 + dx,
        x1: original.x1 + dx,
        stepX: original.stepX + dx,
        topY: original.topY + dy,
        bottomY: original.bottomY + dy,
      };
    else if (drag.part === "top")
      profile.topY = Math.min(original.topY + dy, original.bottomY - 1);
    else if (drag.part === "bottom")
      profile.bottomY = Math.max(original.bottomY + dy, original.topY + 1);
    else if (drag.part === "start")
      profile.x0 = Math.min(original.x0 + dx, original.stepX - 2);
    else if (drag.part === "end")
      profile.x1 = Math.max(original.x1 + dx, original.stepX + 2);
    else {
      profile.stepX = Math.max(
        original.x0 + 2,
        Math.min(original.x1 - 2, original.stepX + dx),
      );
      profile.stepOffset = original.stepOffset + dy;
    }
    const thicknessOverrideMm = Math.max(
      1,
      Math.round(
        Math.abs(profile.bottomY - profile.topY) * SECTION_SLAB_MM_PER_PX,
      ),
    );
    store.updateSlab(drag.id, { sectionProfile: profile, thicknessOverrideMm });
  }
  const stop = () => setDrag(null);
  return (
    <g>
      {slabs.map((item) => {
        const profile = item.sectionProfile!;
        const active = store.selectedId === item.id;
        const family = store.slabFamilies.find(
          (value) => value.id === item.familyId,
        );
        const color = family?.color || "#2563eb";
        const top2 = profile.topY + profile.stepOffset;
        const bottom2 = profile.bottomY + profile.stepOffset;
        const top = `${profile.x0},${profile.topY} ${profile.stepX},${profile.topY} ${profile.stepX},${top2} ${profile.x1},${top2}`;
        const bottom = `${profile.x0},${profile.bottomY} ${profile.stepX},${profile.bottomY} ${profile.stepX},${bottom2} ${profile.x1},${bottom2}`;
        const fill = `${profile.x0},${profile.topY} ${profile.stepX},${profile.topY} ${profile.stepX},${top2} ${profile.x1},${top2} ${profile.x1},${bottom2} ${profile.stepX},${bottom2} ${profile.stepX},${profile.bottomY} ${profile.x0},${profile.bottomY}`;
        return (
          <g
            key={item.id}
            onClick={(event) => {
              event.stopPropagation();
              store.select(item.id);
            }}
          >
            <polygon
              points={fill}
              fill={color}
              fillOpacity={active ? 0.18 : 0.1}
              stroke={active ? color : "none"}
              strokeDasharray="8 5"
              className="cursor-move"
              onPointerDown={(event) => begin(event, item, "shape")}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
            />
            {[
              [bottom, "bottom", "#475569"],
              [top, "top", color],
            ].map(([pointsValue, part, lineColor]) => (
              <g key={part}>
                <polyline
                  points={pointsValue}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={active ? 3 : 2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <polyline
                  points={pointsValue}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={24}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  className="cursor-row-resize"
                  onPointerDown={(event) =>
                    begin(event, item, part as "top" | "bottom")
                  }
                  onPointerMove={move}
                  onPointerUp={stop}
                  onPointerCancel={stop}
                />
              </g>
            ))}
            {active
              ? [
                  [profile.x0, (profile.topY + profile.bottomY) / 2, "start"],
                  [profile.x1, (top2 + bottom2) / 2, "end"],
                  [
                    profile.stepX,
                    (profile.topY + profile.bottomY + top2 + bottom2) / 4,
                    "step",
                  ],
                ].map(([x, y, part]) => (
                  <rect
                    key={part}
                    x={(x as number) - 8}
                    y={(y as number) - 8}
                    width={16}
                    height={16}
                    rx={3}
                    fill="white"
                    stroke={part === "step" ? "#f59e0b" : color}
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                    className={
                      part === "step" ? "cursor-move" : "cursor-col-resize"
                    }
                    onPointerDown={(event) =>
                      begin(event, item, part as StoredSectionDrag["part"])
                    }
                    onPointerMove={move}
                    onPointerUp={stop}
                    onPointerCancel={stop}
                  />
                ))
              : null}
            <text
              x={(profile.x0 + profile.x1) / 2}
              y={Math.min(profile.topY, top2) - 20}
              textAnchor="middle"
              fontSize={13}
              fontWeight={800}
              fill={color}
              paintOrder="stroke"
              stroke="white"
              strokeWidth={3}
              pointerEvents="none"
            >
              {family?.mark || item.familyId} ·{" "}
              {item.thicknessOverrideMm || family?.thicknessMm || 0} mm slab ·{" "}
              {((profile.x1 - profile.x0) * drawingScale).toFixed(2)} m run
            </text>
          </g>
        );
      })}
    </g>
  );
}

type SectionSlab = {
  id: string;
  x0: number;
  x1: number;
  stepX: number;
  topY: number;
  bottomY: number;
  stepOffset: number;
};
type SectionSlabDrag = {
  id: string;
  part: "shape" | "top" | "bottom" | "start" | "end" | "step";
  origin: Point;
  original: SectionSlab;
};

function EditableSlabSection() {
  const [slabs, setSlabs] = useState<SectionSlab[]>([
    {
      id: "S1",
      x0: 320,
      x1: 1460,
      stepX: 760,
      topY: 1110,
      bottomY: 1140,
      stepOffset: -15,
    },
  ]);
  const [selectedId, setSelectedId] = useState("S1");
  const [drag, setDrag] = useState<SectionSlabDrag | null>(null);
  const selected = slabs.find((item) => item.id === selectedId);
  function add() {
    const index = slabs.length + 1,
      id = `S${index}`;
    setSlabs((items) => [
      ...items,
      {
        id,
        x0: 400,
        x1: 1320,
        stepX: 850,
        topY: 1190 + (index - 2) * 70,
        bottomY: 1220 + (index - 2) * 70,
        stepOffset: 0,
      },
    ]);
    setSelectedId(id);
  }
  function remove() {
    if (!selectedId) return;
    setSlabs((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId("");
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        remove();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selectedId]);
  function begin(
    e: ReactPointerEvent<SVGElement>,
    item: SectionSlab,
    part: SectionSlabDrag["part"],
  ) {
    const p = svgPoint(e as any);
    if (!p) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(item.id);
    setDrag({ id: item.id, part, origin: p, original: { ...item } });
  }
  function move(e: ReactPointerEvent<SVGElement>) {
    if (!drag) return;
    const p = svgPoint(e as any);
    if (!p) return;
    const dx = p.x - drag.origin.x,
      dy = p.y - drag.origin.y,
      o = drag.original;
    setSlabs((items) =>
      items.map((item) => {
        if (item.id !== drag.id) return item;
        if (drag.part === "shape")
          return {
            ...o,
            x0: o.x0 + dx,
            x1: o.x1 + dx,
            stepX: o.stepX + dx,
            topY: o.topY + dy,
            bottomY: o.bottomY + dy,
          };
        if (drag.part === "top")
          return { ...item, topY: Math.min(o.topY + dy, o.bottomY - 8) };
        if (drag.part === "bottom")
          return { ...item, bottomY: Math.max(o.bottomY + dy, o.topY + 8) };
        if (drag.part === "start")
          return { ...item, x0: Math.min(o.x0 + dx, o.stepX - 20) };
        if (drag.part === "end")
          return { ...item, x1: Math.max(o.x1 + dx, o.stepX + 20) };
        return {
          ...item,
          stepX: Math.max(item.x0 + 20, Math.min(item.x1 - 20, o.stepX + dx)),
          stepOffset: o.stepOffset + dy,
        };
      }),
    );
  }
  const stop = () => setDrag(null);
  return (
    <g onClick={() => setSelectedId("")}>
      <g transform="translate(330 955)">
        <rect width="245" height="48" rx="12" fill="white" stroke="#cbd5e1" />
        <text
          x="18"
          y="31"
          fontSize="17"
          fontWeight="800"
          fill="#334155"
          pointerEvents="none"
        >
          Section slabs
        </text>
        <g
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            add();
          }}
        >
          <rect x="130" y="7" width="50" height="34" rx="9" fill="#2563eb" />
          <text
            x="155"
            y="30"
            textAnchor="middle"
            fontSize="22"
            fontWeight="800"
            fill="white"
            pointerEvents="none"
          >
            +
          </text>
        </g>
        <g
          className={selected ? "cursor-pointer" : ""}
          opacity={selected ? 1 : 0.35}
          onClick={(e) => {
            e.stopPropagation();
            if (selected) remove();
          }}
        >
          <rect
            x="187"
            y="7"
            width="50"
            height="34"
            rx="9"
            fill="#fff"
            stroke="#fecaca"
          />
          <text
            x="212"
            y="29"
            textAnchor="middle"
            fontSize="17"
            fontWeight="800"
            fill="#dc2626"
            pointerEvents="none"
          >
            Del
          </text>
        </g>
      </g>
      {slabs.map((item) => {
        const active = item.id === selectedId,
          top2 = item.topY + item.stepOffset,
          bottom2 = item.bottomY + item.stepOffset;
        const top = `${item.x0},${item.topY} ${item.stepX},${item.topY} ${item.stepX},${top2} ${item.x1},${top2}`,
          bottom = `${item.x0},${item.bottomY} ${item.stepX},${item.bottomY} ${item.stepX},${bottom2} ${item.x1},${bottom2}`,
          fill = `${item.x0},${item.topY} ${item.stepX},${item.topY} ${item.stepX},${top2} ${item.x1},${top2} ${item.x1},${bottom2} ${item.stepX},${bottom2} ${item.stepX},${item.bottomY} ${item.x0},${item.bottomY}`,
          thickness = Math.round((item.bottomY - item.topY) * 5);
        return (
          <g
            key={item.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(item.id);
            }}
          >
            <polygon
              points={fill}
              fill="#2563eb"
              fillOpacity={active ? 0.16 : 0.09}
              stroke={active ? "#60a5fa" : "none"}
              strokeDasharray="8 5"
              className="cursor-move"
              onPointerDown={(e) => begin(e, item, "shape")}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
            />
            {[
              [bottom, "bottom", "#475569"],
              [top, "top", "#2563eb"],
            ].map(([value, part, color]) => (
              <g key={part}>
                <polyline
                  points={value}
                  fill="none"
                  stroke={color}
                  strokeWidth={active ? 5 : 4}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <polyline
                  points={value}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.001}
                  strokeWidth={26}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  className="cursor-row-resize"
                  onPointerDown={(e) =>
                    begin(e, item, part as "top" | "bottom")
                  }
                  onPointerMove={move}
                  onPointerUp={stop}
                  onPointerCancel={stop}
                />
              </g>
            ))}
            {active ? (
              <>
                {[
                  [item.x0, (item.topY + item.bottomY) / 2, "start"],
                  [item.x1, (top2 + bottom2) / 2, "end"],
                  [
                    item.stepX,
                    (item.topY + item.bottomY + top2 + bottom2) / 4,
                    "step",
                  ],
                ].map(([x, y, part]) => (
                  <circle
                    key={part}
                    cx={x as number}
                    cy={y as number}
                    r={9}
                    fill="white"
                    stroke={part === "step" ? "#f59e0b" : "#2563eb"}
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                    className={
                      part === "step" ? "cursor-move" : "cursor-col-resize"
                    }
                    onPointerDown={(e) =>
                      begin(e, item, part as SectionSlabDrag["part"])
                    }
                    onPointerMove={move}
                    onPointerUp={stop}
                    onPointerCancel={stop}
                  />
                ))}
              </>
            ) : null}
            <rect
              x={(item.x0 + item.x1) / 2 - 155}
              y={Math.min(item.topY, top2) - 48}
              width="310"
              height="34"
              rx="9"
              fill="white"
              fillOpacity={0.94}
              stroke={active ? "#60a5fa" : "#bfdbfe"}
              pointerEvents="none"
            />
            <text
              x={(item.x0 + item.x1) / 2}
              y={Math.min(item.topY, top2) - 25}
              textAnchor="middle"
              fontSize="20"
              fontWeight="800"
              fill="#2563eb"
              pointerEvents="none"
            >
              {item.id} · {thickness} mm slab ·{" "}
              {((item.x1 - item.x0) * 0.018).toFixed(1)} m run
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Draft({ points: items }: { points: Point[] }) {
  return (
    <g pointerEvents="none">
      <polygon
        points={points(items)}
        fill={items.length > 2 ? "rgba(37,99,235,.14)" : "none"}
        stroke="#2563eb"
        strokeWidth={4}
        strokeDasharray="8 5"
        vectorEffect="non-scaling-stroke"
      />
      {items.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={7}
          fill="#2563eb"
          stroke="white"
          strokeWidth={3}
        />
      ))}
    </g>
  );
}
function Measure({
  points: items,
  label,
}: {
  points: Point[];
  label: string | null;
}) {
  const a = items[0],
    b = items[1] || a;
  return (
    <g pointerEvents="none">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#dc2626"
        strokeWidth={4}
      />
      <circle
        cx={a.x}
        cy={a.y}
        r={7}
        fill="white"
        stroke="#dc2626"
        strokeWidth={3}
      />
      <circle
        cx={b.x}
        cy={b.y}
        r={7}
        fill="white"
        stroke="#dc2626"
        strokeWidth={3}
      />
      {label ? (
        <text
          x={(a.x + b.x) / 2}
          y={(a.y + b.y) / 2 - 14}
          textAnchor="middle"
          fontSize={18}
          fontWeight={800}
          fill="#b91c1c"
          paintOrder="stroke"
          stroke="white"
          strokeWidth={6}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}
function SnapIndicator({ target }: { target: SnapCandidate }) {
  const zoom = useDrawingZoom(),
    scale = 1 / Math.max(0.2, zoom),
    width = Math.max(86, target.label.length * 8 + 20);
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

function StructuralInspector({
  element,
  id,
}: {
  element: StructuralElement;
  id: string;
}) {
  const store = useStructuralStore();
  if (element === "columns") {
    const item = store.columns.find((x) => x.id === id);
    if (!item) return null;
    return <ColumnInspector item={item} />;
  }
  if (element === "beams") {
    const item = store.beams.find((x) => x.id === id);
    if (!item) return null;
    return <BeamInspector item={item} />;
  }
  const item = store.slabPlates.find((x) => x.id === id);
  if (!item) return null;
  return <SlabInspector item={item} />;
}

function ColumnInspector({ item }: { item: ColumnInstance }) {
  const store = useStructuralStore();
  const itemFamily =
    store.columnFamilies.find((value) => value.id === item.familyId) ||
    store.columnFamilies[0];
  const itemSection = effectiveColumnSection(item, itemFamily);
  const [draft, setDraft] = useState({
    familyId: item.familyId,
    widthMm: itemSection.widthMm,
    depthMm: itemSection.depthMm,
    diameterMm: itemSection.diameterMm,
    heightM: item.heightM,
    floorId: item.floorId,
    viewportId: item.viewportId,
    status: item.status,
  });
  useEffect(() => {
    const family =
      store.columnFamilies.find((value) => value.id === item.familyId) ||
      store.columnFamilies[0];
    const section = effectiveColumnSection(item, family);
    setDraft({
      familyId: item.familyId,
      widthMm: section.widthMm,
      depthMm: section.depthMm,
      diameterMm: section.diameterMm,
      heightM: item.heightM,
      floorId: item.floorId,
      viewportId: item.viewportId,
      status: item.status,
    });
  }, [
    item.id,
    item.familyId,
    item.widthOverrideMm,
    item.depthOverrideMm,
    item.diameterOverrideMm,
    item.heightM,
    item.floorId,
    item.viewportId,
    item.status,
    store.columnFamilies,
  ]);
  const family =
    store.columnFamilies.find((value) => value.id === draft.familyId) ||
    store.columnFamilies[0];
  const width =
    (family.shape === "Circular" ? draft.diameterMm : draft.widthMm) / 1000;
  const depth =
    (family.shape === "Circular" ? draft.diameterMm : draft.depthMm) / 1000;
  const volume =
    family.shape === "Circular"
      ? Math.PI * (width / 2) ** 2 * draft.heightM
      : width * depth * draft.heightM;
  const girth =
    family.shape === "Circular" ? Math.PI * width : 2 * (width + depth);
  function apply(nextDraft: typeof draft) {
    setDraft(nextDraft);
    const nextFamily =
      store.columnFamilies.find((value) => value.id === nextDraft.familyId) ||
      family;
    const drawingScale = Math.max(
      0.0001,
      scaleForViewport(nextDraft.viewportId),
    );
    const widthMm =
        nextFamily.shape === "Circular"
          ? nextDraft.diameterMm
          : nextDraft.widthMm,
      depthMm =
        nextFamily.shape === "Circular"
          ? nextDraft.diameterMm
          : nextDraft.depthMm;
    const width = widthMm / 1000 / drawingScale,
      height = depthMm / 1000 / drawingScale;
    const center = {
      x: item.bbox.x + item.bbox.width / 2,
      y: item.bbox.y + item.bbox.height / 2,
    };
    store.updateColumn(item.id, {
      familyId: nextDraft.familyId,
      widthOverrideMm:
        nextFamily.shape === "Circular" ? undefined : nextDraft.widthMm,
      depthOverrideMm:
        nextFamily.shape === "Circular" ? undefined : nextDraft.depthMm,
      diameterOverrideMm:
        nextFamily.shape === "Circular" ? nextDraft.diameterMm : undefined,
      heightM: nextDraft.heightM,
      floorId: nextDraft.floorId,
      viewportId: nextDraft.viewportId,
      status: nextDraft.status,
      bbox: {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      },
    });
  }
  function changeFamily(familyId: string) {
    const next =
      store.columnFamilies.find((value) => value.id === familyId) || family;
    apply({
      ...draft,
      familyId,
      widthMm: next.widthMm,
      depthMm: next.depthMm,
      diameterMm: next.diameterMm || next.widthMm,
    });
  }
  return (
    <Inspector
      title={item.id}
      subtitle={`${family.mark} · ${floorName(draft.floorId)}`}
    >
      <Select
        label="Family"
        value={draft.familyId}
        options={store.columnFamilies.map((value) => [
          value.id,
          `${value.mark} — ${value.description}`,
        ])}
        onChange={changeFamily}
      />
      <StructuralLocationFields
        element="columns"
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={(patch) => apply({ ...draft, ...patch })}
      />
      {family.shape === "Circular" ? (
        <NumberField
          label="Diameter (mm)"
          value={draft.diameterMm}
          onChange={(diameterMm) => apply({ ...draft, diameterMm })}
        />
      ) : (
        <>
          <NumberField
            label="Width (mm)"
            value={draft.widthMm}
            onChange={(widthMm) => apply({ ...draft, widthMm })}
          />
          <NumberField
            label="Depth (mm)"
            value={draft.depthMm}
            onChange={(depthMm) => apply({ ...draft, depthMm })}
          />
        </>
      )}
      <NumberField
        label="Height (m)"
        value={draft.heightM}
        onChange={(heightM) => apply({ ...draft, heightM })}
      />
      <Info label="Concrete volume" value={`${volume.toFixed(3)} m³`} />
      <Info
        label="Formwork"
        value={`${(girth * draft.heightM).toFixed(2)} m²`}
      />
      <SaveState />
      <button
        className="h-10 w-full rounded-xl border border-red-200 text-sm font-semibold text-red-600"
        onClick={() => store.deleteColumn(item.id)}
      >
        Delete column
      </button>
    </Inspector>
  );
}

function BeamInspector({ item }: { item: BeamRun }) {
  const store = useStructuralStore();
  const [draft, setDraft] = useState({
    familyId: item.familyId,
    kind: item.kind,
    dropMm: item.dropMm,
    floorId: item.floorId,
    viewportId: item.viewportId,
    status: item.status,
  });
  useEffect(
    () =>
      setDraft({
        familyId: item.familyId,
        kind: item.kind,
        dropMm: item.dropMm,
        floorId: item.floorId,
        viewportId: item.viewportId,
        status: item.status,
      }),
    [
      item.id,
      item.familyId,
      item.kind,
      item.dropMm,
      item.floorId,
      item.viewportId,
      item.status,
    ],
  );
  function apply(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    store.updateBeam(item.id, next);
  }
  const family =
      store.beamFamilies.find((x) => x.id === draft.familyId) ||
      store.beamFamilies[0],
    length =
      distance(item.start, item.end) * scaleForViewport(draft.viewportId),
    concrete =
      (length *
        (family.widthMm / 1000) *
        (draft.kind === "Downstand"
          ? Math.max(draft.dropMm, 1)
          : family.depthMm)) /
      1000,
    formwork =
      length *
      ((family.widthMm +
        2 * (draft.kind === "Downstand" ? draft.dropMm : family.depthMm)) /
        1000);
  return (
    <Inspector
      title={item.id}
      subtitle={`${family.mark} · ${floorName(draft.floorId)}`}
    >
      <Select
        label="Family"
        value={draft.familyId}
        options={store.beamFamilies.map((x) => [
          x.id,
          `${x.mark} — ${x.description}`,
        ])}
        onChange={(familyId) => apply({ familyId })}
      />
      <Select
        label="Kind"
        value={draft.kind}
        options={[
          ["Downstand", "Downstand"],
          ["Through", "Through"],
        ]}
        onChange={(kind) => apply({ kind: kind as BeamRun["kind"] })}
      />
      <StructuralLocationFields
        element="beams"
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={apply}
      />
      <Info
        label="Section"
        value={`${family.widthMm} × ${family.depthMm} mm`}
      />
      <Info label="Live length" value={`${length.toFixed(2)} m`} />
      {draft.kind === "Downstand" ? (
        <NumberField
          label="Drop (mm)"
          value={draft.dropMm}
          onChange={(dropMm) => apply({ dropMm })}
        />
      ) : (
        <Info label="Slab effect" value="Deducted from slab plate" />
      )}
      <Info label="Concrete volume" value={`${concrete.toFixed(3)} m³`} />
      <Info label="Formwork" value={`${formwork.toFixed(2)} m²`} />
      <SaveState />
      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-9 rounded-lg border border-slate-200 text-xs font-semibold"
          onClick={() => splitBeam(item)}
        >
          Split
        </button>
        <button
          className="h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-400"
          title="Select two touching runs to merge"
        >
          Merge
        </button>
      </div>
      <button
        className="h-10 w-full rounded-xl border border-red-200 text-sm font-semibold text-red-600"
        onClick={() => store.deleteBeam(item.id)}
      >
        Delete beam
      </button>
    </Inspector>
  );
}

function SlabInspector({ item }: { item: SlabPlate }) {
  const store = useStructuralStore();
  const familyCurrent =
    store.slabFamilies.find((x) => x.id === item.familyId) ||
    store.slabFamilies[0];
  const [draft, setDraft] = useState({
    familyId: item.familyId,
    thicknessOverrideMm: item.thicknessOverrideMm || familyCurrent.thicknessMm,
    floorId: item.floorId,
    viewportId: item.viewportId,
    status: item.status,
    thicknessStatus: item.thicknessStatus,
  });
  useEffect(() => {
    const f =
      store.slabFamilies.find((x) => x.id === item.familyId) ||
      store.slabFamilies[0];
    setDraft({
      familyId: item.familyId,
      thicknessOverrideMm: item.thicknessOverrideMm || f.thicknessMm,
      floorId: item.floorId,
      viewportId: item.viewportId,
      status: item.status,
      thicknessStatus: item.thicknessStatus,
    });
  }, [
    item.id,
    item.familyId,
    item.thicknessOverrideMm,
    item.floorId,
    item.viewportId,
    item.status,
    item.thicknessStatus,
  ]);
  function apply(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    const sectionProfile =
      item.sectionProfile && patch.thicknessOverrideMm !== undefined
        ? {
            ...item.sectionProfile,
            bottomY:
              item.sectionProfile.topY +
              patch.thicknessOverrideMm / SECTION_SLAB_MM_PER_PX,
          }
        : item.sectionProfile;
    store.updateSlab(item.id, { ...next, sectionProfile });
  }
  const family =
      store.slabFamilies.find((x) => x.id === draft.familyId) ||
      store.slabFamilies[0],
    area = zoneAreaM2(
      item.points,
      item.voids,
      scaleForViewport(draft.viewportId),
    ),
    through = throughDeduct(item),
    volume = Math.max(0, area - through) * (draft.thicknessOverrideMm / 1000),
    variableThickness = draft.thicknessStatus === "varies";
  return (
    <Inspector
      title={item.id}
      subtitle={`${family.mark} · ${floorName(draft.floorId)}`}
    >
      <Select
        label="Family"
        value={draft.familyId}
        options={store.slabFamilies.map((x) => [
          x.id,
          `${x.mark} — ${x.description}`,
        ])}
        onChange={(familyId) => apply({ familyId })}
      />
      <StructuralLocationFields
        element="slab"
        floorId={draft.floorId}
        viewportId={draft.viewportId}
        status={draft.status}
        onChange={apply}
      />
      {item.sectionProfile ? (
        <Info
          label="Section run"
          value={`${((item.sectionProfile.x1 - item.sectionProfile.x0) * scaleForViewport(draft.viewportId)).toFixed(2)} m`}
        />
      ) : (
        <Info label="Gross plate area" value={`${area.toFixed(2)} m²`} />
      )}
      <Info label="Drawing evidence" value={family.source} />
      {variableThickness ? (
        <Info
          label="Thickness evidence"
          value={`Varies ${item.thicknessRangeMm?.[0] || 0}–${item.thicknessRangeMm?.[1] || 0} mm by structural panel`}
        />
      ) : (
        <NumberField
          label="Thickness (mm)"
          value={draft.thicknessOverrideMm}
          onChange={(thicknessOverrideMm) => apply({ thicknessOverrideMm })}
        />
      )}
      {item.sectionProfile ? (
        <Info
          label="Quantity source"
          value="Section evidence · link a plan slab for area"
        />
      ) : (
        <>
          <Info
            label="Through-beam deducts"
            value={`${through.toFixed(2)} m²`}
          />
          <Info label="Voids" value={`${item.voids.length}`} />
          <Info label="Net slab area" value={`${Math.max(0, area - through).toFixed(2)} m²`} />
          <Info
            label="Net concrete"
            value={variableThickness ? "Pending thickness-zone split" : `${volume.toFixed(2)} m³`}
          />
          {item.quantityExcludedReason ? (
            <Info label="BOQ state" value={item.quantityExcludedReason} />
          ) : null}
        </>
      )}
      <SaveState
        message={
          variableThickness
            ? "Area saved · split and verify thickness zones before BOQ"
            : undefined
        }
        warning={variableThickness}
      />
      <button
        className="h-10 w-full rounded-xl border border-red-200 text-sm font-semibold text-red-600"
        onClick={() => store.deleteSlab(item.id)}
      >
        Delete plate
      </button>
    </Inspector>
  );
}

function StructuralLocationFields({
  element,
  floorId,
  viewportId,
  status,
  onChange,
}: {
  element: StructuralElement;
  floorId: string;
  viewportId: string;
  status: DemoStatus;
  onChange: (patch: {
    floorId?: string;
    viewportId?: string;
    status?: DemoStatus;
  }) => void;
}) {
  const drawings = useDemoStore((s) => s.viewports);
  const storeys = useDemoStore((s) => s.storeys);
  return (
    <>
      <Select
        label="Storey"
        value={floorId}
        options={storeys.map((storey) => [storey.id, storey.name])}
        onChange={(value) => onChange({ floorId: value })}
      />
      <Select
        label="Drawing / viewport"
        value={viewportId}
        options={drawings
          .filter(
            (drawing) =>
              viewports[element].includes(drawing.id) &&
              drawing.category === "plan",
          )
          .map((drawing) => [drawing.id, drawing.name])}
        onChange={(value) => onChange({ viewportId: value })}
      />
      <Select
        label="Status"
        value={status}
        options={[
          ["ready", "Ready"],
          ["needs_review", "Needs review"],
          ["confirmed", "Confirmed"],
        ]}
        onChange={(value) => onChange({ status: value as DemoStatus })}
      />
    </>
  );
}

function Inspector({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Selected item
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function SaveState({
  message = "Saved · confirm quantities in Workbook",
  warning = false,
}: {
  message?: string;
  warning?: boolean;
} = {}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
        warning
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {message}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right text-slate-800">{value}</strong>
    </div>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input
        type="number"
        className="input mt-1 w-full"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input
        className="input mt-1 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <select
        className="input mt-1 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

type StructuralRow = {
  key: string;
  familyId: string;
  familyLabel: string;
  floorId: string;
  scope: string;
  calc: string;
  qty: number;
  unit: string;
  extra: string;
  source: string;
  entityId: string;
};
function StructuralWorkbook({
  projectId,
  element,
}: {
  projectId: string;
  element: StructuralElement;
}) {
  const search = useSearchParams();
  const store = useStructuralStore();
  const rows = useStructuralRows(element);
  const [selected, setSelected] = useState(
    search.get("row") || rows[0]?.key || "",
  );
  const row = rows.find((x) => x.key === selected) || rows[0];
  const [familyFilter, setFamilyFilter] = useState("all");
  const visible =
    familyFilter === "all"
      ? rows
      : rows.filter((x) => x.familyId === familyFilter);
  const total = visible.reduce(
    (sum, x) => sum + (store.workbookOverrides[x.key] ?? x.qty),
    0,
  );
  return (
    <ResizableThreePane
      storageKey={`takeoff:${element}:workbook`}
      defaultLeft={240}
      defaultRight={320}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <aside className="border-r border-slate-200 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Quantity tree
        </p>
        <button
          onClick={() => setFamilyFilter("all")}
          className={
            familyFilter === "all"
              ? "mb-2 w-full rounded-xl bg-slate-950 p-3 text-left text-sm font-semibold text-white"
              : "mb-2 w-full rounded-xl bg-slate-50 p-3 text-left text-sm font-semibold"
          }
        >
          {elementLabel[element]}{" "}
          <span className="float-right">{rows.length}</span>
        </button>
        {families(element).map((f) => (
          <div key={f.id} className="mb-2">
            <button
              onClick={() => setFamilyFilter(f.id)}
              className={
                familyFilter === f.id
                  ? "w-full rounded-lg bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-700"
                  : "w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
              }
            >
              {f.mark} · {familySize(element, f)}
            </button>
            {rows
              .filter((x) => x.familyId === f.id)
              .map((x) => (
                <button
                  key={x.key}
                  onClick={() => {
                    setFamilyFilter(f.id);
                    setSelected(x.key);
                  }}
                  className="block w-full px-6 py-1.5 text-left text-[11px] text-slate-500 hover:text-blue-700"
                >
                  {x.scope}
                </button>
              ))}
          </div>
        ))}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">
              {elementLabel[element]} workbook
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Family → floor. Typical floors use the model factor.
            </p>
          </div>
          <div className="rounded-xl bg-blue-50 px-4 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">
              Visible total
            </p>
            <strong className="text-lg text-blue-700">
              {total.toFixed(2)} {visible[0]?.unit || ""}
            </strong>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Family</th>
                <th className="px-4 py-3">Floor</th>
                <th className="px-4 py-3">Calculation</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => {
                const confirmed = store.workbookConfirmed[x.key];
                const value = store.workbookOverrides[x.key] ?? x.qty;
                return (
                  <tr
                    key={x.key}
                    onClick={() => setSelected(x.key)}
                    className={
                      x.key === row?.key
                        ? "cursor-pointer border-t border-blue-100 bg-blue-50/60"
                        : "cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    }
                  >
                    <td className="px-4 py-3">
                      <strong>{x.familyId}</strong>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {x.familyLabel}
                      </p>
                    </td>
                    <td className="px-4 py-3">{x.scope}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {x.calc}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 font-semibold"
                        value={Number(value.toFixed(2))}
                        onChange={(e) =>
                          store.setWorkbookOverride(
                            x.key,
                            Number(e.target.value),
                          )
                        }
                      />
                      <span className="ml-2 text-slate-500">{x.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{x.extra}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          confirmed
                            ? "rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700"
                            : "rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700"
                        }
                      >
                        {confirmed ? "Confirmed" : "Ready"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      <aside className="flex flex-col border-l border-slate-200">
        <div className="flex-1 space-y-4 p-5">
          {row ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Selected quantity
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  {row.familyId} · {row.scope}
                </h3>
              </div>
              <Info label="Source" value={row.source} />
              <Info label="Calculation" value={row.calc} />
              <Info
                label="Quantity"
                value={`${(store.workbookOverrides[row.key] ?? row.qty).toFixed(2)} ${row.unit}`}
              />
              <Info label="Detail" value={row.extra} />
              <Link
                href={`${appRoutes.takeoff(projectId, element, "dimension")}?entity=${row.entityId}`}
                className="flex h-10 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
              >
                Show on drawing
              </Link>
            </>
          ) : null}
        </div>
        {row ? (
          <div className="border-t border-slate-200 p-4">
            <button
              onClick={() => store.confirmWorkbook(row.key, true)}
              className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {store.workbookConfirmed[row.key]
                ? "Confirmed"
                : "Confirm quantity"}
            </button>
          </div>
        ) : null}
      </aside>
    </ResizableThreePane>
  );
}

function useStructuralRows(element: StructuralElement) {
  const store = useStructuralStore();
  return useMemo<StructuralRow[]>(() => {
    const rows: StructuralRow[] = [];
    if (element === "columns") {
      for (const f of store.columnFamilies) {
        const items = store.columns.filter((x) => x.familyId === f.id);
        for (const floorId of [...new Set(items.map((x) => x.floorId))]) {
          const group = items.filter((x) => x.floorId === floorId),
            factor = floorFactor(floorId),
            count = group.length * factor;
          const volume =
            group.reduce(
              (s, x) =>
                s +
                (f.shape === "Circular"
                  ? Math.PI * ((f.diameterMm || f.widthMm) / 2000) ** 2
                  : (f.widthMm / 1000) * (f.depthMm / 1000)) *
                  x.heightM,
              0,
            ) * factor;
          const girth =
            f.shape === "Circular"
              ? (Math.PI * (f.diameterMm || f.widthMm)) / 1000
              : (2 * (f.widthMm + f.depthMm)) / 1000;
          const formwork =
            group.reduce((s, x) => s + girth * x.heightM, 0) * factor;
          rows.push({
            key: `columns:${f.id}:${floorId}`,
            familyId: f.id,
            familyLabel: f.description,
            floorId,
            scope: floorName(floorId),
            calc:
              factor > 1
                ? `${group.length} × ${factor} = ${count}`
                : `${count}`,
            qty: count,
            unit: "nr",
            extra: `${volume.toFixed(2)} m³ · ${formwork.toFixed(2)} m² formwork`,
            source: f.source,
            entityId: group[0].id,
          });
        }
      }
    } else if (element === "beams") {
      for (const f of store.beamFamilies) {
        const items = store.beams.filter((x) => x.familyId === f.id);
        for (const floorId of [...new Set(items.map((x) => x.floorId))])
          for (const kind of [
            ...new Set(
              items.filter((x) => x.floorId === floorId).map((x) => x.kind),
            ),
          ]) {
            const group = items.filter(
                (x) => x.floorId === floorId && x.kind === kind,
              ),
              factor = floorFactor(floorId);
            const baseLength = group.reduce(
                (s, x) =>
                  s + distance(x.start, x.end) * scaleForViewport(x.viewportId),
                0,
              ),
              length = baseLength * factor;
            const volume =
              group.reduce(
                (s, x) =>
                  s +
                  distance(x.start, x.end) *
                    scaleForViewport(x.viewportId) *
                    (f.widthMm / 1000) *
                    ((x.kind === "Downstand"
                      ? Math.max(x.dropMm, 1)
                      : f.depthMm) /
                      1000),
                0,
              ) * factor;
            const formwork =
              group.reduce(
                (s, x) =>
                  s +
                  (distance(x.start, x.end) *
                    scaleForViewport(x.viewportId) *
                    (f.widthMm +
                      2 * (x.kind === "Downstand" ? x.dropMm : f.depthMm))) /
                    1000,
                0,
              ) * factor;
            rows.push({
              key: `beams:${f.id}:${floorId}:${kind}`,
              familyId: f.id,
              familyLabel: f.description,
              floorId,
              scope: `${floorName(floorId)} · ${kind}`,
              calc: `${baseLength.toFixed(2)} m × section${factor > 1 ? ` × ${factor}` : ""}`,
              qty: volume,
              unit: "m³",
              extra: `${length.toFixed(2)} m · ${formwork.toFixed(2)} m² formwork`,
              source: f.source,
              entityId: group[0].id,
            });
          }
      }
    } else {
      for (const f of store.slabFamilies) {
        const items = store.slabPlates.filter(
          (x) => x.familyId === f.id && !x.sectionProfile,
        );
        for (const floorId of [...new Set(items.map((x) => x.floorId))]) {
          const group = items.filter((x) => x.floorId === floorId),
            factor = floorFactor(floorId);
          const gross = group.reduce(
              (s, x) =>
                s +
                zoneAreaM2(x.points, x.voids, scaleForViewport(x.viewportId)),
              0,
            ),
            deduct = group.reduce((s, x) => s + throughDeduct(x), 0),
            thickness = (group[0].thicknessOverrideMm || f.thicknessMm) / 1000,
            variableThickness = group.some((item) => item.thicknessStatus === "varies"),
            netArea = Math.max(0, gross - deduct),
            qty = variableThickness ? netArea * factor : netArea * thickness * factor;
          rows.push({
            key: `slab:${f.id}:${floorId}`,
            familyId: f.id,
            familyLabel: f.description,
            floorId,
            scope: floorName(floorId),
            calc: variableThickness
              ? `(${gross.toFixed(2)} − ${deduct.toFixed(2)})${factor > 1 ? ` × ${factor}` : ""} · area control only`
              : `(${gross.toFixed(2)} − ${deduct.toFixed(2)}) × ${thickness.toFixed(3)}${factor > 1 ? ` × ${factor}` : ""}`,
            qty,
            unit: variableThickness ? "m²" : "m³",
            extra: variableThickness
              ? `Thickness varies by panel · concrete volume withheld`
              : `${f.thicknessMm} mm · ${deduct.toFixed(2)} m² through-beams`,
            source: f.source,
            entityId: group[0].id,
          });
        }
      }
    }
    return rows;
  }, [
    element,
    store.columns,
    store.beams,
    store.slabPlates,
    store.columnFamilies,
    store.beamFamilies,
    store.slabFamilies,
  ]);
}

function Structural3D({
  projectId,
  element,
}: {
  projectId: string;
  element: StructuralElement;
}) {
  const store = useStructuralStore();
  const [storey, setStorey] = useState("all");
  const [section, setSection] = useState("Off");
  const [visible, setVisible] = useState({
    columns: true,
    beams: true,
    slab: true,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const allItems =
    element === "columns"
      ? store.columns
      : element === "beams"
        ? store.beams
        : store.slabPlates;
  const visibleItems = allItems.filter(
    (x) => storey === "all" || x.floorId === storey,
  );
  const selectedItems = selectedIds
    .map((id) => allItems.find((x) => x.id === id))
    .filter(Boolean) as Array<ColumnInstance | BeamRun | SlabPlate>;
  function clearSelection() {
    setSelectedIds([]);
    store.select(null);
  }
  function selectItem(id: string, additive: boolean) {
    setSelectedIds((current) => {
      const next = additive
        ? current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id]
        : [id];
      store.select(next[next.length - 1] || null);
      return next;
    });
  }
  function changeStorey(value: string) {
    setStorey(value);
    clearSelection();
  }
  useEffect(() => {
    clearSelection();
  }, [element]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <ResizableTwoPane
      storageKey={`takeoff:${element}:3d`}
      defaultRight={330}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <main className="relative min-w-0 bg-slate-100">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-3">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Model layers
          </span>
          {(["columns", "beams", "slab"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}
              className={
                visible[key]
                  ? key === element
                    ? "rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold capitalize text-white"
                    : "rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold capitalize text-slate-600"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold capitalize text-slate-400 line-through"
              }
            >
              {key}
            </button>
          ))}
          <span className="ml-auto text-[11px] font-medium text-slate-400">
            Ctrl/Cmd-click to select multiple · Esc to clear
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            Colour: Type
          </span>
        </div>
        <div className="absolute left-4 top-20 z-10 flex flex-wrap gap-2">
          {[
            ["GF", "Ground"],
            ["FF", "First"],
            ["TYP", "Typical"],
            ["RF", "Terrace"],
            ["all", "All"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => changeStorey(key)}
              className={
                storey === key
                  ? "rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                  : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <StructuralScene
          element={element}
          storey={storey}
          visible={visible}
          selectedIds={selectedIds}
          onSelect={selectItem}
          onClear={clearSelection}
        />
        <div className="absolute bottom-5 left-5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {selectedIds.length ? "Selected" : "Visible model"}
          </p>
          <strong className="text-sm">
            {selectedIds.length || visibleItems.length}{" "}
            {elementLabel[element].toLowerCase()}
          </strong>
        </div>
        <label className="absolute bottom-5 right-5 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-600 shadow-lg">
          Section billboard
          <select
            className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option>Off</option>
            <option>Section A-A</option>
            <option>Section B-B</option>
          </select>
        </label>
        {section !== "Off" ? (
          <div className="absolute bottom-20 right-5 w-52 rounded-xl border-2 border-blue-500 bg-white p-2 shadow-xl">
            <img
              src={
                section.includes("A-A")
                  ? "/demo/sections/section-aa.jpg"
                  : "/demo/sections/section-bb.jpg"
              }
              alt={section}
              className="h-28 w-full rounded-lg object-cover"
            />
            <p className="mt-2 text-center text-xs font-semibold">{section}</p>
          </div>
        ) : null}
      </main>
      <aside className="overflow-y-auto border-l border-slate-200">
        <Structural3DSelectionPanel
          projectId={projectId}
          element={element}
          items={selectedItems}
          onClear={clearSelection}
        />
      </aside>
    </ResizableTwoPane>
  );
}

function StructuralScene({
  element,
  storey,
  visible,
  selectedIds,
  onSelect,
  onClear,
}: {
  element: StructuralElement;
  storey: string;
  visible: Record<StructuralElement, boolean>;
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onClear: () => void;
}) {
  const store = useStructuralStore();
  const floors = storey === "all" ? ["GF", "FF", "TYP", "RF"] : [storey];
  return (
    <svg
      viewBox="0 0 980 680"
      className="h-[650px] w-full"
      role="img"
      aria-label={`${elementLabel[element]} 3D model`}
      onClick={onClear}
    >
      <defs>
        <linearGradient id="slab3d" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#bfdbfe" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
        <filter id="shadow">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity=".18" />
        </filter>
      </defs>
      <g transform="translate(170 70)" filter="url(#shadow)">
        {floors.map((floor, index) => {
          const level = floors.length === 1 ? 210 : 350 - index * 88;
          const fade = (key: StructuralElement) => (key === element ? 1 : 0.22);
          const columns = store.columns
            .filter((x) => x.floorId === floor);
          const beams = store.beams
            .filter((x) => x.floorId === floor);
          const slabs = store.slabPlates
            .filter((x) => x.floorId === floor)
            .slice(0, 3);
          return (
            <g key={floor} transform={`translate(0 ${level})`}>
              {visible.slab
                ? (slabs.length ? slabs : [null]).map((item, i) => {
                    const selected = Boolean(
                      item && selectedIds.includes(item.id),
                    );
                    return (
                      <path
                        key={item?.id || `${floor}-slab-context`}
                        d="M80 80 L480 0 L700 105 L300 185 Z"
                        transform={`translate(${i * 4} ${i * 3})`}
                        fill="url(#slab3d)"
                        fillOpacity={selected ? 0.95 : fade("slab") * 0.72}
                        stroke={selected ? "#ffffff" : "#2563eb"}
                        strokeOpacity={fade("slab")}
                        strokeWidth={selected ? 6 : 2}
                        className={
                          element === "slab" && item ? "cursor-pointer" : ""
                        }
                        onClick={
                          element === "slab" && item
                            ? (e) => {
                                e.stopPropagation();
                                onSelect(item.id, e.ctrlKey || e.metaKey);
                              }
                            : undefined
                        }
                      />
                    );
                  })
                : null}
              {visible.beams ? (
                <g opacity={fade("beams")} strokeLinecap="round">
                  {(beams.length ? beams : [null]).map((item, i) => {
                    const xs = beams.flatMap((beam) => [beam.start.x,beam.end.x]);
                    const ys = beams.flatMap((beam) => [beam.start.y,beam.end.y]);
                    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
                    const iso=(x:number,y:number) => {
                      const nx=(x-minX)/Math.max(1,maxX-minX),ny=(y-minY)/Math.max(1,maxY-minY);
                      return [90+nx*400+ny*200,85-nx*80+ny*100];
                    };
                    const a=item?iso(item.start.x,item.start.y):[105,87];
                    const b=item?iso(item.end.x,item.end.y):[493,10];
                    const selected = Boolean(
                      item && selectedIds.includes(item.id),
                    );
                    const interactive = element === "beams" && item;
                    return (
                      <line
                        key={item?.id || `${floor}-beam-context`}
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        stroke={selected ? "#f59e0b" : "#be123c"}
                        strokeWidth={12}
                        className={interactive ? "cursor-pointer" : ""}
                        onClick={
                          interactive
                            ? (e) => {
                                e.stopPropagation();
                                onSelect(item.id, e.ctrlKey || e.metaKey);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </g>
              ) : null}
              {visible.columns ? (
                <g opacity={fade("columns")} fill="#2563eb">
                  {columns.map((item, i) => {
                    const minX = columns.length ? Math.min(...columns.map((c) => c.bbox.x)) : 0;
                    const maxX = columns.length ? Math.max(...columns.map((c) => c.bbox.x)) : 1;
                    const minY = columns.length ? Math.min(...columns.map((c) => c.bbox.y)) : 0;
                    const maxY = columns.length ? Math.max(...columns.map((c) => c.bbox.y)) : 1;
                    const nx = item ? (item.bbox.x - minX) / Math.max(1, maxX - minX) : 0;
                    const ny = item ? (item.bbox.y - minY) / Math.max(1, maxY - minY) : 0;
                    const x = 95 + nx * 390 + ny * 205;
                    const y = 80 - nx * 78 + ny * 102;
                    const selected = selectedIds.includes(item.id);
                    return (
                      <path
                        key={item.id}
                        d={`M${x} ${y} l12 6 v${floors.length === 1 ? -160 : -78} l-12 -6 z`}
                        fill={selected ? "#60a5fa" : "#2563eb"}
                        stroke={selected ? "#ffffff" : "#1d4ed8"}
                        strokeWidth={selected ? 6 : 2}
                        className={
                          element === "columns" ? "cursor-pointer" : ""
                        }
                        onClick={
                          element === "columns"
                            ? (e) => {
                                e.stopPropagation();
                                onSelect(item.id, e.ctrlKey || e.metaKey);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </g>
              ) : null}
              <text
                x="720"
                y="110"
                fontSize="16"
                fontWeight="700"
                fill="#64748b"
                pointerEvents="none"
              >
                {floorName(floor)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function selectionMetric(
  element: StructuralElement,
  items: Array<ColumnInstance | BeamRun | SlabPlate>,
) {
  const store = useStructuralStore.getState();
  if (element === "columns") {
    const volume = (items as ColumnInstance[]).reduce((total, item) => {
      const family = store.columnFamilies.find((x) => x.id === item.familyId);
      if (!family) return total;
      const area =
        family.shape === "Circular"
          ? Math.PI * ((family.diameterMm || family.widthMm) / 2000) ** 2
          : (family.widthMm / 1000) * (family.depthMm / 1000);
      return total + area * item.heightM;
    }, 0);
    return { label: "Combined volume", value: `${volume.toFixed(3)} m³` };
  }
  if (element === "beams") {
    const length = (items as BeamRun[]).reduce(
      (total, item) =>
        total +
        distance(item.start, item.end) * scaleForViewport(item.viewportId),
      0,
    );
    return { label: "Combined length", value: `${length.toFixed(2)} m` };
  }
  const area = (items as SlabPlate[]).reduce(
    (total, item) =>
      total +
      zoneAreaM2(item.points, item.voids, scaleForViewport(item.viewportId)),
    0,
  );
  return { label: "Combined area", value: `${area.toFixed(2)} m²` };
}

function Structural3DSelectionPanel({
  projectId,
  element,
  items,
  onClear,
}: {
  projectId: string;
  element: StructuralElement;
  items: Array<ColumnInstance | BeamRun | SlabPlate>;
  onClear: () => void;
}) {
  if (!items.length)
    return (
      <div className="p-5 text-sm leading-6 text-slate-500">
        <p>Select a model member to inspect it.</p>
        <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
          Hold Ctrl on Windows or Cmd on Mac while clicking to select multiple{" "}
          {elementLabel[element].toLowerCase()}.
        </p>
      </div>
    );
  if (items.length === 1) {
    const item = items[0];
    return (
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Model item
        </p>
        <h3 className="mt-1 text-lg font-semibold">{item.id}</h3>
        <p className="mt-2 text-sm text-slate-500">
          Same item ID as Dimension and Workbook.
        </p>
        <div className="mt-5">
          <Structural3DItemDetails element={element} item={item} />
        </div>
        <Link
          href={`${appRoutes.takeoff(projectId, element, "dimension")}?entity=${item.id}`}
          className="mt-5 flex h-10 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold"
        >
          Open in Dimension
        </Link>
      </div>
    );
  }
  const storeys = [...new Set(items.map((x) => floorName(x.floorId)))],
    familyIds = [...new Set(items.map((x) => x.familyId))],
    statuses = [...new Set(items.map((x) => x.status))],
    metric = selectionMetric(element, items);
  return (
    <div className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
        Multiple selection
      </p>
      <h3 className="mt-1 text-xl font-semibold">
        {items.length} {elementLabel[element].toLowerCase()} selected
      </h3>
      <p className="mt-2 text-sm leading-5 text-slate-500">
        Combined information for the current selection.
      </p>
      <div className="mt-5 space-y-2">
        <Info
          label="Families"
          value={
            familyIds.length === 1
              ? familyIds[0]
              : `${familyIds.length} families`
          }
        />
        <Info
          label="Storeys"
          value={
            storeys.length === 1 ? storeys[0] : `${storeys.length} storeys`
          }
        />
        <Info
          label="Status"
          value={statuses.length === 1 ? statuses[0] : "Multiple values"}
        />
        <Info label={metric.label} value={metric.value} />
      </div>
      <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Selected members
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <details
            key={item.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <span>{item.id}</span>
              <span className="text-[10px] font-medium text-slate-400">
                {item.familyId} · {floorName(item.floorId)} ▾
              </span>
            </summary>
            <div className="space-y-2 border-t border-slate-100 p-3">
              <Structural3DItemDetails element={element} item={item} />
              <Link
                href={`${appRoutes.takeoff(projectId, element, "dimension")}?entity=${item.id}`}
                className="flex h-9 items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Open in Dimension
              </Link>
            </div>
          </details>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-5 h-10 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Clear selection
      </button>
    </div>
  );
}

function Structural3DItemDetails({
  element,
  item,
}: {
  element: StructuralElement;
  item: ColumnInstance | BeamRun | SlabPlate;
}) {
  const store = useStructuralStore();
  if (element === "columns") {
    const column = item as ColumnInstance;
    const family = store.columnFamilies.find((x) => x.id === column.familyId);
    const section = family ? effectiveColumnSection(column, family) : null;
    const width =
        (family?.shape === "Circular"
          ? section?.diameterMm || 0
          : section?.widthMm || 0) / 1000,
      depth =
        (family?.shape === "Circular"
          ? section?.diameterMm || 0
          : section?.depthMm || 0) / 1000;
    const volume =
      family?.shape === "Circular"
        ? Math.PI * (width / 2) ** 2 * column.heightM
        : width * depth * column.heightM;
    const girth =
      family?.shape === "Circular" ? Math.PI * width : 2 * (width + depth);
    return (
      <div className="space-y-2">
        <Info
          label="Family"
          value={`${family?.mark || column.familyId} · ${family?.description || ""}`}
        />
        <Info
          label="Dimensions"
          value={
            family?.shape === "Circular"
              ? `${section?.diameterMm || 0} mm dia`
              : `${section?.widthMm || 0} × ${section?.depthMm || 0} mm`
          }
        />
        <Info label="Height" value={`${column.heightM.toFixed(2)} m`} />
        <Info label="Concrete volume" value={`${volume.toFixed(3)} m³`} />
        <Info
          label="Formwork"
          value={`${(girth * column.heightM).toFixed(2)} m²`}
        />
        <Info label="Storey" value={floorName(column.floorId)} />
        <Info label="Drawing" value={family?.source || column.viewportId} />
        <Info label="Status" value={column.status} />
      </div>
    );
  }
  if (element === "beams") {
    const beam = item as BeamRun;
    const family = store.beamFamilies.find((x) => x.id === beam.familyId);
    const length =
      distance(beam.start, beam.end) * scaleForViewport(beam.viewportId);
    const depth =
      beam.kind === "Downstand"
        ? Math.max(beam.dropMm, 1)
        : family?.depthMm || 0;
    const volume = length * ((family?.widthMm || 0) / 1000) * (depth / 1000);
    return (
      <div className="space-y-2">
        <Info
          label="Family"
          value={`${family?.mark || beam.familyId} · ${family?.description || ""}`}
        />
        <Info label="Kind" value={beam.kind} />
        <Info
          label="Dimensions"
          value={`${family?.widthMm || 0} × ${family?.depthMm || 0} mm`}
        />
        <Info label="Length" value={`${length.toFixed(2)} m`} />
        <Info label="Concrete volume" value={`${volume.toFixed(3)} m³`} />
        <Info label="Storey" value={floorName(beam.floorId)} />
        <Info label="Status" value={beam.status} />
      </div>
    );
  }
  const slab = item as SlabPlate;
  const family = store.slabFamilies.find((x) => x.id === slab.familyId);
  const area = zoneAreaM2(
    slab.points,
    slab.voids,
    scaleForViewport(slab.viewportId),
  );
  const thickness =
    (slab.thicknessOverrideMm || family?.thicknessMm || 0) / 1000;
  return (
    <div className="space-y-2">
      <Info
        label="Family"
        value={`${family?.mark || slab.familyId} · ${family?.description || ""}`}
      />
      <Info label="Thickness" value={`${Math.round(thickness * 1000)} mm`} />
      <Info label="Net area" value={`${area.toFixed(2)} m²`} />
      <Info
        label="Concrete volume"
        value={`${(area * thickness).toFixed(3)} m³`}
      />
      <Info label="Storey" value={floorName(slab.floorId)} />
      <Info label="Status" value={slab.status} />
    </div>
  );
}

function families(element: StructuralElement) {
  const s = useStructuralStore.getState();
  return element === "columns"
    ? s.columnFamilies
    : element === "beams"
      ? s.beamFamilies
      : s.slabFamilies;
}
function selectedItem(
  element: StructuralElement,
  id: string | null,
): ColumnInstance | BeamRun | SlabPlate | null {
  if (!id) return null;
  const s = useStructuralStore.getState();
  return element === "columns"
    ? s.columns.find((x) => x.id === id) || null
    : element === "beams"
      ? s.beams.find((x) => x.id === id) || null
      : s.slabPlates.find((x) => x.id === id) || null;
}
function deleteSelected(element: StructuralElement, id: string | null) {
  if (!id) return;
  const s = useStructuralStore.getState();
  s.captureUndo();
  if (element === "columns") s.deleteColumn(id);
  else if (element === "beams") s.deleteBeam(id);
  else s.deleteSlab(id);
}
function splitBeam(item: BeamRun) {
  const s = useStructuralStore.getState();
  if (
    !beginLiveEdit(
      `geometry:split-beam:${item.id}`,
      `split beam ${item.id}`,
      s.undo,
    )
  )
    return;
  s.captureUndo();
  const mid = {
    x: (item.start.x + item.end.x) / 2,
    y: (item.start.y + item.end.y) / 2,
  };
  s.updateBeam(item.id, { end: mid });
  s.addBeam({ ...item, id: `${item.id}-B`, start: mid, status: "ready" });
}
function throughDeduct(plate: SlabPlate) {
  const s = useStructuralStore.getState();
  return s.beams
    .filter(
      (x) =>
        x.floorId === plate.floorId &&
        x.viewportId === plate.viewportId &&
        x.kind === "Through",
    )
    .reduce((total, b) => {
      const family = s.beamFamilies.find((x) => x.id === b.familyId);
      return (
        total +
        (distance(b.start, b.end) *
          scaleForViewport(b.viewportId) *
          (family?.widthMm || 0)) /
          1000
      );
    }, 0);
}
function floorForViewport(id: string) {
  return id === "VP-GROUND"
    ? "GF"
    : id === "VP-TYP" || id === "VP-STRUCT-BEAM-TYP"
      ? "TYP"
      : id === "VP-TERRACE" ||
          id === "VP-ROOF" ||
          id === "VP-STRUCT-SLAB-ROOF" ||
          id === "VP-STRUCT-ROOF-PLAN" ||
          id === "VP-STRUCT-MACHINE-WATER"
        ? "RF"
        : "FF";
}
function heightForFloor(id: string) {
  return id === "GF" ? 3.96 : id === "RF" ? 3.5 : 3.35;
}
function points(items: Point[]) {
  return items.map((p) => `${p.x},${p.y}`).join(" ");
}
function familySize(element: StructuralElement, family: any) {
  return element === "slab"
    ? `${family.thicknessMm} mm`
    : `${family.widthMm} × ${family.depthMm} mm`;
}
