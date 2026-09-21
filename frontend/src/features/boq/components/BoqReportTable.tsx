import type { BoqRow } from "../types";
import { Fragment } from "react";

function quantityLabel(row: BoqRow): string {
  if (["nr", "no", "nos", "each", "ea", "item"].includes(row.unit.toLowerCase())) return String(Math.round(row.quantity));
  return row.quantity.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function EmptyValue({ children }: { children: string }) {
  return <span className="font-medium text-slate-400">{children}</span>;
}

export function BoqReportTable({
  rows,
  showRates,
  showAmounts,
  onPickRate,
}: {
  rows: BoqRow[];
  showRates: boolean;
  showAmounts: boolean;
  onPickRate: (row: BoqRow) => void;
}) {
  const groups=rows.reduce<Array<{key:string;bill:string;section:string;rows:BoqRow[]}>>((result,row)=>{const bill=`Bill ${row.bill_no||"09"} — ${row.bill_name||"Other items"}`;const section=`${row.subcategory_code||"General"} — ${row.subcategory_name||row.section||"General"}`;const key=`${bill}|${section}`;const current=result[result.length-1];if(current?.key===key)current.rows.push(row);else result.push({key,bill,section,rows:[row]});return result},[]);
  return (
    <div className="max-h-[700px] overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3 text-right">Quantity</th>
            {showRates ? <th className="px-4 py-3 text-right">Rate</th> : null}
            {showAmounts ? <th className="px-4 py-3 text-right">Amount</th> : null}
          </tr>
        </thead>
        <tbody>
          {groups.map((group,index) => <Fragment key={group.key}>
            {index===0||groups[index-1].bill!==group.bill?<tr className="border-t-2 border-slate-300 bg-slate-900 text-white"><td colSpan={4+Number(showRates)+Number(showAmounts)} className="px-4 py-3 text-sm font-semibold">{group.bill}</td></tr>:null}
            <tr className="border-t border-slate-200 bg-slate-100"><td colSpan={4+Number(showRates)+Number(showAmounts)} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{group.section}</td></tr>
          {group.rows.map((row) => (
            <tr
              key={row.id}
              className={`border-t border-slate-200 align-top ${row.excluded ? "opacity-50" : ""}`}
            >
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{row.boq_item_number || row.subcategory_code || <EmptyValue>No item</EmptyValue>}</td>
              <td className="min-w-[440px] px-4 py-3">
                <p className="leading-6 text-slate-800">{row.description}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                  <span>{row.section || "No section"}</span>
                  {row.item_code ? <span>{row.item_code}</span> : null}
                  {row.floor_names.length ? <span>{row.floor_names.join(", ")}</span> : null}
                  <span>{row.source_items.length} source item{row.source_items.length === 1 ? "" : "s"}</span>
                  {row.manual ? <span>Manual</span> : null}
                  {row.excluded ? <span className="font-semibold text-red-500">Excluded</span> : null}
                </div>
                {row.missing_fields.length ? <p className="mt-1 text-xs text-amber-700">Missing: {row.missing_fields.map((field) => field.replaceAll("_", " ")).join(", ")}</p> : null}
              </td>
              <td className="px-4 py-3">{row.unit}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">{quantityLabel(row)}</td>
              {showRates ? (
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span>{row.rate == null ? <EmptyValue>No rate</EmptyValue> : row.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-sm font-bold text-blue-700 hover:bg-blue-50" onClick={() => onPickRate(row)} aria-label="Select rate">+</button>
                  </div>
                </td>
              ) : null}
              {showAmounts ? <td className="px-4 py-3 text-right font-semibold">{row.amount == null ? <EmptyValue>Not priced</EmptyValue> : row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td> : null}
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-slate-50"><td></td><td className="px-4 py-2 text-xs font-semibold text-slate-600">Section subtotal</td><td></td><td></td>{showRates?<td></td>:null}{showAmounts?<td className="px-4 py-2 text-right text-xs font-semibold text-slate-800">{group.rows.reduce((sum,row)=>sum+Number(row.amount||0),0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>:null}</tr>
          </Fragment>)}
        </tbody>
      </table>
      {!rows.length ? (
        <div className="p-16 text-center">
          <p className="font-semibold text-slate-700">No BOQ items match these filters.</p>
          <p className="mt-1 text-sm text-slate-500">Clear the filters or refresh the BOQ after Review is ready.</p>
        </div>
      ) : null}
    </div>
  );
}
