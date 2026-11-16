import type { Logger } from '../../services/infrastructure-service';

export interface OverpassResult {
  elements: unknown[];
  /** OSM data timestamp reported by the server. */
  timestamp: string | null;
  /** Endpoint that answered. */
  url: string;
}

/**
 * Minimal Overpass API client. Tries each endpoint in order and returns the first good answer,
 * so a public instance that is down or blocks the server falls through to a mirror.
 */
export class OverpassClient {
  constructor(
    private readonly urls: string[],
    private readonly opts: { timeoutMs: number; userAgent: string; log?: Logger; fetch?: typeof fetch },
  ) {}

  get available() {
    return this.urls.length > 0;
  }

  async query(ql: string): Promise<OverpassResult> {
    const f = this.opts.fetch ?? fetch;
    const errors: string[] = [];
    for (const url of this.urls) {
      try {
        const res = await f(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.opts.userAgent, Accept: 'application/json' },
          body: new URLSearchParams({ data: ql }).toString(),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { elements?: unknown[]; osm3s?: { timestamp_osm_base?: string }; remark?: string };
        if (!Array.isArray(json.elements)) throw new Error('neplatná odpověď');
        // Overpass reports a query timeout/out-of-memory as a 200 with a "remark" and partial data
        if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
        return { elements: json.elements, timestamp: json.osm3s?.timestamp_osm_base ?? null, url };
      } catch (e) {
        const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'časový limit' : e.message) : String(e);
        errors.push(`${new URL(url).host}: ${msg}`);
        this.opts.log?.warn({ url, err: msg }, 'Overpass endpoint failed');
      }
    }
    throw new Error(`Služba Overpass (OpenStreetMap) není dostupná – ${errors.join('; ')}`);
  }
}

/** Overpass QL for all `highway=steps` ways in a bbox, with node ids and geometry. */
export function stairsQuery([minLon, minLat, maxLon, maxLat]: [number, number, number, number], timeoutS = 60): string {
  return `[out:json][timeout:${timeoutS}];way["highway"="steps"](${minLat},${minLon},${maxLat},${maxLon});out body geom;`;
}
