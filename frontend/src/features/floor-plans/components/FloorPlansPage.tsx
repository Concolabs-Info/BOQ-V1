"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowStepPage } from "@/features/workflow/components/WorkflowStepPage";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import { addFloor, getFloorPlans, removeFloor, updateFloor, updateFloorPlanSettings } from "../api";
import type { FloorCropSaveResult, FloorPlansState } from "../types";
import { CropWorkspace } from "./CropWorkspace";
import { FloorCard } from "./FloorCard";
import { markCropReplaced } from "@/features/workflow/canonicalCache";
import { createDrawing, removeDrawing } from "@/features/drawings/api";
import { DrawingCropWorkspace } from "@/features/drawings/components/DrawingCropWorkspace";
import type { DrawingTypeOption, FloorDrawing } from "@/features/drawings/types";
import { ApiRequestError } from "@/shared/services/apiClient";
import { useOptimisticMutationQueue } from "@/shared/hooks/useOptimisticMutationQueue";

const queryKey = (projectId: string) => ["floor-plans", projectId] as const;

export function FloorPlansPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [editingFloorId, setEditingFloorId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(`autoboq:floor-plans:open:${projectId}`);
  });
  const [defaultHeight, setDefaultHeight] = useState("2700");
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [unit, setUnit] = useState("mm");
  const [savingSettings, setSavingSettings] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [drawingErrors, setDrawingErrors] = useState<Record<string, string | undefined>>({});
  const editQueue = useOptimisticMutationQueue();

  const stateQuery = useQuery({
    queryKey: queryKey(projectId),
    queryFn: () => getFloorPlans(projectId),
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return false;
      const active = state.floors.some((floor) => floor.active_jobs.length > 0);
      const preparingPages = state.documents.some((document) => document.status === "processing");
      return active || preparingPages ? 5_000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: (previous) => previous,
  });
  const state = stateQuery.data;
  const architecturalDocuments = state?.documents.filter((document) => document.document_type !== "drawing_source") || [];

  useEffect(() => {
    if (!state) return;
    setDefaultHeight(String(displayHeight(state.default_wall_height_mm, state.measurement_unit)));
    setUnit(state.measurement_unit);
  }, [state]);

  useEffect(() => {
    const key = `autoboq:floor-plans:open:${projectId}`;
    if (editingFloorId) window.sessionStorage.setItem(key, editingFloorId);
    else window.sessionStorage.removeItem(key);
  }, [editingFloorId, projectId]);

  async function replaceState(action: () => Promise<FloorPlansState>, optimistic?: (state: FloorPlansState) => FloorPlansState) {
    setMutationError(null);
    if (optimistic) {
      const result = await editQueue.enqueue({
        queryKey:queryKey(projectId),mutation:action,optimistic,
        invalidations:[
          {queryKey:queryKey(projectId),refetchType:"active"},
          {queryKey:["workflow",projectId,"summary"],refetchType:"none"},
        ],
        errorMessage:"This action could not be completed.",onError:setMutationError,
      });
      return result || queryClient.getQueryData<FloorPlansState>(queryKey(projectId))!;
    }
    try {
      const next = await action();
      queryClient.setQueryData(queryKey(projectId), next);
      return next;
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "This action could not be completed.");
      throw error;
    }
  }

  async function saveSettings() {
    const heightMm = toMillimetres(Number(defaultHeight), unit);
    if (!Number.isFinite(heightMm) || heightMm <= 0) {
      setMutationError("Enter a valid wall height.");
      return;
    }
    setSavingSettings(true);
    try {
      await replaceState(() => updateFloorPlanSettings(projectId, { default_wall_height_mm: heightMm, measurement_unit: unit }));
    } finally {
      setSavingSettings(false);
    }
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKey(projectId), refetchType: "active" });
  }

  function handleCropSaved(floorId: string, result: FloorCropSaveResult) {
    queryClient.setQueryData<FloorPlansState>(queryKey(projectId), (current) => current ? {
      ...current,
      floors: current.floors.map((item) => item.id === floorId ? {
        ...item,
        crop: result.crop,
        crop_version: result.crop.crop_version,
        status: result.crop.preview_asset_url ? "ready" : item.status,
        active_jobs: result.jobs.length ? result.jobs : item.active_jobs,
        last_error: null,
      } : item),
      updated_at: result.crop.updated_at,
    } : current);
    markCropReplaced(queryClient, projectId, floorId);
  }

  const editingFloor = state?.floors.find((floor) => floor.id === editingFloorId) ?? null;
  const editingDrawingFloor = state?.floors.find((floor) => floor.drawings.some((drawing) => drawing.id === editingDrawingId)) ?? null;
  const editingDrawing = editingDrawingFloor?.drawings.find((drawing) => drawing.id === editingDrawingId) ?? null;

  async function addDrawingSlot(floorId: string, type: DrawingTypeOption): Promise<FloorDrawing | null> {
    setDrawingErrors((current) => ({ ...current, [floorId]: undefined }));
    try {
      const result = await createDrawing(projectId, floorId, type.key);
      queryClient.setQueryData<FloorPlansState>(queryKey(projectId), (current) => current ? {
        ...current,
        floors: current.floors.map((floor) => floor.id === floorId ? {
          ...floor,
          drawings: floor.drawings.some((drawing) => drawing.id === result.drawing.id)
            ? floor.drawings
            : [...floor.drawings, result.drawing],
        } : floor),
      } : current);
      setEditingDrawingId(result.drawing.id);
      return result.drawing;
    } catch (error) {
      setDrawingErrors((current) => ({
        ...current,
        [floorId]: drawingActionError(error, "The drawing tab could not be added."),
      }));
      return null;
    }
  }

  async function deleteDrawingSlot(drawing: FloorDrawing) {
    if (!window.confirm(`Remove ${drawing.name}? Its saved revisions will no longer be used.`)) return;
    setDrawingErrors((current) => ({ ...current, [drawing.floor_id]: undefined }));
    if (editingDrawingId===drawing.id) setEditingDrawingId(null);
    await editQueue.enqueue({
      queryKey:queryKey(projectId),mutation:()=>removeDrawing(projectId,drawing.id),
      optimistic:(current:FloorPlansState)=>({...current,floors:current.floors.map((floor)=>floor.id===drawing.floor_id?{...floor,drawings:floor.drawings.filter((item)=>item.id!==drawing.id)}:floor)}),
      invalidations:[{queryKey:queryKey(projectId),refetchType:"active"}],
      errorMessage:"The drawing could not be removed.",
      onError:(message)=>setDrawingErrors((current)=>({...current,[drawing.floor_id]:message})),
    });
  }

  return (
    <WorkflowStepPage projectId={projectId} stepKey="floor-plans">
      <div className="space-y-6 p-5 sm:p-7">
        <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Project wall height</h3>
            <p className="mt-1 text-sm text-slate-500">Applied to every floor unless a floor override is set.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Default height</span>
              <input
                type="number"
                min={0.01}
                value={defaultHeight}
                onChange={(event) => setDefaultHeight(event.target.value)}
                onBlur={() => void saveSettings()}
                className="mt-2 h-11 w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
              />
            </label>
            <label>
              <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Unit</span>
              <select
                value={unit}
                onChange={(event) => {
                  const nextUnit = event.target.value;
                  if (state) setDefaultHeight(String(displayHeight(state.default_wall_height_mm, nextUnit)));
                  setUnit(nextUnit);
                }}
                onBlur={() => void saveSettings()}
                className="mt-2 h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
              </select>
            </label>
            <Button disabled={savingSettings} onClick={() => void saveSettings()}>{savingSettings ? "Saving" : "Save"}</Button>
          </div>
        </section>

        {stateQuery.isPending && !state ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading floor plans</div>
        ) : null}
        {stateQuery.error ? <ErrorMessage message={stateQuery.error.message} /> : null}
        {mutationError ? <ErrorMessage message={mutationError} /> : null}

        {state ? (
          <section className="space-y-4">
            {state.floors.map((floor) => (
              <FloorCard
                key={floor.id}
                floor={floor}
                documents={architecturalDocuments}
                defaultHeight={state.default_wall_height_mm}
                canRemove={state.floors.length > 1}
                drawingTypes={state.drawing_types}
                drawingError={drawingErrors[floor.id]}
                onEdit={() => setEditingFloorId(floor.id)}
                onEditDrawing={(drawing) => {
                  setDrawingErrors((current) => ({ ...current, [floor.id]: undefined }));
                  setEditingDrawingId(drawing.id);
                }}
                onAddDrawing={(type) => addDrawingSlot(floor.id, type)}
                onRemoveDrawing={(drawing) => void deleteDrawingSlot(drawing)}
                onRename={(name) => replaceState(
                  () => updateFloor(projectId, floor.id, { name }),
                  (current) => ({...current,floors:current.floors.map((item)=>item.id===floor.id?{...item,name}:item)}),
                ).then(() => undefined)}
                onHeightChange={(usesDefault, height) => replaceState(() => updateFloor(projectId, floor.id, {
                  uses_default_height: usesDefault,
                  wall_height_mm: height,
                }), (current) => ({...current,floors:current.floors.map((item)=>item.id===floor.id?{...item,uses_default_height:usesDefault,wall_height_mm:height,effective_wall_height_mm:usesDefault?current.default_wall_height_mm:Number(height||current.default_wall_height_mm)}:item)})).then(() => undefined)}
                onRemove={async () => {
                  if (!window.confirm(`Remove ${floor.name}?`)) return;
                  if (editingFloorId===floor.id) setEditingFloorId(null);
                  await replaceState(
                    () => removeFloor(projectId, floor.id),
                    (current) => ({...current,floors:current.floors.filter((item)=>item.id!==floor.id)}),
                  );
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => void replaceState(() => addFloor(projectId))}
              className="flex h-16 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
            >
              + Add Floor
            </button>
          </section>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href={appRoutes.workflowUpload(projectId)} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Back to Upload
          </Link>
          {state?.can_continue ? (
            <Link href={appRoutes.workflowStep(projectId, "specifications")} className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">
              Continue to Schedules & Specifications
            </Link>
          ) : (
            <span className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-5 text-sm font-semibold text-slate-400">
              Continue to Schedules & Specifications
            </span>
          )}
        </div>
      </div>

      {editingFloor && state ? (
        <CropWorkspace
          projectId={projectId}
          floor={editingFloor}
          documents={architecturalDocuments}
          onClose={() => setEditingFloorId(null)}
          onChanged={refresh}
          onSaved={(result) => handleCropSaved(editingFloor.id, result)}
        />
      ) : null}
      {editingDrawing && editingDrawingFloor && state ? <DrawingCropWorkspace projectId={projectId} floorName={editingDrawingFloor.name} drawing={editingDrawing} documents={state.documents} onClose={() => setEditingDrawingId(null)} onChanged={async () => { await stateQuery.refetch(); }} /> : null}
    </WorkflowStepPage>
  );
}

function displayHeight(mm: number, unit: string): number {
  if (unit === "cm") return round(mm / 10, 2);
  if (unit === "m") return round(mm / 1000, 3);
  if (unit === "in") return round(mm / 25.4, 2);
  if (unit === "ft") return round(mm / 304.8, 3);
  return round(mm, 1);
}

function toMillimetres(value: number, unit: string): number {
  if (unit === "cm") return value * 10;
  if (unit === "m") return value * 1000;
  if (unit === "in") return value * 25.4;
  if (unit === "ft") return value * 304.8;
  return value;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function drawingActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    const rawMessage = error.rawMessage?.trim();
    if (rawMessage && rawMessage.toLowerCase() !== "not found") return rawMessage;
    if (error.status === 404) {
      return "The drawing service is not available. Restart the updated backend and try again.";
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
