"use client";

import { useEffect, useRef, useState } from "react";
import { useEditSessionStore } from "./editSessionStore";

export function useTransactionalDraft<T extends object>({ key, title, value, onCommit }: { key: string; title: string; value: T; onCommit: (value: T) => void | Promise<void> }) {
  const [draft, setLocalDraft] = useState<T>(value);
  const original = useRef<T>(value);
  useEffect(() => {
    if (useEditSessionStore.getState().key !== key) {
      original.current = value;
      setLocalDraft(value);
    }
  }, [key, value]);
  function setDraft(next: T | ((current: T) => T)) {
    const resolved = typeof next === "function" ? (next as (current: T) => T)(draft) : next;
    const edit = useEditSessionStore.getState();
    if (!edit.key) edit.begin({ key, title, original: original.current, draft: resolved, commit: onCommit, discard: () => setLocalDraft(original.current) });
    else if (edit.key === key) edit.update(key, resolved, onCommit);
    else { edit.requestAction(() => setDraft(resolved), `edit ${title}`); return; }
    setLocalDraft(resolved);
  }
  return { draft, setDraft };
}
