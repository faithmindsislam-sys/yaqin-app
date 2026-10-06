import { getAccessToken } from "./supabase";

export { getAccessToken };
export const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
export const apiEnabled = process.env.NEXT_PUBLIC_API_ENABLED !== "false";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!apiEnabled) throw new ApiError(503, "backend_unavailable", "This feature is currently unavailable. Please try again later.");
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? "upstream", err.message ?? res.statusText);
  }
  return data as T;
}

