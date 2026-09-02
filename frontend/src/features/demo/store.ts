"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  CEILING_FAMILIES,
  CEILING_ZONES,
  CHAT_SEED,
  FLOOR_FAMILIES,
  FLOOR_ZONES,
  HEIGHTS,
  OPENINGS,
  OPENING_FAMILIES,
  ROOF_FAMILIES,
  ROOF_ZONES,
  SHEETS,
  SLABS,
  SPECIFICATIONS,
  STOREYS,
  UPSTAND_FAMILIES,
  VIEWPORTS,
  WALL_FAMILIES,
  WALL_FINISH_FAMILIES,
  WALLS,
} from "./data";
import type {
  ChatMessage,
  DemoStatus,
  FinishFamily,
  FloorReviewRegion,
  HeightRecord,
  Opening,
  OpeningFamily,
  RoofFamily,
  RoofZone,
  Sheet,
  SlabRecord,
  SpecificationItem,
  Storey,
  UpstandFamily,
  Viewport,
  Wall,
  WallFamily,
  WallFinishFamily,
  Zone,
} from "./types";
import type { BoqDocumentSetup, BoqExport, BoqRow } from "@/features/boq/types";
import { requestGuardedAction, useEditSessionStore } from "@/features/quanto/editing/editSessionStore";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const quotaSafeBrowserStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try { return window.localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name: string, value: string) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // The persisted takeoff state is only a small UI preference cache. If an
      // older release left one oversized geometry snapshot behind, remove only
      // this store key and retry; production geometry remains on the server.
      try {
        window.localStorage.removeItem(name);
        window.localStorage.setItem(name, value);
      } catch {
        // Storage can be disabled/private. Never crash the workspace for it.
      }
    }
  },
  removeItem: (name: string) => {
    try { window.localStorage.removeItem(name); } catch { /* optional cache */ }
  },
}));
function stageLiveChange<T>(key: string, title: string, original: T, restore: (value: T) => void): boolean {
  const edit = useEditSessionStore.getState();
  if (edit.saving) return false;
  if (edit.key === key) return true;
  if (edit.key?.startsWith("geometry:")) return true;
  if (edit.key) {
    edit.requestAction(() => undefined, `edit ${title}`);
    return false;
  }
  edit.begin({ key, title, original: clone(original), draft: null, commit: () => undefined, discard: () => restore(clone(original)) });
  return true;
}
const hasBoqField = (original: object, patch: object, ignored: string[] = ["status", "color"]) =>
  Object.keys(patch).some((key) => !ignored.includes(key) && JSON.stringify((original as Record<string, unknown>)[key]) !== JSON.stringify((patch as Record<string, unknown>)[key]));
type GeometrySnapshot = {
  openings: Opening[];
  floorZones: Zone[];
  ceilingZones: Zone[];
  walls: Wall[];
  roofZones: RoofZone[];
};

export type DemoState = {
  sheets: Sheet[];
  viewports: Viewport[];
  storeys: Storey[];
  openings: Opening[];
  floorZones: Zone[];
  floorReviewRegions: FloorReviewRegion[];
  ceilingZones: Zone[];
  walls: Wall[];
  roofZones: RoofZone[];
  heights: HeightRecord[];
  slabs: SlabRecord[];
  specifications: SpecificationItem[];
  openingFamilies: OpeningFamily[];
  floorFamilies: FinishFamily[];
  ceilingFamilies: FinishFamily[];
  wallFamilies: WallFamily[];
  wallFinishFamilies: WallFinishFamily[];
  roofFamilies: RoofFamily[];
  upstandFamilies: UpstandFamily[];
  selectedViewportId: string;
  selectedEntityId: string | null;
  selectedEntityIds: string[];
  leftCollapsed: boolean;
  rightTab: "takeoff" | "item";
  chat: Record<string, ChatMessage[]>;
  workbookOverrides: Record<string, number>;
  workbookConfirmed: Record<string, boolean>;
  boqOverrides: Record<string, Partial<BoqRow>>;
  manualRows: BoqRow[];
  exports: BoqExport[];
  boqSetup: BoqDocumentSetup;
  geometryUndo: GeometrySnapshot[];
  geometryRedo: GeometrySnapshot[];
  setSelectedViewport: (id: string) => void;
  setSelectedEntity: (id: string | null) => void;
  setSelectedEntities: (ids: string[]) => void;
  toggleSelectedEntity: (id: string) => void;
  translateEntities: (ids: string[], dx: number, dy: number) => void;
  setLeftCollapsed: (value: boolean) => void;
  setRightTab: (tab: "takeoff" | "item") => void;
  toggleSheet: (id: string) => void;
  updateStorey: (id: string, patch: Partial<Storey>) => void;
  updateViewport: (id: string, patch: Partial<Viewport>) => void;
  addViewport: (viewport: Viewport) => void;
  deleteViewport: (id: string) => void;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  addOpening: (opening: Opening) => void;
  deleteOpening: (id: string) => void;
  updateOpeningFamily: (id: string, patch: Partial<OpeningFamily>) => void;
  addOpeningFamily: (family: OpeningFamily) => void;
  updateZone: (
    kind: "floor" | "ceiling",
    id: string,
    patch: Partial<Zone>,
  ) => void;
  addZone: (kind: "floor" | "ceiling", zone: Zone) => void;
  deleteZone: (kind: "floor" | "ceiling", id: string) => void;
  updateFinishFamily: (
    kind: "floor" | "ceiling",
    id: string,
    patch: Partial<FinishFamily>,
  ) => void;
  addFinishFamily: (kind: "floor" | "ceiling", family: FinishFamily) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  addWall: (wall: Wall) => void;
  deleteWall: (id: string) => void;
  updateWallFamily: (id: string, patch: Partial<WallFamily>) => void;
  addWallFamily: (family: WallFamily) => void;
  updateWallFinishFamily: (
    id: string,
    patch: Partial<WallFinishFamily>,
  ) => void;
  addWallFinishFamily: (family: WallFinishFamily) => void;
  updateRoofZone: (id: string, patch: Partial<RoofZone>) => void;
  addRoofZone: (zone: RoofZone) => void;
  deleteRoofZone: (id: string) => void;
  updateRoofFamily: (id: string, patch: Partial<RoofFamily>) => void;
  addRoofFamily: (family: RoofFamily) => void;
  updateUpstandFamily: (id: string, patch: Partial<UpstandFamily>) => void;
  addUpstandFamily: (family: UpstandFamily) => void;
  updateHeight: (id: string, patch: Partial<HeightRecord>) => void;
  updateSlab: (id: string, patch: Partial<SlabRecord>) => void;
  updateSpecification: (id: string, patch: Partial<SpecificationItem>) => void;
  addSpecification: (item: SpecificationItem) => void;
  setEntityStatus: (entityType: string, id: string, status: DemoStatus) => void;
  addChatMessage: (key: string, message: ChatMessage) => void;
  setWorkbookOverride: (key: string, value: number) => void;
  setWorkbookConfirmed: (key: string, value: boolean) => void;
  updateBoqOverride: (id: string, patch: Partial<BoqRow>) => void;
  addManualRow: (row: BoqRow) => void;
  setExports: (items: BoqExport[]) => void;
  updateBoqSetup: (setup: BoqDocumentSetup) => void;
  captureGeometryUndo: () => void;
  undoGeometry: () => void;
  redoGeometry: () => void;
  invalidateDerived: () => void;
  reset: () => void;
};

const initialSetup: BoqDocumentSetup = {
  id: "SETUP-DEMO",
  project_id: "demo",
  project_name: "Quanto",
  client_name: "Demo Client",
  consultant_name: "Quantity Surveyor",
  location: "Project location",
  boq_title: "Bill of Quantities",
  currency: "Rs",
  rate_mode: "default",
  vat_percentage: 0,
  include_rates: true,
  include_amounts: true,
  include_preliminaries: false,
  include_provisional_sums: false,
  include_signature_section: true,
  format_style: "quantity_takeoff",
  item_numbering_format: "section_sequence",
  measurement_unit_style: "metric",
  description_style: "standard",
  section_order: [
    "Doors",
    "Windows",
    "Walls",
    "Wall finishes",
    "Floor finishes",
    "Ceilings",
    "Roof",
  ],
  setup_version: 1,
};
function seed() {
  return {
    sheets: clone(SHEETS),
    viewports: clone(VIEWPORTS),
    storeys: clone(STOREYS),
    openings: clone(OPENINGS),
    floorZones: clone(FLOOR_ZONES),
    floorReviewRegions: [],
    ceilingZones: clone(CEILING_ZONES),
    walls: clone(WALLS),
    roofZones: clone(ROOF_ZONES),
    heights: clone(HEIGHTS),
    slabs: clone(SLABS),
    specifications: clone(SPECIFICATIONS),
    openingFamilies: clone(OPENING_FAMILIES),
    floorFamilies: clone(FLOOR_FAMILIES),
    ceilingFamilies: clone(CEILING_FAMILIES),
    wallFamilies: clone(WALL_FAMILIES),
    wallFinishFamilies: clone(WALL_FINISH_FAMILIES),
    roofFamilies: clone(ROOF_FAMILIES),
    upstandFamilies: clone(UPSTAND_FAMILIES),
    chat: clone(CHAT_SEED),
  };
}
const s = seed();
export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      ...s,
      selectedViewportId: "VP-GROUND",
      selectedEntityId: null,
      selectedEntityIds: [],
      leftCollapsed: false,
      rightTab: "takeoff",
      workbookOverrides: {},
      workbookConfirmed: {},
      boqOverrides: {},
      manualRows: [],
      exports: [],
      boqSetup: clone(initialSetup),
      geometryUndo: [],
      geometryRedo: [],
      setSelectedViewport: (id) => { if (id === get().selectedViewportId) return; requestGuardedAction(() => set({ selectedViewportId: id, selectedEntityId: null, selectedEntityIds: [] }), "change viewport"); },
      setSelectedEntity: (id) => { if (id === get().selectedEntityId && get().selectedEntityIds.length <= 1) return; requestGuardedAction(() => set({ selectedEntityId: id, selectedEntityIds: id ? [id] : [], rightTab: id ? "item" : get().rightTab }), "select another item"); },
      setSelectedEntities: (ids) => { const unique=[...new Set(ids)]; requestGuardedAction(() => set({ selectedEntityIds: unique, selectedEntityId: unique.at(-1)||null, rightTab: unique.length ? "item" : get().rightTab }), "change selection"); },
      toggleSelectedEntity: (id) => { const current=get().selectedEntityIds; const next=current.includes(id)?current.filter((value)=>value!==id):[...current,id]; requestGuardedAction(() => set({ selectedEntityIds:next,selectedEntityId:next.at(-1)||null,rightTab:next.length?"item":get().rightTab }), "change selection"); },
      translateEntities: (ids, dx, dy) => set((st) => {
        const selected=new Set(ids),movePoint=(point:{x:number;y:number})=>({x:point.x+dx,y:point.y+dy}),moveRings=(rings:{x:number;y:number}[][])=>rings.map((ring)=>ring.map(movePoint));
        return {
          openings:st.openings.map((item)=>selected.has(item.id)&&!item.locked?{...item,bbox:{...item.bbox,x:item.bbox.x+dx,y:item.bbox.y+dy}}:item),
          floorZones:st.floorZones.map((item)=>selected.has(item.id)&&!item.locked?{...item,points:item.points.map(movePoint),deducts:moveRings(item.deducts)}:item),
          ceilingZones:st.ceilingZones.map((item)=>selected.has(item.id)&&!item.locked?{...item,points:item.points.map(movePoint),deducts:moveRings(item.deducts)}:item),
          walls:st.walls.map((item)=>selected.has(item.id)&&!item.locked?{...item,start:movePoint(item.start),end:movePoint(item.end)}:item),
          roofZones:st.roofZones.map((item)=>selected.has(item.id)&&!item.locked?{...item,points:item.points.map(movePoint),deducts:moveRings(item.deducts)}:item),
          workbookConfirmed:{},
        };
      }),
      setLeftCollapsed: (value) => set({ leftCollapsed: value }),
      setRightTab: (tab) => set({ rightTab: tab }),
      toggleSheet: (id) =>
        set((st) => ({
          sheets: st.sheets.map((x) =>
            x.id === id ? { ...x, included: !x.included } : x,
          ),
        })),
      updateStorey: (id, patch) => {
        const original = get().storeys.find((x) => x.id === id);
        if (original && hasBoqField(original, patch, ["status", "name"]) && !stageLiveChange(`pre:storey:${id}`, `storey ${original.name}`, original, (value) => set((st) => ({ storeys: st.storeys.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          storeys: st.storeys.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      updateViewport: (id, patch) => {
        const original = get().viewports.find((x) => x.id === id);
        if (original && patch.scaleMPerPx !== undefined && patch.scaleMPerPx !== original.scaleMPerPx && !stageLiveChange(`pre:scale:${id}`, `scale for ${original.name}`, original, (value) => set((st) => ({ viewports: st.viewports.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          viewports: st.viewports.map((x) =>
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
      addViewport: (v) => set((st) => ({ viewports: [...st.viewports, v] })),
      deleteViewport: (id) =>
        set((st) => {
          const removed = st.viewports.find((item) => item.id === id);
          const viewports = st.viewports
            .filter((item) => item.id !== id)
            .map((item) =>
              item.parentViewportId === id
                ? { ...item, parentViewportId: removed?.parentViewportId }
                : item,
            );
          return {
            viewports,
            selectedViewportId:
              st.selectedViewportId === id
                ? removed?.parentViewportId || viewports[0]?.id || ""
                : st.selectedViewportId,
          };
        }),
      updateOpening: (id, patch) => {
        const original = get().openings.find((x) => x.id === id);
        if (original && hasBoqField(original, patch) && !stageLiveChange(`demo:opening:${id}`, `opening ${id}`, original, (value) => set((st) => ({ openings: st.openings.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          openings: st.openings.map((x) =>
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
      addOpening: (o) => {
        const selected = get().selectedEntityId;
        if (!stageLiveChange(`demo:create:opening:${o.id}`, `new ${o.kind} ${o.id}`, selected, (value) => set((st) => ({ openings: st.openings.filter((x) => x.id !== o.id), selectedEntityId: value })))) return;
        set((st) => ({ openings: [...st.openings, o], selectedEntityId: o.id, selectedEntityIds:[o.id], rightTab: "item" }));
      },
      deleteOpening: (id) => {
        const original = get().openings.find((x) => x.id === id), selected = get().selectedEntityId;
        if (!original || !stageLiveChange(`demo:delete:opening:${id}`, `delete opening ${id}`, { original, selected }, (value) => set((st) => ({ openings: [...st.openings, value.original], selectedEntityId: value.selected })))) return;
        set((st) => ({
          openings: st.openings.filter((x) => x.id !== id),
          selectedEntityId:
            st.selectedEntityId === id ? null : st.selectedEntityId,
          selectedEntityIds: st.selectedEntityIds.filter((value)=>value!==id),
        }));
      },
      updateOpeningFamily: (id, patch) => {
        const original = get().openingFamilies.find((x) => x.id === id);
        if (original && hasBoqField(original, patch) && !stageLiveChange(`demo:family:opening:${id}`, `opening family ${original.mark}`, original, (value) => set((st) => ({ openingFamilies: st.openingFamilies.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          openingFamilies: st.openingFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      addOpeningFamily: (family) =>
        set((st) => ({ openingFamilies: [...st.openingFamilies, family] })),
      updateZone: (kind, id, patch) => {
        const source = kind === "floor" ? get().floorZones : get().ceilingZones;
        const original = source.find((x) => x.id === id);
        if (original && hasBoqField(original, patch, ["status", "room"]) && !stageLiveChange(`demo:${kind}:${id}`, `${kind} ${id}`, original, (value) => set((st) => kind === "floor" ? { floorZones: st.floorZones.map((x) => x.id === id ? value : x) } : { ceilingZones: st.ceilingZones.map((x) => x.id === id ? value : x) }))) return;
        set((st) =>
          kind === "floor"
            ? {
                floorZones: st.floorZones.map((x) =>
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
              }
            : {
                ceilingZones: st.ceilingZones.map((x) =>
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
              },
        );
      },
      addZone: (kind, zone) => {
        const selected = get().selectedEntityId;
        if (!stageLiveChange(`demo:create:${kind}:${zone.id}`, `new ${kind} ${zone.id}`, selected, (value) => set((st) => kind === "floor" ? { floorZones: st.floorZones.filter((x) => x.id !== zone.id), selectedEntityId: value } : { ceilingZones: st.ceilingZones.filter((x) => x.id !== zone.id), selectedEntityId: value }))) return;
        set((st) =>
          kind === "floor"
            ? { floorZones: [...st.floorZones, zone], selectedEntityId: zone.id, selectedEntityIds:[zone.id], rightTab: "item" }
            : { ceilingZones: [...st.ceilingZones, zone], selectedEntityId: zone.id, selectedEntityIds:[zone.id], rightTab: "item" },
        );
      },
      deleteZone: (kind, id) => {
        const source = kind === "floor" ? get().floorZones : get().ceilingZones, original = source.find((x) => x.id === id);
        if (!original || !stageLiveChange(`demo:delete:${kind}:${id}`, `delete ${kind} ${id}`, original, (value) => set((st) => kind === "floor" ? { floorZones: [...st.floorZones, value] } : { ceilingZones: [...st.ceilingZones, value] }))) return;
        set((st) =>
          kind === "floor"
            ? { floorZones: st.floorZones.filter((x) => x.id !== id), selectedEntityId: st.selectedEntityId === id ? null : st.selectedEntityId, selectedEntityIds:st.selectedEntityIds.filter((value)=>value!==id) }
            : { ceilingZones: st.ceilingZones.filter((x) => x.id !== id), selectedEntityId: st.selectedEntityId === id ? null : st.selectedEntityId, selectedEntityIds:st.selectedEntityIds.filter((value)=>value!==id) },
        );
      },
      updateFinishFamily: (kind, id, patch) => {
        const source = kind === "floor" ? get().floorFamilies : get().ceilingFamilies;
        const original = source.find((x) => x.id === id);
        if (original && hasBoqField(original, patch) && !stageLiveChange(`demo:family:${kind}:${id}`, `${kind} family ${original.mark}`, original, (value) => set((st) => kind === "floor" ? { floorFamilies: st.floorFamilies.map((x) => x.id === id ? value : x) } : { ceilingFamilies: st.ceilingFamilies.map((x) => x.id === id ? value : x) }))) return;
        set((st) =>
          kind === "floor"
            ? {
                floorFamilies: st.floorFamilies.map((x) =>
                  x.id === id ? { ...x, ...patch } : x,
                ),
              }
            : {
                ceilingFamilies: st.ceilingFamilies.map((x) =>
                  x.id === id ? { ...x, ...patch } : x,
                ),
              },
        );
      },
      addFinishFamily: (kind, family) =>
        set((st) =>
          kind === "floor"
            ? { floorFamilies: [...st.floorFamilies, family] }
            : { ceilingFamilies: [...st.ceilingFamilies, family] },
        ),
      updateWall: (id, patch) => {
        const original = get().walls.find((x) => x.id === id);
        if (original && hasBoqField(original, patch) && !stageLiveChange(`demo:wall:${id}`, `wall ${id}`, original, (value) => set((st) => ({ walls: st.walls.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          walls: st.walls.map((x) => {
            if (x.id !== id) return x;
            const geometryChanged = patch.start !== undefined || patch.end !== undefined || patch.viewportId !== undefined;
            const quantityChanged = geometryChanged || patch.heightM !== undefined;
            const finishChanged = patch.side1Finish !== undefined || patch.side2Finish !== undefined;
            return {
              ...x,
              ...patch,
              ...(quantityChanged ? { lengthM: undefined, grossAreaM2: undefined, netAreaM2: undefined } : {}),
              ...(geometryChanged ? { openingDeductionM2: undefined } : {}),
              ...((quantityChanged || finishChanged) ? { side1FinishAreaM2: undefined, side2FinishAreaM2: undefined, finishFaces: undefined } : {}),
              status: patch.status ?? (x.status === "confirmed" ? "ready" : x.status),
            };
          }),
        }));
      },
      addWall: (wall) => { const selected = get().selectedEntityId; if (!stageLiveChange(`demo:create:wall:${wall.id}`, `new wall ${wall.id}`, selected, (value) => set((st) => ({ walls: st.walls.filter((x) => x.id !== wall.id), selectedEntityId: value })))) return; set((st) => ({ walls: [...st.walls, wall], selectedEntityId: wall.id, selectedEntityIds:[wall.id], rightTab: "item" })); },
      deleteWall: (id) => { const original = get().walls.find((x) => x.id === id); if (!original || !stageLiveChange(`demo:delete:wall:${id}`, `delete wall ${id}`, original, (value) => set((st) => ({ walls: [...st.walls, value] })))) return; set((st) => ({ walls: st.walls.filter((x) => x.id !== id), selectedEntityId: st.selectedEntityId === id ? null : st.selectedEntityId, selectedEntityIds:st.selectedEntityIds.filter((value)=>value!==id) })); },
      updateWallFamily: (id, patch) => {
        const original = get().wallFamilies.find((x) => x.id === id);
        if (original && hasBoqField(original, patch) && !stageLiveChange(`demo:family:wall:${id}`, `wall family ${original.mark}`, original, (value) => set((st) => ({ wallFamilies: st.wallFamilies.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          wallFamilies: st.wallFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        }));
      },
      addWallFamily: (family) =>
        set((st) => ({ wallFamilies: [...st.wallFamilies, family] })),
      updateWallFinishFamily: (id, patch) =>
        set((st) => ({
          wallFinishFamilies: st.wallFinishFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        })),
      addWallFinishFamily: (family) =>
        set((st) => ({
          wallFinishFamilies: [...st.wallFinishFamilies, family],
        })),
      updateRoofZone: (id, patch) => {
        const original = get().roofZones.find((x) => x.id === id);
        if (original && hasBoqField(original, patch) && !stageLiveChange(`demo:roof:${id}`, `roof ${id}`, original, (value) => set((st) => ({ roofZones: st.roofZones.map((x) => x.id === id ? value : x) })))) return;
        set((st) => ({
          roofZones: st.roofZones.map((x) =>
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
      addRoofZone: (zone) => { const selected = get().selectedEntityId; if (!stageLiveChange(`demo:create:roof:${zone.id}`, `new roof ${zone.id}`, selected, (value) => set((st) => ({ roofZones: st.roofZones.filter((x) => x.id !== zone.id), selectedEntityId: value })))) return; set((st) => ({ roofZones: [...st.roofZones, zone], selectedEntityId: zone.id, selectedEntityIds:[zone.id], rightTab: "item" })); },
      deleteRoofZone: (id) => { const original = get().roofZones.find((x) => x.id === id); if (!original || !stageLiveChange(`demo:delete:roof:${id}`, `delete roof ${id}`, original, (value) => set((st) => ({ roofZones: [...st.roofZones, value] })))) return; set((st) => ({ roofZones: st.roofZones.filter((x) => x.id !== id), selectedEntityId: st.selectedEntityId === id ? null : st.selectedEntityId, selectedEntityIds:st.selectedEntityIds.filter((value)=>value!==id) })); },
      updateRoofFamily: (id, patch) =>
        set((st) => ({
          roofFamilies: st.roofFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        })),
      addRoofFamily: (family) =>
        set((st) => ({ roofFamilies: [...st.roofFamilies, family] })),
      updateUpstandFamily: (id, patch) =>
        set((st) => ({
          upstandFamilies: st.upstandFamilies.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        })),
      addUpstandFamily: (family) =>
        set((st) => ({ upstandFamilies: [...st.upstandFamilies, family] })),
      updateHeight: (id, patch) => {
        const original = get().heights.find((x) => x.id === id);
        const originalStorey = original ? get().storeys.find((x) => x.id === original.storeyId) : undefined;
        if (original && hasBoqField(original, patch) && !stageLiveChange(`pre:height:${id}`, `height ${original.name}`, { height: original, storey: originalStorey }, (value) => set((st) => ({ heights: st.heights.map((x) => x.id === id ? value.height : x), storeys: value.storey ? st.storeys.map((x) => x.id === value.storey!.id ? value.storey! : x) : st.storeys })))) return;
        set((st) => ({
          heights: st.heights.map((x) =>
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
          storeys: original && (patch.yTop !== undefined || patch.yBottom !== undefined) ? st.storeys.map((storey) => storey.id === original.storeyId ? { ...storey, heightM: Math.abs((patch.yBottom ?? original.yBottom) - (patch.yTop ?? original.yTop)) * (st.viewports.find((viewport) => viewport.id === original.viewportId)?.scaleMPerPx || .021), status: "ready" } : storey) : st.storeys,
        }));
      },
      updateSlab: (id, patch) =>
        set((st) => ({
          slabs: st.slabs.map((x) =>
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
        })),
      updateSpecification: (id, patch) =>
        set((st) => ({
          specifications: st.specifications.map((x) =>
            x.id === id ? { ...x, ...patch } : x,
          ),
        })),
      addSpecification: (item) =>
        set((st) => ({ specifications: [...st.specifications, item] })),
      setEntityStatus: (type, id, status) =>
        set((st) => {
          if (type === "opening")
            return {
              openings: st.openings.map((x) =>
                x.id === id ? { ...x, status } : x,
              ),
            };
          if (type === "wall")
            return {
              walls: st.walls.map((x) => (x.id === id ? { ...x, status } : x)),
            };
          if (type === "floor")
            return {
              floorZones: st.floorZones.map((x) =>
                x.id === id ? { ...x, status } : x,
              ),
            };
          if (type === "ceiling")
            return {
              ceilingZones: st.ceilingZones.map((x) =>
                x.id === id ? { ...x, status } : x,
              ),
            };
          if (type === "roof")
            return {
              roofZones: st.roofZones.map((x) =>
                x.id === id ? { ...x, status } : x,
              ),
            };
          return {};
        }),
      addChatMessage: (key, message) =>
        set((st) => ({
          chat: { ...st.chat, [key]: [...(st.chat[key] || []), message] },
        })),
      setWorkbookOverride: (key, value) => {
        const previous = get().workbookOverrides[key];
        const had = Object.prototype.hasOwnProperty.call(get().workbookOverrides, key);
        const wasConfirmed = get().workbookConfirmed[key];
        if (!stageLiveChange(`demo:workbook:${key}`, `quantity ${key}`, { previous, had, wasConfirmed }, (original) => set((st) => { const overrides = { ...st.workbookOverrides }, confirmed = { ...st.workbookConfirmed }; original.had ? overrides[key] = original.previous : delete overrides[key]; original.wasConfirmed ? confirmed[key] = true : delete confirmed[key]; return { workbookOverrides: overrides, workbookConfirmed: confirmed }; }))) return;
        set((st) => ({
          workbookOverrides: { ...st.workbookOverrides, [key]: value },
          workbookConfirmed: { ...st.workbookConfirmed, [key]: false },
        }));
      },
      setWorkbookConfirmed: (key, value) =>
        set((st) => ({
          workbookConfirmed: { ...st.workbookConfirmed, [key]: value },
        })),
      updateBoqOverride: (id, patch) => {
        const previous = get().boqOverrides[id];
        const had = Object.prototype.hasOwnProperty.call(get().boqOverrides, id);
        if (!stageLiveChange(`boq:item:${id}`, `BOQ item ${id}`, { previous, had }, (original) => set((st) => { const overrides = { ...st.boqOverrides }; original.had ? overrides[id] = original.previous : delete overrides[id]; return { boqOverrides: overrides }; }))) return;
        set((st) => ({
          boqOverrides: {
            ...st.boqOverrides,
            [id]: { ...(st.boqOverrides[id] || {}), ...patch },
          },
        }));
      },
      addManualRow: (row) => {
        if (!stageLiveChange(`boq:manual:${row.id}`, `manual BOQ item ${row.boq_item_number || row.item_code || row.id}`, null, () => set((st) => ({ manualRows: st.manualRows.filter((value) => value.id !== row.id) })))) return;
        set((st) => ({ manualRows: [...st.manualRows, row] }));
      },
      setExports: (items) => set({ exports: items }),
      updateBoqSetup: (setup) => {
        const original = get().boqSetup;
        if (!stageLiveChange("boq:setup", "BOQ setup", original, (value) => set({ boqSetup: value }))) return;
        set({ boqSetup: setup });
      },
      captureGeometryUndo: () =>
        set((st) => ({
          geometryUndo: [
            ...st.geometryUndo.slice(-19),
            {
              openings: clone(st.openings),
              floorZones: clone(st.floorZones),
              ceilingZones: clone(st.ceilingZones),
              walls: clone(st.walls),
              roofZones: clone(st.roofZones),
            },
          ],
          geometryRedo: [],
        })),
      undoGeometry: () =>
        set((st) => {
          const snap = st.geometryUndo.at(-1);
          if (!snap) return {};
          return {
            openings: clone(snap.openings),
            floorZones: clone(snap.floorZones),
            ceilingZones: clone(snap.ceilingZones),
            walls: clone(snap.walls),
            roofZones: clone(snap.roofZones),
            geometryUndo: st.geometryUndo.slice(0, -1),
            geometryRedo: [
              ...(st.geometryRedo || []).slice(-19),
              { openings: clone(st.openings), floorZones: clone(st.floorZones), ceilingZones: clone(st.ceilingZones), walls: clone(st.walls), roofZones: clone(st.roofZones) },
            ],
            selectedEntityId: null,
            selectedEntityIds: [],
          };
        }),
      redoGeometry: () =>
        set((st) => {
          const snap = (st.geometryRedo || []).at(-1);
          if (!snap) return {};
          return {
            openings: clone(snap.openings), floorZones: clone(snap.floorZones), ceilingZones: clone(snap.ceilingZones), walls: clone(snap.walls), roofZones: clone(snap.roofZones),
            geometryUndo: [...st.geometryUndo.slice(-19), { openings: clone(st.openings), floorZones: clone(st.floorZones), ceilingZones: clone(st.ceilingZones), walls: clone(st.walls), roofZones: clone(st.roofZones) }],
            geometryRedo: st.geometryRedo.slice(0, -1), selectedEntityId: null,
            selectedEntityIds: [],
          };
        }),
      invalidateDerived: () => set({ workbookConfirmed: {} }),
      reset: () => {
        const next = seed();
        set({
          ...next,
          selectedViewportId: "VP-GROUND",
          selectedEntityId: null,
          selectedEntityIds: [],
          leftCollapsed: false,
          rightTab: "takeoff",
          workbookOverrides: {},
          workbookConfirmed: {},
          boqOverrides: {},
          manualRows: [],
          exports: [],
          boqSetup: clone(initialSetup),
          geometryUndo: [],
          geometryRedo: [],
        });
      },
    }),
    {
      name: "quanto-demo-state-v4",
      version: 13,
      storage: quotaSafeBrowserStorage,
      // Drawings, vectors, detected zones and undo geometry can be many MB and
      // are server-owned in a real project. Persist only compact user/UI data.
      partialize: (state) => ({
        selectedViewportId: state.selectedViewportId,
        selectedEntityId: state.selectedEntityId,
        selectedEntityIds: state.selectedEntityIds,
        leftCollapsed: state.leftCollapsed,
        rightTab: state.rightTab,
        workbookOverrides: state.workbookOverrides,
        workbookConfirmed: state.workbookConfirmed,
        boqOverrides: state.boqOverrides,
        manualRows: state.manualRows,
        exports: state.exports,
        boqSetup: state.boqSetup,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<DemoState>;
        const obsoleteFloorZones = new Set(["FZ-G01","FZ-G02","FZ-G03","FZ-G04","FZ-01","FZ-02","FZ-03","FZ-04","FZ-11","FZ-12","FZ-13","FZ-14"]);
        const savedFloorZones = (saved.floorZones || []).filter((zone) => !obsoleteFloorZones.has(zone.id));
        const obsoleteCeilingZones = new Set(["CZ-G01","CZ-G02","CZ-G03","CZ-01","CZ-02","CZ-03","CZ-11","CZ-12","CZ-13"]);
        const savedCeilingZones = (saved.ceilingZones || []).filter((zone) => !obsoleteCeilingZones.has(zone.id));
        const obsoleteOpeningIds = new Set(["OP-G01","OP-G02","OP-G03","OP-G04","OP-G05","OP-G06","OP-001","OP-002","OP-003","OP-004","OP-005","OP-006","OP-101","OP-102","OP-103","OP-104","OP-105","OP-106","OP-107","OP-108","OP-109","OP-110"]);
        const savedOpenings = (saved.openings || []).filter((opening) => !obsoleteOpeningIds.has(opening.id) && !opening.id.startsWith("OPEN-"));
        const savedWalls = (saved.walls || []).filter((wall) => !/^W-(?:G\d+|\d+)$/.test(wall.id));
        const savedRoofZones = (saved.roofZones || []).filter((zone) => !zone.id.startsWith("RZ-"));
        const mergeBuiltIns = <T extends { id: string }>(savedItems: T[] | undefined, currentItems: T[]) => {
          const existing = savedItems || [];
          const savedById = new Map(existing.map((item) => [item.id, item]));
          return [
            ...currentItems.map((item) => ({ ...savedById.get(item.id), ...item })),
            ...existing.filter((item) => !currentItems.some((builtIn) => builtIn.id === item.id)),
          ];
        };
        const mergeSeedGeometry = <T extends { id: string }>(savedItems: T[] | undefined, currentItems: T[], authoritative: Array<keyof T>) => {
          const existing = savedItems || [];
          const savedItemsById = new Map(existing.map((item) => [item.id, item]));
          return [
            ...currentItems.map((item) => ({
              ...item,
              ...savedItemsById.get(item.id),
              ...Object.fromEntries(authoritative.map((key) => [key, item[key]])),
            }) as T),
            ...existing.filter((item) => !currentItems.some((builtIn) => builtIn.id === item.id)),
          ];
        };
        const savedViewports = saved.viewports || [];
        const savedById = new Map(
          savedViewports.map((viewport) => [viewport.id, viewport]),
        );
        const builtInViewports = current.viewports.map((viewport) => ({
          ...savedById.get(viewport.id),
          ...viewport,
        }));
        const customViewports = savedViewports.filter(
          (viewport) =>
            !current.viewports.some((builtIn) => builtIn.id === viewport.id),
        );
        return {
          ...current,
          ...saved,
          selectedEntityIds: saved.selectedEntityIds || (saved.selectedEntityId ? [saved.selectedEntityId] : []),
          geometryRedo: saved.geometryRedo || [],
          chat: {},
          viewports: [...builtInViewports, ...customViewports],
          openingFamilies: mergeBuiltIns(saved.openingFamilies, current.openingFamilies),
          openings: mergeSeedGeometry(savedOpenings, current.openings, ["familyId", "kind", "floorId", "viewportId", "bbox", "hostWallId"]),
          floorFamilies: mergeBuiltIns(saved.floorFamilies, current.floorFamilies),
          ceilingFamilies: mergeBuiltIns(saved.ceilingFamilies, current.ceilingFamilies),
          wallFamilies: mergeBuiltIns(saved.wallFamilies, current.wallFamilies),
          wallFinishFamilies: mergeBuiltIns(saved.wallFinishFamilies, current.wallFinishFamilies),
          roofFamilies: mergeBuiltIns(saved.roofFamilies, current.roofFamilies),
          floorZones: mergeSeedGeometry(savedFloorZones, current.floorZones, ["familyId", "room", "viewportId", "floorId", "points", "deducts"]),
          // Classified/excluded floor regions are read-only server evidence. Never
          // revive an obsolete local copy when switching projects or drawings.
          floorReviewRegions: current.floorReviewRegions,
          ceilingZones: mergeSeedGeometry(savedCeilingZones, current.ceilingZones, ["familyId", "room", "viewportId", "floorId", "points", "deducts"]),
          walls: mergeSeedGeometry(savedWalls, current.walls, ["familyId", "floorId", "viewportId", "start", "end", "heightM", "side1Finish", "side2Finish", "status"]),
          roofZones: mergeSeedGeometry(savedRoofZones, current.roofZones, ["familyId", "upstandFamilyId", "scope", "floorId", "viewportId", "points", "deducts", "upstandEdges", "status"]),
          specifications: current.specifications,
          heights: current.heights,
        };
      },
    },
  ),
);
