import type { BBox, DemoStatus, Point } from "@/features/demo/types";

export type StructuralElement = "columns" | "beams" | "slab";
export type BeamKind = "Downstand" | "Through";

export type ColumnFamily = {
  id: string;
  mark: string;
  description: string;
  shape: "Rectangular" | "Circular";
  widthMm: number;
  depthMm: number;
  diameterMm?: number;
  source: string;
  color: string;
};

export type ColumnInstance = {
  id: string;
  familyId: string;
  floorId: string;
  viewportId: string;
  bbox: BBox;
  widthOverrideMm?: number;
  depthOverrideMm?: number;
  diameterOverrideMm?: number;
  heightM: number;
  status: DemoStatus;
};

export type BeamFamily = {
  id: string;
  mark: string;
  description: string;
  widthMm: number;
  depthMm: number;
  source: string;
  color: string;
};

export type BeamRun = {
  id: string;
  familyId: string;
  kind: BeamKind;
  floorId: string;
  viewportId: string;
  start: Point;
  end: Point;
  dropMm: number;
  status: DemoStatus;
};

export type SlabFamily = {
  id: string;
  mark: string;
  description: string;
  thicknessMm: number;
  falls: string;
  source: string;
  color: string;
};

export type SlabPlate = {
  id: string;
  familyId: string;
  floorId: string;
  viewportId: string;
  points: Point[];
  voids: Point[][];
  sectionProfile?: {
    x0: number;
    x1: number;
    stepX: number;
    topY: number;
    bottomY: number;
    stepOffset: number;
  };
  thicknessOverrideMm?: number;
  thicknessStatus?: "confirmed" | "varies" | "needs_review";
  thicknessRangeMm?: [number, number];
  linkedPlanSlabId?: string;
  quantityExcludedReason?: string;
  status: DemoStatus;
};
