"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { appRoutes } from "@/shared/constants/appRoutes";
import { usePreStore } from "@/features/pre/state/preStore";

export const PRE_STEPS = [
  ["upload", "Upload"],
  ["plans", "Plans"],
  ["scale", "Scale"],
  ["height", "Height"],
  ["specifications", "Specifications"],
  ["start-takeoff", "Start takeoff"],
] as const;

export const TAKEOFF_ELEMENTS = [
  ["columns", "Columns"],
  ["beams", "Beams"],
  ["slab", "Slab"],
  ["floor", "Floor"],
  ["ceiling", "Ceiling"],
  ["doors-windows", "Doors & Windows"],
  ["walls", "Walls"],
  ["roof", "Roof"],
  ["stairs-ramps", "Stairs & Ramps"],
  ["foundation", "Foundation"],
] as const;

type ProgressState = "current" | "complete" | "pending";
type ExpandableSection = "pre" | "takeoff" | null;

export function QuantoWorkflowNav({ projectId, office = false }: { projectId: string; office?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const viewports = usePreStore((state) => state.viewports);
  const sheets = usePreStore((state) => state.sheets);
  const updateViewport = usePreStore((state) => state.updateViewport);
  const confirmStoreyStack = usePreStore((state) => state.confirmStoreyStack);
  const [showPlansGuard, setShowPlansGuard] = useState(false);
  const preOpen = pathname.includes("/pre/");
  const takeoffOpen = pathname.includes("/takeoff/");
  const activeExpandable: ExpandableSection = preOpen ? "pre" : takeoffOpen ? "takeoff" : null;
  const [expandedSection, setExpandedSection] = useState<ExpandableSection>(activeExpandable);
  const reviewActive = pathname.endsWith("/review") || pathname.includes("/review/");
  const boqActive = pathname.includes("/boq");

  const currentPreIndex = PRE_STEPS.findIndex(([key]) => pathname === appRoutes.pre(projectId, key));
  const currentTakeoffIndex = TAKEOFF_ELEMENTS.findIndex(([key]) => pathname.includes(`/takeoff/${key}/`));

  const preComplete = takeoffOpen || reviewActive || boqActive;
  const takeoffComplete = reviewActive || boqActive;
  const includedSheetIds = new Set(sheets.filter((sheet) => sheet.included).map((sheet) => sheet.id));
  const includedViewports = viewports.filter((viewport) => includedSheetIds.has(viewport.sheetId));
  const pendingPlans = includedViewports.filter((viewport) => viewport.status !== "confirmed");
  const invalidPlans = pendingPlans.filter((viewport) => !viewport.name.trim() || viewport.bbox[2] <= viewport.bbox[0] || viewport.bbox[3] <= viewport.bbox[1]);

  useEffect(() => {
    setExpandedSection(activeExpandable);
  }, [activeExpandable, pathname]);

  function openScale(event: MouseEvent<HTMLAnchorElement>) {
    if (!pathname.includes("/pre/plans") || pendingPlans.length === 0) return;
    event.preventDefault();
    setShowPlansGuard(true);
  }

  function confirmAllAndContinue() {
    if (invalidPlans.length) return;
    pendingPlans.forEach((viewport) => updateViewport(viewport.id, { status: "confirmed" }));
    setShowPlansGuard(false);
    void confirmStoreyStack().then(() => router.push(appRoutes.pre(projectId, "scale")));
  }

  function continueWithoutConfirming() {
    setShowPlansGuard(false);
    router.push(appRoutes.pre(projectId, "scale"));
  }

  return (
    <nav aria-label="Quanto workflow" className={office ? "flex min-w-0 flex-1 items-stretch" : "flex min-w-0 flex-1 items-center gap-2"}>
      <MainLink
        href={appRoutes.pre(projectId, "upload")}
        label="Pre"
        state={preOpen ? "current" : preComplete ? "complete" : "pending"}
        expanded={expandedSection === "pre"}
        office={office}
        onCurrentClick={() => setExpandedSection((current) => current === "pre" ? null : "pre")}
      />

      {preOpen && expandedSection === "pre" ? (
        <SubTabsScroller office={office}>
          {PRE_STEPS.map(([key, label], index) => (
            <SubLink
              key={key}
              href={appRoutes.pre(projectId, key)}
              label={label}
              state={index === currentPreIndex ? "current" : index < currentPreIndex ? "complete" : "pending"}
              onClick={key === "scale" ? openScale : undefined}
              office={office}
            />
          ))}
        </SubTabsScroller>
      ) : null}

      <MainLink
        href={appRoutes.takeoff(projectId, "columns")}
        label="Takeoff"
        state={takeoffOpen ? "current" : takeoffComplete ? "complete" : "pending"}
        expanded={expandedSection === "takeoff"}
        office={office}
        onCurrentClick={() => setExpandedSection((current) => current === "takeoff" ? null : "takeoff")}
      />

      {takeoffOpen && expandedSection === "takeoff" ? (
        <SubTabsScroller office={office}>
          {TAKEOFF_ELEMENTS.map(([key, label], index) => (
            <SubLink
              key={key}
              href={appRoutes.takeoff(projectId, key)}
              label={label}
              state={index === currentTakeoffIndex ? "current" : index < currentTakeoffIndex ? "complete" : "pending"}
              office={office}
            />
          ))}
        </SubTabsScroller>
      ) : null}

      <MainLink
        href={appRoutes.workflowStep(projectId, "review")}
        label="Review"
        state={reviewActive ? "current" : boqActive ? "complete" : "pending"}
        office={office}
      />
      <MainLink
        href={appRoutes.workflowStep(projectId, "boq")}
        label="BOQ"
        state={boqActive ? "current" : "pending"}
        office={office}
      />
      {showPlansGuard ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="plans-confirm-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Plans review</p>
                <h2 id="plans-confirm-title" className="mt-1 text-xl font-semibold text-slate-950">Confirm drawings before continuing</h2>
                <p className="mt-2 text-sm text-slate-500">{pendingPlans.length} included {pendingPlans.length === 1 ? "drawing requires" : "drawings require"} confirmation before Scale.</p>
              </div>
              <button type="button" onClick={() => setShowPlansGuard(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">×</button>
            </div>
            <div className="mt-5 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {pendingPlans.map((viewport) => {
                const invalid = !viewport.name.trim() || viewport.bbox[2] <= viewport.bbox[0] || viewport.bbox[3] <= viewport.bbox[1];
                return <div key={viewport.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="min-w-0 truncate font-medium text-slate-700">{viewport.name || "Unnamed drawing"}</span><span className={invalid ? "shrink-0 text-xs font-semibold text-red-600" : "shrink-0 text-xs font-semibold text-amber-600"}>{invalid ? "Needs details" : "Not confirmed"}</span></div>;
              })}
            </div>
            {invalidPlans.length ? <p className="mt-3 text-xs text-red-600">Complete the missing drawing details before confirming all.</p> : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setShowPlansGuard(false)} className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Review drawings</button>
              <button type="button" onClick={continueWithoutConfirming} className="h-11 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">Continue without confirming</button>
              <button type="button" disabled={Boolean(invalidPlans.length)} onClick={confirmAllAndContinue} className="h-11 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300 sm:col-span-2">Confirm all and continue</button>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function SubTabsScroller({ children, office = false }: { children: ReactNode; office?: boolean }) {
  return (
    <div className={office ? "min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}>
      <div className={office ? "flex h-full min-w-max items-stretch" : "flex min-w-max items-center gap-1 px-1"}>{children}</div>
    </div>
  );
}

function MainLink({
  href,
  label,
  state,
  expanded,
  office = false,
  onCurrentClick,
}: {
  href: string;
  label: string;
  state: ProgressState;
  expanded?: boolean;
  office?: boolean;
  onCurrentClick?: () => void;
}) {
  const className = office
    ? state === "current"
      ? "flex h-full shrink-0 items-center border-b-2 border-blue-600 bg-white px-4 text-[11px] font-bold uppercase tracking-wide text-blue-700"
      : state === "complete"
        ? "flex h-full shrink-0 items-center gap-1.5 border-b-2 border-transparent px-4 text-[11px] font-bold uppercase tracking-wide text-emerald-700 transition hover:bg-white"
        : "flex h-full shrink-0 items-center border-b-2 border-transparent px-4 text-[11px] font-bold uppercase tracking-wide text-slate-600 transition hover:bg-white hover:text-blue-700"
    :
    state === "current"
      ? "flex h-9 shrink-0 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm"
      : state === "complete"
        ? "flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        : "flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700";

  const content = <>{state === "complete" ? <CheckIcon /> : null}{label}{onCurrentClick ? <ChevronIcon expanded={Boolean(expanded)} /> : null}</>;

  if (state === "current" && onCurrentClick) {
    return <button type="button" className={`${className} gap-1.5`} aria-expanded={expanded} onClick={onCurrentClick}>{content}</button>;
  }

  return <Link href={href} className={className}>{content}</Link>;
}

function SubLink({ href, label, state, onClick, office = false }: { href: string; label: string; state: ProgressState; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; office?: boolean }) {
  const className = office
    ? state === "current"
      ? "flex h-full shrink-0 items-center border-b-2 border-blue-600 bg-white px-3 text-[11px] font-bold text-blue-700"
      : state === "complete"
        ? "flex h-full shrink-0 items-center gap-1 border-b-2 border-transparent px-3 text-[11px] font-semibold text-emerald-700 transition hover:bg-white"
        : "flex h-full shrink-0 items-center border-b-2 border-transparent px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-white hover:text-blue-700"
    :
    state === "current"
      ? "flex h-8 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm"
      : state === "complete"
        ? "flex h-8 shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
        : "flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-slate-500 transition hover:bg-blue-50 hover:text-blue-700";

  return (
    <Link href={href} className={className} onClick={onClick}>
      {state === "complete" ? <CheckIcon small /> : null}
      {label}
    </Link>
  );
}

function CheckIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={small ? "h-3 w-3" : "h-3.5 w-3.5"}
    >
      <path d="m4.5 10.5 3.2 3.2 7.8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}>
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
