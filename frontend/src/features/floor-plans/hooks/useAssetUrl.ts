"use client";

import { useEffect, useState } from "react";
import { apiRequestHeaders, apiUrl } from "@/shared/services/apiClient";

type AssetEntry = { url: string; lastUsed: number };

const MAX_CACHED_ASSETS = 48;
const assetUrls = new Map<string, AssetEntry>();
const assetRequests = new Map<string, Promise<string | null>>();
const assetConsumers = new Map<string, number>();

function cachedAsset(path: string): string | null {
  const entry = assetUrls.get(path);
  if (!entry) return null;
  entry.lastUsed = Date.now();
  return entry.url;
}

function trimAssetCache() {
  if (assetUrls.size <= MAX_CACHED_ASSETS) return;
  const removable = [...assetUrls.entries()]
    .filter(([path]) => !assetConsumers.get(path))
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
  while (assetUrls.size > MAX_CACHED_ASSETS && removable.length) {
    const [path, entry] = removable.shift()!;
    assetUrls.delete(path);
    URL.revokeObjectURL(entry.url);
  }
}

function loadAsset(path: string): Promise<string | null> {
  const saved = cachedAsset(path);
  if (saved) return Promise.resolve(saved);
  const pending = assetRequests.get(path);
  if (pending) return pending;
  const request = apiRequestHeaders().then((headers) => fetch(apiUrl(path), { headers, cache: "force-cache" }))
    .then(async (response) => {
      if (!response.ok) throw new Error("Asset unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      assetUrls.set(path, { url, lastUsed: Date.now() });
      trimAssetCache();
      return url;
    })
    .catch(() => null)
    .finally(() => assetRequests.delete(path));
  assetRequests.set(path, request);
  return request;
}

/** Starts downloading a drawing before the destination page is opened. */
export function preloadAsset(path: string | null | undefined): Promise<string | null> {
  return path ? loadAsset(path) : Promise.resolve(null);
}

/** Removes a stale in-memory asset after a crop or drawing revision is replaced. */
export function invalidateAsset(path?: string | null) {
  const paths = path ? [path] : [...assetUrls.keys()];
  for (const item of paths) {
    const entry = assetUrls.get(item);
    if (entry) URL.revokeObjectURL(entry.url);
    assetUrls.delete(item);
    assetRequests.delete(item);
  }
}

export function useAssetUrl(path: string | null | undefined, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(() => path ? cachedAsset(path) : null);

  useEffect(() => {
    let active = true;
    if (!path || !enabled) { setUrl(path ? cachedAsset(path) : null); return () => undefined; }
    assetConsumers.set(path, (assetConsumers.get(path) || 0) + 1);
    const saved = cachedAsset(path);
    if (saved) setUrl(saved);
    else void loadAsset(path).then((next) => { if (active) setUrl(next); });
    return () => {
      active = false;
      const remaining = (assetConsumers.get(path) || 1) - 1;
      if (remaining > 0) assetConsumers.set(path, remaining);
      else assetConsumers.delete(path);
      trimAssetCache();
    };
  }, [enabled, path]);

  return url;
}
