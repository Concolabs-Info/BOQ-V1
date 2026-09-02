"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BEAMS,
  BEAM_FAMILIES,
  COLUMNS,
  COLUMN_FAMILIES,
  SLAB_FAMILIES,
  SLAB_PLATES,
} from "./structuralData";
import type {
  BeamFamily,
  BeamRun,
  ColumnFamily,
  ColumnInstance,
  SlabFamily,
  SlabPlate,
} from "./structuralTypes";
import {
  requestGuardedAction,
  useEditSessionStore,
} from "./editing/editSessionStore";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Snapshot = {
  columns: ColumnInstance[];
  beams: BeamRun[];
  slabPlates: SlabPlate[];
};
function stage<T>(
  key: string,
  title: string,
  original: T,
  restore: (value: T) => void,
): boolean {
  const edit = useEditSessionStore.getState();
  if (edit.saving) return false;
  if (edit.key === key || edit.key?.startsWith("geometry:")) return true;
  if (edit.key) {
    edit.requestAction(() => undefined, `edit ${title}`);
    return false;
  }
  edit.begin({
    key,
    title,
    original: clone(original),
    draft: null,
    commit: () => undefined,
    discard: () => restore(clone(original)),
  });
  return true;
}
const affectsBoq = (original: object, patch: object) =>
  Object.keys(patch).some(
    (key) =>
      key !== "status" &&
      key !== "color" &&
      JSON.stringify((original as Record<string, unknown>)[key]) !==
        JSON.stringify((patch as Record<string, unknown>)[key]),
  );

type StructuralState = {
  columnFamilies: ColumnFamily[];
  columns: ColumnInstance[];
  beamFamilies: BeamFamily[];
  beams: BeamRun[];
  beamDataSource: "demo" | "production";
  columnDataSource: "demo" | "production";
  slabFamilies: SlabFamily[];
  slabPlates: SlabPlate[];
  selectedId: string | null;
  selectedIds: string[];
  geometryUndo: Snapshot[];
  geometryRedo: Snapshot[];
  workbookOverrides: Record<string, number>;
  workbookConfirmed: Record<string, boolean>;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  translateSelected: (ids: string[], dx: number, dy: number) => void;
  updateColumn: (id: string, patch: Partial<ColumnInstance>) => void;
  addColumn: (item: ColumnInstance) => void;
  deleteColumn: (id: string) => void;
  replaceColumnData: (families: ColumnFamily[], columns: ColumnInstance[]) => void;
  updateBeam: (id: string, patch: Partial<BeamRun>) => void;
  addBeam: (item: BeamRun) => void;
  deleteBeam: (id: string) => void;
  replaceBeamData: (families: BeamFamily[], beams: BeamRun[]) => void;
  updateSlab: (id: string, patch: Partial<SlabPlate>) => void;
  addSlab: (item: SlabPlate) => void;
  deleteSlab: (id: string) => void;
  updateColumnFamily: (id: string, patch: Partial<ColumnFamily>) => void;
  updateBeamFamily: (id: string, patch: Partial<BeamFamily>) => void;
  updateSlabFamily: (id: string, patch: Partial<SlabFamily>) => void;
  addColumnFamily: (item: ColumnFamily) => void;
  addBeamFamily: (item: BeamFamily) => void;
  addSlabFamily: (item: SlabFamily) => void;
  setWorkbookOverride: (key: string, value: number) => void;
  confirmWorkbook: (key: string, value: boolean) => void;
  captureUndo: () => void;
  undo: () => void;
  redo: () => void;
  invalidateDerived: () => void;
  reset: () => void;
};
const seed = () => ({
  columnFamilies: clone(COLUMN_FAMILIES),
  columns: clone(COLUMNS),
  beamFamilies: clone(BEAM_FAMILIES),
  beams: clone(BEAMS),
  slabFamilies: clone(SLAB_FAMILIES),
  slabPlates: clone(SLAB_PLATES),
});

const mergeDetectedSectionSlabs = (plates: SlabPlate[] = []) => [
  ...plates,
  ...SLAB_PLATES.filter(
    (seedPlate) =>
      seedPlate.sectionProfile &&
      !plates.some((plate) => plate.id === seedPlate.id),
  ).map((plate) => clone(plate)),
];
const legacySlabIds = new Set([
  "SLP-G01",
  "SLP-F01",
  "SLP-T01",
  "SLP-R01",
  "SLP-SEC-AA-01",
  "SLP-SEC-BB-01",
  "SLP-FF-TRANSFER",
  "SLP-TYP-STRUCT",
  "SLP-ROOF-TERRACE",
  "SLP-SEC-BB-FF",
  "SLP-SEC-BB-TYP",
  "SLP-SEC-BB-RF",
  "SLP-SEC-AA-FF",
  "SLP-SEC-AA-TYP",
  "SLP-SEC-AA-RF",
]);
const legacyColumnIds = new Set([
  "COL-G01","COL-G02","COL-G03","COL-G04","COL-G05","COL-G06",
  "COL-F01","COL-F02","COL-F03","COL-F04","COL-F05","COL-F06",
  "COL-T01","COL-T02","COL-T03","COL-T04","COL-T05","COL-T06",
  "COL-R01","COL-R02",
]);
const legacyBeamIds = new Set([
  "BM-G01","BM-G02","BM-G03","BM-F01","BM-F02","BM-F03",
  "BM-T01","BM-T02","BM-T03","BM-R01",
]);

export const useStructuralStore = create<StructuralState>()(
  persist(
    (set, get) => ({
      ...seed(),
      selectedId: null,
      selectedIds: [],
      beamDataSource: "demo",
      columnDataSource: "demo",
      workbookOverrides: {},
      workbookConfirmed: {},
      geometryUndo: [],
      geometryRedo: [],
      select: (selectedId) => {
        if (selectedId === get().selectedId && get().selectedIds.length <= 1) return;
        requestGuardedAction(() => set({ selectedId, selectedIds: selectedId ? [selectedId] : [] }), "select another item");
      },
      selectMany: (ids) => {
        const selectedIds = [...new Set(ids)];
        requestGuardedAction(() => set({ selectedIds, selectedId: selectedIds.at(-1) || null }), "change selection");
      },
      toggleSelect: (id) => {
        const current = get().selectedIds;
        const selectedIds = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
        requestGuardedAction(() => set({ selectedIds, selectedId: selectedIds.at(-1) || null }), "change selection");
      },
      translateSelected: (ids, dx, dy) =>
        set((s) => {
          const selected = new Set(ids);
          const movePoint = (point: { x: number; y: number }) => ({
            x: point.x + dx,
            y: point.y + dy,
          });
          return {
            columns: s.columns.map((item) =>
              selected.has(item.id)
                ? {
                    ...item,
                    bbox: { ...item.bbox, x: item.bbox.x + dx, y: item.bbox.y + dy },
                    status: item.status === "confirmed" ? "ready" : item.status,
                  }
                : item,
            ),
            beams: s.beams.map((item) =>
              selected.has(item.id)
                ? {
                    ...item,
                    start: movePoint(item.start),
                    end: movePoint(item.end),
                    status: item.status === "confirmed" ? "ready" : item.status,
                  }
                : item,
            ),
            slabPlates: s.slabPlates.map((item) =>
              selected.has(item.id)
                ? {
                    ...item,
                    points: item.points.map(movePoint),
                    voids: item.voids.map((points) => points.map(movePoint)),
                    status: item.status === "confirmed" ? "ready" : item.status,
                  }
                : item,
            ),
            workbookConfirmed: {},
          };
        }),
      updateColumn: (id, patch) => {
        const original = get().columns.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(`structural:column:${id}`, `column ${id}`, original, (value) =>
            set((s) => ({
              columns: s.columns.map((x) => (x.id === id ? value : x)),
            })),
          )
        )
          return;
        set((s) => ({
          columns: s.columns.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...patch,
                  status:
                    patch.status ??
                    (x.status === "confirmed" ? "ready" : x.status),
                }
              : x,
          ),
        }));
      },
      addColumn: (item) => {
        const previous = get().selectedId;
        if (
          !stage(
            `structural:create:column:${item.id}`,
            `new column ${item.id}`,
            previous,
            (value) =>
              set((s) => ({
                columns: s.columns.filter((x) => x.id !== item.id),
                selectedId: value,
              })),
          )
        )
          return;
        set((s) => ({ columns: [...s.columns, item], selectedId: item.id, selectedIds: [item.id] }));
      },
      deleteColumn: (id) => {
        const original = get().columns.find((x) => x.id === id),
          previous = get().selectedId;
        if (
          !original ||
          !stage(
            `structural:delete:column:${id}`,
            `delete column ${id}`,
            { original, previous },
            (value) =>
              set((s) => ({
                columns: [...s.columns, value.original],
                selectedId: value.previous,
              })),
          )
        )
          return;
        set((s) => ({
          columns: s.columns.filter((x) => x.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedIds: s.selectedIds.filter((value) => value !== id),
        }));
      },
      replaceColumnData: (families, columns) =>
        set((s) => ({
          columnFamilies: clone(families),
          columns: clone(columns),
          columnDataSource: "production",
          selectedId: columns.some((column) => column.id === s.selectedId) ? s.selectedId : null,
          selectedIds: s.selectedIds.filter((id) => columns.some((column) => column.id === id)),
          workbookOverrides: Object.fromEntries(
            Object.entries(s.workbookOverrides).filter(([key]) => !key.startsWith("columns:")),
          ),
          workbookConfirmed: Object.fromEntries(
            Object.entries(s.workbookConfirmed).filter(([key]) => !key.startsWith("columns:")),
          ),
        })),
      updateBeam: (id, patch) => {
        const original = get().beams.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(`structural:beam:${id}`, `beam ${id}`, original, (value) =>
            set((s) => ({
              beams: s.beams.map((x) => (x.id === id ? value : x)),
            })),
          )
        )
          return;
        set((s) => ({
          beams: s.beams.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...patch,
                  status:
                    patch.status ??
                    (x.status === "confirmed" ? "ready" : x.status),
                }
              : x,
          ),
        }));
      },
      addBeam: (item) => {
        const previous = get().selectedId;
        if (
          !stage(
            `structural:create:beam:${item.id}`,
            `new beam ${item.id}`,
            previous,
            (value) =>
              set((s) => ({
                beams: s.beams.filter((x) => x.id !== item.id),
                selectedId: value,
              })),
          )
        )
          return;
        set((s) => ({ beams: [...s.beams, item], selectedId: item.id, selectedIds: [item.id] }));
      },
      deleteBeam: (id) => {
        const original = get().beams.find((x) => x.id === id),
          previous = get().selectedId;
        if (
          !original ||
          !stage(
            `structural:delete:beam:${id}`,
            `delete beam ${id}`,
            { original, previous },
            (value) =>
              set((s) => ({
                beams: [...s.beams, value.original],
                selectedId: value.previous,
              })),
          )
        )
          return;
        set((s) => ({
          beams: s.beams.filter((x) => x.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedIds: s.selectedIds.filter((value) => value !== id),
        }));
      },
      replaceBeamData: (families, beams) =>
        set((s) => ({
          beamFamilies: clone(families),
          beams: clone(beams),
          beamDataSource: "production",
          selectedId: beams.some((beam) => beam.id === s.selectedId) ? s.selectedId : null,
          selectedIds: s.selectedIds.filter((id) => beams.some((beam) => beam.id === id)),
          workbookOverrides: Object.fromEntries(
            Object.entries(s.workbookOverrides).filter(([key]) => !key.startsWith("beams:")),
          ),
          workbookConfirmed: Object.fromEntries(
            Object.entries(s.workbookConfirmed).filter(([key]) => !key.startsWith("beams:")),
          ),
        })),
      updateSlab: (id, patch) => {
        const original = get().slabPlates.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(`structural:slab:${id}`, `slab ${id}`, original, (value) =>
            set((s) => ({
              slabPlates: s.slabPlates.map((x) => (x.id === id ? value : x)),
            })),
          )
        )
          return;
        set((s) => ({
          slabPlates: s.slabPlates.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...patch,
                  status:
                    patch.status ??
                    (x.status === "confirmed" ? "ready" : x.status),
                }
              : x,
          ),
        }));
      },
      addSlab: (item) => {
        const previous = get().selectedId;
        if (
          !stage(
            `structural:create:slab:${item.id}`,
            `new slab ${item.id}`,
            previous,
            (value) =>
              set((s) => ({
                slabPlates: s.slabPlates.filter((x) => x.id !== item.id),
                selectedId: value,
              })),
          )
        )
          return;
        set((s) => ({
          slabPlates: [...s.slabPlates, item],
          selectedId: item.id,
          selectedIds: [item.id],
        }));
      },
      deleteSlab: (id) => {
        const original = get().slabPlates.find((x) => x.id === id),
          previous = get().selectedId;
        if (
          !original ||
          !stage(
            `structural:delete:slab:${id}`,
            `delete slab ${id}`,
            { original, previous },
            (value) =>
              set((s) => ({
                slabPlates: [...s.slabPlates, value.original],
                selectedId: value.previous,
              })),
          )
        )
          return;
        set((s) => ({
          slabPlates: s.slabPlates.filter((x) => x.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedIds: s.selectedIds.filter((value) => value !== id),
        }));
      },
      updateColumnFamily: (id, patch) => {
        const original = get().columnFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `structural:family:column:${id}`,
            `column family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                columnFamilies: s.columnFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          columnFamilies: s.columnFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      updateBeamFamily: (id, patch) => {
        const original = get().beamFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `structural:family:beam:${id}`,
            `beam family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                beamFamilies: s.beamFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          beamFamilies: s.beamFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      updateSlabFamily: (id, patch) => {
        const original = get().slabFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `structural:family:slab:${id}`,
            `slab family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                slabFamilies: s.slabFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          slabFamilies: s.slabFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      addColumnFamily: (item) =>
        set((s) => ({ columnFamilies: [...s.columnFamilies, item] })),
      addBeamFamily: (item) =>
        set((s) => ({ beamFamilies: [...s.beamFamilies, item] })),
      addSlabFamily: (item) =>
        set((s) => ({ slabFamilies: [...s.slabFamilies, item] })),
      setWorkbookOverride: (key, value) => {
        const previous = get().workbookOverrides[key],
          had = Object.prototype.hasOwnProperty.call(
            get().workbookOverrides,
            key,
          ),
          wasConfirmed = get().workbookConfirmed[key];
        if (
          !stage(
            `structural:workbook:${key}`,
            `quantity ${key}`,
            { previous, had, wasConfirmed },
            (original) =>
              set((s) => {
                const overrides = { ...s.workbookOverrides },
                  confirmed = { ...s.workbookConfirmed };
                original.had
                  ? (overrides[key] = original.previous)
                  : delete overrides[key];
                original.wasConfirmed
                  ? (confirmed[key] = true)
                  : delete confirmed[key];
                return {
                  workbookOverrides: overrides,
                  workbookConfirmed: confirmed,
                };
              }),
          )
        )
          return;
        set((s) => ({
          workbookOverrides: { ...s.workbookOverrides, [key]: value },
          workbookConfirmed: { ...s.workbookConfirmed, [key]: false },
        }));
      },
      confirmWorkbook: (key, value) =>
        set((s) => ({
          workbookConfirmed: { ...s.workbookConfirmed, [key]: value },
        })),
      captureUndo: () =>
        set((s) => ({
          geometryUndo: [
            ...s.geometryUndo.slice(-19),
            {
              columns: clone(s.columns),
              beams: clone(s.beams),
              slabPlates: clone(s.slabPlates),
            },
          ],
          geometryRedo: [],
        })),
      undo: () =>
        set((s) => {
          const previous = s.geometryUndo.at(-1);
          return previous
            ? {
                columns: clone(previous.columns),
                beams: clone(previous.beams),
                slabPlates: clone(previous.slabPlates),
                geometryUndo: s.geometryUndo.slice(0, -1),
                geometryRedo: [...(s.geometryRedo || []).slice(-19), { columns: clone(s.columns), beams: clone(s.beams), slabPlates: clone(s.slabPlates) }],
                selectedId: null,
                selectedIds: [],
              }
            : {};
        }),
      redo: () =>
        set((s) => {
          const next = (s.geometryRedo || []).at(-1);
          return next ? {
            columns: clone(next.columns), beams: clone(next.beams), slabPlates: clone(next.slabPlates),
            geometryUndo: [...s.geometryUndo.slice(-19), { columns: clone(s.columns), beams: clone(s.beams), slabPlates: clone(s.slabPlates) }],
            geometryRedo: s.geometryRedo.slice(0, -1), selectedId: null, selectedIds: [],
          } : {};
        }),
      invalidateDerived: () => set({ workbookConfirmed: {} }),
      reset: () =>
        set({
          ...seed(),
          selectedId: null,
          selectedIds: [],
          beamDataSource: "demo",
          columnDataSource: "demo",
          workbookOverrides: {},
          workbookConfirmed: {},
          geometryUndo: [],
          geometryRedo: [],
        }),
    }),
    {
      name: "quanto-structural-demo-v1",
      version: 13,
      partialize: (state) => {
        const { geometryUndo: _geometryUndo, geometryRedo: _geometryRedo, ...persisted } = state;
        return persisted;
      },
      migrate: (persisted) => {
        const state = persisted as Partial<StructuralState>;
        return {
          ...state,
          geometryUndo: [],
          geometryRedo: [],
          beamDataSource: state.beamDataSource || "demo",
          columnDataSource: state.columnDataSource || "demo",
          columns: (state.columns || []).filter((column) => !legacyColumnIds.has(column.id)),
          beams: (state.beams || []).filter((beam) => !legacyBeamIds.has(beam.id)),
          slabPlates: mergeDetectedSectionSlabs(
            (state.slabPlates || []).filter((plate) => !legacySlabIds.has(plate.id)),
          ),
        } as StructuralState;
      },
      merge: (persisted, current) => {
        const state = persisted as Partial<StructuralState>;
        const mergeSeeded = <T extends { id: string }>(savedItems: T[] | undefined, currentItems: T[], authoritative: Array<keyof T>) => {
          const existing = savedItems || [];
          const byId = new Map(existing.map((item) => [item.id, item]));
          return [
            ...currentItems.map((item) => ({...item,...byId.get(item.id),...Object.fromEntries(authoritative.map((key) => [key,item[key]]))}) as T),
            ...existing.filter((item) => !currentItems.some((builtIn) => builtIn.id === item.id)),
          ];
        };
        const legacyColumnFamilies = new Set(["C1","C2","C3"]);
        const legacyBeamFamilies = new Set(["B1","B2","B3"]);
        const legacySlabFamilies = new Set(["S1","S2","S-TRANSFER-VAR","S-TYPICAL-VAR","S-TERRACE-VAR"]);
        return {
          ...current,
          ...state,
          columnFamilies: state.columnDataSource === "production"
            ? clone(state.columnFamilies || [])
            : [
                ...current.columnFamilies,
                ...(state.columnFamilies || []).filter((item) => !legacyColumnFamilies.has(item.id) && !current.columnFamilies.some((builtIn) => builtIn.id === item.id)),
              ],
          beamFamilies: state.beamDataSource === "production"
            ? clone(state.beamFamilies || [])
            : [
                ...current.beamFamilies,
                ...(state.beamFamilies || []).filter((item) => !legacyBeamFamilies.has(item.id) && !current.beamFamilies.some((builtIn) => builtIn.id === item.id)),
              ],
          slabFamilies: mergeSeeded((state.slabFamilies || []).filter((item) => !legacySlabFamilies.has(item.id)), current.slabFamilies, ["mark","description","thicknessMm","falls","source"]),
          columns: state.columnDataSource === "production"
            ? clone(state.columns || [])
            : mergeSeeded((state.columns || []).filter((column) => !legacyColumnIds.has(column.id)), current.columns, ["familyId","floorId","viewportId","bbox","heightM","status"]),
          beams: state.beamDataSource === "production"
            ? clone(state.beams || [])
            : mergeSeeded((state.beams || []).filter((beam) => !legacyBeamIds.has(beam.id)), current.beams, ["familyId","floorId","viewportId","start","end","kind","dropMm","status"]),
          slabPlates: mergeDetectedSectionSlabs(
            mergeSeeded(
              (state.slabPlates || []).filter((plate) => !legacySlabIds.has(plate.id)),
              current.slabPlates,
              ["familyId","floorId","viewportId","points","voids","sectionProfile","thicknessOverrideMm","thicknessStatus","thicknessRangeMm","linkedPlanSlabId","quantityExcludedReason","status"],
            ),
          ),
          selectedIds: state.selectedIds || (state.selectedId ? [state.selectedId] : []),
          geometryUndo: [],
          geometryRedo: [],
        };
      },
    },
  ),
);
