"use client";

import { useState } from "react";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import type { RateFile } from "./types";

export function RateFileSwitcher({
  rateFiles,
  selectedRateFileId,
  saving,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  rateFiles: RateFile[];
  selectedRateFileId: string | null;
  saving: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void> | void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function create() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Rate file name is required.");
      return;
    }
    try {
      setCreateError(null);
      await onCreate(name);
      setNewName("");
      setCreateOpen(false);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "The rate file could not be created.");
    }
  }

  function startEdit(file: RateFile) {
    setEditingId(file.id);
    setEditingName(file.name);
  }

  function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    onRename(editingId, name);
    setEditingId(null);
    setEditingName("");
  }

  return (
    <aside className="flex min-h-0 w-[340px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Project rate files</p>
        <Button className="mt-3 h-10 w-full" disabled={saving} onClick={() => { setNewName(""); setCreateError(null); setCreateOpen(true); }}>+ Add rate file</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {rateFiles.length ? rateFiles.map((file) => {
          const active = file.id === selectedRateFileId;
          return (
            <div key={file.id} className={active ? "mb-2 rounded-lg border border-blue-200 bg-blue-50 p-2" : "mb-2 rounded-lg border border-slate-200 bg-white p-2 hover:border-blue-200"}>
              {editingId === file.id ? (
                <div className="space-y-2">
                  <input className="input h-9" value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                  <div className="flex gap-2">
                    <Button className="h-8 px-2 text-xs" disabled={saving || !editingName.trim()} onClick={saveEdit}>Save</Button>
                    <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="block w-full text-left" onClick={() => onSelect(file.id)}>
                    <span className="block truncate text-sm font-semibold text-slate-950">{file.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">{file.item_count || 0} material items</span>
                  </button>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="text-xs font-semibold text-slate-500 hover:text-blue-700" onClick={() => startEdit(file)}>Rename</button>
                    <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-700" onClick={() => onDelete(file.id)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            No rate files yet. Create your first project rate file to start adding material rates.
          </div>
        )}
      </div>
      <ModalDialog
        open={createOpen}
        title="Add rate file"
        description="Create a project pricing library for this BOQ workspace."
        ariaLabel="Add rate file"
        onClose={() => setCreateOpen(false)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={saving || !newName.trim()} onClick={() => void create()}>{saving ? "Saving..." : "Add rate file"}</Button>
          </>
        )}
      >
        {createError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p> : null}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rate file name</span>
          <input
            className="input mt-2 w-full"
            autoFocus
            placeholder="Structural concrete rates"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
          />
        </label>
      </ModalDialog>
    </aside>
  );
}
