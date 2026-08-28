"use client";

import { useEffect, useMemo, useRef } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { FinishFamily, RoofFamily, RoofZone, Sheet, Storey, UpstandFamily, Viewport, Zone } from "@/features/demo/types";
import { apiUrl, requestJson } from "@/shared/services/apiClient";

type ModuleName = "floor" | "ceiling" | "roof";
type AnalysisState = { status: string; progress: number; message?: string | null; error_message?: string | null };
type TakeoffServerState = {
  sheets: Array<Sheet & { width?: number; height?: number }>;
  viewports: Viewport[];
  storeys: Storey[];
  families: Array<FinishFamily | RoofFamily>;
  upstandFamilies?: UpstandFamily[];
  zones: Array<Zone | RoofZone>;
  uiState?: { workbookOverrides?: Record<string, number>; workbookConfirmed?: Record<string, boolean> };
  analysis?: AnalysisState;
  provider?: string;
};

function serverPath(projectId: string, module: ModuleName) {
  return `/api/v1/projects/${projectId}/takeoff/${module}`;
}

function withAbsoluteImages(items: TakeoffServerState): TakeoffServerState {
  return { ...items, sheets: items.sheets.map((sheet) => ({ ...sheet, image: apiUrl(sheet.image) })) };
}

function hydrate(module: ModuleName, raw: TakeoffServerState) {
  const data = withAbsoluteImages(raw);
  const current = useDemoStore.getState();
  const firstViewport = data.viewports[0]?.id || current.selectedViewportId;
  const selectedStillExists = data.viewports.some((viewport) => viewport.id === current.selectedViewportId);
  const moduleData = module === "floor"
    ? { floorFamilies: data.families as FinishFamily[], floorZones: data.zones as Zone[] }
    : module === "ceiling"
      ? { ceilingFamilies: data.families as FinishFamily[], ceilingZones: data.zones as Zone[] }
      : { roofFamilies: data.families as RoofFamily[], upstandFamilies: data.upstandFamilies || [], roofZones: data.zones as RoofZone[] };
  useDemoStore.setState({
    sheets: data.sheets,
    viewports: data.viewports,
    storeys: data.storeys,
    selectedViewportId: selectedStillExists ? current.selectedViewportId : firstViewport,
    selectedEntityId: null,
    ...moduleData,
    workbookOverrides: data.uiState?.workbookOverrides || {},
    workbookConfirmed: data.uiState?.workbookConfirmed || {},
  });
}

/**
 * Bridges the unchanged demo-derived Takeoff UI to the production Floor/Ceiling/Roof API.
 * Geometry stays in the exact source-crop pixel coordinate space. PostgreSQL + the
 * confirmed Pre scale are authoritative for official quantities.
 */
export function useRealFloorCeilingTakeoff(projectId: string, element: string) {
  const module: ModuleName | null = element === "floor" ? "floor" : element === "ceiling" ? "ceiling" : element === "roof" ? "roof" : null;
  const families = useDemoStore((state) => module === "floor" ? state.floorFamilies : module === "ceiling" ? state.ceilingFamilies : module === "roof" ? state.roofFamilies : []);
  const zones = useDemoStore((state) => module === "floor" ? state.floorZones : module === "ceiling" ? state.ceilingZones : module === "roof" ? state.roofZones : []);
  const upstandFamilies = useDemoStore((state) => state.upstandFamilies);
  const workbookOverrides = useDemoStore((state) => state.workbookOverrides);
  const workbookConfirmed = useDemoStore((state) => state.workbookConfirmed);
  const loaded = useRef(false);
  const hydrating = useRef(false);
  const previousDemoContext = useRef<null | {
    sheets: Sheet[]; viewports: Viewport[]; storeys: Storey[];
    floorFamilies: FinishFamily[]; floorZones: Zone[]; ceilingFamilies: FinishFamily[]; ceilingZones: Zone[];
    roofFamilies: RoofFamily[]; upstandFamilies: UpstandFamily[]; roofZones: RoofZone[];
    selectedViewportId: string; selectedEntityId: string | null;
    workbookOverrides: Record<string, number>; workbookConfirmed: Record<string, boolean>;
  }>(null);
  const lastSaved = useRef("");
  const analysisTriggered = useRef(false);

  function currentPayload(currentModule: ModuleName) {
    const state = useDemoStore.getState();
    const moduleFamilies = currentModule === "floor" ? state.floorFamilies : currentModule === "ceiling" ? state.ceilingFamilies : state.roofFamilies;
    const moduleZones = currentModule === "floor" ? state.floorZones : currentModule === "ceiling" ? state.ceilingZones : state.roofZones;
    return {
      families: moduleFamilies,
      ...(currentModule === "roof" ? { upstandFamilies: state.upstandFamilies } : {}),
      zones: moduleZones,
      uiState: { workbookOverrides: state.workbookOverrides, workbookConfirmed: state.workbookConfirmed },
    };
  }
  function signatureFor(payload: ReturnType<typeof currentPayload>) {
    return JSON.stringify({ families: payload.families, upstandFamilies: "upstandFamilies" in payload ? payload.upstandFamilies : [], zones: payload.zones, workbookOverrides: payload.uiState.workbookOverrides, workbookConfirmed: payload.uiState.workbookConfirmed });
  }
  function signatureFromServer(state: TakeoffServerState) {
    return JSON.stringify({ families: state.families, upstandFamilies: state.upstandFamilies || [], zones: state.zones, workbookOverrides: state.uiState?.workbookOverrides || {}, workbookConfirmed: state.uiState?.workbookConfirmed || {} });
  }

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
      roofFamilies: before.roofFamilies, upstandFamilies: before.upstandFamilies, roofZones: before.roofZones,
      selectedViewportId: before.selectedViewportId, selectedEntityId: before.selectedEntityId,
      workbookOverrides: before.workbookOverrides, workbookConfirmed: before.workbookConfirmed,
    };

    async function load() {
      try {
        const state = await requestJson<TakeoffServerState>(`${serverPath(projectId, module!)}/demo-state?fresh=${Date.now()}`);
        if (cancelled) return;
        hydrating.current = true;
        hydrate(module!, state);
        lastSaved.current = signatureFromServer(state);
        queueMicrotask(() => { hydrating.current = false; loaded.current = true; });

        // Same interaction as Floor/Ceiling: one automatic analysis on first empty entry
        // only when the backend is explicitly configured with OpenAI.
        if (!state.zones.length && state.provider === "openai" && state.analysis?.status !== "running" && !analysisTriggered.current) {
          analysisTriggered.current = true;
          try {
            await requestJson(`${serverPath(projectId, module!)}/analyze?quality=medium`, { method: "POST" });
            if (cancelled) return;
            const refreshed = await requestJson<TakeoffServerState>(`${serverPath(projectId, module!)}/demo-state?fresh=${Date.now()}`);
            if (cancelled) return;
            hydrating.current = true;
            hydrate(module!, refreshed);
            lastSaved.current = signatureFromServer(refreshed);
            queueMicrotask(() => { hydrating.current = false; loaded.current = true; });
          } catch (error) {
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
      if (loaded.current && !hydrating.current) {
        const pendingPayload = currentPayload(module);
        const signature = signatureFor(pendingPayload);
        if (signature !== lastSaved.current) {
          void requestJson(`${serverPath(projectId, module)}/demo-state`, {
            method: "PUT", body: JSON.stringify(pendingPayload), keepalive: true,
          }).catch((error) => console.warn(`Quanto ${module} final edit could not be saved`, error));
        }
      }
      const snapshot = previousDemoContext.current;
      if (snapshot) useDemoStore.setState(snapshot);
      previousDemoContext.current = null;
      loaded.current = false;
    };
  }, [projectId, module]);

  const payloadSignature = useMemo(() => JSON.stringify({ families, zones, upstandFamilies: module === "roof" ? upstandFamilies : [], workbookOverrides, workbookConfirmed }), [families, zones, upstandFamilies, module, workbookOverrides, workbookConfirmed]);

  useEffect(() => {
    if (!module || !loaded.current || hydrating.current) return;
    if (payloadSignature === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      const payload = currentPayload(module);
      try {
        const saved = await requestJson<TakeoffServerState>(`${serverPath(projectId, module)}/demo-state`, { method: "PUT", body: JSON.stringify(payload) });
        lastSaved.current = signatureFor(payload);
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
