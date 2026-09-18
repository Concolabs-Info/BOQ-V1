"use client";

import { useCallback, useState } from "react";
import { ReverificationDialog } from "./ReverificationDialog";

type ReverificationLevel = "first_factor" | "second_factor" | "multi_factor";

type PendingVerification = {
  level: ReverificationLevel | undefined;
  complete: () => void;
  cancel: () => void;
};

/** Shared state for every useReverification() call in a settings screen, so
 * sensitive Clerk actions (change email, change password, ...) prompt with
 * our own dialog instead of Clerk's default modal. Call once per component,
 * pass `options` as the second argument to each useReverification() call,
 * and render `dialog` once alongside the rest of the screen. */
export function useReverificationPrompt() {
  const [pending, setPending] = useState<PendingVerification | null>(null);

  const onNeedsReverification = useCallback((params: PendingVerification) => {
    setPending(params);
  }, []);

  const dialog = pending ? (
    <ReverificationDialog
      level={pending.level}
      onVerified={() => {
        const { complete } = pending;
        setPending(null);
        complete();
      }}
      onCancel={() => {
        const { cancel } = pending;
        setPending(null);
        cancel();
      }}
    />
  ) : null;

  return { dialog, options: { onNeedsReverification } };
}
