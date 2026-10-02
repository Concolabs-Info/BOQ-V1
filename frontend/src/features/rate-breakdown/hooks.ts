"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRateBreakdownItem, deleteRateBreakdownItem, listRateBreakdownItems, updateRateBreakdownItem } from "./api";
import type { RateBreakdownItemInput } from "./types";

export const rateBreakdownKeys = {
  items: (projectId: string) => ["rate-breakdown", projectId, "items"] as const,
};

export function useRateBreakdownItems(projectId: string) {
  return useQuery({ queryKey: rateBreakdownKeys.items(projectId), queryFn: () => listRateBreakdownItems(projectId) });
}

export function useRateBreakdownMutations(projectId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: rateBreakdownKeys.items(projectId) });
  return {
    createItem: useMutation({ mutationFn: (payload: RateBreakdownItemInput) => createRateBreakdownItem(projectId, payload), onSuccess: invalidate }),
    updateItem: useMutation({ mutationFn: ({ id, payload }: { id: string; payload: RateBreakdownItemInput }) => updateRateBreakdownItem(projectId, id, payload), onSuccess: invalidate }),
    deleteItem: useMutation({ mutationFn: (id: string) => deleteRateBreakdownItem(projectId, id), onSuccess: invalidate }),
  };
}
