"use client";

import { createContext, createElement, useContext, useEffect, type ReactNode } from "react";
import { actionReason } from "@/features/settings/access";

const TakeoffGeometryContext = createContext(true);
let mutable = true;

export function setTakeoffGeometryEditable(next: boolean) {
  mutable = next;
}

export function canMutateTakeoffGeometry() {
  return mutable;
}

export function useTakeoffGeometryAllowed() {
  return useContext(TakeoffGeometryContext);
}

export function TakeoffGeometryProvider({
  allowed,
  children,
}: {
  allowed: boolean;
  children: ReactNode;
}) {
  setTakeoffGeometryEditable(allowed);
  useEffect(() => {
    setTakeoffGeometryEditable(allowed);
    return () => setTakeoffGeometryEditable(true);
  }, [allowed]);
  return createElement(TakeoffGeometryContext.Provider, { value: allowed }, children);
}

export function denyTakeoffGeometryEdit() {
  if (mutable) return false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("quanto:takeoff-status", {
        detail: { message: actionReason("takeoff:edit") },
      }),
    );
  }
  return true;
}
