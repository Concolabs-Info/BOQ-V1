"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEditSessionStore } from "./editSessionStore";
import { useDemoStore } from "@/features/demo/store";
import { useStructuralStore } from "../structuralStore";
import { useSpecialStore } from "../specialStore";

export function EditChangesPrompt({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const router = useRouter();
  const key = useEditSessionStore((state) => state.key);
  const title = useEditSessionStore((state) => state.title);
  const pending = useEditSessionStore((state) => state.pendingAction);
  const pendingLabel = useEditSessionStore((state) => state.pendingLabel);
  const saving = useEditSessionStore((state) => state.saving);
  const save = useEditSessionStore((state) => state.save);
  const discard = useEditSessionStore((state) => state.discard);
  const stay = useEditSessionStore((state) => state.stay);

  useEffect(() => {
    if (!key?.startsWith("measurement:")) return;
    const state = useEditSessionStore.getState();
    const action = state.pendingAction;
    state.clear();
    action?.();
  }, [key]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!useEditSessionStore.getState().key) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const refresh = (event: Event) => {
      const editKey = (event as CustomEvent<{ key?: string }>).detail?.key || "";
      if (!editKey.startsWith("boq:")) {
        useDemoStore.getState().invalidateDerived();
        useStructuralStore.getState().invalidateDerived();
        useSpecialStore.getState().invalidateDerived();
      }
      void client.invalidateQueries({ queryKey: ["review", projectId] });
      void client.invalidateQueries({ queryKey: ["boq", projectId] });
    };
    const guardLinks = (event: MouseEvent) => {
      if (!useEditSessionStore.getState().key || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      useEditSessionStore.getState().requestAction(() => router.push(`${url.pathname}${url.search}${url.hash}`), "leave this page");
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("quanto:data-committed", refresh);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("quanto:data-committed", refresh);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [client, projectId, router]);

  if (!key || key.startsWith("measurement:")) return null;
  if (pending) return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="unsaved-title"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Unsaved changes</p><h2 id="unsaved-title" className="mt-1 text-lg font-semibold text-slate-950">Save changes to {title}?</h2><p className="mt-2 text-sm leading-6 text-slate-500">Save or discard {key === "boq:items" ? "these BOQ row edits" : "this edit"} before you {pendingLabel || "continue"}.</p><div className="mt-5 grid grid-cols-3 gap-2"><button type="button" onClick={stay} className="h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Stay</button><button type="button" onClick={discard} className="h-10 rounded-xl border border-red-200 text-sm font-semibold text-red-600">Discard</button><button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? "Saving…" : "Save"}</button></div></div></div>;
  return <div className="fixed bottom-5 left-1/2 z-[180] flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-white p-3 shadow-2xl" role="status"><span className="flex-1 px-2 text-sm"><strong className="text-slate-950">Unsaved changes</strong><span className="ml-2 text-slate-500">{title}</span></span><button type="button" onClick={discard} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:bg-slate-300">{saving ? "Saving…" : "Save changes"}</button></div>;
}
