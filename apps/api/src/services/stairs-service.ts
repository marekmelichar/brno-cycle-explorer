import type { Stair, StairsMeta, StairsResponse } from '@bce/shared';
import { stairsFromOverpass } from '@bce/geo';
import { OverpassClient, stairsQuery } from '../adapters/osm/overpass-client';
import { FileCache } from '../cache/file-cache';
import type { Logger } from './infrastructure-service';

interface CachedStairs {
  meta: Omit<StairsMeta, 'refreshing' | 'lastError'>;
  stairs: Stair[];
}

/**
 * Staircases (OSM highway=steps) for the configured area, downloaded from Overpass, kept in
 * memory and in the file cache. Stairs change rarely, so it refreshes every few days. A failed
 * download never replaces good data; it is only reported in `lastError`.
 */
export class StairsService {
  private current: CachedStairs | null = null;
  private refreshPromise: Promise<CachedStairs> | null = null;
  private lastError: StairsMeta['lastError'] = null;

  constructor(
    private readonly client: OverpassClient,
    private readonly cache: FileCache<CachedStairs>,
    private readonly bbox: [number, number, number, number],
    private readonly log: Logger,
  ) {}

  get available() {
    return this.client.available;
  }

  async init(refreshIfOlderThanDays: number): Promise<void> {
    if (!this.available) return;
    const cached = await this.cache.read();
    if (cached?.stairs) {
      this.current = cached;
      this.log.info({ stairs: cached.stairs.length, lastRefreshed: cached.meta.lastRefreshed }, 'Loaded stairs from cache');
    }
    this.refreshIfStale(refreshIfOlderThanDays);
  }

  /** Starts a background refresh when the data is missing or older than the given age. */
  refreshIfStale(olderThanDays: number): void {
    if (!this.available) return;
    const last = this.current?.meta.lastRefreshed;
    const ageDays = last ? (Date.now() - Date.parse(last)) / 8.64e7 : Infinity;
    if (ageDays > olderThanDays) this.refresh().catch(() => undefined); // errors are recorded in lastError
  }

  getMeta(): StairsMeta {
    const base = this.current?.meta ?? { source: 'none' as const, sourceUrl: null, count: 0, lastRefreshed: null, osmTimestamp: null };
    return { ...base, lastError: this.lastError, refreshing: this.refreshPromise !== null };
  }

  get(): StairsResponse {
    return { meta: this.getMeta(), stairs: this.current?.stairs ?? [] };
  }

  /** Waits (bounded) for an in-flight first download, so the first visitor usually gets data. */
  async waitForData(timeoutMs: number): Promise<void> {
    if (this.current || !this.refreshPromise) return;
    await Promise.race([this.refreshPromise.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  refresh(): Promise<CachedStairs> {
    if (this.refreshPromise) return this.refreshPromise;
    const started = Date.now();
    this.refreshPromise = (async () => {
      try {
        const res = await this.client.query(stairsQuery(this.bbox));
        const stairs = stairsFromOverpass(res.elements);
        if (!stairs.length) throw new Error('Overpass nevrátil v zadané oblasti žádné schody.');
        const data: CachedStairs = {
          meta: { source: 'overpass', sourceUrl: res.url, count: stairs.length, lastRefreshed: new Date().toISOString(), osmTimestamp: res.timestamp },
          stairs,
        };
        this.current = data;
        this.lastError = null;
        await this.cache.write(data).catch((e) => this.log.warn({ err: String(e) }, 'Could not write stairs cache'));
        this.log.info({ stairs: stairs.length, ways: res.elements.length, ms: Date.now() - started }, 'Stairs refreshed');
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = { message, at: new Date().toISOString() };
        this.log.error({ err: message }, 'Stairs refresh failed');
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }
}
