import { API_BASE_URL } from "../../shared/config.js";
import { clearStoredAuth, getStoredAuth, setStoredAuth } from "./tokenStore.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function refreshAccessToken(): Promise<string> {
  const auth = await getStoredAuth();
  if (!auth) throw new ApiError(401, "unauthorized", "not signed in");

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });

  if (!res.ok) {
    await clearStoredAuth();
    throw new ApiError(res.status, "unauthorized", "session expired, please sign in again");
  }

  const data = (await res.json()) as { accessToken: string };
  await setStoredAuth({ ...auth, accessToken: data.accessToken });
  return data.accessToken;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
  const auth = await getStoredAuth();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (auth) headers.set("Authorization", `Bearer ${auth.accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && auth && allowRetry) {
    await refreshAccessToken();
    return apiFetch<T>(path, init, false);
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new ApiError(429, "rate_limited", `Too many requests — try again in ${retryAfter ?? "a moment"}s.`);
  }

  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? `request failed with status ${res.status}`);
  }

  return body as T;
}
