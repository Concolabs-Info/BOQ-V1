"use client";

import { useEffect } from "react";
import { useDemoStore } from "@/features/demo/store";
import { requestJson } from "@/shared/services/apiClient";
import { useMeasurementStore } from "../measurements/measurementStore";
import { useSpecialStore } from "../specialStore";
import { useStructuralStore } from "../structuralStore";
import { dispatchTakeoffStatus } from "../takeoffCommands";

type WorkspacePayload = {
  demo?: Record<string, unknown>;
  structural?: Record<string, unknown>;
  special?: Record<string, unknown>;
  measurements?: Record<string, unknown>;
};

function snapshot(): WorkspacePayload {
  const demo = useDemoStore.getState();
  const structural = useStructuralStore.getState();
  const special = useSpecialStore.getState();
  const measurements = useMeasurementStore.getState();
  return {
    demo: {
      sheets: demo.sheets,
      viewports: demo.viewports,
      openingFamilies: demo.openingFamilies,
      openings: demo.openings,
      floorFamilies: demo.floorFamilies,
      floorZones: demo.floorZones,
      ceilingFamilies: demo.ceilingFamilies,
      ceilingZones: demo.ceilingZones,
      wallFamilies: demo.wallFamilies,
      wallFinishFamilies: demo.wallFinishFamilies,
      walls: demo.walls,
      roofFamilies: demo.roofFamilies,
      upstandFamilies: demo.upstandFamilies,
      roofZones: demo.roofZones,
      workbookOverrides: demo.workbookOverrides,
      workbookConfirmed: demo.workbookConfirmed,
    },
    structural: {
      columnFamilies: structural.columnFamilies,
      columns: structural.columns,
      slabFamilies: structural.slabFamilies,
      slabPlates: structural.slabPlates,
      workbookOverrides: structural.workbookOverrides,
      workbookConfirmed: structural.workbookConfirmed,
    },
    special: {
      flightFamilies: special.flightFamilies,
      railFamilies: special.railFamilies,
      flights: special.flights,
      pileFamilies: special.pileFamilies,
      capFamilies: special.capFamilies,
      piles: special.piles,
      caps: special.caps,
      workbookOverrides: special.workbookOverrides,
      workbookConfirmed: special.workbookConfirmed,
    },
    measurements: { measurements: measurements.measurements },
  };
}

function hydrate(payload: WorkspacePayload) {
  if (payload.demo) useDemoStore.setState({ ...payload.demo, selectedEntityId: null, selectedEntityIds: [], geometryUndo: [], geometryRedo: [] } as Partial<ReturnType<typeof useDemoStore.getState>>);
  if (payload.structural) useStructuralStore.setState({ ...payload.structural, selectedId: null, selectedIds: [], geometryUndo: [], geometryRedo: [] } as Partial<ReturnType<typeof useStructuralStore.getState>>);
  if (payload.special) useSpecialStore.setState({ ...payload.special, selectedId: null, selectedIds: [], undoStack: [], redoStack: [] } as Partial<ReturnType<typeof useSpecialStore.getState>>);
  if (payload.measurements) useMeasurementStore.setState({ ...payload.measurements, selectedId: null } as Partial<ReturnType<typeof useMeasurementStore.getState>>);
}

export function useTakeoffWorkspacePersistence(projectId: string) {
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let hydrated = false;
    let changedBeforeHydration = false;
    let timer: number | null = null;
    let saving = false;
    let queued = false;
    const path = `/api/v1/projects/${projectId}/takeoff/workspace-state`;

    const save = async () => {
      if (cancelled) return;
      if (saving) { queued = true; return; }
      saving = true;
      dispatchTakeoffStatus({ saving: "saving" });
      try {
        await requestJson(path, {
          method: "PUT",
          body: JSON.stringify({ state: snapshot() }),
        });
        if (!cancelled) dispatchTakeoffStatus({ saving: "saved" });
      } catch {
        if (!cancelled) dispatchTakeoffStatus({ saving: "editing", message: "Server autosave unavailable · browser copy retained" });
      } finally {
        saving = false;
        if (queued && !cancelled) { queued = false; void save(); }
      }
    };
    const schedule = () => {
      if (!hydrated) { changedBeforeHydration = true; return; }
      if (timer) window.clearTimeout(timer);
      dispatchTakeoffStatus({ saving: "editing" });
      timer = window.setTimeout(() => void save(), 900);
    };
    const unsubscribers = [
      useDemoStore.subscribe(schedule),
      useStructuralStore.subscribe(schedule),
      useSpecialStore.subscribe(schedule),
      useMeasurementStore.subscribe(schedule),
    ];

    void requestJson<{ state: WorkspacePayload | null }>(path, { cache: "no-store" })
      .then((response) => {
        if (cancelled) return;
        if (response.state && !changedBeforeHydration) hydrate(response.state);
        hydrated = true;
        if (!response.state || changedBeforeHydration) schedule();
      })
      .catch(() => {
        hydrated = true;
        dispatchTakeoffStatus({ message: "Using browser-saved takeoff data" });
      });

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [projectId]);
}
