import { distance, edgeLengthM, zoneAreaM2 } from "./geometry";
import { useDemoStore } from "./store";
import type { DemoStatus, Opening, RoofZone, Wall, WallFamily, Zone } from "./types";
import type { ReviewItem, ReviewState } from "@/features/review/types";
import type { BoqRow, BoqState, BoqTemplatePackage } from "@/features/boq/types";
import { useStructuralStore } from "@/features/quanto/structuralStore";
import type { BeamFamily, BeamRun, ColumnFamily, ColumnInstance } from "@/features/quanto/structuralTypes";
import { useSpecialStore } from "@/features/quanto/specialStore";
import {
  MATTEGODA_ASSUMPTIONS,
  MATTEGODA_FLOOR_AREAS,
  MATTEGODA_MASONRY,
  MATTEGODA_OPENING_SCHEDULE,
  workbookStatus,
} from "./mattegodaWorkbookData";

export function floorName(id:string){ return useDemoStore.getState().storeys.find(x=>x.id===id)?.name || id; }
export function floorFactor(id:string){ return useDemoStore.getState().storeys.find(x=>x.id===id)?.factor || 1; }
export function scaleForViewport(id:string){ return useDemoStore.getState().viewports.find(x=>x.id===id)?.scaleMPerPx || 0.018; }
export function openingFamily(id:string){ return useDemoStore.getState().openingFamilies.find(x=>x.id===id)!; }
export function wallFamily(id:string){ return useDemoStore.getState().wallFamilies.find(x=>x.id===id)!; }
export function wallFinishFamily(id:string){ return useDemoStore.getState().wallFinishFamilies.find(x=>x.id===id)!; }
export function floorFamily(id:string){ return useDemoStore.getState().floorFamilies.find(x=>x.id===id)!; }
export function ceilingFamily(id:string){ return useDemoStore.getState().ceilingFamilies.find(x=>x.id===id)!; }
export function roofFamily(id:string){ return useDemoStore.getState().roofFamilies.find(x=>x.id===id)!; }
export function upstandFamily(id:string){ return useDemoStore.getState().upstandFamilies.find(x=>x.id===id)!; }
export function wallLengthM(w:Wall){ return w.lengthM ?? distance(w.start,w.end)*scaleForViewport(w.viewportId); }
export function isInSituConcreteWallFamily(f:WallFamily){
  if((f.wallKind||"").toLowerCase()==="masonry")return false;
  if((f.wallKind||"").toLowerCase()==="concrete")return true;
  const text=`${f.material||""} ${f.description||""}`.toLowerCase();
  return /\breinforced\s+concrete\b|\bin[ -]?situ\s+concrete\b|(?:^|[^a-z])r\.?c\.?(?:[^a-z]|$)/.test(text);
}
export function wallConstructionSection(f:WallFamily){
  if(isInSituConcreteWallFamily(f))return "In-situ concrete — Walls";
  const kind=(f.wallKind||"").toLowerCase();
  if(["framed_partition","drywall_partition","timber_partition","glazed_partition"].includes(kind))return "Partitions";
  return "Masonry / wall construction";
}

function isConcreteColumnFamily(family: ColumnFamily){
  const text=`${family.material||""} ${family.concreteGrade||""} ${family.description||""}`.toLowerCase();
  return /\breinforced\s+concrete\b|\bin[ -]?situ\s+concrete\b|(?:^|[^a-z])r\.?c\.?(?:[^a-z]|$)|\brcc\b|\bconcrete\b/.test(text);
}
function structuralColumnSection(item: ColumnInstance, family: ColumnFamily){
  const circular=family.shape==="Circular";
  const diameterMm=item.diameterOverrideMm ?? family.diameterMm ?? family.widthMm;
  const widthMm=item.widthOverrideMm ?? family.widthMm;
  const depthMm=item.depthOverrideMm ?? family.depthMm;
  return {circular,diameterMm,widthMm,depthMm};
}
function structuralColumnConcreteM3(item: ColumnInstance, family: ColumnFamily){
  if(item.concreteVolumeM3!=null)return item.concreteVolumeM3;
  const section=structuralColumnSection(item,family);
  const area=section.circular?Math.PI*(section.diameterMm/2000)**2:(section.widthMm/1000)*(section.depthMm/1000);
  return area*item.heightM;
}
function structuralColumnFormworkM2(item: ColumnInstance, family: ColumnFamily){
  if(item.formworkAreaM2!=null)return item.formworkAreaM2;
  const section=structuralColumnSection(item,family);
  const perimeter=section.circular?Math.PI*section.diameterMm/1000:2*(section.widthMm+section.depthMm)/1000;
  return perimeter*item.heightM;
}
function structuralColumnConcreteM3ForReview(item: ColumnInstance, family: ColumnFamily){
  if(useStructuralStore.getState().columnDataSource==="production"&&!isConcreteColumnFamily(family)&&item.concreteVolumeM3==null)return null;
  return structuralColumnConcreteM3(item,family);
}
function structuralColumnFormworkM2ForReview(item: ColumnInstance, family: ColumnFamily){
  if(useStructuralStore.getState().columnDataSource==="production"&&!isConcreteColumnFamily(family)&&item.formworkAreaM2==null)return null;
  return structuralColumnFormworkM2(item,family);
}

export function structuralBeamLengthM(item: BeamRun){
  return item.netLengthM ?? distance(item.start,item.end)*scaleForViewport(item.viewportId);
}
function structuralBeamConcreteM3(item: BeamRun, family: BeamFamily){
  const production = item.netLengthM != null;
  const length = structuralBeamLengthM(item);
  const depthMm = production ? family.depthMm : (item.kind === "Downstand" ? Math.max(item.dropMm,1) : family.depthMm);
  return length*(family.widthMm/1000)*(depthMm/1000)*(production?1:floorFactor(item.floorId));
}
function structuralBeamFormworkM2(item: BeamRun, family: BeamFamily){
  const production = item.netLengthM != null;
  const length = structuralBeamLengthM(item);
  const depthM = (production ? family.depthMm : (item.kind === "Downstand" ? Math.max(item.dropMm,1) : family.depthMm))/1000;
  return length*(2*depthM+family.widthMm/1000)*(production?1:floorFactor(item.floorId));
}
export function wallGrossAreaM2(w:Wall){ return w.grossAreaM2 ?? wallLengthM(w)*w.heightM; }
export function wallOpeningDeductM2(w:Wall){
  if (w.openingDeductionM2 != null) return w.openingDeductionM2;
  const st=useDemoStore.getState();
  return st.openings.filter(o=>o.hostWallId===w.id).reduce((sum,o)=>{ const f=st.openingFamilies.find(x=>x.id===o.familyId); if(!f)return sum; const area=(f.widthMm/1000)*(f.heightMm/1000); return sum+(area>0.5?area:0); },0);
}
export function wallNetAreaM2(w:Wall){ return w.netAreaM2 ?? Math.max(0,wallGrossAreaM2(w)-wallOpeningDeductM2(w)); }
export function wallHasFinish(w:Wall,finishId:string){
  return w.finishFaces?.length ? w.finishFaces.some(face=>face.finishId===finishId) : w.side1Finish===finishId||w.side2Finish===finishId;
}
export function wallFinishFaceCount(w:Wall,finishId:string){
  return w.finishFaces?.length ? w.finishFaces.filter(face=>face.finishId===finishId).length : (w.side1Finish===finishId?1:0)+(w.side2Finish===finishId?1:0);
}
export function wallFinishAreaForWall(w:Wall,finishId:string){
  if(w.finishFaces?.length)return w.finishFaces.filter(face=>face.finishId===finishId).reduce((sum,face)=>sum+(face.areaM2 ?? 0),0);
  const net=wallNetAreaM2(w);
  return (w.side1Finish===finishId?(w.side1FinishAreaM2 ?? net):0)+(w.side2Finish===finishId?(w.side2FinishAreaM2 ?? net):0);
}
export function wallFinishAreaM2(finishId:string,floorId:string){
  const st=useDemoStore.getState();
  return st.walls.filter(w=>w.floorId===floorId).reduce((sum,w)=>sum+wallFinishAreaForWall(w,finishId),0);
}
export function zoneNetAreaM2(z:Zone){ return zoneAreaM2(z.points,z.deducts,scaleForViewport(z.viewportId)); }
export function roofNetAreaM2(z:RoofZone){ return z.measuredAreaM2 ?? zoneAreaM2(z.points,z.deducts,scaleForViewport(z.viewportId)); }
export function roofUpstandM(z:RoofZone){ return z.measuredUpstandM ?? edgeLengthM(z.points,z.upstandEdges,scaleForViewport(z.viewportId)); }

function statusToReview(s:DemoStatus){ return s; }
function sourceMap(source:string){ return { source: source.includes("schedule") ? "schedule" : source.includes("Specification") ? "specification" : "calculated" }; }

export function buildReviewStateLegacy(projectId:string, floorId:string|null, category:string):ReviewState{
  const st=useDemoStore.getState();
  const structure=useStructuralStore.getState();
  const special=useSpecialStore.getState();
  const items:ReviewItem[]=[];
  for(const column of structure.columns){const family=structure.columnFamilies.find(x=>x.id===column.familyId)!;const section=structuralColumnSection(column,family);items.push({id:`REV-${column.id}`,project_id:projectId,floor_id:column.floorId,entity_type:"column",entity_id:column.id,display_number:column.columnMark||family.mark,title:`${column.columnMark||family.mark} · ${family.description}`,data:{floor:floorName(column.floorId),type_code:family.mark,description:family.description,shape:family.shape,width_mm:section.widthMm,depth_mm:section.depthMm,diameter_mm:section.diameterMm,height_m:column.heightM,concrete_m3:structuralColumnConcreteM3ForReview(column,family),formwork_m2:structuralColumnFormworkM2ForReview(column,family),reinforcement_kg:column.reinforcementKg??null,reinforcement_status:column.reinforcementKg==null?"information_required":"supported",section_source:column.sectionSource,height_source:column.heightSource,source:family.source,value_sources:{geometry:column.sectionSource||"model",family:"specification"}},status:statusToReview(column.status),critical:false,is_stale:false,source_version:1,review_version:column.status==="confirmed"?2:1})}
  for(const beam of structure.beams){const family=structure.beamFamilies.find(x=>x.id===beam.familyId)!;const length=structuralBeamLengthM(beam);items.push({id:`REV-${beam.id}`,project_id:projectId,floor_id:beam.floorId,entity_type:"beam",entity_id:beam.id,display_number:beam.mark||family.mark,title:`${beam.mark||family.mark} · ${family.description}`,data:{floor:beam.floorLabel||floorName(beam.floorId),type_code:family.mark,description:family.description,kind:beam.kind,width_mm:family.widthMm,depth_mm:family.depthMm,drop_mm:beam.dropMm,gross_length_m:beam.grossLengthM??length,length_m:length,net_length_m:beam.netLengthM??length,concrete_m3:structuralBeamConcreteM3(beam,family),source:beam.sourceDocument?`${beam.sourceDocument}${beam.sourcePageNumber?` · page ${beam.sourcePageNumber}`:""}`:family.source,value_sources:{geometry:beam.netLengthM!=null?"structural_drawing":"model",family:beam.dimensionSource||"specification"}},status:statusToReview(beam.status),critical:false,is_stale:false,source_version:1,review_version:beam.status==="confirmed"?2:1})}
  for(const slab of structure.slabPlates){const family=structure.slabFamilies.find(x=>x.id===slab.familyId)!,area=zoneAreaM2(slab.points,slab.voids,scaleForViewport(slab.viewportId));items.push({id:`REV-${slab.id}`,project_id:projectId,floor_id:slab.floorId,entity_type:"slab",entity_id:slab.id,display_number:family.mark,title:`${family.mark} · ${family.description}`,data:{floor:floorName(slab.floorId),type_code:family.mark,description:family.description,net_area_m2:area,thickness_mm:slab.thicknessOverrideMm||family.thicknessMm,thickness_status:slab.thicknessStatus||"needs_review",thickness_range_mm:slab.thicknessRangeMm,linked_plan_slab:slab.linkedPlanSlabId,quantity_excluded_reason:slab.quantityExcludedReason,falls:family.falls,source:family.source,value_sources:{geometry:"structural_drawing",family:"structural_drawing"}},status:slab.thicknessStatus==="confirmed"?statusToReview(slab.status):"needs_review",critical:slab.thicknessStatus==="varies",is_stale:false,source_version:1,review_version:slab.status==="confirmed"?2:1})}
  for(const opening of st.openings){
    const f=openingFamily(opening.familyId);
    items.push({id:`REV-${opening.id}`,project_id:projectId,floor_id:opening.floorId,entity_type:opening.kind,entity_id:opening.id,display_number:f.mark,title:`${f.mark} · ${f.description}`,data:{floor:floorName(opening.floorId),type_code:f.mark,width_mm:f.widthMm,height_mm:f.heightMm,material:f.material,frame_material:f.material,finish:f.description,source:f.source,value_sources:sourceMap(f.source)},status:statusToReview(opening.status),critical:false,is_stale:false,source_version:1,review_version:opening.status==="confirmed"?2:1});
  }
  for(const wall of st.walls){
    const f=wallFamily(wall.familyId);
    items.push({id:`REV-${wall.id}`,project_id:projectId,floor_id:wall.floorId,entity_type:"wall",entity_id:wall.id,display_number:wall.id,title:`${f.mark} · ${f.description}`,data:{floor:floorName(wall.floorId),wall_type:f.mark,classification:f.classification,thickness_mm:f.thicknessMm,net_area_m2:wallNetAreaM2(wall),side_1_finish:wall.side1Finish,side_2_finish:wall.side2Finish,source:"Measured from plan",value_sources:{geometry:"calculated",height:"user_confirmed"}},status:statusToReview(wall.status),critical:false,is_stale:false,source_version:1,review_version:wall.status==="confirmed"?2:1});
  }
  for(const finish of st.wallFinishFamilies){
    for(const fid of [...new Set(st.walls.filter(w=>wallHasFinish(w,finish.id)).map(w=>w.floorId))]){
      const related=st.walls.filter(w=>w.floorId===fid&&wallHasFinish(w,finish.id));
      const area=wallFinishAreaM2(finish.id,fid);
      const status:DemoStatus=related.length&&related.every(w=>w.status==="confirmed")?"confirmed":"ready";
      items.push({id:`REV-WF-${finish.id}-${fid}`,project_id:projectId,floor_id:fid,entity_type:"wall_finish",entity_id:`WF-${finish.id}-${fid}`,display_number:finish.mark,title:`${finish.mark} · ${finish.description}`,data:{floor:floorName(fid),finish_code:finish.mark,wall_finish:finish.description,material:finish.material,area_m2:area,source:finish.source,value_sources:{geometry:"calculated",finish:"specification"}},status:statusToReview(status),critical:false,is_stale:false,source_version:1,review_version:status==="confirmed"?2:1});
    }
  }
  for(const z of st.floorZones){
    const f=floorFamily(z.familyId);
    items.push({id:`REV-${z.id}`,project_id:projectId,floor_id:z.floorId,entity_type:"floor",entity_id:z.id,display_number:f.mark,title:`${f.mark} · ${z.room}`,data:{floor:floorName(z.floorId),floor_type_code:f.mark,room_name:z.room,room_type:z.room,area_m2:zoneNetAreaM2(z),floor_finish:f.description,material:f.material,source:f.source,value_sources:{geometry:"calculated",finish:"schedule"}},status:statusToReview(z.status),critical:false,is_stale:false,source_version:1,review_version:z.status==="confirmed"?2:1});
  }
  for(const z of st.ceilingZones){
    const f=ceilingFamily(z.familyId);
    items.push({id:`REV-${z.id}`,project_id:projectId,floor_id:z.floorId,entity_type:"ceiling_zone",entity_id:z.id,display_number:f.mark,title:`${f.mark} · ${z.room}`,data:{floor:floorName(z.floorId),definition_code:f.mark,net_area_m2:zoneNetAreaM2(z),ceiling_system:f.description,material:f.material,height_mm:(st.storeys.find(s=>s.id===z.floorId)?.heightM||3.35)*1000,suspension_depth_mm:150,profile_type:"flat",scope_state:"included",option_code:f.mark,source:f.source,value_sources:{geometry:"calculated",finish:"specification"}},status:statusToReview(z.status),critical:false,is_stale:false,source_version:1,review_version:z.status==="confirmed"?2:1});
  }
  for(const z of st.roofZones){
    const f=roofFamily(z.familyId);
    items.push({id:`REV-${z.id}`,project_id:projectId,floor_id:z.floorId,entity_type:"roof_plane",entity_id:z.id,display_number:f.mark,title:`${f.mark} · ${z.scope}`,data:{floor:z.scope,definition_code:f.mark,roof_type:"waterproofing",roof_system:f.description,material:f.description,net_area_m2:roofNetAreaM2(z),pitch_degrees:0,shape_group:"flat",surface_class:"roof",include_in_boq:true,boq_owner:"roof",source:f.source,value_sources:{geometry:"calculated",system:"specification"}},status:statusToReview(z.status),critical:false,is_stale:false,source_version:1,review_version:z.status==="confirmed"?2:1});
  }
  for(const imported of MATTEGODA_OPENING_SCHEDULE){
    const measured=st.openings.filter(opening=>opening.familyId===imported.ref).reduce((sum,opening)=>sum+floorFactor(opening.floorId),0);
    const accepted=st.workbookOverrides[`import:opening:${imported.ref}`]??imported.scheduledQty;
    const floorId=imported.floorsOneToSixQty>0?"TYP":imported.location.toLowerCase().includes("roof")||imported.location.toLowerCase().includes("water tank")?"RF":"GF";
    items.push({id:`REV-IMPORT-OPENING-${imported.ref}`,project_id:projectId,floor_id:floorId,entity_type:imported.kind,entity_id:`IMPORT-${imported.ref}`,display_number:imported.ref,title:`${imported.ref} · Imported opening schedule`,data:{location:imported.location,width_mm:imported.widthMm,height_mm:imported.heightMm,measured_quantity:measured,imported_quantity:imported.scheduledQty,accepted_quantity:accepted,difference:measured-imported.scheduledQty,host_wall_group:imported.provisionalHost,note:imported.note,source:"Mattegoda Preliminary Partial BOQ · Openings"},status:workbookStatus(imported.status),critical:imported.status==="DISPUTED",is_stale:false,source_version:1,review_version:1});
  }
  for(const imported of MATTEGODA_MASONRY){
    const familyIds=st.wallFamilies.filter(family=>family.thicknessMm===imported.thicknessMm).map(family=>family.id);
    const measured=st.walls.filter(wall=>wall.floorId===imported.floorId&&familyIds.includes(wall.familyId)).reduce((sum,wall)=>sum+wallNetAreaM2(wall),0)*floorFactor(imported.floorId);
    const accepted=st.workbookOverrides[imported.key]??imported.netM2;
    items.push({id:`REV-${imported.key}`,project_id:projectId,floor_id:imported.floorId,entity_type:"masonry_takeoff",entity_id:imported.key,display_number:imported.familyLabel,title:`${imported.familyLabel} · ${imported.scope}`,data:{thickness_mm:imported.thicknessMm,centreline_m:imported.centrelineM,height_m:imported.heightM,repetition:imported.repetition,gross_m2:imported.grossM2,deductions_m2:imported.deductionM2,measured_m2:measured,imported_net_m2:imported.netM2,accepted_m2:accepted,difference_m2:measured-imported.netM2,note:imported.note,source:"Mattegoda Preliminary Partial BOQ · Masonry Take-off"},status:workbookStatus(imported.status),critical:false,is_stale:false,source_version:1,review_version:1});
  }
  for(const imported of MATTEGODA_FLOOR_AREAS){
    const floorId=imported.ref==="FA-01"?"GF":imported.ref==="FA-02"||imported.ref==="FA-03"?"FF":imported.ref==="FA-04"||imported.ref==="FA-05"?"TYP":"RF";
    items.push({id:`REV-${imported.key}`,project_id:projectId,floor_id:floorId,entity_type:"floor_area_control",entity_id:imported.key,display_number:imported.ref,title:`${imported.ref} · ${imported.scope}`,data:{input:imported.input,input_unit:imported.inputUnit,repetition:imported.repetition,imported_total_m2:imported.totalM2,accepted_m2:st.workbookOverrides[imported.key]??imported.totalM2,finish_reference:imported.finishRef,note:imported.note,source:"Mattegoda Preliminary Partial BOQ · Floor Areas"},status:workbookStatus(imported.status),critical:false,is_stale:false,source_version:1,review_version:1});
  }
  for(const assumption of MATTEGODA_ASSUMPTIONS){
    items.push({id:`REV-ASSUMPTION-${assumption.id}`,project_id:projectId,floor_id:"PROJECT",entity_type:"workbook_assumption",entity_id:assumption.id,display_number:null,title:assumption.topic,data:{basis:assumption.basis,impact:assumption.impact,resolution:assumption.resolution,source:"Mattegoda Preliminary Partial BOQ · Basis & Assumptions"},status:"needs_review",critical:false,is_stale:false,source_version:1,review_version:1});
  }
  items.push({id:"REV-PDF-TITLE-CONFLICT",project_id:projectId,floor_id:"PROJECT",entity_type:"workbook_assumption",entity_id:"pdf-title-conflict",display_number:"PDF",title:"Architectural / structural project-title conflict",data:{basis:"Architectural sheets identify a 02-bedroom apartment; structural sheets identify a 03-bedroom apartment.",impact:"The structural package may belong to a different or superseded apartment configuration.",resolution:"Obtain written architect and structural-engineer confirmation before final measurement.",source:"Final PDF architectural and structural title blocks"},status:"needs_review",critical:true,is_stale:false,source_version:1,review_version:1});
  items.push({id:"REV-PDF-AR01-TITLE",project_id:projectId,floor_id:"GF",entity_type:"floor_drawing",entity_id:"VP-GROUND",display_number:"AR/01",title:"AR/01 title/content coordination check",data:{basis:"The AR/01 title block reads Typical Floor Plan while the parking layout is used as the Ground viewport.",impact:"Viewport naming and storey allocation may be incorrect.",resolution:"Confirm the intended AR/01 drawing title and floor allocation with the architect.",source:"Final PDF page 17"},status:"needs_review",critical:false,is_stale:false,source_version:1,review_version:1});
  items.push({id:"REV-STRUCTURAL-COVERAGE",project_id:projectId,floor_id:"PROJECT",entity_type:"workbook_assumption",entity_id:"structural-coverage",display_number:"STR",title:"Structural overlay coverage is preliminary",data:{basis:"The final PDF provides structural plans and details, but the interactive demo contains representative detected columns, beams and slabs rather than a completed engineering takeoff.",impact:"Structural quantities shown in Workbook and BOQ are partial and must not be treated as final quantities.",resolution:"Coordinate the architectural/structural title conflict, complete detection on every structural sheet and have the structural engineer approve sizes and slab thicknesses.",source:"Final PDF pages 23–28"},status:"needs_review",critical:true,is_stale:false,source_version:1,review_version:1});
  let filtered=items;
  if(floorId) filtered=filtered.filter(i=>i.floor_id===floorId);
  if(category!=="all"){
    if(category==="needs_review") filtered=filtered.filter(i=>i.status==="needs_review");
    else if(category==="roof") filtered=filtered.filter(i=>i.entity_type.startsWith("roof_"));
    else if(category==="ceiling") filtered=filtered.filter(i=>i.entity_type.startsWith("ceiling_"));
    else if(category==="floor") filtered=filtered.filter(i=>i.entity_type==="floor");
    else filtered=filtered.filter(i=>i.entity_type===category || i.entity_type.startsWith(`${category}_`));
  }
  const all=items.length, ready=items.filter(i=>i.status==="ready").length, confirmed=items.filter(i=>i.status==="confirmed").length, needs=items.filter(i=>i.status==="needs_review").length;
  const floors=st.storeys.map(s=>{const x=items.filter(i=>i.floor_id===s.id);return{id:s.id,name:s.name,level_index:s.levelIndex,total:x.length,confirmed:x.filter(i=>i.status==="confirmed").length,ready:x.filter(i=>i.status==="ready").length,needs_review:x.filter(i=>i.status==="needs_review").length};});
  return {project_id:projectId,floors,counts:{all,ready,confirmed,needs_review:needs,column:items.filter(i=>i.entity_type==="column").length,beam:items.filter(i=>i.entity_type==="beam").length,slab:items.filter(i=>i.entity_type==="slab").length,door:items.filter(i=>i.entity_type==="door").length,window:items.filter(i=>i.entity_type==="window").length,wall:items.filter(i=>i.entity_type==="wall").length,floor:items.filter(i=>i.entity_type==="floor").length,wall_finish:items.filter(i=>i.entity_type==="wall_finish").length,roof:items.filter(i=>i.entity_type.startsWith("roof_")).length,ceiling:items.filter(i=>i.entity_type.startsWith("ceiling_")).length},items:filtered,stale:false,active_jobs:[]};
}

export function buildReviewState(projectId:string, floorId:string|null, category:string):ReviewState{
  const st=useDemoStore.getState();
  const structure=useStructuralStore.getState();
  const special=useSpecialStore.getState();
  const items:ReviewItem[]=[];
  const nrm2Items=(type:ReviewItem["entity_type"])=>type==="column"||type==="beam"||type==="slab"?["NRM2 11 — In-situ concrete","NRM2 11 — Formwork"]:type==="stair"?["NRM2 11 — In-situ concrete/formwork where applicable","NRM2 25 — Stairs, walkways and balustrades","NRM2 28.11 — Stair tread finishes where applicable","NRM2 28.12 — Stair riser finishes where applicable","NRM2 28.13 — Stair string/apron finishes where applicable"]:type==="wall"?["NRM2 14 — Masonry where applicable","NRM2 20 — Proprietary walls, linings and partitions where applicable","NRM2 11 — In-situ concrete where applicable"]:type==="door"?["NRM2 24 — Doors, shutters and hatches"]:type==="window"?["NRM2 23 — Windows, screens and lights"]:type==="floor_finish"?["NRM2 28 — Floor finishes","NRM2 28.1 — Screeds where specified","NRM2 28.14 — Skirting where specified"]:type==="wall_finish"||type==="ceiling_zone"?["NRM2 28 — Floor, wall and ceiling finishes"]:type.startsWith("roof_")?["NRM2 19 — Waterproofing and roof work"]:[];
  const add=(entityType:ReviewItem["entity_type"], entityId:string, itemFloorId:string, mark:string, title:string, data:Record<string,unknown>, status:DemoStatus, critical=false)=>items.push({id:`REV-${entityId}`,project_id:projectId,floor_id:itemFloorId,entity_type:entityType,entity_id:entityId,display_number:mark,title,data:{...data,nrm2_work_items:nrm2Items(entityType)},status:statusToReview(status),critical,is_stale:false,source_version:1,review_version:status==="confirmed"?2:1});

  structure.columns.forEach(item=>{const f=structure.columnFamilies.find(x=>x.id===item.familyId);if(f){const section=structuralColumnSection(item,f);add("column",item.id,item.floorId,item.columnMark||f.mark,`${item.columnMark||f.mark} · ${f.description}`,{floor:floorName(item.floorId),type_code:f.mark,description:f.description,shape:f.shape,width_mm:section.widthMm,depth_mm:section.depthMm,diameter_mm:section.diameterMm,height_m:item.heightM,concrete_m3:structuralColumnConcreteM3ForReview(item,f),formwork_m2:structuralColumnFormworkM2ForReview(item,f),reinforcement_kg:item.reinforcementKg??null,reinforcement_status:item.reinforcementKg==null?"information_required":"supported",section_source:item.sectionSource,height_source:item.heightSource,confidence:item.confidence,source:f.source},item.status,item.heightM<=0||(structure.columnDataSource==="production"&&!isConcreteColumnFamily(f)?false:structuralColumnConcreteM3(item,f)<=0))}});
  structure.beams.forEach(item=>{const f=structure.beamFamilies.find(x=>x.id===item.familyId);if(f){const length=structuralBeamLengthM(item);add("beam",item.id,item.floorId,item.mark||f.mark,`${item.mark||f.mark} · ${f.description}`,{floor:item.floorLabel||floorName(item.floorId),type_code:f.mark,description:f.description,kind:item.kind,width_mm:f.widthMm,depth_mm:f.depthMm,drop_mm:item.dropMm,gross_length_m:item.grossLengthM??length,length_m:length,net_length_m:item.netLengthM??length,concrete_m3:structuralBeamConcreteM3(item,f),source:item.sourceDocument?`${item.sourceDocument}${item.sourcePageNumber?` · page ${item.sourcePageNumber}`:""}`:f.source,dimension_source:item.dimensionSource||undefined},item.status)}});
  structure.slabPlates.forEach(item=>{const f=structure.slabFamilies.find(x=>x.id===item.familyId);if(f)add("slab",item.id,item.floorId,f.mark,`${f.mark} · ${f.description}`,{floor:floorName(item.floorId),type_code:f.mark,description:f.description,net_area_m2:zoneAreaM2(item.points,item.voids,scaleForViewport(item.viewportId)),thickness_mm:item.thicknessOverrideMm||f.thicknessMm,source:f.source},item.status,item.thicknessStatus==="varies")});
  special.flights.filter(item=>!item.evidenceOnly).forEach(item=>{const f=special.flightFamilies.find(x=>x.id===item.familyId);if(f)add("stair",item.id,item.floorId,item.typeMark||f.mark,`${item.typeMark||f.mark} · ${f.description}`,{floor:floorName(item.floorId),kind:item.kind||f.kind,description:f.description,plan_area_m2:item.planAreaM2??zoneAreaM2(item.points,item.voids,scaleForViewport(item.viewportId)),sloping_surface_area_m2:item.slopingSurfaceAreaM2??null,intermediate_landing_area_m2:item.landingAreaM2??null,width_mm:item.widthMm||f.widthMm||null,total_rise_m:item.riseOverrideM??null,slope_degrees:item.slopeDegrees??null,slope_percent:item.slopePercent??null,waist_mm:item.waistMm||f.waistMm||null,riser_mm:item.riserMm||f.riserMm||null,tread_mm:item.treadMm||f.treadMm||null,riser_count:item.riserCount??null,tread_count:item.treadCount??null,concrete_m3:item.concreteM3??null,formwork_soffit_m2:item.formworkM2??null,tread_finish_m2:item.treadFinishM2??null,riser_finish_m2:item.riserFinishM2??null,string_apron_finish_m2:item.stringApronFinishM2??null,ramp_finish_m2:item.rampFinishM2??null,balustrade_length_m:item.balustradeLengthM??null,construction_type:f.constructionType||"unknown",quantity_status:item.quantityStatus||"needs_review",reinforcement_status:item.reinforcementStatus||"information_required",source:f.source},item.status,item.quantityStatus!=="ready")});
  st.openings.forEach(item=>{const f=st.openingFamilies.find(x=>x.id===item.familyId);if(f)add(item.kind,item.id,item.floorId,f.mark,`${f.mark} · ${f.description}`,{floor:floorName(item.floorId),type_code:f.mark,width_mm:f.widthMm,height_mm:f.heightMm,material:f.material,finish:f.description,source:f.source},item.status)});
  st.walls.forEach(item=>{const f=st.wallFamilies.find(x=>x.id===item.familyId);if(f)add("wall",item.id,item.floorId,f.mark,`${f.mark} · ${f.description}`,{floor:floorName(item.floorId),wall_type:f.mark,classification:f.classification,thickness_mm:f.thicknessMm,length_m:wallLengthM(item),height_m:item.heightM,gross_area_m2:wallGrossAreaM2(item),opening_deductions_m2:wallOpeningDeductM2(item),net_area_m2:wallNetAreaM2(item),source:"Measured from plan"},item.status)});
  st.wallFinishFamilies.forEach(f=>{const floorIds=[...new Set(st.walls.filter(w=>wallHasFinish(w,f.id)).map(w=>w.floorId))];floorIds.forEach(fid=>{const walls=st.walls.filter(w=>w.floorId===fid&&wallHasFinish(w,f.id));if(!walls.length)return;const area=walls.reduce((sum,w)=>sum+wallFinishAreaForWall(w,f.id),0);const status:DemoStatus=walls.every(w=>w.status==="confirmed")?"confirmed":"ready";add("wall_finish",`WF-${f.id}-${fid}`,fid,f.mark,`${f.mark} · ${f.description}`,{floor:floorName(fid),finish_code:f.mark,wall_finish:f.description,material:f.material,thickness_mm:f.thicknessMm,area_m2:area,source:f.source},status)})});
  st.floorZones.forEach(item=>{const f=st.floorFamilies.find(x=>x.id===item.familyId);if(f)add("floor_finish",item.id,item.floorId,f.mark,`${f.mark} · ${item.room}`,{floor:floorName(item.floorId),floor_type_code:f.mark,room_name:item.room,area_m2:zoneNetAreaM2(item),floor_finish:f.description,material:f.material,screed:f.screed,falls:f.falls,source:f.source},item.status)});
  st.ceilingZones.forEach(item=>{const f=st.ceilingFamilies.find(x=>x.id===item.familyId);if(f)add("ceiling_zone",item.id,item.floorId,f.mark,`${f.mark} · ${item.room}`,{floor:floorName(item.floorId),room_name:item.room,net_area_m2:zoneNetAreaM2(item),ceiling_system:f.description,material:f.material,source:f.source},item.status)});
  st.roofZones.forEach(item=>{const f=st.roofFamilies.find(x=>x.id===item.familyId);if(f)add("roof_plane",item.id,item.floorId,f.mark,`${f.mark} · ${item.scope}`,{floor:item.scope,net_area_m2:roofNetAreaM2(item),roof_system:f.description,layers:f.layers,falls:f.falls,upstand_m:roofUpstandM(item),source:f.source},item.status)});

  let filtered=items;
  if(floorId)filtered=filtered.filter(item=>item.floor_id===floorId);
  if(category!=="all")filtered=category==="needs_review"?filtered.filter(item=>item.status==="needs_review"):category==="roof"?filtered.filter(item=>item.entity_type.startsWith("roof_")):category==="ceiling"?filtered.filter(item=>item.entity_type.startsWith("ceiling_")):filtered.filter(item=>item.entity_type===category||item.entity_type.startsWith(`${category}_`));
  const count=(predicate:(item:ReviewItem)=>boolean)=>items.filter(predicate).length;
  const floors=st.storeys.map(storey=>{const records=items.filter(item=>item.floor_id===storey.id);return{id:storey.id,name:storey.name,level_index:storey.levelIndex,total:records.length,confirmed:records.filter(item=>item.status==="confirmed").length,ready:records.filter(item=>item.status==="ready").length,needs_review:records.filter(item=>item.status==="needs_review").length}});
  return {project_id:projectId,floors,counts:{all:items.length,ready:count(x=>x.status==="ready"),confirmed:count(x=>x.status==="confirmed"),needs_review:count(x=>x.status==="needs_review"),column:count(x=>x.entity_type==="column"),beam:count(x=>x.entity_type==="beam"),slab:count(x=>x.entity_type==="slab"),stair:count(x=>x.entity_type==="stair"),door:count(x=>x.entity_type==="door"),window:count(x=>x.entity_type==="window"),wall:count(x=>x.entity_type==="wall"),floor:0,floor_finish:count(x=>x.entity_type==="floor_finish"),wall_finish:count(x=>x.entity_type==="wall_finish"),roof:count(x=>x.entity_type.startsWith("roof_")),ceiling:count(x=>x.entity_type.startsWith("ceiling_"))},items:filtered,stale:false,active_jobs:[]};
}

const template:BoqTemplatePackage={id:"TPL-DEMO",name:"Quanto standard takeoff",description:"Demo quantity takeoff template",category:"Construction",version:1,is_default:true,is_builtin:true,is_active:true,items:[]};
function row(id:string,section:string,itemCode:string,description:string,quantity:number,unit:string,rate:number|null,entityType:string,floorIds:string[],sourceIds:string[]):BoqRow{
  return {id,floor_id:floorIds.length===1?floorIds[0]:null,entity_type:entityType,section,item_code:itemCode,boq_item_number:itemCode,bill_no:null,bill_name:section,subcategory_code:null,subcategory_name:null,description,quantity:Number(quantity.toFixed(2)),unit,rate,amount:rate==null?null:Number((quantity*rate).toFixed(2)),status:rate==null?"needs_review":"ready",source_ids:sourceIds,source_items:[],floor_ids:floorIds,floor_names:floorIds.map(floorName),missing_fields:rate==null?["rate"]:[],manual:false,protected_description:false,protected_rate:false,excluded:false,sort_order:0};
}

export function buildBoqRowsLegacy():BoqRow[]{
  const st=useDemoStore.getState(); const structure=useStructuralStore.getState(); const rows:BoqRow[]=[];
  for(const f of structure.columnFamilies){const items=structure.columns.filter(item=>item.familyId===f.id);if(!items.length)continue;const floorIds=[...new Set(items.map(item=>item.floorId))];const quantity=items.reduce((sum,item)=>sum+structuralColumnConcreteM3(item,f)*floorFactor(item.floorId),0);rows.push(row(`BOQ-COLUMN-${f.id}`,"Concrete structure — Columns",f.mark,`PRELIMINARY PARTIAL OVERLAY — ${f.description}; ${f.shape==="Circular"?`${f.diameterMm||f.widthMm} mm diameter`:`${f.widthMm} × ${f.depthMm} mm`}`,quantity,"m³",null,"column",floorIds,items.map(item=>item.id)))}
  for(const f of structure.beamFamilies){const items=structure.beams.filter(item=>item.familyId===f.id);if(!items.length)continue;const floorIds=[...new Set(items.map(item=>item.floorId))];const production=items.some(item=>item.netLengthM!=null);let quantity=0;for(const floorId of floorIds)for(const kind of (["Downstand","Through"] as const)){const group=items.filter(item=>item.floorId===floorId&&item.kind===kind);if(!group.length)continue;const calculated=group.reduce((sum,item)=>sum+structuralBeamConcreteM3(item,f),0);quantity+=structure.workbookOverrides[`beams:${f.id}:${floorId}:${kind}`]??calculated}rows.push(row(`BOQ-BEAM-${f.id}`,"Concrete structure — Beams",f.mark,`${production?"": "PRELIMINARY PARTIAL OVERLAY — "}${f.description}; ${f.widthMm} × ${f.depthMm} mm`,quantity,"m³",null,"beam",floorIds,items.map(item=>item.id)))}
  for(const f of structure.slabFamilies){
    const items=structure.slabPlates.filter(item=>item.familyId===f.id&&!item.sectionProfile);
    if(!items.length)continue;
    const floorIds=[...new Set(items.map(item=>item.floorId))];
    const variable=items.some(item=>item.thicknessStatus==="varies");
    let quantity=0;
    for(const floorId of floorIds){
      const group=items.filter(item=>item.floorId===floorId);
      const calculated=group.reduce((sum,item)=>{
        const area=zoneAreaM2(item.points,item.voids,scaleForViewport(item.viewportId));
        return sum+(variable?area:area*((item.thicknessOverrideMm||f.thicknessMm)/1000));
      },0)*floorFactor(floorId);
      quantity+=structure.workbookOverrides[`slab:${f.id}:${floorId}`]??calculated;
    }
    const result=row(`BOQ-SLAB-${f.id}`,"Concrete structure — Slabs",f.mark,variable?`AREA CONTROL ONLY — ${f.description}; thickness varies by structural panel`:`${f.description}; ${f.thicknessMm} mm`,quantity,variable?"m²":"m³",null,"slab",floorIds,items.map(item=>item.id));
    if(variable){result.excluded=true;result.subcategory_name="Excluded from concrete volume until the annotated thickness zones are split and verified.";}
    rows.push(result);
  }
  const accepted=(key:string,value:number)=>st.workbookOverrides[key]??value;
  let doorNo=0,windowNo=0;
  for(const item of MATTEGODA_OPENING_SCHEDULE){
    const isDoor=item.kind==="door", sequence=isDoor?++doorNo:++windowNo, code=`${isDoor?"A":"B"}.${String(sequence).padStart(2,"0")}`;
    const floorIds=item.floorsOneToSixQty>0?["FF","TYP"]:item.location.toLowerCase().includes("roof")||item.location.toLowerCase().includes("water tank")?["RF"]:["GF"];
    const result=row(`BOQ-IMPORT-OPENING-${item.ref}`,isDoor?"A — Doors":"B — Windows",code,`${item.ref} — ${item.description}; ${Math.round(item.widthMm)} × ${Math.round(item.heightMm)} mm; ${item.material}`,accepted(`import:opening:${item.ref}`,item.scheduledQty),"nr",null,item.kind,floorIds,[`Openings:${item.ref}`]);
    result.status=workbookStatus(item.status); result.subcategory_code=isDoor?"NRM2 24.2":"NRM2 23.1"; result.subcategory_name=item.note; rows.push(result);
  }
  MATTEGODA_MASONRY.forEach((item,index)=>{
    const result=row(`BOQ-IMPORT-MASONRY-${index+1}`,"C — Masonry",`C.${String(index+1).padStart(2,"0")}`,`${item.familyLabel} brick/block wall; ${item.scope}; net of scheduled opening deductions`,accepted(item.key,item.netM2),"m²",null,"wall",[item.floorId],[item.key]);
    result.status=workbookStatus(item.status); result.subcategory_code="NRM2 14"; result.subcategory_name=item.note; rows.push(result);
  });
  const floorByRef=(ref:string)=>MATTEGODA_FLOOR_AREAS.find(item=>item.ref===ref)!;
  const floorAccepted=(ref:string)=>{const item=floorByRef(ref);return accepted(item.key,item.totalM2)};
  const importedFloor=(id:string,code:string,description:string,quantity:number,floorIds:string[],sourceRefs:string[],excluded=false)=>{const result=row(id,"D — Floor finishes",code,description,quantity,"m²",null,"floor",floorIds,sourceRefs);result.status=excluded?"ready":"needs_review";result.excluded=excluded;result.subcategory_code=excluded?"CONTROL":"NRM2 22";rows.push(result)};
  importedFloor("BOQ-IMPORT-FLOOR-D01","D.01","Common-area floor finishes; F04/F05 split to be confirmed",floorAccepted("FA-03")+floorAccepted("FA-05"),["FF","TYP"],["FA-03","FA-05"]);
  importedFloor("BOQ-IMPORT-FLOOR-D02","D.02","Open roof-terrace finish F10",floorAccepted("FA-07"),["RF"],["FA-07"]);
  importedFloor("BOQ-IMPORT-FLOOR-D03","D.03","Flower-trough finish F12/W09",floorAccepted("FA-08"),["RF"],["FA-08"]);
  importedFloor("BOQ-IMPORT-FLOOR-DC1","D.C1","CONTROL — apartment-unit gross/composite areas",floorAccepted("FA-02")+floorAccepted("FA-04"),["FF","TYP"],["FA-02","FA-04"],true);
  importedFloor("BOQ-IMPORT-FLOOR-DC2","D.C2","CONTROL — ground-floor gross plan area",floorAccepted("FA-01"),["GF"],["FA-01"],true);
  importedFloor("BOQ-IMPORT-FLOOR-DC3","D.C3","CONTROL — roof enclosed/core gross area",floorAccepted("FA-06"),["RF"],["FA-06"],true);
  const bothFaces=MATTEGODA_MASONRY.reduce((sum,item)=>sum+accepted(item.key,item.netM2),0)*2;
  const finishRows=[["E.01","W01/W02 — internal plaster and paint",0],["E.02","W03 — toilet/wet-area wall tiling",0],["E.03","W05 — external render and coating",0],["E.C1","CONTROL — both faces of net masonry",bothFaces]] as const;
  finishRows.forEach(([code,description,quantity],index)=>{const control=code==="E.C1";const result=row(`BOQ-IMPORT-WALL-FINISH-${index+1}`,"E — Wall finishes",code,description,quantity,"m²",null,"wall_finish",["FF","TYP"],[code]);result.status=control?"ready":"needs_review";result.excluded=control;result.subcategory_code=control?"CONTROL":"NRM2 21";rows.push(result)});
  for(const f of st.ceilingFamilies){ const zs=st.ceilingZones.filter(z=>z.familyId===f.id); if(!zs.length)continue; const floorIds=[...new Set(zs.map(z=>z.floorId))]; const qty=floorIds.reduce((sum,fid)=>{const base=zs.filter(z=>z.floorId===fid).reduce((s,z)=>s+zoneNetAreaM2(z),0)*floorFactor(fid); const key=`ceiling:${f.id}:${fid}`; return sum+(st.workbookOverrides[key]??base);},0); rows.push(row(`BOQ-${f.id}`,"Ceilings",f.mark,`${f.description}; ${f.material}`,qty,"m²",null,"ceiling",floorIds,zs.map(z=>z.id))); }
  for(const f of st.roofFamilies){ const zs=st.roofZones.filter(z=>z.familyId===f.id); if(!zs.length)continue; const scopes=[...new Set(zs.map(z=>z.scope))]; const qty=scopes.reduce((sum,scope)=>{const base=zs.filter(z=>z.scope===scope).reduce((s,z)=>s+roofNetAreaM2(z),0); const key=`roof:${f.id}:${scope}`; return sum+(st.workbookOverrides[key]??base);},0); rows.push(row(`BOQ-${f.id}`,"Roof",f.mark,`${f.description}; ${f.layers}; falls ${f.falls.toLowerCase()}`,qty,"m²",null,"roof",["RF"],zs.map(z=>z.id))); }
  for(const u of st.upstandFamilies){ const zs=st.roofZones.filter(z=>z.upstandFamilyId===u.id); if(!zs.length)continue; const scopes=[...new Set(zs.map(z=>z.scope))]; const qty=scopes.reduce((sum,scope)=>{const base=zs.filter(z=>z.scope===scope).reduce((s,z)=>s+roofUpstandM(z),0); const key=`roof-upstand:${u.id}:${scope}`; return sum+(st.workbookOverrides[key]??base);},0); rows.push(row(`BOQ-${u.id}`,"Roof",u.mark,`${u.description}; ${u.heightMm} mm high`,qty,"m",null,"roof",["RF"],zs.map(z=>z.id))); }
  const merged=rows.map((r,i)=>{const override=st.boqOverrides[r.id]||{}; const next={...r,...override,sort_order:i+1}; if(next.rate!=null)next.amount=Number((next.quantity*next.rate).toFixed(2)); return next;});
  return [...merged,...st.manualRows];
}

export function getBoqDefaultRate(entityType:string,code:string,unit:string):number{
    if(entityType==="column")return 98000;
    if(entityType==="beam")return 105000;
    if(entityType==="slab")return 92000;
    if(entityType==="formwork")return 6500;
    if(entityType==="door")return code.startsWith("D1")?145000:95000;
    if(entityType==="window")return 62000;
    if(entityType==="wall")return 6800;
    if(entityType==="wall_concrete")return 92000;
    if(entityType==="wall_formwork")return 6500;
    if(entityType==="floor_finish")return code==="F08"?4200:code==="F10"||code==="F12"?11500:8500;
    if(entityType==="floor_screed")return 3200;
    if(entityType==="floor_skirting")return 2400;
    if(entityType==="wall_finish")return code==="W03"||code==="W04"?7200:code==="W08"||code==="W09"?5800:2800;
    if(entityType==="ceiling")return 5200;
    if(entityType==="roof")return unit==="m"?4500:12500;
    return 0;
}

export function buildBoqRows():BoqRow[]{
  const st=useDemoStore.getState();
  const structure=useStructuralStore.getState();
  const rows:BoqRow[]=[];
  const defaultRate=(entityType:string,code:string,unit:string):number|null=>st.boqSetup.rate_mode==="manual"?null:getBoqDefaultRate(entityType,code,unit);
  const add=(id:string,section:string,code:string,description:string,quantity:number,unit:string,entityType:string,floorIds:string[],sourceIds:string[])=>rows.push(row(id,section,code,description,quantity,unit,defaultRate(entityType,code,unit),entityType,floorIds,sourceIds));

  structure.columnFamilies.forEach(f=>{const records=structure.columns.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;if(structure.columnDataSource==="production"&&!isConcreteColumnFamily(f))return;const quantity=records.reduce((sum,item)=>sum+structuralColumnConcreteM3(item,f)*floorFactor(item.floorId),0);const dimensions=f.shape==="Circular"?`${f.diameterMm||f.widthMm} mm diameter`:`${f.widthMm} × ${f.depthMm} mm`;add(`BOQ-COLUMN-${f.id}`,f.nrmWorkSection||"Concrete structure — Columns",f.mark,`${f.description}; ${dimensions}`,quantity,"m³","column",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  structure.beamFamilies.forEach(f=>{const records=structure.beams.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+structuralBeamConcreteM3(item,f),0);add(`BOQ-BEAM-${f.id}`,"Concrete structure — Beams",f.mark,`${f.description}; ${f.widthMm} × ${f.depthMm} mm`,quantity,"m³","beam",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  structure.slabFamilies.forEach(f=>{const records=structure.slabPlates.filter(x=>x.familyId===f.id&&x.status==="confirmed"&&!x.sectionProfile&&x.thicknessStatus!=="varies");if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+zoneAreaM2(item.points,item.voids,scaleForViewport(item.viewportId))*((item.thicknessOverrideMm||f.thicknessMm)/1000)*floorFactor(item.floorId),0);add(`BOQ-SLAB-${f.id}`,"Concrete structure — Slabs",f.mark,`${f.description}; ${f.thicknessMm} mm`,quantity,"m³","slab",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  st.openingFamilies.forEach(f=>{const records=st.openings.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+floorFactor(item.floorId),0);add(`BOQ-OPENING-${f.id}`,records[0].kind==="door"?"Doors":"Windows",f.mark,`${f.description}; ${f.widthMm} × ${f.heightMm} mm; ${f.material}`,quantity,"nr",records[0].kind,[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  st.wallFamilies.forEach(f=>{
    const records=st.walls.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;
    const floorIds=[...new Set(records.map(x=>x.floorId))], sourceIds=records.map(x=>x.id);
    if(isInSituConcreteWallFamily(f)){
      // Concrete construction requires thickness to convert the measured wall face into volume.
      // A confirmed centreline/height alone is not enough, so do not silently emit masonry-area work.
      if(f.thicknessMm<=0)return;
      const volume=records.reduce((sum,item)=>sum+wallNetAreaM2(item)*(f.thicknessMm/1000)*floorFactor(item.floorId),0);
      const faceFormwork=records.reduce((sum,item)=>sum+2*wallNetAreaM2(item)*floorFactor(item.floorId),0);
      add(`BOQ-WALL-CONCRETE-${f.id}`,"In-situ concrete — Walls",f.mark,`${f.description}; ${f.thicknessMm} mm; net of supported opening deductions`,volume,"m³","wall_concrete",floorIds,sourceIds);
      add(`BOQ-WALL-FORMWORK-${f.id}`,"In-situ concrete — Formwork",`11.2-${f.mark}`,`Formwork to two main faces of ${f.description}; opening reveals/free ends excluded unless separately supported`,faceFormwork,"m²","wall_formwork",floorIds,sourceIds);
    }else{
      const quantity=records.reduce((sum,item)=>sum+wallNetAreaM2(item)*floorFactor(item.floorId),0);
      add(`BOQ-WALL-${f.id}`,wallConstructionSection(f),f.mark,`${f.description}; ${f.thicknessMm} mm; net of supported opening deductions`,quantity,"m²","wall",floorIds,sourceIds);
    }
  });
  st.floorFamilies.forEach(f=>{const records=st.floorZones.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+zoneNetAreaM2(item)*floorFactor(item.floorId),0);add(`BOQ-FLOOR-${f.id}`,"Floor finishes",f.mark,`${f.description}; ${f.material}`,quantity,"m²","floor_finish",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  st.wallFinishFamilies.forEach(f=>{const records=st.walls.filter(x=>x.status==="confirmed"&&wallHasFinish(x,f.id));if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+wallFinishAreaForWall(item,f.id)*floorFactor(item.floorId),0);add(`BOQ-WALL-FINISH-${f.id}`,"Wall finishes",f.mark,`${f.description}; ${f.material}`,quantity,"m²","wall_finish",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  st.ceilingFamilies.forEach(f=>{const records=st.ceilingZones.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+zoneNetAreaM2(item)*floorFactor(item.floorId),0);add(`BOQ-CEILING-${f.id}`,"Ceilings",f.mark,`${f.description}; ${f.material}`,quantity,"m²","ceiling",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  st.roofFamilies.forEach(f=>{const records=st.roofZones.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;add(`BOQ-ROOF-${f.id}`,"Roof",f.mark,`${f.description}; ${f.layers}; ${f.falls}`,records.reduce((sum,item)=>sum+roofNetAreaM2(item),0),"m²","roof",["RF"],records.map(x=>x.id))});
  st.upstandFamilies.forEach(f=>{const records=st.roofZones.filter(x=>x.upstandFamilyId===f.id&&x.status==="confirmed");if(!records.length)return;add(`BOQ-UPSTAND-${f.id}`,"Roof",f.mark,`${f.description}; ${f.heightMm} mm high`,records.reduce((sum,item)=>sum+roofUpstandM(item),0),"m","roof",["RF"],records.map(x=>x.id))});

  structure.columnFamilies.forEach(f=>{const records=structure.columns.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;if(structure.columnDataSource==="production"&&!isConcreteColumnFamily(f))return;add(`BOQ-FORM-COLUMN-${f.id}`,"In-situ concrete — Formwork",`11.2-${f.mark}`,`Formwork to vertical faces of ${f.description}`,records.reduce((sum,item)=>sum+structuralColumnFormworkM2(item,f)*floorFactor(item.floorId),0),"m²","formwork",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id));if(records.every(item=>item.reinforcementKg!=null)){add(`BOQ-REINF-COLUMN-${f.id}`,"In-situ concrete — Reinforcement",`11.3-${f.mark}`,`Supported reinforcement to ${f.description}`,records.reduce((sum,item)=>sum+(item.reinforcementKg||0)*floorFactor(item.floorId),0),"kg","reinforcement",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))}});
  structure.beamFamilies.forEach(f=>{const records=structure.beams.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;const quantity=records.reduce((sum,item)=>sum+structuralBeamFormworkM2(item,f),0);add(`BOQ-FORM-BEAM-${f.id}`,"In-situ concrete — Formwork",`11.2-${f.mark}`,`Formwork to sides and soffits of ${f.description}`,quantity,"m²","formwork",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  structure.slabFamilies.forEach(f=>{const records=structure.slabPlates.filter(x=>x.familyId===f.id&&x.status==="confirmed"&&!x.sectionProfile);if(!records.length)return;add(`BOQ-FORM-SLAB-${f.id}`,"In-situ concrete — Formwork",`11.2-${f.mark}`,`Formwork to soffits of ${f.description}`,records.reduce((sum,item)=>sum+zoneAreaM2(item.points,item.voids,scaleForViewport(item.viewportId))*floorFactor(item.floorId),0),"m²","formwork",[...new Set(records.map(x=>x.floorId))],records.map(x=>x.id))});
  st.floorFamilies.forEach(f=>{const records=st.floorZones.filter(x=>x.familyId===f.id&&x.status==="confirmed");if(!records.length)return;const floorIds=[...new Set(records.map(x=>x.floorId))];if(f.screed)add(`BOQ-SCREED-${f.id}`,"Floor, wall and ceiling finishes",`28.1-${f.mark}`,`${f.screed} beneath ${f.description}`,records.reduce((sum,item)=>sum+zoneNetAreaM2(item)*floorFactor(item.floorId),0),"m²","floor_screed",floorIds,records.map(x=>x.id));if(f.description.toLowerCase().includes("skirting")){const length=records.reduce((sum,item)=>sum+edgeLengthM(item.points,item.points.map(()=>true),scaleForViewport(item.viewportId))*floorFactor(item.floorId),0);add(`BOQ-SKIRT-${f.id}`,"Floor, wall and ceiling finishes",`28.14-${f.mark}`,`Matching skirting associated with ${f.description}`,length,"m","floor_skirting",floorIds,records.map(x=>x.id))}});

  const classified=rows.map(item=>{
    let bill_no="03",bill_name="Superstructure",subcategory_code="NRM2 11",subcategory_name=item.section||"Building work";
    if(item.entity_type==="wall"){
      if(item.section==="Partitions"){subcategory_code="NRM2 20";subcategory_name="Proprietary walls, linings and partitions"}
      else{subcategory_code="NRM2 14";subcategory_name="Masonry"}
    }
    else if(item.entity_type==="wall_concrete"){subcategory_code="NRM2 11";subcategory_name="In-situ concrete — Walls"}
    else if(item.entity_type==="wall_formwork"){subcategory_code="NRM2 11";subcategory_name="Formwork to in-situ concrete walls"}
    else if(item.entity_type==="door"){subcategory_code="NRM2 24";subcategory_name="Doors, shutters and hatches"}
    else if(item.entity_type==="window"){subcategory_code="NRM2 23";subcategory_name="Windows, screens and lights"}
    else if(["floor_finish","floor_screed","floor_skirting","wall_finish","ceiling"].includes(item.entity_type||"")){bill_no="04";bill_name="Finishes";subcategory_code=item.entity_type==="floor_skirting"?"NRM2 28.14":"NRM2 28";subcategory_name=item.section||"Finishes"}
    else if(item.entity_type==="roof"){subcategory_code="NRM2 19";subcategory_name="Waterproofing and roof work"}
    return {...item,bill_no,bill_name,subcategory_code,subcategory_name};
  });
  const sectionCounters:Record<string,number>={};
  classified.sort((a,b)=>`${a.bill_no}|${a.subcategory_code}|${a.item_code}`.localeCompare(`${b.bill_no}|${b.subcategory_code}|${b.item_code}`,undefined,{numeric:true}));

  return [...classified.map((base,index)=>{const sectionKey=`${base.bill_no}|${base.subcategory_code}`;sectionCounters[sectionKey]=(sectionCounters[sectionKey]||0)+1;const override=st.boqOverrides[base.id]||{};const next={...base,...override,boq_item_number:`${base.bill_no}.${String(base.subcategory_code||"").replace(/\D/g,"")||"00"}.${String(sectionCounters[sectionKey]).padStart(2,"0")}`,status:"ready",missing_fields:[],sort_order:index+1};if(next.rate!=null)next.amount=Number((next.quantity*next.rate).toFixed(2));else next.amount=null;return next}),...st.manualRows.filter(x=>!x.excluded)];
}

export function buildBoqState(projectId:string,floorId:string|null):BoqState{
  const st=useDemoStore.getState(); let rows=buildBoqRows(); if(floorId)rows=rows.filter(r=>r.floor_ids.includes(floorId));
  const summary={rows:rows.length,ready:rows.filter(r=>r.status==="ready").length,needs_review:rows.filter(r=>r.status==="needs_review").length,manual:rows.filter(r=>r.manual).length,doors:rows.filter(r=>r.entity_type==="door").length,windows:rows.filter(r=>r.entity_type==="window").length,walls:rows.filter(r=>["wall","wall_concrete","wall_formwork"].includes(r.entity_type||"")).length,wall_finishes:rows.filter(r=>r.entity_type==="wall_finish").length,floor_works:0,ceilings:rows.filter(r=>r.entity_type==="ceiling").length,roofs:rows.filter(r=>r.entity_type==="roof").length,floors:rows.filter(r=>r.entity_type==="floor_finish").length,subtotal:rows.reduce((s,r)=>s+Number(r.amount||0),0)};
  const subtotal=summary.subtotal||0; const vat=subtotal*st.boqSetup.vat_percentage/100;
  return {project_id:projectId,boq:{id:"BOQ-DEMO",name:st.boqSetup.boq_title,status:"ready",boq_version:1,template_version:1,setup_version:st.boqSetup.setup_version,generated_at:new Date().toISOString(),report_hash:"quanto-demo"},setup:st.boqSetup,template,templates:[template],rows,report:{title:st.boqSetup.boq_title,project_name:"Quanto",template_name:template.name,currency:st.boqSetup.currency,vat_percentage:st.boqSetup.vat_percentage,summary:{subtotal,vat,grand_total:subtotal+vat,bill_count:new Set(rows.map(r=>r.section)).size,row_count:rows.length}},floors:st.storeys.map(s=>({id:s.id,name:s.name,level_index:s.levelIndex})),stale:false,summary,active_jobs:[],exports:st.exports};
}
