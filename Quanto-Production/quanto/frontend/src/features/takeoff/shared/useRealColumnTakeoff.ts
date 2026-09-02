"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { Sheet, Storey, Viewport } from "@/features/demo/types";
import { useStructuralStore } from "@/features/quanto/structuralStore";
import type { ColumnFamily, ColumnInstance } from "@/features/quanto/structuralTypes";
import { apiUrl, requestJson } from "@/shared/services/apiClient";
import type { TakeoffAccountState, TakeoffAnalysisState } from "./useRealFloorCeilingTakeoff";

type ColumnServerState = {
  sheets: Array<Sheet & { width?: number; height?: number }>;
  viewports: Viewport[];
  storeys: Storey[];
  families: ColumnFamily[];
  columns: ColumnInstance[];
  uiState?: { workbookOverrides?: Record<string, number>; workbookConfirmed?: Record<string, boolean> };
  analysis?: TakeoffAnalysisState;
  provider?: string;
  auth?: TakeoffAccountState;
};

const pathFor = (projectId: string) => `/api/v1/projects/${projectId}/takeoff/columns`;
const EMPTY_FAMILIES: ColumnFamily[] = [];
const EMPTY_COLUMNS: ColumnInstance[] = [];
const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function hydrate(raw: ColumnServerState) {
  const data = { ...raw, sheets: raw.sheets.map((sheet) => ({ ...sheet, image: apiUrl(sheet.image) })) };
  const demo = useDemoStore.getState();
  const firstPlan = data.viewports.find((viewport) => viewport.category === "plan")?.id || data.viewports[0]?.id || demo.selectedViewportId;
  const selectedStillExists = data.viewports.some((viewport) => viewport.id === demo.selectedViewportId);
  useDemoStore.setState({
    sheets: data.sheets,
    viewports: data.viewports,
    storeys: data.storeys,
    selectedViewportId: selectedStillExists ? demo.selectedViewportId : firstPlan,
    selectedEntityId: null,
  });
  useStructuralStore.getState().replaceColumnData(data.families, data.columns);
  useStructuralStore.setState({
    workbookOverrides: data.uiState?.workbookOverrides || {},
    workbookConfirmed: data.uiState?.workbookConfirmed || {},
  });
}

export function useRealColumnTakeoff(projectId: string, element: string) {
  const module = element === "columns" ? "columns" as const : null;
  const families = useStructuralStore((state) => module ? state.columnFamilies : EMPTY_FAMILIES);
  const columns = useStructuralStore((state) => module ? state.columns : EMPTY_COLUMNS);
  const workbookOverrides = useStructuralStore((state) => state.workbookOverrides);
  const workbookConfirmed = useStructuralStore((state) => state.workbookConfirmed);
  const loaded = useRef(false);
  const hydrating = useRef(false);
  const serialRef = useRef(0);
  const lastSaved = useRef("");
  const analysisTriggered = useRef(false);
  const previousDemo = useRef<null | ReturnType<typeof snapshotDemo>>(null);
  const previousStructural = useRef<null | ReturnType<typeof snapshotStructural>>(null);
  const [analysis, setAnalysis] = useState<TakeoffAnalysisState | null>(null);
  const [accountAuth, setAccountAuth] = useState<TakeoffAccountState | null>(null);
  const [authConnecting, setAuthConnecting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  function snapshotDemo() {
    const state = useDemoStore.getState();
    return {
      sheets: state.sheets, viewports: state.viewports, storeys: state.storeys,
      selectedViewportId: state.selectedViewportId, selectedEntityId: state.selectedEntityId,
    };
  }
  function snapshotStructural() {
    const state = useStructuralStore.getState();
    return {
      columnFamilies: state.columnFamilies, columns: state.columns, columnDataSource: state.columnDataSource,
      selectedId: state.selectedId, selectedIds: state.selectedIds,
      workbookOverrides: state.workbookOverrides, workbookConfirmed: state.workbookConfirmed,
    };
  }
  function payload() {
    const state = useStructuralStore.getState();
    return {
      families: state.columnFamilies,
      columns: state.columns,
      uiState: { workbookOverrides: state.workbookOverrides, workbookConfirmed: state.workbookConfirmed },
    };
  }
  const signature = (value: ReturnType<typeof payload>) => JSON.stringify(value);
  const serverSignature = (state: ColumnServerState) => JSON.stringify({
    families: state.families,
    columns: state.columns,
    uiState: { workbookOverrides: state.uiState?.workbookOverrides || {}, workbookConfirmed: state.uiState?.workbookConfirmed || {} },
  });

  function apply(state: ColumnServerState) {
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
        const state = await requestJson<ColumnServerState>(`${pathFor(projectId)}/demo-state?fresh=${Date.now()}`);
        if (serialRef.current !== serial) return null;
        setAnalysis(state.analysis || null);
        setAccountAuth(state.auth || null);
        if (state.analysis?.status === "running") continue;
        if (state.analysis?.status === "completed") apply(state);
        return state;
      } catch (error) {
        console.warn("Quanto Column analysis state could not be refreshed", error);
        return null;
      }
    }
    return null;
  }

  async function startDetection(force: boolean, serial: number) {
    if (!module || serialRef.current !== serial) return;
    setAnalysis({ status: "running", progress: 1, message: "Preparing Column drawings" });
    try {
      const started = await requestJson<TakeoffAnalysisState>(`${pathFor(projectId)}/analyze?quality=medium${force ? "&force=true" : ""}`, { method: "POST" });
      if (serialRef.current !== serial) return;
      setAnalysis(started);
      await poll(serial);
    } catch (error) {
      console.warn("Quanto Column account detection could not start", error);
      try {
        const state = await requestJson<ColumnServerState>(`${pathFor(projectId)}/demo-state?fresh=${Date.now()}`);
        setAnalysis(state.analysis || { status: "failed", progress: 100, message: "Column detection needs review" });
        setAccountAuth(state.auth || null);
      } catch {
        setAnalysis({ status: "failed", progress: 100, message: "Column detection needs review" });
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
    previousStructural.current = snapshotStructural();
    void (async () => {
      try {
        const state = await requestJson<ColumnServerState>(`${pathFor(projectId)}/demo-state?fresh=${Date.now()}`);
        if (cancelled || serialRef.current !== serial) return;
        apply(state);
        if (state.analysis?.status === "running") {
          void poll(serial);
        } else if (!state.columns.length && state.auth?.authenticated && state.analysis?.status === "not_started" && !analysisTriggered.current) {
          analysisTriggered.current = true;
          void startDetection(false, serial);
        }
      } catch (error) {
        console.warn("Quanto Column state could not be loaded", error);
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
      if (previousStructural.current) useStructuralStore.setState(previousStructural.current);
      previousDemo.current = null;
      previousStructural.current = null;
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
        if (!useStructuralStore.getState().columns.length) void startDetection(false, serial);
        return;
      }
      while (serialRef.current === serial) {
        await delay(1000);
        const current = await requestJson<TakeoffAccountState>(`${pathFor(projectId)}/auth?fresh=${Date.now()}`);
        setAccountAuth(current);
        if (current.authenticated) {
          if (!useStructuralStore.getState().columns.length) {
            analysisTriggered.current = true;
            void startDetection(false, serial);
          }
          return;
        }
        if (current.status === "failed" || current.status === "sdk_missing") return;
      }
    } catch (error) {
      popup?.close();
      console.warn("Quanto Column ChatGPT sign-in could not start", error);
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
    () => JSON.stringify({ families, columns, workbookOverrides, workbookConfirmed }),
    [families, columns, workbookOverrides, workbookConfirmed],
  );
  useEffect(() => {
    if (!module || !loaded.current || hydrating.current) return;
    const current = payload();
    if (signature(current) === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const saved = await requestJson<ColumnServerState>(`${pathFor(projectId)}/demo-state`, { method: "PUT", body: JSON.stringify(payload()) });
        lastSaved.current = serverSignature(saved);
        hydrating.current = true;
        hydrate(saved);
        setAnalysis(saved.analysis || null);
        setAccountAuth(saved.auth || null);
        queueMicrotask(() => { hydrating.current = false; });
      } catch (error) {
        console.warn("Quanto Column edit could not be saved", error);
      }
    }, 750);
    return () => window.clearTimeout(timer);
  }, [projectId, module, payloadSignature]);

  return {
    module, analysis, retrying, retryAnalysis, accountAuth, authConnecting, connectTakeoffAccount,
    hasSavedModuleData: Boolean(module) && (columns.length > 0 || analysis?.status === "completed"),
  };
}
