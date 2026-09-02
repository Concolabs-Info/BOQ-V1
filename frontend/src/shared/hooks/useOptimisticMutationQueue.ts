"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

type Invalidation = {
  queryKey: QueryKey;
  refetchType?: "active" | "inactive" | "all" | "none";
};

type QueuedMutation<TData> = {
  queryKey: QueryKey;
  mutation: () => Promise<unknown>;
  optimistic?: (current: TData) => TData;
  invalidations?: Invalidation[];
  errorMessage: string;
  onError?: (message: string) => void;
};

function safeMessage(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback;
  const message = reason.message.trim();
  return message && !/https?:|api[_-]?key|traceback|exception/i.test(message) ? message : fallback;
}

/**
 * Applies local changes immediately while serialising server writes. This
 * keeps editors responsive and avoids concurrent SQLite writes. Only the last
 * queued mutation refetches affected data, so intermediate server responses
 * cannot reintroduce items that are still waiting to be saved.
 */
export function useOptimisticMutationQueue() {
  const client = useQueryClient();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const invalidations = useRef(new Map<string, Invalidation>());
  const [pendingCount, setPendingCount] = useState(0);

  const enqueue = useCallback(<TData,>(options: QueuedMutation<TData>): Promise<boolean> => {
    const current = client.getQueryData<TData>(options.queryKey);
    if (current && options.optimistic) {
      void client.cancelQueries({ queryKey: options.queryKey });
      client.setQueryData<TData>(options.queryKey, options.optimistic(current));
    }
    const refreshes = [
      { queryKey: options.queryKey, refetchType: "active" as const },
      ...(options.invalidations || []),
    ];
    for (const item of refreshes) invalidations.current.set(JSON.stringify(item.queryKey), item);
    setPendingCount((count) => count + 1);

    let resolveResult: (saved: boolean) => void = () => undefined;
    const result = new Promise<boolean>((resolve) => { resolveResult = resolve; });
    let queued: Promise<void>;
    queued = queue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await options.mutation();
          resolveResult(true);
        } catch (reason) {
          const message = safeMessage(reason, options.errorMessage);
          options.onError?.(message);
          resolveResult(false);
        }
      })
      .finally(() => {
        setPendingCount((count) => Math.max(0, count - 1));
        if (queue.current !== queued) return;
        const pending = [...invalidations.current.values()];
        invalidations.current.clear();
        for (const item of pending) {
          void client.invalidateQueries({ queryKey: item.queryKey, refetchType: item.refetchType || "none" });
        }
      });
    queue.current = queued;
    return result;
  }, [client]);

  return { enqueue, pendingCount, saving: pendingCount > 0 };
}
