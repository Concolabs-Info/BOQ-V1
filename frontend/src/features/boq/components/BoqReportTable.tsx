import type { BoqRow } from "../types";
import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Plus } from "lucide-react";

const BOQ_TABLE_COLUMN_STORAGE_PREFIX = "quanto:boq-table-columns";
const BOQ_TABLE_COLUMNS = [
  { key: "item", label: "Item", defaultWidth: 150, minWidth: 110, maxWidth: 260, align: "left" },
  { key: "description", label: "Description", defaultWidth: 560, minWidth: 360, maxWidth: 900, align: "left" },
  { key: "unit", label: "Unit", defaultWidth: 110, minWidth: 80, maxWidth: 180, align: "left" },
  { key: "quantity", label: "Quantity", defaultWidth: 140, minWidth: 110, maxWidth: 220, align: "right" },
  { key: "rate", label: "Rate", defaultWidth: 160, minWidth: 130, maxWidth: 260, align: "right" },
  { key: "amount", label: "Amount", defaultWidth: 180, minWidth: 140, maxWidth: 300, align: "right" },
] as const;

type BoqColumnKey = typeof BOQ_TABLE_COLUMNS[number]["key"];
type BoqColumnWidths = Record<BoqColumnKey, number>;
type ColumnDragState = {
  pointerId: number;
  key: BoqColumnKey;
  startX: number;
  startWidth: number;
};

const DEFAULT_BOQ_COLUMN_WIDTHS = BOQ_TABLE_COLUMNS.reduce((widths, column) => {
  widths[column.key] = column.defaultWidth;
  return widths;
}, {} as BoqColumnWidths);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function columnConfig(key: BoqColumnKey) {
  return BOQ_TABLE_COLUMNS.find((column) => column.key === key) ?? BOQ_TABLE_COLUMNS[0];
}

function useBoqColumnWidths(projectId: string) {
  const storageKey = `${BOQ_TABLE_COLUMN_STORAGE_PREFIX}:${projectId}`;
  const dragRef = useRef<ColumnDragState | null>(null);
  const [widths, setWidths] = useState<BoqColumnWidths>(DEFAULT_BOQ_COLUMN_WIDTHS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) {
        setWidths(DEFAULT_BOQ_COLUMN_WIDTHS);
        return;
      }
      const parsed = JSON.parse(saved) as Partial<BoqColumnWidths>;
      setWidths({
        ...DEFAULT_BOQ_COLUMN_WIDTHS,
        ...Object.fromEntries(
          BOQ_TABLE_COLUMNS.map((column) => [
            column.key,
            Number.isFinite(parsed[column.key])
              ? clamp(Number(parsed[column.key]), column.minWidth, column.maxWidth)
              : column.defaultWidth,
          ])
        ),
      } as BoqColumnWidths);
    } catch {
      setWidths(DEFAULT_BOQ_COLUMN_WIDTHS);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // Resizing still works for this visit if browser storage is unavailable.
    }
  }, [storageKey, widths]);

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, key: BoqColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      key,
      startX: event.clientX,
      startWidth: widths[key],
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const config = columnConfig(drag.key);
    const nextWidth = clamp(drag.startWidth + event.clientX - drag.startX, config.minWidth, config.maxWidth);
    setWidths((current) => ({ ...current, [drag.key]: nextWidth }));
  }

  function finishResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }

  function resetColumn(key: BoqColumnKey) {
    setWidths((current) => ({ ...current, [key]: columnConfig(key).defaultWidth }));
  }

  return { widths, beginResize, moveResize, finishResize, resetColumn };
}

function quantityLabel(row: BoqRow): string {
  if (["nr", "no", "nos", "each", "ea", "item"].includes(row.unit.toLowerCase())) return String(Math.round(row.quantity));
  return row.quantity.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function EmptyValue({ children }: { children: string }) {
  return <span className="font-medium text-slate-400">{children}</span>;
}

export function BoqReportTable({
  projectId,
  rows,
  showRates,
  showAmounts,
  onPickRate,
}: {
  projectId: string;
  rows: BoqRow[];
  showRates: boolean;
  showAmounts: boolean;
  onPickRate: (row: BoqRow) => void;
}) {
  const groups=rows.reduce<Array<{key:string;bill:string;section:string;rows:BoqRow[]}>>((result,row)=>{const bill=`Bill ${row.bill_no||"09"} — ${row.bill_name||"Other items"}`;const section=`${row.subcategory_code||"General"} — ${row.subcategory_name||row.section||"General"}`;const key=`${bill}|${section}`;const current=result[result.length-1];if(current?.key===key)current.rows.push(row);else result.push({key,bill,section,rows:[row]});return result},[]);
  const columnResize = useBoqColumnWidths(projectId);
  const visibleColumns = BOQ_TABLE_COLUMNS.filter((column) => {
    if (column.key === "rate") return showRates;
    if (column.key === "amount") return showAmounts;
    return true;
  });
  const visibleColumnCount = visibleColumns.length;
  const tableWidth = visibleColumns.reduce((total, column) => total + columnResize.widths[column.key], 0);
  return (
    <div className="max-h-[700px] overflow-auto">
      <table
        className="table-fixed border-collapse text-left text-sm"
        style={{ width: `${tableWidth}px`, minWidth: "100%" }}
      >
        <colgroup>
          {visibleColumns.map((column) => (
            <col key={column.key} style={{ width: `${columnResize.widths[column.key]}px` }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            {visibleColumns.map((column) => (
              <th key={column.key} className={`relative px-4 py-2.5 ${column.align === "right" ? "text-right" : ""}`}>
                <span className="block truncate">{column.label}</span>
                <button
                  type="button"
                  aria-label={`Resize ${column.label} column`}
                  title="Drag to resize · Double-click to reset"
                  className="group absolute inset-y-0 right-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none"
                  onPointerDown={(event) => columnResize.beginResize(event, column.key)}
                  onPointerMove={columnResize.moveResize}
                  onPointerUp={columnResize.finishResize}
                  onPointerCancel={columnResize.finishResize}
                  onDoubleClick={() => columnResize.resetColumn(column.key)}
                >
                  <span className="h-5 w-px rounded-full bg-slate-300 transition group-hover:bg-blue-500 group-focus-visible:bg-blue-600 group-active:bg-blue-700" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group,index) => <Fragment key={group.key}>
            {index===0||groups[index-1].bill!==group.bill?<tr className="border-t-2 border-slate-300 bg-slate-800 text-white"><td colSpan={visibleColumnCount} className="px-4 py-2.5 text-sm font-semibold">{group.bill}</td></tr>:null}
            <tr className="border-t border-slate-200 bg-slate-100"><td colSpan={visibleColumnCount} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">{group.section}</td></tr>
          {group.rows.map((row) => (
            <tr
              key={row.id}
              className={`border-t border-slate-200 align-top transition-colors hover:bg-blue-50 hover:shadow-[inset_3px_0_0_#93c5fd] ${row.excluded ? "opacity-50 hover:bg-blue-50/80" : ""}`}
            >
              <td className="truncate whitespace-nowrap px-4 py-2.5 font-semibold text-slate-800">{row.boq_item_number || row.subcategory_code || <EmptyValue>No item</EmptyValue>}</td>
              <td className="px-4 py-2.5">
                <p className="leading-5 text-slate-800">{row.description}</p>
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
              <td className="px-4 py-2.5">{row.unit}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{quantityLabel(row)}</td>
              {showRates ? (
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <span>{row.rate == null ? <EmptyValue>No rate</EmptyValue> : row.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => onPickRate(row)} aria-label="Select rate" title="Select rate"><Plus className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                </td>
              ) : null}
              {showAmounts ? <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{row.amount == null ? <EmptyValue>Not priced</EmptyValue> : row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td> : null}
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-slate-50"><td></td><td className="px-4 py-2 text-xs font-semibold text-slate-700">Section subtotal</td><td></td><td></td>{showRates?<td></td>:null}{showAmounts?<td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-slate-800">{group.rows.reduce((sum,row)=>sum+Number(row.amount||0),0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>:null}</tr>
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
