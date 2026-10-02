"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { BoqDrawer } from "@/features/boq/components/BoqDrawer";
import { useNormItems, useNormMutations, useNormOptions } from "./hooks";
import type { NormChildInput, NormComposition, NormCompositionInput, NormItem, NormItemType, NormOptionType } from "./types";
import { DEFAULT_NORM_UNITS, NORM_ITEM_TYPE_LABELS, NORM_UNIT_OPTION_BY_TYPE } from "./types";

const ADD_UNIT = "__add_unit__";
const NORM_TYPES: NormItemType[] = ["material", "labor", "machinery", "percentage"];

const DEFAULT_UNIT_BY_TYPE: Record<Exclude<NormItemType, "percentage">, string> = {
  material: "m3",
  labor: "hour",
  machinery: "hour",
};

type DraftChild = NormChildInput & { draft_id: string };
type DraftComposition = { main_item_name: string; items: DraftChild[] };
type VisibleComposition = { composition: NormComposition; items: NormItem[] };

function isUnitNormType(itemType: NormItemType): itemType is Exclude<NormItemType, "percentage"> {
  return itemType !== "percentage";
}

function emptyComposition(): DraftComposition {
  return { main_item_name: "", items: [] };
}

function newDraftChild(itemType: NormItemType): DraftChild {
  return {
    draft_id: `${itemType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    item_type: itemType,
    name: "",
    quantity: 0,
    unit: itemType === "percentage" ? null : DEFAULT_UNIT_BY_TYPE[itemType],
  };
}

function toDraft(item: NormComposition): DraftComposition {
  return {
    main_item_name: item.main_item_name,
    items: item.items.map((child) => ({
      draft_id: child.id,
      item_type: child.item_type,
      name: child.name,
      quantity: child.quantity,
      unit: child.unit,
    })),
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function typeCounts(items: NormItem[]) {
  return NORM_TYPES.map((type) => {
    const count = items.filter((item) => item.item_type === type).length;
    return count ? `${count} ${NORM_ITEM_TYPE_LABELS[type]}` : null;
  }).filter(Boolean).join(" | ");
}

function childrenByType(items: DraftChild[]) {
  return NORM_TYPES.map((type) => ({
    type,
    items: items.filter((item) => item.item_type === type),
  })).filter((group) => group.items.length > 0);
}

export function NormPage({ projectId }: { projectId: string }) {
  const itemsQuery = useNormItems(projectId);
  const optionsQuery = useNormOptions(projectId);
  const mutations = useNormMutations(projectId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NormComposition | null>(null);
  const [deleteItem, setDeleteItem] = useState<NormComposition | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<NormItemType>>(new Set());
  const [search, setSearch] = useState("");
  const [quantityFrom, setQuantityFrom] = useState("");
  const [quantityTo, setQuantityTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saving = mutations.createItem.isPending || mutations.updateItem.isPending || mutations.deleteItem.isPending || mutations.createOption.isPending;
  const compositions = itemsQuery.data || [];
  const quantityMin = parseOptionalNumber(quantityFrom);
  const quantityMax = parseOptionalNumber(quantityTo);

  const visibleCompositions = useMemo<VisibleComposition[]>(() => {
    const query = search.trim().toLowerCase();
    return compositions.flatMap((composition) => {
      const mainMatches = query ? composition.main_item_name.toLowerCase().includes(query) : true;
      const matchingItems = composition.items.filter((item) => {
        if (selectedTypes.size > 0 && !selectedTypes.has(item.item_type)) return false;
        if (quantityMin !== null && item.quantity < quantityMin) return false;
        if (quantityMax !== null && item.quantity > quantityMax) return false;
        if (!query || mainMatches) return true;
        const haystack = [item.name, item.unit || "", NORM_ITEM_TYPE_LABELS[item.item_type], String(item.quantity)].join(" ").toLowerCase();
        return haystack.includes(query);
      });
      return matchingItems.length ? [{ composition, items: matchingItems }] : [];
    });
  }, [compositions, quantityMax, quantityMin, search, selectedTypes]);

  function toggleType(type: NormItemType) {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This action could not be completed.");
    }
  }

  return (
    <PlatformShell title="Norm" eyebrow="Project production" lockContent>
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Norm library</h2>
            <p className="mt-1 text-sm text-slate-500">Project norms grouped by main item compositions.</p>
          </div>
          <Button onClick={() => { setEditingItem(null); setDrawerOpen(true); }}>+ Add</Button>
        </header>
        {error || itemsQuery.error ? <p className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "Norm data could not be loaded."}</p> : null}
        <div className="flex shrink-0 flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <label className="block min-w-[260px] flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input className="input mt-2" value={search} placeholder="Search norm compositions" onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {NORM_TYPES.map((type) => (
                <label key={type} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={selectedTypes.has(type)} onChange={() => toggleType(type)} />
                  {NORM_ITEM_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quantity range</p>
            <div className="mt-2 flex flex-nowrap items-center gap-2">
              <input className="input w-32" aria-label="Quantity from" type="number" min="0" placeholder="From" value={quantityFrom} onChange={(event) => setQuantityFrom(event.target.value)} />
              <span className="text-sm font-semibold text-slate-400">to</span>
              <input className="input w-32" aria-label="Quantity to" type="number" min="0" placeholder="To" value={quantityTo} onChange={(event) => setQuantityTo(event.target.value)} />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-14 px-5 py-3"> </th>
                <th className="px-5 py-3">Main item name</th>
                <th className="px-5 py-3">Composition</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {itemsQuery.isLoading ? <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={4}>Loading norm items...</td></tr> : null}
              {!itemsQuery.isLoading && visibleCompositions.length ? visibleCompositions.flatMap(({ composition, items }) => {
                const expanded = expandedIds.has(composition.id);
                return [
                  <tr key={composition.id} className="border-t border-slate-200 bg-white">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-sm font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"
                        aria-expanded={expanded}
                        aria-label={expanded ? `Collapse ${composition.main_item_name}` : `Expand ${composition.main_item_name}`}
                        onClick={() => toggleExpanded(composition.id)}
                      >
                        <span aria-hidden>{expanded ? "v" : ">"}</span>
                      </button>
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-950">{composition.main_item_name}</td>
                    <td className="px-5 py-3 text-slate-600">{typeCounts(composition.items) || "No rows"}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="mr-3 text-sm font-semibold text-blue-700" onClick={() => { setEditingItem(composition); setDrawerOpen(true); }}>Edit</button>
                      <button className="text-sm font-semibold text-red-600" onClick={() => setDeleteItem(composition)}>Delete</button>
                    </td>
                  </tr>,
                  expanded ? <ExpandedRows key={`${composition.id}-expanded`} items={items} /> : null,
                ];
              }) : null}
              {!itemsQuery.isLoading && !visibleCompositions.length ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={4}>No norm compositions match the current filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      <NormDrawer
        open={drawerOpen}
        item={editingItem}
        options={optionsQuery.data || null}
        saving={saving}
        onClose={() => { setDrawerOpen(false); setEditingItem(null); }}
        onAddOption={(optionType, value) => mutations.createOption.mutateAsync({ optionType, value })}
        onSave={(payload) => run(async () => {
          const saved = editingItem
            ? await mutations.updateItem.mutateAsync({ id: editingItem.id, payload })
            : await mutations.createItem.mutateAsync(payload);
          setExpandedIds((current) => new Set(current).add(saved.id));
          setDrawerOpen(false);
          setEditingItem(null);
        })}
      />
      <ModalDialog
        open={Boolean(deleteItem)}
        title="Delete norm composition"
        description="This removes the main item and all of its Norm rows from this project."
        ariaLabel="Delete norm composition"
        onClose={() => setDeleteItem(null)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="danger" disabled={saving} onClick={() => void run(async () => { if (deleteItem) await mutations.deleteItem.mutateAsync(deleteItem.id); setDeleteItem(null); })}>{saving ? "Deleting..." : "Delete"}</Button>
          </>
        )}
      >
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-950">{deleteItem?.main_item_name || "Norm composition"}</p>
      </ModalDialog>
    </PlatformShell>
  );
}

function ExpandedRows({ items }: { items: NormItem[] }) {
  return (
    <tr className="border-t border-slate-200 bg-slate-50/70">
      <td />
      <td colSpan={3} className="px-5 py-4">
        <div className="grid gap-4">
          {NORM_TYPES.map((type) => {
            const groupItems = items.filter((item) => item.item_type === type);
            if (!groupItems.length) return null;
            return (
              <section key={type} className="rounded-lg border border-slate-200 bg-white">
                <header className="border-b border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{NORM_ITEM_TYPE_LABELS[type]}</header>
                <div className="divide-y divide-slate-100">
                  {groupItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_140px_140px] gap-3 px-4 py-3 text-sm">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="text-right font-semibold text-slate-950">{item.quantity.toLocaleString()}</span>
                      <span className="text-slate-600">{item.unit || <span className="font-medium text-slate-400">No unit</span>}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

function NormDrawer({
  open,
  item,
  options,
  saving,
  onClose,
  onAddOption,
  onSave,
}: {
  open: boolean;
  item: NormComposition | null;
  options: Record<NormOptionType, string[]> | null;
  saving: boolean;
  onClose: () => void;
  onAddOption: (optionType: NormOptionType, value: string) => Promise<unknown>;
  onSave: (payload: NormCompositionInput) => void;
}) {
  const [form, setForm] = useState<DraftComposition>(emptyComposition());
  const [error, setError] = useState<string | null>(null);
  const [unitModal, setUnitModal] = useState<{ rowId: string; itemType: Exclude<NormItemType, "percentage"> } | null>(null);
  const [unitValue, setUnitValue] = useState("");
  const [unitError, setUnitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUnitError(null);
    setUnitValue("");
    setUnitModal(null);
    setForm(item ? toDraft(item) : emptyComposition());
  }, [item, open]);

  function addChild(itemType: NormItemType) {
    setForm((current) => ({ ...current, items: [...current.items, newDraftChild(itemType)] }));
  }

  function updateChild(rowId: string, patch: Partial<NormChildInput>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((child) => child.draft_id === rowId ? { ...child, ...patch } : child),
    }));
  }

  function removeChild(rowId: string) {
    setForm((current) => ({ ...current, items: current.items.filter((child) => child.draft_id !== rowId) }));
  }

  async function saveUnit() {
    const trimmed = unitValue.trim();
    if (!unitModal) return;
    if (!trimmed) {
      setUnitError("Unit is required.");
      return;
    }
    try {
      setUnitError(null);
      await onAddOption(NORM_UNIT_OPTION_BY_TYPE[unitModal.itemType], trimmed);
      updateChild(unitModal.rowId, { unit: trimmed });
      setUnitModal(null);
      setUnitValue("");
    } catch (caught) {
      setUnitError(caught instanceof Error ? caught.message : "This unit could not be saved.");
    }
  }

  function submit() {
    const mainItemName = form.main_item_name.trim();
    if (!mainItemName) {
      setError("Main item name is required.");
      return;
    }
    if (!form.items.length) {
      setError("Add at least one Material, Labor, Machinery or Percentage row.");
      return;
    }
    const items = childrenByType(form.items).flatMap((group) => group.items).map((child) => ({
      item_type: child.item_type,
      name: child.name.trim(),
      quantity: Number(child.quantity),
      unit: child.item_type === "percentage" ? null : child.unit?.trim() || null,
    }));
    const invalid = items.find((child) => !child.name || child.quantity < 0 || (child.item_type !== "percentage" && !child.unit));
    if (invalid) {
      setError(`${NORM_ITEM_TYPE_LABELS[invalid.item_type]} rows need a name, valid quantity${invalid.item_type === "percentage" ? "" : " and unit"}.`);
      return;
    }
    setError(null);
    onSave({ main_item_name: mainItemName, items });
  }

  return (
    <BoqDrawer open={open} title={item ? "Edit norm composition" : "Add norm composition"} subtitle="Enter the main item and add its material, labor, machinery and percentage rows." width="max-w-4xl" onClose={onClose}>
      <div className="space-y-5 p-6">
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Main item name</span>
          <input className="input mt-1" value={form.main_item_name} placeholder="Concrete" onChange={(event) => setForm((current) => ({ ...current, main_item_name: event.target.value }))} />
        </label>
        <div className="space-y-4">
          {childrenByType(form.items).map((group) => (
            <section key={group.type} className="rounded-lg border border-slate-200 bg-slate-50">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <span className="text-sm font-bold text-slate-950">{NORM_ITEM_TYPE_LABELS[group.type]}</span>
                  <span className="ml-2 text-xs font-medium text-slate-500">{group.items.length} row{group.items.length === 1 ? "" : "s"}</span>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  aria-label={`Add ${NORM_ITEM_TYPE_LABELS[group.type]} row`}
                  onClick={() => addChild(group.type)}
                >
                  +
                </button>
              </header>
              <NormChildTable
                items={group.items}
                itemType={group.type}
                options={options}
                onChange={updateChild}
                onRemove={removeChild}
                onAddUnit={(rowId, itemType) => { setUnitModal({ rowId, itemType }); setUnitValue(""); setUnitError(null); }}
              />
            </section>
          ))}
          {!form.items.length ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Add at least one row to save this norm composition.</p> : null}
        </div>
      </div>
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <TypeButtons onAdd={addChild} />
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={submit}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </footer>
      <ModalDialog
        open={Boolean(unitModal)}
        title={`Add ${unitModal ? NORM_ITEM_TYPE_LABELS[unitModal.itemType].toLowerCase() : "norm"} unit`}
        description="Create a project unit that will appear in this norm dropdown."
        ariaLabel="Add norm unit"
        onClose={() => setUnitModal(null)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setUnitModal(null)}>Cancel</Button>
            <Button disabled={saving || !unitValue.trim()} onClick={() => void saveUnit()}>{saving ? "Saving..." : "Save unit"}</Button>
          </>
        )}
      >
        {unitError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{unitError}</p> : null}
        <input className="input w-full" autoFocus placeholder={unitModal?.itemType === "material" ? "m3" : "hour"} value={unitValue} onChange={(event) => setUnitValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveUnit(); }} />
      </ModalDialog>
    </BoqDrawer>
  );
}

function TypeButtons({ onAdd }: { onAdd: (type: NormItemType) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {NORM_TYPES.map((type) => (
        <button key={type} type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" onClick={() => onAdd(type)}>
          {NORM_ITEM_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

function NormChildTable({
  items,
  itemType,
  options,
  onChange,
  onRemove,
  onAddUnit,
}: {
  items: DraftChild[];
  itemType: NormItemType;
  options: Record<NormOptionType, string[]> | null;
  onChange: (rowId: string, patch: Partial<NormChildInput>) => void;
  onRemove: (rowId: string) => void;
  onAddUnit: (rowId: string, itemType: Exclude<NormItemType, "percentage">) => void;
}) {
  const unitItemType = isUnitNormType(itemType) ? itemType : null;
  const optionType = unitItemType ? NORM_UNIT_OPTION_BY_TYPE[unitItemType] : null;
  const units = optionType && unitItemType
    ? options?.[optionType]?.length ? options[optionType] : DEFAULT_NORM_UNITS[unitItemType]
    : [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="bg-white text-xs uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="border-b border-slate-200 px-3 py-2 text-left font-bold">Name</th>
            <th className="w-32 border-b border-slate-200 px-3 py-2 text-left font-bold">{itemType === "percentage" ? "Percentage (%)" : "Quantity"}</th>
            {unitItemType ? <th className="w-40 border-b border-slate-200 px-3 py-2 text-left font-bold">Unit</th> : null}
            <th className="w-24 border-b border-slate-200 px-3 py-2 text-right font-bold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {items.map((child) => (
            <tr key={child.draft_id}>
              <td className="px-3 py-2">
                <input className="input h-9" value={child.name} placeholder={`${NORM_ITEM_TYPE_LABELS[child.item_type]} name`} onChange={(event) => onChange(child.draft_id, { name: event.target.value })} />
              </td>
              <td className="px-3 py-2">
                <input className="input h-9" type="number" min="0" step="0.0001" value={child.quantity} onChange={(event) => onChange(child.draft_id, { quantity: Number(event.target.value) })} />
              </td>
              {unitItemType ? (
                <td className="px-3 py-2">
                  <select
                    className="input h-9"
                    value={child.unit && units.includes(child.unit) ? child.unit : child.unit || ""}
                    onChange={(event) => {
                      if (event.target.value === ADD_UNIT) {
                        onAddUnit(child.draft_id, unitItemType);
                        return;
                      }
                      onChange(child.draft_id, { unit: event.target.value });
                    }}
                  >
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    {child.unit && !units.includes(child.unit) ? <option value={child.unit}>{child.unit}</option> : null}
                    <option value={ADD_UNIT}>+ Add another unit</option>
                  </select>
                </td>
              ) : null}
              <td className="px-3 py-2 text-right">
                <button type="button" className="text-sm font-semibold text-red-600" onClick={() => onRemove(child.draft_id)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
