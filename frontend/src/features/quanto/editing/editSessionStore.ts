"use client";

import { create } from "zustand";
import { canMutateTakeoffGeometry } from "../takeoffGeometryAccess";

type Commit = (draft: unknown) => void | Promise<void>;
type Action = () => void;

export type EditSessionConfig<T> = {
  key: string;
  title: string;
  original: T;
  draft: T;
  commit: (draft: T) => void | Promise<void>;
  discard?: () => void;
};

type EditSessionState = {
  key: string | null;
  title: string;
  original: unknown;
  draft: unknown;
  commit: Commit | null;
  discardCallback: Action | null;
  pendingAction: Action | null;
  pendingLabel: string | null;
  saving: boolean;
  begin: <T>(config: EditSessionConfig<T>) => void;
  update: <T>(key: string, draft: T, commit?: (draft: T) => void | Promise<void>) => void;
  save: () => Promise<void>;
  discard: () => void;
  stay: () => void;
  requestAction: (action: Action, label?: string) => void;
  clear: () => void;
};

const empty = {
  key: null,
  title: "",
  original: null,
  draft: null,
  commit: null,
  discardCallback: null,
  pendingAction: null,
  pendingLabel: null,
  saving: false,
} as const;

export const useEditSessionStore = create<EditSessionState>((set, get) => ({
  ...empty,
  begin: (config) => {
    const current = get();
    if (current.key && current.key !== config.key) {
      current.requestAction(() => get().begin(config), `edit ${config.title}`);
      return;
    }
    set({
      key: config.key,
      title: config.title,
      original: config.original,
      draft: config.draft,
      commit: config.commit as Commit,
      discardCallback: config.discard || null,
    });
  },
  update: (key, draft, commit) => {
    if (get().key !== key) return;
    set({ draft, ...(commit ? { commit: commit as Commit } : {}) });
  },
  save: async () => {
    const current = get();
    if (!current.key || !current.commit || current.saving) return;
    set({ saving: true });
    try {
      await current.commit(current.draft);
      const pending = get().pendingAction;
      set({ ...empty });
      window.dispatchEvent(new CustomEvent("quanto:data-committed", { detail: { key: current.key } }));
      pending?.();
    } finally {
      set({ saving: false });
    }
  },
  discard: () => {
    const current = get();
    current.discardCallback?.();
    const pending = current.pendingAction;
    set({ ...empty });
    pending?.();
  },
  stay: () => set({ pendingAction: null, pendingLabel: null }),
  requestAction: (action, label) => {
    const current = get();
    if (current.key?.startsWith("measurement:")) {
      set({ ...empty });
      action();
      return;
    }
    if (!current.key) {
      action();
      return;
    }
    set({ pendingAction: action, pendingLabel: label || "continue" });
  },
  clear: () => set({ ...empty }),
}));

export function draftFor<T extends object>(key: string, saved: T): T {
  const state = useEditSessionStore.getState();
  return state.key === key && state.draft ? ({ ...saved, ...(state.draft as Partial<T>) } as T) : saved;
}

export function requestGuardedAction(action: Action, label?: string) {
  useEditSessionStore.getState().requestAction(action, label);
}

export function beginLiveEdit(key: string, title: string, discard: Action): boolean {
  if (!canMutateTakeoffGeometry() && !key.startsWith("measurement:")) return false;
  const state = useEditSessionStore.getState();
  if (state.key === key) return true;
  if (state.key) {
    state.requestAction(() => undefined, `edit ${title}`);
    return false;
  }
  state.begin({ key, title, original: null, draft: null, commit: () => undefined, discard });
  return true;
}
