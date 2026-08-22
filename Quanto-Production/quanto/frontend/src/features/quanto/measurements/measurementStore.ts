"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Point } from "@/features/demo/types";

export type DrawingMeasurement = { id: string; viewportId: string; start: Point; end: Point };
type MeasurementState = {
  measurements: DrawingMeasurement[]; selectedId: string | null;
  select: (id: string | null) => void; add: (measurement: DrawingMeasurement) => void;
  update: (id: string, patch: Partial<Pick<DrawingMeasurement, "start" | "end">>) => void; remove: (id: string) => void;
};
export const useMeasurementStore = create<MeasurementState>()(persist((set, get) => ({
  measurements: [], selectedId: null,
  select: (id) => { if (id !== get().selectedId) set({ selectedId: id }); },
  add: (measurement) => set((state) => ({ measurements: [...state.measurements, measurement], selectedId: measurement.id })),
  update: (id, patch) => { if (!get().measurements.some((value) => value.id === id)) return; set((state) => ({ measurements: state.measurements.map((value) => value.id === id ? { ...value, ...patch } : value), selectedId: id })); },
  remove: (id) => set((state) => ({ measurements: state.measurements.filter((value) => value.id !== id), selectedId: state.selectedId === id ? null : state.selectedId })),
}), { name: "quanto-drawing-measurements-v1", version: 1 }));
