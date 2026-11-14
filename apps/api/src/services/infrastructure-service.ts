import type { DatasetMeta, InfraFeatureCollection, InfrastructureResponse } from '@bce/shared';
import { normalizeInfrastructure } from '@bce/geo';
import { ArcGisClient } from '../adapters/brno-gis/arcgis-client';
import { FileCache } from '../cache/file-cache';

interface CachedDataset {
  meta: Omit<DatasetMeta, 'refreshing'>;
  data: InfraFeatureCollection;
}

export interface Logger {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
}

/**
 * Holds the infrastructure dataset in memory, persists it to the file cache and refreshes
 * it from the official ArcGIS service. A failed refresh NEVER replaces the last good data
 * and never produces substitute data – it only records `lastError`.
 */
export class InfrastructureService {
  private current: CachedDataset | null = null;
  private refreshPromise: Promise<CachedDataset> | null = null;
  private lastError: { message: string; at: string } | null = null;

  constructor(
    private readonly client: ArcGisClient,
    private readonly cache: FileCache<CachedDataset>,
    private readonly sourceUrl: string,
    private readonly log: Logger,
  ) {}

  async init(refreshIfOlderThanHours: number): Promise<void> {
    const cached = await this.cache.read();
    if (cached?.data?.features) {
      this.current = cached;
      this.log.info({ features: cached.data.features.length, lastRefreshed: cached.meta.lastRefreshed }, 'Loaded infrastructure from cache');
    }
    const age = cached?.meta.lastRefreshed ? (Date.now() - Date.parse(cached.meta.lastRefreshed)) / 3.6e6 : Infinity;
    if (!cached || cached.meta.source !== 'official' || age > refreshIfOlderThanHours) {
      this.refresh().catch(() => undefined); // errors are recorded in lastError
    }
  }

  get refreshing() {
    return this.refreshPromise !== null;
  }

  getMeta(): DatasetMeta {
    const base: Omit<DatasetMeta, 'refreshing'> = this.current?.meta ?? {
      source: 'none',
      sourceUrl: this.sourceUrl,
      layerName: null,
      featureCount: 0,
      expectedCount: null,
      lastRefreshed: null,
      latestExportDate: null,
      lastError: null,
      schemaWarnings: [],
      distinctTypes: [],
    };
    return { ...base, lastError: this.lastError ?? base.lastError, refreshing: this.refreshing };
  }

  get(): InfrastructureResponse {
    return { meta: this.getMeta(), data: this.current?.data ?? { type: 'FeatureCollection', features: [] } };
  }

  /** Waits for an in-flight initial download (used by GET when there is no data yet). */
  async waitForData(timeoutMs: number): Promise<void> {
    if (this.current || !this.refreshPromise) return;
    await Promise.race([this.refreshPromise.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  refresh(): Promise<CachedDataset> {
    if (this.refreshPromise) return this.refreshPromise;
    const started = Date.now();
    this.refreshPromise = (async () => {
      try {
        const res = await this.client.fetchAll();
        const norm = normalizeInfrastructure(res.featureCollection, 'official');
        const expectedFields = ['typ_opatreni', 'rok_realizace', 'delka', 'datum_exportu'];
        const missing = expectedFields.filter((f) => !res.metadata.fields.some((x) => x.name === f));
        const schemaWarnings = [...res.warnings, ...norm.warnings];
        if (missing.length) schemaWarnings.push(`Metadata vrstvy neobsahují pole: ${missing.join(', ')}`);
        if (norm.features.length === 0) throw new Error('Služba nevrátila žádné platné prvky.');
        const ds: CachedDataset = {
          meta: {
            source: 'official',
            sourceUrl: this.sourceUrl,
            layerName: res.metadata.name,
            featureCount: norm.features.length,
            expectedCount: res.expectedCount,
            lastRefreshed: new Date().toISOString(),
            latestExportDate: norm.latestExportDate,
            lastError: null,
            schemaWarnings,
            distinctTypes: norm.distinctTypes,
          },
          data: { type: 'FeatureCollection', features: norm.features },
        };
        this.current = ds;
        this.lastError = null;
        await this.cache.write(ds).catch((e) => this.log.warn({ err: String(e) }, 'Could not write cache'));
        this.log.info({ features: norm.features.length, ms: Date.now() - started }, 'Infrastructure refreshed');
        return ds;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = { message, at: new Date().toISOString() };
        this.log.error({ err: message }, 'Infrastructure refresh failed');
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  /** Manual GeoJSON import (fallback when the official service is unavailable). */
  async importGeoJson(raw: unknown): Promise<CachedDataset> {
    const norm = normalizeInfrastructure(raw, 'imported');
    if (norm.features.length === 0) throw new Error('Importovaný soubor neobsahuje žádné liniové prvky.');
    const ds: CachedDataset = {
      meta: {
        source: 'imported',
        sourceUrl: 'Ruční import GeoJSON',
        layerName: null,
        featureCount: norm.features.length,
        expectedCount: null,
        lastRefreshed: new Date().toISOString(),
        latestExportDate: norm.latestExportDate,
        lastError: null,
        schemaWarnings: norm.warnings,
        distinctTypes: norm.distinctTypes,
      },
      data: { type: 'FeatureCollection', features: norm.features },
    };
    this.current = ds;
    await this.cache.write(ds).catch(() => undefined);
    return ds;
  }
}
