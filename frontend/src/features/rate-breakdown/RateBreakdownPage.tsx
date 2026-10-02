"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { useNormItems } from "@/features/norms/hooks";
import type { NormComposition, NormItemType } from "@/features/norms/types";
import { NORM_ITEM_TYPE_LABELS } from "@/features/norms/types";
import { rateFileKeys, useRateFiles, useRateItems } from "@/features/rate-files/hooks";
import type { RateItem } from "@/features/rate-files/types";
import { useRateBreakdownItems, useRateBreakdownMutations } from "./hooks";
import type { RateBreakdownItem, RateBreakdownItemInput, RateBreakdownRowInput } from "./types";

type DraftRow = RateBreakdownRowInput & {
  draft_id: string;
  selected_rate_label: string | null;
  selected_rate: number | null;
  amount: number | null;
};

type Draft = {
  id: string | null;
  norm_group_id: string;
  rate_file_id: string;
  main_item_name: string;
  analysis_quantity: number;
  analysis_unit: string;
  rows: DraftRow[];
};

const RATE_TYPE_BY_NORM_TYPE: Record<NormItemType, RateItem["item_type"]> = {
  material: "material",
  labor: "labour",
  machinery: "machinery",
  percentage: "percentage",
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function matchTokens(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/labour/g, "labor")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function tokensOverlap(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = matchTokens(left);
  const rightTokens = matchTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;
  return leftTokens.some((leftToken) => rightTokens.some((rightToken) => (
    leftToken === rightToken
    || (leftToken.length >= 4 && rightToken.startsWith(leftToken))
    || (rightToken.length >= 4 && leftToken.startsWith(rightToken))
  )));
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRateValue(itemType: NormItemType, value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return itemType === "percentage" ? "No percentage" : "No rate";
  if (itemType === "percentage") return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
  return `Rs ${formatMoney(value)}`;
}

function rateName(item: RateItem) {
  if (item.item_type === "material") return item.material_name || "";
  if (item.item_type === "labour") return item.labour_name || "";
  if (item.item_type === "machinery") return item.machinery_name || "";
  return item.percentage_name || "";
}

function rateLabel(item: RateItem) {
  const details: string[] = [];
  if (item.item_type === "material") {
    details.push(...[item.supplier, item.brand].filter(Boolean) as string[]);
    details.push(...(item.material_attributes || []).map((attribute) => `${attribute.attribute}: ${attribute.value}`));
  } else if (item.item_type === "labour") {
    if (item.labour_group) details.push(item.labour_group);
  } else if (item.item_type === "machinery") {
    details.push(...[item.machinery_source, item.machinery_location].filter(Boolean) as string[]);
  } else if (item.item_type === "percentage" && item.percentage != null) {
    details.push(`${item.percentage}%`);
  }
  const unit = [item.unit_type, item.unit_detail].filter(Boolean).join(" ");
  if (unit) details.push(unit);
  return `${rateName(item)}${details.length ? ` (${details.join(" · ")})` : ""}${item.rate == null ? "" : ` - Rs ${formatMoney(item.rate)}`}`;
}

function rateDetailLabel(item: RateItem) {
  return rateLabel(item).replace(/\s-\sRs\s[\d,.]+$/, "");
}

function rateValue(item: RateItem) {
  return item.item_type === "percentage" ? item.percentage : item.rate;
}

function rateSearchText(item: RateItem, itemType: NormItemType) {
  return normalizeText([
    rateName(item),
    rateLabel(item),
    rateDetailLabel(item),
    formatRateValue(itemType, rateValue(item)),
  ].join(" "));
}

function matchingRates(row: DraftRow, rates: RateItem[]) {
  const rateType = RATE_TYPE_BY_NORM_TYPE[row.item_type];
  return rates.filter((rate) => rate.item_type === rateType && tokensOverlap(row.description, rateName(rate)));
}

function calculateRows(rows: DraftRow[], rates: RateItem[]) {
  let subtotal = 0;
  return rows.map((row) => {
    const selected = row.rate_item_id ? rates.find((rate) => rate.id === row.rate_item_id) || null : null;
    const selectedValue = selected ? rateValue(selected) : null;
    const selectedRate = row.selected_rate != null ? row.selected_rate : selectedValue != null ? Number(selectedValue) : null;
    let selectedLabel = row.selected_rate_label || (selected ? rateLabel(selected) : null);
    let amount: number | null = null;
    if (row.item_type === "percentage") {
      if (selectedRate != null) {
        amount = Number((subtotal * (selectedRate / 100)).toFixed(2));
        subtotal += amount;
      }
    } else if (selectedRate != null) {
      amount = Number((row.quantity * selectedRate).toFixed(2));
      subtotal += amount;
    }
    return { ...row, selected_rate: selectedRate, selected_rate_label: selectedLabel, amount };
  });
}

function summaryFor(rows: DraftRow[], analysisQuantity: number, analysisUnit: string) {
  const total = Number(rows.reduce((sum, row) => sum + (row.amount || 0), 0).toFixed(2));
  const rateForUnit = Number((total / (analysisQuantity || 1)).toFixed(2));
  const ft3 = Number((rateForUnit / 100).toFixed(2));
  return {
    total,
    rate_for_unit: rateForUnit,
    rate_say_unit: rateForUnit,
    rate_say_ft3: ft3,
    rate_say_m3: Number((ft3 * 35.3147).toFixed(2)),
    analysis_quantity: analysisQuantity,
    analysis_unit: analysisUnit,
  };
}

function draftFromNorm(norm: NormComposition, rateFileId: string): Draft {
  return {
    id: null,
    norm_group_id: norm.id,
    rate_file_id: rateFileId,
    main_item_name: norm.main_item_name,
    analysis_quantity: 1,
    analysis_unit: "cube",
    rows: norm.items.map((item, index) => ({
      draft_id: item.id,
      item_type: item.item_type,
      description: item.name,
      unit: item.unit,
      quantity: item.quantity,
      rate_item_id: null,
      selected_rate_label: null,
      selected_rate: null,
      amount: null,
      sort_order: index,
    })),
  };
}

function draftFromSaved(item: RateBreakdownItem, fallbackRateFileId: string): Draft {
  return {
    id: item.id,
    norm_group_id: item.norm_group_id || "",
    rate_file_id: item.rate_file_id || fallbackRateFileId,
    main_item_name: item.main_item_name,
    analysis_quantity: item.analysis_quantity || 1,
    analysis_unit: item.analysis_unit || "cube",
    rows: item.rows.map((row) => ({
      draft_id: row.id,
      item_type: row.item_type,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rate_item_id: row.rate_item_id,
      selected_rate_label: row.selected_rate_label,
      selected_rate: row.selected_rate,
      amount: row.amount,
      sort_order: row.sort_order,
    })),
  };
}

function toPayload(draft: Draft): RateBreakdownItemInput {
  return {
    norm_group_id: draft.norm_group_id,
    rate_file_id: draft.rate_file_id,
    main_item_name: draft.main_item_name,
    analysis_quantity: 1,
    analysis_unit: "cube",
    rows: draft.rows.map((row, index) => ({
      item_type: row.item_type,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rate_item_id: row.rate_item_id,
      selected_rate_label: row.selected_rate_label,
      selected_rate: row.selected_rate,
      sort_order: index,
    })),
  };
}

export function RateBreakdownPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const breakdownQuery = useRateBreakdownItems(projectId);
  const normQuery = useNormItems(projectId);
  const rateFilesQuery = useRateFiles(projectId);
  const mutations = useRateBreakdownMutations(projectId);
  const [selectedRateFileId, setSelectedRateFileId] = useState<string | null>(null);
  const rateItemsQuery = useRateItems(projectId, selectedRateFileId, "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteItem, setDeleteItem] = useState<RateBreakdownItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = mutations.createItem.isPending || mutations.updateItem.isPending || mutations.deleteItem.isPending;

  useEffect(() => {
    if (!selectedRateFileId && rateFilesQuery.data?.length) setSelectedRateFileId(rateFilesQuery.data[0].id);
  }, [rateFilesQuery.data, selectedRateFileId]);

  const calculatedDraft = useMemo(() => {
    if (!draft) return null;
    return { ...draft, rows: calculateRows(draft.rows, rateItemsQuery.data || []) };
  }, [draft, rateItemsQuery.data]);

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This action could not be completed.");
    }
  }

  function selectNorm(norm: NormComposition) {
    if (!selectedRateFileId) {
      setError("Select a rate file first.");
      return;
    }
    setDraft(draftFromNorm(norm, selectedRateFileId));
    setPickerOpen(false);
  }

  function changeRateFile(rateFileId: string) {
    setSelectedRateFileId(rateFileId || null);
    setDraft((current) => current ? {
      ...current,
      rate_file_id: rateFileId,
      rows: current.rows.map((row) => ({ ...row, rate_item_id: null, selected_rate: null, selected_rate_label: null, amount: null })),
    } : current);
  }

  function updateDraftRate(rowId: string, rateItemId: string) {
    setDraft((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.draft_id === rowId ? { ...row, rate_item_id: rateItemId || null, selected_rate: null, selected_rate_label: null, amount: null } : row),
    } : current);
  }

  function updateDraftManualRate(rowId: string, rate: number, note: string) {
    setDraft((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.draft_id === rowId ? { ...row, rate_item_id: null, selected_rate: rate, selected_rate_label: note.trim() || (row.item_type === "percentage" ? "Manual percentage" : "Manual rate"), amount: null } : row),
    } : current);
  }

  function editSaved(item: RateBreakdownItem) {
    const rateFileId = item.rate_file_id || selectedRateFileId || "";
    if (rateFileId) setSelectedRateFileId(rateFileId);
    setDraft(draftFromSaved(item, rateFileId));
  }

  async function saveDraft() {
    if (!calculatedDraft) return;
    if (!calculatedDraft.norm_group_id) {
      setError("This saved breakdown is missing its Norm source.");
      return;
    }
    await run(async () => {
      const payload = toPayload(calculatedDraft);
      if (calculatedDraft.id) await mutations.updateItem.mutateAsync({ id: calculatedDraft.id, payload });
      else await mutations.createItem.mutateAsync(payload);
      await queryClient.invalidateQueries({ queryKey: rateFileKeys.all(projectId) });
      await queryClient.invalidateQueries({ queryKey: rateFileKeys.items(projectId, calculatedDraft.rate_file_id, "") });
      setDraft(null);
    });
  }

  return (
    <PlatformShell title="Rate Breakdown" eyebrow="Project production">
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Rate breakdown analysis</h2>
            <p className="mt-1 text-sm text-slate-500">Load a Norm main item and price each row from the selected Rate File.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rate file</span>
              <select className="input mt-1 min-w-56" value={selectedRateFileId || ""} onChange={(event) => changeRateFile(event.target.value)}>
                <option value="">Select rate file</option>
                {(rateFilesQuery.data || []).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
            </label>
            <Button disabled={!selectedRateFileId} onClick={() => setPickerOpen(true)}>+ Add</Button>
          </div>
        </header>

        {error || breakdownQuery.error || normQuery.error || rateFilesQuery.error || rateItemsQuery.error ? (
          <p className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "Rate breakdown data could not be loaded."}</p>
        ) : null}

        {calculatedDraft ? (
          <AnalysisEditor
            draft={calculatedDraft}
            rates={rateItemsQuery.data || []}
            saving={saving}
            onRateChange={updateDraftRate}
            onManualRate={updateDraftManualRate}
            onCancel={() => setDraft(null)}
            onSave={() => void saveDraft()}
          />
        ) : (
          <SavedBreakdowns
            items={breakdownQuery.data || []}
            loading={breakdownQuery.isLoading}
            onEdit={editSaved}
            onDelete={setDeleteItem}
          />
        )}
      </section>

      <ModalDialog
        open={pickerOpen}
        title="Add rate breakdown"
        description="Choose a Norm main item to load its rows into the analysis table."
        ariaLabel="Select norm main item"
        onClose={() => setPickerOpen(false)}
        footer={<Button variant="secondary" onClick={() => setPickerOpen(false)}>Cancel</Button>}
      >
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {normQuery.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading Norm main items...</p> : null}
          {(normQuery.data || []).map((norm) => (
            <button key={norm.id} type="button" className="block w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50" onClick={() => selectNorm(norm)}>
              <span className="font-semibold text-slate-950">{norm.main_item_name}</span>
              <span className="mt-1 block text-sm text-slate-500">{norm.items.length} row{norm.items.length === 1 ? "" : "s"}</span>
            </button>
          ))}
          {!normQuery.isLoading && !normQuery.data?.length ? <p className="py-6 text-center text-sm text-slate-500">No Norm main items yet.</p> : null}
        </div>
      </ModalDialog>

      <ModalDialog
        open={Boolean(deleteItem)}
        title="Delete rate breakdown"
        description="This removes the saved analysis from this project."
        ariaLabel="Delete rate breakdown"
        onClose={() => setDeleteItem(null)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="danger" disabled={saving} onClick={() => void run(async () => { if (deleteItem) await mutations.deleteItem.mutateAsync(deleteItem.id); setDeleteItem(null); })}>{saving ? "Deleting..." : "Delete"}</Button>
          </>
        )}
      >
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-950">{deleteItem?.main_item_name || "Rate breakdown"}</p>
      </ModalDialog>
    </PlatformShell>
  );
}

function AnalysisEditor({
  draft,
  rates,
  saving,
  onRateChange,
  onManualRate,
  onCancel,
  onSave,
}: {
  draft: Draft;
  rates: RateItem[];
  saving: boolean;
  onRateChange: (rowId: string, rateItemId: string) => void;
  onManualRate: (rowId: string, rate: number, note: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const summary = summaryFor(draft.rows, draft.analysis_quantity, draft.analysis_unit);
  const [manualRate, setManualRate] = useState<{ rowId: string; rate: string; note: string } | null>(null);
  const [manualRateError, setManualRateError] = useState<string | null>(null);

  function openManualRate(row: DraftRow) {
    setManualRate({
      rowId: row.draft_id,
      rate: row.selected_rate == null ? "" : String(row.selected_rate),
      note: row.rate_item_id ? "" : row.selected_rate_label || "",
    });
    setManualRateError(null);
  }

  function saveManualRate() {
    if (!manualRate) return;
    const row = draft.rows.find((item) => item.draft_id === manualRate.rowId);
    const isPercentage = row?.item_type === "percentage";
    if (!manualRate.rate.trim()) {
      setManualRateError(`Enter a non-negative ${isPercentage ? "percentage" : "rate"}.`);
      return;
    }
    const rate = Number(manualRate.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      setManualRateError(`Enter a non-negative ${isPercentage ? "percentage" : "rate"}.`);
      return;
    }
    onManualRate(manualRate.rowId, rate, manualRate.note);
    setManualRate(null);
    setManualRateError(null);
  }

  const manualRow = manualRate ? draft.rows.find((row) => row.draft_id === manualRate.rowId) || null : null;
  const manualIsPercentage = manualRow?.item_type === "percentage";

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Analysis for 1 cube</p>
          <h3 className="text-lg font-semibold text-slate-950">{draft.main_item_name}</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancel</Button>
          <Button disabled={saving} onClick={onSave}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-sky-100 text-xs uppercase text-slate-700">
            <tr>
              <th className="w-16 px-4 py-3 text-center">No</th>
              <th className="px-4 py-3">Item Description</th>
              <th className="w-32 px-4 py-3">Unit</th>
              <th className="w-32 px-4 py-3 text-right">Quantity</th>
              <th className="w-72 px-4 py-3">Rate</th>
              <th className="w-40 px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, index) => {
              const options = matchingRates(row, rates);
              return (
                <tr key={row.draft_id} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-center font-semibold text-slate-700">{index + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-950">{row.description}</span>
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{NORM_ITEM_TYPE_LABELS[row.item_type]}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.unit || ""}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <RatePicker row={row} options={options} onChange={(rateItemId) => onRateChange(row.draft_id, rateItemId)} onManual={() => openManualRate(row)} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950">{row.amount == null ? <span className="text-slate-400">Not priced</span> : formatMoney(row.amount)}</td>
                </tr>
              );
            })}
            <SummaryRows summary={summary} />
          </tbody>
        </table>
      </div>
      <ModalDialog
        open={Boolean(manualRate)}
        title={manualIsPercentage ? "Manual percentage" : "Manual rate"}
        description={manualIsPercentage ? "Enter a one-off percentage for this breakdown row." : "Enter a one-off rate for this breakdown row."}
        ariaLabel={manualIsPercentage ? "Manual percentage" : "Manual rate"}
        onClose={() => setManualRate(null)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setManualRate(null)}>Cancel</Button>
            <Button onClick={saveManualRate}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          {manualRateError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manualRateError}</p> : null}
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">{manualIsPercentage ? "Percentage" : "Rate"}</span>
            <input
              className="input mt-1 w-full"
              type="number"
              min="0"
              step="0.01"
              value={manualRate?.rate || ""}
              onChange={(event) => setManualRate((current) => current ? { ...current, rate: event.target.value } : current)}
              placeholder={manualIsPercentage ? "2.5" : "0.00"}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Note</span>
            <input
              className="input mt-1 w-full"
              value={manualRate?.note || ""}
              onChange={(event) => setManualRate((current) => current ? { ...current, note: event.target.value } : current)}
              placeholder={manualIsPercentage ? "Manual percentage" : "Manual rate"}
              maxLength={240}
            />
          </label>
        </div>
      </ModalDialog>
    </div>
  );
}

function SummaryRows({ summary }: { summary: ReturnType<typeof summaryFor> }) {
  return (
    <>
      <tr className="border-t-2 border-slate-300 bg-slate-50">
        <td className="px-4 py-2" colSpan={3}></td>
        <td className="px-4 py-2 font-semibold text-slate-700">total for</td>
        <td className="px-4 py-2 text-slate-700">1 {summary.analysis_unit}</td>
        <td className="px-4 py-2 text-right font-bold text-slate-950">{formatMoney(summary.total)}</td>
      </tr>
      <tr className="border-t border-slate-200 bg-slate-50">
        <td className="px-4 py-2" colSpan={3}></td>
        <td className="px-4 py-2 font-semibold text-slate-700">rate for {summary.analysis_unit}</td>
        <td className="px-4 py-2"></td>
        <td className="px-4 py-2 text-right font-semibold text-slate-950">{formatMoney(summary.rate_for_unit)}</td>
      </tr>
      <tr className="border-t border-slate-200 bg-slate-50">
        <td className="px-4 py-2" colSpan={3}></td>
        <td className="px-4 py-2 font-semibold text-slate-700">rate (say)</td>
        <td className="px-4 py-2">1 {summary.analysis_unit}</td>
        <td className="px-4 py-2 text-right font-semibold text-slate-950">{formatMoney(summary.rate_say_unit)}</td>
      </tr>
      <tr className="border-t border-slate-200 bg-slate-50">
        <td className="px-4 py-2" colSpan={3}></td>
        <td className="px-4 py-2 font-semibold text-slate-700">rate (say)</td>
        <td className="px-4 py-2">1 ft3</td>
        <td className="px-4 py-2 text-right font-semibold text-slate-950">{formatMoney(summary.rate_say_ft3)}</td>
      </tr>
      <tr className="border-t border-slate-200 bg-slate-50">
        <td className="px-4 py-2" colSpan={3}></td>
        <td className="px-4 py-2 font-semibold text-slate-700">rate (say)</td>
        <td className="px-4 py-2">1 m3</td>
        <td className="px-4 py-2 text-right font-semibold text-slate-950">{formatMoney(summary.rate_say_m3)}</td>
      </tr>
    </>
  );
}

function RateDisplay({ itemType, label, rate }: { itemType: NormItemType; label: string | null; rate: number | null }) {
  if (!label && rate == null) return <span className="text-slate-400">{itemType === "percentage" ? "Select percentage" : "Select rate"}</span>;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="line-clamp-2 text-xs font-semibold text-slate-800">{label || (itemType === "percentage" ? "Selected percentage" : "Selected rate")}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{formatRateValue(itemType, rate)}</p>
    </div>
  );
}

function RatePicker({
  row,
  options,
  onChange,
  onManual,
}: {
  row: DraftRow;
  options: RateItem[];
  onChange: (rateItemId: string) => void;
  onManual: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = row.rate_item_id ? options.find((rate) => rate.id === row.rate_item_id) || null : null;
  const label = row.selected_rate_label || (selected ? rateDetailLabel(selected) : null);
  const selectedValue = selected ? rateValue(selected) : null;
  const rate = row.selected_rate ?? (selectedValue != null ? Number(selectedValue) : null);
  const searchQuery = normalizeText(search);
  const filteredOptions = searchQuery ? options.filter((rateItem) => rateSearchText(rateItem, row.item_type).includes(searchQuery)) : options;

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="w-full text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <RateDisplay itemType={row.item_type} label={label} rate={rate} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
            onClick={() => {
              onChange("");
              setSearch("");
              setOpen(false);
            }}
          >
            {row.item_type === "percentage" ? "Select percentage" : "Select rate"}
          </button>
          <div className="border-y border-slate-100 px-3 py-2">
            <input
              className="input h-9 w-full text-sm"
              autoFocus
              placeholder={row.item_type === "percentage" ? "Search percentages" : "Search rates"}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearch("");
                  setOpen(false);
                }
              }}
            />
          </div>
          {filteredOptions.length ? filteredOptions.map((rateItem) => (
            <button
              key={rateItem.id}
              type="button"
              role="option"
              aria-selected={rateItem.id === row.rate_item_id}
              className={rateItem.id === row.rate_item_id ? "block w-full bg-blue-50 px-3 py-2 text-left text-blue-800" : "block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"}
              onClick={() => {
                onChange(rateItem.id);
                setSearch("");
                setOpen(false);
              }}
            >
              <span className="block text-xs font-semibold">{rateDetailLabel(rateItem)}</span>
              <span className="mt-1 block text-sm font-bold text-slate-950">{formatRateValue(row.item_type, rateValue(rateItem))}</span>
            </button>
          )) : options.length ? (
            <p className="px-3 py-3 text-sm text-slate-500">No rates match your search.</p>
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">No matching rates found.</p>
          )}
          <button
            type="button"
            className="block w-full border-t border-slate-200 px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
            onClick={() => {
              onManual();
              setSearch("");
              setOpen(false);
            }}
          >
            {row.item_type === "percentage" ? "+ Manual percentage" : "+ Manual rate"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SavedBreakdowns({
  items,
  loading,
  onEdit,
  onDelete,
}: {
  items: RateBreakdownItem[];
  loading: boolean;
  onEdit: (item: RateBreakdownItem) => void;
  onDelete: (item: RateBreakdownItem) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-5 py-3">Main item</th>
            <th className="px-5 py-3 text-right">Rows</th>
            <th className="px-5 py-3 text-right">Total</th>
            <th className="px-5 py-3 text-right">Rate for cube</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={5}>Loading rate breakdown...</td></tr> : null}
          {items.flatMap((item) => {
            const expanded = expandedId === item.id;
            return [
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-5 py-3 font-semibold text-slate-900">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-left font-semibold text-slate-950 hover:text-blue-700"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                  >
                    <span className={expanded ? "inline-flex h-6 w-6 rotate-90 items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-600 transition-transform" : "inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-600 transition-transform"}>&gt;</span>
                    {item.main_item_name}
                  </button>
                </td>
                <td className="px-5 py-3 text-right text-slate-600">{item.rows.length}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-950">Rs {formatMoney(item.summary.total)}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-950">Rs {formatMoney(item.summary.rate_for_unit)}</td>
                <td className="px-5 py-3 text-right">
                  <button className="mr-3 text-sm font-semibold text-blue-700" onClick={() => onEdit(item)}>Edit</button>
                  <button className="text-sm font-semibold text-red-600" onClick={() => onDelete(item)}>Delete</button>
                </td>
              </tr>,
              ...(expanded ? [
                <tr key={`${item.id}-view`} className="border-t border-slate-200 bg-slate-50/70">
                  <td colSpan={5} className="p-4">
                    <ReadonlyAnalysis item={item} />
                  </td>
                </tr>,
              ] : []),
            ];
          })}
          {!loading && !items.length ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={5}>No rate breakdown analyses yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function ReadonlyAnalysis({ item }: { item: RateBreakdownItem }) {
  return (
    <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-sky-100 text-xs uppercase text-slate-700">
          <tr>
            <th className="w-16 px-4 py-3 text-center">No</th>
            <th className="px-4 py-3">Item Description</th>
            <th className="w-32 px-4 py-3">Unit</th>
            <th className="w-32 px-4 py-3 text-right">Quantity</th>
            <th className="w-72 px-4 py-3">Rate</th>
            <th className="w-40 px-4 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {item.rows.map((row, index) => (
            <tr key={row.id} className="border-t border-slate-200">
              <td className="px-4 py-3 text-center font-semibold text-slate-700">{index + 1}</td>
              <td className="px-4 py-3">
                <span className="font-semibold text-slate-950">{row.description}</span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{NORM_ITEM_TYPE_LABELS[row.item_type]}</span>
              </td>
              <td className="px-4 py-3 text-slate-700">{row.unit || ""}</td>
              <td className="px-4 py-3 text-right text-slate-700">{row.quantity.toLocaleString()}</td>
              <td className="px-4 py-3">
                <RateDisplay itemType={row.item_type} label={row.selected_rate_label} rate={row.selected_rate} />
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-950">{row.amount == null ? <span className="text-slate-400">Not priced</span> : formatMoney(row.amount)}</td>
            </tr>
          ))}
          <SummaryRows summary={item.summary} />
        </tbody>
      </table>
    </div>
  );
}
