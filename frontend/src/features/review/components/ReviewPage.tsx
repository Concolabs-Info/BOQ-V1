"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowStepPage } from "@/features/workflow/components/WorkflowStepPage";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import { useOptimisticMutationQueue } from "@/shared/hooks/useOptimisticMutationQueue";
import { confirmReview, getReviewState, updateReviewField } from "../api";
import type { ReviewItem, ReviewState } from "../types";
import { ReviewViewTabs } from "./ReviewViewTabs";
import { useDemoStore } from "@/features/demo/store";
import { useStructuralStore } from "@/features/quanto/structuralStore";
import { useSpecialStore } from "@/features/quanto/specialStore";

const categories = ["all", "column", "beam", "slab", "stair", "door", "window", "wall", "floor_finish", "wall_finish", "roof", "ceiling", "needs_review"] as const;
type Category = typeof categories[number];
const queryKey = (projectId: string, floorId: string | null, category: string) => ["review", projectId, floorId, category] as const;

function display(value: unknown, digits = 0): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return digits ? value.toFixed(digits) : String(value);
  return String(value);
}

function itemCode(item: ReviewItem): string {
  if (item.entity_type === "floor_drawing") return String(item.data.drawing_type || "Drawing").replaceAll("_", " ");
  if (item.entity_type.startsWith("roof_")) return String(item.data.definition_code || item.data.edge_type || item.data.opening_type || item.data.component_type || item.data.roof_type || "—").replaceAll("_", " ");
  return String(item.data.type_code || item.data.definition_code || item.data.finish_code || item.data.wall_type || item.data.floor_type_code || "—");
}

function itemMeasure(item: ReviewItem): string {
  if (item.entity_type === "floor_drawing") return String(item.data.registration_status || "Alignment not ready").replaceAll("_", " ");
  if (item.entity_type === "door" || item.entity_type === "window") {
    const width = item.data.width_mm;
    const height = item.data.height_mm;
    return width && height ? `${display(width)} × ${display(height)} mm` : "Size needs review";
  }
  if (item.entity_type === "column") return `${display(item.data.width_mm)} × ${display(item.data.depth_mm)} mm · ${display(item.data.height_m, 2)} m high`;
  if (item.entity_type === "beam") return `${display(item.data.length_m, 2)} m · ${display(item.data.width_mm)} × ${display(item.data.depth_mm)} mm`;
  if (item.entity_type === "slab") return `${display(item.data.net_area_m2, 2)} m² · ${display(item.data.thickness_mm)} mm`;
  if (item.entity_type === "wall") return item.data.net_area_m2 ? `${display(item.data.net_area_m2, 2)} m² net` : "Area needs review";
  if (item.entity_type.startsWith("floor_work_")) return item.data.quantity ? `${display(item.data.quantity, 2)} ${display(item.data.measurement_unit)}` : "Quantity needs review";
  if (item.entity_type === "ceiling_zone") return item.data.net_area_m2 ? `${display(item.data.net_area_m2, 2)} m² net` : "Area needs review";
  if (item.entity_type.startsWith("ceiling_feature_")) return item.data.quantity ? `${display(item.data.quantity, 2)} ${display(item.data.measurement_unit)}` : "Quantity needs review";
  if (item.entity_type === "roof_plane") return item.data.net_area_m2 ? `${display(item.data.net_area_m2, 2)} m² net` : "Area needs review";
  if (item.entity_type.startsWith("roof_")) return item.data.quantity != null ? `${display(item.data.quantity, 2)} ${display(item.data.measurement_unit)}` : "Quantity needs review";
  return item.data.area_m2 ? `${display(item.data.area_m2, 2)} m²` : "Area needs review";
}

function itemFinish(item: ReviewItem): string {
  if (item.entity_type === "floor_drawing") return `${Number(item.data.specification_count || 0)} mapped specification${Number(item.data.specification_count || 0) === 1 ? "" : "s"}`;
  if (item.entity_type === "door" || item.entity_type === "window") {
    return String(item.data.material || item.data.frame_material || item.data.finish || "—");
  }
  if (item.entity_type === "wall") {
    return String(item.data.side_1_finish || item.data.side_2_finish || item.data.classification || "—");
  }
  if (item.entity_type === "column" || item.entity_type === "beam" || item.entity_type === "slab") return String(item.data.description || item.data.kind || "Reinforced concrete");
  if (item.entity_type === "wall_finish") return String(item.data.wall_finish || item.data.material || item.data.room_name || "—");
  if (item.entity_type.startsWith("floor_work_")) return String(item.data.floor_work || item.data.material || item.data.room_name || "—");
  if (item.entity_type === "ceiling_zone") return String(item.data.ceiling_system || item.data.material || item.data.finish || "—");
  if (item.entity_type.startsWith("ceiling_feature_")) return String(item.data.description || item.data.definition_code || item.data.name || "—");
  if (item.entity_type === "roof_plane") return String(item.data.roof_system || item.data.material || item.data.roof_type || "—");
  if (item.entity_type.startsWith("roof_")) return String(item.data.roof_level || item.data.category || item.data.component_type || "—");
  return String(item.data.floor_finish || item.data.room_name || "—");
}


function itemSource(item: ReviewItem): string {
  const sources = item.data.value_sources as Record<string, string> | undefined;
  if (!sources) return String(item.data.source || "Saved");
  const priority = ["user_confirmed", "schedule", "specification", "drawing_note", "calculated", "model", "default"];
  const values = new Set(Object.values(sources));
  const selected = priority.find((value) => values.has(value)) || "saved";
  return ({
    user_confirmed: "User confirmed", schedule: "Schedule", specification: "Specification",
    drawing_note: "Drawing detail", calculated: "Measured from plan", model: "Model", default: "Estimated", saved: "Saved",
  } as Record<string, string>)[selected] || "Saved";
}

function statusClass(status: ReviewItem["status"]): string {
  if (status === "confirmed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export function ReviewPage({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const editQueue = useOptimisticMutationQueue();
  const takeoffRevision = useDemoStore((state) => [state.openings, state.walls, state.floorZones, state.ceilingZones, state.roofZones].map(items => items.map(item => `${item.id}:${item.status}`).join("|")).join("/"));
  const structureRevision = useStructuralStore((state) => [state.columns, state.beams, state.slabPlates].map(items => items.map(item => `${item.id}:${item.status}`).join("|")).join("/"));
  const specialRevision = useSpecialStore((state)=>state.flights.map(item=>`${item.id}:${item.status}`).join("|"));

  const activeQueryKey = [...queryKey(projectId, floorId, category), takeoffRevision, structureRevision, specialRevision] as const;
  const query = useQuery({
    queryKey: activeQueryKey,
    queryFn: () => getReviewState(projectId, floorId, category),
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchOnMount: "always",
    placeholderData: (previous) => previous,
    refetchInterval: (result) => result.state.data?.active_jobs?.length ? 2500 : false,
  });
  const state = query.data;
  const selected = state?.items.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    setChecked(new Set());
    setSelectedId(null);
  }, [category, floorId]);

  function queueEdit(action: () => Promise<unknown>, optimistic: (state: ReviewState) => ReviewState) {
    setError(null);
    setConfirmationMessage(null);
    return editQueue.enqueue({
      queryKey: activeQueryKey, mutation: action, optimistic,
      invalidations: [
        { queryKey: ["review", projectId], refetchType: "active" },
        { queryKey: ["workflow", projectId, "summary"], refetchType: "none" },
        { queryKey: ["boq", projectId], refetchType: "none" },
      ],
      errorMessage: "The review could not be updated.", onError: setError,
    });
  }

  const totals = useMemo(() => ({
    all: state?.counts.all || 0,
    ready: state?.counts.ready || 0,
    confirmed: state?.counts.confirmed || 0,
    needsReview: state?.counts.needs_review || 0,
  }), [state]);
  const scopeRemaining = floorId
    ? (state?.floors.find((floor) => floor.id === floorId)?.total || 0) - (state?.floors.find((floor) => floor.id === floorId)?.confirmed || 0)
    : totals.all - totals.confirmed;

  async function confirmSelected() {
    const ids = [...checked];
    const saved = await queueEdit(
      () => confirmReview(projectId, ids, "selected", floorId),
      (current) => ({ ...current, items: current.items.map((item) => ids.includes(item.id) ? { ...item, status: "confirmed" } : item) }),
    );
    if (saved) {
      setChecked(new Set());
      setConfirmationMessage(`${ids.length} item${ids.length === 1 ? "" : "s"} confirmed and sent to the BOQ.`);
    }
  }

  async function confirmAll() {
    const count = Math.max(0, scopeRemaining);
    const saved = await queueEdit(
      () => confirmReview(projectId, [], floorId ? "floor" : "project", floorId),
      (current) => ({ ...current, items: current.items.map((item) => ({ ...item, status: "confirmed" })) }),
    );
    if (saved) setConfirmationMessage(count ? `${count} item${count === 1 ? "" : "s"} confirmed and sent to the BOQ.` : "All available items are already confirmed.");
  }

  return (
    <WorkflowStepPage projectId={projectId} stepKey="review">
      <div className="flex justify-end border-b border-slate-200 bg-white px-5 py-3">
        <ReviewViewTabs projectId={projectId} active="items" />
      </div>

      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <p className="text-sm text-slate-600"><span className="font-semibold text-slate-950">{totals.all} measured items</span> available for final confirmation. Confirmed items are sent directly to the BOQ.</p>
        {confirmationMessage ? <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">✓ {confirmationMessage}</p> : null}
      </div>

      <div className="grid min-h-[690px] grid-cols-[210px_minmax(0,1fr)_340px] overflow-hidden">
        <aside className="border-r border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Floors</p>
          <button
            type="button"
            onClick={() => setFloorId(null)}
            className={!floorId ? "w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left" : "w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-200"}
          >
            <div className="flex justify-between gap-2"><span className="text-sm font-semibold">All Floors</span><span className="text-xs text-slate-500">{totals.all}</span></div>
            <p className="mt-2 text-xs text-slate-500">{totals.needsReview} need review</p>
          </button>
          <div className="mt-2 space-y-2">
            {state?.floors.map((floor) => (
              <button
                key={floor.id}
                type="button"
                onClick={() => setFloorId(floor.id)}
                className={floorId === floor.id ? "w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left" : "w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-200"}
              >
                <div className="flex justify-between gap-2"><span className="text-sm font-semibold">{floor.name}</span><span className="text-xs text-slate-500">{floor.total}</span></div>
                <p className="mt-2 text-xs text-slate-500">{floor.ready || 0} ready · {floor.needs_review} review</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 border-r border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={category === item ? "rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold capitalize text-white" : "rounded-lg px-3 py-2 text-sm font-semibold capitalize text-slate-600 hover:bg-slate-50"}
                >
                  {item === "floor_finish" ? "Floor finish" : item === "wall_finish" ? "Wall finish" : item.replace("_", " ")} <span className="ml-1 text-xs opacity-70">{state?.counts[item] || 0}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!checked.size || editQueue.saving} onClick={() => void confirmSelected()}>
                {editQueue.saving && checked.size ? "Confirming…" : `Confirm selected${checked.size ? ` (${checked.size})` : ""}`}
              </Button>
              <Button disabled={editQueue.saving || scopeRemaining <= 0} onClick={() => void confirmAll()}>
                {editQueue.saving ? "Confirming…" : scopeRemaining <= 0 ? "All confirmed ✓" : "Confirm all"}
              </Button>
            </div>
          </div>

          <div className="max-h-[640px] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3"></th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Element</th>
                  <th className="px-4 py-3">Size / quantity</th>
                  <th className="px-4 py-3">Material / finish</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {state?.items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={item.id === selectedId ? "cursor-pointer border-t border-slate-200 bg-blue-50" : "cursor-pointer border-t border-slate-200 hover:bg-slate-50"}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked.has(item.id)}
                        disabled={item.critical || item.status === "confirmed" || editQueue.saving}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setChecked((current) => {
                          const next = new Set(current);
                          event.target.checked ? next.add(item.id) : next.delete(item.id);
                          return next;
                        })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.display_number || item.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-slate-500">{String(item.data.floor || "")}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusClass(item.status)}`}>{item.status.replace("_", " ")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium capitalize text-slate-800">{item.entity_type.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs text-slate-500">{itemCode(item)}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{itemMeasure(item)}</td>
                    <td className="px-4 py-3 text-slate-600">{itemFinish(item)}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-500">{itemSource(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state && !state.items.length ? <div className="p-12 text-center text-sm text-slate-500">No items match this view.</div> : null}
          </div>
        </main>

        <aside className="overflow-y-auto bg-white p-5">
          {selected ? (
            <ReviewDetails
              item={selected}
              saving={false}
              onEdit={(field, value) => queueEdit(
                () => updateReviewField(projectId, selected.id, field, value),
                (current) => ({...current,items:current.items.map((item)=>item.id===selected.id?{...item,data:{...item.data,[field]:value},status:"confirmed"}:item)}),
              ).then(() => undefined)}
            />
          ) : <p className="text-sm text-slate-500">Select an item to review its current saved details.</p>}
          {error ? <div className="mt-4"><ErrorMessage message={error} /></div> : null}
        </aside>
      </div>

      <div className="flex items-center justify-end border-t border-slate-200 bg-white px-6 py-4">
        <Link className="inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white" href={appRoutes.workflowStep(projectId, "boq")}>Continue to BOQ</Link>
      </div>
    </WorkflowStepPage>
  );
}

function Summary({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "blue" | "amber" | "green" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-900",
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-50 text-amber-800",
    green: "bg-emerald-50 text-emerald-800",
  };
  return <div className={`rounded-xl border border-slate-200 px-4 py-3 ${tones[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-65">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function ReviewDetails({ item, saving, onEdit }: { item: ReviewItem; saving: boolean; onEdit: (field: string, value: unknown) => Promise<void> }) {
  const editable = item.entity_type === "wall"
    ? ["classification", "wall_type", "thickness_mm", "side_1_finish", "side_2_finish"]
    : item.entity_type === "roof_plane"
      ? ["pitch_degrees", "definition_id", "shape_group", "surface_class", "include_in_boq", "boq_owner"]
    : item.entity_type === "ceiling_zone"
      ? ["height_mm", "suspension_depth_mm", "profile_type", "scope_state", "option_code"]
    : item.entity_type === "floor_drawing" || item.entity_type === "floor_finish" || item.entity_type === "wall_finish" || item.entity_type.startsWith("floor_work_") || item.entity_type.startsWith("ceiling_feature_") || item.entity_type.startsWith("roof_")
      ? []
    : item.entity_type === "floor"
      ? ["room_name", "room_type"]
      : ["type_code", "width_mm", "height_mm", "material", "frame_material", "finish", ...(item.entity_type === "window" ? ["glass_type"] : [])];
  const warnings = Array.isArray(item.data.warnings) ? item.data.warnings.map(String) : [];
  const missing = Array.isArray(item.data.missing_fields) ? item.data.missing_fields.map(String) : [];
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-400">Selected item</p>
        <h3 className="mt-1 text-xl font-semibold">{item.display_number || item.title}</h3>
        <p className="mt-1 text-sm capitalize text-slate-500">{item.entity_type} · {itemCode(item)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-3"><span className="text-slate-500">Floor</span><strong>{String(item.data.floor || "—")}</strong></div>
        <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Measure</span><strong className="text-right">{itemMeasure(item)}</strong></div>
        <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Material / finish</span><strong className="text-right">{itemFinish(item)}</strong></div>
        <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Resolved from</span><strong className="text-right">{itemSource(item)}</strong></div>
        {item.data.drawing_tag ? <div className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Drawing tag</span><strong>{String(item.data.drawing_tag)}</strong></div> : null}
      </div>
      {missing.length || warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {missing.length ? <p><strong>Missing:</strong> {missing.map((value) => value.replaceAll("_", " ")).join(", ")}</p> : null}
          {warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}
        </div>
      ) : null}
      {Array.isArray(item.data.nrm2_work_items)&&item.data.nrm2_work_items.length?<div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Generated NRM2 work items</p><ul className="mt-2 space-y-1 text-sm text-slate-700">{item.data.nrm2_work_items.map(value=><li key={String(value)}>• {String(value)}</li>)}</ul></div>:null}
      <div className="space-y-3">
        {editable.map((field) => {
          const backendField = field === "room_name" ? "name" : field;
          return (
            <label key={field} className="block text-sm font-medium capitalize">
              {field.replaceAll("_", " ")}
              <input
                className="input mt-1 w-full"
                defaultValue={item.data[field] == null ? "" : String(item.data[field])}
                onBlur={(event) => {
                  const raw = event.target.value;
                  const next = field.endsWith("_mm") ? Number(raw) : raw;
                  if (raw !== String(item.data[field] ?? "")) void onEdit(backendField, next);
                }}
                disabled={saving}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
