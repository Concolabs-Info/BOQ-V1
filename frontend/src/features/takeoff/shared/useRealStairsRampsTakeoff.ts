"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { Sheet, Storey, Viewport } from "@/features/demo/types";
import { useSpecialStore } from "@/features/quanto/specialStore";
import type { Flight, FlightFamily, RailFamily } from "@/features/quanto/specialTypes";
import { apiUrl, requestJson } from "@/shared/services/apiClient";
import type { TakeoffAccountState, TakeoffAnalysisState } from "./useRealFloorCeilingTakeoff";

type StairRampServerState = {
  sheets: Array<Sheet & { width?: number; height?: number }>;
  viewports: Viewport[];
  storeys: Storey[];
  flightFamilies: FlightFamily[];
  railFamilies: RailFamily[];
  flights: Flight[];
  uiState?: { workbookOverrides?: Record<string, number>; workbookConfirmed?: Record<string, boolean> };
  analysis?: TakeoffAnalysisState;
  provider?: string;
  auth?: TakeoffAccountState;
};

const pathFor = (projectId: string) => `/api/v1/projects/${projectId}/takeoff/stairs-ramps`;
const EMPTY_FAMILIES: FlightFamily[] = [];
const EMPTY_RAILS: RailFamily[] = [];
const EMPTY_FLIGHTS: Flight[] = [];
const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function hydrate(raw: StairRampServerState) {
  const data = { ...raw, sheets: raw.sheets.map((sheet) => ({ ...sheet, image: apiUrl(sheet.image) })) };
  const demo = useDemoStore.getState();
  const preferred = data.viewports.find((viewport) => (viewport as Viewport & { scopeRole?: string }).scopeRole === "primary_measurement")?.id;
  const firstViewport = preferred || data.viewports[0]?.id || demo.selectedViewportId;
  const selectedStillExists = data.viewports.some((viewport) => viewport.id === demo.selectedViewportId);
  useDemoStore.setState({
    sheets: data.sheets,
    viewports: data.viewports,
    storeys: data.storeys,
    selectedViewportId: selectedStillExists ? demo.selectedViewportId : firstViewport,
    selectedEntityId: null,
  });
  useSpecialStore.setState({
    flightFamilies: data.flightFamilies,
    railFamilies: data.railFamilies,
    flights: data.flights,
    selectedId: null,
    selectedIds: [],
    undoStack: [],
    redoStack: [],
    workbookOverrides: data.uiState?.workbookOverrides || {},
    workbookConfirmed: data.uiState?.workbookConfirmed || {},
  });
}

export function useRealStairsRampsTakeoff(projectId: string, element: string) {
  const module = element === "stairs-ramps" ? "stairs-ramps" as const : null;
  const flightFamilies = useSpecialStore((state) => module ? state.flightFamilies : EMPTY_FAMILIES);
  const railFamilies = useSpecialStore((state) => module ? state.railFamilies : EMPTY_RAILS);
  const flights = useSpecialStore((state) => module ? state.flights : EMPTY_FLIGHTS);
  const workbookOverrides = useSpecialStore((state) => state.workbookOverrides);
  const workbookConfirmed = useSpecialStore((state) => state.workbookConfirmed);
  const loaded = useRef(false);
  const hydrating = useRef(false);
  const serialRef = useRef(0);
  const lastSaved = useRef("");
  const analysisTriggered = useRef(false);
  const previousDemo = useRef<null | ReturnType<typeof snapshotDemo>>(null);
  const previousSpecial = useRef<null | ReturnType<typeof snapshotSpecial>>(null);
  const [analysis, setAnalysis] = useState<TakeoffAnalysisState | null>(null);
  const [accountAuth, setAccountAuth] = useState<TakeoffAccountState | null>(null);
  const [authConnecting, setAuthConnecting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  function snapshotDemo() {
    const state = useDemoStore.getState();
    return {
      sheets: state.sheets,
      viewports: state.viewports,
      storeys: state.storeys,
      selectedViewportId: state.selectedViewportId,
      selectedEntityId: state.selectedEntityId,
    };
  }
  function snapshotSpecial() {
    const state = useSpecialStore.getState();
    return {
      flightFamilies: state.flightFamilies,
      railFamilies: state.railFamilies,
      flights: state.flights,
      selectedId: state.selectedId,
      selectedIds: state.selectedIds,
      undoStack: state.undoStack,
      redoStack: state.redoStack,
      workbookOverrides: state.workbookOverrides,
      workbookConfirmed: state.workbookConfirmed,
    };
  }
  function payload() {
    const state = useSpecialStore.getState();
    return {
      flightFamilies: state.flightFamilies,
      railFamilies: state.railFamilies,
      flights: state.flights,
      uiState: { workbookOverrides: state.workbookOverrides, workbookConfirmed: state.workbookConfirmed },
    };
  }
  const signature = (value: ReturnType<typeof payload>) => JSON.stringify(value);
  const serverSignature = (state: StairRampServerState) => JSON.stringify({
    flightFamilies: state.flightFamilies,
    railFamilies: state.railFamilies,
    flights: state.flights,
    uiState: { workbookOverrides: state.uiState?.workbookOverrides || {}, workbookConfirmed: state.uiState?.workbookConfirmed || {} },
  });
  function apply(state: StairRampServerState) {
    hydrating.current = true;
    hydrate(state);
    setAnalysis(state.analysis || null);
    setAccountAuth(state.auth || null);
    lastSaved.current = serverSignature(state);
    queueMicrotask(() => { hydrating.current = false; loaded.current = true; });
  }
  async function poll(serial: number) {
    while (serialRef.current === serial) {
      await delay(900);
      if (serialRef.current !== serial) return null;
      try {
        const state = await requestJson<StairRampServerState>(`${pathFor(projectId)}/demo-state?fresh=${Date.now()}`);
        if (serialRef.current !== serial) return null;
        setAnalysis(state.analysis || null);
        setAccountAuth(state.auth || null);
        if (state.analysis?.status === "running") continue;
        if (state.analysis?.status === "completed") apply(state);
        return state;
      } catch (error) {
        console.warn("Quanto Stairs & Ramps analysis state could not be refreshed", error);
        return null;
      }
    }
    return null;
  }
  async function startDetection(force: boolean, serial: number) {
    if (!module || serialRef.current !== serial) return;
    setAnalysis({ status: "running", progress: 1, message: "Preparing Stairs & Ramps drawings" });
    try {
      const started = await requestJson<TakeoffAnalysisState>(`${pathFor(projectId)}/analyze?quality=medium${force ? "&force=true" : ""}`, { method: "POST" });
      if (serialRef.current !== serial) return;
      setAnalysis(started);
      await poll(serial);
    } catch (error) {
      console.warn("Quanto Stairs & Ramps account detection could not start", error);
      try {
        const state = await requestJson<StairRampServerState>(`${pathFor(projectId)}/demo-state?fresh=${Date.now()}`);
        setAnalysis(state.analysis || { status: "failed", progress: 100, message: "Stairs & Ramps detection needs review" });
        setAccountAuth(state.auth || null);
      } catch {
        setAnalysis({ status: "failed", progress: 100, message: "Stairs & Ramps detection needs review" });
      }
    }
  }

  useEffect(() => {
    if (!module || !projectId) return;
    let cancelled = false;
    const serial = ++serialRef.current;
    loaded.current = false;
    analysisTriggered.current = false;
    setAnalysis(null);
    setAccountAuth(null);
    previousDemo.current = snapshotDemo();
    previousSpecial.current = snapshotSpecial();
    void (async () => {
      try {
        const state = await requestJson<StairRampServerState>(`${pathFor(projectId)}/demo-state?fresh=${Date.now()}`);
        if (cancelled || serialRef.current !== serial) return;
        apply(state);
        if (state.analysis?.status === "running") {
          void poll(serial);
        } else if (!state.flights.length && state.auth?.authenticated && state.analysis?.status === "not_started" && !analysisTriggered.current) {
          analysisTriggered.current = true;
          void startDetection(false, serial);
        }
      } catch (error) {
        console.warn("Quanto Stairs & Ramps state could not be loaded", error);
      }
    })();
    return () => {
      cancelled = true;
      serialRef.current += 1;
      if (loaded.current && !hydrating.current) {
        const value = payload();
        if (signature(value) !== lastSaved.current) {
          void requestJson(`${pathFor(projectId)}/demo-state`, { method: "PUT", body: JSON.stringify(value), keepalive: true }).catch(() => undefined);
        }
      }
      if (previousDemo.current) useDemoStore.setState(previousDemo.current);
      if (previousSpecial.current) useSpecialStore.setState(previousSpecial.current);
      previousDemo.current = null;
      previousSpecial.current = null;
      loaded.current = false;
    };
  }, [projectId, module]);

  async function connectTakeoffAccount() {
    if (!module || authConnecting) return;
    const serial = serialRef.current;
    setAuthConnecting(true);
    const popup = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      const login = await requestJson<TakeoffAccountState>(`${pathFor(projectId)}/auth/login`, { method: "POST" });
      if (serialRef.current !== serial) { popup?.close(); return; }
      setAccountAuth(login);
      if (login.verification_url) {
        if (popup) popup.location.href = login.verification_url;
        else window.open(login.verification_url, "_blank", "noopener,noreferrer");
      } else popup?.close();
      if (login.authenticated) {
        if (!useSpecialStore.getState().flights.length) void startDetection(false, serial);
        return;
      }
      while (serialRef.current === serial) {
        await delay(1000);
        const current = await requestJson<TakeoffAccountState>(`${pathFor(projectId)}/auth?fresh=${Date.now()}`);
        setAccountAuth(current);
        if (current.authenticated) {
          if (!useSpecialStore.getState().flights.length) {
            analysisTriggered.current = true;
            void startDetection(false, serial);
          }
          return;
        }
        if (current.status === "failed" || current.status === "sdk_missing") return;
      }
    } catch (error) {
      popup?.close();
      console.warn("Quanto Stairs & Ramps ChatGPT sign-in could not start", error);
    } finally {
      if (serialRef.current === serial) setAuthConnecting(false);
    }
  }

  async function retryAnalysis() {
    if (!module || retrying) return;
    setRetrying(true);
    try { await startDetection(true, serialRef.current); }
    finally { setRetrying(false); }
  }

  const payloadSignature = useMemo(
    () => JSON.stringify({ flightFamilies, railFamilies, flights, workbookOverrides, workbookConfirmed }),
    [flightFamilies, railFamilies, flights, workbookOverrides, workbookConfirmed],
  );
  useEffect(() => {
    if (!module || !loaded.current || hydrating.current) return;
    const current = payload();
    if (signature(current) === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const saved = await requestJson<StairRampServerState>(`${pathFor(projectId)}/demo-state`, { method: "PUT", body: JSON.stringify(payload()) });
        lastSaved.current = serverSignature(saved);
        hydrating.current = true;
        hydrate(saved);
        setAnalysis(saved.analysis || null);
        setAccountAuth(saved.auth || null);
        queueMicrotask(() => { hydrating.current = false; });
      } catch (error) {
        console.warn("Quanto Stairs & Ramps edit could not be saved", error);
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [projectId, module, payloadSignature]);

  return {
    module,
    analysis,
    retrying,
    retryAnalysis,
    accountAuth,
    authConnecting,
    connectTakeoffAccount,
    hasSavedModuleData: Boolean(module) && flights.length > 0,
  };
}
