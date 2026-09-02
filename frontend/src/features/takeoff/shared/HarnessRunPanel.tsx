"use client";

import { useEffect, useMemo, useState } from "react";
import { requestJson } from "@/shared/services/apiClient";

const STAGES = ["scope", "bind", "detect", "verify", "resolve", "dimension", "quantify", "check"] as const;

type HarnessIssue = { code:string; message:string; severity:"info"|"warning"|"error"; entity_refs?:string[] };
type HarnessState = {
  id?:string;
  status?:"running"|"completed"|"needs_review"|"failed";
  current_stage?:string;
  progress?:number;
  message?:string|null;
  error_message?:string|null;
  evaluator_json?:{status?:string;issues?:HarnessIssue[];stats?:Record<string,unknown>};
  evaluator?:{status?:string;issues?:HarnessIssue[];stats?:Record<string,unknown>};
  checkpoint_json?:{completed_stages?:string[];stage_artifacts?:Record<string,unknown>};
  completed_stages?:string[];
  stage_artifacts?:Record<string,unknown>;
  recoverable?:boolean;
};
type HarnessResponse = { element:string; runtime_key:string; state:HarnessState; dependencies:{consumes:string[];publishes:string[]}; boq_ownership:string[] };
type HarnessEvent = { id?:number; stage?:string; event_kind?:string; message?:string; created_at?:string };

function tone(status?:string){
  if(status==="failed") return "border-rose-200 bg-rose-50 text-rose-900";
  if(status==="needs_review") return "border-amber-200 bg-amber-50 text-amber-900";
  if(status==="completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

export function HarnessRunPanel({projectId,element}:{projectId:string;element:string}){
  const [data,setData]=useState<HarnessResponse|null>(null);
  const [events,setEvents]=useState<HarnessEvent[]>([]);
  const [expanded,setExpanded]=useState(false);
  const [unavailable,setUnavailable]=useState(false);

  useEffect(()=>{
    if(!projectId||!element)return;
    let active=true;
    let timer:number|undefined;
    const load=async()=>{
      try{
        const base=`/api/v1/projects/${projectId}/takeoff/harness/${element}`;
        const next=await requestJson<HarnessResponse>(`${base}?fresh=${Date.now()}`);
        if(!active)return;
        setData(next);setUnavailable(false);
        if(expanded||next.state?.status==="running"){
          const log=await requestJson<{items:HarnessEvent[]}>(`${base}/events?fresh=${Date.now()}`);
          if(active)setEvents(log.items||[]);
        }
        if(next.state?.status==="running")timer=window.setTimeout(load,1200);
      }catch{if(active)setUnavailable(true);}
    };
    void load();
    return()=>{active=false;if(timer)window.clearTimeout(timer);};
  },[projectId,element,expanded]);

  const state=data?.state||{};
  const checkpoint=state.checkpoint_json||state;
  const completed=new Set(checkpoint.completed_stages||[]);
  const evaluator=state.evaluator_json||state.evaluator;
  const issues=evaluator?.issues||[];
  const summary=useMemo(()=>Object.entries(evaluator?.stats||{}).map(([key,value])=>`${key.replaceAll("_"," ")}: ${String(value)}`).join(" · "),[evaluator?.stats]);
  if(unavailable&&!data)return <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">Harness status is unavailable. Existing detected geometry remains visible, but final BOQ use should wait until the service reconnects.</div>;
  if(!state.status)return null;

  return <section className={`mb-2 rounded-xl border px-3 py-2.5 text-xs ${tone(state.status)}`} aria-label={`${element} harness status`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><span className="font-bold">Production harness</span><span className="ml-2 capitalize">{state.status.replace("_"," ")}</span><span className="ml-2 opacity-75">{state.message}</span></div>
      <button type="button" onClick={()=>setExpanded(value=>!value)} className="rounded-md border border-current/20 bg-white/70 px-2 py-1 font-semibold">{expanded?"Hide details":"Show details"}</button>
    </div>
    <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-8">
      {STAGES.map(stage=><div key={stage} className={`rounded px-1.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide ${completed.has(stage)?"bg-emerald-600 text-white":state.current_stage===stage?"bg-blue-600 text-white":"bg-white/70 text-slate-500"}`}>{stage}</div>)}
    </div>
    {state.status==="running"?<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70"><div className="h-full bg-blue-600 transition-all" style={{width:`${Math.max(2,Math.min(100,state.progress||0))}%`}}/></div>:null}
    {issues.length?<div className="mt-2 space-y-1">{issues.map(issue=><div key={issue.code} className="rounded-md bg-white/65 px-2 py-1"><span className="font-bold uppercase">{issue.severity}</span><span className="ml-2">{issue.message}</span></div>)}</div>:null}
    {summary?<p className="mt-2 text-[10px] opacity-75">{summary}</p>:null}
    {expanded?<div className="mt-2 grid gap-2 lg:grid-cols-2"><div className="rounded-lg bg-white/65 p-2"><p className="font-bold">Data flow</p><p className="mt-1 opacity-75">Consumes: {data?.dependencies.consumes.join(", ")||"none"}</p><p className="opacity-75">Publishes: {data?.dependencies.publishes.join(", ")||"none"}</p></div><div className="max-h-32 overflow-y-auto rounded-lg bg-white/65 p-2"><p className="font-bold">Recent events</p>{events.slice(-8).reverse().map((event,index)=><p key={event.id||index} className="mt-1 truncate opacity-75"><span className="uppercase">{event.stage}</span> · {event.message}</p>)}</div></div>:null}
  </section>;
}
