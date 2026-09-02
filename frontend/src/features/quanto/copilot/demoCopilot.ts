import type { ChatEvidence, ChatMessage } from "@/features/demo/types";

export type CopilotContext = { screen:string; viewport?:string; selectedItem?:string; readyCount?:number; reviewCount?:number };
export type CopilotRequest = { chatKey:string; prompt:string; context:CopilotContext };
export type CopilotReply = { text:string; evidence?:ChatEvidence[]; action?:"evidence"|"item" };

const labels:Record<string,string>={
  "pre.upload":"Drawing package","pre.plans":"Plans review","pre.scale":"Scale check",
  "pre.height":"Storey height","pre.slab":"Slab profile","pre.specifications":"Specifications",
  "takeoff.columns":"Columns","takeoff.beams":"Beams","takeoff.doors-windows":"Doors & windows",
  "takeoff.doors":"Doors","takeoff.windows":"Windows","takeoff.floor":"Floor",
  "takeoff.ceiling":"Ceiling","takeoff.walls":"Walls","takeoff.roof":"Roof","takeoff.slab":"Slab",
};

function titleCase(value:string){return value.split(/[.-]/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(" ")}
export function copilotProfile(chatKey:string){return{label:labels[chatKey]||titleCase(chatKey.replace("takeoff.",""))}}

// Confirmation prompts belong in Item and Review, not in the conversation.
export function copilotQuestionPending(_chatKey:string,_messages:ChatMessage[]){return false}

export async function requestDemoCopilot({prompt,context}:CopilotRequest):Promise<CopilotReply>{
  await new Promise(resolve=>setTimeout(resolve,420));
  const text=prompt.toLowerCase(),selection=context.selectedItem;
  if(text.includes("evidence")||text.includes("source")||text.includes("where"))return{
    text:selection?`${selection} is linked to the active source drawing${context.viewport?` (${context.viewport})`:""}.`:`The active source is the current drawing${context.viewport?` (${context.viewport})`:""}.`,
    evidence:[{label:"Open source drawing",detail:context.viewport||"Current drawing",entityId:selection}],action:"evidence",
  };
  if(text.includes("need")||text.includes("unconfirmed")||text.includes("review"))return{
    text:`${context.reviewCount??0} item${context.reviewCount===1?"":"s"} need review; ${context.readyCount??0} are ready.`,action:"item",
  };
  if(text.includes("selected")||text.includes("explain"))return selection
    ?{text:`${selection} is linked to its family, storey, source drawing and calculated quantity.`,action:"item"}
    :{text:"Select an item on the drawing, then ask about it."};
  if(text.includes("downstand")||text.includes("through"))return{
    text:"A downstand projects below the slab. A through-beam remains within the slab depth and is deducted from the slab calculation.",action:"item",
  };
  return selection
    ?{text:`${selection} is selected. Its source and calculated fields are available in Item.`,action:"item"}
    :{text:"Select an item or ask about the current drawing."};
}
