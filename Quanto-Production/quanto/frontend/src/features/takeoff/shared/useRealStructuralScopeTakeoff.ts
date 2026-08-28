"use client";

import { useEffect, useRef } from "react";
import { useDemoStore } from "@/features/demo/store";
import type { Sheet, Storey, Viewport } from "@/features/demo/types";
import { preApi, renderUrl } from "@/features/pre/services/preApi";
import { scopeApi } from "@/features/scope/api";

type StructuralElement = "columns" | "beams" | "slab";

function category(kind?: string | null): Viewport["category"] {
  if (kind === "plan" || kind === "elevation" || kind === "section" || kind === "detail" || kind === "schedule") return kind;
  return "detail";
}

function scaleFactor(server: any): number {
  const fit = server.latest_scale || server.scale || {};
  const checks = fit.checks || {};
  return Number(checks.confirmed_factor || server.detected_scale_factor || fit.factor_x || fit.factor_y || 0);
}

/** Loads the frozen, project-specific structural drawings selected by Scope. */
export function useRealStructuralScopeTakeoff(projectId: string, element: string) {
  const structuralElement = (["columns", "beams", "slab"] as string[]).includes(element)
    ? element as StructuralElement
    : null;
  const previous = useRef<null | { sheets: Sheet[]; viewports: Viewport[]; storeys: Storey[]; selectedViewportId: string; selectedEntityId: string | null }>(null);

  useEffect(() => {
    if (!structuralElement || !projectId) return;
    let cancelled = false;
    const current = useDemoStore.getState();
    previous.current = {
      sheets: current.sheets,
      viewports: current.viewports,
      storeys: current.storeys,
      selectedViewportId: current.selectedViewportId,
      selectedEntityId: current.selectedEntityId,
    };

    async function load() {
      try {
        const [pre, scope] = await Promise.all([preApi.pre(projectId), scopeApi.get(projectId, structuralElement!)]);
        if (cancelled) return;
        const primaryIds = new Set(
          (scope.level_scopes || []).flatMap((level) => level.primary_viewport_ids || []),
        );
        if (!primaryIds.size) {
          for (const item of scope.selected_viewports || []) {
            if (item.role === "primary_measurement") primaryIds.add(item.viewport_id);
          }
        }
        if (!primaryIds.size) return;

        const pageById = new Map(pre.pages.map((page) => [page.id, page]));
        const selectedServers = pre.viewports.filter((viewport) => primaryIds.has(viewport.id));
        const requiredSheetIds = new Set(selectedServers.map((viewport) => viewport.sheet_id));
        const sheets: Sheet[] = pre.sheets
          .filter((sheet) => requiredSheetIds.has(sheet.id))
          .map((sheet) => {
            const page = pageById.get(sheet.page_id);
            return {
              id: sheet.id,
              sheetNo: sheet.sheet_no || `Page ${sheet.page_number}`,
              title: sheet.title || "Drawing sheet",
              revision: sheet.revision || "",
              image: renderUrl(sheet.working_render_id || sheet.thumbnail_render_id),
              page: sheet.page_number,
              included: sheet.included,
              width: page?.working_width_px || undefined,
              height: page?.working_height_px || undefined,
            };
          });
        const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));
        const viewports: Viewport[] = selectedServers.map((server) => {
          const sheet = sheetById.get(server.sheet_id);
          const width = sheet?.width || 1000;
          const height = sheet?.height || 1000;
          const box = server.bbox_norm || [0, 0, 1, 1];
          const factor = scaleFactor(server);
          return {
            id: server.id,
            name: server.name,
            category: category(server.view_kind),
            sheetId: server.sheet_id,
            bbox: [box[0] * width, box[1] * height, box[2] * width, box[3] * height],
            order: (server as any).display_order ?? 0,
            status: "confirmed",
            scaleMPerPx: factor > 0 ? factor * 25.4 / (150 * 1000) : undefined,
            takeoffElement: structuralElement!,
          };
        });
        const storeys: Storey[] = pre.storeys.map((storey) => ({
          id: storey.id,
          name: storey.name,
          levelIndex: storey.level_index,
          factor: 1,
          heightM: Number(storey.height_mm || 0) / 1000,
          status: "confirmed",
        }));
        useDemoStore.setState({
          sheets,
          viewports,
          storeys,
          selectedViewportId: viewports[0]?.id || "",
          selectedEntityId: null,
        });
      } catch (error) {
        console.warn(`Quanto ${structuralElement} drawings could not be loaded`, error);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (previous.current) useDemoStore.setState(previous.current);
      previous.current = null;
    };
  }, [projectId, structuralElement]);
}
