import { buildReviewState } from "@/features/demo/builders";
import { useDemoStore } from "@/features/demo/store";
import { useStructuralStore } from "@/features/quanto/structuralStore";
import { useSpecialStore } from "@/features/quanto/specialStore";
import type { ReviewState } from "./types";

export async function getReviewState(projectId:string,floorId:string|null,category:string):Promise<ReviewState>{ return buildReviewState(projectId,floorId,category); }
export async function updateReviewField(_projectId:string,itemId:string,field:string,value:unknown){
  const id=itemId.replace(/^REV-/,""); const st=useDemoStore.getState(); const structure=useStructuralStore.getState();
  if(id.startsWith("WF-")){ const [,finishId,floorId]=id.split("-"); st.walls.filter(w=>w.floorId===floorId&&(w.side1Finish===finishId||w.side2Finish===finishId)).forEach(w=>st.setEntityStatus("wall",w.id,"confirmed")); return {ok:true}; }
  const op=st.openings.find(x=>x.id===id); if(op){ if(field==="type_code" && typeof value==="string") st.updateOpening(id,{familyId:value,status:"confirmed"}); else st.updateOpening(id,{status:"confirmed"}); return {ok:true}; }
  const wall=st.walls.find(x=>x.id===id); if(wall){ if(field==="thickness_mm") st.updateWall(id,{status:"confirmed"}); else if(field==="side_1_finish") st.updateWall(id,{side1Finish:String(value),status:"confirmed"}); else if(field==="side_2_finish") st.updateWall(id,{side2Finish:String(value),status:"confirmed"}); else st.updateWall(id,{status:"confirmed"}); return {ok:true}; }
  const fz=st.floorZones.find(x=>x.id===id); if(fz){ if(field==="name") st.updateZone("floor",id,{room:String(value),status:"confirmed"}); else st.updateZone("floor",id,{status:"confirmed"}); return {ok:true}; }
  const cz=st.ceilingZones.find(x=>x.id===id); if(cz){ st.updateZone("ceiling",id,{status:"confirmed"}); return {ok:true}; }
  const rz=st.roofZones.find(x=>x.id===id); if(rz){ st.updateRoofZone(id,{status:"confirmed"}); return {ok:true}; }
  const column=structure.columns.find(x=>x.id===id);if(column){structure.updateColumn(id,field==="type_code"&&typeof value==="string"?{familyId:value,status:"confirmed"}:{status:"confirmed"});return{ok:true}}
  const beam=structure.beams.find(x=>x.id===id);if(beam){structure.updateBeam(id,field==="type_code"&&typeof value==="string"?{familyId:value,status:"confirmed"}:{status:"confirmed"});return{ok:true}}
  const slab=structure.slabPlates.find(x=>x.id===id);if(slab){structure.updateSlab(id,field==="type_code"&&typeof value==="string"?{familyId:value,status:"confirmed"}:{status:"confirmed"});return{ok:true}}
  return {ok:true};
}
export async function confirmReview(_projectId:string,itemIds:string[],scope:"selected"|"floor"|"project",floorId?:string|null){
  const st=useDemoStore.getState(); const structure=useStructuralStore.getState(); const special=useSpecialStore.getState(); const ids=new Set(itemIds.map(x=>x.replace(/^REV-/,"")));
  for(const id of ids){ if(id.startsWith("WF-")){ const [,finishId,fid]=id.split("-"); st.walls.filter(w=>w.floorId===fid&&(w.side1Finish===finishId||w.side2Finish===finishId)).forEach(w=>st.setEntityStatus("wall",w.id,"confirmed")); } }
  const should=(id:string,fid:string)=>scope==="project" || (scope==="floor"&&fid===floorId) || ids.has(id);
  structure.columns.forEach(x=>{if(should(x.id,x.floorId))structure.updateColumn(x.id,{status:"confirmed"})});structure.beams.forEach(x=>{if(should(x.id,x.floorId))structure.updateBeam(x.id,{status:"confirmed"})});structure.slabPlates.forEach(x=>{if(should(x.id,x.floorId))structure.updateSlab(x.id,{status:"confirmed"})});special.flights.forEach(x=>{if(!x.evidenceOnly&&should(x.id,x.floorId))special.updateFlight(x.id,{status:"confirmed"})});st.openings.forEach(x=>{if(should(x.id,x.floorId))st.setEntityStatus("opening",x.id,"confirmed")}); st.walls.forEach(x=>{if(should(x.id,x.floorId))st.setEntityStatus("wall",x.id,"confirmed")}); st.floorZones.forEach(x=>{if(should(x.id,x.floorId))st.setEntityStatus("floor",x.id,"confirmed")}); st.ceilingZones.forEach(x=>{if(should(x.id,x.floorId))st.setEntityStatus("ceiling",x.id,"confirmed")}); st.roofZones.forEach(x=>{if(should(x.id,x.floorId))st.setEntityStatus("roof",x.id,"confirmed")}); return {ok:true};
}
