import type { GeocodeResult } from '@bce/shared';
import type { FetchLike } from '../brno-gis/arcgis-client';

/**
 * Nominatim geocoder (via backend proxy). Respects the public usage policy:
 * max 1 request/second (serialized queue), identifying User-Agent, results cached,
 * requests only on explicit user input (the frontend debounces and requires ≥3 chars).
 */
export class NominatimGeocoder {
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;
  private cache = new Map<string, { at: number; results: GeocodeResult[] }>();
  private readonly fetchFn: FetchLike;
  readonly attribution = 'Vyhledávání: Nominatim · data © OpenStreetMap přispěvatelé';

  constructor(private readonly baseUrl: string, private readonly userAgent: string, fetchFn?: FetchLike) {
    this.fetchFn = fetchFn ?? ((i, init) => fetch(i, init));
  }

  /** Serialised, rate-limited request (≥ 1.1 s apart) shared by search and reverse. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const wait = Math.max(0, this.last + 1100 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  /**
   * Short place name for a point (street, else place/suburb), used to name route points the user
   * placed on the map. Only called on explicit user action (placing or moving a point).
   */
  reverse(lat: number, lon: number): Promise<{ label: string }> {
    const key = `r:${lat.toFixed(5)},${lon.toFixed(5)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3.6e6) return Promise.resolve({ label: hit.results[0]?.label ?? '' });
    return this.enqueue(async () => {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '17', 'accept-language': 'cs' });
      const res = await this.fetchFn(`${this.baseUrl}/reverse?${params}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Geokodér vrátil HTTP ${res.status}`);
      const j = (await res.json()) as { name?: string; display_name?: string; address?: Record<string, string>; error?: string };
      if (j.error) return { label: '' };
      const a = j.address ?? {};
      const street = a.road ?? a.pedestrian ?? a.cycleway ?? a.footway ?? a.path;
      const area = a.suburb ?? a.city_district ?? a.quarter ?? a.neighbourhood ?? a.village ?? a.town ?? a.city;
      const label = street ? (area ? `${street}, ${area}` : street) : j.name || area || (j.display_name ?? '').split(',').slice(0, 2).join(',').trim();
      this.cache.set(key, { at: Date.now(), results: [{ id: key, label, lat, lon, type: 'reverse' }] });
      return { label };
    });
  }

  /**
   * Worldwide search, biased (not limited) to `viewbox` = [minLon, minLat, maxLon, maxLat] (the
   * visible map; Brno by default), results in `lang`.
   */
  search(q: string, opts: { viewbox?: [number, number, number, number]; lang?: 'cs' | 'en' } = {}): Promise<GeocodeResult[]> {
    const vb = opts.viewbox ?? [16.35, 49.05, 16.85, 49.35];
    const lang = opts.lang ?? 'cs';
    const key = `${lang}|${vb.map((v) => v.toFixed(1)).join(',')}|${q.trim().toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3.6e6) return Promise.resolve(hit.results);
    return this.enqueue(async () => {
      const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '8',
        viewbox: `${vb[0]},${vb[3]},${vb[2]},${vb[1]}`,
        bounded: '0',
        'accept-language': lang,
      });
      const res = await this.fetchFn(`${this.baseUrl}/search?${params}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Geokodér vrátil HTTP ${res.status}`);
      const arr = (await res.json()) as Array<Record<string, string | string[]>>;
      const results: GeocodeResult[] = arr.map((r) => {
        const bb = (r.boundingbox as string[] | undefined)?.map(Number);
        return {
          id: `${r.osm_type}/${r.osm_id}`,
          label: String(r.display_name),
          lat: Number(r.lat),
          lon: Number(r.lon),
          type: String(r.type ?? ''),
          bbox: bb && bb.length === 4 ? [bb[2], bb[0], bb[3], bb[1]] : undefined,
        };
      });
      this.cache.set(key, { at: Date.now(), results });
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
      return results;
    });
  }
}
