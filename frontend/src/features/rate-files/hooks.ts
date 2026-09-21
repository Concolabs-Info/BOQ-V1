"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRateFile, createRateItem, createRateOption, deleteRateFile, deleteRateItem, listRateFiles, listRateItems, listRateOptions, updateRateFile, updateRateItem } from "./api";
import type { RateItemInput, RateOptionType } from "./types";

export const rateFileKeys = {
  all: (projectId: string) => ["rate-files", projectId] as const,
  items: (projectId: string, rateFileId: string | null, search: string) => ["rate-files", projectId, rateFileId, "items", search] as const,
  options: (projectId: string) => ["rate-files", projectId, "options"] as const,
};

export function useRateFiles(projectId: string) {
  return useQuery({
    queryKey: rateFileKeys.all(projectId),
    queryFn: () => listRateFiles(projectId),
  });
}

export function useRateItems(projectId: string, rateFileId: string | null, search: string) {
  return useQuery({
    queryKey: rateFileKeys.items(projectId, rateFileId, search),
    queryFn: () => rateFileId ? listRateItems(projectId, rateFileId, search) : Promise.resolve([]),
    enabled: Boolean(rateFileId),
  });
}

export function useRateOptions(projectId: string) {
  return useQuery({
    queryKey: rateFileKeys.options(projectId),
    queryFn: () => listRateOptions(projectId),
  });
}

export function useRateFileMutations(projectId: string, rateFileId: string | null, search: string) {
  const client = useQueryClient();
  const invalidateFiles = () => client.invalidateQueries({ queryKey: rateFileKeys.all(projectId) });
  const invalidateItems = () => client.invalidateQueries({ queryKey: rateFileKeys.items(projectId, rateFileId, search) });

  return {
    createFile: useMutation({ mutationFn: (name: string) => createRateFile(projectId, name), onSuccess: invalidateFiles }),
    updateFile: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => updateRateFile(projectId, id, name), onSuccess: invalidateFiles }),
    deleteFile: useMutation({ mutationFn: (id: string) => deleteRateFile(projectId, id), onSuccess: invalidateFiles }),
    createItem: useMutation({ mutationFn: (payload: RateItemInput) => rateFileId ? createRateItem(projectId, rateFileId, payload) : Promise.reject(new Error("Select a rate file first.")), onSuccess: async () => { await invalidateFiles(); await invalidateItems(); } }),
    updateItem: useMutation({ mutationFn: ({ id, payload }: { id: string; payload: RateItemInput }) => rateFileId ? updateRateItem(projectId, rateFileId, id, payload) : Promise.reject(new Error("Select a rate file first.")), onSuccess: invalidateItems }),
    deleteItem: useMutation({ mutationFn: (id: string) => rateFileId ? deleteRateItem(projectId, rateFileId, id) : Promise.reject(new Error("Select a rate file first.")), onSuccess: async () => { await invalidateFiles(); await invalidateItems(); } }),
    createOption: useMutation({
      mutationFn: ({ optionType, value }: { optionType: RateOptionType; value: string }) => createRateOption(projectId, optionType, value),
      onSuccess: () => client.invalidateQueries({ queryKey: rateFileKeys.options(projectId) }),
    }),
  };
}
