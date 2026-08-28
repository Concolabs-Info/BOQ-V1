"use client";
import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { QuantoPageShell } from "@/features/quanto/QuantoPageShell";
import {
  PreDrawing as DemoDrawing,
  ViewportEditorOverlay,
  drawingSize,
  svgPoint,
  DRAWING_HEIGHT,
  DRAWING_WIDTH,
} from "./PreDrawing";
import { ResizableThreePane } from "@/features/quanto/components/ResizablePanels";
import { usePreStore, viewportRequiresScale, type PreStage } from "@/features/pre/state/preStore";
import { usePreProjectSync } from "@/features/pre/hooks/usePreProjectSync";
import { preApi, renderUrl } from "@/features/pre/services/preApi";
import { appRoutes } from "@/shared/constants/appRoutes";
import type {
  DemoStatus,
  Point,
  SpecificationItem,
  Viewport,
  ViewportCategory,
  ScaleDistanceUnit,
} from "@/features/demo/types";
import {
  MeasurementOverlay,
  useMeasurementTool,
} from "@/features/quanto/measurements/MeasurementOverlay";

const titles: Record<string, string> = {
  upload: "Upload",
  plans: "Plans",
  scale: "Scale",
  height: "Height",
  specifications: "Specifications",
  "start-takeoff": "Start takeoff",
};
const plansToolClass =
  "rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50";
const plansActiveTool =
  "rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white";
const viewportGroups = ["plan", "elevation", "section", "detail"] as const;
const viewportGroupLabels: Record<(typeof viewportGroups)[number], string> = {
  plan: "Plans",
  elevation: "Elevations",
  section: "Sections",
  detail: "Structural drawings",
};

type ScaleEvidenceKind = "printed" | "x" | "y";
// Working PDF renders are generated at 150 DPI. Convert metres-per-render-pixel
// back to the conventional 1:N drawing ratio using that real render density.
const SCALE_PX_PER_METRE = 150 * 1000 / 25.4;
function distanceToMetres(value: string, unit: ScaleDistanceUnit): number {
  if (unit === "ft-in") {
    const match = value
      .trim()
      .match(
        /^(-?\d+(?:\.\d+)?)\s*(?:'|ft)?(?:\s*[- ]?\s*(\d+(?:\.\d+)?)\s*(?:\"|in)?)?$/i,
      );
    return match ? (Number(match[1]) * 12 + Number(match[2] || 0)) * 0.0254 : 0;
  }
  const number = Number(value) || 0;
  return unit === "mm" ? number / 1000 : unit === "cm" ? number / 100 : number;
}
function metresToDistance(metres: number, unit: ScaleDistanceUnit): string {
  if (unit === "mm") return String(Math.round(metres * 1000));
  if (unit === "cm") return String(Math.round(metres * 100) / 100);
  if (unit === "ft-in") {
    const inches = Math.round(metres / 0.0254),
      feet = Math.floor(inches / 12);
    return `${feet}'-${inches % 12}\"`;
  }
  return String(Math.round(metres * 1000) / 1000);
}
function knownDistanceLabel(value: string, unit: ScaleDistanceUnit): string {
  if (unit === "ft-in") return value;
  if (unit === "m") return `${value} m`;
  return `${value} ${unit}`;
}
export function PrePage({
  projectId,
  step,
}: {
  projectId: string;
  step: string;
}) {
  const title = titles[step] || "Pre";
  const stage = (step in titles ? step : "start-takeoff") as PreStage;
  const { isLoading, error } = usePreProjectSync(projectId, stage);
  if (isLoading) {
    return (
      <QuantoPageShell projectId={projectId} title={title} subtitle="Prepare and verify the drawing package before takeoff">
        <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/><p className="mt-3 text-sm font-medium text-slate-600">Loading project…</p></div>
        </div>
      </QuantoPageShell>
    );
  }
  if (error) {
    return (
      <QuantoPageShell projectId={projectId} title={title} subtitle="Prepare and verify the drawing package before takeoff">
        <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-red-200 bg-white p-8 text-center"><div><h3 className="font-semibold text-red-700">Could not load this project</h3><p className="mt-2 max-w-lg text-sm text-slate-500">{error instanceof Error ? error.message : "The Pre API is unavailable."}</p></div></div>
      </QuantoPageShell>
    );
  }
  return (
    <QuantoPageShell
      projectId={projectId}
      title={title}
      subtitle="Prepare and verify the drawing package before takeoff"
    >
      {step === "upload" ? (
        <UploadScreen projectId={projectId} />
      ) : step === "plans" ? (
        <PlansScreen projectId={projectId} />
      ) : step === "scale" ? (
        <ScaleScreen projectId={projectId} />
      ) : step === "height" ? (
        <HeightScreen projectId={projectId} />
      ) : step === "specifications" ? (
        <SpecificationsScreen projectId={projectId} />
      ) : (
        <StartScreen projectId={projectId} />
      )}
    </QuantoPageShell>
  );
}

function UploadScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const sheets = usePreStore((s) => s.sheets);
  const toggle = usePreStore((s) => s.toggleSheet);
  const resetPre = usePreStore((s) => s.resetPre);
  const hydrate = usePreStore((s) => s.hydrate);
  const confirmSheetSet = usePreStore((s) => s.confirmSheetSet);
  const [phase, setPhase] = useState<"drop" | "scan" | "grid" | "workspace">(
    "drop",
  );
  const [scanIndex, setScanIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanPageCount, setScanPageCount] = useState(0);
  const [selected, setSelected] = useState("");
  const [previewSheetId, setPreviewSheetId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && sheets[0]) setSelected(sheets[0].id);
  }, [selected, sheets]);
  useEffect(() => {
    if (sheets.length && phase === "drop" && !uploadedFileName) setPhase("grid");
  }, [sheets.length, phase, uploadedFileName]);

  async function beginUpload(file?: File) {
    if (!file || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
      setUploadError("Choose a PDF file to continue.");
      return;
    }
    setUploadError(null);
    setUploadedFileName(file.name);
    setScanIndex(0);
    setScanProgress(1);
    setScanPreview(null);
    setScanPageCount(0);
    setPhase("scan");
    resetPre(projectId);
    try {
      const created = await preApi.upload(projectId, file);
      let document = await preApi.document(created.id);
      for (let attempt = 0; attempt < 480 && ["queued", "processing"].includes(document.status); attempt += 1) {
        const pages = document.pages || [];
        const latest = pages[Math.max(0, pages.length - 1)] as { working_render_id?: string } | undefined;
        if (latest?.working_render_id) setScanPreview(renderUrl(latest.working_render_id));
        setScanPageCount(Math.max(document.page_count || 0, pages.length));
        setScanIndex(Math.max(0, pages.length - 1));
        setScanProgress(Math.min(70, Math.max(2, (document.progress || 0) * 0.7)));
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        document = await preApi.document(created.id);
      }
      if (document.status !== "ready") throw new Error(document.error_message || "PDF processing failed.");
      setScanProgress(72);
      setScanPageCount(document.page_count || document.ingested_pages || 0);
      const finalPage = document.pages?.[Math.max(0, (document.pages?.length || 1) - 1)] as { working_render_id?: string } | undefined;
      if (finalPage?.working_render_id) setScanPreview(renderUrl(finalPage.working_render_id));

      await preApi.triage(projectId);
      let state = await preApi.pre(projectId);
      for (let attempt = 0; attempt < 480; attempt += 1) {
        if (state.project.pre_status === "triage_failed") throw new Error("Drawing analysis failed. Review the backend log and retry.");
        if (state.project.pre_status !== "triaging" && state.sheets.length > 0) break;
        setScanProgress(Math.min(98, 75 + attempt * 0.5));
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        state = await preApi.pre(projectId);
      }
      if (!state.sheets.length) throw new Error("No drawing pages were produced by analysis.");
      hydrate(projectId, state);
      setSelected(state.sheets[0].id);
      setScanIndex(Math.max(0, state.sheets.length - 1));
      setScanPageCount(state.sheets.length);
      setScanProgress(100);
      setPhase("grid");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
      setPhase("drop");
    }
  }
  if (phase === "drop")
    return (
      <div className="min-h-[650px] rounded-3xl border border-slate-200 bg-white p-8">
        <div
          onDrop={(e) => {
            e.preventDefault();
            beginUpload(e.dataTransfer.files[0]);
          }}
          onDragOver={(e) => e.preventDefault()}
          className="flex min-h-[540px] w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-6 text-center transition hover:bg-blue-50"
        >
          <span className="text-5xl text-blue-600">＋</span>
          <h3 className="mt-5 text-2xl font-semibold text-slate-950">
            Upload your PDF
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Drag and drop a drawing package, or choose a PDF from your device.
          </p>
          <label className="mt-6 cursor-pointer rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => beginUpload(e.target.files?.[0])}
            />
            Upload PDF
          </label>
          {uploadError ? (
            <p className="mt-4 text-sm font-medium text-red-600">
              {uploadError}
            </p>
          ) : null}
        </div>
      </div>
    );
  if (phase === "scan") {
    const sheet = sheets.length ? sheets[Math.min(scanIndex, sheets.length - 1)] : undefined;
    const progress = scanProgress;
    const pageTotal = Math.max(scanPageCount, sheets.length, 1);
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6">
        <div
          className="absolute left-0 top-0 h-1 bg-blue-500 transition-all"
          style={{ width: `${progress}%` }}
        />
        <div className="mx-auto flex min-h-0 w-full max-w-[660px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="relative flex h-full w-full items-center justify-center">
            {sheet?.image || scanPreview ? (
              <img
                src={sheet?.image || scanPreview || ""}
                className="block max-h-full max-w-full object-contain"
                alt="Drawing page being scanned"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-medium text-slate-400">Preparing drawing pages…</div>
            )}
            <div className="absolute left-0 right-0 h-1 bg-blue-500 shadow-[0_0_16px_4px_rgba(59,130,246,.45)] animate-[scan_1.1s_linear_infinite]" />
          </div>
        </div>
        <div className="mt-4 shrink-0 text-center text-sm font-semibold text-slate-700">
          Scanning {uploadedFileName} · page{" "}
          {Math.min(scanIndex + 1, pageTotal)} of {pageTotal} ·{" "}
          {sheet?.title || (progress < 72 ? "Rendering PDF" : "Identifying drawings")}
        </div>
        <style jsx>{`
          @keyframes scan {
            0% {
              top: 3%;
            }
            100% {
              top: 96%;
            }
          }
        `}</style>
      </div>
    );
  }
  if (phase === "grid") {
    const previewSheet = sheets.find((sheet) => sheet.id === previewSheetId);
    return (
      <>
        <div className="rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h3 className="font-semibold">PDF pages</h3>
              <p className="mt-1 text-sm text-slate-500">
                All {sheets.length} pages were scanned. Select a thumbnail to
                review a page before continuing.
              </p>
            </div>
            <button
              onClick={() => setPhase("workspace")}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Open workspace
            </button>
          </div>
          <div className="divide-y divide-slate-200">
            {sheets.map((s) => (
              <div key={s.id} className="px-6 py-3">
                <div className="grid grid-cols-[68px_88px_minmax(0,1fr)_76px_100px] items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPreviewSheetId(s.id)}
                    className="group overflow-hidden rounded-md border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Preview page ${s.page}: ${s.title}`}
                  >
                    <img
                      src={s.image}
                      alt=""
                      className="h-12 w-[66px] object-cover object-top transition group-hover:scale-105"
                    />
                  </button>
                  <span className="font-semibold text-slate-900">
                    {s.sheetNo}
                  </span>
                  <span className="text-sm text-slate-700">{s.title}</span>
                  <span className="text-xs text-slate-500">Page {s.page}</span>
                  <button
                    onClick={() => toggle(s.id)}
                    className={
                      s.included
                        ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                        : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500"
                    }
                  >
                    {s.included ? "Included" : "Excluded"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {previewSheet ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Preview: ${previewSheet.title}`}
            onClick={() => setPreviewSheetId(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-5"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {previewSheet.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {previewSheet.sheetNo} · PDF page {previewSheet.page}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewSheetId(null)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
              <div className="overflow-auto bg-slate-100 p-5">
                <img
                  src={previewSheet.image}
                  alt={`PDF page ${previewSheet.page}: ${previewSheet.title}`}
                  className="mx-auto max-h-[78vh] rounded-md bg-white shadow-lg"
                />
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }
  const sheet = sheets.find((s) => s.id === selected) || sheets[0];
  return (
    <ThreePane
      left={
        <div className="space-y-3 p-3">
          <button
            type="button"
            onClick={() => setPhase("grid")}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            ← Back to PDF pages
          </button>
          {sheets.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={
                selected === s.id
                  ? "w-full rounded-xl border border-blue-200 bg-blue-50 p-2 text-left"
                  : "w-full rounded-xl border border-slate-200 bg-white p-2 text-left hover:border-blue-200"
              }
            >
              <img
                src={s.image}
                alt=""
                className="h-28 w-full rounded-md object-cover object-top"
              />
              <div className="mt-2 text-xs font-semibold">
                {s.sheetNo} · {s.title}
              </div>
            </button>
          ))}
        </div>
      }
      center={
        <div className="flex h-full items-center justify-center bg-slate-100 p-5">
          <img
            src={sheet.image}
            alt={sheet.title}
            className="max-h-[720px] max-w-full rounded-lg bg-white shadow-xl"
          />
        </div>
      }
      right={
        <>
        <PreDetailsPanel
          footer={
            <ConfirmationFooter
              confirmed={sheets.filter((item) => item.included).length}
              total={sheets.length}
              noun="PDF pages included"
              primaryLabel="Confirm package and continue"
              onPrimary={() => {
                void confirmSheetSet().then(() => router.push(appRoutes.pre(projectId, "plans"))).catch((error) => setUploadError(error instanceof Error ? error.message : "Could not confirm the drawing package."));
              }}
            />
          }
        >
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected PDF page</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{sheet.sheetNo} · {sheet.title}</p>
            <p className="mt-1 text-xs text-slate-500">Page {sheet.page} of {sheets.length}</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {sheets.filter((item) => item.included).length} pages will be included in drawing review.
            </div>
          </div>
        </PreDetailsPanel>
        </>
      }
    />
  );
}

function PlansScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const viewports = usePreStore((s) => s.viewports);
  const sheets = usePreStore((s) => s.sheets);
  const selectedId = usePreStore((s) => s.selectedViewportId);
  const setSelected = usePreStore((s) => s.setSelectedViewport);
  const update = usePreStore((s) => s.updateViewport);
  const add = usePreStore((s) => s.addViewport);
  const del = usePreStore((s) => s.deleteViewport);
  const confirmStoreyStack = usePreStore((s) => s.confirmStoreyStack);
  const v = viewports.find((x) => x.id === selectedId) || viewports[0];
  const includedSheetIds = new Set(sheets.filter((sheet) => sheet.included).map((sheet) => sheet.id));
  const includedViewports = viewports.filter((viewport) => includedSheetIds.has(viewport.sheetId));
  const confirmedCount = includedViewports.filter((viewport) => viewport.status === "confirmed").length;
  const pendingViewports = includedViewports.filter((viewport) => viewport.status !== "confirmed");
  const selectedValid = Boolean(v?.name.trim()) && v.bbox[2] > v.bbox[0] && v.bbox[3] > v.bbox[1];
  function confirmAllViewports() {
    pendingViewports
      .filter((viewport) => viewport.name.trim() && viewport.bbox[2] > viewport.bbox[0] && viewport.bbox[3] > viewport.bbox[1])
      .forEach((viewport) => update(viewport.id, { status: "confirmed" }));
  }
  const [mode, setMode] = useState<"select" | "hand" | "add">("select");
  const [addOpen, setAddOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [category, setCategory] = useState<ViewportCategory>("plan");
  const [parentViewportId, setParentViewportId] = useState<string | null>(null);
  const [level, setLevel] = useState("Ground");
  const [name, setName] = useState("Ground plan");
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("New section");
  const [pendingSection, setPendingSection] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  function continueToScale() {
    if (pendingViewports.length) setShowContinuePrompt(true);
    else void confirmStoreyStack().then(() => router.push(appRoutes.pre(projectId, "scale")));
  }
  function confirmAllAndContinue() {
    confirmAllViewports();
    setShowContinuePrompt(false);
    void confirmStoreyStack().then(() => router.push(appRoutes.pre(projectId, "scale")));
  }
  function changeCategory(next: ViewportCategory) {
    setCategory(next);
    setParentViewportId(null);
    setPendingSection(false);
    const defaults: Record<ViewportCategory, string> = {
      plan: `${level} plan`,
      elevation: "New elevation",
      section: "New section",
      detail: "New detail",
      schedule: "New schedule",
    };
    setName(defaults[next]);
  }
  function selectParent(viewport: Viewport) {
    setCategory(viewport.category);
    setParentViewportId(viewport.id);
    setPendingSection(false);
    setName(`New ${viewport.category === "detail" ? "detail" : viewport.category}`);
    setLocationOpen(false);
  }
  function viewportPath(id: string | null) {
    if (!id) return viewportGroupLabels[category as keyof typeof viewportGroupLabels] || "Drawings";
    const names: string[] = [];
    const visited = new Set<string>();
    let current = viewports.find((item) => item.id === id);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.name);
      current = current.parentViewportId
        ? viewports.find((item) => item.id === current!.parentViewportId)
        : undefined;
    }
    return `${viewportGroupLabels[category as keyof typeof viewportGroupLabels] || "Drawings"} › ${names.join(" › ")}`;
  }
  function useNewSection() {
    const nextName = newSectionName.trim();
    if (!nextName) return;
    setName(nextName);
    setPendingSection(true);
    setNewSectionOpen(false);
    setLocationOpen(false);
  }
  function childViewports(
    group: (typeof viewportGroups)[number],
    parentId: string | null,
  ) {
    return viewports.filter((item) =>
      parentId
        ? item.parentViewportId === parentId
        : item.category === group && !item.parentViewportId,
    );
  }
  function renderLocationOptions(
    group: (typeof viewportGroups)[number],
    parentId: string | null,
    depth: number,
    ancestors = new Set<string>(),
  ): ReactNode {
    return childViewports(group, parentId).map((item) => {
      if (ancestors.has(item.id)) return null;
      const nextAncestors = new Set(ancestors).add(item.id);
      return (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => selectParent(item)}
            className={
              parentViewportId === item.id
                ? "flex w-full items-center gap-2 rounded-lg bg-blue-50 py-1.5 pr-2 text-left text-xs font-semibold text-blue-700"
                : "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            }
            style={{ paddingLeft: `${10 + depth * 14}px` }}
          >
            <span className="text-slate-300">↳</span>
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
          </button>
          {renderLocationOptions(group, item.id, depth + 1, nextAncestors)}
        </div>
      );
    });
  }
  function renderViewportNodes(
    group: (typeof viewportGroups)[number],
    parentId: string | null,
    depth: number,
    ancestors = new Set<string>(),
  ): ReactNode {
    return childViewports(group, parentId).map((item) => {
      if (ancestors.has(item.id)) return null;
      const nextAncestors = new Set(ancestors).add(item.id);
      return (
        <div key={item.id}>
          <button
            onClick={() => {
              setSelected(item.id);
              setMode("select");
              setDraft([]);
            }}
            className={
              selectedId === item.id
                ? "mt-1 flex w-full items-center justify-between rounded-lg bg-blue-50 py-2 pr-3 text-left font-semibold text-blue-700"
                : "mt-1 flex w-full items-center justify-between rounded-lg py-2 pr-3 text-left text-slate-600 hover:bg-slate-50"
            }
            style={{
              paddingLeft: `${12 + depth * 14}px`,
              fontSize: depth ? "12px" : "14px",
            }}
          >
            <span className="min-w-0 truncate">
              {depth ? <span className="mr-2 text-slate-300">↳</span> : null}
              {item.name}
            </span>
            <StatusDot status={item.status} />
          </button>
          {renderViewportNodes(group, item.id, depth + 1, nextAncestors)}
        </div>
      );
    });
  }
  function changeLevel(next: string) {
    setLevel(next);
    if (category === "plan") setName(`${next} plan`);
  }
  function beginAdd() {
    setDraft([]);
    setMode("add");
    setAddOpen(false);
  }
  function finishViewport(point: Point) {
    if (mode !== "add" || !draft.length) return;
    const first = draft[0];
    const bbox: [number, number, number, number] = [
      Math.min(first.x, point.x),
      Math.min(first.y, point.y),
      Math.max(first.x, point.x),
      Math.max(first.y, point.y),
    ];
    if (bbox[2] - bbox[0] < 20 || bbox[3] - bbox[1] < 20) {
      setDraft([]);
      return;
    }
    const id = crypto.randomUUID();
    add({
      id,
      name: name.trim() || "New viewport",
      category,
      sheetId: v.sheetId,
      bbox,
      status: "ready",
      parentViewportId: parentViewportId || undefined,
    });
    setSelected(id);
    setDraft([]);
    setPendingSection(false);
    setMode("select");
  }
  useEffect(() => {
    if (mode !== "add") return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMode("select");
      setDraft([]);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [mode]);
  if (!v) {
    return (
      <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <div>
          <h3 className="font-semibold text-slate-900">No drawing viewports are available</h3>
          <p className="mt-2 max-w-lg text-sm text-slate-500">
            {sheets.length
              ? "The uploaded pages do not contain any drawing viewports yet. Return to Upload and run the drawing review again."
              : "Upload and process a drawing package before opening Plans."}
          </p>
          <button
            type="button"
            onClick={() => router.push(appRoutes.pre(projectId, "upload"))}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Go to Upload
          </button>
        </div>
      </div>
    );
  }
  const toolbar = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => {
          setMode("select");
          setDraft([]);
        }}
        className={mode === "select" ? plansActiveTool : plansToolClass}
      >
        Select
      </button>
      <button
        onClick={() => {
          setMode("hand");
          setDraft([]);
        }}
        className={mode === "hand" ? plansActiveTool : plansToolClass}
      >
        Hand
      </button>
      <div className="relative">
        <button
          onClick={() => {
            setAddOpen((x) => !x);
            setLocationOpen(false);
            setNewSectionOpen(false);
          }}
          className={mode === "add" ? plansActiveTool : plansToolClass}
        >
          + Add viewport
        </button>
        {addOpen ? (
          <div className="absolute left-0 top-10 z-50 w-80 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <label className="block text-xs font-semibold text-slate-600">
              Drawing location
              <button
                type="button"
                onClick={() => setLocationOpen((current) => !current)}
                className="input mt-1 flex w-full items-center justify-between gap-3 text-left font-normal"
              >
                <span className="min-w-0 truncate">{viewportPath(parentViewportId)}</span>
                <span className="text-slate-400">⌄</span>
              </button>
            </label>
            {locationOpen ? (
              <div className="rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {viewportGroups.map((group) => (
                    <div key={group} className="mb-1">
                      <button
                        type="button"
                        onClick={() => {
                          changeCategory(group);
                          setLocationOpen(false);
                        }}
                        className={
                          category === group && !parentViewportId
                            ? "flex w-full rounded-lg bg-blue-50 px-2.5 py-2 text-left text-xs font-semibold text-blue-700"
                            : "flex w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        }
                      >
                        {viewportGroupLabels[group]}
                      </button>
                      {renderLocationOptions(group, null, 1)}
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 p-2">
                  {!newSectionOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNewSectionName("New section");
                        setNewSectionOpen(true);
                      }}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      ＋ Add new section
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Under {viewportPath(parentViewportId)}
                      </p>
                      <input
                        autoFocus
                        className="input w-full"
                        value={newSectionName}
                        onChange={(event) => setNewSectionName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") useNewSection();
                        }}
                        placeholder="Section name"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setNewSectionOpen(false)}
                          className={plansToolClass}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={useNewSection}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                        >
                          Add section
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {category === "plan" ? (
              <label className="block text-xs font-semibold text-slate-600">
                Plan level
                <select
                  className="input mt-1 w-full"
                  value={level}
                  onChange={(e) => changeLevel(e.target.value)}
                >
                  <option>Ground</option>
                  <option>First</option>
                  <option>Typical 2nd–6th</option>
                  <option>Terrace</option>
                  <option>Upper roof</option>
                </select>
              </label>
            ) : null}
            <label className="block text-xs font-semibold text-slate-600">
              {pendingSection ? "New section name" : "Name"}
              <input
                className="input mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              onClick={beginAdd}
              className="h-9 w-full rounded-lg bg-blue-600 text-xs font-semibold text-white"
            >
              {pendingSection ? "Draw new section" : "Draw viewport"}
            </button>
          </div>
        ) : null}
      </div>
      {mode === "add" ? (
        <>
          <span className="ml-2 text-xs font-medium text-blue-700">
            {draft.length ? "Release to create viewport" : "Drag over the viewport area"}
          </span>
          <button
            onClick={() => {
              setMode("select");
              setDraft([]);
            }}
            className={plansToolClass}
          >
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );
  return (
    <ThreePane
      left={
        <div className="p-3">
          <div className="mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Viewports
            </span>
          </div>
          {viewportGroups.map((g) => (
            <details key={g} open className="mb-2">
              <summary className="cursor-pointer rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold capitalize text-slate-600">
                {viewportGroupLabels[g]}
              </summary>
              <div className="mt-1 space-y-1">
                {renderViewportNodes(g, null, 0)}
              </div>
            </details>
          ))}
        </div>
      }
      center={
        <DemoDrawing
          viewportId={v.id}
          tool={mode === "hand" ? "pan" : mode === "add" ? "draw" : "select"}
          onCanvasDragStart={(point) => mode === "add" && setDraft([point, point])}
          onCanvasDragMove={(point) => mode === "add" && setDraft((current) => current.length ? [current[0], point] : current)}
          onCanvasDragEnd={finishViewport}
          toolbar={toolbar}
        >
          {mode === "select" ? (
            <ViewportEditorOverlay viewportId={v.id} />
          ) : null}
          {mode === "add" && draft.length > 1 ? (
            <g pointerEvents="none">
              <rect
                x={Math.min(draft[0].x, draft[1].x)}
                y={Math.min(draft[0].y, draft[1].y)}
                width={Math.abs(draft[1].x - draft[0].x)}
                height={Math.abs(draft[1].y - draft[0].y)}
                fill="#2563eb"
                fillOpacity={0.14}
                stroke="#2563eb"
                strokeWidth={3}
                strokeDasharray="10 6"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}
        </DemoDrawing>
      }
      right={
        <>
        <PreDetailsPanel
          footer={
            <ConfirmationFooter
              confirmed={confirmedCount}
              total={includedViewports.length}
              noun="drawings confirmed"
              status={v.status}
              primaryLabel={v.status === "confirmed" ? "Selected drawing confirmed" : "Confirm selected drawing"}
              primaryDisabled={!selectedValid || v.status === "confirmed"}
              onPrimary={() => update(v.id, { status: "confirmed" })}
              secondaryLabel={pendingViewports.length ? "Confirm all drawings" : undefined}
              secondaryDisabled={pendingViewports.some((viewport) => !viewport.name.trim() || viewport.bbox[2] <= viewport.bbox[0] || viewport.bbox[3] <= viewport.bbox[1])}
              onSecondary={confirmAllViewports}
              nextLabel="Next: Scale"
              onNext={continueToScale}
            />
          }
        >
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Selected viewport
            </p>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Name
              <input
                className="input mt-1 w-full"
                value={v.name}
                onChange={(e) => update(v.id, { name: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Type
              <select
                className="input mt-1 w-full"
                value={v.category}
                onChange={(e) =>
                  update(v.id, {
                    category: e.target.value as Viewport["category"],
                  })
                }
              >
                <option value="plan">Plan</option>
                <option value="elevation">Elevation</option>
                <option value="section">Section</option>
                <option value="detail">Structural drawing</option>
              </select>
            </label>
            <div className="mt-3">
              <button
                onClick={() => del(v.id)}
                className="h-10 w-full rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Delete viewport
              </button>
            </div>
            {!selectedValid ? <p className="mt-3 text-xs font-medium text-red-600">Add a drawing name and valid crop before confirming.</p> : null}
            {pendingViewports.length ? (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Drawings requiring confirmation</p>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{pendingViewports.length}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {pendingViewports.map((viewport) => (
                    <button
                      key={viewport.id}
                      type="button"
                      onClick={() => {
                        setSelected(viewport.id);
                        setMode("select");
                        setDraft([]);
                      }}
                      className={viewport.id === v.id ? "flex w-full items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left" : "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50"}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800">{viewport.name || "Unnamed drawing"}</span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">{viewport.status === "needs_review" ? "Needs review" : "Not confirmed"}</span>
                      </span>
                      <span className="text-xs text-slate-400">›</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">All included drawings are confirmed.</div>
            )}
          </div>
        </PreDetailsPanel>
        {showContinuePrompt ? (
          <PreContinueDialog
            pending={pendingViewports.map((viewport) => ({ id: viewport.id, name: viewport.name || "Unnamed drawing", invalid: !viewport.name.trim() || viewport.bbox[2] <= viewport.bbox[0] || viewport.bbox[3] <= viewport.bbox[1] }))}
            itemNoun="drawings"
            nextStep="Scale"
            onReview={() => setShowContinuePrompt(false)}
            onContinue={() => {
              setShowContinuePrompt(false);
              router.push(appRoutes.pre(projectId, "scale"));
            }}
            onConfirmAll={confirmAllAndContinue}
          />
        ) : null}
        </>
      }
    />
  );
}

function ScaleScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const suggestMissingScales = usePreStore((s) => s.suggestMissingScales);
  useEffect(() => { void suggestMissingScales(); }, [suggestMissingScales]);
  useEffect(() => {
    const show = () => showEvidence("printed");
    window.addEventListener("quanto:show-scale-evidence", show);
    return () => window.removeEventListener("quanto:show-scale-evidence", show);
  }, []);
  const allViewports = usePreStore((s) => s.viewports);
  const sheets = usePreStore((s) => s.sheets);
  const includedSheetIds = useMemo(() => new Set(sheets.filter((sheet) => sheet.included).map((sheet) => sheet.id)), [sheets]);
  const viewports = useMemo(
    () => allViewports
      .filter((v) => includedSheetIds.has(v.sheetId) && Boolean(v.calibration) && viewportRequiresScale(v))
      .sort((a, b) => {
        const kindRank = (viewport: typeof a) => {
          const kind = viewport.server?.view_kind || viewport.category;
          return kind === "plan" ? 0 : kind === "elevation" ? 1 : 2;
        };
        const planRank = (name: string) => {
          const value = name.toLowerCase();
          if (/basement|lower ground/.test(value)) return 0;
          if (/ground/.test(value)) return 10;
          if (/first|1st/.test(value)) return 20;
          if (/second|2nd/.test(value)) return 30;
          if (/third|3rd/.test(value)) return 40;
          if (/typical/.test(value)) return 50;
          if (/terrace/.test(value)) return 80;
          if (/roof/.test(value)) return 90;
          return 60;
        };
        return kindRank(a) - kindRank(b) || planRank(a.name) - planRank(b.name) || a.name.localeCompare(b.name);
      }),
    [allViewports, includedSheetIds],
  );
  const selectedId = usePreStore((s) => s.selectedViewportId);
  const setSelected = usePreStore((s) => s.setSelectedViewport);
  const update = usePreStore((s) => s.updateViewport);
  const v = viewports.find((x) => x.id === selectedId) || viewports[0];
  const sheet = sheets.find((item) => item.id === v?.sheetId);
  const drawing = drawingSize(sheet);
  const [scaleLine, setScaleLine] = useState<[number, number, number, number]>([
    470, 420, 1010, 420,
  ]);
  const [xLine, setXLine] = useState<[number, number, number, number]>([
    470, 420, 1010, 420,
  ]);
  const [yLine, setYLine] = useState<[number, number, number, number]>([
    470, 420, 470, 960,
  ]);
  const [mode, setMode] = useState<
    "select" | "hand" | "add" | "measure" | "calibrate-x" | "calibrate-y"
  >("select");
  const [draft, setDraft] = useState<Point[]>([]);
  const [manualLineAxis, setManualLineAxis] = useState<"x" | "y" | null>(null);
  const [xCheck, setXCheck] = useState("0.00");
  const [yCheck, setYCheck] = useState("0.00");
  const [xUnit, setXUnit] = useState<ScaleDistanceUnit>("m");
  const [yUnit, setYUnit] = useState<ScaleDistanceUnit>("m");
  const [activeAxis, setActiveAxis] = useState<"x" | "y" | null>(null);
  const [evidencePopup, setEvidencePopup] = useState<ScaleEvidenceKind | null>(
    null,
  );
  const [focusedEvidence, setFocusedEvidence] =
    useState<ScaleEvidenceKind | null>(null);
  const [evidenceRequest, setEvidenceRequest] = useState(0);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const measurement = useMeasurementTool({
    viewportId: v?.id || "",
    scale: v?.scaleMPerPx || 0.018,
    active: mode === "measure",
    deleteEnabled: mode === "select" || mode === "measure",
  });
  useEffect(() => {
    if (!v?.calibration) return;
    setScaleLine(v.calibration.x.line);
    setXLine(v.calibration.x.line);
    setYLine(v.calibration.y.line);
    const nextXUnit = v.calibration.x.unit || "m",
      nextYUnit = v.calibration.y.unit || "m";
    setXUnit(nextXUnit);
    setYUnit(nextYUnit);
    setXCheck(
      v.calibration.x.knownDistanceM > 0
        ? v.calibration.x.value || metresToDistance(v.calibration.x.knownDistanceM, nextXUnit)
        : "",
    );
    setYCheck(
      v.calibration.y.knownDistanceM > 0
        ? v.calibration.y.value || metresToDistance(v.calibration.y.knownDistanceM, nextYUnit)
        : "",
    );
    measurement.clearDraft();
  }, [v?.id]);
  if (!v)
    return (
      <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <div className="max-w-md text-center">
          <h3 className="text-lg font-semibold text-slate-900">
            No viewports need scale confirmation
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Create or restore a plan or section viewport in Plans, then return
            to Scale.
          </p>
        </div>
      </div>
    );
  const calibration = v.calibration;
  const printedEvidenceKind = calibration?.printedEvidenceKind || "printed";
  const hasPrintedEvidence = printedEvidenceKind === "printed" && Boolean(calibration?.printedEvidenceBox);
  const notToScale = calibration?.notToScale === true;
  const printedScaleOnly = calibration?.printedScaleOnly === true;
  const scale = v.scaleMPerPx || 0;
  const scaleLength =
    Math.hypot(scaleLine[2] - scaleLine[0], scaleLine[3] - scaleLine[1]) *
    scale;
  const measuredLength = measurement.selectedLengthM;
  const xMetres = distanceToMetres(xCheck, xUnit),
    yMetres = distanceToMetres(yCheck, yUnit);
  const hasXEvidence = xMetres > 0;
  const hasYEvidence = yMetres > 0;
  const xPixels = Math.max(
    1,
    Math.hypot(xLine[2] - xLine[0], xLine[3] - xLine[1]),
  );
  const yPixels = Math.max(
    1,
    Math.hypot(yLine[2] - yLine[0], yLine[3] - yLine[1]),
  );
  const calculatedMpp = hasXEvidence && hasYEvidence
    ? (xMetres / xPixels + yMetres / yPixels) / 2
    : 0;
  const hasPrintedScale = printedEvidenceKind === "printed" && scale > 0;
  const calculatedScale = hasPrintedScale
    ? scale * SCALE_PX_PER_METRE
    : calculatedMpp > 0
      ? calculatedMpp * SCALE_PX_PER_METRE
      : scale > 0
        ? scale * SCALE_PX_PER_METRE
        : 0;
  const scaleBasis = hasPrintedScale
    ? hasXEvidence && hasYEvidence ? "detected printed scale, verified by X/Y" : "detected printed scale"
    : calculatedMpp > 0 ? "validated X/Y dimensions" : scale > 0 ? "saved scale evidence" : null;
  const pendingScales = viewports.filter((viewport) => viewport.status !== "confirmed");
  function continueAfterScale() {
    if (pendingScales.length) setShowContinuePrompt(true);
    else router.push(appRoutes.pre(projectId, "height"));
  }
  function confirmAllScalesAndContinue() {
    pendingScales.forEach((viewport) => update(viewport.id, { status: "confirmed" }));
    setShowContinuePrompt(false);
    router.push(appRoutes.pre(projectId, "height"));
  }
  const drawingMode =
    mode === "add" ||
    mode === "measure" ||
    mode === "calibrate-x" ||
    mode === "calibrate-y";
  const focusBox =
    focusedEvidence === "printed" && hasPrintedEvidence
      ? calibration?.printedEvidenceBox
      : focusedEvidence === "x"
        ? lineEvidenceBox(xLine)
        : focusedEvidence === "y"
          ? lineEvidenceBox(yLine)
          : undefined;
  const focusLabel =
    focusedEvidence === "printed"
      ? `Printed scale · ${calibration?.printedScaleLabel || "Not available"}`
      : focusedEvidence === "x"
        ? `X calibration · ${knownDistanceLabel(xCheck, xUnit)}`
        : focusedEvidence === "y"
          ? `Y calibration · ${knownDistanceLabel(yCheck, yUnit)}`
          : "";
  const focusColor =
    focusedEvidence === "printed"
      ? "#f59e0b"
      : focusedEvidence === "x"
        ? "#7c3aed"
        : "#0891b2";
  function saveCalibration(next: {
    xLine?: [number, number, number, number];
    yLine?: [number, number, number, number];
    xValue?: string;
    yValue?: string;
    xUnit?: ScaleDistanceUnit;
    yUnit?: ScaleDistanceUnit;
    manualAxis?: "x" | "y";
  }) {
    if (!calibration) return;
    const nextXLine = next.xLine || xLine,
      nextYLine = next.yLine || yLine;
    const nextXValue = next.xValue ?? xCheck,
      nextYValue = next.yValue ?? yCheck;
    const nextXUnit = next.xUnit || xUnit,
      nextYUnit = next.yUnit || yUnit;
    const xm = distanceToMetres(nextXValue, nextXUnit),
      ym = distanceToMetres(nextYValue, nextYUnit);
    const xp = Math.max(
      1,
      Math.hypot(nextXLine[2] - nextXLine[0], nextXLine[3] - nextXLine[1]),
    );
    const yp = Math.max(
      1,
      Math.hypot(nextYLine[2] - nextYLine[0], nextYLine[3] - nextYLine[1]),
    );
    const nextCalibration = {
      ...calibration,
      ...(next.manualAxis ? { manualAxis: next.manualAxis } : {}),
      x: {
        ...calibration.x,
        line: nextXLine,
        knownDistanceM: xm,
        value: nextXValue,
        unit: nextXUnit,
      },
      y: {
        ...calibration.y,
        line: nextYLine,
        knownDistanceM: ym,
        value: nextYValue,
        unit: nextYUnit,
      },
    };
    const nextMpp = xm > 0 && ym > 0 ? (xm / xp + ym / yp) / 2 : xm > 0 ? xm / xp : ym > 0 ? ym / yp : 0;
    update(v.id, {
      calibration: nextCalibration,
      ...(nextMpp > 0 ? { scaleMPerPx: nextMpp } : {}),
      status: "ready",
    });
  }
  function startCalibrationDrag(point: Point) {
    if (mode !== "calibrate-x" && mode !== "calibrate-y") return;
    setDraft([point, point]);
  }
  function moveCalibrationDrag(point: Point) {
    if ((mode !== "calibrate-x" && mode !== "calibrate-y") || !draft.length) return;
    const first = draft[0];
    setDraft([first, mode === "calibrate-x" ? { x: point.x, y: first.y } : { x: first.x, y: point.y }]);
  }
  function finishCalibrationDrag(point: Point) {
    if ((mode !== "calibrate-x" && mode !== "calibrate-y") || !draft.length) return;
    const first = draft[0];
    const axis = mode === "calibrate-x" ? "x" : "y";
    const end = axis === "x" ? { x: point.x, y: first.y } : { x: first.x, y: point.y };
    if (Math.hypot(end.x-first.x,end.y-first.y) < 10) { setDraft([]); return; }
    const line: [number,number,number,number] = [first.x,first.y,end.x,end.y];
    if(axis === "x") setXLine(line); else setYLine(line);
    saveCalibration(axis === "x" ? {xLine:line,manualAxis:"x"} : {yLine:line,manualAxis:"y"});
    setManualLineAxis(axis);
    setActiveAxis(axis);
    setDraft([]);
    setMode("select");
  }
  function clickScale(point: Point) {
    if (notToScale || printedScaleOnly) return;
    if (!drawingMode) return;
    if (mode === "measure") {
      measurement.canvasClick(point);
      return;
    }
    if (!draft.length) {
      setDraft([point]);
      return;
    }
    const first = draft[0];
    if (mode === "add") setScaleLine([first.x, first.y, point.x, point.y]);
    if (mode === "calibrate-x") {
      const line: [number, number, number, number] = [
        first.x,
        first.y,
        point.x,
        first.y,
      ];
      setXLine(line);
      saveCalibration({ xLine: line });
    }
    if (mode === "calibrate-y") {
      const line: [number, number, number, number] = [
        first.x,
        first.y,
        first.x,
        point.y,
      ];
      setYLine(line);
      saveCalibration({ yLine: line });
    }
    setDraft([]);
    setMode("select");
    update(v.id, { status: "ready" });
  }
  function startMode(next: typeof mode) {
    setMode(next);
    setDraft([]);
    if(next === "calibrate-x" || next === "calibrate-y") setManualLineAxis(null);
    if (next !== "measure") measurement.clearDraft();
    setFocusedEvidence(null);
    setEvidencePopup(null);
  }
  function showEvidence(kind: ScaleEvidenceKind) {
    if (kind === "printed" && !hasPrintedEvidence) {
      setEvidencePopup("printed");
      setFocusedEvidence(null);
      return;
    }
    setMode("select");
    setDraft([]);
    setActiveAxis(kind === "x" ? "x" : kind === "y" ? "y" : null);
    setFocusedEvidence(kind);
    setEvidencePopup(null);
    setEvidenceRequest((x) => x + 1);
  }
  const instruction =
    mode === "add"
      ? "scale reference"
      : mode === "measure"
        ? "measurement"
        : mode === "calibrate-x"
          ? "X calibration"
          : mode === "calibrate-y"
            ? "Y calibration"
            : "";
  const toolbar = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => startMode("select")}
        className={mode === "select" ? plansActiveTool : plansToolClass}
      >
        Select
      </button>
      <button
        onClick={() => startMode("hand")}
        className={mode === "hand" ? plansActiveTool : plansToolClass}
      >
        Hand
      </button>
      {drawingMode ? (
        <>
          <span className="ml-2 text-xs font-medium text-blue-700">
            {mode === "calibrate-x"
              ? "Drag horizontally across a known dimension, then release"
              : mode === "calibrate-y"
                ? "Drag vertically across a known dimension, then release"
                : (mode === "measure" ? measurement.start : draft.length)
                  ? `Click the end of the ${instruction}`
                  : `Click the start of the ${instruction}`}
          </span>
          <button
            onClick={() => startMode("select")}
            className={plansToolClass}
          >
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );
  return (
    <ThreePane
      left={
        <SimpleList title="Viewports">
          {viewports.map((x) => (
            <ListButton
              key={x.id}
              active={x.id === v.id}
              onClick={() => {
                setSelected(x.id);
                startMode("select");
                setActiveAxis(null);
              }}
              label={x.name}
              status={x.status}
            />
          ))}
        </SimpleList>
      }
      center={
        <DemoDrawing
          viewportId={v.id}
          tool={mode === "hand" ? "pan" : drawingMode ? "draw" : "select"}
          onCanvasClick={clickScale}
          onCanvasDragStart={startCalibrationDrag}
          onCanvasDragMove={moveCalibrationDrag}
          onCanvasDragEnd={finishCalibrationDrag}
          onCanvasMove={(point) => {
            if (mode === "measure") measurement.canvasMove(point);
          }}
          toolbar={toolbar}
          showFocus={false}
          focusBox={focusBox}
          focusRequest={evidenceRequest}
        >
          {focusedEvidence && focusBox ? (
            <EvidenceHighlight
              box={focusBox}
              label={focusLabel}
              color={focusColor}
              width={drawing.width}
              height={drawing.height}
            />
          ) : null}
          {!notToScale && !printedScaleOnly && activeAxis === null && (hasXEvidence || hasYEvidence) ? (
            <>
              {hasXEvidence ? <CalibrationLine line={xLine} setLine={(line) => { setXLine(line); saveCalibration({ xLine: line }); }} label={knownDistanceLabel(xCheck, xUnit)} axis="x" color="#7c3aed" /> : null}
              {hasYEvidence ? <CalibrationLine line={yLine} setLine={(line) => { setYLine(line); saveCalibration({ yLine: line }); }} label={knownDistanceLabel(yCheck, yUnit)} axis="y" color="#0891b2" /> : null}
            </>
          ) : null}
          {!notToScale && !printedScaleOnly && activeAxis === "x" && (hasXEvidence || manualLineAxis === "x") ? (
            <CalibrationLine
              line={xLine}
              setLine={(line) => {
                setXLine(line);
                saveCalibration({ xLine: line });
              }}
              label={knownDistanceLabel(xCheck, xUnit)}
              axis="x"
              color="#7c3aed"
            />
          ) : null}
          {!notToScale && !printedScaleOnly && activeAxis === "y" && (hasYEvidence || manualLineAxis === "y") ? (
            <CalibrationLine
              line={yLine}
              setLine={(line) => {
                setYLine(line);
                saveCalibration({ yLine: line });
              }}
              label={knownDistanceLabel(yCheck, yUnit)}
              axis="y"
              color="#0891b2"
            />
          ) : null}
          <MeasurementOverlay
            measurements={measurement.measurements}
            selectedId={measurement.selectedId}
            scale={scale || 0.018}
            editable={mode === "select" || mode === "measure"}
            previewStart={measurement.start}
            previewEnd={measurement.previewEnd}
            color="#059669"
          />
          {drawingMode && mode !== "measure" && draft.length ? (
            draft.length > 1 && (mode === "calibrate-x" || mode === "calibrate-y") ? (
              <g pointerEvents="none">
                <line x1={draft[0].x} y1={draft[0].y} x2={draft[1].x} y2={draft[1].y} stroke={mode === "calibrate-x" ? "#7c3aed" : "#0891b2"} strokeWidth={5} vectorEffect="non-scaling-stroke" />
                <circle cx={draft[0].x} cy={draft[0].y} r={7} fill="white" stroke={mode === "calibrate-x" ? "#7c3aed" : "#0891b2"} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <circle cx={draft[1].x} cy={draft[1].y} r={7} fill="white" stroke={mode === "calibrate-x" ? "#7c3aed" : "#0891b2"} strokeWidth={3} vectorEffect="non-scaling-stroke" />
              </g>
            ) : <circle cx={draft[0].x} cy={draft[0].y} r={9} fill="#2563eb" stroke="white" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          ) : null}
        </DemoDrawing>
      }
      right={
        <>
        <PreDetailsPanel
          footer={
            <ConfirmationFooter
              confirmed={viewports.filter((viewport) => viewport.status === "confirmed").length}
              total={viewports.length}
              noun="drawing scales confirmed"
              status={v.status}
              primaryLabel={v.status === "confirmed" ? "Selected scale confirmed" : "Confirm selected scale"}
              primaryDisabled={v.status === "confirmed"}
              onPrimary={() => update(v.id, { status: "confirmed" })}
              secondaryLabel={pendingScales.length ? "Confirm all scales" : undefined}
              onSecondary={() => pendingScales.forEach((viewport) => update(viewport.id, { status: "confirmed" }))}
              nextLabel="Next: Height"
              onNext={continueAfterScale}
            />
          }
        >
            <div className="relative">
              {evidencePopup ? (
                <EvidencePopover
                  kind={evidencePopup}
                  sheet={v.name}
                  value={
                    evidencePopup === "printed"
                      ? `Scale — ${calibration?.printedScaleLabel}`
                      : evidencePopup === "x"
                        ? `X calibration — ${knownDistanceLabel(xCheck, xUnit)}`
                        : `Y calibration — ${knownDistanceLabel(yCheck, yUnit)}`
                  }
                  onClose={() => setEvidencePopup(null)}
                  onShow={() => showEvidence(evidencePopup)}
                  source={
                    evidencePopup === "printed"
                      ? calibration?.printedEvidenceSource
                      : undefined
                  }
                  location={
                    evidencePopup === "printed"
                      ? calibration?.printedEvidenceLocation
                      : undefined
                  }
                  evidenceKind={evidencePopup === "printed" ? printedEvidenceKind : "printed"}
                  inheritedFrom={calibration?.printedScaleInheritedFrom}
                />
              ) : null}
              <div className="space-y-3 border-b border-slate-200 p-4">
                <div
                  className={
                    focusedEvidence === "printed"
                      ? "w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-3"
                      : "w-full rounded-xl bg-slate-50 px-3 py-3"
                  }
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-slate-400">
                      {printedEvidenceKind === "printed" ? "From printed drawing caption" : printedEvidenceKind === "inherited" ? "No scale printed on this view" : "No printed scale found"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEvidencePopup("printed")}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Evidence
                    </button>
                  </div>
                  <span className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-500">Printed scale</span>
                    <strong className="text-blue-700">
                      {calibration?.printedScale}
                    </strong>
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {calibration?.printedScaleLabel}
                  </span>
                </div>
                {!notToScale && !printedScaleOnly && calculatedScale > 0 ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
                    <span className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">
                        Usable drawing scale
                      </span>
                      <strong className="text-blue-700">
                        1 : {calculatedScale.toFixed(1)}
                      </strong>
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      From {scaleBasis}.
                    </span>
                  </div>
                ) : null}
                {!notToScale && !printedScaleOnly && calculatedScale <= 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    No reliable scale was detected. Calibrate one known dimension before confirming.
                  </div>
                ) : null}
                {!notToScale && !printedScaleOnly ? (
                  <>
                    <AxisCheck
                      axis="x"
                      value={xCheck}
                      active={activeAxis === "x"}
                      onSelect={() => {
                        setActiveAxis((current) => current === "x" ? null : "x");
                        setMode("select");
                        setFocusedEvidence(null);
                      }}
                      unit={xUnit}
                      onChange={(value) => {
                        setXCheck(value);
                        saveCalibration({ xValue: value });
                      }}
                      onUnitChange={(unit) => {
                        const value = metresToDistance(xMetres, unit);
                        setXUnit(unit);
                        setXCheck(value);
                        saveCalibration({ xUnit: unit, xValue: value });
                      }}
                      onCalibrate={() => startMode("calibrate-x")}
                      onEvidence={() => setEvidencePopup("x")}
                    />
                    <AxisCheck
                      axis="y"
                      value={yCheck}
                      active={activeAxis === "y"}
                      onSelect={() => {
                        setActiveAxis((current) => current === "y" ? null : "y");
                        setMode("select");
                        setFocusedEvidence(null);
                      }}
                      unit={yUnit}
                      onChange={(value) => {
                        setYCheck(value);
                        saveCalibration({ yValue: value });
                      }}
                      onUnitChange={(unit) => {
                        const value = metresToDistance(yMetres, unit);
                        setYUnit(unit);
                        setYCheck(value);
                        saveCalibration({ yUnit: unit, yValue: value });
                      }}
                      onCalibrate={() => startMode("calibrate-y")}
                      onEvidence={() => setEvidencePopup("y")}
                    />
                  </>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {notToScale ? (
                      <>
                        This drawing is explicitly marked{" "}
                        <strong>NOT TO SCALE</strong>. Measurement and
                        calibration are disabled.
                      </>
                    ) : (
                      <>
                        The printed scale is available, but this detail has no
                        reliable pair of orthogonal dimension strings for
                        calibration.
                      </>
                    )}
                  </div>
                )}
                <PendingItemsList
                  title="Scales requiring confirmation"
                  items={pendingScales.map((viewport) => ({ id: viewport.id, name: viewport.name, status: viewport.status }))}
                  selectedId={v.id}
                  onSelect={(id) => {
                    setSelected(id);
                    startMode("select");
                    setActiveAxis(null);
                  }}
                  emptyMessage="All required drawing scales are confirmed."
                />
              </div>
            </div>
        </PreDetailsPanel>
        {showContinuePrompt ? (
          <PreContinueDialog
            pending={pendingScales.map((viewport) => ({ id: viewport.id, name: viewport.name }))}
            itemNoun="drawing scales"
            nextStep="Height"
            onReview={() => setShowContinuePrompt(false)}
            onContinue={() => { setShowContinuePrompt(false); router.push(appRoutes.pre(projectId, "height")); }}
            onConfirmAll={confirmAllScalesAndContinue}
          />
        ) : null}
        </>
      }
    />
  );
}

function AxisCheck({
  axis,
  value,
  source,
  location,
  active,
  unit,
  onSelect,
  onChange,
  onUnitChange,
  onCalibrate,
  onEvidence,
}: {
  axis: "x" | "y";
  value: string;
  source?: string;
  location?: string;
  active: boolean;
  unit: ScaleDistanceUnit;
  onSelect: () => void;
  onChange: (value: string) => void;
  onUnitChange: (unit: ScaleDistanceUnit) => void;
  onCalibrate: () => void;
  onEvidence: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={
        active
          ? "rounded-xl border border-blue-300 bg-blue-50 p-3"
          : "rounded-xl border border-transparent bg-slate-50 p-3 hover:border-blue-200"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-slate-400">
          From {axis.toUpperCase()} calibration line
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEvidence();
          }}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
        >
          Evidence
        </button>
      </div>
      <div className="space-y-2">
        <span className="text-sm text-slate-500">
          {axis.toUpperCase()} check
        </span>
        <div
          className="grid grid-cols-[minmax(0,1fr)_104px] gap-2 text-sm font-semibold text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            aria-label={`${axis.toUpperCase()} known drawing distance`}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-right font-semibold outline-none focus:border-blue-400"
          />
          <select
            aria-label={`${axis.toUpperCase()} distance unit`}
            value={unit}
            onChange={(e) => onUnitChange(e.target.value as ScaleDistanceUnit)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400"
          >
            <option value="m">metres</option>
            <option value="cm">cm</option>
            <option value="mm">mm</option>
            <option value="ft-in">feet &amp; inches</option>
          </select>
        </div>
      </div>
      {active ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCalibrate();
          }}
          className="mt-3 h-9 w-full rounded-lg border border-blue-200 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          Calibrate {axis.toUpperCase()}
        </button>
      ) : null}
    </div>
  );
}

function EvidencePopover({
  kind,
  sheet,
  value,
  source,
  location,
  evidenceKind,
  inheritedFrom,
  onClose,
  onShow,
}: {
  kind: ScaleEvidenceKind;
  sheet: string;
  value: string;
  source?: string;
  location?: string;
  evidenceKind?: "printed" | "inherited" | "missing";
  inheritedFrom?: string;
  onClose: () => void;
  onShow: () => void;
}) {
  const unavailablePrintedEvidence =
    kind === "printed" && evidenceKind !== undefined && evidenceKind !== "printed";
  const defaultSource =
    kind === "printed"
      ? "Drawing title block"
      : kind === "x"
        ? "Horizontal calibration reference"
        : "Vertical calibration reference";
  const defaultLocation =
    kind === "printed"
      ? "Bottom-right title block"
      : kind === "x"
        ? "Selected X-check line"
        : "Selected Y-check line";
  return (
    <div
      role="dialog"
      aria-label={`${kind} evidence`}
      className="absolute left-3 right-3 top-3 z-50 rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
            Source evidence
          </p>
          <h4 className="mt-1 text-sm font-semibold text-slate-950">{value}</h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close evidence"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
        >
          ×
        </button>
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        {unavailablePrintedEvidence ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            {evidenceKind === "inherited"
              ? `No scale is printed on this drawing. The scale from ${inheritedFrom || "the main drawing"} is being used.`
              : "No printed scale was found on this drawing. Confirm the scale using the X and Y calibration distances below."}
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Sheet</dt>
          <dd className="text-right font-medium text-slate-700">{sheet}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Source</dt>
          <dd className="text-right font-medium text-slate-700">
            {source || defaultSource}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Location</dt>
          <dd className="text-right font-medium text-slate-700">
            {location || defaultLocation}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onShow}
        disabled={unavailablePrintedEvidence}
        className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        {unavailablePrintedEvidence ? "No printed evidence to show" : "Show on drawing"}
      </button>
    </div>
  );
}

function lineEvidenceBox(
  line: [number, number, number, number],
): [number, number, number, number] {
  const padding = 90;
  return [
    Math.max(0, Math.min(line[0], line[2]) - padding),
    Math.max(0, Math.min(line[1], line[3]) - padding),
    Math.max(line[0], line[2]) + padding,
    Math.max(line[1], line[3]) + padding,
  ];
}

function HeightScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const suggestHeightsIfNeeded = usePreStore((s) => s.suggestHeightsIfNeeded);
  useEffect(() => { void suggestHeightsIfNeeded(); }, [suggestHeightsIfNeeded]);
  const heights = usePreStore((s) => s.heights);
  const updateHeight = usePreStore((s) => s.updateHeight);
  const [selected, setSelected] = useState("H-GF-FF");
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const h = heights.find((x) => x.id === selected) || heights[0];
  if (!h) {
    return (
      <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <div className="max-w-md text-center"><h3 className="text-lg font-semibold text-slate-900">Preparing storey heights</h3><p className="mt-2 text-sm text-slate-500">Confirm the Plans and Scale stages first. Quanto will use a confirmed section or elevation to propose the floor-to-floor bands.</p></div>
      </div>
    );
  }
  function setTop(top: number) {
    updateHeight(h.id, { yTop: top, status: "ready" });
  }
  function setBottom(bottom: number) {
    updateHeight(h.id, { yBottom: bottom, status: "ready" });
  }
  const pendingHeights = heights.filter((item) => item.status !== "confirmed");
  function continueAfterHeight() {
    if (pendingHeights.length) setShowContinuePrompt(true);
    else router.push(appRoutes.pre(projectId, "specifications"));
  }
  function confirmAllHeightsAndContinue() {
    pendingHeights.forEach((item) => updateHeight(item.id, { status: "confirmed" }));
    setShowContinuePrompt(false);
    router.push(appRoutes.pre(projectId, "specifications"));
  }
  return (
    <ThreePane
      left={
        <SimpleList title="Floor-to-floor levels">
          {heights.map((x) => (
            <ListButton
              key={x.id}
              active={selected === x.id}
              onClick={() => setSelected(x.id)}
              label={x.name}
              status={x.status}
            />
          ))}
        </SimpleList>
      }
      center={
        <DemoDrawing viewportId={h.viewportId}>
          {h.detected ? <HeightLines
            h={h}
            onTop={setTop}
            onBottom={setBottom}
            label={h.heightM ? `${h.heightM.toFixed(2)} m` : "Height not detected"}
          /> : null}
        </DemoDrawing>
      }
      right={
        <>
        <PreDetailsPanel
          footer={
            <ConfirmationFooter
              confirmed={heights.filter((item) => item.status === "confirmed").length}
              total={heights.length}
              noun="heights confirmed"
              status={h.status}
              primaryLabel={h.status === "confirmed" ? "Selected height confirmed" : "Confirm selected height"}
              primaryDisabled={h.status === "confirmed"}
              onPrimary={() => updateHeight(h.id, { status: "confirmed" })}
              secondaryLabel={heights.some((item) => item.status !== "confirmed") ? "Confirm all heights" : undefined}
              onSecondary={() => heights.filter((item) => item.status !== "confirmed").forEach((item) => updateHeight(item.id, { status: "confirmed" }))}
              nextLabel="Next: Specifications"
              onNext={continueAfterHeight}
            />
          }
        >
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {h.name}
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {h.heightM ? `${h.heightM.toFixed(2)} m` : "Not detected"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {h.basis === "printed_dimension" ? "Read directly from the printed floor-to-floor dimension."
                : h.basis === "printed_and_measured" ? "Printed dimension verified against the confirmed drawing scale."
                : h.basis === "measured" ? "Measured from floor lines using the confirmed drawing scale."
                : "No reliable printed height or scaled measurement was found. Enter the actual height below."}
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Actual floor-to-floor height (metres)
              <input
                className="input mt-2 w-full"
                type="number"
                min="0.1"
                step="0.001"
                value={h.heightM ?? ""}
                placeholder="For example, 3.350"
                onChange={(event) => updateHeight(h.id, { heightM:event.target.value ? Number(event.target.value) : undefined, basis:"user_entered", detected:false, status:"ready" })}
              />
            </label>
            <PendingItemsList
              title="Heights requiring confirmation"
              items={pendingHeights.map((item) => ({ id: item.id, name: item.name, status: item.status }))}
              selectedId={h.id}
              onSelect={setSelected}
              emptyMessage="All floor-to-floor heights are confirmed."
            />
          </div>
        </PreDetailsPanel>
        {showContinuePrompt ? (
          <PreContinueDialog
            pending={pendingHeights.map((item) => ({ id: item.id, name: item.name }))}
            itemNoun="heights"
            nextStep="Specifications"
            onReview={() => setShowContinuePrompt(false)}
            onContinue={() => { setShowContinuePrompt(false); router.push(appRoutes.pre(projectId, "specifications")); }}
            onConfirmAll={confirmAllHeightsAndContinue}
          />
        ) : null}
        </>
      }
    />
  );
}

function SpecificationsScreen({ projectId }: { projectId: string }) {
  const extractSpecificationsIfNeeded = usePreStore((s) => s.extractSpecificationsIfNeeded);
  useEffect(() => { void extractSpecificationsIfNeeded(); }, [extractSpecificationsIfNeeded]);
  const specs = usePreStore((s) => s.specifications);
  const update = usePreStore((s) => s.updateSpecification);
  const addSpecification = usePreStore((s) => s.addSpecification);
  const viewports = usePreStore((s) => s.viewports);
  const sheets = usePreStore((s) => s.sheets);
  const addViewport = usePreStore((s) => s.addViewport);
  const [selected, setSelected] = useState(specs[0]?.id || "");
  const [mode, setMode] = useState<"select" | "hand" | "add">("select");
  const [addOpen, setAddOpen] = useState(false);
  const [sourceType, setSourceType] = useState("schedule");
  const [sourceName, setSourceName] = useState("New schedule");
  const [sourceSheetId, setSourceSheetId] = useState("");
  const [draft, setDraft] = useState<Point[]>([]);
  const [specTab, setSpecTab] = useState<"pdf" | "ocr">("pdf");
  const [reextracting, setReextracting] = useState(false);
  useEffect(() => {
    if (!selected && specs[0]) setSelected(specs[0].id);
  }, [selected, specs]);
  useEffect(() => {
    if (!sourceSheetId) setSourceSheetId(sheets.find((sheet) => sheet.included)?.id || sheets[0]?.id || "");
  }, [sourceSheetId, sheets]);
  const item = specs.find((x) => x.id === selected) || specs[0];
  if (!item) {
    return (
      <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <div className="max-w-md text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/><h3 className="mt-4 text-lg font-semibold text-slate-900">Extracting specifications</h3><p className="mt-2 text-sm text-slate-500">Reading schedules, finish information and drawing notes from the included source pages.</p></div>
      </div>
    );
  }
  const itemViewport = viewports.find((v) => v.id === item.viewportId);
  const drawingViewport =
    mode === "add"
      ? viewports.find((v) => v.sheetId === sourceSheetId) || itemViewport
      : itemViewport;
  const sourceCategories: Record<string, string> = {
    schedule: "Schedule",
    area: "Areas",
    finish: "Finishes",
    foundation: "Structure",
    notes: "Notes",
    other: "Other",
  };
  function changeSourceType(next: string) {
    setSourceType(next);
    const names: Record<string, string> = {
      schedule: "New schedule",
      area: "New area table",
      finish: "New finish schedule",
      foundation: "New foundation detail",
      notes: "New drawing notes",
      other: "New supporting source",
    };
    setSourceName(names[next] || "New source");
  }
  function sourceClick(point: Point) {
    if (mode !== "add" || !drawingViewport) return;
    if (!draft.length) {
      setDraft([point]);
      return;
    }
    const first = draft[0];
    const bbox: [number, number, number, number] = [
      Math.min(first.x, point.x),
      Math.min(first.y, point.y),
      Math.max(first.x, point.x),
      Math.max(first.y, point.y),
    ];
    if (bbox[2] - bbox[0] < 20 || bbox[3] - bbox[1] < 20) {
      setDraft([]);
      return;
    }
    const viewportId = crypto.randomUUID(),
      specId = crypto.randomUUID();
    addViewport({
      id: viewportId,
      name: sourceName.trim() || "New source",
      category: ["schedule", "area", "finish"].includes(sourceType)
        ? "schedule"
        : "detail",
      sheetId: sourceSheetId,
      bbox,
      status: "ready",
    });
    addSpecification({
      id: specId,
      name: sourceName.trim() || "New source",
      category: sourceCategories[sourceType] || "Other",
      viewportId,
      found: true,
      status: "ready",
      rawText: "New source region added for review.",
    });
    setSelected(specId);
    setDraft([]);
    setMode("select");
  }
  const toolbar = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => {
          setMode("select");
          setDraft([]);
        }}
        className={mode === "select" ? plansActiveTool : plansToolClass}
      >
        Select
      </button>
      <button
        onClick={() => {
          setMode("hand");
          setDraft([]);
        }}
        className={mode === "hand" ? plansActiveTool : plansToolClass}
      >
        Hand
      </button>
      <div className="relative">
        <button
          onClick={() => setAddOpen((x) => !x)}
          className={mode === "add" ? plansActiveTool : plansToolClass}
        >
          + Add source
        </button>
        {addOpen ? (
          <div className="absolute left-0 top-10 z-50 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <label className="block text-xs font-semibold text-slate-600">
              Source type
              <select
                className="input mt-1 w-full"
                value={sourceType}
                onChange={(e) => changeSourceType(e.target.value)}
              >
                <option value="schedule">Schedule</option>
                <option value="area">Area table</option>
                <option value="finish">Finish schedule</option>
                <option value="foundation">Foundation detail</option>
                <option value="notes">Drawing notes</option>
                <option value="other">Other supporting source</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Drawing page
              <select
                className="input mt-1 w-full"
                value={sourceSheetId}
                onChange={(e) => setSourceSheetId(e.target.value)}
              >
                {sheets
                  .filter((s) => s.included)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sheetNo} · {s.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Name
              <input
                className="input mt-1 w-full"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                setDraft([]);
                setMode("add");
                setAddOpen(false);
              }}
              className="h-9 w-full rounded-lg bg-blue-600 text-xs font-semibold text-white"
            >
              Draw source region
            </button>
          </div>
        ) : null}
      </div>
      {mode === "add" ? (
        <>
          <span className="ml-2 text-xs font-medium text-blue-700">
            {draft.length
              ? "Click the opposite corner"
              : "Click the first corner"}
          </span>
          <button
            onClick={() => {
              setMode("select");
              setDraft([]);
            }}
            className={plansToolClass}
          >
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );
  return (
    <ThreePane
      rightWidth={500}
      left={
        <SimpleList title="Specification sources">
          {specs.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                setSelected(x.id);
                setSpecTab(x.found ? "pdf" : "ocr");
                setMode("select");
                setDraft([]);
              }}
              className={
                selected === x.id
                  ? "w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left"
                  : "w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-200"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{x.name}</span>
                <StatusDot status={x.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {x.found ? x.category : "Not found"}
              </p>
            </button>
          ))}
        </SimpleList>
      }
      center={
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
            <button className={specTab === "pdf" ? plansActiveTool : plansToolClass} disabled={!item.found || !drawingViewport} onClick={() => setSpecTab("pdf")}>PDF</button>
            <button className={specTab === "ocr" ? plansActiveTool : plansToolClass} onClick={() => setSpecTab("ocr")}>OCR</button>
            <span className="ml-2 truncate text-xs text-slate-500">{item.found ? `Page ${item.page || "—"} · ${item.name}` : `${item.name} · source not found`}</span>
            <button disabled={reextracting} onClick={async()=>{setReextracting(true);try{await extractSpecificationsIfNeeded(true);setSelected("");}finally{setReextracting(false);}}} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:text-slate-300">{reextracting ? "Extracting…" : "Re-extract"}</button>
          </div>
          <div className="min-h-0 flex-1">
          {specTab === "pdf" && drawingViewport ? (
          <DemoDrawing
            viewportId={drawingViewport.id}
            tool={mode === "hand" ? "pan" : mode === "add" ? "draw" : "select"}
            onCanvasClick={sourceClick}
            toolbar={toolbar}
            showFocus={mode === "select" && Boolean(item.bbox)}
            focusBox={mode === "select" ? item.bbox : undefined}
          >
            {mode === "add" && draft.length ? (
              <circle
                cx={draft[0].x}
                cy={draft[0].y}
                r={9}
                fill="#2563eb"
                stroke="white"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : null}
          </DemoDrawing>
          ) : specTab === "ocr" ? (
            <div className="h-full overflow-auto bg-slate-50 p-6">
              <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">OCR transcription</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{item.name}</h3></div><span className={item.found ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"}>{item.found ? "Source found" : "Not found"}</span></div>
                {item.rawText ? <pre className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700">{item.rawText}</pre> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No source was found for this expected category.</p>}
                {item.columns?.length ? <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full border-collapse text-xs"><thead><tr className="bg-slate-100">{item.columns.map((column,index)=><th key={index} className="border-b border-r border-slate-200 p-2 text-left last:border-r-0">{column || `Column ${index+1}`}</th>)}</tr></thead><tbody>{(item.rows||[]).map((row,rowIndex)=><tr key={rowIndex}>{item.columns!.map((_,columnIndex)=><td key={columnIndex} className="border-b border-r border-slate-100 p-2 align-top last:border-r-0">{row[columnIndex] || ""}</td>)}</tr>)}</tbody></table></div> : null}
              </div>
            </div>
          ) : <div className="flex h-full items-center justify-center text-sm text-slate-500">Drawing source is not available. Open OCR to review the category.</div>}
          </div>
        </div>
      }
      right={
        <PreDetailsPanel>
          <SpecificationEditor item={item} items={specs} update={update} projectId={projectId} onSelect={setSelected} />
        </PreDetailsPanel>
      }
    />
  );
}

function SpecificationEditor({
  item,
  items,
  update,
  projectId,
  onSelect,
}: {
  item: SpecificationItem;
  items: SpecificationItem[];
  update: (id: string, patch: Partial<SpecificationItem>) => void;
  projectId: string;
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [rawText, setRawText] = useState(item.rawText);
  const [columns, setColumns] = useState<string[]>(item.columns || []);
  const [rows, setRows] = useState<string[][]>(item.rows || []);
  useEffect(() => {
    setName(item.name);
    setCategory(item.category);
    setRawText(item.rawText);
    setColumns(item.columns || []);
    setRows(item.rows || []);
  }, [
    item.id,
    item.name,
    item.category,
    item.rawText,
    item.columns,
    item.rows,
  ]);
  const dirty =
    name !== item.name ||
    category !== item.category ||
    rawText !== item.rawText ||
    JSON.stringify(columns) !== JSON.stringify(item.columns || []) ||
    JSON.stringify(rows) !== JSON.stringify(item.rows || []);
  const pendingSpecifications = items.filter((specification) => specification.status !== "confirmed");
  function continueAfterSpecifications() {
    if (dirty || pendingSpecifications.length) setShowContinuePrompt(true);
    else router.push(appRoutes.pre(projectId, "start-takeoff"));
  }
  function confirmAllSpecificationsAndContinue() {
    if (dirty) return;
    pendingSpecifications.forEach((specification) => update(specification.id, { status: "confirmed" }));
    setShowContinuePrompt(false);
    router.push(appRoutes.pre(projectId, "start-takeoff"));
  }
  function save(status: DemoStatus = "ready") {
    update(item.id, {
      name,
      category,
      rawText,
      columns: columns.length ? columns : undefined,
      rows: columns.length ? rows : undefined,
      status,
    });
  }
  function setCell(row: number, column: number, value: string) {
    setRows((current) =>
      current.map((cells, index) =>
        index === row
          ? cells.map((cell, i) => (i === column ? value : cell))
          : cells,
      ),
    );
  }
  function addColumn() {
    setColumns((current) => [...current, `Column ${current.length + 1}`]);
    setRows((current) => current.map((row) => [...row, ""]));
  }
  function deleteColumn(index: number) {
    setColumns((current) => current.filter((_, i) => i !== index));
    setRows((current) =>
      current.map((row) => row.filter((_, i) => i !== index)),
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Extracted data
        </p>
        <input
          className="input mt-2 w-full text-sm font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between">
          <input
            className="input w-44 text-xs"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <span
            className={
              item.found
                ? "text-xs font-semibold text-emerald-600"
                : "text-xs font-semibold text-amber-600"
            }
          >
            {item.found ? "OCR source located" : "Source not found"}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <PendingItemsList
          title="Specifications requiring confirmation"
          items={pendingSpecifications.map((specification) => ({ id: specification.id, name: specification.name, status: specification.status }))}
          selectedId={item.id}
          onSelect={onSelect}
          emptyMessage="All specification items are confirmed."
        />
        <label className="block text-xs font-semibold text-slate-600">
          Cleaned OCR text
          <textarea
            className="input mt-1 min-h-24 w-full resize-y py-2"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </label>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Extracted table
            </p>
            <button
              onClick={addColumn}
              className="text-xs font-semibold text-blue-600"
            >
              + Column
            </button>
          </div>
          {columns.length ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {columns.map((column, index) => (
                      <th
                        key={index}
                        className="min-w-32 border-r border-slate-200 p-2 align-top last:border-r-0"
                      >
                        <div className="flex gap-1">
                          <input
                            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-semibold"
                            value={column}
                            onChange={(e) =>
                              setColumns((current) =>
                                current.map((value, i) =>
                                  i === index ? e.target.value : value,
                                ),
                              )
                            }
                          />
                          <button
                            onClick={() => deleteColumn(index)}
                            className="px-1 text-red-500"
                            aria-label="Delete column"
                          >
                            ×
                          </button>
                        </div>
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-slate-200">
                      {columns.map((_, columnIndex) => (
                        <td
                          key={columnIndex}
                          className="border-r border-slate-200 p-1 last:border-r-0"
                        >
                          <input
                            className="w-full min-w-28 rounded-md border border-transparent px-2 py-2 hover:border-slate-200 focus:border-blue-400 focus:outline-none"
                            value={row[columnIndex] || ""}
                            onChange={(e) =>
                              setCell(rowIndex, columnIndex, e.target.value)
                            }
                          />
                        </td>
                      ))}
                      <td className="p-1">
                        <button
                          onClick={() =>
                            setRows((current) =>
                              current.filter((_, i) => i !== rowIndex),
                            )
                          }
                          className="px-2 text-red-500"
                          aria-label="Delete row"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              No table detected. Add a column to create one.
            </div>
          )}
          <button
            disabled={!columns.length}
            onClick={() =>
              setRows((current) => [...current, columns.map(() => "")])
            }
            className="mt-2 h-9 w-full rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 disabled:text-slate-300"
          >
            + Add row
          </button>
        </div>
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!dirty}
            onClick={() => save("ready")}
            className="h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:text-slate-300"
          >
            Save changes
          </button>
          <button
            disabled={dirty}
            onClick={() => save("confirmed")}
            className="h-10 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            Confirm
          </button>
        </div>
        {dirty ? (
          <p className="mt-2 text-center text-[11px] text-amber-600">
            Save the edited OCR data before confirming.
          </p>
        ) : null}
        <button type="button" onClick={continueAfterSpecifications} className="mt-2 h-11 w-full rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800">
          Next: Start takeoff <span aria-hidden="true">→</span>
        </button>
      </div>
      {showContinuePrompt ? (
        <PreContinueDialog
          pending={[
            ...(dirty ? [{ id: `${item.id}-unsaved`, name: `${item.name} — unsaved changes`, invalid: true }] : []),
            ...pendingSpecifications.map((specification) => ({ id: specification.id, name: specification.name })),
          ]}
          itemNoun="specification items"
          nextStep="Start takeoff"
          onReview={() => setShowContinuePrompt(false)}
          onContinue={() => { setShowContinuePrompt(false); router.push(appRoutes.pre(projectId, "start-takeoff")); }}
          onConfirmAll={confirmAllSpecificationsAndContinue}
        />
      ) : null}
    </div>
  );
}

function StartScreen({ projectId }: { projectId: string }) {
  const router = useRouter();
  const viewports = usePreStore((state) => state.viewports);
  const sheets = usePreStore((state) => state.sheets);
  const heights = usePreStore((state) => state.heights);
  const specifications = usePreStore((state) => state.specifications);
  const updateViewport = usePreStore((state) => state.updateViewport);
  const updateHeight = usePreStore((state) => state.updateHeight);
  const updateSpecification = usePreStore((state) => state.updateSpecification);
  const freezeProjectFrame = usePreStore((state) => state.freezeProjectFrame);
  const raw = usePreStore((state) => state.raw);
  const frozen = usePreStore((state) => state.frozen);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const includedSheets = new Set(sheets.filter((sheet) => sheet.included).map((sheet) => sheet.id));
  const pendingPlans = viewports.filter((viewport) => includedSheets.has(viewport.sheetId) && viewport.status !== "confirmed");
  const pendingHeights = heights.filter((item) => item.status !== "confirmed");
  const pendingSpecifications = specifications.filter((item) => item.status !== "confirmed");
  const pending = [
    ...pendingPlans.map((item) => ({ id: `plan-${item.id}`, name: `Plans · ${item.name}`, invalid: !item.name.trim() })),
    ...pendingHeights.map((item) => ({ id: `height-${item.id}`, name: `Height · ${item.name}` })),
    ...pendingSpecifications.map((item) => ({ id: `spec-${item.id}`, name: `Specifications · ${item.name}` })),
  ];
  async function beginTakeoff() {
    if (pending.length || raw?.readiness.ready === false) { setShowContinuePrompt(true); return; }
    setFreezeError(null);
    try {
      await freezeProjectFrame();
      router.push(appRoutes.takeoff(projectId, "columns", "dimension"));
    } catch (error) {
      setFreezeError(error instanceof Error ? error.message : "Could not freeze the Project Frame.");
    }
  }
  function confirmAllAndStart() {
    pendingPlans.filter((item) => item.name.trim()).forEach((item) => updateViewport(item.id, { status: "confirmed" }));
    pendingHeights.forEach((item) => updateHeight(item.id, { status: "confirmed" }));
    pendingSpecifications.forEach((item) => updateSpecification(item.id, { status: "confirmed" }));
    setShowContinuePrompt(false);
    window.setTimeout(() => { void beginTakeoff(); }, 700);
  }
  return (
    <div className="flex min-h-[660px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">
          ✓
        </div>
        <h3 className="mt-5 text-2xl font-semibold">Start takeoff</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Continue to the element-by-element takeoff workspace.
        </p>
        <div className="mt-5 max-h-64 overflow-y-auto text-left">
          <PendingItemsList
            title="Pre items requiring confirmation"
            items={pending.map((item) => ({ id: item.id, name: item.name }))}
            emptyMessage="All required Pre items are confirmed."
          />
        </div>
        {freezeError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{freezeError}</p> : null}
        {frozen ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">Project Frame frozen and ready for Takeoff.</p> : null}
        <button
          onClick={() => { void beginTakeoff(); }}
          className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white"
        >
          Start takeoff
        </button>
      </div>
      {showContinuePrompt ? (
        <PreContinueDialog
          pending={pending}
          itemNoun="Pre items"
          nextStep="Takeoff"
          onReview={() => setShowContinuePrompt(false)}
          onContinue={() => { setShowContinuePrompt(false); router.push(appRoutes.takeoff(projectId, "columns", "dimension")); }}
          onConfirmAll={confirmAllAndStart}
        />
      ) : null}
    </div>
  );
}

function PreDetailsPanel({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Details</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </div>
  );
}

function ConfirmationFooter({
  confirmed,
  total,
  noun,
  status,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  secondaryDisabled,
  onSecondary,
  nextLabel,
  onNext,
}: {
  confirmed: number;
  total: number;
  noun: string;
  status?: DemoStatus;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondary?: () => void;
  nextLabel?: string;
  onNext?: () => void;
}) {
  const remaining = Math.max(0, total - confirmed);
  return (
    <div className="shrink-0 border-t border-slate-200 bg-white p-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{confirmed} of {total} {noun}</p>
          <p className={remaining ? "mt-0.5 text-xs text-amber-600" : "mt-0.5 text-xs text-emerald-600"}>
            {remaining ? `${remaining} still ${remaining === 1 ? "requires" : "require"} confirmation` : "Everything in this step is confirmed"}
          </p>
        </div>
        {status ? <StatusLabel status={status} /> : null}
      </div>
      <div className={secondaryLabel ? "grid grid-cols-2 gap-2" : "grid grid-cols-1"}>
        {secondaryLabel ? (
          <button type="button" disabled={secondaryDisabled} onClick={onSecondary} className="min-h-10 rounded-xl border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-300">
            {secondaryLabel}
          </button>
        ) : null}
        <button type="button" disabled={primaryDisabled} onClick={onPrimary} className="min-h-10 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">
          {primaryLabel}
        </button>
      </div>
      {nextLabel ? (
        <button type="button" onClick={onNext} className="mt-2 h-11 w-full rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800">
          {nextLabel} <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
}

function PendingItemsList({
  title,
  items,
  selectedId,
  onSelect,
  emptyMessage,
}: {
  title: string;
  items: Array<{ id: string; name: string; status?: DemoStatus }>;
  selectedId?: string;
  onSelect?: (id: string) => void;
  emptyMessage: string;
}) {
  if (!items.length) {
    return <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">{emptyMessage}</div>;
  }
  return (
    <div className="mt-5 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">{title}</p>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{items.length}</span>
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item) => {
          const className = item.id === selectedId
            ? "flex w-full items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left"
            : "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-amber-300 hover:bg-amber-50";
          const content = <><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span><span className="mt-0.5 block text-[10px] text-slate-500">{item.status === "needs_review" ? "Needs review" : "Not confirmed"}</span></span>{onSelect ? <span className="text-xs text-slate-400">›</span> : null}</>;
          return onSelect ? <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={className}>{content}</button> : <div key={item.id} className={className}>{content}</div>;
        })}
      </div>
    </div>
  );
}

function PreContinueDialog({
  pending,
  itemNoun,
  nextStep,
  onReview,
  onContinue,
  onConfirmAll,
}: {
  pending: Array<{ id: string; name: string; invalid?: boolean }>;
  itemNoun: string;
  nextStep: string;
  onReview: () => void;
  onContinue: () => void;
  onConfirmAll: () => void;
}) {
  const invalid = pending.some((item) => item.invalid);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="plans-next-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Confirmation incomplete</p>
            <h2 id="plans-next-title" className="mt-1 text-xl font-semibold text-slate-950">Some {itemNoun} are not confirmed</h2>
            <p className="mt-2 text-sm text-slate-500">Review them, confirm all valid items now, or continue to {nextStep} without confirming.</p>
          </div>
          <button type="button" onClick={onReview} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">×</button>
        </div>
        <div className="mt-5 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {pending.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-700">{item.name}</span>
              <span className="shrink-0 text-xs font-semibold text-amber-600">Not confirmed</span>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onReview} className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Review {itemNoun}</button>
          <button type="button" onClick={onContinue} className="h-11 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">Continue without confirming</button>
          <button type="button" disabled={invalid} onClick={onConfirmAll} className="h-11 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300 sm:col-span-2">Confirm all and continue</button>
        </div>
      </div>
    </div>
  );
}

function StatusLabel({ status }: { status: DemoStatus }) {
  const confirmed = status === "confirmed";
  const review = status === "needs_review";
  return <span className={confirmed ? "shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700" : review ? "shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700" : "shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600"}>{confirmed ? "Confirmed" : review ? "Needs review" : "Not confirmed"}</span>;
}

function ThreePane({
  left,
  center,
  right,
  rightWidth = 320,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  rightWidth?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  return (
    <ResizableThreePane
      storageKey={`pre:${pathname}`}
      defaultLeft={230}
      defaultRight={rightWidth}
      collapsedLeft={collapsed}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <aside className="relative min-h-0 overflow-y-scroll border-r border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="sticky top-2 z-20 ml-auto mr-2 mt-2 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-500 shadow-sm"
        >
          {collapsed ? "›" : "‹"}
        </button>
        {collapsed ? null : left}
      </aside>
      <main className="min-h-0 min-w-0 overflow-hidden bg-slate-100 p-3">
        {center}
      </main>
      <aside className="min-h-0 overflow-y-scroll border-l border-slate-200 bg-white">
        {right}
      </aside>
    </ResizableThreePane>
  );
}
function SimpleList({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 p-3">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {children}
    </div>
  );
}
function ListButton({
  active,
  onClick,
  label,
  status,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  status: DemoStatus;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "flex w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-sm font-semibold text-blue-700"
          : "flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 hover:border-blue-200"
      }
    >
      <span>{label}</span>
      <StatusDot status={status} />
    </button>
  );
}
function StatusDot({ status }: { status: DemoStatus }) {
  return (
    <span
      title={status}
      className={
        status === "confirmed"
          ? "h-2.5 w-2.5 rounded-full bg-emerald-500"
          : status === "needs_review"
            ? "h-2.5 w-2.5 rounded-full bg-amber-500"
            : "h-2.5 w-2.5 rounded-full bg-slate-400"
      }
    />
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right text-slate-900">{value}</strong>
    </div>
  );
}

function CalibrationLine({
  line,
  setLine,
  label,
  axis,
  color = "#2563eb",
}: {
  line: [number, number, number, number];
  setLine: (x: [number, number, number, number]) => void;
  label: string;
  axis?: "x" | "y";
  color?: string;
}) {
  const [drag, setDrag] = useState<0 | 1 | null>(null);
  const [moveLine, setMoveLine] = useState<{
    start: Point;
    line: [number, number, number, number];
  } | null>(null);
  function move(e: ReactPointerEvent<SVGCircleElement>) {
    if (drag === null) return;
    const p = svgPoint(e as any);
    if (!p) return;
    const n: [number, number, number, number] = [...line];
    if (axis === "x") {
      n[drag * 2] = p.x;
      n[1] = line[1];
      n[3] = line[1];
    } else if (axis === "y") {
      n[drag * 2 + 1] = p.y;
      n[0] = line[0];
      n[2] = line[0];
    } else {
      n[drag * 2] = p.x;
      n[drag * 2 + 1] = p.y;
    }
    setLine(n);
  }
  function beginMove(e: ReactPointerEvent<SVGElement>) {
    if (!axis) return;
    const p = svgPoint(e as any);
    if (!p) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setMoveLine({ start: p, line: [...line] });
  }
  function moving(e: ReactPointerEvent<SVGElement>) {
    if (!moveLine) return;
    const p = svgPoint(e as any);
    if (!p) return;
    const dx = p.x - moveLine.start.x,
      dy = p.y - moveLine.start.y;
    setLine([
      moveLine.line[0] + dx,
      moveLine.line[1] + dy,
      moveLine.line[2] + dx,
      moveLine.line[3] + dy,
    ]);
  }
  const stopMove = () => setMoveLine(null);
  return (
    <g>
      <line
        x1={line[0]}
        y1={line[1]}
        x2={line[2]}
        y2={line[3]}
        stroke={color}
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {axis ? (
        <line
          x1={line[0]}
          y1={line[1]}
          x2={line[2]}
          y2={line[3]}
          stroke={color}
          strokeOpacity={0.001}
          strokeWidth={24}
          vectorEffect="non-scaling-stroke"
          pointerEvents="stroke"
          className="cursor-move"
          onPointerDown={beginMove}
          onPointerMove={moving}
          onPointerUp={stopMove}
          onPointerCancel={stopMove}
        />
      ) : null}
      <rect
        x={(line[0] + line[2]) / 2 - 50}
        y={(line[1] + line[3]) / 2 - 30}
        width={100}
        height={24}
        rx={8}
        fill="white"
        stroke={color}
        className={axis ? "cursor-move" : ""}
        onPointerDown={axis ? beginMove : undefined}
        onPointerMove={axis ? moving : undefined}
        onPointerUp={axis ? stopMove : undefined}
        onPointerCancel={axis ? stopMove : undefined}
      />
      <text
        x={(line[0] + line[2]) / 2}
        y={(line[1] + line[3]) / 2 - 14}
        textAnchor="middle"
        fontSize={13}
        fontWeight={800}
        fill={color}
        pointerEvents="none"
      >
        {label}
      </text>
      {[0, 1].map((i) => (
        <g key={i}>
          <circle
            cx={line[i * 2]}
            cy={line[i * 2 + 1]}
            r={9}
            fill="white"
            stroke={color}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag(i as 0 | 1);
            }}
            onPointerMove={move}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
          />
          {axis ? (
            <text
              x={line[i * 2] + (axis === "y" ? 16 : 0)}
              y={line[i * 2 + 1] + (axis === "x" ? -16 : 4)}
              textAnchor={axis === "y" ? "start" : "middle"}
              fontSize={10}
              fontWeight={700}
              fill={color}
              pointerEvents="none"
            >
              {`Known point ${i + 1}`}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  );
}
function MeasureLine({
  line,
  label,
}: {
  line: [number, number, number, number];
  label: string;
}) {
  const x = (line[0] + line[2]) / 2,
    y = (line[1] + line[3]) / 2;
  return (
    <g pointerEvents="none">
      <line
        x1={line[0]}
        y1={line[1]}
        x2={line[2]}
        y2={line[3]}
        stroke="#059669"
        strokeWidth={4}
        strokeDasharray="9 5"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={line[0]}
        cy={line[1]}
        r={7}
        fill="white"
        stroke="#059669"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={line[2]}
        cy={line[3]}
        r={7}
        fill="white"
        stroke="#059669"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x - 48}
        y={y - 30}
        width={96}
        height={24}
        rx={8}
        fill="white"
        stroke="#a7f3d0"
      />
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        fontSize={13}
        fontWeight={800}
        fill="#047857"
      >
        {label}
      </text>
    </g>
  );
}
function EvidenceHighlight({
  box,
  label,
  color,
  width,
  height,
}: {
  box: [number, number, number, number];
  label: string;
  color: string;
  width: number;
  height: number;
}) {
  const [x0, y0, x1, y1] = box;
  const labelWidth = Math.min(430, Math.max(250, label.length * 9));
  const labelX = Math.min(Math.max(0, x0), width - labelWidth);
  const labelY = Math.max(8, y0 - 42);
  return (
    <g pointerEvents="none">
      <rect x="0" y="0" width={width} height={y0} fill="white" opacity=".46" />
      <rect
        x="0"
        y={y1}
        width={width}
        height={height - y1}
        fill="white"
        opacity=".46"
      />
      <rect
        x="0"
        y={y0}
        width={x0}
        height={y1 - y0}
        fill="white"
        opacity=".46"
      />
      <rect
        x={x1}
        y={y0}
        width={width - x1}
        height={y1 - y0}
        fill="white"
        opacity=".46"
      />
      <rect
        x={x0}
        y={y0}
        width={x1 - x0}
        height={y1 - y0}
        rx={8}
        fill={color}
        fillOpacity=".10"
        stroke={color}
        strokeWidth={5}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={labelX}
        y={labelY}
        width={labelWidth}
        height={34}
        rx={8}
        fill={color}
      />
      <text
        x={labelX + labelWidth / 2}
        y={labelY + 23}
        textAnchor="middle"
        fontSize={15}
        fontWeight={800}
        fill="white"
      >
        {label}
      </text>
    </g>
  );
}
function HeightLines({
  h,
  onTop,
  onBottom,
  label,
}: {
  h: { yTop: number; yBottom: number };
  onTop: (y: number) => void;
  onBottom: (y: number) => void;
  label: string;
}) {
  const [drag, setDrag] = useState<"top" | "bottom" | null>(null);
  function move(e: ReactPointerEvent<SVGLineElement>) {
    if (!drag) return;
    const p = svgPoint(e as any);
    if (!p) return;
    if (drag === "top") onTop(p.y);
    else onBottom(p.y);
  }
  function line(y: number, kind: "top" | "bottom", color: string) {
    return (
      <g>
        <line
          x1={250}
          y1={y}
          x2={1500}
          y2={y}
          stroke={color}
          strokeWidth={5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <line
          x1={250}
          y1={y}
          x2={1500}
          y2={y}
          stroke={color}
          strokeOpacity={0.001}
          strokeWidth={24}
          vectorEffect="non-scaling-stroke"
          pointerEvents="stroke"
          className="cursor-row-resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag(kind);
          }}
          onPointerMove={move}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        />
        <circle
          cx={250}
          cy={y}
          r={8}
          fill="white"
          stroke={color}
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <circle
          cx={1500}
          cy={y}
          r={8}
          fill="white"
          stroke={color}
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      </g>
    );
  }
  return (
    <g>
      <rect
        x={250}
        y={Math.min(h.yTop, h.yBottom)}
        width={1250}
        height={Math.abs(h.yBottom - h.yTop)}
        fill="#2563eb"
        opacity=".06"
        pointerEvents="none"
      />
      {line(h.yBottom, "bottom", "#475569")}
      {line(h.yTop, "top", "#2563eb")}
      <rect
        x={1320}
        y={(h.yTop + h.yBottom) / 2 - 15}
        width={130}
        height={30}
        rx={8}
        fill="white"
        stroke="#bfdbfe"
        pointerEvents="none"
      />
      <text
        x={1385}
        y={(h.yTop + h.yBottom) / 2 + 5}
        textAnchor="middle"
        fontSize={15}
        fontWeight={800}
        fill="#1d4ed8"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}
function SlabLines({
  slab,
  onChange,
}: {
  slab: {
    topY: number;
    bottomY: number;
    x0: number;
    x1: number;
    stepX: number;
    stepOffset: number;
  };
  onChange: (p: Record<string, number>) => void;
}) {
  const [drag, setDrag] = useState<"top" | "bottom" | "step" | null>(null);
  const top2 = slab.topY + slab.stepOffset,
    bottom2 = slab.bottomY + slab.stepOffset;
  function mv(e: ReactPointerEvent<SVGElement>) {
    if (!drag) return;
    const p = svgPoint(e as any);
    if (!p) return;
    if (drag === "top") onChange({ topY: p.y });
    if (drag === "bottom") onChange({ bottomY: p.y });
    if (drag === "step") onChange({ stepX: p.x });
  }
  return (
    <g>
      <polygon
        points={`${slab.x0},${slab.topY} ${slab.stepX},${slab.topY} ${slab.stepX},${top2} ${slab.x1},${top2} ${slab.x1},${bottom2} ${slab.stepX},${bottom2} ${slab.stepX},${slab.bottomY} ${slab.x0},${slab.bottomY}`}
        fill="#2563eb"
        fillOpacity={0.12}
        stroke="none"
        pointerEvents="none"
      />
      {[
        [slab.topY, top2, "#2563eb", "top"],
        [slab.bottomY, bottom2, "#0f172a", "bottom"],
      ].map(([y1, y2, c, t]: any) => (
        <g key={t}>
          <polyline
            points={`${slab.x0},${y1} ${slab.stepX},${y1} ${slab.stepX},${y2} ${slab.x1},${y2}`}
            fill="none"
            stroke={c}
            strokeWidth={5}
            vectorEffect="non-scaling-stroke"
            className="cursor-row-resize"
            onPointerDown={(e: any) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag(t);
            }}
            onPointerMove={mv as any}
            onPointerUp={() => setDrag(null)}
          />
        </g>
      ))}
      <line
        x1={slab.stepX}
        y1={slab.topY - 30}
        x2={slab.stepX}
        y2={slab.bottomY + slab.stepOffset + 30}
        stroke="#f59e0b"
        strokeWidth={8}
        vectorEffect="non-scaling-stroke"
        className="cursor-col-resize"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag("step");
        }}
        onPointerMove={mv}
        onPointerUp={() => setDrag(null)}
      />
    </g>
  );
}
