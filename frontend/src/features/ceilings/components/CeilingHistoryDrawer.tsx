"use client";

import { Button } from "@/shared/components/Button";
import type { CeilingHistory } from "../types";

export function CeilingHistoryDrawer({ open, history, saving, onClose, onRestore }: { open: boolean; history: CeilingHistory[]; saving: boolean; onClose: () => void; onRestore: (id: string) => Promise<void> }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onMouseDown={onClose}><aside className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-950">Ceiling edit history</h2><p className="text-sm text-slate-500">Restore a previous canonical ceiling state.</p></div><Button variant="secondary" onClick={onClose}>Close</Button></div>
    <div className="mt-5 space-y-3">{history.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold capitalize text-slate-900">{item.action.replaceAll("_", " ")} {item.entity_type}</p><p className="mt-1 text-xs text-slate-500">Version {item.ceiling_version} · {new Date(item.created_at).toLocaleString()}</p>{item.reason ? <p className="mt-2 text-sm text-slate-600">{item.reason}</p> : null}</div><Button variant="secondary" disabled={saving} onClick={() => void onRestore(item.id)}>Restore</Button></div></div>)}{!history.length ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No ceiling edits have been recorded for this floor.</p> : null}</div>
  </aside></div>;
}
