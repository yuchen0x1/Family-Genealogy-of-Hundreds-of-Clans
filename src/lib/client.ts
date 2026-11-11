"use client";

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const message = json?.error?.message || `请求失败 (${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string; details?: unknown };
    err.status = res.status;
    err.code = json?.error?.code;
    err.details = json?.error?.details;
    throw err;
  }
  return json.data as T;
}

export async function apiRequest<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: options.formData ? undefined : { "Content-Type": "application/json" },
    body: options.formData ? options.formData : options.body === undefined ? undefined : JSON.stringify(options.body),
  };
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = new Error(json?.error?.message || `请求失败 (${res.status})`) as Error & { status?: number; code?: string; details?: unknown };
    err.status = res.status;
    err.code = json?.error?.code;
    err.details = json?.error?.details;
    throw err;
  }
  return json.data as T;
}

export type MeResponse = {
  authenticated: boolean;
  user: null | {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    roles: string[];
    stats: { familyCount: number; collaboratorCount: number; documentCount: number };
  };
};
