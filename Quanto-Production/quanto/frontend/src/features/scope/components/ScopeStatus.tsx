"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { appRoutes } from "@/shared/constants/appRoutes";
import { ApiRequestError } from "@/shared/services/apiClient";
import { scopeApi } from "../api";
import type { ScopeGap, ScopeManifest, ScopeQuestion } from "../types";

function drawingLabel(label: string) {
  return label.endsWith("s") && !label.includes("&") ? label.slice(0, -1) : label;
}

function friendlyGap(gap: ScopeGap, label: string) {
  const subject = drawingLabel(label).toLowerCase();
  if (gap.code === "primary_not_found") return `A ${subject} drawing is missing for one or more levels.`;
  if (gap.code === "ambiguous_primary_source") return `Choose which ${subject} drawing should be used.`;
  if (gap.code === "scale_not_confirmed") return `Confirm the scale shown on this drawing before measuring.`;
  if (gap.code === "source_transform_missing") return `The drawing preview is not available yet. Review this drawing in Setup.`;
  if (gap.code === "storey_height_missing") return `Confirm the floor height before measuring.`;
  if (gap.code === "vertical_evidence_not_found") return `A section or elevation is still needed for the height check.`;
  return `Review the ${subject} drawings before measuring.`;
}

function friendlyQuestion(question: ScopeQuestion) {
  if (question.kind === "single_choice") return "Choose the drawing to use for this level.";
  if (question.code.includes("scale")) return "Confirm the scale shown on this drawing before measuring.";
  if (question.code.includes("height")) return "Confirm the floor height before measuring.";
  if (question.code.includes("primary")) return "Choose or add the correct drawing for this level.";
  if (question.code.includes("transform")) return "Review this drawing in Setup so its preview can be prepared.";
  return "Review this drawing before continuing.";
}

export function ScopeStatus({ projectId, element }: { projectId: string; element: string }) {
  const [scope, setScope] = useState<ScopeManifest | null>(null);
  const [error, setError] = useState<{ message: string; setupIncomplete: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScope(null);
    setError(null);
    scopeApi.get(projectId, element)
      .then((data) => { if (!cancelled) setScope(data); })
      .catch((reason: unknown) => {
        if (!cancelled) setError({
          message: reason instanceof Error ? reason.message : "This section could not be loaded.",
          setupIncomplete: reason instanceof ApiRequestError && reason.status === 409,
        });
      });
    return () => { cancelled = true; };
  }, [projectId, element, reload]);

  const firstIssue = useMemo(() => {
    if (!scope) return null;
    const coverageGaps = scope.coverage_gaps || [];
    const gap = coverageGaps.find((item) => item.severity === "blocked") || coverageGaps[0];
    return gap ? friendlyGap(gap, scope.label) : null;
  }, [scope]);

  async function answer(question: ScopeQuestion, choice: string) {
    setAnswering(question.id);
    try {
      const updated = await scopeApi.answer(projectId, element, question.id, choice);
      setScope(updated);
    } finally {
      setAnswering(null);
    }
  }

  if (error) {
    if (!error.setupIncomplete) {
      return (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <div>
            <span className="font-semibold text-red-900">This Takeoff section could not be loaded</span>
            <span className="ml-2 text-red-700">Your saved setup is unchanged.</span>
          </div>
          <button type="button" onClick={() => setReload((value) => value + 1)} className="shrink-0 font-semibold text-red-800 hover:underline">Try again</button>
        </div>
      );
    }
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <div>
          <span className="font-semibold text-amber-900">Takeoff setup not finished</span>
          <span className="ml-2 text-amber-700">Finish the Pre checks and select Start takeoff to prepare this section.</span>
        </div>
        <Link href={appRoutes.pre(projectId, "start-takeoff")} className="shrink-0 font-semibold text-amber-800 hover:underline">Finish setup</Link>
      </div>
    );
  }

  if (!scope) {
    return <div className="mb-4 h-12 animate-pulse rounded-xl border border-slate-200 bg-slate-50" aria-label="Checking Takeoff scope" />;
  }

  const tone = scope.status === "ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : scope.status === "blocked"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const subjectLabel = drawingLabel(scope.label);
  const title = scope.status === "blocked" ? `${subjectLabel} drawings need review` : `${subjectLabel} source drawings ready`;
  const openQuestions = (scope.questions || []).filter((question) => question.status === "open");
  const levelScopes = scope.level_scopes || [];
  const drawingCount = new Set(
    (scope.selected_viewports || [])
      .filter((drawing) => drawing.role === "primary_measurement")
      .map((drawing) => drawing.viewport_id),
  ).size;
  const coveredLevelCount = levelScopes.filter((level) => level.geometry_route !== "not_found").length;
  const coverageText = scope.status === "blocked"
    ? firstIssue || "Review the highlighted drawing before measuring."
    : `${drawingCount} ${drawingCount === 1 ? "drawing" : "drawings"} selected${levelScopes.length ? ` · ${coveredLevelCount} of ${levelScopes.length} levels covered` : ""}.`;

  return (
    <div className={`mb-4 rounded-xl border ${tone}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{title}</span>
          </div>
          <p className="mt-0.5 truncate text-xs opacity-80">{coverageText}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold">{open ? "Close" : openQuestions.length ? `Review ${openQuestions.length}` : "View coverage"}</span>
      </button>

      {open ? (
        <div className="border-t border-current/10 bg-white/60 px-4 py-3 text-slate-700">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Levels covered</p>
              <div className="mt-2 space-y-1.5">
                {levelScopes.length ? levelScopes.map((item) => (
                  <div key={item.scope_ref} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-slate-200/70">
                    <span className="truncate font-medium">{item.label || "Project scope"}</span>
                    <span className={item.geometry_route === "not_found" ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
                      {item.geometry_route === "floor_geometry_fallback" ? "Floor fallback" : item.geometry_route === "not_found" ? "Missing" : "Ready"}
                    </span>
                  </div>
                )) : <p className="text-xs text-slate-500">No level-specific scope is required.</p>}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next step</p>
              <div className="mt-2 space-y-2">
                {openQuestions.length ? openQuestions.map((question) => (
                  <div key={question.id} className="rounded-lg bg-white p-3 text-xs shadow-sm ring-1 ring-slate-200/70">
                    <p className="font-medium text-slate-800">
                      {friendlyQuestion(question)}
                    </p>
                    {question.kind === "single_choice" && question.options.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {question.options.map((option) => (
                          <button key={option.value} type="button" disabled={answering === question.id} onClick={() => void answer(question, option.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50">
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Link href={appRoutes.pre(projectId, question.code.includes("scale") ? "scale" : question.code.includes("height") ? "height" : "plans")} className="mt-2 inline-flex font-semibold text-blue-700 hover:underline">
                        Review drawings
                      </Link>
                    )}
                  </div>
                )) : <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200/70">The source drawings are ready. Select a drawing below to begin takeoff.</p>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
