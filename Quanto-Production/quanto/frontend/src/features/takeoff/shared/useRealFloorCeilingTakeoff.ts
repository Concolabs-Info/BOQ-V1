"use client";

import { useEffect, useMemo, useRef } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { FinishFamily, Sheet, Storey, Viewport, Zone } from "@/features/demo/types";
import { apiUrl, requestJson } from "@/shared/services/apiClient";

type ModuleName = "floor" | "ceiling";
type AnalysisState = { status: string; progress: number; message?: string | null; error_message?: string | null };
type TakeoffServerState = {
  sheets: Array<Sheet & { width?: number; height?: number }>;
  viewports: Viewport[];
  storeys: Storey[];
  families: FinishFamily[];
  zones: Zone[];
  uiState?: { workbookOverrides?: Record<string, number>; workbookConfirmed?: Record<string, boolean> };
  analysis?: AnalysisState;
  provider?: string;
};

function serverPath(projectId: string, module: ModuleName) {
  return `/api/v1/projects/${projectId}/takeoff/${module}`;
}

function withAbsoluteImages(items: TakeoffServerState): TakeoffServerState {
  return {
    ...items,
    sheets: items.sheets.map((sheet) => ({ ...sheet, image: apiUrl(sheet.image) })),
  };
}

function hydrate(module: ModuleName, raw: TakeoffServerState) {
  const data = withAbsoluteImages(raw);
  const current = useDemoStore.getState();
  const firstViewport = data.viewports[0]?.id || current.selectedViewportId;
  const selectedStillExists = data.viewports.some((viewport) => viewport.id === current.selectedViewportId);
  useDemoStore.setState({
    sheets: data.sheets,
    viewports: data.viewports,
    storeys: data.storeys,
    selectedViewportId: selectedStillExists ? current.selectedViewportId : firstViewport,
    selectedEntityId: null,
    ...(module === "floor" ? { floorFamilies: data.families, floorZones: data.zones } : { ceilingFamilies: data.families, ceilingZones: data.zones }),
    workbookOverrides: data.uiState?.workbookOverrides || {},
    workbookConfirmed: data.uiState?.workbookConfirmed || {},
  });
}

/**
 * Bridges the unchanged demo-derived Takeoff UI to the production Floor/Ceiling API.
 * Geometry stays in the original source-crop pixel coordinate space; the server is
 * authoritative for scale and official quantities.
 */
export function useRealFloorCeilingTakeoff(projectId: string, element: string) {
  const module: ModuleName | null = element === "floor" ? "floor" : element === "ceiling" ? "ceiling" : null;
  const families = useDemoStore((state) => module === "floor" ? state.floorFamilies : module === "ceiling" ? state.ceilingFamilies : []);
  const zones = useDemoStore((state) => module === "floor" ? state.floorZones : module === "ceiling" ? state.ceilingZones : []);
  const workbookOverrides = useDemoStore((state) => state.workbookOverrides);
  const workbookConfirmed = useDemoStore((state) => state.workbookConfirmed);
  const loaded = useRef(false);
  const hydrating = useRef(false);
  const previousDemoContext = useRef<null | {
    sheets: Sheet[]; viewports: Viewport[]; storeys: Storey[];
    floorFamilies: FinishFamily[]; floorZones: Zone[]; ceilingFamilies: FinishFamily[]; ceilingZones: Zone[];
    selectedViewportId: string; selectedEntityId: string | null;
    workbookOverrides: Record<string, number>; workbookConfirmed: Record<string, boolean>;
  }>(null);
  const lastSaved = useRef("");
  const analysisTriggered = useRef(false);

  useEffect(() => {
    if (!module || !projectId) return;
    let cancelled = false;
    loaded.current = false;
    analysisTriggered.current = false;
    const before = useDemoStore.getState();
    previousDemoContext.current = {
      sheets: before.sheets, viewports: before.viewports, storeys: before.storeys,
      floorFamilies: before.floorFamilies, floorZones: before.floorZones,
      ceilingFamilies: before.ceilingFamilies, ceilingZones: before.ceilingZones,
      selectedViewportId: before.selectedViewportId, selectedEntityId: before.selectedEntityId,
      workbookOverrides: before.workbookOverrides, workbookConfirmed: before.workbookConfirmed,
    };

    async function load() {
      try {
        const state = await requestJson<TakeoffServerState>(`${serverPath(projectId, module!)}/demo-state?fresh=${Date.now()}`);
        if (cancelled) return;
        hydrating.current = true;
        hydrate(module!, state);
        lastSaved.current = JSON.stringify({
          families: state.families,
          zones: state.zones,
          workbookOverrides: state.uiState?.workbookOverrides || {},
          workbookConfirmed: state.uiState?.workbookConfirmed || {},
        });
        queueMicrotask(() => { hydrating.current = false; loaded.current = true; });

        // The production UI keeps the demo interaction exactly as supplied. Analysis
        // starts automatically on first entry only when a model provider is configured.
        if (!state.zones.length && state.provider === "openai" && state.analysis?.status !== "running" && !analysisTriggered.current) {
          analysisTriggered.current = true;
          try {
            await requestJson(`${serverPath(projectId, module!)}/analyze?quality=medium`, { method: "POST" });
            if (cancelled) return;
            const refreshed = await requestJson<TakeoffServerState>(`${serverPath(projectId, module!)}/demo-state?fresh=${Date.now()}`);
            if (cancelled) return;
            hydrating.current = true;
            hydrate(module!, refreshed);
            lastSaved.current = JSON.stringify({
              families: refreshed.families,
              zones: refreshed.zones,
              workbookOverrides: refreshed.uiState?.workbookOverrides || {},
              workbookConfirmed: refreshed.uiState?.workbookConfirmed || {},
            });
            queueMicrotask(() => { hydrating.current = false; loaded.current = true; });
          } catch (error) {
            // Keep manual drawing/editing usable if prerequisites or AI credentials are missing.
            console.warn(`Quanto ${module} analysis could not start`, error);
          }
        }
      } catch (error) {
        console.warn(`Quanto ${module} state could not be loaded`, error);
      }
    }
    void load();
    return () => {
      cancelled = true;
      // Do not lose a last edit when the user switches from Floor to Ceiling
      // before the normal debounce completes. Persist the production state once
      // before restoring the original demo context for the other modules.
      if (loaded.current && !hydrating.current) {
        const state = useDemoStore.getState();
        const pendingPayload = {
          families: module === "floor" ? state.floorFamilies : state.ceilingFamilies,
          zones: module === "floor" ? state.floorZones : state.ceilingZones,
          uiState: { workbookOverrides: state.workbookOverrides, workbookConfirmed: state.workbookConfirmed },
        };
        const signature = JSON.stringify({
          families: pendingPayload.families,
          zones: pendingPayload.zones,
          workbookOverrides: pendingPayload.uiState.workbookOverrides,
          workbookConfirmed: pendingPayload.uiState.workbookConfirmed,
        });
        if (signature !== lastSaved.current) {
          void requestJson(`${serverPath(projectId, module)}/demo-state`, {
            method: "PUT",
            body: JSON.stringify(pendingPayload),
            keepalive: true,
          }).catch((error) => console.warn(`Quanto ${module} final edit could not be saved`, error));
        }
      }
      const snapshot = previousDemoContext.current;
      if (snapshot) useDemoStore.setState(snapshot);
      previousDemoContext.current = null;
      loaded.current = false;
    };
  }, [projectId, module]);

  const payloadSignature = useMemo(() => JSON.stringify({ families, zones, workbookOverrides, workbookConfirmed }), [families, zones, workbookOverrides, workbookConfirmed]);

  useEffect(() => {
    if (!module || !loaded.current || hydrating.current) return;
    if (payloadSignature === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      const state = useDemoStore.getState();
      const payload = {
        families: module === "floor" ? state.floorFamilies : state.ceilingFamilies,
        zones: module === "floor" ? state.floorZones : state.ceilingZones,
        uiState: { workbookOverrides: state.workbookOverrides, workbookConfirmed: state.workbookConfirmed },
      };
      try {
        const saved = await requestJson<TakeoffServerState>(`${serverPath(projectId, module)}/demo-state`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        lastSaved.current = JSON.stringify({
          families: payload.families,
          zones: payload.zones,
          workbookOverrides: payload.uiState.workbookOverrides,
          workbookConfirmed: payload.uiState.workbookConfirmed,
        });
        hydrating.current = true;
        hydrate(module, saved);
        queueMicrotask(() => { hydrating.current = false; });
      } catch (error) {
        console.warn(`Quanto ${module} edit could not be saved`, error);
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [projectId, module, payloadSignature]);
}
