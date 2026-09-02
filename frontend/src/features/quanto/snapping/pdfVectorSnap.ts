"use client";

import { useEffect, useMemo, useState } from "react";
import type { Point } from "@/features/demo/types";
import { requestJson } from "@/shared/services/apiClient";

export type PdfVectorSegment = {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layer: string;
  dashed: boolean;
  width_pt: number;
};

export type PdfVectorResponse = {
  viewport_id: string;
  width: number;
  height: number;
  vector_available: boolean;
  truncated: boolean;
  segments: PdfVectorSegment[];
};

export type PdfSnapKind = "endpoint" | "midpoint" | "intersection" | "nearest" | "grid";
export type PdfSnapTarget = { point: Point; kind: PdfSnapKind; label: string; distance: number; segmentIds: string[] };
export type PdfSnapModes = Record<PdfSnapKind, boolean>;

export const defaultPdfSnapModes: PdfSnapModes = {
  endpoint: true,
  midpoint: true,
  intersection: true,
  nearest: true,
  grid: false,
};
const SNAP_MODES_KEY="quanto.snap.modes.v1";
const SNAP_MODES_EVENT="quanto:snap-modes";

export function usePdfSnapModes(){
  const[modes,setModesState]=useState<PdfSnapModes>(defaultPdfSnapModes);
  useEffect(()=>{const load=()=>{try{setModesState({...defaultPdfSnapModes,...JSON.parse(window.localStorage.getItem(SNAP_MODES_KEY)||"{}")});}catch{setModesState(defaultPdfSnapModes);}};load();window.addEventListener(SNAP_MODES_EVENT,load);return()=>window.removeEventListener(SNAP_MODES_EVENT,load);},[]);
  const setMode=(kind:PdfSnapKind,enabled:boolean)=>{const next={...modes,[kind]:enabled};setModesState(next);window.localStorage.setItem(SNAP_MODES_KEY,JSON.stringify(next));window.dispatchEvent(new Event(SNAP_MODES_EVENT));};
  return{modes,setMode};
}

const cache = new Map<string, PdfVectorResponse>();
const GRID_SIZE = 128;
type SegmentIndex = { cells: Map<string, PdfVectorSegment[]>; global: PdfVectorSegment[] };
const segmentIndexCache = new WeakMap<PdfVectorSegment[], SegmentIndex>();

export function usePdfVectorSegments(viewportId: string) {
  const valid=Boolean(viewportId&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(viewportId));
  return usePdfVectorSource(valid?`viewport:${viewportId}`:"",valid?`/api/v1/viewports/${viewportId}/vectors`:"");
}

export function usePdfVectorSource(sourceKey:string,url:string) {
  const [state, setState] = useState<{ loading:boolean; data:PdfVectorResponse|null; error:string|null }>(() => ({ loading:false, data:cache.get(sourceKey)||null, error:null }));
  useEffect(() => {
    let cancelled=false;
    if (!sourceKey||!url) { setState({loading:false,data:null,error:null}); return; }
    const cached=cache.get(sourceKey);
    if(cached){setState({loading:false,data:cached,error:null});return;}
    setState({loading:true,data:null,error:null});
    requestJson<PdfVectorResponse>(url,{cache:"force-cache"}).then((data)=>{if(cancelled)return;cache.set(sourceKey,data);setState({loading:false,data,error:null});}).catch((error)=>{if(cancelled)return;setState({loading:false,data:null,error:error instanceof Error?error.message:"Vector index unavailable"});});
    return()=>{cancelled=true;};
  },[sourceKey,url]);
  return useMemo(()=>({ ...state, segments:state.data?.segments||[], vectorAvailable:Boolean(state.data?.vector_available) }),[state]);
}

function pointDistance(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y);}
function nearestOnSegment(point:Point,segment:PdfVectorSegment):Point{
  const dx=segment.x1-segment.x0,dy=segment.y1-segment.y0,lengthSquared=dx*dx+dy*dy;
  if(lengthSquared<1e-9)return{x:segment.x0,y:segment.y0};
  const ratio=Math.max(0,Math.min(1,((point.x-segment.x0)*dx+(point.y-segment.y0)*dy)/lengthSquared));
  return{x:segment.x0+ratio*dx,y:segment.y0+ratio*dy};
}
function segmentIntersection(a:PdfVectorSegment,b:PdfVectorSegment):Point|null{
  const r={x:a.x1-a.x0,y:a.y1-a.y0},s={x:b.x1-b.x0,y:b.y1-b.y0};
  const denominator=r.x*s.y-r.y*s.x;
  if(Math.abs(denominator)<1e-8)return null;
  const q={x:b.x0-a.x0,y:b.y0-a.y0};
  const t=(q.x*s.y-q.y*s.x)/denominator,u=(q.x*r.y-q.y*r.x)/denominator;
  if(t<0||t>1||u<0||u>1)return null;
  return{x:a.x0+t*r.x,y:a.y0+t*r.y};
}
function nearSegment(point:Point,segment:PdfVectorSegment,threshold:number){
  return point.x>=Math.min(segment.x0,segment.x1)-threshold&&point.x<=Math.max(segment.x0,segment.x1)+threshold&&point.y>=Math.min(segment.y0,segment.y1)-threshold&&point.y<=Math.max(segment.y0,segment.y1)+threshold;
}

function indexedLocalSegments(point:Point,segments:PdfVectorSegment[],threshold:number){
  let index=segmentIndexCache.get(segments);
  if(!index){
    index={cells:new Map(),global:[]};
    for(const segment of segments){
      const left=Math.floor(Math.min(segment.x0,segment.x1)/GRID_SIZE),right=Math.floor(Math.max(segment.x0,segment.x1)/GRID_SIZE),top=Math.floor(Math.min(segment.y0,segment.y1)/GRID_SIZE),bottom=Math.floor(Math.max(segment.y0,segment.y1)/GRID_SIZE);
      if((right-left+1)*(bottom-top+1)>256){index.global.push(segment);continue;}
      for(let x=left;x<=right;x+=1)for(let y=top;y<=bottom;y+=1){const key=`${x}:${y}`,bucket=index.cells.get(key);if(bucket)bucket.push(segment);else index.cells.set(key,[segment]);}
    }
    segmentIndexCache.set(segments,index);
  }
  const left=Math.floor((point.x-threshold)/GRID_SIZE),right=Math.floor((point.x+threshold)/GRID_SIZE),top=Math.floor((point.y-threshold)/GRID_SIZE),bottom=Math.floor((point.y+threshold)/GRID_SIZE),found=new Map<string,PdfVectorSegment>();
  index.global.forEach((segment)=>found.set(segment.id,segment));
  for(let x=left;x<=right;x+=1)for(let y=top;y<=bottom;y+=1)index.cells.get(`${x}:${y}`)?.forEach((segment)=>found.set(segment.id,segment));
  return [...found.values()].filter((segment)=>nearSegment(point,segment,threshold));
}

export function findPdfVectorSnap(point:Point,segments:PdfVectorSegment[],threshold:number,modes:PdfSnapModes=defaultPdfSnapModes):PdfSnapTarget|null{
  const local=indexedLocalSegments(point,segments,threshold);
  let best:PdfSnapTarget|null=null;
  const consider=(candidate:Point,kind:PdfSnapKind,label:string,segmentIds:string[])=>{
    const value=pointDistance(point,candidate);
    if(value<=threshold&&(!best||value<best.distance-0.001||(Math.abs(value-best.distance)<0.001&&snapPriority(kind)>snapPriority(best.kind))))best={point:candidate,kind,label,distance:value,segmentIds};
  };
  for(const segment of local){
    if(modes.endpoint){consider({x:segment.x0,y:segment.y0},"endpoint","PDF endpoint",[segment.id]);consider({x:segment.x1,y:segment.y1},"endpoint","PDF endpoint",[segment.id]);}
    if(modes.midpoint)consider({x:(segment.x0+segment.x1)/2,y:(segment.y0+segment.y1)/2},"midpoint","PDF midpoint",[segment.id]);
    if(modes.nearest)consider(nearestOnSegment(point,segment),"nearest","PDF line",[segment.id]);
  }
  if(modes.intersection){
    const intersectionSegments=local.slice(0,80);
    for(let first=0;first<intersectionSegments.length;first+=1)for(let second=first+1;second<intersectionSegments.length;second+=1){
      const intersection=segmentIntersection(intersectionSegments[first],intersectionSegments[second]);
      if(intersection)consider(intersection,"intersection","PDF intersection",[intersectionSegments[first].id,intersectionSegments[second].id]);
    }
  }
  if(modes.grid){const spacing=25;consider({x:Math.round(point.x/spacing)*spacing,y:Math.round(point.y/spacing)*spacing},"grid","Grid",[]);}
  return best;
}

function snapPriority(kind:PdfSnapKind){return kind==="intersection"?5:kind==="endpoint"?4:kind==="midpoint"?3:kind==="nearest"?2:1;}
