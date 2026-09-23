"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ErrorMessage } from "@/shared/components/ErrorMessage";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { PlatformShell } from "@/features/platform/components/PlatformShell";
import { RateFileSwitcher } from "./RateFileSwitcher";
import { RateItemDrawer } from "./RateItemDrawer";
import { RateItemsTable } from "./RateItemsTable";
import { useRateFileMutations, useRateFiles, useRateItems, useRateOptions } from "./hooks";
import type { RateItem, RateItemInput, RateItemType } from "./types";
import { RATE_ITEM_TYPE_LABELS } from "./types";

export function RateFilesPage({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedRateFileId = params.get("rateFileId");
  const selectedItemId = params.get("itemId");
  const search = params.get("search") || "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [newItemType, setNewItemType] = useState<RateItemType>("material");
  const [deleteItem, setDeleteItem] = useState<RateItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const rateFilesQuery = useRateFiles(projectId);
  const optionsQuery = useRateOptions(projectId);
  const selectedRateFile = rateFilesQuery.data?.find((file) => file.id === selectedRateFileId) || rateFilesQuery.data?.[0] || null;
  const activeRateFileId = selectedRateFile?.id || null;
  const itemsQuery = useRateItems(projectId, activeRateFileId, search);
  const mutations = useRateFileMutations(projectId, activeRateFileId, search);
  const saving = mutations.createFile.isPending || mutations.updateFile.isPending || mutations.deleteFile.isPending || mutations.createItem.isPending || mutations.updateItem.isPending || mutations.deleteItem.isPending || mutations.createOption.isPending || mutations.deleteOption.isPending || mutations.deleteMaterialAttribute.isPending || mutations.deleteMaterialAttributeValue.isPending;
  const items = itemsQuery.data || [];
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) || null, [items, selectedItemId]);

  const setQuery = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    });
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [params, pathname, router]);

  useEffect(() => {
    if (!rateFilesQuery.data?.length) return;
    if (!selectedRateFileId || !rateFilesQuery.data.some((file) => file.id === selectedRateFileId)) {
      setQuery({ rateFileId: rateFilesQuery.data[0].id, itemId: null });
    }
  }, [rateFilesQuery.data, selectedRateFileId, setQuery]);

  function openAddItem() {
    setError(null);
    setQuery({ itemId: null });
    setTypeModalOpen(true);
  }

  function openEditItem(item: RateItem) {
    setError(null);
    setNewItemType(item.item_type);
    setQuery({ itemId: item.id });
    setDrawerOpen(true);
  }

  function selectAddType(itemType: RateItemType) {
    setNewItemType(itemType);
    setTypeModalOpen(false);
    setDrawerOpen(true);
  }

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This action could not be completed.");
    }
  }

  async function confirmDeleteItem() {
    if (!deleteItem) return;
    await run(async () => {
      await mutations.deleteItem.mutateAsync(deleteItem.id);
      if (selectedItemId === deleteItem.id) setQuery({ itemId: null });
      setDeleteItem(null);
    });
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(440, Math.max(180, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(nextWidth);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <PlatformShell title="Rate Files" eyebrow="Project settings" lockContent flushContent>
      <div className="flex h-full min-h-0 bg-[#e8edf3] p-2">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <RateFileSwitcher
            rateFiles={rateFilesQuery.data || []}
            selectedRateFileId={activeRateFileId}
            saving={saving}
            width={sidebarWidth}
            onSelect={(id) => setQuery({ rateFileId: id, itemId: null })}
            onCreate={async (name) => {
              try {
                setError(null);
                const created = await mutations.createFile.mutateAsync(name);
                setQuery({ rateFileId: created.id, itemId: null });
              } catch (caught) {
                const message = caught instanceof Error ? caught.message : "This action could not be completed.";
                setError(message);
                throw new Error(message);
              }
            }}
            onRename={(id, name) => void run(() => mutations.updateFile.mutateAsync({ id, name }))}
            onDelete={(id) => void run(async () => {
              if (!window.confirm("Delete this rate file and all of its rate compositions?")) return;
              await mutations.deleteFile.mutateAsync(id);
              if (activeRateFileId === id) setQuery({ rateFileId: null, itemId: null });
            })}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize rate file list"
            title="Drag to resize"
            className="group relative z-10 w-2 shrink-0 cursor-col-resize bg-white"
            onPointerDown={startResize}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200 group-hover:bg-blue-500" />
            <div className="absolute inset-y-0 left-1/2 hidden w-1 -translate-x-1/2 bg-blue-500/20 group-hover:block" />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Project pricing library</p>
                  <h1 className="mt-1 text-xl font-semibold text-slate-950">{selectedRateFile?.name || "Rate files"}</h1>
                </div>
                <input className="input max-w-sm" placeholder="Search rates" value={search} onChange={(event) => setQuery({ search: event.target.value })} />
              </div>
              {error || rateFilesQuery.error || itemsQuery.error ? <div className="mt-3"><ErrorMessage message={error || "Rate file data could not be loaded."} /></div> : null}
            </div>
            <RateItemsTable
              items={items}
              loading={itemsQuery.isLoading}
              selectedItemId={selectedItemId}
              addDisabled={!activeRateFileId}
              onAdd={openAddItem}
              onEdit={openEditItem}
              onDelete={(id) => setDeleteItem(items.find((item) => item.id === id) || null)}
            />
          </div>
        </div>
      </div>
      <RateItemDrawer
        open={drawerOpen}
        item={selectedItem}
        itemType={newItemType}
        saving={saving}
        error={error}
        options={optionsQuery.data || null}
        projectId={projectId}
        onClose={() => { setDrawerOpen(false); setQuery({ itemId: null }); }}
        onAddOption={async (optionType, value) => {
          try {
            setError(null);
            await mutations.createOption.mutateAsync({ optionType, value });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "This option could not be saved.";
            setError(message);
            throw new Error(message);
          }
        }}
        onDeleteOption={async (optionType, value) => {
          try {
            setError(null);
            await mutations.deleteOption.mutateAsync({ optionType, value });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "This option could not be deleted.";
            setError(message);
            throw new Error(message);
          }
        }}
        onDeleteMaterialAttribute={async (attributeId, materialName) => {
          try {
            setError(null);
            await mutations.deleteMaterialAttribute.mutateAsync({ attributeId, materialName });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "This material attribute could not be deleted.";
            setError(message);
            throw new Error(message);
          }
        }}
        onDeleteMaterialAttributeValue={async (attributeId, valueId, materialName) => {
          try {
            setError(null);
            await mutations.deleteMaterialAttributeValue.mutateAsync({ attributeId, valueId, materialName });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "This material attribute value could not be deleted.";
            setError(message);
            throw new Error(message);
          }
        }}
        onSave={async (payload: RateItemInput) => {
          await run(async () => {
            if (selectedItem) await mutations.updateItem.mutateAsync({ id: selectedItem.id, payload });
            else await mutations.createItem.mutateAsync(payload);
            setDrawerOpen(false);
            setQuery({ itemId: null });
          });
        }}
      />
      <ModalDialog
        open={typeModalOpen}
        title="Add rate item"
        description="Choose the type of rate to add to this composition."
        ariaLabel="Add rate item"
        onClose={() => setTypeModalOpen(false)}
        footer={<Button variant="secondary" onClick={() => setTypeModalOpen(false)}>Cancel</Button>}
      >
        <div className="grid gap-3">
          {(["material", "labour", "machinery"] as RateItemType[]).map((itemType) => (
            <button
              key={itemType}
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50"
              onClick={() => selectAddType(itemType)}
            >
              <span className="font-semibold text-slate-950">{RATE_ITEM_TYPE_LABELS[itemType]}</span>
              <span className="mt-1 block text-sm text-slate-500">
                {itemType === "material" ? "Supplier, brand, type, unit and rate." : itemType === "labour" ? "Name, group, unit and rate." : "Name, source, unit and rate."}
              </span>
            </button>
          ))}
        </div>
      </ModalDialog>
      <ModalDialog
        open={Boolean(deleteItem)}
        title="Delete rate item"
        description="This rate item will be removed from the selected project rate file."
        ariaLabel="Delete rate item"
        onClose={() => setDeleteItem(null)}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="danger" disabled={saving} onClick={() => void confirmDeleteItem()}>{saving ? "Deleting..." : "Delete rate"}</Button>
          </>
        )}
      >
        {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">
            {deleteItem?.material_name || deleteItem?.labour_name || deleteItem?.machinery_name || "Rate item"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {[deleteItem?.main_item, deleteItem?.unit_type, deleteItem?.unit_detail].filter(Boolean).join(" · ") || "No additional details"}
          </p>
        </div>
      </ModalDialog>
    </PlatformShell>
  );
}
