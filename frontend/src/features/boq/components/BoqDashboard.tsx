"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { listRateFiles, listRateItems } from "@/features/rate-files/api";
import type { RateItem } from "@/features/rate-files/types";
import { appRoutes } from "@/shared/constants/appRoutes";
import {
  addManualBoqRow,
  createBoqTemplatePackage,
  downloadBoqExport,
  duplicateBoqTemplatePackage,
  getBoqExports,
  refreshBoq,
  requestBoqExport,
  saveBoqSetup,
  selectBoqTemplate,
  updateBoqRow,
} from "../api";
import { useBoqJob } from "../hooks/useBoqJob";
import { useBoqState } from "../hooks/useBoqState";
import { getBoqRateMappings, saveBoqRateFileSelection, saveBoqRateMapping } from "../rateMappingApi";
import { applyRateToRow, matchBoqRow, sellRate } from "../rateMatching";
import type { BoqExport, BoqRow } from "../types";
import { BoqExportDrawer, type BoqExportMode } from "./BoqExportDrawer";
import { BoqManualItemDrawer, type ManualBoqItemForm } from "./BoqManualItemDrawer";
import { NRM2_INFORMATION_REQUIRED } from "../nrm2";
import { BoqReportTable } from "./BoqReportTable";
import { BoqSettingsDrawer } from "./BoqSettingsDrawer";
import { BoqShell } from "./BoqShell";
import { BoqTemplateCreateDialog } from "./BoqTemplateCreateDialog";
import { BoqToolbar } from "./BoqToolbar";

export type BoqPanel = "settings" | "exports" | null;

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function rowType(row: BoqRow): string {
  const value = String(row.entity_type || "").toLowerCase();
  if (["column","beam","slab","formwork"].includes(value)) return "structure";
  if (value.includes("door")) return "door";
  if (value.includes("window")) return "window";
  if (value === "wall_finish" || value === "wall_decoration") return "wall_finish";
  if (value === "floor_finish") return "floor_finish";
  if (value.startsWith("floor_work_") || value === "floor_screed" || value === "floor_skirting") return "floor_work";
  if (value.startsWith("roof_") || value === "rooflight" || value === "skylight") return "roof";
  if (value.startsWith("ceiling_")) return "ceiling";
  if (value.includes("wall")) return "wall";
  if (value.includes("floor") || value.includes("room")) return "floor";
  if (row.manual) return "manual";
  return value || "other";
}

function EmptyValue({ children }: { children: string }) {
  return <span className="font-medium text-slate-400">{children}</span>;
}

export function BoqDashboard({ projectId, initialPanel = null }: { projectId: string; initialPanel?: BoqPanel }) {
  const client = useQueryClient();
  const router = useRouter();
  const [floorId, setFloorId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [elementFilter, setElementFilter] = useState("all");
  const [panel, setPanel] = useState<BoqPanel>(initialPanel);
  const [manualOpen, setManualOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [ratePickerRow, setRatePickerRow] = useState<BoqRow | null>(null);
  const [ratePickerSearch, setRatePickerSearch] = useState("");
  const [selectedRateFileId, setSelectedRateFileId] = useState<string | null>(null);
  const grouping = "item";
  const query = useBoqState(projectId, floorId, grouping);
  const { run, saving, error, setError } = useBoqJob(projectId);
  const state = query.data;
  const rateFilesQuery = useQuery({ queryKey: ["rate-files", projectId], queryFn: () => listRateFiles(projectId) });
  const mappingsQuery = useQuery({ queryKey: ["boq-rate-mappings", projectId], queryFn: () => getBoqRateMappings(projectId) });
  const rateItemsQuery = useQuery({
    queryKey: ["rate-files", projectId, selectedRateFileId, "items", "boq"],
    queryFn: () => selectedRateFileId ? listRateItems(projectId, selectedRateFileId) : Promise.resolve([]),
    enabled: Boolean(selectedRateFileId),
  });
  const selectionMutation = useMutation({
    mutationFn: (rateFileId: string | null) => saveBoqRateFileSelection(projectId, rateFileId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["boq-rate-mappings", projectId] });
    },
  });
  const mappingMutation = useMutation({
    mutationFn: ({ rateFileId, row, item, score }: { rateFileId: string; row: BoqRow; item: RateItem; score: number }) => saveBoqRateMapping(projectId, rateFileId, {
      row_signature: matchBoqRow(row, [item]).rowSignature,
      rate_item_id: item.id,
      source: "manual",
      status: "applied",
      score,
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["boq-rate-mappings", projectId] });
    },
  });

  useEffect(() => setPanel(initialPanel), [initialPanel]);
  useEffect(() => {
    const persisted = mappingsQuery.data?.selection.rate_file_id || null;
    if (persisted !== selectedRateFileId) setSelectedRateFileId(persisted);
  }, [mappingsQuery.data?.selection.rate_file_id, selectedRateFileId]);

  const rateMatches = useMemo(() => {
    const items = rateItemsQuery.data || [];
    const remembered = mappingsQuery.data?.mappings || [];
    if (!state?.rows.length || !selectedRateFileId || !items.length) return {};
    return Object.fromEntries(state.rows.map((row) => [row.id, matchBoqRow(row, items, remembered)]));
  }, [mappingsQuery.data?.mappings, rateItemsQuery.data, selectedRateFileId, state?.rows]);

  const displayRows = useMemo(() => (state?.rows || []).map((row) => {
    const match = rateMatches[row.id];
    if (selectedRateFileId && match?.appliedItem) return { ...row, ...applyRateToRow(row, match.appliedItem) };
    return {
      ...row,
      rate: null,
      amount: null,
      missing_fields: row.missing_fields.includes("rate") ? row.missing_fields : [...row.missing_fields, "rate"],
    };
  }), [rateMatches, selectedRateFileId, state?.rows]);

  useEffect(() => {
    if (!state || !selectedRateFileId) return;
    const updates = state.rows
      .map((row) => ({ row, match: rateMatches[row.id] }))
      .filter(({ row, match }) => match?.status === "auto_applied" && match.appliedItem && row.rate !== sellRate(match.appliedItem));
    if (!updates.length) return;
    void Promise.all(updates.map(({ row, match }) => Promise.all([
      updateBoqRow(projectId, row.id, applyRateToRow(row, match!.appliedItem!)),
      saveBoqRateMapping(projectId, selectedRateFileId, {
        row_signature: match!.rowSignature,
        rate_item_id: match!.appliedItem!.id,
        source: "auto",
        status: "applied",
        score: match!.score,
      }),
    ])))
      .then(() => query.refetch())
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Auto rate matching could not be applied."));
  }, [projectId, query, rateMatches, selectedRateFileId, setError, state]);

  useEffect(() => {
    if (!state || selectedRateFileId) return;
    const pricedRows = state.rows.filter((row) => row.rate != null || row.amount != null);
    if (!pricedRows.length) return;
    void Promise.all(pricedRows.map((row) => updateBoqRow(projectId, row.id, { rate: null, amount: null })))
      .then(() => query.refetch())
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Old BOQ rates could not be cleared."));
  }, [projectId, query, selectedRateFileId, setError, state]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return displayRows.filter((row) => {
      if (elementFilter !== "all" && rowType(row) !== elementFilter) return false;
      if (!needle) return true;
      return [row.boq_item_number, row.item_code, row.section, row.description, ...row.floor_names, ...row.source_items.map((item) => item.display_number || item.type_code || "")]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [displayRows, elementFilter, search]);

  const summary = state?.summary || { rows: 0, ready: 0, needs_review: 0, manual: 0, doors: 0, windows: 0, walls: 0, floors: 0, wall_finishes: 0, floor_works: 0, roofs: 0, ceilings: 0 };
  const totalAmount = displayRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const selectedRateFileName = rateFilesQuery.data?.find((file) => file.id === selectedRateFileId)?.name || null;

  function closePanel() {
    setPanel(null);
    if (initialPanel) router.replace(appRoutes.workspaceBoq(projectId));
  }

  async function forceRefresh() {
    try {
      await run(() => refreshBoq(projectId, grouping, floorId));
      await query.refetch();
    } catch {
      // useBoqJob exposes the error in the page.
    }
  }

  async function waitForExport(exportRecord: BoqExport): Promise<BoqExport> {
    if (exportRecord.status === "ready" || exportRecord.status === "failed") return exportRecord;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1000);
      const result = await getBoqExports(projectId);
      const next = result.exports.find((item) => item.id === exportRecord.id);
      if (next?.status === "ready" || next?.status === "failed") return next;
    }
    return exportRecord;
  }

  async function createExport(format: "pdf" | "xlsx" | "csv" | "json", mode: BoqExportMode, selectedFloorId: string | null) {
    try {
      await run(async () => {
        const result = await requestBoqExport(projectId, format, mode, mode === "selected_floor" ? selectedFloorId : null) as { export: BoqExport };
        const completed = await waitForExport(result.export);
        await query.refetch();
        if (completed.status === "failed") throw new Error(completed.error_message || "The export could not be generated.");
        if (completed.status !== "ready") {
          setPanel("exports");
          return;
        }
        await downloadBoqExport(projectId, completed.id, completed.filename);
      });
    } catch {
      setPanel("exports");
    }
  }

  async function quickExport(format: "pdf" | "xlsx" | "csv" | "json") {
    const mode: BoqExportMode = floorId ? "selected_floor" : "combined";
    await createExport(format, mode, floorId);
  }

  async function downloadExisting(item: BoqExport) {
    try {
      await run(() => downloadBoqExport(projectId, item.id, item.filename));
    } catch {
      // useBoqJob displays the error.
    }
  }

  async function createTemplate(name: string, baseTemplateId: string | null) {
    await run(async () => {
      const created = baseTemplateId
        ? await duplicateBoqTemplatePackage(projectId, baseTemplateId, name)
        : await createBoqTemplatePackage(projectId, { name, description: "Custom BOQ template" });
      await selectBoqTemplate(projectId, created.id);
      await query.refetch();
      setTemplateDialogOpen(false);
      router.push(appRoutes.workspaceBoqTemplates(projectId));
    });
  }

  return (
    <BoqShell projectId={projectId}>
      <BoqToolbar
        title={state?.setup.boq_title || "Bill of Quantities"}
        status={state?.stale || state?.active_jobs.length ? "updating" : "ready"}
        templateId={state?.template.id || ""}
        templates={state?.templates || []}
        saving={saving}
        stale={Boolean(state?.stale)}
        onTemplateChange={(templateId) => void run(async () => { await selectBoqTemplate(projectId, templateId); await query.refetch(); }).catch(() => undefined)}
        onAddTemplate={() => { setError(null); setTemplateDialogOpen(true); }}
        onManageTemplates={() => router.push(appRoutes.workspaceBoqTemplates(projectId))}
        onRefresh={() => void forceRefresh()}
        onDownload={(format) => void quickExport(format)}
        onExportHistory={() => { setError(null); setPanel("exports"); }}
        onSettings={() => { setError(null); setPanel("settings"); }}
      />

      <div className="space-y-5 bg-slate-50 p-5 lg:p-6">
        {error ? <ErrorMessage message={error} /> : null}
        {state?.production_error ? <ErrorMessage message={`Production takeoff quantities could not be refreshed. Existing BOQ rows were preserved. ${state.production_error}`} /> : null}

        <main className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">BOQ items</h3>
              </div>
              <p className="text-sm text-slate-600">Estimated total <strong className="ml-1 text-base text-slate-950">{state?.setup.currency || "Rs"} {totalAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></p>
              <div className="flex gap-2"><Button variant="secondary" onClick={() => { setError(null); setManualOpen(true); }}>Add item</Button></div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_190px_220px]">
              <input className="input" placeholder="Search BOQ" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select className="input" value={floorId || ""} onChange={(event) => setFloorId(event.target.value || null)}>
                <option value="">All floors</option>
                {state?.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
              </select>
              <select className="input" value={elementFilter} onChange={(event) => setElementFilter(event.target.value)}>
                <option value="all">All elements</option>
                <option value="structure">Concrete and formwork</option>
                <option value="door">Doors ({summary.doors})</option>
                <option value="window">Windows ({summary.windows})</option>
                <option value="wall">Walls ({summary.walls})</option>
                <option value="wall_finish">Wall finishes ({summary.wall_finishes || 0})</option>
                <option value="floor_finish">Floor finishes ({summary.floors})</option>
                <option value="floor_work">Floor works ({summary.floor_works || 0})</option>
                <option value="roof">Roofs ({summary.roofs || 0})</option>
                <option value="ceiling">Ceilings ({summary.ceilings || 0})</option>
                <option value="manual">Manual ({summary.manual})</option>
              </select>
              <select
                className="input"
                value={selectedRateFileId || ""}
                onChange={(event) => {
                  const next = event.target.value || null;
                  setSelectedRateFileId(next);
                  void selectionMutation.mutateAsync(next).catch((cause) => setError(cause instanceof Error ? cause.message : "Rate file selection could not be saved."));
                }}
              >
                <option value="">No rate file</option>
                {(rateFilesQuery.data || []).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
            </div>
          </div>

          <BoqReportTable
            rows={rows}
            showRates={Boolean(state?.setup.include_rates)}
            showAmounts={Boolean(state?.setup.include_amounts)}
            onPickRate={(row) => {
              setError(null);
              setRatePickerSearch("");
              setRatePickerRow(row);
            }}
          />
        </main>

        <details className="rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-900">Information required for unmeasured NRM2 work ({NRM2_INFORMATION_REQUIRED.length})</summary>
          <div className="border-t border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Section</th><th className="px-5 py-3">Work item</th><th className="px-5 py-3">Reason not priced</th></tr></thead><tbody>{NRM2_INFORMATION_REQUIRED.map(item=><tr key={item.item} className="border-t border-slate-200"><td className="px-5 py-3 font-medium">{item.section}</td><td className="px-5 py-3">{item.item}</td><td className="px-5 py-3 text-slate-600">{item.reason}</td></tr>)}</tbody></table></div>
        </details>

        <div className="flex items-center justify-start rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <Link className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={appRoutes.workflowStep(projectId, "review")}>Back to Review</Link>
        </div>
      </div>

      <BoqTemplateCreateDialog
        open={templateDialogOpen}
        templates={state?.templates || []}
        defaultTemplateId={state?.template.id || ""}
        saving={saving}
        onClose={() => setTemplateDialogOpen(false)}
        onCreate={createTemplate}
      />
      <BoqSettingsDrawer
        open={panel === "settings"}
        setup={state?.setup || null}
        saving={saving}
        error={error}
        onClose={closePanel}
        onSave={async (setup) => {
          await run(async () => { await saveBoqSetup(projectId, setup); await query.refetch(); });
          closePanel();
        }}
      />
      <BoqExportDrawer
        open={panel === "exports"}
        floors={state?.floors || []}
        exports={state?.exports || []}
        stale={Boolean(state?.stale)}
        saving={saving}
        error={error}
        onClose={closePanel}
        onCreate={createExport}
        onDownload={downloadExisting}
      />
      <BoqManualItemDrawer
        open={manualOpen}
        saving={saving}
        error={error}
        onClose={() => setManualOpen(false)}
        onAdd={async (form: ManualBoqItemForm) => {
          await run(async () => {
            await addManualBoqRow(projectId, {
              description: form.description.trim(),
              section: form.section.trim() || "Other items",
              item_code: form.item_code.trim() || null,
              quantity: form.quantity,
              unit: form.unit.trim(),
              rate: form.rate === "" ? null : Number(form.rate),
              floor_id: floorId,
            });
            await query.refetch();
          });
          setManualOpen(false);
        }}
      />
      <BoqRatePickerDialog
        open={Boolean(ratePickerRow)}
        row={ratePickerRow}
        rateFileName={selectedRateFileName}
        items={selectedRateFileId ? rateItemsQuery.data || [] : []}
        search={ratePickerSearch}
        currency={state?.setup.currency || "Rs"}
        saving={saving || mappingMutation.isPending}
        onSearch={setRatePickerSearch}
        onClose={() => setRatePickerRow(null)}
        onSelect={async (item) => {
          if (!ratePickerRow || !selectedRateFileId) return;
          await run(async () => {
            await updateBoqRow(projectId, ratePickerRow.id, applyRateToRow(ratePickerRow, item));
            await mappingMutation.mutateAsync({ rateFileId: selectedRateFileId, row: ratePickerRow, item, score: 100 });
            await query.refetch();
          });
          setRatePickerRow(null);
        }}
      />
    </BoqShell>
  );
}

function BoqRatePickerDialog({
  open,
  row,
  rateFileName,
  items,
  search,
  currency,
  saving,
  onSearch,
  onClose,
  onSelect,
}: {
  open: boolean;
  row: BoqRow | null;
  rateFileName: string | null;
  items: RateItem[];
  search: string;
  currency: string;
  saving: boolean;
  onSearch: (value: string) => void;
  onClose: () => void;
  onSelect: (item: RateItem) => Promise<void>;
}) {
  if (!open || !row) return null;
  const needle = search.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (!needle) return true;
    return [item.material_name, item.specification, item.size, item.unit_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  return (
    <ModalDialog
      open={open}
      title="Select BOQ rate"
      description={row.description}
      ariaLabel="Select BOQ rate"
      maxWidth="max-w-5xl"
      onClose={onClose}
      footer={<Button variant="secondary" disabled={saving} onClick={onClose}>Close</Button>}
    >
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
        <span className="font-semibold text-blue-950">Rate file</span>
        <span className="ml-2 text-blue-800">{rateFileName || "No rate file selected"}</span>
      </div>
      <div className="mb-4">
        <input className="input w-full" placeholder="Search material, specification, size, unit" value={search} onChange={(event) => onSearch(event.target.value)} />
      </div>
      {!rateFileName ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Select a rate file above the BOQ table first.</div>
      ) : (
        <div className="max-h-[52vh] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Material</th>
                <th className="px-5 py-3">Specification</th>
                <th className="px-5 py-3">Size(mm)</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3 text-right">Rate</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const rate = sellRate(item);
                return (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-5 py-3 font-semibold text-slate-900">{item.material_name}</td>
                    <td className="px-5 py-3 text-slate-600">{item.specification || <EmptyValue>No specification</EmptyValue>}</td>
                    <td className="px-5 py-3 text-slate-600">{item.size || <EmptyValue>No size</EmptyValue>}</td>
                    <td className="px-5 py-3 text-slate-600">{item.unit_type || <EmptyValue>No unit</EmptyValue>}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-950">{currency} {rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3 text-right">
                      <Button disabled={saving} onClick={() => void onSelect(item)}>{saving ? "Saving..." : "Apply"}</Button>
                    </td>
                  </tr>
                );
              })}
              {!filteredItems.length ? (
                <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={6}>No rates found in this rate file.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </ModalDialog>
  );
}
