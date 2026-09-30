"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNormItem, createNormOption, deleteNormItem, listNormItems, listNormOptions, updateNormItem } from "./api";
import type { NormCompositionInput, NormOptionType } from "./types";

export const normKeys = {
  items: (projectId: string) => ["norms", projectId, "items"] as const,
  options: (projectId: string) => ["norms", projectId, "options"] as const,
};

export function useNormItems(projectId: string) {
  return useQuery({ queryKey: normKeys.items(projectId), queryFn: () => listNormItems(projectId) });
}

export function useNormOptions(projectId: string) {
  return useQuery({ queryKey: normKeys.options(projectId), queryFn: () => listNormOptions(projectId) });
}

export function useNormMutations(projectId: string) {
  const client = useQueryClient();
  const invalidateItems = () => client.invalidateQueries({ queryKey: normKeys.items(projectId) });
  const invalidateOptions = () => client.invalidateQueries({ queryKey: normKeys.options(projectId) });
  return {
    createItem: useMutation({ mutationFn: (payload: NormCompositionInput) => createNormItem(projectId, payload), onSuccess: invalidateItems }),
    updateItem: useMutation({ mutationFn: ({ id, payload }: { id: string; payload: NormCompositionInput }) => updateNormItem(projectId, id, payload), onSuccess: invalidateItems }),
    deleteItem: useMutation({ mutationFn: (id: string) => deleteNormItem(projectId, id), onSuccess: invalidateItems }),
    createOption: useMutation({
      mutationFn: ({ optionType, value }: { optionType: NormOptionType; value: string }) => createNormOption(projectId, optionType, value),
      onSuccess: invalidateOptions,
    }),
  };
}
