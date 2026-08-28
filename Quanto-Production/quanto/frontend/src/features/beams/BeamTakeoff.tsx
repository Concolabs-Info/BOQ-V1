"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DrawingCanvas } from "@/features/drawing/components/DrawingCanvas";
import { useStructuralStore } from "@/features/quanto/structuralStore";
import type { BeamFamily, BeamRun } from "@/features/quanto/structuralTypes";
import type { Point } from "@/features/demo/types";
import { apiUrl } from "@/shared/services/apiClient";
import { appRoutes } from "@/shared/constants/appRoutes";
import { useProductionBeams } from "./useProductionBeams";
import type { BeamEditorState, BeamQuestion, BeamWorkbookRow } from "./types";

const btn = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const activeBtn = "rounded-lg border border-slate-950 bg-slate-950 px-3 py-2 text-xs font-semibold text-white";

export function BeamTakeoff({ projectId, view }: { projectId: string; view: string }) {
  const beam = useProductionBeams(projectId);
  const analysis = beam.state?.analysis;
  const editor = beam.state?.editor;

  if (!analysis || analysis.status === "idle" || analysis.status === "running" || analysis.status === "blocked" || analysis.status === "error" || !editor) {
    return <BeamAnalysisPanel projectId={projectId} analysis={analysis} error={beam.error} onRetry={beam.reanalyze} />;
  }

  if (view === "workbook") return <BeamWorkbook projectId={projectId} editor={editor} />;
  if (view === "3d") return <Beam3D editor={editor} />;
  return <BeamDimension projectId={projectId} editor={editor} onReanalyze={beam.reanalyze} onAnswerQuestion={beam.answerQuestion} />;
}

function BeamAnalysisPanel({
  projectId,
  analysis,
  error,
  onRetry,
}: {
  projectId: string;
  analysis?: { status: string; progress: number; message: string };
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  const blocked = analysis?.status === "blocked";
  const failed = analysis?.status === "error" || Boolean(error);
  const progress = Math.max(2, Math.min(100, analysis?.progress ?? 3));
  return (
    <div className="flex min-h-[540px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white">B</div>
        <h2 className="text-xl font-semibold text-slate-950">
          {blocked ? "Beam drawings are not ready" : failed ? "Beam analysis needs attention" : "Analyzing beams"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {blocked
            ? "Finish Pre first. Quanto will use the project drawings already uploaded; there is no second Beam upload."
            : failed
              ? error || analysis?.message || "Beam analysis could not be completed."
              : analysis?.message || "Preparing the structural drawings and beam quantities."}
        </p>
        {!blocked && !failed ? (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Beam analysis</span><span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-950 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-3 text-xs text-slate-400">The final drawing and quantities will appear here automatically.</p>
          </div>
        ) : null}
        <div className="mt-6 flex gap-2">
          {blocked ? <Link href={appRoutes.pre(projectId, "freeze")} className={btn}>Open Pre</Link> : null}
          {failed ? <button className={btn} onClick={() => void onRetry()}>Run analysis again</button> : null}
        </div>
      </div>
    </div>
  );
}

function BeamDimension({ projectId, editor, onReanalyze, onAnswerQuestion }: { projectId: string; editor: BeamEditorState; onReanalyze: () => Promise<void>; onAnswerQuestion: (questionId: string, answer: string) => Promise<void> }) {
  const families = useStructuralStore((s) => s.beamFamilies);
  const beams = useStructuralStore((s) => s.beams);
  const selectedId = useStructuralStore((s) => s.selectedId);
  const select = useStructuralStore((s) => s.select);
  const replaceBeamData = useStructuralStore((s) => s.replaceBeamData);
  const [pageId, setPageId] = useState(editor.pages.find((p) => editor.beams.some((b) => b.viewportId === p.id))?.id || editor.pages[0]?.id || "");
  const [leftTab, setLeftTab] = useState<"drawings" | "families">("drawings");
  const [tool, setTool] = useState<"select" | "pan" | "add" | "split">("select");
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [activeFamilyId, setActiveFamilyId] = useState(families[0]?.id || "");
  const [visibleFamilyIds, setVisibleFamilyIds] = useState<string[]>(families.map((f) => f.id));
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    if (!families.some((f) => f.id === activeFamilyId)) setActiveFamilyId(families[0]?.id || "");
  }, [activeFamilyId, families]);
  useEffect(() => {
    setVisibleFamilyIds((current) => {
      const valid = current.filter((id) => families.some((f) => f.id === id));
      const added = families.map((f) => f.id).filter((id) => !current.includes(id));
      return [...valid, ...added];
    });
  }, [families]);
  useEffect(() => {
    if (!editor.pages.some((p) => p.id === pageId)) setPageId(editor.pages[0]?.id || "");
  }, [editor.pages, pageId]);

  const page = editor.pages.find((p) => p.id === pageId) || editor.pages[0];
  const selected = beams.find((b) => b.id === selectedId) || null;
  const pageBeams = beams.filter((b) => b.viewportId === page?.id && visibleFamilyIds.includes(b.familyId));
  const netLength = beams.reduce((sum, b) => sum + Number(b.netLengthM || 0), 0);
  const concrete = beams.reduce((sum, b) => sum + currentBeamVolume(b, families), 0);
  const needsReview = beams.filter((b) => b.status === "needs_review").length;

  function apply(nextBeams: BeamRun[], nextFamilies = families) {
    replaceBeamData(nextFamilies, nextBeams);
  }
  function updateBeam(id: string, patch: Partial<BeamRun>) {
    apply(beams.map((b) => b.id === id ? normalizeEditedBeam({ ...b, ...patch }) : b));
  }
  function updateFamily(id: string, patch: Partial<BeamFamily>) {
    apply(
      beams.map((b) => b.familyId === id ? { ...b, status: b.status === "confirmed" ? "needs_review" as const : b.status } : b),
      families.map((f) => f.id === id ? { ...f, ...patch } : f),
    );
  }
  function canvasClick(point: Point) {
    if (tool === "split" && selected) {
      splitSelected(point);
      setTool("select");
      return;
    }
    if (tool !== "add" || !page) return;
    if (!draftStart) {
      setDraftStart(point); setHover(point); return;
    }
    const mmpt = page.mmPerPoint ?? null;
    const length = mmpt ? pointDistance(draftStart, point) * mmpt / 1000 : null;
    const id = `beam_manual_${Date.now().toString(36)}`;
    const family = families.find((f) => f.id === activeFamilyId) || families[0];
    if (!family) return;
    const item: BeamRun = {
      id, mark: `Manual ${beams.filter((b) => b.id.startsWith("beam_manual_")).length + 1}`,
      familyId: family.id, kind: "Downstand", floorId: page.floorLabel || page.name,
      floorLabel: page.floorLabel || page.name, viewportId: page.id, start: draftStart, end: point,
      dropMm: family.depthMm, status: "needs_review", grossLengthM: length, netLengthM: length,
      engineVolumeM3: length == null ? null : length * family.widthMm / 1000 * family.depthMm / 1000,
      mmPerPoint: mmpt, pageIndex: page.pageIndex, sourcePageNumber: page.sourcePageNumber,
      sourceDocument: page.sourceDocument, dimensionSource: "user", dimensionMethod: "manual",
      detectionMethod: "manual", deductions: [], reviewMessages: ["Manually added beam — confirm before BOQ."],
    };
    apply([...beams, item]);
    select(id); setDraftStart(null); setHover(null); setTool("select");
  }
  function splitSelected(point?: Point) {
    if (!selected) return;
    const split = point ? pointOnBeam(selected, point) : { x: (selected.start.x + selected.end.x) / 2, y: (selected.start.y + selected.end.y) / 2 };
    if (pointDistance(split, selected.start) < 2 || pointDistance(split, selected.end) < 2) return;
    const a = normalizeEditedBeam({ ...selected, end: split, status: "needs_review" });
    const b = normalizeEditedBeam({ ...selected, id: `${selected.id}-split-${Date.now().toString(36)}`, mark: `${selected.mark || selected.id} B`, start: split, status: "needs_review", deductions: [] });
    apply(beams.map((x) => x.id === selected.id ? a : x).concat(b));
    select(b.id);
  }
  function mergeSelected() {
    if (!selected) return;
    const neighbour = mergeCandidate(selected, beams);
    if (!neighbour) return;
    const endpoints = [selected.start, selected.end, neighbour.start, neighbour.end];
    let pair: [Point, Point] = [selected.start, selected.end];
    let longest = -1;
    for (let i = 0; i < endpoints.length; i += 1) for (let j = i + 1; j < endpoints.length; j += 1) {
      const distance = pointDistance(endpoints[i], endpoints[j]);
      if (distance > longest) { longest = distance; pair = [endpoints[i], endpoints[j]]; }
    }
    const merged = normalizeEditedBeam({ ...selected, start: pair[0], end: pair[1], status: "needs_review", deductions: [] });
    apply(beams.filter((b) => b.id !== neighbour.id).map((b) => b.id === selected.id ? merged : b));
    select(selected.id);
  }
  function createFamily() {
    const mark = window.prompt("Beam family mark or name", "New beam")?.trim();
    if (!mark) return;
    const widthMm = Number(window.prompt("Beam width (mm)", "230"));
    const depthMm = Number(window.prompt("Beam depth (mm)", "450"));
    if (!(widthMm > 0) || !(depthMm > 0)) return;
    const id = `BEAM-USER-${Date.now().toString(36)}`;
    const family: BeamFamily = { id, mark, description: "RCC beam", widthMm, depthMm, source: "User", color: "#0f766e" };
    apply(beams, [...families, family]);
    setActiveFamilyId(id);
    setLeftTab("families");
  }
  const canMerge = selected ? Boolean(mergeCandidate(selected, beams)) : false;
  function deleteSelected() {
    if (!selected) return;
    apply(beams.filter((b) => b.id !== selected.id)); select(null);
  }
  function confirmAll() {
    apply(beams.map((b) => ({ ...b, status: "confirmed" as const, reviewMessages: [] })));
  }

  if (!page) {
    return <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Beam analysis completed, but no beam plan page was available to display.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Detected beams" value={String(beams.length)} />
        <Metric label="Net length" value={`${netLength.toFixed(2)} m`} />
        <Metric label="Concrete" value={`${concrete.toFixed(3)} m³`} />
        <Metric label="Needs review" value={String(needsReview)} warn={needsReview > 0} />
      </div>
      <BeamQuestionsPanel questions={editor.questions} onAnswer={onAnswerQuestion} />
      <div className="grid min-h-[620px] flex-1 grid-cols-[220px_minmax(0,1fr)_320px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <aside className="min-w-0 border-r border-slate-200">
          <div className="grid grid-cols-2 border-b border-slate-200 p-2">
            <button className={leftTab === "drawings" ? activeBtn : "rounded-lg px-2 py-2 text-xs font-semibold text-slate-500"} onClick={() => setLeftTab("drawings")}>Drawings</button>
            <button className={leftTab === "families" ? activeBtn : "rounded-lg px-2 py-2 text-xs font-semibold text-slate-500"} onClick={() => setLeftTab("families")}>Families</button>
          </div>
          <div className="max-h-[690px] space-y-2 overflow-y-auto p-3">
            {leftTab === "drawings" ? editor.pages.map((p) => {
              const count = beams.filter((b) => b.viewportId === p.id).length;
              return <button key={p.id} className={`w-full rounded-xl border p-3 text-left ${p.id === page.id ? "border-slate-950 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`} onClick={() => { setPageId(p.id); select(null); setDraftStart(null); setTool("select"); }}>
                <div className="text-xs font-semibold text-slate-800">{p.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">{p.sourceDocument || "Project drawing"}{p.sourcePageNumber ? ` · p.${p.sourcePageNumber}` : ""}</div>
                <div className="mt-2 text-[11px] font-medium text-slate-500">{count} beam{count === 1 ? "" : "s"}</div>
              </button>;
            }) : <><button className={btn} onClick={createFamily}>New family</button>{families.map((f) => <button key={f.id} className={`w-full rounded-xl border p-3 text-left ${f.id === activeFamilyId ? "border-slate-950 bg-slate-50" : "border-slate-200"}`} onClick={() => setActiveFamilyId(f.id)}>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} /><span className="text-xs font-semibold text-slate-800">{f.mark}</span></div>
              <div className="mt-1 text-[11px] text-slate-400">{f.widthMm} × {f.depthMm} mm</div>
            </button>)}</>}
          </div>
          <div className="border-t border-slate-200 p-3 text-xs">
            <div className="mb-2 font-semibold text-slate-700">Layers</div>
            <label className="flex items-center gap-2 py-1 text-slate-600"><input type="checkbox" checked={visibleFamilyIds.length === families.length} onChange={(e) => setVisibleFamilyIds(e.target.checked ? families.map((f) => f.id) : [])} />Beams</label>
            {families.map((f) => <label key={f.id} className="flex items-center gap-2 py-1 pl-4 text-slate-500"><input type="checkbox" checked={visibleFamilyIds.includes(f.id)} onChange={(e) => setVisibleFamilyIds((ids) => e.target.checked ? [...new Set([...ids, f.id])] : ids.filter((id) => id !== f.id))} />{f.mark}</label>)}
            <label className="flex items-center gap-2 py-1 text-slate-600"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />Beam labels</label>
          </div>
        </aside>

        <main className="min-w-0 bg-slate-100 p-3">
          <DrawingCanvas
            imageUrl={apiUrl(page.imageUrl)} width={page.width} height={page.height}
            tool={tool === "pan" ? "pan" : tool === "add" || tool === "split" ? "draw" : "select"}
            onCanvasClick={canvasClick}
            onCanvasMove={(p) => { if (tool === "add" && draftStart) setHover(p); }}
            toolbarLeft={<div className="flex flex-wrap gap-1.5">
              <button className={tool === "select" ? activeBtn : btn} onClick={() => { setTool("select"); setDraftStart(null); }}>Select</button>
              <button className={tool === "pan" ? activeBtn : btn} onClick={() => { setTool("pan"); setDraftStart(null); }}>Hand</button>
              <button className={tool === "add" ? activeBtn : btn} onClick={() => { setTool("add"); setDraftStart(null); }}>Add beam</button>
              <button className={tool === "split" ? activeBtn : btn} disabled={!selected} onClick={() => setTool("split")}>{tool === "split" ? "Click split point" : "Split"}</button>
              <button className={btn} disabled={!canMerge} onClick={mergeSelected}>Merge</button>
              <button className={btn} disabled={!selected} onClick={deleteSelected}>Delete</button>
            </div>}
            toolbarRight={<div className="flex gap-1.5">
              <button className={btn} onClick={() => { if (window.confirm("Re-run Beam analysis from the project drawings? Current Beam edits will be replaced.")) void onReanalyze(); }}>Re-analyze</button>
              <button className={btn} disabled={!beams.length || needsReview === 0} onClick={confirmAll}>Confirm beams</button>
            </div>}
          >
            <BeamOverlay
              beams={pageBeams} families={families} selectedId={selectedId} enabled={tool === "select"} showLabels={showLabels}
              onSelect={select} onChange={(id, patch) => updateBeam(id, patch)}
            />
            {draftStart && hover ? <g pointerEvents="none"><line x1={draftStart.x} y1={draftStart.y} x2={hover.x} y2={hover.y} stroke="#0f172a" strokeWidth={2} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" /><circle cx={draftStart.x} cy={draftStart.y} r={4} fill="#0f172a" vectorEffect="non-scaling-stroke" /></g> : null}
          </DrawingCanvas>
        </main>

        <aside className="min-w-0 border-l border-slate-200 bg-white">
          {selected ? <BeamInspector beam={selected} families={families} onBeamChange={(patch) => updateBeam(selected.id, patch)} onFamilyChange={updateFamily} /> : <div className="p-5"><h3 className="text-sm font-semibold text-slate-800">Beam results</h3><p className="mt-2 text-xs leading-5 text-slate-500">Select a beam on the drawing to inspect or correct it. The drawing, beam family, net length and quantity update together.</p><div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs text-slate-500"><div className="font-semibold text-slate-700">{page.name}</div><div className="mt-1">{page.scaleDenom ? `Scale 1:${page.scaleDenom}` : "Scale requires review"}</div><div className="mt-1">{pageBeams.length} beams on this drawing</div></div></div>}
        </aside>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs text-slate-500">Review the overlay. Correct anything that is wrong, then confirm the beams before final BOQ issue.</p>
        <div className="flex gap-2"><Link className={btn} href={`/workspace/${projectId}/review`}>Open Review</Link><Link className={btn} href={appRoutes.workspaceBoq(projectId)}>Open BOQ</Link></div>
      </div>
    </div>
  );
}

function BeamOverlay({ beams, families, selectedId, enabled, showLabels, onSelect, onChange }: {
  beams: BeamRun[]; families: BeamFamily[]; selectedId: string | null; enabled: boolean; showLabels: boolean;
  onSelect: (id: string | null) => void; onChange: (id: string, patch: Partial<BeamRun>) => void;
}) {
  return <g>{beams.map((beam) => <DraggableBeam key={beam.id} beam={beam} family={families.find((f) => f.id === beam.familyId)} selected={beam.id === selectedId} enabled={enabled} showLabel={showLabels} onSelect={() => onSelect(beam.id)} onChange={(patch) => onChange(beam.id, patch)} />)}</g>;
}

type Drag = { mode: "start" | "end" | "move"; origin: Point; start: Point; end: Point };
function DraggableBeam({ beam, family, selected, enabled, showLabel, onSelect, onChange }: { beam: BeamRun; family?: BeamFamily; selected: boolean; enabled: boolean; showLabel: boolean; onSelect: () => void; onChange: (patch: Partial<BeamRun>) => void }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const color = family?.color || "#e11d48";
  const label = beam.mark || family?.mark || beam.id;
  function sourcePoint(e: ReactPointerEvent<SVGElement>): Point {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return { x: e.clientX, y: e.clientY };
    const r = svg.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    return { x: box.x + (e.clientX - r.left) / Math.max(1, r.width) * box.width, y: box.y + (e.clientY - r.top) / Math.max(1, r.height) * box.height };
  }
  function begin(mode: Drag["mode"], e: ReactPointerEvent<SVGElement>) {
    if (!enabled) return;
    e.stopPropagation(); e.preventDefault();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode, origin: sourcePoint(e), start: beam.start, end: beam.end });
  }
  function move(e: ReactPointerEvent<SVGElement>) {
    if (!drag) return;
    e.stopPropagation();
    const p = sourcePoint(e);
    if (drag.mode === "start") onChange({ start: p, status: "needs_review", deductions: [] });
    else if (drag.mode === "end") onChange({ end: p, status: "needs_review", deductions: [] });
    else {
      const dx = p.x - drag.origin.x, dy = p.y - drag.origin.y;
      onChange({ start: { x: drag.start.x + dx, y: drag.start.y + dy }, end: { x: drag.end.x + dx, y: drag.end.y + dy }, status: "needs_review", deductions: [] });
    }
  }
  function end(e: ReactPointerEvent<SVGElement>) { if (!drag) return; e.stopPropagation(); setDrag(null); }
  const mx = (beam.start.x + beam.end.x) / 2, my = (beam.start.y + beam.end.y) / 2;
  return <g>
    <line x1={beam.start.x} y1={beam.start.y} x2={beam.end.x} y2={beam.end.y} stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" pointerEvents={enabled ? "stroke" : "none"} onPointerDown={(e) => begin("move", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    <line x1={beam.start.x} y1={beam.start.y} x2={beam.end.x} y2={beam.end.y} stroke={color} strokeWidth={selected ? 4 : 2.5} opacity={beam.status === "needs_review" ? 0.75 : 0.95} vectorEffect="non-scaling-stroke" pointerEvents="none" />
    {showLabel ? <text x={mx} y={my - 5} fontSize={11} fontWeight={700} fill="#0f172a" stroke="white" strokeWidth={3} paintOrder="stroke" textAnchor="middle" pointerEvents="none">{label}</text> : null}
    {selected && enabled ? <>
      <circle cx={beam.start.x} cy={beam.start.y} r={6} fill="white" stroke="#0f172a" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={(e) => begin("start", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <circle cx={beam.end.x} cy={beam.end.y} r={6} fill="white" stroke="#0f172a" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={(e) => begin("end", e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </> : null}
  </g>;
}

function BeamInspector({ beam, families, onBeamChange, onFamilyChange }: { beam: BeamRun; families: BeamFamily[]; onBeamChange: (patch: Partial<BeamRun>) => void; onFamilyChange: (id: string, patch: Partial<BeamFamily>) => void }) {
  const family = families.find((f) => f.id === beam.familyId) || families[0];
  if (!family) return null;
  return <div className="max-h-[720px] space-y-5 overflow-y-auto p-5">
    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Selected beam</div><input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" value={beam.mark || ""} onChange={(e) => onBeamChange({ mark: e.target.value, status: "needs_review" })} /></div>
    <Field label="Beam family"><select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={beam.familyId} onChange={(e) => onBeamChange({ familyId: e.target.value, status: "needs_review" })}>{families.map((f) => <option key={f.id} value={f.id}>{f.mark} · {f.widthMm} × {f.depthMm} mm</option>)}</select></Field>
    <Field label="Beam kind"><select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={beam.kind} onChange={(e) => onBeamChange({ kind: e.target.value as BeamRun["kind"], status: "needs_review" })}><option value="Downstand">Downstand — below soffit</option><option value="Through">Through — within slab plate</option></select></Field>
    <div className="grid grid-cols-2 gap-2"><NumberField label="Width (mm)" value={family.widthMm} onChange={(value) => onFamilyChange(family.id, { widthMm: value })} /><NumberField label="Depth (mm)" value={family.depthMm} onChange={(value) => onFamilyChange(family.id, { depthMm: value })} /></div>
    <NumberField label={beam.kind === "Downstand" ? "Drop below soffit (mm)" : "Measured depth (mm)"} value={beam.dropMm} onChange={(value) => onBeamChange({ dropMm: value, status: "needs_review" })} />
    <div className="grid grid-cols-2 gap-2"><Info label="Gross length" value={beam.grossLengthM == null ? "—" : `${beam.grossLengthM.toFixed(3)} m`} /><Info label="Net length" value={beam.netLengthM == null ? "—" : `${beam.netLengthM.toFixed(3)} m`} /></div>
    <Info label="Concrete" value={`${currentBeamVolume(beam, families).toFixed(4)} m³`} />
    <Field label="Status"><select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={beam.status} onChange={(e) => onBeamChange({ status: e.target.value as BeamRun["status"] })}><option value="needs_review">Needs review</option><option value="ready">Ready</option><option value="confirmed">Confirmed</option></select></Field>
    <div className="border-t border-slate-100 pt-4"><div className="text-xs font-semibold text-slate-700">Source</div><div className="mt-2 space-y-2 text-xs text-slate-500"><div>{beam.sourceDocument || "Project drawing"}{beam.sourcePageNumber ? ` · page ${beam.sourcePageNumber}` : ""}</div><div>{beam.floorLabel || beam.floorId}</div><div>{friendlyDetection(beam.detectionMethod)}</div><div>{friendlyDimension(beam.dimensionSource, beam.dimensionMethod)}</div></div></div>
    {beam.status === "needs_review" ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Check this beam on the drawing, then mark it Ready or Confirmed.</div> : null}
  </div>;
}

function BeamQuestionsPanel({ questions, onAnswer }: { questions: BeamQuestion[]; onAnswer: (questionId: string, answer: string) => Promise<void> }) {
  const open = questions.filter((q) => q.status !== "answered");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!open.length) return null;
  return <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
    <summary className="cursor-pointer text-xs font-semibold text-amber-900">{open.length} beam question{open.length === 1 ? "" : "s"} need review</summary>
    <div className="mt-3 space-y-3">{open.map((question) => <div key={question.id} className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="text-xs leading-5 text-slate-700">{question.text}</div>
      <div className="mt-2 flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Enter the confirmed answer" value={answers[question.id] || ""} onChange={(e) => setAnswers((current) => ({ ...current, [question.id]: e.target.value }))} /><button className={btn} disabled={saving === question.id || !(answers[question.id] || "").trim()} onClick={async () => { setSaving(question.id); setError(null); try { await onAnswer(question.id, answers[question.id]); } catch (e) { setError(e instanceof Error ? e.message : "Question could not be saved"); } finally { setSaving(null); } }}>{saving === question.id ? "Saving…" : "Save answer"}</button></div>
    </div>)}</div>
    {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
  </details>;
}

function BeamWorkbook({ projectId, editor }: { projectId: string; editor: BeamEditorState }) {
  const families = useStructuralStore((s) => s.beamFamilies);
  const beams = useStructuralStore((s) => s.beams);
  const replaceBeamData = useStructuralStore((s) => s.replaceBeamData);
  const changed = JSON.stringify(editor.beams) !== JSON.stringify(beams) || JSON.stringify(editor.families) !== JSON.stringify(families);
  const rows = changed ? currentWorkbook(editor, beams, families) : editor.engineWorkbook;
  const net = beams.reduce((sum, b) => sum + Number(b.netLengthM || 0), 0);
  const volume = beams.reduce((sum, b) => sum + currentBeamVolume(b, families), 0);
  const confirm = () => replaceBeamData(families, beams.map((b) => ({ ...b, status: "confirmed" as const, reviewMessages: [] })));
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Metric label="Beams" value={String(beams.length)} /><Metric label="Net length" value={`${net.toFixed(2)} m`} /><Metric label="Concrete" value={`${volume.toFixed(3)} m³`} /><Metric label="Workbook rows" value={String(rows.length)} /></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Beam workbook</h2><p className="mt-1 text-xs text-slate-500">{changed ? "Updated from your corrected Beam canvas." : "Original Beam-engine workbook output."}</p></div><div className="flex gap-2"><button className={btn} onClick={confirm}>Confirm beams</button><Link className={btn} href={`/workspace/${projectId}/review`}>Review</Link><Link className={btn} href={appRoutes.workspaceBoq(projectId)}>BOQ</Link></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Family</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Calculation</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r.id}><td className="px-4 py-3 font-semibold text-slate-800">{r.family}</td><td className="max-w-[320px] px-4 py-3 text-slate-600">{r.scope}</td><td className="max-w-[360px] px-4 py-3 text-slate-500">{r.calc}</td><td className="px-4 py-3 text-right font-semibold text-slate-900">{Number(r.qty).toFixed(3)}</td><td className="px-4 py-3">{r.unit}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">{r.status}</span></td></tr>)}</tbody></table></div>
    </div>
  </div>;
}

function Beam3D({ editor }: { editor: BeamEditorState }) {
  const beams = useStructuralStore((s) => s.beams);
  const families = useStructuralStore((s) => s.beamFamilies);
  const floors = useMemo(() => [...new Set(beams.map((b) => b.floorId))], [beams]);
  const allX = beams.flatMap((b) => [b.start.x, b.end.x]), allY = beams.flatMap((b) => [b.start.y, b.end.y]);
  const minX = Math.min(...allX, 0), maxX = Math.max(...allX, 1), minY = Math.min(...allY, 0), maxY = Math.max(...allY, 1);
  const sx = (x: number) => 70 + (x - minX) / Math.max(1, maxX - minX) * 700;
  const sy = (y: number, floor: string) => 510 - (y - minY) / Math.max(1, maxY - minY) * 300 - floors.indexOf(floor) * 46;
  return <div className="flex min-h-[620px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Beams · 3D overview</h2><p className="mt-1 text-xs text-slate-500">The same detected and edited Beam IDs are shown here.</p></div><div className="min-h-0 flex-1 bg-slate-50 p-4"><svg viewBox="0 0 860 560" className="h-full min-h-[500px] w-full rounded-xl bg-white">{beams.map((b) => { const f = families.find((x) => x.id === b.familyId); const z = floors.indexOf(b.floorId) * 16; return <g key={b.id}><line x1={sx(b.start.x)+z} y1={sy(b.start.y,b.floorId)} x2={sx(b.end.x)+z} y2={sy(b.end.y,b.floorId)} stroke={f?.color || "#64748b"} strokeWidth={Math.max(3, Math.min(12, (f?.widthMm || 250)/70))} strokeLinecap="round" /><title>{b.mark || b.id} · {f?.mark || b.familyId}</title></g>; })}{floors.map((f,i)=><text key={f} x={20} y={510-i*46} fontSize={11} fill="#64748b">{f}</text>)}</svg></div><div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">{editor.summary.beamCount} originally detected · current {beams.length} beams</div></div>;
}

function currentWorkbook(editor: BeamEditorState, beams: BeamRun[], families: BeamFamily[]): BeamWorkbookRow[] {
  let grade = "TBC";
  const source = editor.engineWorkbook[0]?.source;
  try {
    const parsed = typeof source === "string" ? JSON.parse(source) : source;
    if (parsed && typeof parsed === "object" && "grade" in parsed && parsed.grade) grade = String(parsed.grade);
  } catch { /* keep TBC */ }
  return families.flatMap((f, i) => {
    const members = beams.filter((b) => b.familyId === f.id && b.netLengthM != null);
    if (!members.length || !f.widthMm || !f.depthMm) return [];
    const qty = members.reduce((sum, b) => sum + currentBeamVolume(b, families), 0);
    const band = f.widthMm <= 300 ? "<=300mm" : ">300mm";
    return [{
      id: `edited-beam-row-${i}-${f.id}`, family: "Beam",
      scope: `In-situ concrete works — horizontal work, reinforced; grade ${grade}; thickness ${band}`,
      calc: members.map((b) => `${Number(b.netLengthM).toFixed(2)}m x ${(beamMeasuredDepth(b, f)/1000).toFixed(2)}m x ${(f.widthMm/1000).toFixed(2)}m`).join(" + "),
      qty: Number(qty.toFixed(3)), unit: "m3", status: members.every((b) => b.status === "confirmed") ? "Confirmed" : "User-edited",
      source: { beams: members.map((b) => ({ id: b.id, mark: b.mark, page_index: b.pageIndex })), grade, thickness_band: band },
    }];
  });
}

function normalizeEditedBeam(beam: BeamRun): BeamRun {
  const mmpt = beam.mmPerPoint || null;
  const length = mmpt ? pointDistance(beam.start, beam.end) * mmpt / 1000 : beam.netLengthM ?? null;
  return { ...beam, grossLengthM: length, netLengthM: length, engineVolumeM3: null, deductions: [], status: beam.status === "confirmed" ? "needs_review" : beam.status };
}
function currentBeamVolume(beam: BeamRun, families: BeamFamily[]): number {
  const f = families.find((x) => x.id === beam.familyId);
  if (!f || beam.netLengthM == null) return 0;
  return beam.netLengthM * (f.widthMm / 1000) * (beamMeasuredDepth(beam, f) / 1000);
}
function beamMeasuredDepth(beam: BeamRun, family: BeamFamily) { return beam.kind === "Downstand" ? beam.dropMm : family.depthMm; }
function pointDistance(a: Point, b: Point) { return Math.hypot(b.x - a.x, b.y - a.y); }
function pointOnBeam(beam: BeamRun, point: Point): Point {
  const dx = beam.end.x - beam.start.x, dy = beam.end.y - beam.start.y;
  const denom = dx * dx + dy * dy;
  if (!denom) return beam.start;
  const t = Math.max(0, Math.min(1, ((point.x - beam.start.x) * dx + (point.y - beam.start.y) * dy) / denom));
  return { x: beam.start.x + t * dx, y: beam.start.y + t * dy };
}
function mergeCandidate(beam: BeamRun, beams: BeamRun[]): BeamRun | null {
  const ax = beam.end.x - beam.start.x, ay = beam.end.y - beam.start.y;
  const aLength = Math.hypot(ax, ay);
  if (!aLength) return null;
  return beams.find((other) => {
    if (other.id === beam.id || other.viewportId !== beam.viewportId || other.familyId !== beam.familyId || other.kind !== beam.kind) return false;
    const bx = other.end.x - other.start.x, by = other.end.y - other.start.y;
    const bLength = Math.hypot(bx, by);
    if (!bLength) return false;
    const parallel = Math.abs((ax * bx + ay * by) / (aLength * bLength));
    if (parallel < 0.995) return false;
    const touching = Math.min(
      pointDistance(beam.start, other.start), pointDistance(beam.start, other.end),
      pointDistance(beam.end, other.start), pointDistance(beam.end, other.end),
    );
    const lineDistance = Math.abs(ax * (other.start.y - beam.start.y) - ay * (other.start.x - beam.start.x)) / aLength;
    return touching <= 8 && lineDistance <= 4;
  }) || null;
}
function friendlyDetection(method?: string | null) {
  const text = String(method || "").toLowerCase();
  if (!text) return "Detected from structural drawing";
  if (text.includes("dash") || text.includes("edge") || text.includes("vector")) return "Detected from drawing linework";
  if (text.includes("manual")) return "Added by user";
  return "Detected and checked from drawing";
}
function friendlyDimension(source?: string | null, method?: string | null) {
  const text = `${source || ""} ${method || ""}`.toLowerCase();
  if (text.includes("schedule")) return "Size from beam schedule";
  if (text.includes("mark")) return "Size from beam mark";
  if (text.includes("dimension")) return "Size from drawing dimension";
  if (text.includes("edge") || text.includes("gap")) return "Size checked from drawn beam width";
  if (text.includes("user") || text.includes("manual")) return "Size edited by user";
  return "Size resolved from project drawing information";
}
function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-1 text-lg font-semibold ${warn ? "text-amber-600" : "text-slate-900"}`}>{value}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-xs font-medium text-slate-700">{value}</div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-500">{label}</span>{children}</label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" min={0} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} /></Field>; }
