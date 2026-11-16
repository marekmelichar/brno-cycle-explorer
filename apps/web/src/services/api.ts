import type { AppConfig, GeocodeResult, InfrastructureResponse, RouteRequest, RouteResponse, StairsResponse } from '@bce/shared';

import type { TFunction } from 'i18next';
import { currentLang } from '../i18n';

/** Server/network error. `message` is the server's Czech text; `code`/`detail` let other languages translate it. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly detail?: string) {
    super(message);
  }
}

/** Error text in the UI language: Czech uses the server's detailed message, English the translated code (+ upstream detail). */
export function apiErrorText(e: unknown, t: TFunction): string {
  if (e instanceof ApiError) {
    if (currentLang() === 'cs' || !e.code) return e.message;
    const base = t(`apiErrors.${e.code}`, { defaultValue: e.message });
    return e.detail && !base.endsWith('.') ? `${base}: ${e.detail}` : base;
  }
  return e instanceof Error ? e.message : String(e);
}

async function request<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(init?.timeoutMs ?? 90000) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'AbortError') throw e;
    throw new ApiError(name === 'TimeoutError' ? 'Server neodpověděl v časovém limitu.' : 'Nelze se spojit se serverem aplikace (API).', 0, name === 'TimeoutError' ? 'timeout' : 'network');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; code?: string; detail?: string };
    throw new ApiError(b.error ?? `Chyba serveru (HTTP ${res.status}).`, res.status, b.code ?? 'server_error', b.detail);
  }
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
  stairs: () => request<StairsResponse>('/api/stairs', { timeoutMs: 30000 }),
  reverseGeocode: (lat: number, lon: number) =>
    request<{ label: string }>(`/api/geocode/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, { timeoutMs: 20000 }),
  /** viewbox = [minLon, minLat, maxLon, maxLat] of the visible map: results nearby rank first (search is worldwide). */
  geocode: (q: string, signal?: AbortSignal, viewbox?: [number, number, number, number]) =>
    request<{ results: GeocodeResult[] }>(
      `/api/geocode?q=${encodeURIComponent(q)}&lang=${currentLang()}${viewbox ? `&viewbox=${viewbox.map((v) => v.toFixed(4)).join(',')}` : ''}`,
      { signal },
    ),
};
