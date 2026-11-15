import { describe, expect, it } from 'vitest';
import { ArcGisClient, ArcGisError } from '../src/adapters/brno-gis/arcgis-client';
import { mockArcGis, silentLog } from './mock-arcgis';

const URL_ = 'https://example.test/FeatureServer/0';
const client = (fetchFn: ReturnType<typeof mockArcGis>['fetchFn'], batchSize = 2000) =>
  new ArcGisClient({ layerUrl: URL_, timeoutMs: 2000, batchSize, retries: 1, fetch: fetchFn, log: silentLog });

describe('ArcGIS adapter', () => {
  it('retrieves all 4 500 records across the 2 000 record limit using object-ID batches', async () => {
    const m = mockArcGis({ count: 4500, maxRecordCount: 2000 });
    const res = await client(m.fetchFn, 5000).fetchAll();
    expect(res.expectedCount).toBe(4500);
    expect(res.featureCollection.features).toHaveLength(4500);
    const ids = new Set(res.featureCollection.features.map((f) => (f as { properties: { ObjectId: number } }).properties.ObjectId));
    expect(ids.size).toBe(4500);
    // batch size is capped at maxRecordCount → 3 data queries
    expect(m.calls.filter((c) => c.endsWith('/query')).length).toBe(3);
    expect(res.warnings).toEqual([]);
  });

  it('splits batches flagged exceededTransferLimit instead of truncating', async () => {
    const m = mockArcGis({ count: 2500, maxRecordCount: 2000, truncateOver: 700 });
    const res = await client(m.fetchFn, 1000).fetchAll();
    expect(res.featureCollection.features).toHaveLength(2500);
    expect(m.calls.filter((c) => c.endsWith('/query')).length).toBeGreaterThan(3);
  });

  it('reports a small partial response as a warning', async () => {
    const m = mockArcGis({ count: 1000, dropIds: [5] });
    const res = await client(m.fetchFn, 500).fetchAll();
    expect(res.featureCollection.features).toHaveLength(999);
    expect(res.warnings).toContainEqual({ code: 'partial', received: 999, expected: 1000 });
  });

  it('fails loudly on a substantially incomplete response', async () => {
    const m = mockArcGis({ count: 100, dropIds: Array.from({ length: 30 }, (_, i) => i + 1) });
    await expect(client(m.fetchFn, 50).fetchAll()).rejects.toThrow(/neúplná/);
  });

  it('surfaces ArcGIS JSON errors and HTTP errors', async () => {
    await expect(client(mockArcGis({ count: 10, failMetadata: true }).fetchFn).fetchAll()).rejects.toBeInstanceOf(ArcGisError);
    await expect(client(mockArcGis({ count: 10, failAfterCalls: 2 }).fetchFn).fetchAll()).rejects.toThrow(/HTTP 503/);
  });

  it('handles timeouts', async () => {
    const hanging = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('t'), { name: 'TimeoutError' }))));
    const c = new ArcGisClient({ layerUrl: URL_, timeoutMs: 50, batchSize: 10, retries: 0, fetch: hanging });
    await expect(c.fetchAll()).rejects.toThrow(/časový limit/);
  });
});
