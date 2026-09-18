import { bearerHeader } from "./bearerHeader";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const CACHE_PREFIX = "cpe_cache:";

export type ApiErrorDetails = {
  code?: string;
  message?: string;
  field?: string;
  existing_company?: { id: string; name: string; domain?: string | null };
};

export class ApiRequestError extends Error {
  status: number;
  rawMessage?: string;
  details?: ApiErrorDetails;

  constructor(status: number, message: string, rawMessage?: string, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.rawMessage = rawMessage;
    this.details = details;
  }
}

export function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

type SessionTokenGetter = () => Promise<string | null>;
let sessionTokenGetter: SessionTokenGetter | null = null;

export function setSessionTokenGetter(getter: SessionTokenGetter | null): void {
  sessionTokenGetter = getter;
}

export async function apiRequestHeaders(): Promise<Record<string, string>> {
  const token = sessionTokenGetter ? await sessionTokenGetter() : null;
  return bearerHeader(token);
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.sessionStorage);
}

function cacheKey(path: string): string {
  return `${CACHE_PREFIX}${path}`;
}

export function getCachedJson<T>(path: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(path));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setCachedJson<T>(path: string, value: T): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(cacheKey(path), JSON.stringify(value));
  } catch {
    // cache is only used to keep the UI instant
  }
}

export function clearAllCachedJson(): void {
  if (!canUseStorage()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // cache is only used to keep the UI instant
  }
}

export function removeCachedJson(path: string): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(cacheKey(path));
  } catch {
    // ignore cache failures
  }
}

function requestCanUseCache(path: string, options?: RequestInit): boolean {
  const method = (options?.method || "GET").toUpperCase();
  return method === "GET" && !options?.body && !path.startsWith("http");
}

export function userFacingApiError(status: number, rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  if (status === 401 || lower.includes("authentication") || lower.includes("unauthorized")) {
    return "Please sign in again.";
  }
  if (status === 403) return "This project is not available for this account.";
  if (status === 404 || lower.includes("not found")) return "This project data is not available.";
  if (status >= 500) return "Something went wrong. Please try again.";

  if (
    lower.includes("traceback") ||
    lower.includes("http") ||
    lower.includes("invalid document type") ||
    lower.includes("request failed")
  ) {
    return "This action could not be completed.";
  }

  return rawMessage || "This action could not be completed.";
}

async function readErrorPayload(response: Response): Promise<{ message: string; details?: ApiErrorDetails }> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") return { message: payload.detail };
    if (payload?.detail && typeof payload.detail === "object" && !Array.isArray(payload.detail)) {
      const detail = payload.detail as ApiErrorDetails;
      return { message: detail.message || response.statusText || "Request failed.", details: detail };
    }
    if (typeof payload?.message === "string") return { message: payload.message };
  } catch {
    // use status text below
  }
  return { message: response.statusText || "Request failed." };
}

function downloadFileName(response: Response, fallbackFileName: string): string {
  const disposition = response.headers.get("Content-Disposition") || "";
  const encodedName = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1]
    || disposition.match(/filename\s*=\s*([^;]+)/i)?.[1];

  let fileName = plainName?.trim().replace(/^['"]|['"]$/g, "") || fallbackFileName;
  if (encodedName) {
    try {
      fileName = decodeURIComponent(encodedName.trim().replace(/^['"]|['"]$/g, ""));
    } catch {
      // Keep the regular filename or fallback when the header is malformed.
    }
  }

  // Content-Disposition is server-controlled, but still prevent path/control characters
  // from becoming part of the local download name.
  return fileName.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() || fallbackFileName;
}

export async function downloadApiFile(path: string, fallbackFileName: string): Promise<void> {
  try {
    const response = await fetch(apiUrl(path), {
      method: "GET",
      headers: await apiRequestHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const { message: rawMessage, details } = await readErrorPayload(response);
      throw new ApiRequestError(response.status, userFacingApiError(response.status, rawMessage), rawMessage, details);
    }

    const blob = await response.blob();
    if (!blob.size) throw new ApiRequestError(0, "The downloaded file was empty.");
    if (typeof document === "undefined") throw new ApiRequestError(0, "The file can only be downloaded in the browser.");

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = downloadFileName(response, fallbackFileName);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(0, "Something went wrong. Please try again.", error instanceof Error ? error.message : undefined);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

type JsonRequestOptions = RequestInit & { skipCache?: boolean };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce<T>(path: string, fetchOptions: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; rawMessage: string; details?: ApiErrorDetails }> {
  const response = await fetch(apiUrl(path), {
    ...fetchOptions,
    headers: {
      ...(fetchOptions.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(await apiRequestHeaders()),
      ...(fetchOptions.headers || {}),
    },
  });

  if (!response.ok) {
    const { message: rawMessage, details } = await readErrorPayload(response);
    return { ok: false, status: response.status, rawMessage, details };
  }
  return { ok: true, data: await readResponse<T>(response) };
}

export async function requestJson<T>(path: string, options?: JsonRequestOptions): Promise<T> {
  const skipCache = options?.skipCache === true;
  const fetchOptions: RequestInit = { ...options };
  delete (fetchOptions as JsonRequestOptions).skipCache;
  const useCache = !skipCache && requestCanUseCache(path, fetchOptions);

  try {
    let result = await fetchOnce<T>(path, fetchOptions);
    // A 401 right after signing in can be a real "your session is gone", or
    // it can be this request racing ahead of Clerk finishing its bootstrap
    // on a fresh page load (setActive() is immediately followed by a full
    // reload elsewhere in the app, which throws away the in-memory Clerk
    // client and forces it to re-hydrate from scratch). One short retry
    // tells the two apart without making a genuinely signed-out user wait.
    if (!result.ok && result.status === 401) {
      await delay(400);
      result = await fetchOnce<T>(path, fetchOptions);
    }

    if (!result.ok) {
      const cached = useCache ? getCachedJson<T>(path) : null;
      if (cached) return cached;
      throw new ApiRequestError(result.status, userFacingApiError(result.status, result.rawMessage), result.rawMessage, result.details);
    }

    if (useCache) setCachedJson(path, result.data);
    return result.data;
  } catch (error) {
    const cached = useCache ? getCachedJson<T>(path) : null;
    if (cached) return cached;
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(0, "Something went wrong. Please try again.", error instanceof Error ? error.message : undefined);
  }
}
