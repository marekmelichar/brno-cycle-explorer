import type { Stair, StairsMeta, StairsResponse } from '@bce/shared';
import { stairsFromOverpass } from '@bce/geo';
import { OverpassClient, stairsQuery } from '../adapters/osm/overpass-client';
import { FileCache } from '../cache/file-cache';
import type { Logger } from './infrastructure-service';

interface CachedStairs {
  meta: Omit<StairsMeta, 'refreshing' | 'lastError' | 'nextRetryAt'>;
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
  private retryTimer: NodeJS.Timeout | null = null;
  private retryAt: number | null = null;
  private failures = 0;

  /**
   * @param retryDelaysMs Backoff for retries while there is NO data yet (public Overpass instances
   *   are often briefly overloaded). The last delay repeats. With data, the regular refresh applies.
   */
  constructor(
    private readonly client: OverpassClient,
    private readonly cache: FileCache<CachedStairs>,
    private readonly bbox: [number, number, number, number],
    private readonly log: Logger,
    private readonly retryDelaysMs: number[] = [5, 10, 20, 40, 60].map((m) => m * 60_000),
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

  /** Retry with backoff while there is no data; a later success or manual refresh supersedes it. */
  private scheduleRetry() {
    if (this.retryTimer || !this.retryDelaysMs.length) return;
    const delay = this.retryDelaysMs[Math.min(this.failures, this.retryDelaysMs.length - 1)];
    this.failures++;
    this.retryAt = Date.now() + delay;
    this.log.info({ inMinutes: Math.round(delay / 60000), attempt: this.failures }, 'Stairs: retry scheduled');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryAt = null;
      this.refresh().catch(() => undefined);
    }, delay);
    this.retryTimer.unref?.();
  }

  /** Stops a pending retry (tests, shutdown). */
  dispose() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryAt = null;
  }

  getMeta(): StairsMeta {
    const base = this.current?.meta ?? { source: 'none' as const, sourceUrl: null, count: 0, lastRefreshed: null, osmTimestamp: null };
    return {
      ...base,
      lastError: this.lastError,
      refreshing: this.refreshPromise !== null,
      nextRetryAt: this.retryAt ? new Date(this.retryAt).toISOString() : null,
    };
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
        this.failures = 0;
        await this.cache.write(data).catch((e) => this.log.warn({ err: String(e) }, 'Could not write stairs cache'));
        this.log.info({ stairs: stairs.length, ways: res.elements.length, ms: Date.now() - started }, 'Stairs refreshed');
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = { message, at: new Date().toISOString() };
        this.log.error({ err: message }, 'Stairs refresh failed');
        if (!this.current) this.scheduleRetry();
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }
}
