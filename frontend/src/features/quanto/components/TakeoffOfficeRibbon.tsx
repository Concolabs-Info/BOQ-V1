"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import { useDemoStore } from "@/features/demo/store";
import { appRoutes } from "@/shared/constants/appRoutes";
import {
  commandId,
  dispatchTakeoffCommand,
  dispatchTakeoffStatus,
  TAKEOFF_STATUS_EVENT,
  TAKEOFF_VIEW_EVENT,
  type TakeoffViewState,
  type TakeoffWorkspaceStatus,
} from "../takeoffCommands";
import { usePdfSnapModes } from "../snapping/pdfVectorSnap";
import { friendlyRoomLabel } from "../friendlyLabels";

type RibbonTab =
  | "home"
  | "draw"
  | "edit"
  | "measure"
  | "view";

type RibbonCommand = {
  label: string;
  icon: IconName;
  accent?: "blue" | "green" | "amber" | "violet";
  wide?: boolean;
};

type RibbonGroup = { label: string; commands: RibbonCommand[] };
type IconName =
  | "pointer"
  | "hand"
  | "zoom-in"
  | "zoom-out"
  | "page"
  | "area"
  | "line"
  | "count"
  | "edit"
  | "copy"
  | "undo"
  | "layers"
  | "measure"
  | "template"
  | "review"
  | "report"
  | "ai";

const tabs: Array<[RibbonTab, string]> = [
  ["home", "Home"],
  ["draw", "Draw"],
  ["edit", "Edit"],
  ["measure", "Measure"],
  ["view", "View"],
];

const ribbon: Record<RibbonTab, RibbonGroup[]> = {
  home: [
    { label: "Selection", commands: [{ label: "Select", icon: "pointer", accent: "blue" }] },
    { label: "Navigate", commands: [{ label: "Previous", icon: "undo" }, { label: "Next", icon: "undo" }] },
    { label: "Zoom & Pan", commands: [{ label: "Pan", icon: "hand" }, { label: "Zoom in", icon: "zoom-in" }, { label: "Zoom out", icon: "zoom-out" }, { label: "Fit page", icon: "page" }] },
    { label: "Clipboard", commands: [{ label: "Cut", icon: "edit" }, { label: "Copy", icon: "copy" }, { label: "Paste", icon: "copy" }, { label: "Duplicate", icon: "copy" }] },
    { label: "History", commands: [{ label: "Undo", icon: "undo" }, { label: "Redo", icon: "undo" }] },
    { label: "Object", commands: [{ label: "Delete", icon: "edit" }] },
  ],
  draw: [
    { label: "Area", commands: [{ label: "Polygon", icon: "area", accent: "green" }, { label: "Rectangle", icon: "area" }, { label: "Freehand", icon: "area" }, { label: "Add area", icon: "area" }, { label: "Subtract", icon: "area" }, { label: "Cutout", icon: "area" }] },
    { label: "Linear", commands: [{ label: "Linear", icon: "line", accent: "blue" }, { label: "Continue", icon: "line" }, { label: "Offset", icon: "line" }] },
    { label: "Segment", commands: [{ label: "Segment", icon: "line" }, { label: "Multi segment", icon: "line" }, { label: "Count", icon: "count" }] },
    { label: "Sections", commands: [{ label: "New section", icon: "page", accent: "violet" }, { label: "Add existing", icon: "page" }, { label: "Remove", icon: "edit" }] },
  ],
  edit: [
    { label: "Selection", commands: [{ label: "Select", icon: "pointer", accent: "blue" }, { label: "Multi select", icon: "pointer" }, { label: "Select area", icon: "area" }, { label: "Same family", icon: "layers" }] },
    { label: "Geometry", commands: [{ label: "Move", icon: "hand" }, { label: "Edit points", icon: "edit" }, { label: "Add vertex", icon: "count" }, { label: "Delete vertex", icon: "edit" }, { label: "Rotate", icon: "undo" }, { label: "Resize", icon: "area" }] },
    { label: "Modify", commands: [{ label: "Split", icon: "line", accent: "amber" }, { label: "Merge", icon: "area" }, { label: "Join", icon: "line" }, { label: "Trim", icon: "edit" }, { label: "Extend", icon: "line" }, { label: "Offset", icon: "line" }] },
    { label: "Object", commands: [{ label: "Duplicate", icon: "copy" }, { label: "Lock", icon: "review" }, { label: "Delete", icon: "edit" }] },
  ],
  measure: [
    { label: "Scale", commands: [{ label: "Set scale", icon: "measure", accent: "blue" }, { label: "Verify scale", icon: "review" }] },
    { label: "Measure", commands: [{ label: "Distance", icon: "measure" }, { label: "Horizontal", icon: "line" }, { label: "Vertical", icon: "line" }, { label: "Angle", icon: "measure" }, { label: "Area", icon: "area" }, { label: "Perimeter", icon: "area" }, { label: "Radius", icon: "measure" }] },
  ],
  view: [
    { label: "Zoom", commands: [{ label: "Zoom in", icon: "zoom-in" }, { label: "Zoom out", icon: "zoom-out" }, { label: "Fit page", icon: "page" }, { label: "Fit selection", icon: "pointer" }, { label: "Previous view", icon: "undo" }] },
    { label: "Visibility", commands: [{ label: "Drawing", icon: "page" }, { label: "Takeoff", icon: "area", accent: "blue" }, { label: "Labels", icon: "page" }, { label: "Dimensions", icon: "measure" }] },
    { label: "Panels", commands: [{ label: "Layers", icon: "layers" }, { label: "Properties", icon: "edit" }, { label: "Full screen", icon: "page" }] },
    { label: "Drawing aids", commands: [{ label: "Snap", icon: "pointer", accent: "blue" }, { label: "Snap settings", icon: "measure" }, { label: "Ortho", icon: "line" }] },
  ],
};

const contextual: Record<string, RibbonGroup> = {
  columns: { label: "Column", commands: [{ label: "Count", icon: "count" }, { label: "Box", icon: "area" }, { label: "Section", icon: "template" }, { label: "Height", icon: "measure" }] },
  beams: { label: "Beam", commands: [{ label: "Endpoints", icon: "line" }, { label: "Width", icon: "measure" }, { label: "Depth", icon: "measure" }, { label: "Split", icon: "line" }, { label: "Join", icon: "line" }, { label: "Support", icon: "review" }] },
  slab: { label: "Slab", commands: [{ label: "Boundary", icon: "area" }, { label: "Cutout", icon: "area" }, { label: "Thickness", icon: "measure" }, { label: "Edges", icon: "line" }] },
  floor: { label: "Floor", commands: [{ label: "Boundary", icon: "area" }, { label: "Split", icon: "line" }, { label: "Merge", icon: "area" }, { label: "Add area", icon: "area" }, { label: "Deduct", icon: "area" }, { label: "Finish", icon: "template" }] },
  ceiling: { label: "Ceiling", commands: [{ label: "Boundary", icon: "area" }, { label: "Zones", icon: "layers" }, { label: "Bulkhead", icon: "line" }, { label: "Height", icon: "measure" }] },
  "doors-windows": { label: "Openings", commands: [{ label: "Count", icon: "count" }, { label: "Box", icon: "area" }, { label: "Host wall", icon: "line" }, { label: "Schedule", icon: "template" }] },
  walls: { label: "Wall", commands: [{ label: "Continue", icon: "line" }, { label: "Thickness", icon: "measure" }, { label: "Height", icon: "measure" }, { label: "Split", icon: "line" }, { label: "Join", icon: "line" }, { label: "Finishes", icon: "template" }] },
  roof: { label: "Roof", commands: [{ label: "Boundary", icon: "area" }, { label: "Pitch", icon: "measure" }, { label: "Ridge", icon: "line" }, { label: "Valley", icon: "line" }, { label: "Eave", icon: "line" }, { label: "Opening", icon: "area" }] },
  "stairs-ramps": { label: "Stairs", commands: [{ label: "Flight", icon: "line" }, { label: "Landing", icon: "area" }, { label: "Risers", icon: "count" }, { label: "Slope", icon: "measure" }] },
  foundation: { label: "Foundation", commands: [{ label: "Footing", icon: "area" }, { label: "Pile", icon: "count" }, { label: "Ground beam", icon: "line" }, { label: "Depth", icon: "measure" }] },
};

export function TakeoffOfficeRibbon({ projectId, element, view, elementName }: { projectId: string; element: string; view: string; elementName: string }) {
  const search = useSearchParams();
  const floorPartSuffix = element === "floor" && search.get("floorPart")
    ? `?floorPart=${encodeURIComponent(search.get("floorPart") || "areas")}`
    : "";
  const [active, setActive] = useState<RibbonTab>("home");
  const [activeCommand, setActiveCommand] = useState("home-navigate-select");
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [snapSettingsOpen,setSnapSettingsOpen]=useState(false);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null);
  const [drawingView, setDrawingView] = useState<TakeoffViewState>({ zoom: 1, x: 0, y: 0, fullscreen: false });
  const snapModes=usePdfSnapModes();
  const context = contextual[element];
  const groups = useMemo(() => active === "draw" && context ? [...ribbon[active], context] : ribbon[active], [active, context]);
  const availableCommands = useMemo(() => tabs.flatMap(([tab]) => {
    const items = tab === "draw" && context ? [...ribbon[tab], context] : ribbon[tab];
    return items.flatMap((group) => group.commands.map((command) => ({ tab, group: group.label, command })));
  }), [context]);
  function run(tab:RibbonTab,group:string,command:RibbonCommand){
    const id=commandId(tab,group,command.label);setActive(tab);setActiveCommand(id);
    dispatchTakeoffStatus({ message: command.label });
    if(command.label==="Snap settings"){setSnapSettingsOpen(true);return;}
    dispatchTakeoffCommand({id,label:command.label,tab,group,element});
  }
  function runQuickAction(label: "Undo" | "Redo" | "Delete") {
    dispatchTakeoffStatus({ message: label });
    dispatchTakeoffCommand({ id: commandId("home", "Quick actions", label), label, tab: "home", group: "Quick actions", element });
  }
  function runViewAction(label: "Zoom in" | "Zoom out" | "Fit page" | "Full screen") {
    dispatchTakeoffCommand({ id: commandId("view", "Zoom", label), label, tab: "view", group: "Zoom", element });
  }
  useEffect(() => {
    const listener = (event: Event) => setDrawingView((event as CustomEvent<TakeoffViewState>).detail);
    window.addEventListener(TAKEOFF_VIEW_EVENT, listener);
    return () => window.removeEventListener(TAKEOFF_VIEW_EVENT, listener);
  }, []);
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(target?.closest("input,textarea,select,[contenteditable='true']"))return;
      const key=event.key.toLowerCase(), ctrl=event.ctrlKey||event.metaKey;
      if(ctrl&&key==="k"){event.preventDefault();setCommandOpen((value)=>!value);return;}
      if(ctrl&&(key==="+"||key==="="||key==="-"||key==="0")){
        event.preventDefault();
        const label=key==="-"?"Zoom out":key==="0"?"Fit page":"Zoom in";
        const preferred=availableCommands.find((item)=>item.tab==="home"&&item.command.label===label)||availableCommands.find((item)=>item.command.label===label);
        if(preferred)run(preferred.tab,preferred.group,preferred.command);
        return;
      }
      const shortcut=ctrl?(key==="c"?"Copy":key==="v"?"Paste":key==="d"?"Duplicate":key==="z"?"Undo":key==="y"?"Redo":null):(event.key==="Delete"||event.key==="Backspace"?"Delete":event.key==="F3"?"Snap":key==="v"?"Select":key==="h"?"Pan":key==="a"?"Area":key==="l"?"Linear":key==="s"?"Segment":key==="c"?"Count":key==="m"?"Distance":key==="escape"?"Select":null);
      if(!shortcut)return;
      const preferred=availableCommands.find((item)=>item.command.label===shortcut&&(shortcut==="Area"?item.tab==="home":true))||availableCommands.find((item)=>item.command.label===shortcut);
      if(preferred){event.preventDefault();run(preferred.tab,preferred.group,preferred.command);if(key==="escape")setCommandOpen(false);}
    };
    window.addEventListener("keydown",listener);
    return()=>window.removeEventListener("keydown",listener);
  });
  useEffect(()=>{const open=(event:MouseEvent)=>{const target=event.target as HTMLElement|null;if(!target?.closest('[aria-label="Drawing viewer"]'))return;event.preventDefault();setContextMenu({x:Math.min(event.clientX,window.innerWidth-230),y:Math.min(event.clientY,window.innerHeight-360)});};const close=()=>setContextMenu(null);window.addEventListener("contextmenu",open,true);window.addEventListener("pointerdown",close);window.addEventListener("scroll",close,true);return()=>{window.removeEventListener("contextmenu",open,true);window.removeEventListener("pointerdown",close);window.removeEventListener("scroll",close,true);};},[]);
  const contextCommands=["Cut","Copy","Paste","Duplicate","Edit points",...(["floor","ceiling","roof"].includes(element)?["Add vertex","Delete vertex"]:[]),...(element==="walls"||element==="beams"?["Split","Join"]:[]),...(element==="walls"?["Trim","Extend","Offset"]:[]),...(["floor","ceiling","roof","walls","doors","windows","doors-windows"].includes(element)?["Lock"]:[]),"Delete"];
  return (
    <><div aria-label={`${elementName} takeoff ribbon`} className="shrink-0 border-b border-slate-300 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end border-b border-slate-200 bg-[#f8f9fb] px-2 pt-1">
        <div className="flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActive(key)} className={active === key ? "shrink-0 border-b-2 border-blue-600 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-blue-700" : "shrink-0 border-b-2 border-transparent px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 hover:bg-white hover:text-slate-950"}>{label}</button>)}
        </div>
        <div aria-label="Zoom controls" className="mb-1 flex h-[34px] shrink-0 items-center overflow-hidden rounded-md border border-slate-300 bg-white text-[10px] font-semibold text-slate-700">
          <button type="button" title="Zoom out (Ctrl+-)" aria-label="Zoom out" onClick={() => runViewAction("Zoom out")} className="h-full px-2.5 text-sm hover:bg-slate-100">−</button>
          <span className="min-w-[46px] border-x border-slate-200 px-2 text-center text-slate-500" aria-live="polite">{Math.round(drawingView.zoom * 100)}%</span>
          <button type="button" title="Zoom in (Ctrl++)" aria-label="Zoom in" onClick={() => runViewAction("Zoom in")} className="h-full px-2.5 text-sm hover:bg-slate-100">+</button>
          <button type="button" title="Fit drawing (Ctrl+0)" onClick={() => runViewAction("Fit page")} className="h-full border-l border-slate-200 px-2.5 hover:bg-slate-100">Fit</button>
          <button type="button" title="Show drawing full screen" onClick={() => runViewAction("Full screen")} className="h-full border-l border-slate-200 px-2.5 hover:bg-slate-100">Full screen</button>
        </div>
        <div className="flex min-w-0 items-center">
          <div aria-label="Quick actions" className="mb-1 ml-2 flex shrink-0 items-center overflow-hidden rounded-md border border-slate-300 bg-white">
            {(["Undo", "Redo", "Delete"] as const).map((label) => <button key={label} type="button" title={`${label}${label === "Undo" ? " (Ctrl+Z)" : label === "Redo" ? " (Ctrl+Y)" : " (Delete)"}`} aria-label={label} onClick={() => runQuickAction(label)} className={label === "Delete" ? "flex h-8 items-center gap-1.5 border-l border-slate-200 px-2.5 text-[10px] font-semibold text-red-600 hover:bg-red-50" : "flex h-8 items-center gap-1.5 border-l border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 first:border-l-0 hover:bg-slate-100"}><span className="text-base leading-none" aria-hidden="true">{commandEmoji(label)}</span><span>{label}</span></button>)}
          </div>
          <div className="mb-1 ml-auto flex shrink-0 items-center rounded-md border border-slate-300 bg-white p-0.5">
            {[["dimension", "Drawing"], ["workbook", "Workbook"], ["3d", "3D"]].map(([key, label]) => <Link key={key} href={`${appRoutes.takeoff(projectId, element, key)}${floorPartSuffix}`} className={view === key ? "rounded bg-slate-800 px-3 py-1.5 text-[10px] font-bold text-white" : "rounded px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"}>{label}</Link>)}
          </div>
        </div>
      </div>
      <div className="flex h-[108px] w-full min-w-0 overflow-x-auto bg-[#f4f6f8] px-2 py-1.5 [scrollbar-width:thin]">
        {groups.map((group, groupIndex) => <div key={group.label} style={{ flexGrow: Math.max(1, group.commands.length), flexBasis: 0 }} className={`flex min-w-max flex-col border-r border-slate-300 px-2 last:border-r-0 ${groupTint(groupIndex)}`}><div className="flex min-h-0 w-full flex-1 items-start justify-around gap-1">{group.commands.map((command) => { const id = commandId(active, group.label, command.label); return <button key={`${group.label}-${command.label}`} type="button" title={command.label} aria-pressed={activeCommand === id} onClick={() => run(active,group.label,command)} className={`${command.wide ? "min-w-[72px]" : "min-w-[56px]"} group flex h-[74px] flex-col items-center justify-center gap-1 rounded px-1 text-[10px] font-medium leading-tight text-slate-700 hover:bg-white hover:shadow-sm ${activeCommand === id ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200" : ""}`}><CommandVisual command={command} /><span className="max-w-[68px] text-center">{command.label}</span></button>; })}</div><p className="mt-auto border-t border-slate-200/80 pt-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.label}</p></div>)}
      </div>
    </div>{commandOpen?<div className="fixed inset-0 z-[150] flex items-start justify-center bg-slate-950/25 pt-[11vh] backdrop-blur-[1px]" onMouseDown={()=>setCommandOpen(false)}><div className="w-[560px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event)=>event.stopPropagation()}><div className="border-b border-slate-200 p-3"><input autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search all Takeoff commands…" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-blue-300"/></div><div className="max-h-[440px] overflow-y-auto p-2">{availableCommands.filter((item)=>`${item.command.label} ${item.group} ${item.tab}`.toLowerCase().includes(query.toLowerCase())).map((item)=><button key={`${item.tab}-${item.group}-${item.command.label}`} onClick={()=>{run(item.tab,item.group,item.command);setCommandOpen(false);setQuery("");}} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"><span><span className="block text-sm font-semibold text-slate-700">{item.command.label}</span><span className="text-[10px] uppercase tracking-wide text-slate-400">{item.tab} · {item.group}</span></span><CommandVisual command={item.command}/></button>)}</div></div></div>:null}{snapSettingsOpen?<div className="fixed inset-0 z-[160] flex items-start justify-center bg-slate-950/30 pt-[14vh]" onMouseDown={()=>setSnapSettingsOpen(false)}><div className="w-[380px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onMouseDown={(event)=>event.stopPropagation()}><div className="flex items-start justify-between"><div><h3 className="text-base font-bold text-slate-900">Object snap settings</h3><p className="mt-1 text-xs leading-5 text-slate-500">Choose which PDF and takeoff geometry targets the cursor may acquire.</p></div><button onClick={()=>setSnapSettingsOpen(false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button></div><div className="mt-4 space-y-2">{(["endpoint","midpoint","intersection","nearest","grid"] as const).map((kind)=><label key={kind} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5"><span className="text-sm font-semibold capitalize text-slate-700">{kind}</span><input type="checkbox" checked={snapModes.modes[kind]} onChange={(event)=>snapModes.setMode(kind,event.target.checked)} className="h-4 w-4 accent-blue-600"/></label>)}</div><p className="mt-4 text-[11px] leading-5 text-slate-500">Hold Alt while drawing to temporarily suppress snapping. F3 toggles Snap on or off.</p></div></div>:null}{contextMenu?<div className="fixed z-[170] w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={{left:contextMenu.x,top:contextMenu.y}} onPointerDown={(event)=>event.stopPropagation()}>{contextCommands.map((label,index)=><div key={label}>{index===4||label==="Lock"?<div className="my-1 border-t border-slate-100"/>:null}<button className={label==="Delete"?"w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50":"w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"} onClick={()=>{dispatchTakeoffCommand({id:commandId("edit","Context",label),label,tab:"edit",group:"Context",element});dispatchTakeoffStatus({message:label});setContextMenu(null);}}>{commandEmoji(label)||"•"}<span className="ml-2">{label}</span></button></div>)}</div>:null}</>
  );
}

export function TakeoffOfficeStatusBar({ elementName }: { elementName: string }) {
  const selectedId = useDemoStore((state) => state.selectedEntityId);
  const selectedIds = useDemoStore((state) => state.selectedEntityIds);
  const selectedLabel = useDemoStore((state) => {
    const id = state.selectedEntityId;
    if (!id) return null;
    const zone = [...state.floorZones, ...state.ceilingZones].find((item) => item.id === id);
    if (zone) return friendlyRoomLabel(zone.room);
    const opening = state.openings.find((item) => item.id === id);
    if (opening) return opening.openingTag || state.openingFamilies.find((item) => item.id === opening.familyId)?.description || (opening.kind === "door" ? "Door" : "Window");
    const wall = state.walls.find((item) => item.id === id);
    if (wall) return state.wallFamilies.find((item) => item.id === wall.familyId)?.description || "Wall";
    const roof = state.roofZones.find((item) => item.id === id);
    if (roof) return `${roof.scope} roof area`;
    return "Takeoff item";
  });
  const selectedViewportId = useDemoStore((state) => state.selectedViewportId);
  const viewport = useDemoStore((state) => state.viewports.find((item) => item.id === selectedViewportId));
  const [view, setView] = useState<TakeoffViewState>({ zoom: 1, x: 0, y: 0, fullscreen: false });
  const [status, setStatus] = useState<TakeoffWorkspaceStatus>({ snap: true, ortho: false, saving: "saved" });
  useEffect(() => {
    const viewListener = (event: Event) => setView((event as CustomEvent<TakeoffViewState>).detail);
    const statusListener = (event: Event) => setStatus((current) => ({ ...current, ...(event as CustomEvent<TakeoffWorkspaceStatus>).detail }));
    window.addEventListener(TAKEOFF_VIEW_EVENT, viewListener);
    window.addEventListener(TAKEOFF_STATUS_EVENT, statusListener);
    return () => { window.removeEventListener(TAKEOFF_VIEW_EVENT, viewListener); window.removeEventListener(TAKEOFF_STATUS_EVENT, statusListener); };
  }, []);
  return <div className="flex h-7 shrink-0 items-center justify-between gap-3 overflow-hidden border-t border-slate-300 bg-[#eef2f6] px-3 text-[10px] font-medium text-slate-600"><div className="flex min-w-0 items-center gap-4"><span className="truncate font-semibold text-slate-800">{viewport?.name || elementName}</span><span>Scale {viewport?.scaleMPerPx ? "calibrated" : "—"}</span><span>{Math.round(view.zoom * 100)}%</span><span>X {Math.round(view.x)}</span><span>Y {Math.round(view.y)}</span><span className={status.snap ? "text-blue-700" : ""}>Snap {status.snap ? "ON" : "OFF"}</span><span>Ortho {status.ortho ? "ON" : "OFF"}</span></div><div className="flex shrink-0 items-center gap-4"><span>{status.message}</span><span>{selectedIds.length > 1 ? `${selectedIds.length} selected` : selectedId ? `Selected: ${selectedLabel}` : "0 selected"}</span><span className={status.saving === "saved" ? "text-emerald-700" : "text-amber-700"}>{status.saving === "saving" ? "Saving…" : status.saving === "editing" ? "Editing…" : "Saved ✓"}</span></div></div>;
}

function accentClass(accent?: RibbonCommand["accent"]) {
  if (accent === "green") return "bg-emerald-100 text-emerald-700";
  if (accent === "amber") return "bg-amber-100 text-amber-700";
  if (accent === "violet") return "bg-violet-100 text-violet-700";
  if (accent === "blue") return "bg-blue-100 text-blue-700";
  return "bg-white text-slate-600 ring-1 ring-slate-200 group-hover:text-blue-700";
}

function CommandVisual({ command }: { command: RibbonCommand }) {
  const emoji = commandEmoji(command.label);
  if (command.icon === "page" && ["Open", "Fit page", "Drawing", "Information", "Preview"].includes(command.label)) {
    return <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-50 to-rose-100 text-xl shadow-sm ring-1 ring-red-200"><span aria-hidden="true">📄</span><span className="absolute -bottom-0.5 rounded-sm bg-red-600 px-1 text-[6px] font-black tracking-wide text-white">PDF</span></span>;
  }
  if (emoji) return <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-[21px] shadow-sm ring-1 ring-black/5 ${visualClass(command.icon, command.accent)}`} aria-hidden="true">{emoji}</span>;
  return <span className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm ${visualClass(command.icon, command.accent)}`}><RibbonIcon name={command.icon} className="h-5 w-5" /></span>;
}

function commandEmoji(label: string) {
  const values: Record<string, string> = {
    Cut: "✂️", Copy: "📋", Paste: "📥", Duplicate: "🗐", Delete: "🗑️",
    Undo: "↶", Redo: "↷", Previous: "⬅️", Next: "➡️", Search: "🔎",
    Bookmarks: "🔖", Rotate: "🔄", Overlay: "🗂️", Compare: "🔀", Align: "📐",
    Opacity: "◐", Polygon: "🔷", Rectangle: "▭", Freehand: "✍️", "Add area": "➕",
    Subtract: "➖", Cutout: "⬚", Linear: "📏", Continue: "⤴️", Offset: "↔️",
    Segment: "📐", "Multi segment": "〽️", Count: "🔢", "New section": "📑",
    "Add existing": "➕", Remove: "➖", Endpoints: "🎯", Width: "↔️", Depth: "↕️",
    Split: "✂️", Join: "🔗", Support: "🛡️", Select: "➤", "Multi select": "☑️",
    Move: "✥", "Edit points": "✏️", "Add vertex": "➕", "Delete vertex": "➖",
    Resize: "⤢", Merge: "🔗", Trim: "✂️", Extend: "↗️", Lock: "🔒",
    "Set scale": "📐", "Verify scale": "✅", Distance: "📏", Horizontal: "↔️",
    Vertical: "↕️", Angle: "📐", Area: "🟩", Perimeter: "🔲", Radius: "⭕",
    Dimension: "📏", "To takeoff": "✅",
    Layers: "🗂️", Properties: "⚙️", Evidence: "🔍", "Full screen": "⛶",
    Families: "🧩", Materials: "🧱", Assemblies: "🧰", Favorites: "⭐",
    Project: "📁", Company: "🏢", Import: "📥", "New template": "➕",
    "BOQ mapping": "🔗", Formulas: "ƒx", Waste: "％", Workbook: "📊",
    Summary: "📈", Rates: "💲", Units: "📐", "Copy to level": "🏢",
    "Typical floor": "🏬", Confirm: "✅", "Needs review": "⚠️", Reject: "❌",
    Hold: "⏸️", "Previous issue": "⬅️", "Next issue": "➡️", "Resolve all": "✅",
    "Show evidence": "🔍", Explain: "✨", "Find similar": "🪄", "Takeoff summary": "📊",
    Element: "🧱", Family: "🧩", Level: "🏢", Unreviewed: "⚠️",
    "Manual changes": "✏️", "Evidence report": "📑", Export: "📤", Print: "🖨️",
    Pan: "✋", Snap: "🧲", Ortho: "📐",
    Boundary: "🔷", Thickness: "↕️", Height: "↕️", Finish: "🎨", Finishes: "🎨",
    Pitch: "📐", Ridge: "⛰️", Valley: "〽️", Eave: "🏠", Opening: "⬚",
    Flight: "🪜", Landing: "▰", Risers: "🪜", Slope: "📐", Footing: "⬛",
    Pile: "●", "Ground beam": "━", Box: "▣", Section: "▤", Schedule: "📋",
  };
  return values[label] || "";
}

function visualClass(icon: IconName, accent?: RibbonCommand["accent"]) {
  if (accent === "green") return "bg-gradient-to-br from-emerald-50 to-emerald-200 text-emerald-800";
  if (accent === "amber") return "bg-gradient-to-br from-amber-50 to-amber-200 text-amber-800";
  if (accent === "violet") return "bg-gradient-to-br from-violet-50 to-violet-200 text-violet-800";
  if (accent === "blue") return "bg-gradient-to-br from-blue-50 to-blue-200 text-blue-800";
  if (["area", "count"].includes(icon)) return "bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-800";
  if (["line", "measure"].includes(icon)) return "bg-gradient-to-br from-sky-50 to-blue-100 text-blue-800";
  if (["edit", "undo", "copy"].includes(icon)) return "bg-gradient-to-br from-amber-50 to-orange-100 text-amber-800";
  if (["template", "layers", "ai"].includes(icon)) return "bg-gradient-to-br from-violet-50 to-purple-100 text-violet-800";
  if (["review", "report"].includes(icon)) return "bg-gradient-to-br from-rose-50 to-pink-100 text-rose-800";
  return "bg-gradient-to-br from-white to-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function groupTint(index: number) {
  return ["bg-white/30", "bg-blue-50/35", "bg-emerald-50/30", "bg-violet-50/30", "bg-amber-50/30"][index % 5];
}

function RibbonIcon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "pointer") return <svg {...common} {...props}><path d="m5 3 12 9-6 1.5L8 19 5 3Z" /></svg>;
  if (name === "hand") return <svg {...common} {...props}><path d="M7 11V7a1.5 1.5 0 0 1 3 0v3-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v5c0 4-2.5 7-7 7-3 0-5-1.5-6.5-4L3 13a1.6 1.6 0 0 1 2.6-1.8L7 12" /></svg>;
  if (name === "zoom-in") return <svg {...common} {...props}><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M10 7v6M7 10h6" /></svg>;
  if (name === "zoom-out") return <svg {...common} {...props}><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6" /></svg>;
  if (name === "page") return <svg {...common} {...props}><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7" /></svg>;
  if (name === "area") return <svg {...common} {...props}><path d="m4 18 2-11 8-3 6 7-3 9H7Z" /><circle cx="6" cy="7" r="1" /><circle cx="20" cy="11" r="1" /></svg>;
  if (name === "line") return <svg {...common} {...props}><path d="M4 18 9 8l6 5 5-8" /><circle cx="4" cy="18" r="1.5" /><circle cx="20" cy="5" r="1.5" /></svg>;
  if (name === "count") return <svg {...common} {...props}><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="7" r="2.5" /><circle cx="7" cy="17" r="2.5" /><path d="M14 17h6M17 14v6" /></svg>;
  if (name === "copy") return <svg {...common} {...props}><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" /></svg>;
  if (name === "undo") return <svg {...common} {...props}><path d="M9 7 4 11l5 4M5 11h8a6 6 0 0 1 6 6" /></svg>;
  if (name === "layers") return <svg {...common} {...props}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></svg>;
  if (name === "measure") return <svg {...common} {...props}><path d="m4 17 13-13 3 3L7 20l-3-3Z" /><path d="m9 12 3 3M12 9l3 3M15 6l3 3" /></svg>;
  if (name === "template") return <svg {...common} {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></svg>;
  if (name === "review") return <svg {...common} {...props}><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></svg>;
  if (name === "report") return <svg {...common} {...props}><path d="M5 3h14v18H5zM8 16v-3M12 16V8M16 16v-5" /></svg>;
  if (name === "ai") return <svg {...common} {...props}><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" /></svg>;
  return <svg {...common} {...props}><path d="M4 20 20 4M14 4h6v6M4 14v6h6" /></svg>;
}
