"use client";

import React, { useMemo, useState } from "react";
import { DemoDrawing, svgPoint } from "./components/DemoDrawing";
import {
  ResizableThreePane,
  ResizableTwoPane,
} from "./components/ResizablePanels";
import { DemoChat } from "./components/DemoChat";
import { useDemoStore } from "@/features/demo/store";
import {
  centroid,
  distance,
  edgeLengthM,
  polygonArea,
} from "@/features/demo/geometry";
import {
  floorFactor,
  floorName,
  scaleForViewport,
} from "@/features/demo/builders";
import { useSpecialStore } from "./specialStore";
import type { Flight, Pile, PileCap, SpecialElement } from "./specialTypes";
import type { BBox, Point } from "@/features/demo/types";

type Mode = "select" | "pan" | "draw" | "measure";
const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const button =
  "rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100";
const active =
  "rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white";
const viewports: Record<SpecialElement, string[]> = {
  "stairs-ramps": [
    "VP-GROUND",
    "VP-FIRST",
    "VP-TYP",
    "VP-TERRACE",
    "VP-SEC-AA",
    "VP-SEC-BB",
  ],
  foundation: ["VP-FOUND-INTERNAL", "VP-FOUND-BLIND", "VP-FOUND-COLUMNS", "VP-GROUND", "VP-SITE"],
};

export function SpecialTakeoff({
  projectId,
  element,
  view,
}: {
  projectId: string;
  element: SpecialElement;
  view: string;
}) {
  return view === "workbook" ? (
    <SpecialWorkbook element={element} />
  ) : view === "3d" ? (
    <Special3D element={element} />
  ) : (
    <SpecialDimension projectId={projectId} element={element} />
  );
}

function SpecialDimension({
  projectId,
  element,
}: {
  projectId: string;
  element: SpecialElement;
}) {
  const demo = useDemoStore(),
    st = useSpecialStore();
  const allowed = viewports[element];
  const viewport =
    demo.viewports.find(
      (v) => v.id === demo.selectedViewportId && allowed.includes(v.id),
    ) || demo.viewports.find((v) => v.id === allowed[0])!;
  const [tab, setTab] = useState<"viewports" | "families">("viewports"),
    [rightTab, setRightTab] = useState<"copilot" | "item">("item"),
    [mode, setMode] = useState<Mode>("select"),
    [draft, setDraft] = useState<Point[]>([]),
    [measure, setMeasure] = useState<Point[]>([]),
    [minimap, setMinimap] = useState(false),
    [layers, setLayers] = useState({
      flights: true,
      rails: true,
      piles: true,
      caps: true,
    }),
    [kind, setKind] = useState(element === "stairs-ramps" ? "flight" : "pile");
  const visibleFlights = st.flights.filter((x) => x.viewportId === viewport.id),
    visiblePiles = st.piles.filter((x) => x.viewportId === viewport.id),
    visibleCaps = st.caps.filter((x) => x.viewportId === viewport.id);
  function click(p: Point) {
    if (mode === "measure") {
      setMeasure((m) => (m.length ? [m[0], p] : [p]));
      return;
    }
    if (mode !== "draw") return;
    if (element === "foundation" && kind === "pile") {
      if (!st.pileFamilies.length) return;
      st.captureUndo();
      const f = st.pileFamilies[0],
        id = `PILE-${Date.now()}`;
      st.addPile({
        id,
        familyId: f.id,
        floorId: "GF",
        viewportId: viewport.id,
        bbox: { x: p.x - 22, y: p.y - 22, width: 44, height: 44 },
        lengthM: 12.5,
        commencingLevelM: 0,
        toeLevelM: -12.5,
        status: "ready",
      });
      setMode("select");
      return;
    }
    if (element === "stairs-ramps") {
      if (draft.length >= 3 && distance(p, draft[0]) <= 12) {
        finish(draft);
        return;
      }
      setDraft((current) => [...current, p]);
      return;
    }
    setDraft((d) => (d.length ? [d[0], p] : [p]));
  }
  function finish(points = draft) {
    if (points.length < (element === "stairs-ramps" ? 3 : 2)) return;
    st.captureUndo();
    const a = points[0], b = points[points.length - 1];
    if (element === "stairs-ramps") {
      const id = `FLT-${Date.now()}`;
      st.addFlight({
        id,
        familyId: st.flightFamilies[0].id,
        railFamilyId: st.railFamilies[0].id,
        floorId: floorFor(viewport.id),
        viewportId: viewport.id,
        points,
        voids: [],
        railEdges: points.map(() => true),
        status: "ready",
      });
    } else {
      const id = `CAP-${Date.now()}`;
      st.addCap({
        id,
        familyId: st.capFamilies[0].id,
        floorId: "GF",
        viewportId: viewport.id,
        bbox: toBBox(a, b),
        hostPileIds: [],
        status: "ready",
      });
    }
    setDraft([]);
    setMode("select");
  }
  function remove() {
    if (!st.selectedId) return;
    st.captureUndo();
    if (st.flights.some((x) => x.id === st.selectedId))
      st.deleteFlight(st.selectedId);
    else if (st.piles.some((x) => x.id === st.selectedId))
      st.deletePile(st.selectedId);
    else st.deleteCap(st.selectedId);
  }
  const selected = element === "stairs-ramps"
    ? st.flights.find((x) => x.id === st.selectedId)
    : st.piles.find((x) => x.id === st.selectedId) ||
      st.caps.find((x) => x.id === st.selectedId);
  return (
    <ResizableThreePane
      storageKey={`special:${element}`}
      defaultLeft={235}
      defaultRight={330}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <aside className="border-r border-slate-200">
        <div className="grid grid-cols-2 gap-1 border-b p-2">
          <button
            className={tab === "viewports" ? active : button}
            onClick={() => setTab("viewports")}
          >
            Viewports
          </button>
          <button
            className={tab === "families" ? active : button}
            onClick={() => setTab("families")}
          >
            Families
          </button>
        </div>
        {tab === "viewports" ? (
          <div className="space-y-2 p-3">
            {allowed.map((id) => {
              const v = demo.viewports.find((x) => x.id === id);
              return v ? (
                <button
                  key={id}
                  onClick={() => demo.setSelectedViewport(id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${viewport.id === id ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}
                >
                  <b>{v.name}</b>
                  <span className="mt-1 block text-xs text-slate-500">
                    {v.category}
                  </span>
                </button>
              ) : null;
            })}
          </div>
        ) : (
          <Families element={element} />
        )}
      </aside>
      <main className="relative min-w-0 bg-slate-100 p-3">
        <DemoDrawing
          viewportId={viewport.id}
          tool={mode === "pan" ? "pan" : mode === "select" ? "select" : "draw"}
          onCanvasClick={click}
          onCanvasDragStart={element === "stairs-ramps" ? undefined : (point) => {
            if (mode === "draw") setDraft([point, point]);
          }}
          onCanvasDragMove={element === "stairs-ramps" ? undefined : (point) => {
            if (mode === "draw") setDraft((current) => current.length ? [current[0], point] : current);
          }}
          onCanvasDragEnd={element === "stairs-ramps" ? undefined : (point) => {
            if (mode !== "draw" || draft.length < 2) return;
            const start = draft[0];
            if (Math.max(Math.abs(point.x-start.x), Math.abs(point.y-start.y)) < 8) { setDraft([]); return; }
            if (kind === "pile") {
              st.captureUndo(); const f=st.pileFamilies[0], id=`PILE-${Date.now()}`;
              st.addPile({id,familyId:f.id,floorId:"GF",viewportId:viewport.id,bbox:toBBox(start,point),lengthM:12.5,commencingLevelM:0,toeLevelM:-12.5,status:"ready"});
              setDraft([]); setMode("select");
            } else finish([start, point]);
          }}
          showMinimap={minimap}
          toolbar={
            <div className="flex min-w-max items-center gap-1">
              <button
                className={mode === "select" ? active : button}
                onClick={() => setMode("select")}
              >
                Select
              </button>
              <button
                className={mode === "pan" ? active : button}
                onClick={() => setMode("pan")}
              >
                Hand
              </button>
              <button
                className={
                  mode === "draw"
                    ? active
                    : "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                }
                onClick={() => {
                  if (element === "foundation" && !st.pileFamilies.length && !st.capFamilies.length) return;
                  setMode("draw");
                  setDraft([]);
                }}
                disabled={element === "foundation" && !st.pileFamilies.length && !st.capFamilies.length}
              >
                + Add element
              </button>
              <button
                className={mode === "measure" ? active : button}
                onClick={() => {
                  setMode("measure");
                  setMeasure([]);
                }}
              >
                Measure
              </button>
              {mode === "draw" ? (
                <>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className="rounded-lg border px-2 text-xs"
                  >
                    {element === "stairs-ramps" ? (
                      <option value="flight">Flight / ramp</option>
                    ) : (
                      <>
                        <option value="pile">Pile</option>
                        <option value="cap">Pile cap</option>
                      </>
                    )}
                  </select>
                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    {element === "stairs-ramps"
                      ? draft.length >= 3
                        ? "Click the first point to close, or press Finish"
                        : "Click 3 or more boundary points"
                      : "Drag on the drawing to place"}
                  </span>
                  {element === "stairs-ramps" ? (
                    <>
                      <button
                        type="button"
                        disabled={draft.length < 3}
                        onClick={() => finish()}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
                      >
                        Finish
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDraft([]); setMode("select"); }}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              <details className="relative">
                <summary className={button}>Layers</summary>
                <div className="absolute z-40 mt-1 w-40 rounded-xl border bg-white p-2 shadow-xl">
                  {Object.keys(layers)
                    .filter((k) =>
                      element === "stairs-ramps"
                        ? ["flights", "rails"].includes(k)
                        : ["piles", "caps"].includes(k),
                    )
                    .map((k) => (
                      <label
                        className="flex gap-2 p-2 text-xs capitalize"
                        key={k}
                      >
                        <input
                          type="checkbox"
                          checked={layers[k as keyof typeof layers]}
                          onChange={() =>
                            setLayers((x) => ({
                              ...x,
                              [k]: !x[k as keyof typeof x],
                            }))
                          }
                        />
                        {k}
                      </label>
                    ))}
                </div>
              </details>
            </div>
          }
          toolbarRight={
            <>
              <button
                className={button}
                disabled={!st.undoStack.length}
                onClick={st.undo}
              >
                Undo
              </button>
              <button
                className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 disabled:text-slate-300"
                disabled={!st.selectedId}
                onClick={remove}
              >
                Delete
              </button>
              <button className={button} onClick={() => setMinimap((x) => !x)}>
                Minimap
              </button>
            </>
          }
        >
          <g
            className="quanto-scaled-elements"
            pointerEvents={mode === "select" ? "auto" : "none"}
          >
            {element === "stairs-ramps" ? (
              <>
                {layers.flights &&
                  visibleFlights.map((x) => (
                    <FlightShape key={x.id} item={x} showRails={layers.rails} />
                  ))}
              </>
            ) : (
              <>
                {layers.caps &&
                  visibleCaps.map((x) => <CapShape key={x.id} item={x} />)}
                {layers.piles &&
                  visiblePiles.map((x) => <PileShape key={x.id} item={x} />)}
              </>
            )}
          </g>
          {draft.length ? (
            <g pointerEvents="none">
              <polygon
                points={draft.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={element === "stairs-ramps" && draft.length >= 3 ? "rgba(37,99,235,.18)" : "none"}
                stroke="#2563eb"
                strokeWidth="5"
                strokeDasharray="8 5"
                vectorEffect="non-scaling-stroke"
              />
              {element === "stairs-ramps" ? draft.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === 0 && draft.length >= 3 ? 9 : 6}
                  fill={index === 0 && draft.length >= 3 ? "#10b981" : "#2563eb"}
                  stroke="white"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
              )) : null}
            </g>
          ) : null}
          {measure.length ? (
            <Measure points={measure} scale={scaleForViewport(viewport.id)} />
          ) : null}
        </DemoDrawing>
        {element === "foundation" && !st.piles.length && !st.caps.length ? (
          <div className="pointer-events-none absolute bottom-8 left-1/2 w-[min(620px,80%)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl">
            <p className="text-sm font-semibold text-amber-900">Pile and pile-cap takeoff not found</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">AR/10 shows 1:6 cement-masonry rubble wall foundations and generic Type I/II column-footing details. It does not provide a pile layout, pile schedule, pile lengths, pile-cap sizes, or a complete footing layout, so no foundation concrete quantity is generated.</p>
          </div>
        ) : null}
      </main>
      <aside className="flex min-h-0 flex-col border-l border-slate-200">
        <div className="grid grid-cols-2 border-b p-2">
          <button
            className={rightTab === "copilot" ? active : button}
            onClick={() => setRightTab("copilot")}
          >
            Copilot
          </button>
          <button
            className={rightTab === "item" ? active : button}
            onClick={() => setRightTab("item")}
          >
            Item
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {rightTab === "item" ? (
            selected ? (
              <Inspector item={selected} element={element} />
            ) : (
              <div className="p-5 text-sm text-slate-500">
                Select an item on the drawing to view and edit its details.
              </div>
            )
          ) : (
            <DemoChat
              chatKey={`takeoff.${element}`}
              contextLabel={
                element === "stairs-ramps" ? "Stairs & Ramps" : "Foundation"
              }
              onOpenItem={() => setRightTab("item")}
            />
          )}
        </div>
      </aside>
    </ResizableThreePane>
  );
}

function Families({ element }: { element: SpecialElement }) {
  const st = useSpecialStore();
  if (element === "stairs-ramps")
    return (
      <div className="space-y-3 p-3">
        <h4 className="text-xs font-semibold text-slate-400">
          FLIGHTS & RAMPS
        </h4>
        {st.flightFamilies.map((f) => (
          <details key={f.id} className="rounded-xl border p-3" open>
            <summary className="font-semibold">
              {f.mark} · {f.kind}
            </summary>
            <label className="mt-3 block text-xs">
              Name
              <input
                className={field}
                value={f.mark}
                onChange={(e) =>
                  st.updateFlightFamily(f.id, { mark: e.target.value })
                }
              />
            </label>
            <label className="mt-2 block text-xs">
              Description
              <input
                className={field}
                value={f.description}
                onChange={(e) =>
                  st.updateFlightFamily(f.id, { description: e.target.value })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="mt-2 text-xs">
                Width (mm)
                <input
                  className={field}
                  type="number"
                  value={f.widthMm}
                  onChange={(e) =>
                    st.updateFlightFamily(f.id, { widthMm: +e.target.value })
                  }
                />
              </label>
              <label className="mt-2 text-xs">
                Waist (mm)
                <input
                  className={field}
                  type="number"
                  value={f.waistMm}
                  onChange={(e) =>
                    st.updateFlightFamily(f.id, { waistMm: +e.target.value })
                  }
                />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">
                Riser (mm)
                <input className={field} type="number" value={f.riserMm || ""} placeholder="Not shown" onChange={(e) => st.updateFlightFamily(f.id, { riserMm: +e.target.value })} />
              </label>
              <label className="text-xs">
                Tread (mm)
                <input className={field} type="number" value={f.treadMm || ""} placeholder="Not shown" onChange={(e) => st.updateFlightFamily(f.id, { treadMm: +e.target.value })} />
              </label>
            </div>
            <label className="mt-2 block text-xs">
              Finish
              <input className={field} value={f.finish} onChange={(e) => st.updateFlightFamily(f.id, { finish: e.target.value })} />
            </label>
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">
              Evidence: {f.source}
            </p>
          </details>
        ))}
      </div>
    );
  return (
    <div className="space-y-3 p-3">
      <h4 className="text-xs font-semibold text-slate-400">PILE FAMILIES</h4>
      {!st.pileFamilies.length ? <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>Not found in the supplied package.</b><br />The visible Type I/II details are pad footings, not piles or pile caps.</div> : null}
      {st.pileFamilies.map((f) => (
        <details key={f.id} className="rounded-xl border p-3">
          <summary className="font-semibold">
            {f.mark} · {f.method}
          </summary>
          <label className="mt-3 block text-xs">
            Name
            <input
              className={field}
              value={f.mark}
              onChange={(e) =>
                st.updatePileFamily(f.id, { mark: e.target.value })
              }
            />
          </label>
          <label className="mt-2 block text-xs">
            Diameter (mm)
            <input
              className={field}
              type="number"
              value={f.diameterMm}
              onChange={(e) =>
                st.updatePileFamily(f.id, { diameterMm: +e.target.value })
              }
            />
          </label>
        </details>
      ))}
    </div>
  );
}

function Inspector({
  item,
  element,
}: {
  item: Flight | Pile | PileCap;
  element: SpecialElement;
}) {
  const st = useSpecialStore();
  const isFlight = "points" in item,
    isPile = "lengthM" in item;
  const families = isFlight
    ? st.flightFamilies
    : isPile
      ? st.pileFamilies
      : st.capFamilies;
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs font-semibold text-slate-400">SELECTED ITEM</p>
      <h3 className="text-lg font-semibold">{item.id}</h3>
      <label className="block text-xs">
        Family
        <select
          className={field}
          value={item.familyId}
          onChange={(e) =>
            isFlight
              ? st.updateFlight(item.id, { familyId: e.target.value })
              : isPile
                ? st.updatePile(item.id, { familyId: e.target.value })
                : st.updateCap(item.id, { familyId: e.target.value })
          }
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.mark} · {f.description}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        Storey
        <select
          className={field}
          value={item.floorId}
          onChange={(e) =>
            isFlight
              ? st.updateFlight(item.id, { floorId: e.target.value })
              : isPile
                ? st.updatePile(item.id, { floorId: e.target.value })
                : st.updateCap(item.id, { floorId: e.target.value })
          }
        >
          <option value="GF">Ground</option>
          <option value="FF">First</option>
          <option value="TYP">Typical 2nd–6th</option>
          <option value="RF">Roof Terrace</option>
        </select>
      </label>
      {isPile ? (
        <label className="block text-xs">
          Length (m)
          <input
            className={field}
            type="number"
            value={item.lengthM}
            onChange={(e) =>
              st.updatePile(item.id, {
                lengthM: +e.target.value,
                toeLevelM: item.commencingLevelM - +e.target.value,
              })
            }
          />
        </label>
      ) : !isFlight ? (
        <label className="block text-xs">
          Thickness (mm)
          <input
            className={field}
            type="number"
            value={
              item.thicknessOverrideMm ||
              st.capFamilies.find((f) => f.id === item.familyId)?.thicknessMm ||
              0
            }
            onChange={(e) =>
              st.updateCap(item.id, { thicknessOverrideMm: +e.target.value })
            }
          />
        </label>
      ) : (
        <>
          {(() => {
            const family = st.flightFamilies.find((f) => f.id === item.familyId);
            if (!family) return null;
            const area = polygonArea(item.points) * scaleForViewport(item.viewportId) ** 2;
            const rise = item.riseOverrideM || (item.floorId === "GF" ? 3.96 : 3.35);
            const risers = family.riserMm > 0 ? Math.round((rise * 1000) / family.riserMm) : null;
            return (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
                <InfoRow label="Kind" value={family.kind} />
                <InfoRow label="Plan outline" value={`${area.toFixed(2)} m²`} />
                <InfoRow label="Flight width" value={family.widthMm ? `${family.widthMm} mm` : "Not shown"} />
                <InfoRow label="Riser / tread" value={family.riserMm && family.treadMm ? `${family.riserMm} / ${family.treadMm} mm` : "Not scheduled"} />
                <InfoRow label="Waist" value={family.waistMm ? `${family.waistMm} mm` : "Not scheduled"} />
                <InfoRow label="Risers" value={risers ? String(risers) : "Cannot calculate"} />
                <InfoRow label="Finish" value={family.finish || "Not scheduled"} />
                <InfoRow label="Evidence" value={family.source} />
              </div>
            );
          })()}
          <label className="block text-xs">
            Rise override (m)
            <input
              className={field}
              type="number"
              value={item.riseOverrideM || 3.35}
              onChange={(e) =>
                st.updateFlight(item.id, { riseOverrideM: +e.target.value })
              }
            />
          </label>
          <div>
            <p className="mb-2 text-xs">Balustrade edges</p>
            <div className="flex flex-wrap gap-1">
              {item.railEdges.map((on, i) => (
                <button
                  key={i}
                  onClick={() =>
                    st.updateFlight(item.id, {
                      railEdges: item.railEdges.map((x, n) =>
                        n === i ? !x : x,
                      ),
                    })
                  }
                  className={
                    on
                      ? "rounded bg-amber-100 px-2 py-1 text-xs text-amber-800"
                      : "rounded bg-slate-100 px-2 py-1 text-xs text-slate-400"
                  }
                >
                  Edge {i + 1}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <b>{quantity(item, st).label}</b>
        <span className="float-right font-semibold">
          {quantity(item, st).value}
        </span>
      </div>
      <button
        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
        onClick={() =>
          isFlight
            ? st.updateFlight(item.id, { status: "confirmed" })
            : isPile
              ? st.updatePile(item.id, { status: "confirmed" })
              : st.updateCap(item.id, { status: "confirmed" })
        }
      >
        Save and confirm
      </button>
    </div>
  );
}

function SpecialWorkbook({ element }: { element: SpecialElement }) {
  const st = useSpecialStore();
  const rows = useMemo(
    () => workbookRows(element, st),
    [
      element,
      st.flights,
      st.piles,
      st.caps,
      st.flightFamilies,
      st.pileFamilies,
      st.capFamilies,
      st.workbookOverrides,
    ],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b p-5">
        <h3 className="font-semibold">
          {element === "stairs-ramps"
            ? "Stairs, ramps & balustrades"
            : "Piles & pile caps"}{" "}
          workbook
        </h3>
        <p className="text-sm text-slate-500">
          Calculated quantities remain editable before confirmation.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {!rows.length ? <div className="m-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><b>No pile or pile-cap quantity lines.</b><p className="mt-2 leading-6">The supplied PDF has no pile layout or schedule. AR/10 foundation details remain available in Dimension as evidence, but their incomplete symbolic dimensions cannot produce a reliable quantity.</p></div> : null}
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Family / storey</th>
              <th>Calculation</th>
              <th>Unit</th>
              <th className="w-40">Quantity</th>
              <th className="w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="border-t" key={r.key}>
                <td className="p-4">
                  <b>{r.name}</b>
                  <span className="block text-xs text-slate-500">
                    {r.floor}
                  </span>
                </td>
                <td>{r.calc}</td>
                <td>{r.unit}</td>
                <td>
                  <input
                    type="number"
                    step=".01"
                    className={field}
                    value={st.workbookOverrides[r.key] ?? r.qty}
                    onChange={(e) =>
                      st.setWorkbookOverride(r.key, +e.target.value)
                    }
                  />
                </td>
                <td>
                  <button
                    className={
                      st.workbookConfirmed[r.key]
                        ? "rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700"
                        : "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                    }
                    onClick={() =>
                      st.confirmWorkbook(r.key, !st.workbookConfirmed[r.key])
                    }
                  >
                    {st.workbookConfirmed[r.key] ? "Confirmed" : "Confirm"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Special3D({ element }: { element: SpecialElement }) {
  const st = useSpecialStore(),
    [floor, setFloor] = useState("GF"),
    [selected, setSelected] = useState<string | null>(null);
  const items =
    element === "stairs-ramps"
      ? st.flights.filter((x) => floor === "ALL" || x.floorId === floor)
      : [...st.caps, ...st.piles].filter(
          (x) => floor === "ALL" || x.floorId === floor,
        );
  const item = items.find((x) => x.id === selected);
  return (
    <ResizableTwoPane
      storageKey={`special:${element}:3d`}
      defaultRight={310}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white"
    >
      <main className="relative bg-slate-100 p-5">
        <div className="flex gap-2">
          {[
            ["GF", "Ground"],
            ["FF", "First"],
            ["TYP", "Typical"],
            ["ALL", "All"],
          ].map(([id, n]) => (
            <button
              className={floor === id ? active : button}
              onClick={() => setFloor(id)}
              key={id}
            >
              {n}
            </button>
          ))}
        </div>
        <svg viewBox="0 0 900 560" className="mt-5 h-[570px] w-full">
          {element === "stairs-ramps" ? (
            <>
              <polygon
                points="180,430 610,310 770,390 340,510"
                fill="#dbeafe"
              />
              <path
                d="M300 430l250-70 110 50-250 70zM340 397l210-59 85 38-210 60zM385 365l165-46 60 27-165 46z"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="18"
                strokeLinejoin="round"
              />
              <path
                d="M300 410v-70m250 0v-70m110 120v-70"
                stroke="#f59e0b"
                strokeWidth="5"
              />
            </>
          ) : (
            <>
              <polygon
                points="180,290 610,180 770,250 340,365"
                fill="#e2e8f0"
                opacity=".7"
              />
              {st.caps.map((x, i) => (
                <rect
                  key={x.id}
                  x={260 + i * 150}
                  y={285}
                  width="90"
                  height="55"
                  rx="5"
                  fill={selected === x.id ? "#fb923c" : "#fdba74"}
                  transform={`skewY(-14)`}
                  onClick={() => setSelected(x.id)}
                />
              ))}
              {st.piles.map((x, i) => (
                <rect
                  key={x.id}
                  x={285 + (i % 3) * 150}
                  y={300 + Math.floor(i / 3) * 35}
                  width="30"
                  height="180"
                  rx="15"
                  fill={selected === x.id ? "#1d4ed8" : "#60a5fa"}
                  onClick={() => setSelected(x.id)}
                />
              ))}
            </>
          )}
        </svg>
        {element === "foundation" && !st.piles.length && !st.caps.length ? <div className="absolute inset-x-10 top-32 rounded-2xl border border-dashed border-amber-300 bg-white/95 p-8 text-center shadow"><h3 className="font-semibold text-amber-900">No pile or pile-cap model available</h3><p className="mt-2 text-sm leading-6 text-slate-600">The supplied drawings do not contain the layout and dimensions needed to create foundation quantity geometry.</p></div> : null}
        <div className="absolute bottom-5 right-5 rounded-xl bg-white p-3 shadow">
          <label className="text-xs">
            Section billboard{" "}
            <select className="ml-2 rounded border p-1">
              <option>Off</option>
              <option>A–A</option>
              <option>B–B</option>
            </select>
          </label>
        </div>
      </main>
      <aside className="p-5">
        <p className="text-xs font-semibold text-slate-400">MODEL ITEM</p>
        {item ? (
          <>
            <h3 className="mt-2 text-lg font-semibold">{item.id}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {floorName(item.floorId)}
            </p>
            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm">
              {quantity(item, st).label}
              <b className="float-right">{quantity(item, st).value}</b>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Select a model item to inspect it.
          </p>
        )}
      </aside>
    </ResizableTwoPane>
  );
}

function FlightShape({ item, showRails }: { item: Flight; showRails: boolean }) {
  const st = useSpecialStore(),
    family = st.flightFamilies.find((f) => f.id === item.familyId)!,
    selected = st.selectedId === item.id;
  return (
    <MovePolygon
      item={item}
      onMove={(points) => st.updateFlight(item.id, { points })}
    >
      <polygon
        points={item.points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={family.color}
        fillOpacity={selected ? 0.35 : 0.2}
        stroke={selected ? "#2563eb" : family.color}
        strokeWidth={selected ? 5 : 3}
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          e.stopPropagation();
          st.select(item.id);
        }}
      />
      <text
        x={centroid(item.points).x}
        y={centroid(item.points).y - 7}
        textAnchor="middle"
        pointerEvents="none"
        className="fill-slate-900 text-[18px] font-bold"
      >
        {family.mark}
      </text>
      <text
        x={centroid(item.points).x}
        y={centroid(item.points).y + 23}
        textAnchor="middle"
        pointerEvents="none"
        className="fill-slate-700 text-[13px] font-semibold"
      >
        {(polygonArea(item.points) * scaleForViewport(item.viewportId) ** 2).toFixed(2)} m²{item.evidenceOnly ? " · linked arrival" : " · details TBC"}
      </text>
      {showRails && item.points.map((point, index) => {
        if (!item.railEdges[index]) return null;
        const next = item.points[(index + 1) % item.points.length];
        return <line key={`rail-${index}`} x1={point.x} y1={point.y} x2={next.x} y2={next.y} stroke="#f59e0b" strokeWidth="8" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
      })}
      {selected &&
        item.points.map((p, i) => (
          <Vertex
            key={i}
            p={p}
            onMove={(next) =>
              st.updateFlight(item.id, {
                points: item.points.map((x, n) => (n === i ? next : x)),
              })
            }
          />
        ))}
    </MovePolygon>
  );
}
function PileShape({ item }: { item: Pile }) {
  const st = useSpecialStore(),
    f = st.pileFamilies.find((x) => x.id === item.familyId)!,
    selected = st.selectedId === item.id,
    cx = item.bbox.x + item.bbox.width / 2,
    cy = item.bbox.y + item.bbox.height / 2;
  return (
    <MoveBox
      box={item.bbox}
      onMove={(bbox) => st.updatePile(item.id, { bbox })}
    >
      <ellipse
        cx={cx}
        cy={cy}
        rx={item.bbox.width / 2}
        ry={item.bbox.height / 2}
        fill={f.color}
        fillOpacity={selected ? 0.5 : 0.3}
        stroke={selected ? "#0f172a" : f.color}
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          e.stopPropagation();
          st.select(item.id);
        }}
      />
      <text
        x={cx + 28}
        y={cy - 20}
        pointerEvents="none"
        className="text-[24px] font-bold"
        fill={f.color}
      >
        {f.mark}
      </text>
    </MoveBox>
  );
}
function CapShape({ item }: { item: PileCap }) {
  const st = useSpecialStore(),
    f = st.capFamilies.find((x) => x.id === item.familyId)!,
    selected = st.selectedId === item.id;
  return (
    <MoveBox box={item.bbox} onMove={(bbox) => st.updateCap(item.id, { bbox })}>
      <rect
        {...item.bbox}
        fill={f.color}
        fillOpacity={selected ? 0.25 : 0.12}
        stroke={selected ? "#0f172a" : f.color}
        strokeWidth="5"
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          e.stopPropagation();
          st.select(item.id);
        }}
      />
    </MoveBox>
  );
}
function MovePolygon({
  item,
  onMove,
  children,
}: {
  item: Flight;
  onMove: (p: Point[]) => void;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<{ p: Point; points: Point[] } | null>(null);
  return (
    <g
      className="cursor-move"
      onPointerDown={(e) => {
        const p = svgPoint(e as never);
        if (p) {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ p, points: item.points });
        }
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = svgPoint(e as never);
        if (p)
          onMove(
            drag.points.map((x) => ({
              x: x.x + p.x - drag.p.x,
              y: x.y + p.y - drag.p.y,
            })),
          );
      }}
      onPointerUp={() => setDrag(null)}
    >
      {children}
    </g>
  );
}
function MoveBox({
  box,
  onMove,
  children,
}: {
  box: BBox;
  onMove: (b: BBox) => void;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<{ p: Point; box: BBox } | null>(null);
  return (
    <g
      className="cursor-move"
      onPointerDown={(e) => {
        const p = svgPoint(e as never);
        if (p) {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ p, box });
        }
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = svgPoint(e as never);
        if (p)
          onMove({
            ...drag.box,
            x: drag.box.x + p.x - drag.p.x,
            y: drag.box.y + p.y - drag.p.y,
          });
      }}
      onPointerUp={() => setDrag(null)}
    >
      {children}
    </g>
  );
}
function Vertex({ p, onMove }: { p: Point; onMove: (p: Point) => void }) {
  return (
    <rect
      x={p.x - 9}
      y={p.y - 9}
      width="18"
      height="18"
      rx="3"
      fill="white"
      stroke="#2563eb"
      strokeWidth="4"
      vectorEffect="non-scaling-stroke"
      className="cursor-crosshair"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const n = svgPoint(e as never);
        if (n) onMove(n);
      }}
    />
  );
}
function Measure({ points, scale }: { points: Point[]; scale: number }) {
  if (points.length < 2) return null;
  return (
    <g pointerEvents="none">
      <line
        x1={points[0].x}
        y1={points[0].y}
        x2={points[1].x}
        y2={points[1].y}
        stroke="#059669"
        strokeWidth="4"
        strokeDasharray="10 8"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={(points[0].x + points[1].x) / 2}
        y={(points[0].y + points[1].y) / 2 - 15}
        textAnchor="middle"
        className="fill-emerald-700 text-[25px] font-bold"
      >
        {(distance(points[0], points[1]) * scale).toFixed(2)} m
      </text>
    </g>
  );
}
function quantity(
  item: Flight | Pile | PileCap,
  st: ReturnType<typeof useSpecialStore.getState>,
) {
  if ("points" in item) {
    const f = st.flightFamilies.find((x) => x.id === item.familyId)!;
    const area =
      polygonArea(item.points) * scaleForViewport(item.viewportId) ** 2;
    return {
      label: "Concrete volume",
      value: f.waistMm > 0 ? `${((area * f.waistMm) / 1000).toFixed(2)} m³` : "Awaiting stair detail",
    };
  }
  if ("lengthM" in item) {
    const f = st.pileFamilies.find((x) => x.id === item.familyId)!;
    return {
      label: "Concrete volume",
      value: `${(Math.PI * (f.diameterMm / 2000) ** 2 * item.lengthM).toFixed(2)} m³`,
    };
  }
  const f = st.capFamilies.find((x) => x.id === item.familyId)!;
  return {
    label: "Concrete volume",
    value: `${((f.widthMm * f.depthMm * (item.thicknessOverrideMm || f.thicknessMm)) / 1e9).toFixed(2)} m³`,
  };
}
function workbookRows(
  element: SpecialElement,
  st: ReturnType<typeof useSpecialStore.getState>,
) {
  const rows: {
    key: string;
    name: string;
    floor: string;
    calc: string;
    unit: string;
    qty: number;
  }[] = [];
  if (element === "stairs-ramps") {
    for (const f of st.flightFamilies)
      for (const floorId of [
        ...new Set(
          st.flights.filter((x) => x.familyId === f.id && !x.evidenceOnly).map((x) => x.floorId),
        ),
      ]) {
        const items = st.flights.filter(
          (x) => x.familyId === f.id && x.floorId === floorId && !x.evidenceOnly,
          ),
          factor = floorFactor(floorId);
        rows.push({
          key: `flight:${f.id}:${floorId}`,
          name: `${f.mark} · ${f.description}`,
          floor: floorName(floorId),
          calc: `${items.length} flights × ${factor}`,
          unit: "nr",
          qty: items.length * factor,
        });
        const rail =
          items.reduce(
            (s, x) =>
              s +
              edgeLengthM(
                x.points,
                x.railEdges,
                scaleForViewport(x.viewportId),
              ),
            0,
          ) * factor;
        if (rail > 0) rows.push({
          key: `rail:${f.id}:${floorId}`,
          name: `${st.railFamilies[0]?.mark || "Rail"} · ${st.railFamilies[0]?.description || "Balustrade"}`,
          floor: floorName(floorId),
          calc: "Verified enabled flight edges",
          unit: "m",
          qty: +rail.toFixed(2),
        });
      }
  } else {
    for (const f of st.pileFamilies) {
      const items = st.piles.filter((x) => x.familyId === f.id),
        qty = items.reduce(
          (s, x) => s + Math.PI * (f.diameterMm / 2000) ** 2 * x.lengthM,
          0,
        );
      if (items.length)
        rows.push({
          key: `pile:${f.id}:GF`,
          name: `${f.mark} · ${f.description}`,
          floor: "Ground",
          calc: `${items.length} piles × measured lengths`,
          unit: "m³",
          qty: +qty.toFixed(2),
        });
    }
    for (const f of st.capFamilies) {
      const items = st.caps.filter((x) => x.familyId === f.id),
        qty = items.reduce(
          (s, x) =>
            s +
            (f.widthMm * f.depthMm * (x.thicknessOverrideMm || f.thicknessMm)) /
              1e9,
          0,
        );
      if (items.length)
        rows.push({
          key: `cap:${f.id}:GF`,
          name: `${f.mark} · ${f.description}`,
          floor: "Ground",
          calc: `${items.length} pile caps`,
          unit: "m³",
          qty: +qty.toFixed(2),
        });
    }
  }
  return rows;
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-slate-500">{label}</span><b className="max-w-[190px] text-right text-slate-700">{value}</b></div>;
}
function floorFor(viewportId: string) {
  return viewportId === "VP-FIRST"
    ? "FF"
    : viewportId === "VP-TYP"
      ? "TYP"
      : viewportId === "VP-TERRACE"
        ? "RF"
        : "GF";
}
function box(a: Point, b: Point): Point[] {
  return [
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
  ];
}
function toBBox(a: Point, b: Point): BBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(30, Math.abs(a.x - b.x)),
    height: Math.max(30, Math.abs(a.y - b.y)),
  };
}
