import type { AppConfig, GeocodeResult, InfrastructureResponse, RouteRequest, RouteResponse } from '@bce/shared';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(init?.timeoutMs ?? 90000) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'AbortError') throw e;
    throw new ApiError(name === 'TimeoutError' ? 'Server neodpověděl v časovém limitu.' : 'Nelze se spojit se serverem aplikace (API).', 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((body as { error?: string })?.error ?? `Chyba serveru (HTTP ${res.status}).`, res.status);
  return body as T;
}

export const api = {
  config: () => request<AppConfig>('/api/config', { timeoutMs: 15000 }),
  infrastructure: () => request<InfrastructureResponse>('/api/infrastructure'),
  refreshInfrastructure: () => request<InfrastructureResponse>('/api/infrastructure/refresh', { method: 'POST' }),
  importInfrastructure: (geojson: unknown) =>
    request<InfrastructureResponse>('/api/infrastructure/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geojson),
    }),
  route: (req: RouteRequest) =>
    request<RouteResponse>('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      timeoutMs: 120000,
    }),
  reverseGeocode: (lat: number, lon: number) =>
    request<{ label: string }>(`/api/geocode/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, { timeoutMs: 20000 }),
  geocode: (q: string, signal?: AbortSignal) =>
    request<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(q)}`, { signal }),
};
