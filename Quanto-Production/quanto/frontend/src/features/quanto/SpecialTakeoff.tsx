"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DemoDrawing, drawingSize, svgPoint } from "./components/DemoDrawing";
import {
  ResizableThreePane,
  ResizableTwoPane,
} from "./components/ResizablePanels";
import { DemoChat } from "./components/DemoChat";
import { ViewportCardLabel } from "./components/ViewportCardLabel";
import { useDemoStore } from "@/features/demo/store";
import {
  centroid,
  distance,
  edgeLengthM,
  polygonArea,
} from "@/features/demo/geometry";
import {
  floorFactor,
  floorName,
  scaleForViewport,
} from "@/features/demo/builders";
import { useSpecialStore } from "./specialStore";
import type { Flight, Pile, PileCap, SpecialElement } from "./specialTypes";
import type { BBox, Point } from "@/features/demo/types";
import { appRoutes } from "@/shared/constants/appRoutes";
import { dispatchTakeoffStatus, useTakeoffCommand } from "./takeoffCommands";
import { findPdfVectorSnap, usePdfSnapModes, usePdfVectorSource } from "./snapping/pdfVectorSnap";
import { MeasurementOverlay, useMeasurementTool } from "./measurements/MeasurementOverlay";
import type { MeasurementKind } from "./measurements/measurementStore";
import { exportTakeoffCsv, type ExportRow } from "./takeoffExport";

type Mode = "select" | "pan" | "draw" | "measure";
type SpecialDrawShape = "polygon" | "rectangle" | "freehand";
const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const button =
  "rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100";
const active =
  "rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white";
const viewports: Record<SpecialElement, string[]> = {
  "stairs-ramps": [
    "VP-GROUND",
    "VP-FIRST",
    "VP-TYP",
    "VP-TERRACE",
    "VP-SEC-AA",
    "VP-SEC-BB",
  ],
  foundation: ["VP-FOUND-INTERNAL", "VP-FOUND-BLIND", "VP-FOUND-COLUMNS", "VP-GROUND", "VP-SITE"],
};

function specialSnapPoint(point:Point,items:Array<Flight|Pile|PileCap>,snap:boolean,origin:Point|null,ortho:boolean){
  let next=point;
  if(snap){
    const candidates:Point[]=[];
    items.forEach((item)=>{
      if("points" in item)candidates.push(...item.points);
      else candidates.push({x:item.bbox.x,y:item.bbox.y},{x:item.bbox.x+item.bbox.width,y:item.bbox.y},{x:item.bbox.x+item.bbox.width,y:item.bbox.y+item.bbox.height},{x:item.bbox.x,y:item.bbox.y+item.bbox.height},{x:item.bbox.x+item.bbox.width/2,y:item.bbox.y+item.bbox.height/2});
    });
    let nearest:Point|null=null,nearestDistance=18;
    candidates.forEach((candidate)=>{const value=distance(point,candidate);if(value<nearestDistance){nearest=candidate;nearestDistance=value;}});
    if(nearest)next=nearest;
  }
  if(origin&&ortho){const dx=next.x-origin.x,dy=next.y-origin.y;next=Math.abs(dx)>=Math.abs(dy)?{x:next.x,y:origin.y}:{x:origin.x,y:next.y};}
  return next;
}

export function SpecialTakeoff({
  projectId,
  element,
  view,
}: {
  projectId: string;
  element: SpecialElement;
  view: string;
}) {
  return view === "workbook" ? (
    <SpecialWorkbook element={element} />
  ) : view === "3d" ? (
    <Special3D element={element} />
  ) : (
    <SpecialDimension projectId={projectId} element={element} />
  );
}

function SpecialDimension({
  projectId,
  element,
}: {
  projectId: string;
  element: SpecialElement;
}) {
  const router = useRouter();
  const demo = useDemoStore(),
    st = useSpecialStore();
  const productionStairViewports = element === "stairs-ramps" && demo.viewports.some((v) => Boolean((v as typeof v & { scopeRole?: string }).scopeRole))
    ? demo.viewports.map((v) => v.id)
    : null;
  const allowed = productionStairViewports || viewports[element];
  const viewport =
    demo.viewports.find(
      (v) => v.id === demo.selectedViewportId && allowed.includes(v.id),
    ) || demo.viewports.find((v) => v.id === allowed[0]) || demo.viewports[0]!;
  const vectorSheet=demo.sheets.find((sheet)=>sheet.id===viewport?.sheetId);
  const vectorSize=drawingSize(vectorSheet);
  const pdfVectors=usePdfVectorSource(
    vectorSheet?`project-page:${projectId}:${vectorSheet.page}:${vectorSize.width}x${vectorSize.height}`:"",
    vectorSheet?`/api/v1/projects/${projectId}/pages/${vectorSheet.page}/vectors?width=${vectorSize.width}&height=${vectorSize.height}`:"",
  );
  const pdfSnapModes=usePdfSnapModes().modes;
  const [tab, setTab] = useState<"drawings" | "families">("drawings"),
    [rightTab, setRightTab] = useState<"properties" | "ai">("ai"),
    [mode, setMode] = useState<Mode>("select"),
    [draft, setDraft] = useState<Point[]>([]),
    [measurementKind, setMeasurementKind] = useState<MeasurementKind>("distance"),
    [minimap, setMinimap] = useState(false),
    [layers, setLayers] = useState({
      flights: true,
      rails: true,
      piles: true,
      caps: true,
    }),
    [snap, setSnap] = useState(true),
    [ortho, setOrtho] = useState(false),
    [kind, setKind] = useState(element === "stairs-ramps" ? "flight" : "pile"),
    [drawShape,setDrawShape]=useState<SpecialDrawShape>("polygon"),
    [drawAction,setDrawAction]=useState<"create"|"subtract"|"cutout">("create"),
    [selectionBox,setSelectionBox]=useState<{start:Point;current:Point}|null>(null);
  const clipboard = useRef<Array<Flight | Pile | PileCap>>([]);
  const visibleFlights = st.flights.filter((x) => x.viewportId === viewport.id),
    visiblePiles = st.piles.filter((x) => x.viewportId === viewport.id),
    visibleCaps = st.caps.filter((x) => x.viewportId === viewport.id);
  const measurement = useMeasurementTool({
    viewportId: `special:${viewport.id}`,
    scale: scaleForViewport(viewport.id),
    active: mode === "measure",
    deleteEnabled: mode === "select" || mode === "measure",
    kind: measurementKind,
  });
  const visibleSelectableIds = useMemo(() => (element === "stairs-ramps" ? visibleFlights : [...visiblePiles, ...visibleCaps]).map((item) => item.id), [element, visibleCaps, visibleFlights, visiblePiles]);
  useEffect(()=>{const keyDown=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(target?.closest("input,textarea,select,[contenteditable=true]")||mode!=="select")return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="a"){event.preventDefault();st.selectMany(visibleSelectableIds);return;}
    if(event.key==="Escape"){st.selectMany([]);return;}if(event.key!=="Tab"||!visibleSelectableIds.length)return;event.preventDefault();const current=visibleSelectableIds.indexOf(st.selectedId||"");st.select(visibleSelectableIds[(current+(event.shiftKey?-1:1)+visibleSelectableIds.length)%visibleSelectableIds.length]);};window.addEventListener("keydown",keyDown);return()=>window.removeEventListener("keydown",keyDown);},[mode,st.select,st.selectMany,st.selectedId,visibleSelectableIds]);
  function snappedPoint(p:Point,origin:Point|null=draft.at(-1)||null){
    const semantic = specialSnapPoint(p, [...visibleFlights, ...visiblePiles, ...visibleCaps], snap, origin, ortho);
    const pdfTarget=snap?findPdfVectorSnap(p,pdfVectors.segments,18,pdfSnapModes):null;
    const semanticDistance=distance(p,semantic);
    return pdfTarget&&(semanticDistance<0.001||pdfTarget.distance<semanticDistance)?pdfTarget.point:semantic;
  }
  function click(p: Point) {
    const point=snappedPoint(p);
    if (mode === "measure") {
      measurement.canvasClick(point);
      return;
    }
    if (mode === "select") { st.select(null); return; }
    if (mode !== "draw") return;
    if (element === "foundation" && kind === "pile") {
      if (!st.pileFamilies.length) return;
      st.captureUndo();
      const f = st.pileFamilies[0],
        id = `PILE-${Date.now()}`;
      st.addPile({
        id,
        familyId: f.id,
        floorId: "GF",
        viewportId: viewport.id,
        bbox: { x: point.x - 22, y: point.y - 22, width: 44, height: 44 },
        lengthM: 12.5,
        commencingLevelM: 0,
        toeLevelM: -12.5,
        status: "ready",
      });
      setMode("select");
      return;
    }
    if (element === "stairs-ramps") {
      if(drawShape==="freehand")return;
      if(drawShape==="rectangle"){
        if(!draft.length)setDraft([point]);
        else finish(box(draft[0],point));
        return;
      }
      if (draft.length >= 3 && distance(point, draft[0]) <= 12) {
        finish(draft);
        return;
      }
      setDraft((current) => [...current, point]);
      return;
    }
    setDraft((d) => (d.length ? [d[0], point] : [point]));
  }
  function finish(points = draft) {
    if (points.length < (element === "stairs-ramps" ? 3 : 2)) return;
    st.captureUndo();
    const a = points[0], b = points[points.length - 1];
    if (element === "stairs-ramps") {
      if(drawAction!=="create"){
        const host=st.flights.find((item)=>item.id===st.selectedId&&item.viewportId===viewport.id);
        if(host)st.updateFlight(host.id,{voids:[...host.voids,points],status:"needs_review"});
        else dispatchTakeoffStatus({message:`Select the flight or ramp to ${drawAction==="cutout"?"cut out":"subtract from"} first`});
      }else{
        const id = `FLT-${Date.now()}`;
        const family = st.flightFamilies[0], rail = st.railFamilies[0];
        if (!family || !rail) { dispatchTakeoffStatus({ message: "Stair/ramp families are still loading" }); return; }
        st.addFlight({id,familyId:family.id,railFamilyId:rail.id,floorId:floorFor(viewport.id),viewportId:viewport.id,points,voids:[],railEdges:points.map(()=>false),railEdgesEdited:false,status:"needs_review",kind:family.kind});
      }
    } else {
      const id = `CAP-${Date.now()}`;
      st.addCap({
        id,
        familyId: st.capFamilies[0].id,
        floorId: "GF",
        viewportId: viewport.id,
        bbox: toBBox(a, b),
        hostPileIds: [],
        status: "ready",
      });
    }
    setDraft([]);
    setMode("select");
  }
  function remove() {
    const ids = st.selectedIds;
    if (!ids.length) return;
    st.captureUndo();
    ids.forEach((id) => {
      if (st.flights.some((x) => x.id === id)) st.deleteFlight(id);
      else if (st.piles.some((x) => x.id === id)) st.deletePile(id);
      else st.deleteCap(id);
    });
    st.selectMany([]);
  }
  const selected = element === "stairs-ramps"
    ? st.flights.find((x) => x.id === st.selectedId)
    : st.piles.find((x) => x.id === st.selectedId) ||
      st.caps.find((x) => x.id === st.selectedId);
  useEffect(() => {
    if (!selected) return;
    setTab("families");
    setRightTab("properties");
  }, [selected?.familyId, selected?.id]);
  function copySelected() {
    const items = st.selectedIds.map((id) => st.flights.find((x) => x.id === id) || st.piles.find((x) => x.id === id) || st.caps.find((x) => x.id === id)).filter((item): item is Flight | Pile | PileCap => Boolean(item));
    if (!items.length) { dispatchTakeoffStatus({ message: "Select an item first" }); return false; }
    clipboard.current = JSON.parse(JSON.stringify(items));
    dispatchTakeoffStatus({ message: `Copied ${items.length} item${items.length === 1 ? "" : "s"}` });
    return true;
  }
  function pasteSelected() {
    if (!clipboard.current.length) { dispatchTakeoffStatus({ message: "Nothing to paste" }); return; }
    const items:any[]=JSON.parse(JSON.stringify(clipboard.current));
    const suffix=Date.now().toString(36);
    st.captureUndo();
    const ids=items.map((item,index)=>{item.id=`${String(item.id).replace(/-COPY-[^-]+(?:-\d+)?$/,"")}-COPY-${suffix}-${index+1}`;item.viewportId=viewport.id;item.status="needs_review";
      if("points" in item){item.points=item.points.map((point:Point)=>({x:point.x+24,y:point.y+24}));item.voids=item.voids.map((ring:Point[])=>ring.map((point)=>({x:point.x+24,y:point.y+24})));st.addFlight(item);}
      else if("lengthM" in item){item.bbox={...item.bbox,x:item.bbox.x+24,y:item.bbox.y+24};st.addPile(item);}
      else{item.bbox={...item.bbox,x:item.bbox.x+24,y:item.bbox.y+24};st.addCap(item);}return item.id as string;});
    st.selectMany(ids);setRightTab("properties");
  }
  function setSelectedStatus(status:"ready"|"confirmed"|"needs_review"){
    if(!st.selectedIds.length){dispatchTakeoffStatus({message:"Select an item first"});return;}
    st.selectedIds.forEach((id)=>{if(st.flights.some((x)=>x.id===id))st.updateFlight(id,{status});
    else if(st.piles.some((x)=>x.id===id))st.updatePile(id,{status});
    else st.updateCap(id,{status});});
  }
  function stepDrawing(direction:-1|1){const index=Math.max(0,allowed.indexOf(viewport.id));const next=allowed[(index+direction+allowed.length)%allowed.length];if(next)demo.setSelectedViewport(next);}
  function stepIssue(direction:-1|1){const rows=(element==="stairs-ramps"?st.flights:[...st.piles,...st.caps]).filter((item)=>item.status==="needs_review");if(!rows.length){dispatchTakeoffStatus({message:"No review issues"});return;}const index=rows.findIndex((item)=>item.id===st.selectedId),next=rows[(Math.max(0,index)+direction+rows.length)%rows.length];demo.setSelectedViewport(next.viewportId);st.select(next.id);setRightTab("properties");}
  function exportCurrentTakeoff(){
    const source=element==="stairs-ramps"?st.flights:[...st.piles,...st.caps];
    const rows:ExportRow[]=source.map((item)=>{
      let quantity:number,unit:string;
      if("points" in item){quantity=item.planAreaM2 ?? polygonArea(item.points)*scaleForViewport(item.viewportId)**2;unit="m²";}
      else if("lengthM" in item){quantity=item.lengthM;unit="m";}
      else{quantity=item.bbox.width*item.bbox.height*scaleForViewport(item.viewportId)**2;unit="m²";}
      return{ID:item.id,Element:element==="stairs-ramps"?"Stairs & ramps":"Foundation",Family:item.familyId,Level:floorName(item.floorId),Drawing:demo.viewports.find((value)=>value.id===item.viewportId)?.name||item.viewportId,Quantity:Number(quantity.toFixed(3)),Unit:unit,Status:item.status};
    });
    if(exportTakeoffCsv(`quanto-${element}-takeoff.csv`,rows))dispatchTakeoffStatus({message:`Exported ${rows.length} takeoff row${rows.length===1?"":"s"}`});
    else dispatchTakeoffStatus({message:"There is no takeoff data to export"});
  }
  useEffect(()=>{dispatchTakeoffStatus({selected:st.selectedIds.length>1?`${st.selectedIds.length} items`:st.selectedId,snap,ortho,saving:"saved"});},[ortho,snap,st.selectedId,st.selectedIds.length]);
  useEffect(()=>{if(snap&&pdfVectors.vectorAvailable)dispatchTakeoffStatus({message:`${pdfVectors.segments.length.toLocaleString()} PDF snap edges ready`});},[pdfVectors.segments.length,pdfVectors.vectorAvailable,snap]);
  useTakeoffCommand((command)=>{
    if(command.element!==element)return;
    const label=command.label.toLowerCase();
    const notify=(message:string)=>dispatchTakeoffStatus({message});
    if(["select","move","edit points","endpoints"].includes(label)){setMode("select");setDraft([]);}
    else if(label==="pan")setMode("pan");
    else if(label==="open"||label==="search")setTab("drawings");
    else if(label==="previous")stepDrawing(-1);
    else if(label==="next")stepDrawing(1);
    else if(label==="bookmarks"){setTab("drawings");notify("Viewports opened");}
    else if(["families","materials","assemblies","project","company"].includes(label))setTab("families");
    else if(label==="copy")copySelected();
    else if(label==="cut"){if(copySelected())remove();}
    else if(label==="paste")pasteSelected();
    else if(label==="duplicate"){if(copySelected())pasteSelected();}
    else if(label==="undo")st.undo();
    else if(label==="redo")st.redo();
    else if(label==="delete"||label==="remove"){if(measurement.selected)measurement.deleteSelected();else remove();}
    else if(["distance","horizontal","vertical","angle","area","perimeter","radius","dimension","verify scale"].includes(label)&&command.tab==="measure"){setMeasurementKind((["area","perimeter","radius","angle"].includes(label)?label:"distance") as MeasurementKind);setMode("measure");measurement.clearDraft();notify(`${label[0].toUpperCase()+label.slice(1)} measurement active`);}
    else if(label==="snap")setSnap((value)=>!value);
    else if(label==="ortho")setOrtho((value)=>!value);
    else if(label==="set scale"){
      const entered=window.prompt("Enter drawing scale (for example 100 for 1:100)","100"),denominator=Number(entered?.replace("1:",""));
      if(denominator>0){demo.updateViewport(viewport.id,{scaleMPerPx:1/(denominator*3.7795275591)});notify(`Scale set to 1:${denominator}`);}
    }
    else if(label==="layers")setTab("families");
    else if(["area","polygon","rectangle","freehand","boundary","add area","flight","landing"].includes(label)){
      if(element==="foundation"&&!['rectangle'].includes(label)){notify(`${command.label} applies to polygon-based areas; foundation pile caps use Rectangle`);return;}
      setKind(element==="stairs-ramps"?"flight":"cap");setDrawShape(label==="rectangle"?"rectangle":label==="freehand"?"freehand":"polygon");setDrawAction("create");setSnap(true);setMode("draw");setDraft([]);
    }
    else if(["subtract","cutout","opening"].includes(label)){
      if(element!=="stairs-ramps"){notify(`${command.label} is not applicable to pile or pile-cap placement`);return;}
      setKind("flight");setDrawShape("polygon");setDrawAction(label==="subtract"?"subtract":"cutout");setSnap(true);setMode("draw");setDraft([]);notify(`Select a flight or ramp, then draw the ${label==="subtract"?"area to subtract":"enclosed opening"}`);
    }
    else if(["count","box","pile"].includes(label)){setKind(element==="foundation"?"pile":"flight");setMode("draw");setDraft([]);}
    else if(["linear","segment","multi segment","continue","ground beam"].includes(label)){setMode("draw");setDraft([]);}
    else if(label==="confirm")setSelectedStatus("confirmed");
    else if(["needs review","reject","hold"].includes(label))setSelectedStatus("needs_review");
    else if(label==="previous issue")stepIssue(-1);
    else if(label==="next issue")stepIssue(1);
    else if(label==="unreviewed")stepIssue(1);
    else if(label==="resolve all")(element==="stairs-ramps"?st.flights:[...st.piles,...st.caps]).filter((item)=>item.status==="needs_review").forEach((item)=>{if(st.flights.some((x)=>x.id===item.id))st.updateFlight(item.id,{status:"confirmed"});else if(st.piles.some((x)=>x.id===item.id))st.updatePile(item.id,{status:"confirmed"});else st.updateCap(item.id,{status:"confirmed"});});
    else if(label==="properties"||["width","depth","height","slope","risers"].includes(label))setRightTab("properties");
    else if(label==="evidence"||label==="show evidence"||label==="evidence report"||label==="manual changes")setRightTab("properties");
    else if(["explain","find similar","ai results"].includes(label))setRightTab("ai");
    else if(label==="workbook"||label.includes("summary")||label==="preview"||["element","family","level"].includes(label))router.push(appRoutes.takeoff(projectId,element,"workbook"));
    else if(["boq mapping","formulas","waste","rates","units"].includes(label))router.push(appRoutes.workspaceBoq(projectId));
    else if(label==="export")exportCurrentTakeoff();
    else if(label==="print")window.print();
    else notify(`${command.label} is not connected in this workspace yet`);
  });
  return (
    <ResizableThreePane
      storageKey={`special:${element}`}
      defaultLeft={235}
      defaultRight={330}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <aside className="border-r border-slate-200">
        <div className="grid grid-cols-2 gap-1 border-b p-2">
          <button
            className={tab === "drawings" ? active : button}
            onClick={() => setTab("drawings")}
          >
            Viewports
          </button>
          <button
            className={tab === "families" ? active : button}
            onClick={() => setTab("families")}
          >
            Families
          </button>
        </div>
        {tab === "drawings" ? (
          <div className="space-y-2 p-3">
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" placeholder="Search drawings…" />
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{element === "stairs-ramps" && productionStairViewports ? "Scope evidence" : "Plans"}</p>
            {allowed.map((id) => {
              const v = demo.viewports.find((x) => x.id === id);
              const sheet = v ? demo.sheets.find((x) => x.id === v.sheetId) : null;
              return v ? (
                <button
                  key={id}
                  onClick={() => demo.setSelectedViewport(id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${viewport.id === id ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}
                >
                  <div className="flex gap-2">
                    <span className="relative flex h-9 w-8 shrink-0 items-center justify-center rounded bg-red-50 text-base ring-1 ring-red-200">📄<span className="absolute -bottom-0.5 rounded-sm bg-red-600 px-1 text-[5px] font-black text-white">PDF</span></span>
                    <ViewportCardLabel viewportName={v.name} sheetTitle={sheet?.title} sheetNumber={sheet?.sheetNo} category={v.category} revision={sheet?.revision}/>
                    <span className={v.status === "confirmed" ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" : "mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400"} />
                  </div>
                </button>
              ) : null;
            })}
          </div>
        ) : (
          <Families element={element} activeId={selected?.familyId || null} revealKey={selected?.id || ""} />
        )}
      </aside>
      <main className="relative min-w-0 bg-slate-100 p-3">
        <DemoDrawing
          viewportId={viewport.id}
          hideToolbar
          tool={mode === "pan" ? "pan" : "draw"}
          onCanvasClick={click}
          onCanvasMove={(point) => {
            if (mode !== "measure") return;
            const pdfTarget=snap?findPdfVectorSnap(point,pdfVectors.segments,18,pdfSnapModes):null;
            measurement.canvasMove(pdfTarget?.point || point);
          }}
          onCanvasDragStart={(point) => {
            if(mode==="select"){setSelectionBox({start:point,current:point});return;}
            if(mode!=="draw")return;
            const start=snappedPoint(point,null);
            if(element!=="stairs-ramps"||drawShape==="rectangle")setDraft([start,start]);
            else if(drawShape==="freehand")setDraft([start]);
          }}
          onCanvasDragMove={(point) => {
            if(mode==="select"&&selectionBox){setSelectionBox((current)=>current?{...current,current:point}:null);return;}
            if(mode!=="draw"||!draft.length)return;
            const next=snappedPoint(point,drawShape==="freehand"?draft[draft.length-1]:draft[0]);
            if(element==="stairs-ramps"&&drawShape==="freehand")setDraft((current)=>distance(current[current.length-1],next)>=4?[...current,next]:current);
            else setDraft((current)=>current.length?[current[0],next]:current);
          }}
          onCanvasDragEnd={(point) => {
            if(mode==="select"&&selectionBox){const start=selectionBox.start;setSelectionBox(null);if(distance(start,point)<6)return;const left=Math.min(start.x,point.x),right=Math.max(start.x,point.x),top=Math.min(start.y,point.y),bottom=Math.max(start.y,point.y),crossing=point.x<start.x,match=(bounds:{left:number;top:number;right:number;bottom:number})=>crossing?bounds.right>=left&&bounds.left<=right&&bounds.bottom>=top&&bounds.top<=bottom:bounds.left>=left&&bounds.right<=right&&bounds.top>=top&&bounds.bottom<=bottom,bounds=(points:Point[])=>({left:Math.min(...points.map((value)=>value.x)),top:Math.min(...points.map((value)=>value.y)),right:Math.max(...points.map((value)=>value.x)),bottom:Math.max(...points.map((value)=>value.y))});const items=element==="stairs-ramps"?visibleFlights:[...visiblePiles,...visibleCaps],ids=items.filter((item)=>match("points" in item?bounds(item.points):{left:item.bbox.x,top:item.bbox.y,right:item.bbox.x+item.bbox.width,bottom:item.bbox.y+item.bbox.height})).map((item)=>item.id);st.selectMany(ids);dispatchTakeoffStatus({message:`${crossing?"Crossing":"Window"} selected ${ids.length} item${ids.length===1?"":"s"}`});return;}
            if(mode!=="draw"||!draft.length)return;
            const snapped=snappedPoint(point,drawShape==="freehand"?draft[draft.length-1]:draft[0]);
            if(element==="stairs-ramps"){
              if(drawShape==="freehand"){const points=simplifySpecialStroke([...draft,snapped],4);if(points.length>=3)finish(points);else setDraft([]);}
              else if(drawShape==="rectangle"&&distance(draft[0],snapped)>=8)finish(box(draft[0],snapped));
              return;
            }
            const start = draft[0];
            if (Math.max(Math.abs(snapped.x-start.x), Math.abs(snapped.y-start.y)) < 8) { setDraft([]); return; }
            if (kind === "pile") {
              st.captureUndo(); const f=st.pileFamilies[0], id=`PILE-${Date.now()}`;
              st.addPile({id,familyId:f.id,floorId:"GF",viewportId:viewport.id,bbox:toBBox(start,snapped),lengthM:12.5,commencingLevelM:0,toeLevelM:-12.5,status:"ready"});
              setDraft([]); setMode("select");
            } else finish([start, snapped]);
          }}
          showMinimap={minimap}
          toolbar={
            <div className="flex min-w-max items-center gap-1">
              <button
                className={mode === "select" ? active : button}
                onClick={() => setMode("select")}
              >
                Select
              </button>
              <button
                className={mode === "pan" ? active : button}
                onClick={() => setMode("pan")}
              >
                Hand
              </button>
              <button
                className={
                  mode === "draw"
                    ? active
                    : "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                }
                onClick={() => {
                  if (element === "foundation" && !st.pileFamilies.length && !st.capFamilies.length) return;
                  setMode("draw");
                  setDraft([]);
                }}
                disabled={element === "foundation" && !st.pileFamilies.length && !st.capFamilies.length}
              >
                + Add element
              </button>
              <button
                className={mode === "measure" ? active : button}
                onClick={() => {
                  setMeasurementKind("distance");
                  setMode("measure");
                  measurement.clearDraft();
                }}
              >
                Measure
              </button>
              {mode === "draw" ? (
                <>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className="rounded-lg border px-2 text-xs"
                  >
                    {element === "stairs-ramps" ? (
                      <option value="flight">Flight / ramp</option>
                    ) : (
                      <>
                        <option value="pile">Pile</option>
                        <option value="cap">Pile cap</option>
                      </>
                    )}
                  </select>
                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                    {element === "stairs-ramps"
                      ? draft.length >= 3
                        ? "Click the first point to close, or press Finish"
                        : "Click 3 or more boundary points"
                      : "Drag on the drawing to place"}
                  </span>
                  {element === "stairs-ramps" ? (
                    <>
                      <button
                        type="button"
                        disabled={draft.length < 3}
                        onClick={() => finish()}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
                      >
                        Finish
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDraft([]); setMode("select"); }}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              <details className="relative">
                <summary className={button}>Layers</summary>
                <div className="absolute z-40 mt-1 w-40 rounded-xl border bg-white p-2 shadow-xl">
                  {Object.keys(layers)
                    .filter((k) =>
                      element === "stairs-ramps"
                        ? ["flights", "rails"].includes(k)
                        : ["piles", "caps"].includes(k),
                    )
                    .map((k) => (
                      <label
                        className="flex gap-2 p-2 text-xs capitalize"
                        key={k}
                      >
                        <input
                          type="checkbox"
                          checked={layers[k as keyof typeof layers]}
                          onChange={() =>
                            setLayers((x) => ({
                              ...x,
                              [k]: !x[k as keyof typeof x],
                            }))
                          }
                        />
                        {k}
                      </label>
                    ))}
                </div>
              </details>
            </div>
          }
          toolbarRight={
            <>
              <button
                className={button}
                disabled={!st.undoStack.length}
                onClick={st.undo}
              >
                Undo
              </button>
              <button
                className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 disabled:text-slate-300"
                disabled={!st.selectedId && !measurement.selected}
                onClick={() => measurement.selected ? measurement.deleteSelected() : remove()}
              >
                Delete
              </button>
              <button className={button} onClick={() => setMinimap((x) => !x)}>
                Minimap
              </button>
            </>
          }
        >
          <g
            className="quanto-scaled-elements"
            pointerEvents={mode === "select" ? "auto" : "none"}
          >
            {element === "stairs-ramps" ? (
              <>
                {layers.flights &&
                  visibleFlights.map((x) => (
                    <FlightShape key={x.id} item={x} showRails={layers.rails} />
                  ))}
              </>
            ) : (
              <>
                {layers.caps &&
                  visibleCaps.map((x) => <CapShape key={x.id} item={x} />)}
                {layers.piles &&
                  visiblePiles.map((x) => <PileShape key={x.id} item={x} />)}
              </>
            )}
          </g>
          {selectionBox?<rect pointerEvents="none" x={Math.min(selectionBox.start.x,selectionBox.current.x)} y={Math.min(selectionBox.start.y,selectionBox.current.y)} width={Math.abs(selectionBox.current.x-selectionBox.start.x)} height={Math.abs(selectionBox.current.y-selectionBox.start.y)} fill={selectionBox.current.x<selectionBox.start.x?"#22c55e":"#3b82f6"} fillOpacity={.12} stroke={selectionBox.current.x<selectionBox.start.x?"#16a34a":"#2563eb"} strokeDasharray={selectionBox.current.x<selectionBox.start.x?"7 4":undefined} strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>:null}
          {draft.length ? (
            <g pointerEvents="none">
              <polygon
                points={(drawShape==="rectangle"&&draft.length>=2?box(draft[0],draft[draft.length-1]):draft).map((p) => `${p.x},${p.y}`).join(" ")}
                fill={element === "stairs-ramps" && draft.length >= 3 ? "rgba(37,99,235,.18)" : "none"}
                stroke="#2563eb"
                strokeWidth="5"
                strokeDasharray="8 5"
                vectorEffect="non-scaling-stroke"
              />
              {element === "stairs-ramps" ? draft.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === 0 && draft.length >= 3 ? 9 : 6}
                  fill={index === 0 && draft.length >= 3 ? "#10b981" : "#2563eb"}
                  stroke="white"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
              )) : null}
            </g>
          ) : null}
          <MeasurementOverlay
            measurements={measurement.measurements}
            selectedId={measurement.selectedId}
            scale={scaleForViewport(viewport.id)}
            editable={mode === "select" || mode === "measure"}
            previewStart={measurement.start}
            previewEnd={measurement.previewEnd}
            previewPoints={measurement.previewPoints}
            previewKind={measurement.kind}
            onSelectMeasurement={() => st.select(null)}
          />
        </DemoDrawing>
        {element === "foundation" && !st.piles.length && !st.caps.length ? (
          <div className="pointer-events-none absolute bottom-8 left-1/2 w-[min(620px,80%)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl">
            <p className="text-sm font-semibold text-amber-900">Pile and pile-cap takeoff not found</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">AR/10 shows 1:6 cement-masonry rubble wall foundations and generic Type I/II column-footing details. It does not provide a pile layout, pile schedule, pile lengths, pile-cap sizes, or a complete footing layout, so no foundation concrete quantity is generated.</p>
          </div>
        ) : null}
      </main>
      <aside className="!overflow-hidden flex min-h-0 flex-col border-l border-slate-200">
        <div className="grid shrink-0 grid-cols-2 gap-1 border-b p-2">
          <button
            className={rightTab === "ai" ? active : button}
            onClick={() => setRightTab("ai")}
          >
            Copilot
          </button>
          <button
            className={rightTab === "properties" ? active : button}
            onClick={() => setRightTab("properties")}
          >
            Item
          </button>
        </div>
        <div className={rightTab === "ai" ? "flex min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}>
          {rightTab === "properties" ? (
            selected ? (
              <Inspector item={selected} element={element} />
            ) : (
              <div className="p-5 text-sm text-slate-500">Select an item on the drawing to view and edit its details.</div>
            )
          ) : (
            <DemoChat
              chatKey={`takeoff.${element}`}
              contextLabel={element === "stairs-ramps" ? "Stairs & Ramps" : "Foundation"}
              onOpenItem={() => setRightTab("properties")}
            />
          )}
        </div>
      </aside>
    </ResizableThreePane>
  );
}

function Families({ element, activeId, revealKey }: { element: SpecialElement; activeId: string | null; revealKey: string }) {
  const st = useSpecialStore();
  const [expandedId, setExpandedId] = useState<string | null>(activeId);
  useEffect(() => {
    if (activeId) setExpandedId(activeId);
  }, [activeId, revealKey]);
  const toggleFamily = (id: string) => setExpandedId((current) => current === id ? null : id);
  if (element === "stairs-ramps")
    return (
      <div className="space-y-3 p-3">
        <h4 className="text-xs font-semibold text-slate-400">
          FLIGHTS & RAMPS
        </h4>
        {st.flightFamilies.map((f) => (
          <details key={f.id} className={expandedId === f.id ? "rounded-xl border border-blue-300 bg-blue-50/40 p-3" : "rounded-xl border border-slate-200 p-3"} open={expandedId === f.id}>
            <summary className="cursor-pointer font-semibold" onClick={(event) => { event.preventDefault(); toggleFamily(f.id); }}>
              {f.mark} · {f.kind}
            </summary>
            <label className="mt-3 block text-xs">
              Name
              <input
                className={field}
                value={f.mark}
                onChange={(e) =>
                  st.updateFlightFamily(f.id, { mark: e.target.value })
                }
              />
            </label>
            <label className="mt-2 block text-xs">
              Description
              <input
                className={field}
                value={f.description}
                onChange={(e) =>
                  st.updateFlightFamily(f.id, { description: e.target.value })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="mt-2 text-xs">
                Width (mm)
                <input
                  className={field}
                  type="number"
                  value={f.widthMm}
                  onChange={(e) =>
                    st.updateFlightFamily(f.id, { widthMm: +e.target.value })
                  }
                />
              </label>
              <label className="mt-2 text-xs">
                Waist (mm)
                <input
                  className={field}
                  type="number"
                  value={f.waistMm}
                  onChange={(e) =>
                    st.updateFlightFamily(f.id, { waistMm: +e.target.value })
                  }
                />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">
                Riser (mm)
                <input className={field} type="number" value={f.riserMm || ""} placeholder="Not shown" onChange={(e) => st.updateFlightFamily(f.id, { riserMm: +e.target.value })} />
              </label>
              <label className="text-xs">
                Tread (mm)
                <input className={field} type="number" value={f.treadMm || ""} placeholder="Not shown" onChange={(e) => st.updateFlightFamily(f.id, { treadMm: +e.target.value })} />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">Landing slab (mm)<input className={field} type="number" value={f.landingThicknessMm || ""} placeholder="Not shown" onChange={(e) => st.updateFlightFamily(f.id, { landingThicknessMm: +e.target.value })} /></label>
              <label className="text-xs">Construction<select className={field} value={f.constructionType || "unknown"} onChange={(e) => st.updateFlightFamily(f.id, { constructionType: e.target.value })}><option value="unknown">Information required</option><option value="in_situ_concrete">In-situ concrete</option><option value="precast_concrete">Precast concrete</option><option value="steel">Steel</option><option value="timber">Timber</option><option value="masonry">Masonry</option><option value="other">Other</option></select></label>
            </div>
            {f.kind === "Ramp" ? <label className="mt-2 block text-xs">Support condition<select className={field} value={f.supportCondition || "unknown"} onChange={(e) => st.updateFlightFamily(f.id, { supportCondition: e.target.value })}><option value="unknown">Information required</option><option value="ground_bearing">Ground bearing</option><option value="suspended">Suspended</option><option value="mixed">Mixed</option></select></label> : null}
            {f.kind === "Stair" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs">Tread finish<input className={field} value={f.treadFinish || f.finish || ""} onChange={(e) => st.updateFlightFamily(f.id, { treadFinish: e.target.value, finish: e.target.value })} /></label>
                <label className="text-xs">Riser finish<input className={field} value={f.riserFinish || ""} onChange={(e) => st.updateFlightFamily(f.id, { riserFinish: e.target.value })} /></label>
                <label className="text-xs">String / apron finish<input className={field} value={f.stringFinish || ""} onChange={(e) => st.updateFlightFamily(f.id, { stringFinish: e.target.value })} /></label>
              </div>
            ) : <label className="mt-2 block text-xs">Ramp finish<input className={field} value={f.rampFinish || f.finish || ""} onChange={(e) => st.updateFlightFamily(f.id, { rampFinish: e.target.value, finish: e.target.value })} /></label>}
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">
              Evidence: {f.source}
            </p>
          </details>
        ))}
        <h4 className="pt-2 text-xs font-semibold text-slate-400">BALUSTRADES & HANDRAILS</h4>
        {st.railFamilies.map((f) => (
          <details key={f.id} className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer font-semibold">{f.mark}</summary>
            <label className="mt-3 block text-xs">Name<input className={field} value={f.mark} onChange={(e) => st.updateRailFamily(f.id, { mark: e.target.value })} /></label>
            <label className="mt-2 block text-xs">Description<input className={field} value={f.description} onChange={(e) => st.updateRailFamily(f.id, { description: e.target.value })} /></label>
            <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Height (mm)<input className={field} type="number" value={f.heightMm || ""} onChange={(e) => st.updateRailFamily(f.id, { heightMm: +e.target.value })} /></label><label className="text-xs">Material<input className={field} value={f.material || ""} onChange={(e) => st.updateRailFamily(f.id, { material: e.target.value })} /></label></div>
            <label className="mt-2 block text-xs">Finish<input className={field} value={f.finish || ""} onChange={(e) => st.updateRailFamily(f.id, { finish: e.target.value })} /></label>
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">Evidence: {f.source}</p>
          </details>
        ))}
      </div>
    );
  return (
    <div className="space-y-3 p-3">
      <h4 className="text-xs font-semibold text-slate-400">PILE FAMILIES</h4>
      {!st.pileFamilies.length ? <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>Not found in the supplied package.</b><br />The visible Type I/II details are pad footings, not piles or pile caps.</div> : null}
      {st.pileFamilies.map((f) => (
        <details key={f.id} className={expandedId === f.id ? "rounded-xl border border-blue-300 bg-blue-50/40 p-3" : "rounded-xl border border-slate-200 p-3"} open={expandedId === f.id}>
          <summary className="cursor-pointer font-semibold" onClick={(event) => { event.preventDefault(); toggleFamily(f.id); }}>
            {f.mark} · {f.method}
          </summary>
          <label className="mt-3 block text-xs">
            Name
            <input
              className={field}
              value={f.mark}
              onChange={(e) =>
                st.updatePileFamily(f.id, { mark: e.target.value })
              }
            />
          </label>
          <label className="mt-2 block text-xs">
            Diameter (mm)
            <input
              className={field}
              type="number"
              value={f.diameterMm}
              onChange={(e) =>
                st.updatePileFamily(f.id, { diameterMm: +e.target.value })
              }
            />
          </label>
        </details>
      ))}
      <h4 className="pt-2 text-xs font-semibold text-slate-400">PILE-CAP FAMILIES</h4>
      {st.capFamilies.map((f) => (
        <details key={f.id} className={expandedId === f.id ? "rounded-xl border border-blue-300 bg-blue-50/40 p-3" : "rounded-xl border border-slate-200 p-3"} open={expandedId === f.id}>
          <summary className="cursor-pointer font-semibold" onClick={(event) => { event.preventDefault(); toggleFamily(f.id); }}>
            {f.mark} · {f.description}
          </summary>
          <label className="mt-3 block text-xs">
            Name
            <input className={field} value={f.mark} onChange={(e) => st.updateCapFamily(f.id, { mark: e.target.value })} />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs">Width (mm)<input className={field} type="number" value={f.widthMm} onChange={(e) => st.updateCapFamily(f.id, { widthMm: +e.target.value })} /></label>
            <label className="text-xs">Depth (mm)<input className={field} type="number" value={f.depthMm} onChange={(e) => st.updateCapFamily(f.id, { depthMm: +e.target.value })} /></label>
          </div>
          <label className="mt-2 block text-xs">
            Thickness (mm)
            <input className={field} type="number" value={f.thicknessMm} onChange={(e) => st.updateCapFamily(f.id, { thicknessMm: +e.target.value })} />
          </label>
        </details>
      ))}
    </div>
  );
}

function Inspector({
  item,
  element,
}: {
  item: Flight | Pile | PileCap;
  element: SpecialElement;
}) {
  const st = useSpecialStore();
  const demo = useDemoStore();
  const isFlight = "points" in item,
    isPile = "lengthM" in item;
  const families = isFlight
    ? st.flightFamilies
    : isPile
      ? st.pileFamilies
      : st.capFamilies;
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs font-semibold text-slate-400">SELECTED ITEM</p>
      <h3 className="text-lg font-semibold">{item.id}</h3>
      <label className="block text-xs">
        Family
        <select
          className={field}
          value={item.familyId}
          onChange={(e) =>
            isFlight
              ? st.updateFlight(item.id, { familyId: e.target.value })
              : isPile
                ? st.updatePile(item.id, { familyId: e.target.value })
                : st.updateCap(item.id, { familyId: e.target.value })
          }
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.mark} · {f.description}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        Storey
        <select
          className={field}
          value={item.floorId}
          onChange={(e) =>
            isFlight
              ? st.updateFlight(item.id, { floorId: e.target.value })
              : isPile
                ? st.updatePile(item.id, { floorId: e.target.value })
                : st.updateCap(item.id, { floorId: e.target.value })
          }
        >
          {demo.storeys.length ? demo.storeys.map((storey) => (
            <option key={storey.id} value={storey.id}>{storey.name}{storey.factor > 1 ? ` × ${storey.factor}` : ""}</option>
          )) : (<>
            <option value="GF">Ground</option>
            <option value="FF">First</option>
            <option value="TYP">Typical 2nd–6th</option>
            <option value="RF">Roof Terrace</option>
          </>)}
        </select>
      </label>
      {isPile ? (
        <label className="block text-xs">
          Length (m)
          <input
            className={field}
            type="number"
            value={item.lengthM}
            onChange={(e) =>
              st.updatePile(item.id, {
                lengthM: +e.target.value,
                toeLevelM: item.commencingLevelM - +e.target.value,
              })
            }
          />
        </label>
      ) : !isFlight ? (
        <label className="block text-xs">
          Thickness (mm)
          <input
            className={field}
            type="number"
            value={
              item.thicknessOverrideMm ||
              st.capFamilies.find((f) => f.id === item.familyId)?.thicknessMm ||
              0
            }
            onChange={(e) =>
              st.updateCap(item.id, { thicknessOverrideMm: +e.target.value })
            }
          />
        </label>
      ) : (
        <>
          {(() => {
            const family = st.flightFamilies.find((f) => f.id === item.familyId);
            if (!family) return null;
            const planArea = item.planAreaM2 ?? (polygonArea(item.points) * scaleForViewport(item.viewportId) ** 2);
            const width = item.widthMm || family.widthMm;
            const riser = item.riserMm || family.riserMm;
            const tread = item.treadMm || family.treadMm;
            const waist = item.waistMm || family.waistMm;
            return (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
                <InfoRow label="Kind" value={item.kind || family.kind} />
                <InfoRow label="Type mark" value={item.typeMark || family.mark || "Unassigned"} />
                <InfoRow label="Plan outline" value={`${planArea.toFixed(2)} m²`} />
                <InfoRow label="True sloping area" value={item.slopingSurfaceAreaM2 != null ? `${item.slopingSurfaceAreaM2.toFixed(2)} m²` : "Needs rise/slope evidence"} />
                <InfoRow label="Intermediate landing" value={item.landingAreaM2 != null ? `${item.landingAreaM2.toFixed(2)} m²` : "—"} />
                <InfoRow label="Flight / ramp width" value={width ? `${width} mm` : "Not resolved"} />
                <InfoRow label="Riser / tread" value={riser && tread ? `${riser} / ${tread} mm` : (item.kind || family.kind) === "Ramp" ? "Not applicable" : "Not resolved"} />
                <InfoRow label="Rise" value={item.riseOverrideM ? `${item.riseOverrideM.toFixed(3)} m` : "Not resolved"} />
                <InfoRow label="Slope" value={item.slopeDegrees != null ? `${item.slopeDegrees.toFixed(2)}°${item.slopePercent != null ? ` · ${item.slopePercent.toFixed(1)}%` : ""}` : "Not resolved"} />
                <InfoRow label="Waist / slab" value={waist ? `${waist} mm` : "Not resolved"} />
                <InfoRow label="Flights" value={item.flightCount != null ? String(item.flightCount) : "Review geometry"} />
                <InfoRow label="Risers / treads" value={item.riserCount != null ? `${item.riserCount}${item.treadCount != null ? ` / ${item.treadCount}` : ""}` : "Not resolved"} />
                <InfoRow label="Construction" value={family.constructionType && family.constructionType !== "unknown" ? family.constructionType.replace(/_/g, " ") : "Information required"} />
                <InfoRow label="Quantity status" value={item.quantityStatus === "ready" ? "Ready" : "Needs review"} />
                <InfoRow label="Reinforcement" value={item.reinforcementStatus === "ready" ? "Ready" : "Information required"} />
                <InfoRow label="Evidence" value={family.source} />
              </div>
            );
          })()}
          <label className="block text-xs">
            Rise (m)
            <input
              className={field}
              type="number"
              value={item.riseOverrideM ?? ""}
              placeholder="Use section / level evidence"
              onChange={(e) =>
                st.updateFlight(item.id, { riseOverrideM: e.target.value === "" ? undefined : +e.target.value })
              }
            />
          </label>
          <div>
            <p className="mb-2 text-xs">Balustrade edges</p>
            <div className="flex flex-wrap gap-1">
              {item.railEdges.map((on, i) => (
                <button
                  key={i}
                  onClick={() =>
                    st.updateFlight(item.id, {
                      railEdges: item.railEdges.map((x, n) =>
                        n === i ? !x : x,
                      ),
                    })
                  }
                  className={
                    on
                      ? "rounded bg-amber-100 px-2 py-1 text-xs text-amber-800"
                      : "rounded bg-slate-100 px-2 py-1 text-xs text-slate-400"
                  }
                >
                  Edge {i + 1}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <b>{quantity(item, st).label}</b>
        <span className="float-right font-semibold">
          {quantity(item, st).value}
        </span>
      </div>
      <button
        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
        onClick={() =>
          isFlight
            ? st.updateFlight(item.id, { status: "confirmed" })
            : isPile
              ? st.updatePile(item.id, { status: "confirmed" })
              : st.updateCap(item.id, { status: "confirmed" })
        }
      >
        Save and confirm
      </button>
    </div>
  );
}

function SpecialWorkbook({ element }: { element: SpecialElement }) {
  const st = useSpecialStore();
  const rows = useMemo(
    () => workbookRows(element, st),
    [
      element,
      st.flights,
      st.piles,
      st.caps,
      st.flightFamilies,
      st.pileFamilies,
      st.capFamilies,
      st.workbookOverrides,
    ],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b p-5">
        <h3 className="font-semibold">
          {element === "stairs-ramps"
            ? "Stairs, ramps & balustrades"
            : "Piles & pile caps"}{" "}
          workbook
        </h3>
        <p className="text-sm text-slate-500">
          Calculated quantities remain editable before confirmation.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {!rows.length ? <div className="m-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><b>{element === "stairs-ramps" ? "No supported Stairs & Ramps quantity lines yet." : "No pile or pile-cap quantity lines."}</b><p className="mt-2 leading-6">{element === "stairs-ramps" ? "Review Scope evidence and resolve any missing rise, slope, construction or family information. Quanto will not invent unsupported quantities." : "The supplied PDF has no pile layout or schedule. AR/10 foundation details remain available in Dimension as evidence, but their incomplete symbolic dimensions cannot produce a reliable quantity."}</p></div> : null}
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Family / storey</th>
              <th>Calculation</th>
              <th>Unit</th>
              <th className="w-40">Quantity</th>
              <th className="w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="border-t" key={r.key}>
                <td className="p-4">
                  <b>{r.name}</b>
                  <span className="block text-xs text-slate-500">
                    {r.floor}
                  </span>
                </td>
                <td>{r.calc}</td>
                <td>{r.unit}</td>
                <td>
                  <input
                    type="number"
                    step=".01"
                    className={field}
                    value={st.workbookOverrides[r.key] ?? r.qty}
                    onChange={(e) =>
                      st.setWorkbookOverride(r.key, +e.target.value)
                    }
                  />
                </td>
                <td>
                  <button
                    className={
                      st.workbookConfirmed[r.key]
                        ? "rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700"
                        : "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                    }
                    onClick={() =>
                      st.confirmWorkbook(r.key, !st.workbookConfirmed[r.key])
                    }
                  >
                    {st.workbookConfirmed[r.key] ? "Confirmed" : "Confirm"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Special3D({ element }: { element: SpecialElement }) {
  const st = useSpecialStore(),
    demo = useDemoStore(),
    [floor, setFloor] = useState("ALL"),
    [selected, setSelected] = useState<string | null>(null);
  const floorOptions = useMemo(() => element === "stairs-ramps"
    ? [...demo.storeys.map((storey) => [storey.id, storey.name] as const), ["ALL", "All"] as const]
    : [["GF", "Ground"], ["FF", "First"], ["TYP", "Typical"], ["ALL", "All"]] as const, [demo.storeys, element]);
  useEffect(() => {
    if (floor === "ALL") return;
    if (!floorOptions.some(([id]) => id === floor)) setFloor("ALL");
  }, [floor, floorOptions]);
  const items =
    element === "stairs-ramps"
      ? st.flights.filter((x) => floor === "ALL" || x.floorId === floor)
      : [...st.caps, ...st.piles].filter(
          (x) => floor === "ALL" || x.floorId === floor,
        );
  const item = items.find((x) => x.id === selected);
  return (
    <ResizableTwoPane
      storageKey={`special:${element}:3d`}
      defaultRight={310}
      className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white"
    >
      <main className="relative bg-slate-100 p-5">
        <div className="flex gap-2">
          {floorOptions.map(([id, n]) => (
            <button
              className={floor === id ? active : button}
              onClick={() => setFloor(id)}
              key={id}
            >
              {n}
            </button>
          ))}
        </div>
        <svg viewBox="0 0 900 560" className="mt-5 h-[570px] w-full">
          {element === "stairs-ramps" ? (
            <>
              <polygon
                points="180,430 610,310 770,390 340,510"
                fill="#dbeafe"
              />
              <path
                d="M300 430l250-70 110 50-250 70zM340 397l210-59 85 38-210 60zM385 365l165-46 60 27-165 46z"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="18"
                strokeLinejoin="round"
              />
              <path
                d="M300 410v-70m250 0v-70m110 120v-70"
                stroke="#f59e0b"
                strokeWidth="5"
              />
            </>
          ) : (
            <>
              <polygon
                points="180,290 610,180 770,250 340,365"
                fill="#e2e8f0"
                opacity=".7"
              />
              {st.caps.map((x, i) => (
                <rect
                  key={x.id}
                  x={260 + i * 150}
                  y={285}
                  width="90"
                  height="55"
                  rx="5"
                  fill={selected === x.id ? "#fb923c" : "#fdba74"}
                  transform={`skewY(-14)`}
                  onClick={() => setSelected(x.id)}
                />
              ))}
              {st.piles.map((x, i) => (
                <rect
                  key={x.id}
                  x={285 + (i % 3) * 150}
                  y={300 + Math.floor(i / 3) * 35}
                  width="30"
                  height="180"
                  rx="15"
                  fill={selected === x.id ? "#1d4ed8" : "#60a5fa"}
                  onClick={() => setSelected(x.id)}
                />
              ))}
            </>
          )}
        </svg>
        {element === "foundation" && !st.piles.length && !st.caps.length ? <div className="absolute inset-x-10 top-32 rounded-2xl border border-dashed border-amber-300 bg-white/95 p-8 text-center shadow"><h3 className="font-semibold text-amber-900">No pile or pile-cap model available</h3><p className="mt-2 text-sm leading-6 text-slate-600">The supplied drawings do not contain the layout and dimensions needed to create foundation quantity geometry.</p></div> : null}
        <div className="absolute bottom-5 right-5 rounded-xl bg-white p-3 shadow">
          <label className="text-xs">
            Section billboard{" "}
            <select className="ml-2 rounded border p-1">
              <option>Off</option>
              <option>A–A</option>
              <option>B–B</option>
            </select>
          </label>
        </div>
      </main>
      <aside className="p-5">
        <p className="text-xs font-semibold text-slate-400">MODEL ITEM</p>
        {item ? (
          <>
            <h3 className="mt-2 text-lg font-semibold">{item.id}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {floorName(item.floorId)}
            </p>
            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm">
              {quantity(item, st).label}
              <b className="float-right">{quantity(item, st).value}</b>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Select a model item to inspect it.
          </p>
        )}
      </aside>
    </ResizableTwoPane>
  );
}

function FlightShape({ item, showRails }: { item: Flight; showRails: boolean }) {
  const st = useSpecialStore(),
    family = st.flightFamilies.find((f) => f.id === item.familyId),
    selected = st.selectedIds.includes(item.id);
  if (!family) return null;
  const center = centroid(item.points);
  const planArea = item.planAreaM2 ?? (polygonArea(item.points) * scaleForViewport(item.viewportId) ** 2);
  const outlinePath = [item.points, ...item.voids]
    .filter((ring) => ring.length >= 3)
    .map((ring) => `M ${ring.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`)
    .join(" ");
  const useDetectedRails = showRails && !item.railEdgesEdited && (item.railSegments?.length || 0) > 0;
  return (
    <MovePolygon
      item={item}
      onMove={(points) => st.updateFlight(item.id, { points })}
    >
      <path
        d={outlinePath}
        fill={family.color}
        fillOpacity={selected ? 0.35 : 0.2}
        fillRule="evenodd"
        stroke={selected ? "#2563eb" : family.color}
        strokeWidth={selected ? 5 : 3}
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey || e.shiftKey) st.toggleSelect(item.id); else st.select(item.id);
        }}
      />
      {(item.components || []).filter((component) => component.component_type === "run" && (component.polygon?.length || 0) >= 3).map((component, index) => (
        <polygon key={`component-${component.run_id || index}`} points={(component.polygon || []).map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={family.color} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="7 6" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      ))}
      <text
        x={center.x}
        y={center.y - 7}
        textAnchor="middle"
        pointerEvents="none"
        className="fill-slate-900 text-[18px] font-bold"
      >
        {item.typeMark || family.mark}
      </text>
      <text
        x={center.x}
        y={center.y + 23}
        textAnchor="middle"
        pointerEvents="none"
        className="fill-slate-700 text-[13px] font-semibold"
      >
        {planArea.toFixed(2)} m² · {item.kind || family.kind}{item.quantityStatus === "ready" ? " · ready" : " · review"}
      </text>
      {useDetectedRails ? item.railSegments?.map((segment, index) => {
        if (segment.line.length < 2) return null;
        return <polyline key={`rail-segment-${segment.rail_id || index}`} points={segment.line.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="8" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
      }) : showRails && item.points.map((point, index) => {
        if (!item.railEdges[index]) return null;
        const next = item.points[(index + 1) % item.points.length];
        return <line key={`rail-${index}`} x1={point.x} y1={point.y} x2={next.x} y2={next.y} stroke="#f59e0b" strokeWidth="8" vectorEffect="non-scaling-stroke" pointerEvents="none" />;
      })}
      {selected &&
        item.points.map((p, i) => (
          <Vertex
            key={i}
            p={p}
            onMove={(next) =>
              st.updateFlight(item.id, {
                points: item.points.map((x, n) => (n === i ? next : x)),
              })
            }
          />
        ))}
    </MovePolygon>
  );
}
function PileShape({ item }: { item: Pile }) {
  const st = useSpecialStore(),
    f = st.pileFamilies.find((x) => x.id === item.familyId)!,
    selected = st.selectedIds.includes(item.id),
    cx = item.bbox.x + item.bbox.width / 2,
    cy = item.bbox.y + item.bbox.height / 2;
  return (
    <MoveBox
      itemId={item.id}
      box={item.bbox}
      onMove={(bbox) => st.updatePile(item.id, { bbox })}
    >
      <ellipse
        cx={cx}
        cy={cy}
        rx={item.bbox.width / 2}
        ry={item.bbox.height / 2}
        fill={f.color}
        fillOpacity={selected ? 0.5 : 0.3}
        stroke={selected ? "#0f172a" : f.color}
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey || e.shiftKey) st.toggleSelect(item.id); else st.select(item.id);
        }}
      />
      <text
        x={cx + 28}
        y={cy - 20}
        pointerEvents="none"
        className="text-[24px] font-bold"
        fill={f.color}
      >
        {f.mark}
      </text>
    </MoveBox>
  );
}
function CapShape({ item }: { item: PileCap }) {
  const st = useSpecialStore(),
    f = st.capFamilies.find((x) => x.id === item.familyId)!,
    selected = st.selectedIds.includes(item.id);
  return (
    <MoveBox itemId={item.id} box={item.bbox} onMove={(bbox) => st.updateCap(item.id, { bbox })}>
      <rect
        {...item.bbox}
        fill={f.color}
        fillOpacity={selected ? 0.25 : 0.12}
        stroke={selected ? "#0f172a" : f.color}
        strokeWidth="5"
        vectorEffect="non-scaling-stroke"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey || e.shiftKey) st.toggleSelect(item.id); else st.select(item.id);
        }}
      />
    </MoveBox>
  );
}
function MovePolygon({
  item,
  onMove,
  children,
}: {
  item: Flight;
  onMove: (p: Point[]) => void;
  children: React.ReactNode;
}) {
  const st = useSpecialStore();
  const selected = st.selectedIds.includes(item.id);
  const [drag, setDrag] = useState<{
    p: Point;
    points: Point[];
    group?: boolean;
    last?: Point;
  } | null>(null);
  return (
    <g
      className="cursor-move"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const p = svgPoint(e as never);
        if (p) {
          e.currentTarget.setPointerCapture(e.pointerId);
          st.captureUndo();
          setDrag({
            p,
            points: item.points,
            group:
              selected &&
              st.selectedIds.length > 1 &&
              !(e.ctrlKey || e.metaKey || e.shiftKey),
            last: p,
          });
        }
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = svgPoint(e as never);
        if (p && drag.group && drag.last) {
          st.translateSelected(
            st.selectedIds,
            p.x - drag.last.x,
            p.y - drag.last.y,
          );
          setDrag({ ...drag, last: p });
        } else if (p)
          onMove(
            drag.points.map((x) => ({
              x: x.x + p.x - drag.p.x,
              y: x.y + p.y - drag.p.y,
            })),
          );
      }}
      onPointerUp={() => setDrag(null)}
    >
      {children}
    </g>
  );
}
function MoveBox({
  itemId,
  box,
  onMove,
  children,
}: {
  itemId: string;
  box: BBox;
  onMove: (b: BBox) => void;
  children: React.ReactNode;
}) {
  const st = useSpecialStore();
  const selected = st.selectedIds.includes(itemId);
  const [drag, setDrag] = useState<{
    p: Point;
    box: BBox;
    group?: boolean;
    last?: Point;
  } | null>(null);
  return (
    <g
      className="cursor-move"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const p = svgPoint(e as never);
        if (p) {
          e.currentTarget.setPointerCapture(e.pointerId);
          st.captureUndo();
          setDrag({
            p,
            box,
            group:
              selected &&
              st.selectedIds.length > 1 &&
              !(e.ctrlKey || e.metaKey || e.shiftKey),
            last: p,
          });
        }
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = svgPoint(e as never);
        if (p && drag.group && drag.last) {
          st.translateSelected(
            st.selectedIds,
            p.x - drag.last.x,
            p.y - drag.last.y,
          );
          setDrag({ ...drag, last: p });
        } else if (p)
          onMove({
            ...drag.box,
            x: drag.box.x + p.x - drag.p.x,
            y: drag.box.y + p.y - drag.p.y,
          });
      }}
      onPointerUp={() => setDrag(null)}
    >
      {children}
    </g>
  );
}
function Vertex({ p, onMove }: { p: Point; onMove: (p: Point) => void }) {
  return (
    <rect
      x={p.x - 9}
      y={p.y - 9}
      width="18"
      height="18"
      rx="3"
      fill="white"
      stroke="#2563eb"
      strokeWidth="4"
      vectorEffect="non-scaling-stroke"
      className="cursor-crosshair"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const n = svgPoint(e as never);
        if (n) onMove(n);
      }}
    />
  );
}
function Measure({ points, scale }: { points: Point[]; scale: number }) {
  if (points.length < 2) return null;
  return (
    <g pointerEvents="none">
      <line
        x1={points[0].x}
        y1={points[0].y}
        x2={points[1].x}
        y2={points[1].y}
        stroke="#059669"
        strokeWidth="4"
        strokeDasharray="10 8"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={(points[0].x + points[1].x) / 2}
        y={(points[0].y + points[1].y) / 2 - 15}
        textAnchor="middle"
        className="fill-emerald-700 text-[25px] font-bold"
      >
        {(distance(points[0], points[1]) * scale).toFixed(2)} m
      </text>
    </g>
  );
}
function quantity(
  item: Flight | Pile | PileCap,
  st: ReturnType<typeof useSpecialStore.getState>,
) {
  if ("points" in item) {
    const family = st.flightFamilies.find((x) => x.id === item.familyId);
    if (item.concreteM3 != null) return { label: "Concrete volume", value: `${item.concreteM3.toFixed(2)} m³` };
    if (item.rampFinishM2 != null) return { label: "Ramp finish", value: `${item.rampFinishM2.toFixed(2)} m²` };
    if (item.treadFinishM2 != null) return { label: "Tread / landing finish", value: `${item.treadFinishM2.toFixed(2)} m²` };
    if (item.slopingSurfaceAreaM2 != null) return { label: "True sloping area", value: `${item.slopingSurfaceAreaM2.toFixed(2)} m²` };
    if (item.quantityStatus) return { label: "Quantity status", value: item.quantityStatus === "ready" ? "Ready" : "Needs review" };
    const area = polygonArea(item.points) * scaleForViewport(item.viewportId) ** 2;
    return {
      label: "Concrete volume",
      value: family?.waistMm ? `${((area * family.waistMm) / 1000).toFixed(2)} m³` : "Awaiting stair/ramp detail",
    };
  }
  if ("lengthM" in item) {
    const f = st.pileFamilies.find((x) => x.id === item.familyId)!;
    return {
      label: "Concrete volume",
      value: `${(Math.PI * (f.diameterMm / 2000) ** 2 * item.lengthM).toFixed(2)} m³`,
    };
  }
  const f = st.capFamilies.find((x) => x.id === item.familyId)!;
  return {
    label: "Concrete volume",
    value: `${((f.widthMm * f.depthMm * (item.thicknessOverrideMm || f.thicknessMm)) / 1e9).toFixed(2)} m³`,
  };
}
function workbookRows(
  element: SpecialElement,
  st: ReturnType<typeof useSpecialStore.getState>,
) {
  const rows: {
    key: string;
    name: string;
    floor: string;
    calc: string;
    unit: string;
    qty: number;
  }[] = [];
  if (element === "stairs-ramps") {
    const addMeasured = (
      key: string,
      name: string,
      floorId: string,
      items: Flight[],
      property: keyof Pick<Flight, "concreteM3"|"formworkM2"|"treadFinishM2"|"riserFinishM2"|"stringApronFinishM2"|"rampFinishM2"|"balustradeLengthM">,
      unit: string,
      calc: string,
    ) => {
      const measured = items.map((item) => item[property]).filter((value): value is number => typeof value === "number");
      if (!measured.length) return;
      const factor = floorFactor(floorId);
      rows.push({ key, name, floor: floorName(floorId), calc: `${calc}${factor > 1 ? ` × typical factor ${factor}` : ""}`, unit, qty: +((measured.reduce((sum, value) => sum + value, 0)) * factor).toFixed(3) });
    };
    for (const family of st.flightFamilies) {
      const floorIds = [...new Set(st.flights.filter((item) => item.familyId === family.id && !item.evidenceOnly).map((item) => item.floorId))];
      for (const floorId of floorIds) {
        const items = st.flights.filter((item) => item.familyId === family.id && item.floorId === floorId && !item.evidenceOnly);
        const factor = floorFactor(floorId);
        rows.push({
          key: `flight:${family.id}:${floorId}`,
          name: `${family.mark} · ${family.description}`,
          floor: floorName(floorId),
          calc: `${items.length} stair/ramp assembl${items.length === 1 ? "y" : "ies"}${factor > 1 ? ` × ${factor}` : ""}`,
          unit: "nr",
          qty: items.length * factor,
        });
        addMeasured(`concrete:${family.id}:${floorId}`, `${family.mark} · in-situ concrete`, floorId, items, "concreteM3", "m³", "Detected runs + owned intermediate landings");
        addMeasured(`formwork:${family.id}:${floorId}`, `${family.mark} · soffit formwork`, floorId, items, "formworkM2", "m²", "True sloping soffit + owned intermediate landings");
        if (family.treadFinish || family.finish) addMeasured(`tread:${family.id}:${floorId}`, `${family.treadFinish || family.finish} · stair treads / landings`, floorId, items, "treadFinishM2", "m²", "Horizontal tread + owned landing finish area");
        if (family.riserFinish) addMeasured(`riser:${family.id}:${floorId}`, `${family.riserFinish} · stair risers`, floorId, items, "riserFinishM2", "m²", "Resolved stair width × total rise");
        if (family.stringFinish) addMeasured(`string:${family.id}:${floorId}`, `${family.stringFinish} · stair string / apron`, floorId, items, "stringApronFinishM2", "m²", "Supported side-profile extent");
        if (family.rampFinish || family.finish) addMeasured(`ramp-finish:${family.id}:${floorId}`, `${family.rampFinish || family.finish} · ramp surface`, floorId, items, "rampFinishM2", "m²", "True sloping ramp + owned landing area");
      }
    }
    const railGroups = new Map<string, Flight[]>();
    st.flights.filter((item) => !item.evidenceOnly && item.balustradeLengthM != null && item.balustradeLengthM > 0).forEach((item) => {
      const key = `${item.railFamilyId}:${item.floorId}`;
      railGroups.set(key, [...(railGroups.get(key) || []), item]);
    });
    for (const [key, items] of railGroups) {
      const [railFamilyId, floorId] = key.split(":");
      const rail = st.railFamilies.find((family) => family.id === railFamilyId);
      addMeasured(`rail:${key}`, `${rail?.mark || "Balustrade"} · ${rail?.description || "handrail / balustrade"}`, floorId, items, "balustradeLengthM", "m", "Detected/verified rail edges at true slope");
    }
  } else {
    for (const f of st.pileFamilies) {
      const items = st.piles.filter((x) => x.familyId === f.id),
        qty = items.reduce(
          (s, x) => s + Math.PI * (f.diameterMm / 2000) ** 2 * x.lengthM,
          0,
        );
      if (items.length)
        rows.push({
          key: `pile:${f.id}:GF`,
          name: `${f.mark} · ${f.description}`,
          floor: "Ground",
          calc: `${items.length} piles × measured lengths`,
          unit: "m³",
          qty: +qty.toFixed(2),
        });
    }
    for (const f of st.capFamilies) {
      const items = st.caps.filter((x) => x.familyId === f.id),
        qty = items.reduce(
          (s, x) =>
            s +
            (f.widthMm * f.depthMm * (x.thicknessOverrideMm || f.thicknessMm)) /
              1e9,
          0,
        );
      if (items.length)
        rows.push({
          key: `cap:${f.id}:GF`,
          name: `${f.mark} · ${f.description}`,
          floor: "Ground",
          calc: `${items.length} pile caps`,
          unit: "m³",
          qty: +qty.toFixed(2),
        });
    }
  }
  return rows;
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-slate-500">{label}</span><b className="max-w-[190px] text-right text-slate-700">{value}</b></div>;
}
function floorFor(viewportId: string) {
  const viewport = useDemoStore.getState().viewports.find((item) => item.id === viewportId) as (ReturnType<typeof useDemoStore.getState>["viewports"][number] & { connectedLevelRefs?: string[] }) | undefined;
  const connected = viewport?.connectedLevelRefs?.[0];
  if (connected) return connected;
  return viewportId === "VP-FIRST"
    ? "FF"
    : viewportId === "VP-TYP"
      ? "TYP"
      : viewportId === "VP-TERRACE"
        ? "RF"
        : "GF";
}
function box(a: Point, b: Point): Point[] {
  return [
    { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
  ];
}
function simplifySpecialStroke(items: Point[], tolerance: number) {
  if (items.length <= 3) return items;
  const result = [items[0]];
  for (let index = 1; index < items.length - 1; index += 1)
    if (distance(items[index], result[result.length - 1]) >= tolerance) result.push(items[index]);
  if (distance(items[items.length - 1], result[result.length - 1]) >= tolerance / 2) result.push(items[items.length - 1]);
  return result;
}
function toBBox(a: Point, b: Point): BBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(30, Math.abs(a.x - b.x)),
    height: Math.max(30, Math.abs(a.y - b.y)),
  };
}
