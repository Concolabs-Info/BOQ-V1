"use client";

import { create } from "zustand";
import type { DemoStatus, HeightRecord, ScaleCalibration, Sheet, SpecificationItem, Storey as UiStorey, Viewport as UiViewport } from "@/features/demo/types";
import type { JsonObject, PreState, ScaleFit, Storey as ServerStorey, Viewport as ServerViewport } from "../types/server";
import { preApi, renderUrl } from "../services/preApi";

// Prevent React Strict Mode (or two mounted screens) from starting the same
// paid specification extraction more than once in this browser session.
const activeSpecExtractions = new Set<string>();

export type PreStage = "upload" | "plans" | "scale" | "height" | "specifications" | "start-takeoff";

type ExtendedSheet = Sheet & { renderWidth?: number; renderHeight?: number };
type ExtendedViewport = UiViewport & { server?: ServerViewport; scaleFit?: ScaleFit | null; scaleStale?: boolean };

export function viewportRequiresScale(viewport: ExtendedViewport): boolean {
  const drawingType = viewport.server?.view_kind || viewport.category;
  if (drawingType === "elevation" || drawingType === "section") return true;
  if (drawingType !== "plan") return false;
  // Site/location diagrams are reference drawings, not the floor plans used
  // by the primary takeoff scale workflow.
  return !/\b(site|location|key)\s+plan\b/i.test(viewport.name);
}

type State = {
  projectId: string | null;
  activeStage: PreStage;
  raw: PreState | null;
  sheets: ExtendedSheet[];
  viewports: ExtendedViewport[];
  storeys: UiStorey[];
  heights: HeightRecord[];
  specifications: SpecificationItem[];
  selectedViewportId: string;
  loading: boolean;
  error: string | null;
  frozen: boolean;
  setActiveStage: (stage: PreStage) => void;
  hydrate: (projectId: string, state: PreState) => void;
  resetPre: (projectId?: string) => void;
  setSelectedViewport: (id: string) => void;
  toggleSheet: (id: string) => void;
  confirmSheetSet: () => Promise<void>;
  updateViewport: (id: string, patch: Partial<UiViewport>) => void;
  addViewport: (viewport: UiViewport) => void;
  deleteViewport: (id: string) => void;
  updateStorey: (id: string, patch: Partial<UiStorey>) => void;
  confirmStoreyStack: () => Promise<void>;
  updateHeight: (id: string, patch: Partial<HeightRecord>) => void;
  updateSpecification: (id: string, patch: Partial<SpecificationItem>) => void;
  addSpecification: (item: SpecificationItem) => void;
  suggestMissingScales: () => Promise<void>;
  suggestHeightsIfNeeded: () => Promise<void>;
  extractSpecificationsIfNeeded: () => Promise<void>;
  freezeProjectFrame: () => Promise<void>;
};

const status = (confirmed: boolean, raw?: string | null): DemoStatus => confirmed ? "confirmed" : raw === "needs_review" ? "needs_review" : "ready";
const category = (kind?: string | null): UiViewport["category"] => {
  if (kind === "plan" || kind === "elevation" || kind === "section" || kind === "detail" || kind === "schedule") return kind;
  return kind === "notes" || kind === "legend" ? "schedule" : "detail";
};
const unitFromText = (text?: string | null): "m" | "cm" | "mm" | "ft-in" => text?.includes("'") || text?.includes('"') ? "ft-in" : "m";

function scaleFactorToMpp(factor: number, dpi = 150) {
  return factor * 25.4 / (dpi * 1000);
}
function mppToScaleFactor(mpp: number, dpi = 150) {
  return mpp * dpi * 1000 / 25.4;
}

function fullPageLineFromCropNorm(v: ExtendedViewport, line?: number[] | null): [number, number, number, number] | null {
  if (!line || line.length !== 4) return null;
  const [x0,y0,x1,y1] = v.bbox;
  const w = Math.max(1, x1-x0), h = Math.max(1, y1-y0);
  return [x0 + line[0]/1000*w, y0 + line[1]/1000*h, x0 + line[2]/1000*w, y0 + line[3]/1000*h];
}
function cropNormPoint(v: ExtendedViewport, x: number, y: number) {
  const [x0,y0,x1,y1] = v.bbox;
  return [Math.max(0, Math.min(1, (x-x0)/Math.max(1,x1-x0))), Math.max(0, Math.min(1, (y-y0)/Math.max(1,y1-y0)))];
}
function viewportCalibration(v: ExtendedViewport, server: ServerViewport, sheet: ExtendedSheet): ScaleCalibration {
  const fit = (server.latest_scale || server.scale) as ScaleFit | null | undefined;
  const checks = (fit?.checks || {}) as any;
  const stated = (server.stated_scale || (sheet as any).titleBlockScale || {}) as any;
  const printedText = stated?.text || checks?.printed?.note?.text || "No printed scale found";
  const printedBox = stated?.box && sheet.renderWidth && sheet.renderHeight
    ? [stated.box.x1/1000*sheet.renderWidth, stated.box.y1/1000*sheet.renderHeight, stated.box.x2/1000*sheet.renderWidth, stated.box.y2/1000*sheet.renderHeight] as [number,number,number,number]
    : undefined;
  const xLine = fullPageLineFromCropNorm(v, checks?.x?.proposed_norm) || [v.bbox[0] + (v.bbox[2]-v.bbox[0])*.2, v.bbox[1] + (v.bbox[3]-v.bbox[1])*.35, v.bbox[0] + (v.bbox[2]-v.bbox[0])*.75, v.bbox[1] + (v.bbox[3]-v.bbox[1])*.35] as [number,number,number,number];
  const yLine = fullPageLineFromCropNorm(v, checks?.y?.proposed_norm) || [v.bbox[0] + (v.bbox[2]-v.bbox[0])*.25, v.bbox[1] + (v.bbox[3]-v.bbox[1])*.25, v.bbox[0] + (v.bbox[2]-v.bbox[0])*.25, v.bbox[1] + (v.bbox[3]-v.bbox[1])*.8] as [number,number,number,number];
  const xMm = Number(checks?.x?.real_length_mm || 0), yMm = Number(checks?.y?.real_length_mm || 0);
  const xu = unitFromText(checks?.x?.text), yu = unitFromText(checks?.y?.text);
  return {
    printedScale: printedText,
    printedScaleLabel: printedText,
    printedEvidenceBox: printedBox,
    printedEvidenceSource: server.sheet_no ? `Sheet ${server.sheet_no}` : `PDF page ${server.page_number}`,
    printedEvidenceLocation: stated?.source === "title_block" ? "Title block" : "Viewport",
    printedEvidenceKind: printedText === "No printed scale found" ? "missing" : "printed",
    notToScale: stated?.kind === "not_to_scale",
    printedScaleOnly: false,
    x: { line: xLine, knownDistanceM: xMm/1000, label: checks?.x?.text || "Known horizontal distance", unit: xu, value: checks?.x?.text || undefined },
    y: { line: yLine, knownDistanceM: yMm/1000, label: checks?.y?.text || "Known vertical distance", unit: yu, value: checks?.y?.text || undefined },
  };
}

function mapState(state: PreState, stage: PreStage) {
  const pageById = new Map(state.pages.map((p) => [p.id, p]));
  const sheets: ExtendedSheet[] = state.sheets.map((s: any) => {
    const page = pageById.get(s.page_id);
    return {
      id: s.id,
      sheetNo: s.sheet_no || `Page ${s.page_number}`,
      title: s.title || "Untitled drawing sheet",
      revision: s.revision || "",
      image: renderUrl(s.working_render_id || s.thumbnail_render_id),
      page: s.page_number,
      included: s.included,
      renderWidth: page?.working_width_px || undefined,
      renderHeight: page?.working_height_px || undefined,
      ...(s.title_block_scale ? { titleBlockScale: s.title_block_scale } : {}),
    } as ExtendedSheet;
  });
  const sheetMap = new Map(sheets.map((s) => [s.id, s]));
  const viewports: ExtendedViewport[] = state.viewports.map((server) => {
    const sheet = sheetMap.get(server.sheet_id)!;
    const w = sheet?.renderWidth || 1000, h = sheet?.renderHeight || 1000;
    const norm = server.bbox_norm || [0,0,1,1];
    const bbox: [number,number,number,number] = [norm[0]*w,norm[1]*h,norm[2]*w,norm[3]*h];
    const fit = (server.scale || server.latest_scale) as ScaleFit | null | undefined;
    const checks = fit?.checks as any;
    const fx = Number(fit?.factor_x || 0), fy = Number(fit?.factor_y || 0), printed = Number(checks?.printed?.factor || 0);
    let factor = Number(checks?.confirmed_factor || 0);
    if (!factor && checks?.recommendation === "PRINTED_AGREES" && printed) factor = printed;
    if (!factor && checks?.recommendation === "XY_DERIVED" && fx && fy) factor = (fx + fy) / 2;
    if (!factor && printed && !fx && !fy) factor = printed;
    const base: ExtendedViewport = {
      id: server.id,
      name: server.name,
      category: category(server.view_kind),
      sheetId: server.sheet_id,
      parentViewportId: server.parent_viewport_id || undefined,
      bbox,
      order: (server as any).display_order ?? 0,
      status: stage === "scale"
        ? status(Boolean(server.scale_confirmed), server.latest_scale?.status || server.scale?.status)
        : status(Boolean(server.confirmed), server.status),
      scaleMPerPx: factor > 0 ? scaleFactorToMpp(factor) : undefined,
      server,
      scaleFit: (server.latest_scale || server.scale) as ScaleFit | null,
      scaleStale: server.scale_stale,
    };
    base.calibration = viewportCalibration(base, server, sheet);
    return base;
  });
  const heightSource = state.viewports.find((v) => v.view_kind === "section" && v.scale_confirmed) || state.viewports.find((v) => v.view_kind === "elevation" && v.scale_confirmed);
  const sourceUi = heightSource ? viewports.find((v) => v.id === heightSource.id) : viewports.find((v) => v.category === "section" || v.category === "elevation") || viewports[0];
  const storeys: UiStorey[] = state.storeys.map((s) => ({ id: s.id, name: s.name, levelIndex: s.level_index, factor: s.typical_group ? 1 : 1, heightM: (s.height_mm || 0)/1000, status: status(state.confirmations.storey_stack, s.status) }));
  const heights: HeightRecord[] = state.storeys.map((s, index) => {
    const source = viewports.find((v) => v.id === s.height_source_viewport_id) || sourceUi;
    const box = source?.bbox || [0,0,1000,1000];
    const cropH = Math.max(1, box[3]-box[1]);
    const yTop = s.height_y_top != null ? box[1] + (s.height_y_top/1000)*cropH : box[1] + cropH*(0.12 + index*Math.min(.7/Math.max(1,state.storeys.length),.12));
    const yBottom = s.height_y_bottom != null ? box[1] + (s.height_y_bottom/1000)*cropH : Math.min(box[3], yTop + cropH*Math.min(.7/Math.max(1,state.storeys.length),.12));
    return { id: s.id, name: s.name, storeyId: s.id, viewportId: source?.id || "", yTop, yBottom, status: status(state.confirmations.height_stack, s.status) };
  });
  const specifications: SpecificationItem[] = state.spec_items.map((s) => ({ id:s.id, name:s.name, category:s.kind, viewportId:s.viewport_id || "", found:s.found, status:status(Boolean(s.confirmed),s.status), rawText:s.raw_text, columns:s.table_json?.columns, rows:s.table_json?.rows }));
  return { sheets, viewports, storeys, heights, specifications };
}

function fire(promise: Promise<unknown>) { promise.catch((error) => console.error("Quanto Pre API", error)); }

export const usePreStore = create<State>((set, get) => ({
  projectId: null,
  activeStage: "upload",
  raw: null,
  sheets: [], viewports: [], storeys: [], heights: [], specifications: [],
  selectedViewportId: "",
  loading: true, error: null, frozen: false,
  setActiveStage: (activeStage) => set((current) => {
    if (!current.raw) return { activeStage };
    const mapped = mapState(current.raw, activeStage);
    return { activeStage, ...mapped, selectedViewportId: current.selectedViewportId && mapped.viewports.some((v)=>v.id===current.selectedViewportId) ? current.selectedViewportId : mapped.viewports[0]?.id || "" };
  }),
  hydrate: (projectId, raw) => {
    set((current) => {
      const mapped = mapState(raw, current.activeStage);
      return { projectId, raw, ...mapped, loading:false, error:null, frozen: raw.project.pre_status === "frozen", selectedViewportId: current.selectedViewportId && mapped.viewports.some((v)=>v.id===current.selectedViewportId) ? current.selectedViewportId : mapped.viewports[0]?.id || "" };
    });
  },
  resetPre: (projectId) => set({ projectId: projectId || get().projectId, raw:null, sheets:[],viewports:[],storeys:[],heights:[],specifications:[],selectedViewportId:"",loading:false,error:null,frozen:false }),
  setSelectedViewport: (selectedViewportId) => set({ selectedViewportId }),
  toggleSheet: (id) => {
    const current = get().sheets.find((s)=>s.id===id); if(!current || get().frozen) return;
    set((st)=>({sheets:st.sheets.map((s)=>s.id===id?{...s,included:!s.included}:s)}));
    fire(preApi.patchSheet(id,{included:!current.included}));
  },
  confirmSheetSet: async () => { const pid=get().projectId; if(pid) await preApi.confirm("sheet_set",pid); },
  updateViewport: (id, patch) => {
    const current=get().viewports.find((v)=>v.id===id); if(!current || get().frozen) return;
    const next={...current,...patch,status:patch.status ?? (current.status==="confirmed"?"ready":current.status)} as ExtendedViewport;
    if(patch.status === "confirmed" && get().activeStage === "scale") {
      // Scale confirmation is not optimistic: only show green after the backend accepted evidence.
      set((st)=>({viewports:st.viewports.map((v)=>v.id===id?{...next,status:current.status}:v),error:null}));
      const fit=current.scaleFit; const mpp=next.scaleMPerPx || 0;
      let request: Promise<unknown> | null = null;
      if(fit && mpp>0 && !(fit.checks as any)?.anisotropy_refused) {
        const checks=(fit.checks || {}) as any;
        const axis = checks?.recommendation === "PRINTED_AGREES" || (checks?.printed?.factor && !fit.factor_x && !fit.factor_y) ? "printed" : "manual";
        request=preApi.setScale(id,{mode:"suggested",scale_fit_id:fit.id,chosen_factor:mppToScaleFactor(mpp),axis});
      } else if(next.calibration?.x && next.calibration.x.knownDistanceM>0 && mpp>0) {
        const line=next.calibration.x.line; const p1=cropNormPoint(next,line[0],line[1]), p2=cropNormPoint(next,line[2],line[3]);
        request=preApi.setScale(id,{mode:"manual",p1,p2,real_distance:String(next.calibration.x.knownDistanceM*1000),unit:"mm"});
      }
      if(!request){set({error:"This scale still needs valid printed, X/Y, or manual calibration evidence."});return;}
      fire(request.then(async()=>{
        const pid=get().projectId;
        if(pid){try{get().hydrate(pid,await preApi.pre(pid));return;}catch{}}
        set((st)=>({viewports:st.viewports.map((v)=>v.id===id?{...v,status:"confirmed"}:v)}));
      }).catch((error)=>{set({error:error instanceof Error?error.message:"Scale confirmation failed"});throw error;}));
      return;
    }
    set((st)=>({viewports:st.viewports.map((v)=>v.id===id?next:v)}));
    if(patch.status === "confirmed") {
      fire(preApi.confirm("viewport",id));
      return;
    }
    const data: JsonObject={};
    if(patch.name!==undefined) data.name=patch.name;
    if(patch.category!==undefined) data.view_kind=patch.category === "schedule" ? "schedule" : patch.category;
    if(patch.parentViewportId!==undefined) data.parent_viewport_id=patch.parentViewportId || null;
    if(patch.bbox!==undefined && current.server) {
      const sheet=get().sheets.find((s)=>s.id===current.sheetId); const w=sheet?.renderWidth||1,h=sheet?.renderHeight||1;
      data.bbox_norm=[patch.bbox[0]/w,patch.bbox[1]/h,patch.bbox[2]/w,patch.bbox[3]/h];
    }
    if(Object.keys(data).length) fire(preApi.patchViewport(id,data));
  },
  addViewport: (viewport) => {
    const temp=viewport as ExtendedViewport; set((st)=>({viewports:[...st.viewports,temp],selectedViewportId:temp.id}));
    const sheet=get().sheets.find((s)=>s.id===viewport.sheetId); const w=sheet?.renderWidth||1,h=sheet?.renderHeight||1;
    fire(preApi.addViewport({id:viewport.id,sheet_id:viewport.sheetId,parent_viewport_id:viewport.parentViewportId || null,name:viewport.name,view_kind:viewport.category,discipline:"unknown",subjects:[],bbox_norm:[viewport.bbox[0]/w,viewport.bbox[1]/h,viewport.bbox[2]/w,viewport.bbox[3]/h],relevant:true,why:"Added by user"}).then((server)=>{
      set((st)=>({viewports:st.viewports.map((v)=>v.id===temp.id?{...v,id:server.id,server}:v),selectedViewportId:st.selectedViewportId===temp.id?server.id:st.selectedViewportId}));
    }));
  },
  deleteViewport: (id) => { if(get().frozen)return; set((st)=>({viewports:st.viewports.filter((v)=>v.id!==id),selectedViewportId:st.selectedViewportId===id?(st.viewports.find((v)=>v.id!==id)?.id||""):st.selectedViewportId})); fire(preApi.deleteViewport(id)); },
  updateStorey: (id, patch) => { if(get().frozen)return; set((st)=>({storeys:st.storeys.map((s)=>s.id===id?{...s,...patch,status:patch.status ?? (s.status==="confirmed"?"ready":s.status)}:s)})); const data:JsonObject={}; if(patch.name!==undefined)data.name=patch.name; if(Object.keys(data).length) fire(preApi.patchStorey(id,data)); },
  confirmStoreyStack: async()=>{const pid=get().projectId;if(pid)await preApi.confirm("storey_stack",pid);},
  updateHeight: (id, patch) => {
    const current=get().heights.find((h)=>h.id===id); if(!current||get().frozen)return; const next={...current,...patch,status:patch.status ?? (current.status==="confirmed"?"ready":current.status)};
    set((st)=>({heights:st.heights.map((h)=>h.id===id?next:h)}));
    if(patch.status === "confirmed") {
      const v=get().viewports.find((x)=>x.id===next.viewportId); if(!v)return;
      const yTop=Math.max(0,Math.min(1000,Math.round((next.yTop-v.bbox[1])/Math.max(1,v.bbox[3]-v.bbox[1])*1000)));
      const yBottom=Math.max(yTop+1,Math.min(1000,Math.round((next.yBottom-v.bbox[1])/Math.max(1,v.bbox[3]-v.bbox[1])*1000)));
      fire(preApi.setHeight(id,{source_viewport_id:next.viewportId,y_top:yTop,y_bottom:yBottom,basis:"user_adjusted_line"}).then(async()=>{
        const all=get().heights.every((h)=>h.id===id || h.status==="confirmed"); const pid=get().projectId; if(all&&pid) await preApi.confirm("height_stack",pid);
      }));
    }
  },
  updateSpecification:(id,patch)=>{const current=get().specifications.find((s)=>s.id===id);if(!current||get().frozen)return;set((st)=>({specifications:st.specifications.map((s)=>s.id===id?{...s,...patch,status:patch.status??(s.status==="confirmed"?"ready":s.status)}:s)})); if(patch.status==="confirmed"){fire(preApi.confirm("spec_item",id));return;} const data:JsonObject={};if(patch.rawText!==undefined)data.raw_text=patch.rawText;if(patch.name!==undefined)data.name=patch.name;if(patch.columns!==undefined||patch.rows!==undefined)data.table_json={columns:patch.columns??current.columns??[],rows:patch.rows??current.rows??[]};if(Object.keys(data).length)fire(preApi.patchSpec(id,data));},
  addSpecification:(item)=>{const pid=get().projectId;if(!pid)return;set((st)=>({specifications:[...st.specifications,item]}));fire(preApi.addSpec(pid,{id:item.id,viewport_id:item.viewportId||null,kind:item.category||"note",name:item.name,raw_text:item.rawText,found:item.found,table_json:item.columns||item.rows?{columns:item.columns||[],rows:item.rows||[]}:null}).then((server)=>set((st)=>({specifications:st.specifications.map((s)=>s.id===item.id?{...s,id:server.id}:s)}))));},
  suggestMissingScales: async()=>{
    const pid=get().projectId;if(!pid||get().frozen)return;
    const targets=get().viewports.filter((v)=>{
      return v.server?.included!==false
        && v.server?.relevant!==false
        && viewportRequiresScale(v)
        && !v.scaleFit
        && v.status!=="confirmed";
    });
    for(const target of targets){try{await preApi.suggestScale(target.id);}catch(error){console.error(error);}}
    if(targets.length){try{get().hydrate(pid,await preApi.pre(pid));}catch(error){console.error(error);}}
  },
  suggestHeightsIfNeeded: async()=>{
    const pid=get().projectId;if(!pid||!get().storeys.length||get().raw?.confirmations.height_stack||get().frozen)return;
    const alreadyMeasured=get().raw?.storeys.every((s)=>Boolean(s.height_mm));
    if(alreadyMeasured)return;
    try{
      const candidates=await preApi.heightCandidates(pid);const primary=candidates.find((c)=>c.scale_confirmed);if(!primary)return;
      await preApi.suggestHeights(pid,{primary_viewport_id:primary.id});
      get().hydrate(pid,await preApi.pre(pid));
    }catch(error){console.error(error);}
  },
  extractSpecificationsIfNeeded: async()=>{
    const pid=get().projectId;if(!pid||get().specifications.length||get().frozen||activeSpecExtractions.has(pid))return;
    activeSpecExtractions.add(pid);
    try{
      await preApi.extractSpecs(pid);
      for(let i=0;i<240;i+=1){
        await new Promise((resolve)=>window.setTimeout(resolve,500));
        const state=await preApi.pre(pid);
        if(state.project.pre_status==="specs_failed")throw new Error("Specification extraction failed");
        if(state.project.pre_status!=="specs_extracting" && state.spec_items.length){get().hydrate(pid,state);return;}
      }
    }catch(error){console.error(error);set({error:error instanceof Error?error.message:"Specification extraction failed"});}
    finally{activeSpecExtractions.delete(pid);}
  },
  freezeProjectFrame: async()=>{const pid=get().projectId;if(!pid)return;await preApi.freeze(pid);get().hydrate(pid,await preApi.pre(pid));},
}));
