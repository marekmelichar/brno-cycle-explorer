import type { DataWarning } from '@bce/shared';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ArcGisLayerMetadata {
  name: string;
  geometryType: string;
  maxRecordCount: number;
  supportedQueryFormats: string;
  fields: Array<{ name: string; type: string }>;
  objectIdField: string;
}

export interface ArcGisFetchResult {
  metadata: ArcGisLayerMetadata;
  expectedCount: number;
  featureCollection: { type: 'FeatureCollection'; features: unknown[] };
  warnings: DataWarning[];
}

export class ArcGisError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

export interface ArcGisClientOptions {
  layerUrl: string;
  timeoutMs: number;
  batchSize: number;
  retries?: number;
  fetch?: FetchLike;
  log?: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
}

/**
 * Client for an ArcGIS FeatureServer polyline layer.
 * Strategy: read layer metadata → fetch ALL object IDs (returnIdsOnly is not subject to
 * maxRecordCount) → download features in object-ID batches no larger than maxRecordCount,
 * in GeoJSON with outSR=4326. A batch flagged `exceededTransferLimit` or returning fewer
 * records than requested is split and retried, so results are never silently truncated.
 */
export class ArcGisClient {
  private readonly fetchFn: FetchLike;
  private readonly retries: number;

  constructor(private readonly opts: ArcGisClientOptions) {
    this.fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
    this.retries = opts.retries ?? 2;
  }

  private async getJson(url: string, body?: URLSearchParams): Promise<Record<string, unknown>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetchFn(url, {
          method: body ? 'POST' : 'GET',
          body,
          headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (!res.ok) throw new ArcGisError(`HTTP ${res.status} ze služby ArcGIS`);
        const json = (await res.json()) as Record<string, unknown>;
        if (json && typeof json === 'object' && 'error' in json) {
          const e = json.error as { message?: string; code?: number };
          throw new ArcGisError(`ArcGIS chyba ${e.code ?? ''}: ${e.message ?? 'neznámá chyba'}`);
        }
        return json;
      } catch (err) {
        lastErr = err;
        if (attempt < this.retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      }
    }
    const msg = lastErr instanceof Error ? (lastErr.name === 'TimeoutError' ? 'Vypršel časový limit požadavku' : lastErr.message) : String(lastErr);
    throw new ArcGisError(`Služba ArcGIS není dostupná: ${msg}`, lastErr);
  }

  async getMetadata(): Promise<ArcGisLayerMetadata> {
    const j = await this.getJson(`${this.opts.layerUrl}?f=json`);
    const fields = Array.isArray(j.fields) ? (j.fields as Array<{ name: string; type: string }>) : [];
    const oid = fields.find((f) => f.type === 'esriFieldTypeOID')?.name ?? (j.objectIdField as string) ?? 'ObjectId';
    return {
      name: String(j.name ?? ''),
      geometryType: String(j.geometryType ?? ''),
      maxRecordCount: Number(j.maxRecordCount) || 1000,
      supportedQueryFormats: String(j.supportedQueryFormats ?? ''),
      fields: fields.map((f) => ({ name: f.name, type: f.type })),
      objectIdField: oid,
    };
  }

  async getObjectIds(): Promise<number[]> {
    const j = await this.getJson(`${this.opts.layerUrl}/query?where=1%3D1&returnIdsOnly=true&f=json`);
    const ids = j.objectIds;
    if (!Array.isArray(ids)) throw new ArcGisError('Služba nevrátila seznam ObjectId.');
    return (ids as number[]).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  }

  private async fetchBatch(ids: number[], oidField: string, depth = 0): Promise<unknown[]> {
    const body = new URLSearchParams({
      objectIds: ids.join(','),
      outFields: '*',
      outSR: '4326',
      returnGeometry: 'true',
      f: 'geojson',
    });
    const j = await this.getJson(`${this.opts.layerUrl}/query`, body);
    const feats = Array.isArray(j.features) ? (j.features as Array<{ id?: number; properties?: Record<string, unknown> }>) : null;
    if (!feats) throw new ArcGisError('Odpověď neobsahuje pole features.');
    const exceeded = (j.properties as { exceededTransferLimit?: boolean } | undefined)?.exceededTransferLimit || j.exceededTransferLimit === true;
    if ((exceeded || feats.length < ids.length) && ids.length > 1 && depth < 6) {
      // split and retry to avoid truncation / partial responses
      const mid = Math.floor(ids.length / 2);
      this.opts.log?.warn({ requested: ids.length, received: feats.length, exceeded }, 'ArcGIS batch incomplete, splitting');
      const [a, b] = await Promise.all([this.fetchBatch(ids.slice(0, mid), oidField, depth + 1), this.fetchBatch(ids.slice(mid), oidField, depth + 1)]);
      return [...a, ...b];
    }
    return feats;
  }

  async fetchAll(): Promise<ArcGisFetchResult> {
    const warnings: DataWarning[] = [];
    const metadata = await this.getMetadata();
    if (!/geojson/i.test(metadata.supportedQueryFormats)) warnings.push({ code: 'no_geojson_support' });
    if (metadata.geometryType && metadata.geometryType !== 'esriGeometryPolyline') warnings.push({ code: 'unexpected_geometry', type: metadata.geometryType });
    const ids = await this.getObjectIds();
    const batchSize = Math.max(1, Math.min(this.opts.batchSize, metadata.maxRecordCount));
    const batches: number[][] = [];
    for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));
    this.opts.log?.info({ total: ids.length, batches: batches.length, batchSize }, 'Downloading ArcGIS features');

    const features: unknown[] = [];
    // limited concurrency (2) to be polite to the service
    for (let i = 0; i < batches.length; i += 2) {
      const res = await Promise.all(batches.slice(i, i + 2).map((b) => this.fetchBatch(b, metadata.objectIdField)));
      for (const r of res) features.push(...r);
    }
    // de-duplicate by object id
    const seen = new Set<unknown>();
    const unique = features.filter((f) => {
      const ff = f as { id?: unknown; properties?: Record<string, unknown> };
      const key = ff.properties?.[metadata.objectIdField] ?? ff.id;
      if (key === undefined) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length !== ids.length) {
      const msg = `Staženo ${unique.length} z ${ids.length} záznamů – odpověď služby je neúplná.`;
      if (unique.length < ids.length * 0.98) throw new ArcGisError(msg);
      warnings.push({ code: 'partial', received: unique.length, expected: ids.length });
    }
    return { metadata, expectedCount: ids.length, featureCollection: { type: 'FeatureCollection', features: unique }, warnings };
  }
}
