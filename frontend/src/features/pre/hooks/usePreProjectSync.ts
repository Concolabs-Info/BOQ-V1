"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { preApi } from "../services/preApi";
import { usePreStore, type PreStage } from "../state/preStore";

export function usePreProjectSync(projectId: string, stage: PreStage) {
  const hydrate = usePreStore((s)=>s.hydrate);
  const setActiveStage = usePreStore((s)=>s.setActiveStage);
  const raw = usePreStore((s)=>s.raw);
  useEffect(()=>setActiveStage(stage),[stage,setActiveStage]);
  const query = useQuery({
    queryKey:["quanto-pre",projectId],
    queryFn:()=>preApi.pre(projectId),
    staleTime:0,
    refetchOnWindowFocus:false,
    refetchInterval:(q)=>{
      const value=q.state.data;
      const busy=value?.project.pre_status;
      return busy && ["triaging","specs_extracting"].includes(busy) ? 900 : 5000;
    },
  });
  useEffect(()=>{if(query.data)hydrate(projectId,query.data)},[projectId,query.data,hydrate]);
  return { ...query, raw };
}
