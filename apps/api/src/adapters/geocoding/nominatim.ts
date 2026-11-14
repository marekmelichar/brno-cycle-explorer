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

  search(q: string): Promise<GeocodeResult[]> {
    const key = q.trim().toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3.6e6) return Promise.resolve(hit.results);
    const task = this.queue.then(async () => {
      const wait = Math.max(0, this.last + 1100 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '8',
        countrycodes: 'cz',
        viewbox: '16.35,49.35,16.85,49.05',
        bounded: '0',
        'accept-language': 'cs',
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
    this.queue = task.catch(() => undefined);
    return task;
  }
}
