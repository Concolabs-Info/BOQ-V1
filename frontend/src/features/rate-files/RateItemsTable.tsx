"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/components/Button";
import type { RateItem } from "./types";
import { RATE_ITEM_TYPE_LABELS, UNIT_TYPE_LABELS } from "./types";

function EmptyValue({ children }: { children: string }) {
  return <span className="font-medium text-slate-400">{children}</span>;
}

function itemName(item: RateItem) {
  if (item.item_type === "material") return item.material_name || "Unnamed material";
  if (item.item_type === "labour") return item.labour_name || "Unnamed labour";
  return item.machinery_name || "Unnamed machinery";
}

function itemDetails(item: RateItem) {
  if (item.item_type === "material") {
    const attributes = (item.material_attributes || []).map((attribute) => `${attribute.attribute}: ${attribute.value}`);
    return [item.supplier, item.brand, ...attributes].filter(Boolean).join(" · ");
  }
  if (item.item_type === "labour") return item.labour_group || "";
  return item.machinery_source || "";
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
  const groups = useMemo(() => {
    const map = new Map<string, RateItem[]>();
    items.forEach((item) => {
      const key = item.main_item || "No main item";
      map.set(key, [...(map.get(key) || []), item]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  function toggleGroup(mainItem: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(mainItem)) next.delete(mainItem);
      else next.add(mainItem);
      return next;
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Rate compositions</h2>
          <p className="text-sm text-slate-500">Grouped material, labour and machinery rates by main item.</p>
        </div>
        <Button disabled={addDisabled} onClick={onAdd}>+ Add</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[940px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Name</th>
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
            ) : groups.length ? groups.flatMap(([mainItem, groupItems]) => {
              const isCollapsed = collapsed.has(mainItem);
              const total = groupItems.reduce((sum, item) => sum + Number(item.rate || 0), 0);
              return [
                <tr key={`${mainItem}-group`} className="border-t border-slate-200 bg-slate-100/80">
                  <td className="px-5 py-3" colSpan={5}>
                    <button type="button" className="inline-flex items-center gap-2 font-semibold text-slate-950" onClick={() => toggleGroup(mainItem)}>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-xs">{isCollapsed ? "+" : "-"}</span>
                      {mainItem}
                    </button>
                    <span className="ml-3 text-xs font-medium text-slate-500">{groupItems.length} item{groupItems.length === 1 ? "" : "s"}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-950">{currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Total</td>
                </tr>,
                ...(isCollapsed ? [] : groupItems.map((item) => {
                  const unit = UNIT_TYPE_LABELS[item.unit_type] || item.unit_type;
                  return (
                    <tr key={item.id} className={selectedItemId === item.id ? "border-t border-blue-100 bg-blue-50/60" : "border-t border-slate-200"}>
                      <td className="px-5 py-3">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">{RATE_ITEM_TYPE_LABELS[item.item_type]}</span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{itemName(item)}</td>
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
