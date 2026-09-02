"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { FinishFamily, FloorReviewRegion, RoofFamily, RoofZone, Sheet, Storey, UpstandFamily, Viewport, Zone } from "@/features/demo/types";
import { apiUrl, requestJson } from "@/shared/services/apiClient";

type ModuleName = "floor" | "ceiling" | "roof";
const EMPTY_FAMILIES: Array<FinishFamily | RoofFamily> = [];
const EMPTY_ZONES: Array<Zone | RoofZone> = [];
export type TakeoffAnalysisIssue = { code: string; message: string; severity: "info" | "warning" | "error" | string; entity_refs?: string[] };
export type TakeoffAnalysisState = {
  status: string;
  progress: number;
  message?: string | null;
  error_message?: string | null;
  harness_status?: "pass" | "pass_with_flags" | "fail" | string | null;
  harness_issues?: TakeoffAnalysisIssue[];
  harness_stats?: Record<string, unknown>;
  recoverable?: boolean;
  result?: {
    floors?: Array<{
      floor_id?: string;
      floor_name?: string;
      cached?: boolean;
      skipped?: boolean;
      reason?: string;
    }>;
    cached?: boolean;
    [key: string]: unknown;
  };
};
export type TakeoffAccountState = {
  provider: string;
  available: boolean;
  authenticated: boolean;
  status: string;
  verification_url?: string | null;
  user_code?: string | null;
  error?: string | null;
};
type TakeoffServerState = {
  sheets: Array<Sheet & { width?: number; height?: number }>;
  viewports: Viewport[];
  storeys: Storey[];
  families: Array<FinishFamily | RoofFamily>;
  upstandFamilies?: UpstandFamily[];
  zones: Array<Zone | RoofZone>;
  reviewRegions?: FloorReviewRegion[];
  uiState?: { workbookOverrides?: Record<string, number>; workbookConfirmed?: Record<string, boolean> };
  analysis?: TakeoffAnalysisState;
  provider?: string;
  auth?: TakeoffAccountState;
};

function serverPath(projectId: string, module: ModuleName) {
  return `/api/v1/projects/${projectId}/takeoff/${module}`;
}

/**
 * A typical plan may be the approved source for several storeys. The database
 * correctly keeps that one source viewport ID, but the editor needs one UI
 * viewport identity per floor; otherwise selecting any typical floor renders
 * every repeated storey's zones on top of each other.
 */
function withEditorViewportIdentities(items: TakeoffServerState): TakeoffServerState {
  const floorIdFromSheet = (sheetId: string) => sheetId.startsWith("takeoff-sheet-")
    ? sheetId.slice("takeoff-sheet-".length)
    : null;
  const sourceIds = new Set(items.viewports.map((viewport) => viewport.id));
  const viewports = items.viewports.map((viewport) => {
    const floorId = floorIdFromSheet(viewport.sheetId);
    return floorId ? { ...viewport, id: floorId } : viewport;
  });
  const zones = items.zones.map((zone) => {
    // Dedicated RCPs retain their real viewport identity. Floor-plan-derived
    // geometry is attached to its per-storey editor viewport.
    const floorId = "floorId" in zone ? String(zone.floorId || "") : "";
    const usesDedicatedViewport = sourceIds.has(zone.viewportId)
      && items.viewports.some((viewport) => viewport.id === zone.viewportId && !floorIdFromSheet(viewport.sheetId));
    return floorId && !usesDedicatedViewport ? { ...zone, viewportId: floorId } : zone;
  });
  const reviewRegions = (items.reviewRegions || []).map((region) => {
    const floorId = String(region.floorId || "");
    const usesDedicatedViewport = sourceIds.has(region.viewportId)
      && items.viewports.some((viewport) => viewport.id === region.viewportId && !floorIdFromSheet(viewport.sheetId));
    return floorId && !usesDedicatedViewport ? { ...region, viewportId: floorId } : region;
  });
  return {
    ...items,
    sheets: items.sheets.map((sheet) => ({ ...sheet, image: apiUrl(sheet.image) })),
    viewports,
    zones,
    reviewRegions,
  };
}

function hydrate(module: ModuleName, raw: TakeoffServerState) {
  const data = withEditorViewportIdentities(raw);
  const current = useDemoStore.getState();
  const firstViewport = data.viewports[0]?.id || current.selectedViewportId;
  const selectedStillExists = data.viewports.some((viewport) => viewport.id === current.selectedViewportId);
  const moduleData = module === "floor"
    ? { floorFamilies: data.families as FinishFamily[], floorZones: data.zones as Zone[], floorReviewRegions: data.reviewRegions || [] }
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

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Bridges the unchanged demo-derived Takeoff UI to the production Floor/Ceiling/Roof API.
 * Geometry stays in the exact source-crop pixel coordinate space. PostgreSQL + the
 * confirmed Pre scale are authoritative for official quantities.
 *
 * Floor, Ceiling and Roof use the local ChatGPT/Codex account session with the
 * same background/persisted lifecycle pattern as Beams. Saved results hydrate
 * immediately; unchanged sources are not sent to the model again.
 */
export function useRealFloorCeilingTakeoff(projectId: string, element: string) {
  const module: ModuleName | null = element === "floor" ? "floor" : element === "ceiling" ? "ceiling" : element === "roof" ? "roof" : null;
  const families = useDemoStore((state) => module === "floor" ? state.floorFamilies : module === "ceiling" ? state.ceilingFamilies : module === "roof" ? state.roofFamilies : EMPTY_FAMILIES);
  const zones = useDemoStore((state) => module === "floor" ? state.floorZones : module === "ceiling" ? state.ceilingZones : module === "roof" ? state.roofZones : EMPTY_ZONES);
  const upstandFamilies = useDemoStore((state) => state.upstandFamilies);
  const workbookOverrides = useDemoStore((state) => state.workbookOverrides);
  const workbookConfirmed = useDemoStore((state) => state.workbookConfirmed);
  const loaded = useRef(false);
  const hydrating = useRef(false);
  const pollSerial = useRef(0);
  const previousDemoContext = useRef<null | {
    sheets: Sheet[]; viewports: Viewport[]; storeys: Storey[];
    floorFamilies: FinishFamily[]; floorZones: Zone[]; floorReviewRegions: FloorReviewRegion[]; ceilingFamilies: FinishFamily[]; ceilingZones: Zone[];
    roofFamilies: RoofFamily[]; upstandFamilies: UpstandFamily[]; roofZones: RoofZone[];
    selectedViewportId: string; selectedEntityId: string | null;
    workbookOverrides: Record<string, number>; workbookConfirmed: Record<string, boolean>;
  }>(null);
  const lastSaved = useRef("");
  const analysisTriggered = useRef(false);
  const [analysis, setAnalysis] = useState<TakeoffAnalysisState | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [accountAuth, setAccountAuth] = useState<TakeoffAccountState | null>(null);
  const [authConnecting, setAuthConnecting] = useState(false);

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
    const normalized = withEditorViewportIdentities(state);
    return JSON.stringify({ families: normalized.families, upstandFamilies: normalized.upstandFamilies || [], zones: normalized.zones, workbookOverrides: normalized.uiState?.workbookOverrides || {}, workbookConfirmed: normalized.uiState?.workbookConfirmed || {} });
  }

  function applyFreshState(currentModule: ModuleName, state: TakeoffServerState) {
    hydrating.current = true;
    hydrate(currentModule, state);
    setAnalysis(state.analysis || null);
    setAccountAuth(state.auth || null);
    lastSaved.current = signatureFromServer(state);
    queueMicrotask(() => { hydrating.current = false; loaded.current = true; });
  }

  async function pollAccountUntilSettled(currentModule: ModuleName, serial: number) {
    while (pollSerial.current === serial) {
      await delay(900);
      if (pollSerial.current !== serial) return null;
      try {
        const state = await requestJson<TakeoffServerState>(`${serverPath(projectId, currentModule)}/demo-state?fresh=${Date.now()}`);
        if (pollSerial.current !== serial) return null;
        setAnalysis(state.analysis || null);
        setAccountAuth(state.auth || null);
        if (state.analysis?.status === "running") continue;
        if (state.analysis?.status === "completed") applyFreshState(currentModule, state);
        return state;
      } catch (error) {
        console.warn(`Quanto ${currentModule} analysis state could not be refreshed`, error);
        return null;
      }
    }
    return null;
  }

  async function startAccountDetection(currentModule: ModuleName, force: boolean, serial: number) {
    if (pollSerial.current !== serial) return;
    setAnalysis({ status: "running", progress: 1, message: `Preparing ${currentModule} drawings` });
    try {
      const quality = currentModule === "floor" ? "expert" : "medium";
      const suffix = `quality=${quality}${force ? "&force=true" : ""}`;
      const started = await requestJson<TakeoffAnalysisState>(`${serverPath(projectId, currentModule)}/analyze?${suffix}`, { method: "POST" });
      if (pollSerial.current !== serial) return;
      setAnalysis(started);
      await pollAccountUntilSettled(currentModule, serial);
    } catch (error) {
      console.warn(`Quanto ${currentModule} account detection could not start`, error);
      if (pollSerial.current !== serial) return;
      try {
        const latest = await requestJson<TakeoffServerState>(`${serverPath(projectId, currentModule)}/demo-state?fresh=${Date.now()}`);
        setAnalysis(latest.analysis || { status: "failed", progress: 100, message: "Automatic detection needs review" });
        setAccountAuth(latest.auth || null);
      } catch {
        setAnalysis({ status: "failed", progress: 100, message: "Automatic detection needs review" });
      }
    }
  }

  useEffect(() => {
    if (!module || !projectId) return;
    let cancelled = false;
    const serial = ++pollSerial.current;
    loaded.current = false;
    analysisTriggered.current = false;
    setAnalysis(null);
    setAccountAuth(null);
    const before = useDemoStore.getState();
    previousDemoContext.current = {
      sheets: before.sheets, viewports: before.viewports, storeys: before.storeys,
      floorFamilies: before.floorFamilies, floorZones: before.floorZones, floorReviewRegions: before.floorReviewRegions,
      ceilingFamilies: before.ceilingFamilies, ceilingZones: before.ceilingZones,
      roofFamilies: before.roofFamilies, upstandFamilies: before.upstandFamilies, roofZones: before.roofZones,
      selectedViewportId: before.selectedViewportId, selectedEntityId: before.selectedEntityId,
      workbookOverrides: before.workbookOverrides, workbookConfirmed: before.workbookConfirmed,
    };

    async function load() {
      try {
        const state = await requestJson<TakeoffServerState>(`${serverPath(projectId, module!)}/demo-state?fresh=${Date.now()}`);
        if (cancelled || pollSerial.current !== serial) return;
        applyFreshState(module!, state);

        // Like Beams, every account-backed area module uses a durable background
        // run. A saved result loads immediately; only an empty, never-started,
        // authenticated project automatically starts detection.
        if (state.analysis?.status === "running") {
          void pollAccountUntilSettled(module!, serial);
        } else if (!state.zones.length && state.auth?.authenticated && state.analysis?.status === "not_started" && !analysisTriggered.current) {
          analysisTriggered.current = true;
          void startAccountDetection(module!, false, serial);
        }
      } catch (error) {
        console.warn(`Quanto ${module} state could not be loaded`, error);
      }
    }
    void load();
    return () => {
      cancelled = true;
      pollSerial.current += 1;
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

  async function connectTakeoffAccount() {
    if (!module || authConnecting) return;
    const currentModule = module;
    const serial = pollSerial.current;
    setAuthConnecting(true);
    const popup = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      const login = await requestJson<TakeoffAccountState>(`${serverPath(projectId, currentModule)}/auth/login`, { method: "POST" });
      if (pollSerial.current !== serial) {
        popup?.close();
        return;
      }
      setAccountAuth(login);
      if (login.verification_url) {
        if (popup) popup.location.href = login.verification_url;
        else window.open(login.verification_url, "_blank", "noopener,noreferrer");
      } else {
        popup?.close();
      }
      const currentState = useDemoStore.getState();
      const savedZoneCount = currentModule === "floor"
        ? currentState.floorZones.length
        : currentModule === "ceiling"
          ? currentState.ceilingZones.length
          : currentState.roofZones.length;
      if (login.authenticated) {
        if (!savedZoneCount) void startAccountDetection(currentModule, false, serial);
        return;
      }

      while (pollSerial.current === serial) {
        await delay(1000);
        if (pollSerial.current !== serial) return;
        const current = await requestJson<TakeoffAccountState>(`${serverPath(projectId, currentModule)}/auth?fresh=${Date.now()}`);
        setAccountAuth(current);
        if (current.authenticated) {
          const currentState = useDemoStore.getState();
          const currentZoneCount = currentModule === "floor"
            ? currentState.floorZones.length
            : currentModule === "ceiling"
              ? currentState.ceilingZones.length
              : currentState.roofZones.length;
          if (!currentZoneCount) {
            analysisTriggered.current = true;
            void startAccountDetection(currentModule, false, serial);
          }
          return;
        }
        if (current.status === "failed" || current.status === "sdk_missing") return;
      }
    } catch (error) {
      popup?.close();
      console.warn(`Quanto ${currentModule} ChatGPT sign-in could not start`, error);
    } finally {
      if (pollSerial.current === serial) setAuthConnecting(false);
    }
  }

  async function retryAnalysis() {
    if (!module || retrying) return;
    setRetrying(true);
    setAnalysis({ status: "running", progress: 5, message: `Finding ${module} areas…` });
    try {
      await startAccountDetection(module, true, pollSerial.current);
      return;
    } catch {
      try {
        const latest = await requestJson<TakeoffServerState>(`${serverPath(projectId, module)}/demo-state?fresh=${Date.now()}`);
        setAnalysis(latest.analysis || { status: "failed", progress: 100, message: "Automatic detection needs review" });
        setAccountAuth(latest.auth || null);
      } catch {
        setAnalysis({ status: "failed", progress: 100, message: "Automatic detection needs review" });
      }
    } finally {
      setRetrying(false);
    }
  }

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
        setAccountAuth(saved.auth || null);
        queueMicrotask(() => { hydrating.current = false; });
      } catch (error) {
        console.warn(`Quanto ${module} edit could not be saved`, error);
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [projectId, module, payloadSignature]);

  const hasSavedModuleData = Boolean(module) && zones.length > 0;
  const resultFloors = analysis?.result?.floors || [];
  const isShowingCachedResult = analysis?.status === "completed"
    && (analysis?.result?.cached === true || (resultFloors.length > 0 && resultFloors.every((floor) => floor.cached || floor.skipped)));
  return {
    module, analysis, retrying, retryAnalysis,
    accountAuth, authConnecting, connectTakeoffAccount, hasSavedModuleData, isShowingCachedResult,
    // Preserve the Floor-facing aliases used by the existing page integration.
    floorAuth: module === "floor" ? accountAuth : null,
    ceilingAuth: module === "ceiling" ? accountAuth : null,
    roofAuth: module === "roof" ? accountAuth : null,
    connectFloorAccount: connectTakeoffAccount,
    connectCeilingAccount: connectTakeoffAccount,
    connectRoofAccount: connectTakeoffAccount,
    hasSavedFloorData: module === "floor" && zones.length > 0,
    hasSavedCeilingData: module === "ceiling" && zones.length > 0,
    hasSavedRoofData: module === "roof" && zones.length > 0,
  };
}
