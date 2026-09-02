"use client";

import { useMemo, useState } from "react";
import { useDemoStore } from "@/features/demo/store";
import { zoneNetAreaM2, roofNetAreaM2 } from "@/features/demo/builders";
import { distance } from "@/features/demo/geometry";
import type { DemoStatus } from "@/features/demo/types";
import { friendlyRoomLabel } from "../friendlyLabels";

type ItemRow = { id:string; title:string; subtitle:string; viewportId:string; familyId:string; status:DemoStatus; quantity?:string };
function statusLabel(status: DemoStatus) { return status === "confirmed" ? "Confirmed" : status === "needs_review" ? "Needs review" : "Ready"; }
function statusDot(status: DemoStatus) { return status === "confirmed" ? "bg-emerald-500" : status === "needs_review" ? "bg-amber-500" : "bg-sky-500"; }

export function useTakeoffRows(element: string): ItemRow[] {
  const st = useDemoStore();
  return useMemo(() => {
    if (["doors-windows","doors","windows"].includes(element)) return st.openings.filter((item) => element === "doors-windows" || item.kind === element.slice(0,-1)).map((item) => {
      const family = st.openingFamilies.find((f) => f.id === item.familyId);
      return { id:item.id, title:item.id, subtitle:family ? `${family.mark} · ${family.description}` : item.kind, viewportId:item.viewportId, familyId:item.familyId, status:item.status, quantity:"1 nr" };
    });
    if (element === "floor" || element === "ceiling") {
      const zones = element === "floor" ? st.floorZones : st.ceilingZones;
      const families = element === "floor" ? st.floorFamilies : st.ceilingFamilies;
      return zones.map((item) => { const family = families.find((f) => f.id === item.familyId); return { id:item.id, title:friendlyRoomLabel(item.room), subtitle:family ? `${family.mark} · ${family.description}` : "Finish requires review", viewportId:item.viewportId, familyId:item.familyId, status:item.status, quantity:`${zoneNetAreaM2(item).toFixed(2)} m²` }; });
    }
    if (element === "walls") return st.walls.map((item) => { const family = st.wallFamilies.find((f) => f.id === item.familyId); const scale = st.viewports.find((v) => v.id === item.viewportId)?.scaleMPerPx || .018; return { id:item.id, title:item.id, subtitle:family ? `${family.mark} · ${family.description}` : "Wall", viewportId:item.viewportId, familyId:item.familyId, status:item.status, quantity:`${(distance(item.start,item.end)*scale).toFixed(2)} m` }; });
    if (element === "roof") return st.roofZones.map((item) => { const family = st.roofFamilies.find((f) => f.id === item.familyId); return { id:item.id, title:item.scope || item.id, subtitle:family ? `${family.mark} · ${family.description}` : item.id, viewportId:item.viewportId, familyId:item.familyId, status:item.status, quantity:`${roofNetAreaM2(item).toFixed(2)} m²` }; });
    return [];
  }, [element,st.openings,st.openingFamilies,st.floorZones,st.ceilingZones,st.floorFamilies,st.ceilingFamilies,st.walls,st.wallFamilies,st.roofZones,st.roofFamilies,st.viewports]);
}

export function TakeoffItemsPanel({ element, selectedId, onSelect }:{ element:string; selectedId:string|null; onSelect:(id:string,viewportId:string,familyId:string)=>void }) {
  const rows = useTakeoffRows(element); const [query,setQuery] = useState(""); const [filter,setFilter] = useState<"all"|"review"|"confirmed">("all");
  const filtered = rows.filter((row) => (filter === "all" || (filter === "review" ? row.status === "needs_review" : row.status === "confirmed")) && (!query.trim() || `${row.id} ${row.title} ${row.subtitle}`.toLowerCase().includes(query.trim().toLowerCase())));
  const review = rows.filter((r) => r.status === "needs_review").length; const done = rows.filter((r) => r.status === "confirmed").length;
  return <div className="flex h-full min-h-0 flex-col"><div className="space-y-2 border-b border-slate-200 p-3"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search takeoff…" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:border-blue-300 focus:bg-white"/><div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">{([['all',`All ${rows.length}`],['review',`Review ${review}`],['confirmed',`Done ${done}`]] as const).map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={filter===v?"rounded-md bg-white px-2 py-1.5 text-[10px] font-bold text-slate-900 shadow-sm":"rounded-md px-2 py-1.5 text-[10px] font-semibold text-slate-500"}>{l}</button>)}</div></div><div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{filtered.length?filtered.map((row)=><button key={row.id} onClick={()=>onSelect(row.id,row.viewportId,row.familyId)} className={selectedId===row.id?"w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left":"w-full rounded-xl border border-transparent p-3 text-left hover:border-slate-200 hover:bg-slate-50"}><div className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDot(row.status)}`}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-900">{row.title}</p>{row.quantity?<span className="shrink-0 text-[10px] font-bold text-slate-600">{row.quantity}</span>:null}</div><p className="mt-0.5 truncate text-[10px] text-slate-500">{row.subtitle}</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{statusLabel(row.status)}</p></div></div></button>):<div className="p-5 text-center text-xs text-slate-400">No takeoff items match this filter.</div>}</div></div>;
}

export function EvidencePanel({ element }:{ element:string }) {
  const st=useDemoStore(); const row=useTakeoffRows(element).find((r)=>r.id===st.selectedEntityId); if(!row) return <Empty text="Select a takeoff item to inspect its drawing evidence."/>;
  const viewport=st.viewports.find((v)=>v.id===row.viewportId); const sheet=viewport?st.sheets.find((s)=>s.id===viewport.sheetId):undefined; const family:any=[...st.openingFamilies,...st.floorFamilies,...st.ceilingFamilies,...st.wallFamilies,...st.roofFamilies].find((f:any)=>f.id===row.familyId);
  return <div className="space-y-3 p-4"><Head title="Evidence" sub="Trace this quantity back to its source drawing and classification."/><Card label="Plan / viewport" value={viewport?.name||row.viewportId} meta={sheet?`${sheet.sheetNo} · ${sheet.title}`:"Project drawing"}/><Card label="Classification" value={family?`${family.mark||family.id} · ${family.description||"Family"}`:row.familyId} meta={family?.source||"Takeoff family"}/><Card label="Measurement" value={row.quantity||"Geometry based"} meta="Calculated from editable takeoff geometry"/><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">Manual corrections keep the same item ID, so Review and BOQ continue to trace back to this geometry.</div></div>;
}
export function HistoryPanel({ element }:{ element:string }) {
  const st=useDemoStore(); const row=useTakeoffRows(element).find((r)=>r.id===st.selectedEntityId); if(!row) return <Empty text="Select an item to view its production state."/>;
  return <div className="space-y-3 p-4"><Head title="Change tracking" sub="Current production state and reversible session edits."/><div className="rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot(row.status)}`}/><div><p className="text-xs font-bold text-slate-800">{row.title}</p><p className="text-[10px] font-semibold text-slate-500">{statusLabel(row.status)}</p></div></div><p className="mt-2 text-[11px] leading-5 text-slate-500">This area is using the current editable project geometry. Changes stay linked to Review and BOQ.</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Undo stack</p><p className="mt-1 text-sm font-bold text-slate-800">{st.geometryUndo.length} reversible change{st.geometryUndo.length===1?"":"s"}</p><p className="mt-1 text-[11px] text-slate-500">Use Undo or Ctrl+Z to reverse the latest geometry edit.</p></div></div>;
}
export function TakeoffStatusBar({ element,viewportName,scale,snap,ortho }:{ element:string; viewportName:string; scale:number; snap:boolean; ortho:boolean }) {
  const rows=useTakeoffRows(element); const id=useDemoStore((s)=>s.selectedEntityId); const review=rows.filter((r)=>r.status==="needs_review").length;
  const selected=id?rows.find((row)=>row.id===id):undefined;
  return <div className="flex h-8 items-center justify-between border-t border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-500"><div className="flex min-w-0 items-center gap-3"><span className="max-w-[220px] truncate">{viewportName}</span><span>Scale {scale>0?`1:${Math.max(1,Math.round(1/scale/3.7795275591))}`:"—"}</span><span>Snap {snap?"ON":"OFF"}</span><span>Ortho {ortho?"ON":"OFF"}</span></div><div className="flex items-center gap-3"><span>{review?`${review} need review`:"Review clear"}</span><span className="max-w-[260px] truncate">{selected?`Selected: ${selected.title}`:`${rows.length} items`}</span><span className="text-emerald-600">Saved ✓</span></div></div>;
}
function Head({title,sub}:{title:string;sub:string}){return <div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{sub}</p></div>};
function Card({label,value,meta}:{label:string;value:string;meta:string}){return <div className="rounded-xl border border-slate-200 p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-800">{value}</p><p className="mt-1 text-[10px] text-slate-500">{meta}</p></div>};
function Empty({text}:{text:string}){return <div className="flex h-full items-center justify-center p-6 text-center text-xs leading-5 text-slate-400">{text}</div>};
