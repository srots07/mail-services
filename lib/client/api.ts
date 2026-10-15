"use client";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function csrfToken(): string {
  const match = document.cookie.split("; ").find((c) => c.startsWith("ecm_csrf="));
  return match ? decodeURIComponent(match.slice("ecm_csrf=".length)) : "";
}

export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRF-Token": csrfToken() } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", "NETWORK", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      // Full reload is intentional: an expired session must drop all client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
    throw new ApiError(err?.message ?? `Request failed (${res.status}).`, err?.code ?? "HTTP", res.status, err?.details);
  }
  return data as T;
}
