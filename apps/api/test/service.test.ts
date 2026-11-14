import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ArcGisClient } from '../src/adapters/brno-gis/arcgis-client';
import { FileCache } from '../src/cache/file-cache';
import { InfrastructureService } from '../src/services/infrastructure-service';
import { mockArcGis, silentLog } from './mock-arcgis';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'bce-'));
const mk = (fetchFn: ReturnType<typeof mockArcGis>['fetchFn'], dir: string) =>
  new InfrastructureService(
    new ArcGisClient({ layerUrl: 'https://x.test/0', timeoutMs: 1000, batchSize: 500, retries: 0, fetch: fetchFn }),
    new FileCache(dir, 'infrastructure'),
    'https://x.test/0',
    silentLog,
  );

describe('InfrastructureService + cache', () => {
  it('refreshes, normalizes and persists the dataset', async () => {
    const dir = await tmp();
    const svc = mk(mockArcGis({ count: 2100 }).fetchFn, dir);
    await svc.refresh();
    const { meta, data } = svc.get();
    expect(meta.source).toBe('official');
    expect(meta.featureCount).toBe(2100);
    expect(meta.expectedCount).toBe(2100);
    expect(meta.lastRefreshed).not.toBeNull();
    expect(meta.latestExportDate).toBe('2026-11-13');
    expect(meta.distinctTypes.find((t) => t.value === 'Stezka pro cyklisty - C8')?.category).toBe('separated_path');
    expect(data.features[0].properties.original).toHaveProperty('typ_opatreni');
    const onDisk = JSON.parse(await readFile(path.join(dir, 'infrastructure.json'), 'utf8'));
    expect(onDisk.data.features).toHaveLength(2100);
  });

  it('loads from cache on start without hitting the network when fresh', async () => {
    const dir = await tmp();
    await mk(mockArcGis({ count: 50 }).fetchFn, dir).refresh();
    const m2 = mockArcGis({ count: 50 });
    const svc2 = mk(m2.fetchFn, dir);
    await svc2.init(24);
    expect(svc2.get().meta.featureCount).toBe(50);
    expect(m2.calls).toHaveLength(0);
  });

  it('keeps the last good data and records the error when a refresh fails', async () => {
    const dir = await tmp();
    const svc = mk(mockArcGis({ count: 30 }).fetchFn, dir);
    await svc.refresh();
    const failing = mk(mockArcGis({ count: 30, failMetadata: true }).fetchFn, dir);
    await failing.init(-1); // stale → triggers refresh which fails
    await failing.waitForData(10);
    await new Promise((r) => setTimeout(r, 50));
    const meta = failing.getMeta();
    expect(meta.featureCount).toBe(30);
    expect(meta.lastError?.message).toMatch(/ArcGIS/);
  });

  it('never invents data when the service is down and there is no cache', async () => {
    const svc = mk(mockArcGis({ count: 30, failMetadata: true }).fetchFn, await tmp());
    await expect(svc.refresh()).rejects.toThrow();
    expect(svc.get().data.features).toHaveLength(0);
    expect(svc.getMeta().source).toBe('none');
  });

  it('deduplicates concurrent refreshes', async () => {
    const m = mockArcGis({ count: 10 });
    const svc = mk(m.fetchFn, await tmp());
    await Promise.all([svc.refresh(), svc.refresh(), svc.refresh()]);
    expect(m.calls.filter((c) => c.includes('returnIdsOnly')).length).toBe(1);
  });

  it('imports GeoJSON manually as a labelled fallback', async () => {
    const svc = mk(mockArcGis({ count: 0 }).fetchFn, await tmp());
    const sample = JSON.parse(readFileSync(fileURLToPath(new URL('../../../tests/fixtures/arcgis-sample.geojson', import.meta.url)), 'utf8'));
    await svc.importGeoJson(sample);
    expect(svc.getMeta().source).toBe('imported');
    expect(svc.get().data.features.every((f) => f.properties.source === 'imported')).toBe(true);
    await expect(svc.importGeoJson({ type: 'FeatureCollection', features: [] })).rejects.toThrow();
  });
});
