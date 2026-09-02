"use client";

import { getBoqDefaultRate } from "@/features/demo/builders";
import { useDemoStore } from "@/features/demo/store";
import { requestJson } from "@/shared/services/apiClient";
import type { BoqRow } from "./types";

type ProductionCandidate = {
  id: string;
  element: "floor"|"ceiling"|"walls"|"doors"|"windows"|"roof"|"stairs"|"ramps";
  entity_type: string;
  section: string;
  item_code?: string|null;
  description: string;
  quantity: number;
  unit: string;
  floor_ids: string[];
  source_ids: string[];
  basis?: string|null;
};

type ProductionCandidateResponse = {
  project_id: string;
  elements: string[];
  candidates: ProductionCandidate[];
  count: number;
};

const cache = new Map<string, ProductionCandidateResponse>();
const productionErrors = new Map<string,string>();

const replacedDemoEntityTypes = new Set([
  "door","window","door_ironmongery",
  "wall","wall_concrete","wall_formwork","wall_finish",
  "floor_finish","floor_screed","floor_skirting","floor_waterproofing","floor_underlay","floor_insulation","floor_membrane","floor_sealer","floor_work",
  "ceiling","ceiling_feature",
  "roof",
  "stair_concrete","stair_formwork","stair_tread_finish","stair_riser_finish","stair_string_finish","stair_balustrade",
  "ramp_concrete","ramp_formwork","ramp_finish","ramp_balustrade",
]);

function classification(entityType:string, section:string){
  let bill_no="03",bill_name="Superstructure",subcategory_code="GENERAL",subcategory_name=section||"Building work";
  if(entityType==="wall"){subcategory_code=section==="Partitions"?"NRM2 20":"NRM2 14";subcategory_name=section||"Wall construction";}
  else if(entityType==="wall_concrete"||entityType==="wall_formwork"||entityType.endsWith("_concrete")||entityType.endsWith("_formwork")){subcategory_code="NRM2 11";subcategory_name=section;}
  else if(entityType==="door"||entityType==="door_ironmongery"){subcategory_code="NRM2 24";subcategory_name=section||"Doors, shutters and hatches";}
  else if(entityType==="window"){subcategory_code="NRM2 23";subcategory_name=section||"Windows, screens and lights";}
  else if(entityType==="roof"){subcategory_code="NRM2 19";subcategory_name=section||"Waterproofing and roof work";}
  else if(entityType.includes("balustrade")){subcategory_code="NRM2 25";subcategory_name=section||"Stairs, walkways and balustrades";}
  else if(entityType==="stair_tread_finish"){bill_no="04";bill_name="Finishes";subcategory_code="NRM2 28.11";subcategory_name=section;}
  else if(entityType==="stair_riser_finish"){bill_no="04";bill_name="Finishes";subcategory_code="NRM2 28.12";subcategory_name=section;}
  else if(entityType==="stair_string_finish"){bill_no="04";bill_name="Finishes";subcategory_code="NRM2 28.13";subcategory_name=section;}
  else if(entityType==="floor_skirting"){bill_no="04";bill_name="Finishes";subcategory_code="NRM2 28.14";subcategory_name=section;}
  else if(entityType==="floor_waterproofing"){subcategory_code="NRM2 19";subcategory_name=section;}
  else if(entityType==="floor_insulation"){subcategory_code="NRM2 31";subcategory_name=section;}
  else if(entityType.startsWith("floor_")||entityType.startsWith("ceiling")||entityType==="ramp_finish"){bill_no="04";bill_name="Finishes";subcategory_code="NRM2 28";subcategory_name=section||"Floor, wall and ceiling finishes";}
  return {bill_no,bill_name,subcategory_code,subcategory_name};
}

function defaultRate(entityType:string,code:string,unit:string):number|null{
  const st=useDemoStore.getState();
  if(st.boqSetup.rate_mode==="manual")return null;
  if(entityType==="stair_concrete"||entityType==="ramp_concrete")return getBoqDefaultRate("slab",code,unit);
  if(entityType==="stair_formwork"||entityType==="ramp_formwork")return getBoqDefaultRate("formwork",code,unit);
  if(entityType.startsWith("stair_")||entityType.startsWith("ramp_"))return unit==="m"?4500:8500;
  if(entityType==="door_ironmongery")return 25000;
  if(entityType==="floor_waterproofing")return 4500;
  if(entityType==="floor_underlay"||entityType==="floor_membrane")return 2000;
  if(entityType==="floor_insulation")return 3500;
  if(entityType==="floor_sealer")return 1800;
  if(entityType==="floor_work"||entityType==="ceiling_feature")return 0;
  return getBoqDefaultRate(entityType,code,unit);
}

function toRows(response:ProductionCandidateResponse):BoqRow[]{
  const st=useDemoStore.getState();
  const counters:Record<string,number>={};
  const rows=response.candidates.map((candidate,index)=>{
    const classified=classification(candidate.entity_type,candidate.section);
    const sectionKey=`${classified.bill_no}|${classified.subcategory_code}`;
    counters[sectionKey]=(counters[sectionKey]||0)+1;
    const itemCode=candidate.item_code||classified.subcategory_code;
    const rate=defaultRate(candidate.entity_type,itemCode,candidate.unit);
    const amount=rate==null?null:Number((candidate.quantity*rate).toFixed(2));
    const floorNames=candidate.floor_ids.map(id=>st.storeys.find(item=>item.id===id)?.name||id);
    const row:BoqRow={
      id:candidate.id,
      floor_id:candidate.floor_ids.length===1?candidate.floor_ids[0]:null,
      entity_type:candidate.entity_type,
      section:candidate.section,
      item_code:itemCode,
      boq_item_number:`${classified.bill_no}.${String(classified.subcategory_code).replace(/\D/g,"")||"00"}.${String(counters[sectionKey]).padStart(2,"0")}`,
      ...classified,
      description:candidate.description,
      quantity:Number(candidate.quantity.toFixed(4)),
      unit:candidate.unit,
      rate,
      amount,
      status:rate==null?"needs_review":"ready",
      source_ids:candidate.source_ids,
      source_items:[],
      floor_ids:candidate.floor_ids,
      floor_names:floorNames,
      missing_fields:rate==null?["rate"]:[],
      manual:false,
      protected_description:false,
      protected_rate:false,
      excluded:false,
      sort_order:index+1,
    };
    return row;
  });
  return rows;
}

export async function syncProductionBoqRows(projectId:string, force=false):Promise<BoqRow[]|null>{
  if(!force&&cache.has(projectId))return toRows(cache.get(projectId)!);
  try{
    const response=await requestJson<ProductionCandidateResponse>(`/api/v1/projects/${projectId}/takeoff/harness/boq-candidates?fresh=${Date.now()}`);
    cache.set(projectId,response);
    productionErrors.delete(projectId);
    return toRows(response);
  }catch(error){
    const message=error instanceof Error?error.message:"Production takeoff quantities are unavailable";
    productionErrors.set(projectId,message);
    console.warn("Quanto production takeoff BOQ candidates could not be loaded; keeping existing BOQ state",error);
    return null;
  }
}

export function mergedBoqRows(projectId:string, demoRows:BoqRow[]):BoqRow[]{
  const response=cache.get(projectId);
  if(!response)return demoRows;
  const production=toRows(response);
  const preserved=demoRows.filter(row=>!replacedDemoEntityTypes.has(row.entity_type||""));
  const all=[...preserved,...production];
  const sectionCounters:Record<string,number>={};
  return all
    .sort((a,b)=>`${a.bill_no}|${a.subcategory_code}|${a.item_code}`.localeCompare(`${b.bill_no}|${b.subcategory_code}|${b.item_code}`,undefined,{numeric:true}))
    .map((row,index)=>{
      const key=`${row.bill_no||"09"}|${row.subcategory_code||"GENERAL"}`;
      sectionCounters[key]=(sectionCounters[key]||0)+1;
      return {...row,boq_item_number:`${row.bill_no||"09"}.${String(row.subcategory_code||"").replace(/\D/g,"")||"00"}.${String(sectionCounters[key]).padStart(2,"0")}`,sort_order:index+1};
    });
}

export function clearProductionBoqCache(projectId?:string){if(projectId)cache.delete(projectId);else cache.clear();}
export function productionBoqError(projectId:string){return productionErrors.get(projectId)||null;}
