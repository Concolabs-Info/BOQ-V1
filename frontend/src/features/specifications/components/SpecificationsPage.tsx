"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowStepPage } from "@/features/workflow/components/WorkflowStepPage";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { appRoutes } from "@/shared/constants/appRoutes";
import {
  cacheSpecifications,
  createSpecificationCrop,
  getCachedSpecifications,
  getSpecifications,
  removeSource,
  setCategorySkipped,
  updateSourceScope,
  uploadSpecificationSource,
} from "../api";
import type {
  CropSourcePayload,
  ScopeMode,
  SpecificationCategory,
  SpecificationCategoryKey,
  SpecificationsState,
} from "../types";
import { DocumentCropModal } from "./DocumentCropModal";
import { FloorScopeControl } from "./FloorScopeControl";
import { SourceCard } from "./SourceCard";
import { StatusPill } from "./StatusPill";
import { useOptimisticMutationQueue } from "@/shared/hooks/useOptimisticMutationQueue";

const queryKey = (projectId: string) => ["specifications", projectId] as const;

export function SpecificationsPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeKey, setActiveKey] = useState<SpecificationCategoryKey>("door_schedule");
  const [cropCategory, setCropCategory] = useState<SpecificationCategoryKey | null>(null);
  const [pendingReplaceId, setPendingReplaceId] = useState<string | undefined>();
  const [newScopeMode, setNewScopeMode] = useState<ScopeMode>("all");
  const [newFloorIds, setNewFloorIds] = useState<string[]>([]);
  const [newDrawingTypes, setNewDrawingTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const editQueue = useOptimisticMutationQueue();

  const stateQuery = useQuery({
    queryKey: queryKey(projectId),
    queryFn: () => getSpecifications(projectId),
    refetchInterval: (query) => {
      const state = query.state.data;
      return state?.categories.some((category) => category.sources.some((source) => source.active_job)) ? 2_000 : false;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const state = stateQuery.data;

  useEffect(() => {
    const key = queryKey(projectId);
    if (queryClient.getQueryData(key) !== undefined) return;
    const cached = getCachedSpecifications(projectId);
    if (cached) queryClient.setQueryData(key, cached);
  }, [projectId, queryClient]);

  const activeCategory = state?.categories.find((category) => category.key === activeKey) || state?.categories[0] || null;

  useEffect(() => {
    setNewDrawingTypes(activeCategory?.default_drawing_types || []);
  }, [activeCategory?.key]);

  function replaceState(next: SpecificationsState) {
    queryClient.setQueryData(queryKey(projectId), next);
    cacheSpecifications(projectId, next);
  }

  async function run(action: () => Promise<SpecificationsState>, optimistic?: (state: SpecificationsState) => SpecificationsState): Promise<boolean> {
    if (optimistic) {
      setActionError(null);
      const result=await editQueue.enqueue({
        queryKey:queryKey(projectId),mutation:action,optimistic,
        invalidations:[
          {queryKey:queryKey(projectId),refetchType:"active"},
          {queryKey:["workflow",projectId,"summary"],refetchType:"none"},
        ],
        errorMessage:"This action could not be completed.",onError:setActionError,
      });
      return Boolean(result);
    }
    setBusy(true);
    setActionError(null);
    try {
      const next = await action();
      replaceState(next);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "This action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[], replaceSourceId?: string) {
    const list = Array.from(files);
    if (!list.length || !activeCategory) return;
    setBusy(true);
    setActionError(null);
    try {
      let latest = state;
      const replacement = state?.categories.flatMap((category) => category.sources).find((source) => source.id === replaceSourceId);
      for (let index = 0; index < list.length; index += 1) {
        setUploadProgress(Math.round((index / list.length) * 100));
        latest = await uploadSpecificationSource(
          projectId,
          {
            category: activeCategory.key,
            file: list[index],
            scopeMode: replacement?.scope_mode || newScopeMode,
            floorIds: replacement?.floor_ids || newFloorIds,
            drawingTypes: replacement?.drawing_types || newDrawingTypes,
            replaceSourceId: index === 0 ? replaceSourceId : undefined,
          },
          (percent) => setUploadProgress(Math.round(((index + percent / 100) / list.length) * 100))
        );
        replaceState(latest);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The file could not be uploaded.");
    } finally {
      setUploadProgress(0);
      setBusy(false);
      setPendingReplaceId(undefined);
    }
  }

  return (
    <WorkflowStepPage projectId={projectId} stepKey="specifications">
      <div className="min-h-[650px]">
        <input
          ref={fileInputRef}
          type="file"
          multiple={!pendingReplaceId}
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.xls,.csv,.txt"
          className="hidden"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (event.target.files) void uploadFiles(event.target.files, pendingReplaceId);
            event.target.value = "";
          }}
        />

        <div className="grid min-h-[650px] lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Documents</p>
            <div className="mt-3 space-y-2">
              {(state?.categories || []).map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveKey(category.key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${category.key === activeKey ? "border-blue-200 bg-blue-50" : "border-transparent bg-white hover:border-slate-200"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">{category.label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{category.sources.length} file{category.sources.length === 1 ? "" : "s"}</span>
                  </span>
                  <StatusPill status={category.status} />
                </button>
              ))}
            </div>
          </aside>

          <main className="p-5 sm:p-7">
            {stateQuery.isPending && !state ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading documents</div> : null}
            {stateQuery.error ? <ErrorMessage message={stateQuery.error.message} /> : null}
            {actionError ? <div className="mb-4"><ErrorMessage message={actionError} /></div> : null}
            {activeCategory && state ? (
              <CategoryWorkspace
                category={activeCategory}
                state={state}
                busy={busy}
                uploadProgress={uploadProgress}
                scopeMode={newScopeMode}
                floorIds={newFloorIds}
                onScopeChange={(mode, ids) => { setNewScopeMode(mode); setNewFloorIds(ids); }}
                onAddFile={() => { setPendingReplaceId(undefined); fileInputRef.current?.click(); }}
                onCrop={() => setCropCategory(activeCategory.key)}
                onSkip={() => {
                  const skipped=activeCategory.status!=="skipped";
                  void run(
                    () => setCategorySkipped(projectId, activeCategory.key, skipped),
                    (current) => ({...current,categories:current.categories.map((category)=>category.key===activeCategory.key?{...category,status:skipped?"skipped":category.sources.length?"processing":"needs_review"}:category)}),
                  );
                }}
                onReplace={(sourceId, file) => void uploadFiles([file], sourceId)}
                onRemove={(sourceId) => {
                  if (!window.confirm("Remove this supporting file?")) return;
                  void run(
                    () => removeSource(projectId, sourceId),
                    (current) => ({...current,categories:current.categories.map((category)=>({...category,sources:category.sources.filter((source)=>source.id!==sourceId)}))}),
                  );
                }}
                onSourceScope={(sourceId, mode, ids, types) => run(
                  () => updateSourceScope(projectId, sourceId, mode, ids, types),
                  (current) => ({...current,categories:current.categories.map((category)=>({...category,sources:category.sources.map((source)=>source.id===sourceId?{...source,scope_mode:mode,floor_ids:ids,drawing_types:types}:source)}))}),
                )}
              />
            ) : null}

            <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Link href={appRoutes.workflowStep(projectId, "floor-plans")} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Back to Floor Plans
              </Link>
              <Link href={appRoutes.workflowStep(projectId, "scale")} className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">
                Continue to Scale
              </Link>
            </div>
          </main>
        </div>
      </div>

      {cropCategory && state ? (
        <DocumentCropModal
          category={cropCategory}
          documents={state.documents}
          floors={state.floors}
          defaultDrawingTypes={state.categories.find((item) => item.key === cropCategory)?.default_drawing_types || []}
          onClose={() => setCropCategory(null)}
          onSave={async (payload: CropSourcePayload) => {
            const saved = await run(async () => (await createSpecificationCrop(projectId, payload)).state);
            if (!saved) throw new Error("The crop could not be saved.");
          }}
        />
      ) : null}
    </WorkflowStepPage>
  );
}

function CategoryWorkspace({
  category,
  state,
  busy,
  uploadProgress,
  scopeMode,
  floorIds,
  onScopeChange,
  onAddFile,
  onCrop,
  onSkip,
  onReplace,
  onRemove,
  onSourceScope,
}: {
  category: SpecificationCategory;
  state: SpecificationsState;
  busy: boolean;
  uploadProgress: number;
  scopeMode: ScopeMode;
  floorIds: string[];
  onScopeChange: (mode: ScopeMode, ids: string[]) => void;
  onAddFile: () => void;
  onCrop: () => void;
  onSkip: () => void;
  onReplace: (sourceId: string, file: File) => void;
  onRemove: (sourceId: string) => void;
  onSourceScope: (sourceId: string, mode: ScopeMode, ids: string[], drawingTypes: string[]) => Promise<boolean>;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold tracking-tight text-slate-950">{category.label}</h3>
            <StatusPill status={category.status} />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{category.description}</p>
        </div>
        <span className="text-sm font-medium text-slate-500">{category.entry_count ? `${category.entry_count} extracted items` : "Optional"}</span>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <FloorScopeControl floors={state.floors} scopeMode={scopeMode} floorIds={floorIds} disabled={busy} onChange={onScopeChange} />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button type="button" disabled={busy} onClick={onAddFile} className="min-h-16 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300">
            Add file
          </button>
          <button type="button" disabled={busy || !state.documents.some((document) => document.pages.length)} onClick={onCrop} className="min-h-16 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50">
            Crop from project PDF
          </button>
          <button type="button" disabled={busy} onClick={onSkip} className="min-h-16 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {category.status === "skipped" ? "Use this category" : "Skip"}
          </button>
        </div>
        {uploadProgress ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-700"><span>Uploading</span><span>{uploadProgress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${uploadProgress}%` }} /></div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        {category.sources.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            floors={state.floors}
            busy={busy}
            onReplace={(file) => onReplace(source.id, file)}
            onRemove={() => onRemove(source.id)}
            onScopeChange={(mode, ids, types) => onSourceScope(source.id, mode, ids, types)}
          />
        ))}
        {!category.sources.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-900">No files added</p>
            <p className="mt-2 text-sm text-slate-500">Add a file, crop the project PDF, or skip this category.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
