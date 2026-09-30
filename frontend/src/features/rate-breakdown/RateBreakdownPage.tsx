"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { useRateBreakdownItems, useRateBreakdownMutations } from "./hooks";
import type { RateBreakdownItem, RateBreakdownItemInput } from "./types";

const emptyForm: RateBreakdownItemInput = { code: null, title: "", description: null };

export function RateBreakdownPage({ projectId }: { projectId: string }) {
  const itemsQuery = useRateBreakdownItems(projectId);
  const mutations = useRateBreakdownMutations(projectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RateBreakdownItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<RateBreakdownItem | null>(null);
  const [form, setForm] = useState<RateBreakdownItemInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const saving = mutations.createItem.isPending || mutations.updateItem.isPending || mutations.deleteItem.isPending;

  useEffect(() => {
    if (!modalOpen) return;
    setError(null);
    setForm(editingItem ? { code: editingItem.code, title: editingItem.title, description: editingItem.description } : emptyForm);
  }, [editingItem, modalOpen]);

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This action could not be completed.");
    }
  }

  function openCreate() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item: RateBreakdownItem) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function saveItem() {
    const title = form.title.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }
    const payload = {
      title,
      code: form.code?.trim() || null,
      description: form.description?.trim() || null,
    };
    await run(async () => {
      if (editingItem) await mutations.updateItem.mutateAsync({ id: editingItem.id, payload });
      else await mutations.createItem.mutateAsync(payload);
      setModalOpen(false);
      setEditingItem(null);
    });
  }

  return (
    <PlatformShell title="Rate Breakdown" eyebrow="Project production">
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Rate breakdown structure</h2>
            <p className="mt-1 text-sm text-slate-500">Structure-only project rate rows for future norm and pricing linking.</p>
          </div>
          <Button onClick={openCreate}>+ Add</Button>
        </header>
        {error || itemsQuery.error ? <p className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || "Rate breakdown data could not be loaded."}</p> : null}
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {itemsQuery.isLoading ? <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={4}>Loading rate breakdown...</td></tr> : null}
              {(itemsQuery.data || []).map((item) => (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-5 py-3 font-semibold text-slate-900">{item.code || <span className="font-medium text-slate-400">No code</span>}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{item.title}</td>
                  <td className="px-5 py-3 text-slate-600">{item.description || <span className="font-medium text-slate-400">No description</span>}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="mr-3 text-sm font-semibold text-blue-700" onClick={() => openEdit(item)}>Edit</button>
                    <button className="text-sm font-semibold text-red-600" onClick={() => setDeleteItem(item)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!itemsQuery.isLoading && !itemsQuery.data?.length ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={4}>No rate breakdown items yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      <ModalDialog
        open={modalOpen}
        title={editingItem ? "Edit rate item" : "Add rate item"}
        description="Create a simple structure row. It will not affect BOQ pricing yet."
        ariaLabel="Rate breakdown item"
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void saveItem()}>{saving ? "Saving..." : "Save"}</Button>
          </>
        )}
      >
        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Code</span>
            <input className="input mt-1" value={form.code || ""} placeholder="RB-001" onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Title</span>
            <input className="input mt-1" value={form.title} placeholder="Concrete structure" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <textarea className="input mt-1 min-h-28 py-3" value={form.description || ""} placeholder="Optional notes" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
        </div>
      </ModalDialog>
      <ModalDialog
        open={Boolean(deleteItem)}
        title="Delete rate item"
        description="This removes the rate breakdown item from this project."
        ariaLabel="Delete rate breakdown item"
        onClose={() => setDeleteItem(null)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="danger" disabled={saving} onClick={() => void run(async () => { if (deleteItem) await mutations.deleteItem.mutateAsync(deleteItem.id); setDeleteItem(null); })}>{saving ? "Deleting..." : "Delete"}</Button>
          </>
        )}
      >
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-950">{deleteItem?.title || "Rate item"}</p>
      </ModalDialog>
    </PlatformShell>
  );
}
