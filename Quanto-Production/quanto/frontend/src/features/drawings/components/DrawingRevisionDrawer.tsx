import type { FloorDrawing } from "../types";

export function DrawingRevisionDrawer({ drawing, open, onClose }: { drawing: FloorDrawing; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/25" onClick={onClose}><aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Drawing history</p><h3 className="mt-1 text-lg font-semibold text-slate-950">{drawing.name}</h3></div><button type="button" onClick={onClose} className="h-10 w-10 rounded-lg border border-slate-200">×</button></div><div className="mt-6 space-y-3">{drawing.revisions.map((revision, index) => <div key={String(revision.id || index)} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-800">Revision {String(revision.revision_number || "")}</p><p className="mt-1 text-xs capitalize text-slate-500">{String(revision.status || "not ready").replaceAll("_", " ")}</p></div>)}{!drawing.revisions.length ? <p className="text-sm text-slate-500">No saved revisions.</p> : null}</div></aside></div>;
}

