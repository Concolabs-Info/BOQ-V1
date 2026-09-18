"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CAP_FAMILIES,
  CAPS,
  FLIGHT_FAMILIES,
  FLIGHTS,
  PILE_FAMILIES,
  PILES,
  RAIL_FAMILIES,
} from "./specialData";
import type {
  CapFamily,
  Flight,
  FlightFamily,
  Pile,
  PileCap,
  PileFamily,
  RailFamily,
} from "./specialTypes";
import {
  requestGuardedAction,
  useEditSessionStore,
} from "./editing/editSessionStore";
import { canMutateTakeoffGeometry } from "./takeoffGeometryAccess";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Snapshot = { flights: Flight[]; piles: Pile[]; caps: PileCap[] };
function stage<T>(
  key: string,
  title: string,
  original: T,
  restore: (value: T) => void,
): boolean {
  if (!canMutateTakeoffGeometry()) return false;
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
type State = {
  flightFamilies: FlightFamily[];
  railFamilies: RailFamily[];
  flights: Flight[];
  pileFamilies: PileFamily[];
  capFamilies: CapFamily[];
  piles: Pile[];
  caps: PileCap[];
  selectedId: string | null;
  selectedIds: string[];
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  workbookOverrides: Record<string, number>;
  workbookConfirmed: Record<string, boolean>;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  translateSelected: (ids: string[], dx: number, dy: number) => void;
  captureUndo: () => void;
  undo: () => void;
  redo: () => void;
  updateFlight: (id: string, patch: Partial<Flight>) => void;
  addFlight: (item: Flight) => void;
  deleteFlight: (id: string) => void;
  updateFlightFamily: (id: string, patch: Partial<FlightFamily>) => void;
  updateRailFamily: (id: string, patch: Partial<RailFamily>) => void;
  updatePile: (id: string, patch: Partial<Pile>) => void;
  addPile: (item: Pile) => void;
  deletePile: (id: string) => void;
  updateCap: (id: string, patch: Partial<PileCap>) => void;
  addCap: (item: PileCap) => void;
  deleteCap: (id: string) => void;
  updatePileFamily: (id: string, patch: Partial<PileFamily>) => void;
  updateCapFamily: (id: string, patch: Partial<CapFamily>) => void;
  setWorkbookOverride: (key: string, value: number) => void;
  confirmWorkbook: (key: string, value: boolean) => void;
  invalidateDerived: () => void;
  reset: () => void;
};
const seed = () => ({
  flightFamilies: clone(FLIGHT_FAMILIES),
  railFamilies: clone(RAIL_FAMILIES),
  flights: clone(FLIGHTS),
  pileFamilies: clone(PILE_FAMILIES),
  capFamilies: clone(CAP_FAMILIES),
  piles: clone(PILES),
  caps: clone(CAPS),
});
export const useSpecialStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),
      selectedId: null,
      selectedIds: [],
      undoStack: [],
      redoStack: [],
      workbookOverrides: {},
      workbookConfirmed: {},
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
      translateSelected: (ids, dx, dy) => {
        if (!canMutateTakeoffGeometry()) return;
        set((s) => {
          const selected = new Set(ids);
          const movePoint = (point: { x: number; y: number }) => ({
            x: point.x + dx,
            y: point.y + dy,
          });
          return {
            flights: s.flights.map((item) =>
              selected.has(item.id)
                ? {
                    ...item,
                    points: item.points.map(movePoint),
                    voids: item.voids.map((ring) => ring.map(movePoint)),
                    railSegments: item.railSegments?.map((segment) => ({ ...segment, line: segment.line.map(movePoint) })),
                    geometryUserModified: true,
                    status: item.status === "confirmed" ? "ready" : item.status,
                  }
                : item,
            ),
            piles: s.piles.map((item) =>
              selected.has(item.id)
                ? {
                    ...item,
                    bbox: { ...item.bbox, x: item.bbox.x + dx, y: item.bbox.y + dy },
                    status: item.status === "confirmed" ? "ready" : item.status,
                  }
                : item,
            ),
            caps: s.caps.map((item) =>
              selected.has(item.id)
                ? {
                    ...item,
                    bbox: { ...item.bbox, x: item.bbox.x + dx, y: item.bbox.y + dy },
                    status: item.status === "confirmed" ? "ready" : item.status,
                  }
                : item,
            ),
            workbookConfirmed: {},
          };
        });
      },
      captureUndo: () => {
        if (!canMutateTakeoffGeometry()) return;
        set((s) => ({
          undoStack: [
            ...s.undoStack.slice(-19),
            {
              flights: clone(s.flights),
              piles: clone(s.piles),
              caps: clone(s.caps),
            },
          ],
          redoStack: [],
        }));
      },
      undo: () =>
        set((s) => {
          if (!canMutateTakeoffGeometry()) return {};
          const p = s.undoStack.at(-1);
          return p
            ? {
                ...clone(p),
                undoStack: s.undoStack.slice(0, -1),
                redoStack: [...(s.redoStack || []).slice(-19), { flights: clone(s.flights), piles: clone(s.piles), caps: clone(s.caps) }],
                selectedId: null,
                selectedIds: [],
              }
            : {};
        }),
      redo: () =>
        set((s) => {
          if (!canMutateTakeoffGeometry()) return {};
          const next=(s.redoStack || []).at(-1);
          return next?{...clone(next),undoStack:[...s.undoStack.slice(-19),{flights:clone(s.flights),piles:clone(s.piles),caps:clone(s.caps)}],redoStack:s.redoStack.slice(0,-1),selectedId:null,selectedIds:[]}:{};
        }),
      updateFlight: (id, patch) => {
        const original = get().flights.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(`special:flight:${id}`, `flight ${id}`, original, (value) =>
            set((s) => ({
              flights: s.flights.map((x) => (x.id === id ? value : x)),
            })),
          )
        )
          return;
        const geometryEdited = Object.prototype.hasOwnProperty.call(patch, "points") || Object.prototype.hasOwnProperty.call(patch, "voids");
        const adjustedBase = Object.prototype.hasOwnProperty.call(patch, "railEdges") && !Object.prototype.hasOwnProperty.call(patch, "railEdgesEdited")
          ? { ...patch, railEdgesEdited: true }
          : patch;
        const adjusted = geometryEdited && !Object.prototype.hasOwnProperty.call(adjustedBase, "geometryUserModified")
          ? { ...adjustedBase, geometryUserModified: true }
          : adjustedBase;
        set((s) => ({
          flights: s.flights.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...adjusted,
                  status:
                    adjusted.status ??
                    (x.status === "confirmed" ? "ready" : x.status),
                }
              : x,
          ),
        }));
      },
      addFlight: (item) => {
        if (
          !stage(
            `special:create:flight:${item.id}`,
            `new flight ${item.id}`,
            null,
            () =>
              set((s) => ({
                flights: s.flights.filter((x) => x.id !== item.id),
                selectedId: null,
              })),
          )
        )
          return;
        set((s) => ({ flights: [...s.flights, item], selectedId: item.id, selectedIds: [item.id] }));
      },
      deleteFlight: (id) => {
        const original = get().flights.find((x) => x.id === id);
        if (
          !original ||
          !stage(
            `special:delete:flight:${id}`,
            `delete flight ${id}`,
            original,
            (value) => set((s) => ({ flights: [...s.flights, value] })),
          )
        )
          return;
        set((s) => ({
          flights: s.flights.filter((x) => x.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedIds: s.selectedIds.filter((value) => value !== id),
        }));
      },
      updateFlightFamily: (id, patch) => {
        const original = get().flightFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `special:family:flight:${id}`,
            `flight family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                flightFamilies: s.flightFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          flightFamilies: s.flightFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      updateRailFamily: (id, patch) => {
        const original = get().railFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `special:family:rail:${id}`,
            `rail family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                railFamilies: s.railFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          railFamilies: s.railFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      updatePile: (id, patch) => {
        const original = get().piles.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(`special:pile:${id}`, `pile ${id}`, original, (value) =>
            set((s) => ({
              piles: s.piles.map((x) => (x.id === id ? value : x)),
            })),
          )
        )
          return;
        set((s) => ({
          piles: s.piles.map((x) =>
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
      addPile: (item) => {
        if (
          !stage(
            `special:create:pile:${item.id}`,
            `new pile ${item.id}`,
            null,
            () =>
              set((s) => ({
                piles: s.piles.filter((x) => x.id !== item.id),
                selectedId: null,
              })),
          )
        )
          return;
        set((s) => ({ piles: [...s.piles, item], selectedId: item.id, selectedIds: [item.id] }));
      },
      deletePile: (id) => {
        const original = get().piles.find((x) => x.id === id);
        if (
          !original ||
          !stage(
            `special:delete:pile:${id}`,
            `delete pile ${id}`,
            original,
            (value) => set((s) => ({ piles: [...s.piles, value] })),
          )
        )
          return;
        set((s) => ({
          piles: s.piles.filter((x) => x.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedIds: s.selectedIds.filter((value) => value !== id),
        }));
      },
      updateCap: (id, patch) => {
        const original = get().caps.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(`special:cap:${id}`, `pile cap ${id}`, original, (value) =>
            set((s) => ({
              caps: s.caps.map((x) => (x.id === id ? value : x)),
            })),
          )
        )
          return;
        set((s) => ({
          caps: s.caps.map((x) =>
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
      addCap: (item) => {
        if (
          !stage(
            `special:create:cap:${item.id}`,
            `new pile cap ${item.id}`,
            null,
            () =>
              set((s) => ({
                caps: s.caps.filter((x) => x.id !== item.id),
                selectedId: null,
              })),
          )
        )
          return;
        set((s) => ({ caps: [...s.caps, item], selectedId: item.id, selectedIds: [item.id] }));
      },
      deleteCap: (id) => {
        const original = get().caps.find((x) => x.id === id);
        if (
          !original ||
          !stage(
            `special:delete:cap:${id}`,
            `delete pile cap ${id}`,
            original,
            (value) => set((s) => ({ caps: [...s.caps, value] })),
          )
        )
          return;
        set((s) => ({
          caps: s.caps.filter((x) => x.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
          selectedIds: s.selectedIds.filter((value) => value !== id),
        }));
      },
      updatePileFamily: (id, patch) => {
        const original = get().pileFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `special:family:pile:${id}`,
            `pile family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                pileFamilies: s.pileFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          pileFamilies: s.pileFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      updateCapFamily: (id, patch) => {
        const original = get().capFamilies.find((x) => x.id === id);
        if (
          original &&
          affectsBoq(original, patch) &&
          !stage(
            `special:family:cap:${id}`,
            `pile cap family ${original.mark}`,
            original,
            (value) =>
              set((s) => ({
                capFamilies: s.capFamilies.map((x) =>
                  x.id === id ? value : x,
                ),
              })),
          )
        )
          return;
        set((s) => ({
          capFamilies: s.capFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      setWorkbookOverride: (key, value) => {
        const previous = get().workbookOverrides[key],
          had = Object.prototype.hasOwnProperty.call(
            get().workbookOverrides,
            key,
          ),
          wasConfirmed = get().workbookConfirmed[key];
        if (
          !stage(
            `special:workbook:${key}`,
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
      invalidateDerived: () => set({ workbookConfirmed: {} }),
      reset: () =>
        set({
          ...seed(),
          selectedId: null,
          selectedIds: [],
          undoStack: [],
          redoStack: [],
          workbookOverrides: {},
          workbookConfirmed: {},
        }),
    }),
    {
      name: "quanto-special-takeoff-v1",
      version: 5,
      migrate: (persisted) => {
        const state = persisted as Partial<State>;
        const legacyFlights = new Set(["FLT-G01", "FLT-F01", "FLT-T01", "STAIR-GF-TO-FF", "STAIR-FF-TO-L02", "STAIR-TYPICAL", "STAIR-ROOF-TERRACE-EVIDENCE"]);
        return {
          ...state,
          flightFamilies: clone(FLIGHT_FAMILIES),
          railFamilies: clone(RAIL_FAMILIES),
          flights: [
            ...clone(FLIGHTS),
            ...(state.flights || []).filter(
              (item) => !legacyFlights.has(item.id) && item.familyId !== "RP-15",
            ),
          ],
          pileFamilies: [],
          capFamilies: [],
          piles: [],
          caps: [],
        } as State;
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<State>),
        flightFamilies: current.flightFamilies,
        railFamilies: current.railFamilies,
        flights: (persisted as Partial<State>).flights || current.flights,
        selectedIds: (persisted as Partial<State>).selectedIds || ((persisted as Partial<State>).selectedId ? [(persisted as Partial<State>).selectedId!] : []),
      }),
    },
  ),
);
