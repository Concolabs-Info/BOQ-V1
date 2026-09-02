"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFloorPlanDocumentPages } from "../api";

export const DOCUMENT_PAGE_BATCH_SIZE = 24;

function batchOffset(pageNumber: number, limit: number) {
  const index = Math.max(0, Math.floor(Number(pageNumber || 1)) - 1);
  return Math.floor(index / limit) * limit;
}

export function useDocumentPages(
  projectId: string,
  documentId: string | null | undefined,
  preferredPageNumber = 1,
  pollWhilePreparing = false,
) {
  const limit = DOCUMENT_PAGE_BATCH_SIZE;
  const [offset, setOffset] = useState(() => batchOffset(preferredPageNumber, limit));

  useEffect(() => {
    setOffset(batchOffset(preferredPageNumber, limit));
  }, [documentId, limit, preferredPageNumber]);

  const query = useQuery({
    queryKey: ["floor-plan-document-pages", projectId, documentId, offset, limit],
    queryFn: () => getFloorPlanDocumentPages(projectId, documentId!, offset, limit),
    enabled: Boolean(documentId),
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Refresh page asset URLs while the document worker is still preparing
    // thumbnails/previews, even when metadata rows already exist.
    refetchInterval: pollWhilePreparing ? 5_000 : false,
    refetchIntervalInBackground: false,
  });

  const total = query.data?.total ?? 0;
  return {
    pages: query.data?.items ?? [],
    total,
    offset,
    limit,
    hasPrevious: offset > 0,
    hasNext: Boolean(query.data?.has_more),
    isLoading: query.isPending || query.isFetching,
    error: query.error,
    refetch: query.refetch,
    previous: () => setOffset((current) => Math.max(0, current - limit)),
    next: () => setOffset((current) => current + limit),
  };
}
