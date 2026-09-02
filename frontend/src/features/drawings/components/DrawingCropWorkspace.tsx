"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CropCanvas } from "@/features/floor-plans/components/CropCanvas";
import { useAssetUrl } from "@/features/floor-plans/hooks/useAssetUrl";
import type { FloorPlanDocument, FloorPlanPage, Rect } from "@/features/floor-plans/types";
import { fromOriginalPageRect, toOriginalPageRect, type Rotation } from "@/features/floor-plans/utils/coordinates";
import { Button } from "@/shared/components/Button";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { getDrawingSource, saveDrawingCrop, uploadDrawingSource } from "../api";
import type { FloorDrawing } from "../types";
import { DrawingSourcePicker } from "./DrawingSourcePicker";
import { useDocumentPages } from "@/features/floor-plans/hooks/useDocumentPages";

export function DrawingCropWorkspace({ projectId, floorName, drawing, documents, onClose, onChanged }: { projectId: string; floorName: string; drawing: FloorDrawing; documents: FloorPlanDocument[]; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const initialDocumentId=drawing.document_id || documents.find((item)=>item.is_primary)?.id || documents[0]?.id || "";
  const [extraDocument,setExtraDocument]=useState<FloorPlanDocument|null>(drawing.source_document || null); const availableDocuments=extraDocument && !documents.some((item)=>item.id===extraDocument.id)?[extraDocument,...documents]:documents;
  const [documentId,setDocumentId]=useState(initialDocumentId); const selectedDocument=availableDocuments.find((item)=>item.id===documentId) || null;
  const preferredPageNumber=selectedDocument?.id===drawing.document_id?(drawing.source_page_number||1):1;
  const pageBrowser=useDocumentPages(projectId,selectedDocument?.id,preferredPageNumber,selectedDocument?.status==="processing");
  const pages=pageBrowser.pages.length?pageBrowser.pages:(selectedDocument?.pages||[]);
  const [pageId,setPageId]=useState(drawing.document_page_id || ""); const selectedPage=useMemo(()=>pages.find((item)=>item.id===pageId)||pages.find((item)=>item.page_number===preferredPageNumber)||pages[0]||null,[pageId,pages,preferredPageNumber]);
  const [rotation,setRotation]=useState<Rotation>((drawing.rotation || 0) as Rotation); const [rect,setRect]=useState<Rect|null>(()=>initialRect(drawing,rotation));
  const [tool,setTool]=useState<"crop"|"pan">("crop"); const [zoom,setZoom]=useState(1.2); const [pan,setPan]=useState({x:0,y:0});
  const [saving,setSaving]=useState(false); const [uploading,setUploading]=useState(false); const [progress,setProgress]=useState(0); const [error,setError]=useState<string|null>(null);
  const [processingDocumentId,setProcessingDocumentId]=useState<string|null>(null);
  const previewUrl=useAssetUrl(selectedPage?.preview_url);

  useEffect(()=>{ if(selectedDocument&&pages.length&&!pages.some((page)=>page.id===pageId)){setPageId(pages.find((page)=>page.page_number===preferredPageNumber)?.id||pages[0]?.id||"");setRect(null);} },[pageId,pages,preferredPageNumber,selectedDocument]);
  useEffect(()=>{ const old=document.body.style.overflow; document.body.style.overflow="hidden"; return()=>{document.body.style.overflow=old;}; },[]);
  useEffect(()=>{
    if(!processingDocumentId)return;
    let cancelled=false; let attempts=0; let timer:ReturnType<typeof setTimeout>|null=null;
    const poll=async()=>{
      try{
        const result=await getDrawingSource(projectId,drawing.id,processingDocumentId);
        if(cancelled)return;
        setExtraDocument(result.document); setDocumentId(result.document.id);
        const readyPage=result.document.pages.find((page)=>Boolean(page.preview_url)&&Boolean(page.width)&&Boolean(page.height));
        if(readyPage){setPageId(readyPage.id);setRect(null);setProcessingDocumentId(null);return;}
        if(String(result.document.status).toLowerCase()==="failed"){setError("The uploaded drawing source could not be prepared.");setProcessingDocumentId(null);return;}
      }catch(reason){if(!cancelled&&attempts>=2)setError(reason instanceof Error?reason.message:"The uploaded drawing source status could not be checked.");}
      attempts+=1;
      if(!cancelled&&attempts<90)timer=setTimeout(()=>void poll(),1000);
      else if(!cancelled){setError("The drawing is still processing. You can close this crop view and return when it is ready.");setProcessingDocumentId(null);}
    };
    void poll();
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[drawing.id,processingDocumentId,projectId]);

  function changeDocument(id:string){setDocumentId(id);setPageId("");setRotation(0);setRect(null);setError(null);}
  function changeRotation(value:Rotation){if(rect&&selectedPage?.width&&selectedPage.height){const original=toOriginalPageRect(rect,rotation,selectedPage.width,selectedPage.height);setRect(fromOriginalPageRect(original,value,selectedPage.width,selectedPage.height));}setRotation(value);}
  async function upload(file:File){setUploading(true);setError(null);try{const result=await uploadDrawingSource(projectId,drawing.id,file,setProgress);setExtraDocument(result.document);setDocumentId(result.document.id);setPageId("");setRect(null);const ready=result.document.pages.some((page)=>Boolean(page.preview_url)&&Boolean(page.width)&&Boolean(page.height));if(!ready)setProcessingDocumentId(result.document.id);await onChanged();}catch(reason){setError(reason instanceof Error?reason.message:"The drawing source could not be uploaded.");}finally{setUploading(false);setProgress(0);}}
  async function save(){if(!selectedDocument||!selectedPage||!rect||!selectedPage.width||!selectedPage.height){setError("Select a page and draw the plan crop.");return;}setSaving(true);setError(null);try{await saveDrawingCrop(projectId,drawing.id,{document_id:selectedDocument.id,document_page_id:selectedPage.id,source_page_number:selectedPage.page_number,original_page_width:selectedPage.width,original_page_height:selectedPage.height,rotation,render_dpi:180,original_rect:toOriginalPageRect(rect,rotation,selectedPage.width,selectedPage.height),normalized_display_rect:rect});await onChanged();onClose();}catch(reason){setError(reason instanceof Error?reason.message:"The drawing crop could not be saved.");}finally{setSaving(false);}}

  return <div className="fixed inset-0 z-[110] flex h-[100dvh] flex-col overflow-hidden bg-white"><header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{drawing.name} crop</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{floorName}</h2></div><div className="flex items-center gap-2"><Tool active={tool==="crop"} onClick={()=>setTool("crop")}>Crop</Tool><Tool active={tool==="pan"} onClick={()=>setTool("pan")}>Hand</Tool><Tool onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>Fit</Tool><Tool onClick={()=>setZoom(Math.max(.25,zoom/1.2))}>−</Tool><span className="text-xs font-semibold text-slate-500">{Math.round(zoom*100)}%</span><Tool onClick={()=>setZoom(Math.min(40,zoom*1.2))}>+</Tool><button type="button" onClick={onClose} className="ml-2 h-10 w-10 rounded-lg border border-slate-200">×</button></div></header>
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)_320px]"><aside className="hidden overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 lg:block"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Pages</p><div className="space-y-3"><PageControls browser={pageBrowser}/>{pages.map((page)=><Page key={page.id} page={page} active={selectedPage?.id===page.id} onClick={()=>{setPageId(page.id);setRect(null);}}/>)}<PageControls browser={pageBrowser}/>{selectedDocument&&!pages.length?<p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">{pageBrowser.isLoading?"Loading pages.":"Page previews are processing. Close and reopen when ready."}</p>:null}</div></aside>
      <section className="min-h-0 overflow-hidden border-r border-slate-200"><CropCanvas imageUrl={previewUrl} rotation={rotation} value={rect} onChange={setRect} tool={tool} zoom={zoom} pan={pan} onPanChange={setPan} onZoomChange={setZoom}/></section>
      <aside className="overflow-y-auto p-5"><div className="space-y-6"><DrawingSourcePicker documents={availableDocuments} documentId={documentId} uploading={uploading} uploadProgress={progress} processing={Boolean(processingDocumentId)} onSelect={changeDocument} onUpload={(file)=>void upload(file)}/>
        <section><label className="text-sm font-semibold text-slate-700">Page</label><select value={selectedPage?.id||""} onChange={(event)=>{setPageId(event.target.value);setRect(null);}} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{pages.map((page)=><option key={page.id} value={page.id}>Page {page.page_number}{page.page_label?` — ${page.page_label}`:""}</option>)}</select><div className="mt-2 lg:hidden"><PageControls browser={pageBrowser}/></div></section>
        <section><p className="text-sm font-semibold text-slate-700">Rotation</p><div className="mt-2 grid grid-cols-4 gap-2">{([0,90,180,270] as Rotation[]).map((value)=><button type="button" key={value} onClick={()=>changeRotation(value)} className={`h-10 rounded-lg border text-xs font-semibold ${rotation===value?"border-blue-600 bg-blue-50 text-blue-700":"border-slate-200 text-slate-600"}`}>{value}°</button>)}</div></section>
        <section className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Processing route</p><p className="mt-2 text-sm font-semibold capitalize text-slate-900">{drawing.consumer.replaceAll("_"," ")}</p><p className="mt-1 text-xs text-slate-500">This drawing stays independent from the architectural crop.</p></section>{error?<ErrorMessage message={error}/>:null}</div></aside></div>
    <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 px-5 py-4"><p className="text-xs text-slate-500">Crop coordinates remain attached to this drawing revision.</p><div className="flex gap-3"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving||!selectedPage||!rect} onClick={()=>void save()}>{saving?"Saving":"Save drawing crop"}</Button></div></footer></div>;
}

function initialRect(drawing:FloorDrawing,rotation:Rotation):Rect|null{const original=drawing.coordinates?.original_rect;if(!original)return drawing.coordinates?.normalized_display_rect||null;if(!drawing.original_page_width||!drawing.original_page_height)return null;return fromOriginalPageRect(original,rotation,drawing.original_page_width,drawing.original_page_height);}
function Page({page,active,onClick}:{page:FloorPlanPage;active:boolean;onClick:()=>void}){const ref=useRef<HTMLButtonElement>(null);const [visible,setVisible]=useState(active);useEffect(()=>{if(active)setVisible(true);const node=ref.current;if(!node||visible||typeof IntersectionObserver==="undefined")return;const observer=new IntersectionObserver((entries)=>{if(entries.some((entry)=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:"300px"});observer.observe(node);return()=>observer.disconnect();},[active,visible]);const url=useAssetUrl(page.thumbnail_url,visible||active);return <button ref={ref} type="button" onClick={onClick} className={`lazy-list-item w-full rounded-xl border bg-white p-2 text-left ${active?"border-2 border-blue-600":"border-slate-200"}`}><div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-slate-100">{url?<img src={url} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain"/>:<span className="text-xs text-slate-400">Preparing</span>}</div><p className="mt-2 text-xs font-semibold text-slate-700">Page {page.page_number}</p></button>;}
function PageControls({browser}:{browser:ReturnType<typeof useDocumentPages>}){if(!browser.hasPrevious&&!browser.hasNext&&browser.total<=browser.limit)return null;const start=browser.total?browser.offset+1:0;const end=Math.min(browser.offset+browser.pages.length,browser.total);return <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 p-2 text-[11px] font-semibold text-slate-500"><button type="button" disabled={!browser.hasPrevious} onClick={browser.previous} className="disabled:text-slate-300">Previous</button><span>{start}–{end} of {browser.total}</span><button type="button" disabled={!browser.hasNext} onClick={browser.next} className="disabled:text-slate-300">Next</button></div>;}
function Tool({active=false,onClick,children}:{active?:boolean;onClick:()=>void;children:React.ReactNode}){return <button type="button" onClick={onClick} className={`h-10 rounded-lg px-3 text-sm font-semibold ${active?"bg-slate-950 text-white":"border border-slate-200 text-slate-600"}`}>{children}</button>;}
