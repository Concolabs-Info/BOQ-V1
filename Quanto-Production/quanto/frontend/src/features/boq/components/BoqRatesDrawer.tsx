"use client";

import { useEffect, useMemo, useState } from "react";
import { getBoqDefaultRate } from "@/features/demo/builders";
import { Button } from "@/shared/components/Button";
import type { BoqRow } from "../types";
import { BoqDrawer } from "./BoqDrawer";

export function BoqRatesDrawer({open,rows,currency,initialMode,saving,onClose,onSave}:{
  open:boolean;rows:BoqRow[];currency:string;initialMode:"default"|"manual";saving:boolean;onClose:()=>void;
  onSave:(mode:"default"|"manual",rates:Record<string,number|null>)=>Promise<void>;
}){
  const pricedRows=useMemo(()=>rows.filter(row=>!row.manual),[rows]);
  const [mode,setMode]=useState<"default"|"manual">(initialMode);
  const [rates,setRates]=useState<Record<string,string>>({});
  useEffect(()=>{if(!open)return;setMode(initialMode);setRates(Object.fromEntries(pricedRows.map(row=>[row.id,row.rate==null?"":String(row.rate)])))},[initialMode,open,pricedRows]);
  const chooseMode=(next:"default"|"manual")=>{setMode(next);setRates(Object.fromEntries(pricedRows.map(row=>[row.id,next==="default"?String(getBoqDefaultRate(row.entity_type||"",row.item_code||"",row.unit)):""])))};
  return <BoqDrawer open={open} title="Manage rates" subtitle="Choose automatic defaults or enter project rates manually." width="max-w-4xl" onClose={onClose}>
    <div className="space-y-5 p-6">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button type="button" onClick={()=>chooseMode("default")} className={mode==="default"?"rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white":"rounded-md px-4 py-2 text-sm font-semibold text-slate-600"}>Default rates</button>
        <button type="button" onClick={()=>chooseMode("manual")} className={mode==="manual"?"rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white":"rounded-md px-4 py-2 text-sm font-semibold text-slate-600"}>Manual rates</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3 text-right">Default</th><th className="px-4 py-3 text-right">Applied rate ({currency})</th></tr></thead>
            <tbody>{pricedRows.map(row=>{const standard=getBoqDefaultRate(row.entity_type||"",row.item_code||"",row.unit);return <tr key={row.id} className="border-t border-slate-200"><td className="px-4 py-3 capitalize">{(row.entity_type||"item").replaceAll("_"," ")}</td><td className="px-4 py-3 font-semibold">{row.item_code||"—"}</td><td className="px-4 py-3">{row.unit}</td><td className="px-4 py-3 text-right text-slate-500">{standard.toLocaleString()}</td><td className="px-4 py-2"><input aria-label={`Rate for ${row.item_code||row.description}`} className="input ml-auto block w-40 text-right" type="number" min="0" step="0.01" value={rates[row.id]??""} onChange={event=>setRates(current=>({...current,[row.id]:event.target.value}))}/></td></tr>})}</tbody>
          </table>
        </div>
      </div>
    </div>
    <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={()=>void onSave(mode,Object.fromEntries(pricedRows.map(row=>[row.id,rates[row.id]==null||rates[row.id]===""?null:Number(rates[row.id])])))}>{saving?"Saving…":"Save rates"}</Button></footer>
  </BoqDrawer>;
}
