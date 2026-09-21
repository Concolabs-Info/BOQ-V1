"use client";

import { useEffect } from "react";
import { isTakeoffViewCommand } from "@/features/settings/access";
import { canMutateTakeoffGeometry, denyTakeoffGeometryEdit } from "./takeoffGeometryAccess";

export const TAKEOFF_COMMAND_EVENT = "quanto:takeoff-command";
export const TAKEOFF_VIEW_EVENT = "quanto:takeoff-view";
export const TAKEOFF_STATUS_EVENT = "quanto:takeoff-status";

export type TakeoffCommand = {
  id: string;
  label: string;
  tab: string;
  group: string;
  element: string;
};

export type TakeoffViewState = {
  zoom: number;
  x: number;
  y: number;
  fullscreen: boolean;
};

export type TakeoffWorkspaceStatus = {
  selected?: string | null;
  snap?: boolean;
  ortho?: boolean;
  saving?: "editing" | "saving" | "saved";
  message?: string;
};

export function commandId(tab: string, group: string, label: string) {
  return `${tab}.${group}.${label}`
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function dispatchTakeoffCommand(command: TakeoffCommand) {
  if (!canMutateTakeoffGeometry() && !isTakeoffViewCommand(command.tab, command.label)) {
    denyTakeoffGeometryEdit();
    return;
  }
  window.dispatchEvent(
    new CustomEvent<TakeoffCommand>(TAKEOFF_COMMAND_EVENT, { detail: command }),
  );
}

export function dispatchTakeoffStatus(status: TakeoffWorkspaceStatus) {
  window.dispatchEvent(
    new CustomEvent<TakeoffWorkspaceStatus>(TAKEOFF_STATUS_EVENT, {
      detail: status,
    }),
  );
}

export function useTakeoffCommand(
  handler: (command: TakeoffCommand) => void,
) {
  useEffect(() => {
    const listener = (event: Event) =>
      handler((event as CustomEvent<TakeoffCommand>).detail);
    window.addEventListener(TAKEOFF_COMMAND_EVENT, listener);
    return () => window.removeEventListener(TAKEOFF_COMMAND_EVENT, listener);
  }, [handler]);
}

