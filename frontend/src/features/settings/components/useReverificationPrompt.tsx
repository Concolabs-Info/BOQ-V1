"use client";

import { useCallback, useState } from "react";
import { ReverificationDialog } from "./ReverificationDialog";

type ReverificationLevel = "first_factor" | "second_factor" | "multi_factor";

type PendingVerification = {
  level: ReverificationLevel | undefined;
  complete: () => void;
  cancel: () => void;
};

/** State for one useReverification() call, so a sensitive Clerk action
 * prompts with our own dialog instead of Clerk's default modal. Call once
 * per sensitive action with a short phrase completing "so we can ..."
 * (e.g. "change your password"), pass `options` as the second argument to
 * that action's useReverification() call, and render `dialog` alongside the
 * rest of the screen. Give each sensitive action on a page its own call so
 * the dialog can explain specifically what it's confirming. */
export function useReverificationPrompt(reason: string) {
  const [pending, setPending] = useState<PendingVerification | null>(null);

  const onNeedsReverification = useCallback((params: PendingVerification) => {
    setPending(params);
  }, []);

  const dialog = pending ? (
    <ReverificationDialog
      level={pending.level}
      reason={reason}
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
