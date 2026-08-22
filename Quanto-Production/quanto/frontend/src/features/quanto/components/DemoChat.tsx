"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { ChatMessage } from "@/features/demo/types";
import { copilotProfile, requestDemoCopilot } from "@/features/quanto/copilot/demoCopilot";
import { useStructuralStore } from "@/features/quanto/structuralStore";

type DemoChatProps={
  chatKey:string;
  onPrimary?:()=>void;
  primaryLabel?:string;
  onShowEvidence?:()=>void;
  onOpenItem?:()=>void;
  contextLabel?:string;
};

export function DemoChat({chatKey,onPrimary,primaryLabel="Confirm",onShowEvidence,onOpenItem,contextLabel}:DemoChatProps){
  const demo=useDemoStore();
  const structural=useStructuralStore();
  const messages=demo.chat[chatKey]||[];
  const profile=copilotProfile(chatKey);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const requestRef=useRef(0);
  const scrollRef=useRef<HTMLDivElement|null>(null);
  const inputRef=useRef<HTMLTextAreaElement|null>(null);
  const counts=useMemo(()=>chatCounts(chatKey,demo,structural),[chatKey,demo,structural]);
  const structuralChat=chatKey==="takeoff.columns"||chatKey==="takeoff.beams"||chatKey==="takeoff.slab";
  const selectedItem=(structuralChat?structural.selectedId:demo.selectedEntityId)||undefined;
  const selectedViewport=demo.viewports.find(viewport=>viewport.id===demo.selectedViewportId)?.name;

  useEffect(()=>{const node=scrollRef.current;if(node)node.scrollTo({top:node.scrollHeight,behavior:messages.length>1?"smooth":"auto"})},[messages.length,busy]);
  useEffect(()=>{const node=inputRef.current;if(!node)return;node.style.height="auto";node.style.height=`${Math.min(220,Math.max(76,node.scrollHeight))}px`;node.style.overflowY=node.scrollHeight>220?"auto":"hidden"},[input]);

  function add(message:ChatMessage){demo.addChatMessage(chatKey,message)}

  async function sendPrompt(value:string){
    const prompt=value.trim();if(!prompt||busy)return;
    add({id:`m-${Date.now()}`,role:"user",text:prompt,entityId:selectedItem});
    setInput("");setBusy(true);
    const requestId=Date.now(),generation=++requestRef.current;
    try{
      const reply=await requestDemoCopilot({chatKey,prompt,context:{screen:profile.label,viewport:contextLabel||selectedViewport,selectedItem,readyCount:counts.ready,reviewCount:counts.review}});
      if(generation!==requestRef.current)return;
      add({id:`a-${requestId}`,role:"assistant",text:reply.text,evidence:reply.evidence,action:reply.action,entityId:selectedItem});
    }catch{
      if(generation!==requestRef.current)return;
      add({id:`a-${requestId}`,role:"assistant",text:"I couldn’t complete that request. Please try again."});
    }finally{if(generation===requestRef.current)setBusy(false)}
  }

  function stop(){requestRef.current+=1;setBusy(false)}
  function action(actionType:ChatMessage["action"]){if(actionType==="item"){onOpenItem?.();return}if(actionType==="evidence"){if(onShowEvidence)onShowEvidence();else if(chatKey==="pre.scale")window.dispatchEvent(new CustomEvent("quanto:show-scale-evidence"));else onOpenItem?.()}}
  function keyDown(event:KeyboardEvent<HTMLTextAreaElement>){if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendPrompt(input)}}

  return <section className="flex h-full min-h-0 flex-col bg-white" aria-label={`${profile.label} Copilot`}>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-5" aria-live="polite">
        {messages.map(message=><CopilotMessage key={message.id} message={message} actionEnabled={message.action==="item"?Boolean(onOpenItem):message.action==="evidence"?Boolean(onShowEvidence||onOpenItem||chatKey==="pre.scale"):false} onAction={()=>action(message.action)}/>) }
        {busy?<ThinkingMessage/>:null}
      </div>
    </div>

    <footer className="border-t border-slate-200 bg-white p-3">
      {onPrimary?<button onClick={onPrimary} className="mb-3 h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">{primaryLabel}</button>:null}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
        <textarea ref={inputRef} rows={3} className="block min-h-[76px] max-h-[220px] w-full resize-none border-0 bg-transparent px-2 py-1 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400" placeholder="Message Copilot…" value={input} onChange={event=>setInput(event.target.value)} onKeyDown={keyDown}/>
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <span className="text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</span>
          {busy?<button onClick={stop} title="Stop response" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white"><span className="h-2.5 w-2.5 rounded-sm bg-white"/></button>:<button onClick={()=>void sendPrompt(input)} disabled={!input.trim()} title="Send message" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><SendIcon/></button>}
        </div>
      </div>
    </footer>
  </section>;
}

function CopilotMessage({message,onAction,actionEnabled}:{message:ChatMessage;onAction:()=>void;actionEnabled:boolean}){
  const assistant=message.role==="assistant";
  const EvidenceContainer=actionEnabled?"button":"div";
  async function copy(){try{await navigator.clipboard.writeText(message.text)}catch{}}
  return <article className={assistant?"flex items-start gap-2.5":"flex justify-end"}>
    {assistant?<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white"><SparkIcon/></div>:null}
    <div className={assistant?"min-w-0 max-w-[calc(100%-38px)]":"max-w-[88%]"}>
      <div className={assistant?"text-sm leading-6 text-slate-700":"rounded-2xl rounded-br-md bg-slate-950 px-3.5 py-2.5 text-sm leading-5 text-white"}>{message.text}</div>
      {assistant&&message.evidence?.length?<div className="mt-2 space-y-1.5">{message.evidence.map((evidence,index)=><EvidenceContainer key={`${evidence.label}-${index}`} onClick={actionEnabled?onAction:undefined} className={actionEnabled?"flex w-full items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50":"flex w-full items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-left"}><EvidenceIcon/><span className="min-w-0"><strong className="block truncate text-[11px] text-blue-800">{evidence.label}</strong>{evidence.detail?<span className="block truncate text-[10px] text-blue-600">{evidence.detail}</span>:null}</span>{actionEnabled?<span className="ml-auto text-blue-500">→</span>:null}</EvidenceContainer>)}</div>:null}
      {assistant?<div className="mt-1.5 flex items-center gap-1"><button onClick={copy} className="rounded-md px-1.5 py-1 text-[10px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600">Copy</button>{actionEnabled&&message.action&&!message.evidence?.length?<button onClick={onAction} className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50">{message.action==="item"?"Open item":"Show evidence"}</button>:null}</div>:null}
    </div>
  </article>;
}

function ThinkingMessage(){return <div className="flex items-start gap-2.5"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white"><SparkIcon/></div><div className="flex h-9 items-center gap-1 rounded-2xl rounded-tl-md bg-slate-50 px-3" aria-label="Copilot is responding"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-.2s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-.1s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"/></div></div>}

function chatCounts(chatKey:string,demo:ReturnType<typeof useDemoStore.getState>,structural:ReturnType<typeof useStructuralStore.getState>){
  let statuses:Array<{status:string}>=[];
  if(chatKey==="takeoff.columns")statuses=structural.columns;
  else if(chatKey==="takeoff.beams")statuses=structural.beams;
  else if(chatKey==="takeoff.slab")statuses=structural.slabPlates;
  else if(chatKey==="takeoff.doors-windows")statuses=demo.openings;
  else if(chatKey==="takeoff.doors")statuses=demo.openings.filter(item=>item.kind==="door");
  else if(chatKey==="takeoff.windows")statuses=demo.openings.filter(item=>item.kind==="window");
  else if(chatKey==="takeoff.floor")statuses=demo.floorZones;
  else if(chatKey==="takeoff.ceiling")statuses=demo.ceilingZones;
  else if(chatKey==="takeoff.walls")statuses=demo.walls;
  else if(chatKey==="takeoff.roof")statuses=demo.roofZones;
  else if(chatKey==="pre.plans"||chatKey==="pre.scale")statuses=demo.viewports;
  else if(chatKey==="pre.height")statuses=demo.heights;
  else if(chatKey==="pre.slab")statuses=demo.slabs;
  else if(chatKey==="pre.specifications")statuses=demo.specifications;
  return{ready:statuses.filter(item=>item.status==="ready"||item.status==="confirmed").length,review:statuses.filter(item=>item.status==="needs_review").length};
}

function SparkIcon(){return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.2 4.1a5.2 5.2 0 0 0 3.6 3.6L21 12l-4.2 1.3a5.2 5.2 0 0 0-3.6 3.6L3 12l4.2-1.3a5.2 5.2 0 0 0 3.6-3.6L12 3z"/></svg>}
function SendIcon(){return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6-7-1z"/><path d="m12 13 7-8"/></svg>}
function EvidenceIcon(){return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>}
