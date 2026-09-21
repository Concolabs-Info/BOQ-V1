"use client";

import { Button } from "@/shared/components/Button";
import type { RateItem } from "./types";
import { UNIT_TYPE_LABELS } from "./types";
import { useState } from "react";

function EmptyValue({ children }: { children: string }) {
  return <span className="font-medium text-slate-400">{children}</span>;
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
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Material rates</h2>
          <p className="text-sm text-slate-500">Project-specific material rates for BOQ pricing.</p>
        </div>
        <Button disabled={addDisabled} onClick={onAdd}>+ Add</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Material name</th>
              <th className="px-5 py-3">Specification</th>
              <th className="px-5 py-3">Size(mm)</th>
              <th className="px-5 py-3">Unit</th>
              <th className="px-5 py-3 text-right">Unit cost</th>
              <th className="px-5 py-3 text-right">Markup</th>
              <th className="px-5 py-3 text-right">Rate</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={8}>Loading material rates...</td></tr>
            ) : items.length ? items.map((item) => {
              const unit = item.unit_type === "custom" ? item.custom_unit || "custom" : UNIT_TYPE_LABELS[item.unit_type];
              const sellRate = item.unit_cost * (1 + item.markup_percent / 100);
              return (
                <tr key={item.id} className={selectedItemId === item.id ? "border-t border-blue-100 bg-blue-50/60" : "border-t border-slate-200"}>
                  <td className="px-5 py-3 font-semibold text-slate-900">{item.material_name}</td>
                  <td className="px-5 py-3 text-slate-600">{item.specification || <EmptyValue>No specification</EmptyValue>}</td>
                  <td className="px-5 py-3 text-slate-600">{item.size || <EmptyValue>No size</EmptyValue>}</td>
                  <td className="px-5 py-3 text-slate-600">{unit || item.unit_type || <EmptyValue>No unit</EmptyValue>}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{currency} {item.unit_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{item.markup_percent.toLocaleString()}%</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-950">{currency} {sellRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
            }) : (
              <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={8}>No material rates found. Use Add to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
