"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/components/Button";
import type { RateItem } from "./types";
import { RATE_ITEM_TYPE_LABELS, UNIT_TYPE_LABELS } from "./types";

const RATE_ITEM_TYPES: RateItem["item_type"][] = ["material", "labour", "machinery", "percentage"];

function EmptyValue({ children }: { children: string }) {
  return <span className="font-medium text-slate-400">{children}</span>;
}

function itemName(item: RateItem) {
  if (item.item_type === "material") return item.material_name || "Unnamed material";
  if (item.item_type === "labour") return item.labour_name || "Unnamed labour";
  if (item.item_type === "percentage") return item.percentage_name || "Unnamed percentage";
  return item.machinery_name || "Unnamed machinery";
}

function itemDetails(item: RateItem) {
  if (item.item_type === "material") {
    const attributes = (item.material_attributes || []).map((attribute) => `${attribute.attribute}: ${attribute.value}`);
    return [item.brand, ...attributes].filter(Boolean).join(" · ");
  }
  if (item.item_type === "labour") return item.labour_group || "";
  if (item.item_type === "percentage") return item.percentage == null ? "" : `${item.percentage}%`;
  return [item.machinery_source, item.machinery_location].filter(Boolean).join(" · ");
}

function itemSupplier(item: RateItem) {
  return item.item_type === "material" ? item.supplier || "" : "";
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function RateItemsTable({
  items,
  currency = "Rs",
  loading,
  selectedItemId,
  onAdd,
  addDisabled = false,
  onEdit,
  onDelete,
}: {
  items: RateItem[];
  currency?: string;
  loading: boolean;
  selectedItemId: string | null;
  onAdd: () => void;
  addDisabled?: boolean;
  onEdit: (item: RateItem) => void;
  onDelete: (id: string) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<RateItem["item_type"]>>(new Set());
  const [rateFrom, setRateFrom] = useState("");
  const [rateTo, setRateTo] = useState("");
  const rateMin = parseOptionalNumber(rateFrom);
  const rateMax = parseOptionalNumber(rateTo);
  const filteredItems = useMemo(() => items.filter((item) => {
    if (selectedTypes.size > 0 && !selectedTypes.has(item.item_type)) return false;
    if (rateMin !== null && item.rate < rateMin) return false;
    if (rateMax !== null && item.rate > rateMax) return false;
    return true;
  }), [items, rateMax, rateMin, selectedTypes]);
  const groups = useMemo(() => {
    return RATE_ITEM_TYPES
      .map((itemType) => [itemType, filteredItems.filter((item) => item.item_type === itemType)] as const)
      .filter(([, groupItems]) => groupItems.length > 0);
  }, [filteredItems]);

  function toggleGroup(groupKey: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function toggleType(itemType: RateItem["item_type"]) {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(itemType)) next.delete(itemType);
      else next.add(itemType);
      return next;
    });
  }

  return (
    <section className="flex min-h-[760px] flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Rate compositions</h2>
          <p className="text-sm text-slate-500">Grouped as material, labour, machinery and percentage rate lists.</p>
        </div>
        <Button disabled={addDisabled} onClick={onAdd}>+ Add</Button>
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RATE_ITEM_TYPES.map((itemType) => (
              <label key={itemType} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={selectedTypes.has(itemType)} onChange={() => toggleType(itemType)} />
                {RATE_ITEM_TYPE_LABELS[itemType]}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rate from</span>
          <input className="input mt-2 w-36" type="number" min="0" value={rateFrom} onChange={(event) => setRateFrom(event.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rate to</span>
          <input className="input mt-2 w-36" type="number" min="0" value={rateTo} onChange={(event) => setRateTo(event.target.value)} />
        </label>
      </div>
      <div className="max-h-[520px] min-h-[360px] overflow-x-auto overflow-y-scroll overscroll-contain [scrollbar-gutter:stable]">
        <table className="w-full min-w-[940px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Supplier</th>
              <th className="px-5 py-3">Details</th>
              <th className="px-5 py-3">Unit type</th>
              <th className="px-5 py-3">Unit detail</th>
              <th className="px-5 py-3 text-right">Rate</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={7}>Loading rate compositions...</td></tr>
            ) : groups.length ? groups.flatMap(([itemType, groupItems]) => {
              const groupTitle = `${RATE_ITEM_TYPE_LABELS[itemType]} list`;
              const isCollapsed = collapsed.has(itemType);
              const total = groupItems.reduce((sum, item) => sum + Number(item.rate || 0), 0);
              return [
                <tr key={`${itemType}-group`} className="border-t border-slate-200 bg-slate-100/80">
                  <td className="px-5 py-3" colSpan={5}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 font-semibold text-slate-950"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${groupTitle}`}
                      onClick={() => toggleGroup(itemType)}
                    >
                      <span className={isCollapsed ? "inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-600 transition-transform" : "inline-flex h-6 w-6 rotate-90 items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-600 transition-transform"}>&gt;</span>
                      {groupTitle}
                    </button>
                    <span className="ml-3 text-xs font-medium text-slate-500">{groupItems.length} item{groupItems.length === 1 ? "" : "s"}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-950">{itemType === "percentage" ? <span className="text-xs font-semibold uppercase text-slate-500">Manual rates</span> : `${currency} ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                  <td className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">{itemType === "percentage" ? "Separate" : "Total"}</td>
                </tr>,
                ...(isCollapsed ? [] : groupItems.map((item) => {
                  const unit = item.unit_type ? UNIT_TYPE_LABELS[item.unit_type] || item.unit_type : "";
                  return (
                    <tr key={item.id} className={selectedItemId === item.id ? "border-t border-blue-100 bg-blue-50/60" : "border-t border-slate-200"}>
                      <td className="px-5 py-3 font-semibold text-slate-900">{itemName(item)}</td>
                      <td className="px-5 py-3 text-slate-600">{itemSupplier(item) || <EmptyValue>No supplier</EmptyValue>}</td>
                      <td className="px-5 py-3 text-slate-600">{itemDetails(item) || <EmptyValue>No details</EmptyValue>}</td>
                      <td className="px-5 py-3 text-slate-600">{unit || <EmptyValue>No unit</EmptyValue>}</td>
                      <td className="px-5 py-3 text-slate-600">{item.unit_detail || <EmptyValue>No unit detail</EmptyValue>}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-950">{currency} {item.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="relative px-5 py-3 text-right">
                        <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-sm font-semibold hover:bg-slate-50" onClick={() => setMenuId(menuId === item.id ? null : item.id)}>...</button>
                        {menuId === item.id ? (
                          <div className="absolute right-5 z-20 mt-2 w-32 rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg">
                            <button type="button" className="block w-full px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setMenuId(null); onEdit(item); }}>Edit</button>
                            <button type="button" className="block w-full px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={() => { setMenuId(null); onDelete(item.id); }}>Delete</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })),
              ];
            }) : (
              <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={7}>No rate compositions found. Use Add to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
