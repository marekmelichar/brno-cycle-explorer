import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OverpassClient, stairsQuery } from '../src/adapters/osm/overpass-client';
import { StairsService } from '../src/services/stairs-service';
import { FileCache } from '../src/cache/file-cache';
import { silentLog } from './mock-arcgis';

// Synthetic Overpass answer (hand-made, not real OSM data)
const ANSWER = {
  osm3s: { timestamp_osm_base: '2026-11-16T10:00:00Z' },
  elements: [
    { type: 'way', id: 1, nodes: [1, 2], geometry: [{ lat: 49.2, lon: 16.6 }, { lat: 49.2001, lon: 16.6001 }], tags: { highway: 'steps', step_count: '30', incline: 'up' } },
    { type: 'way', id: 2, nodes: [3, 4], geometry: [{ lat: 49.21, lon: 16.61 }, { lat: 49.2101, lon: 16.6101 }], tags: { highway: 'steps' } },
  ],
};
const BBOX: [number, number, number, number] = [16.45, 49.12, 16.75, 49.3];

function fakeFetch(behaviour: Record<string, 'ok' | 'fail' | 'remark' | 'empty'>) {
  const calls: string[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    expect(String(init?.body)).toContain('data=');
    const b = behaviour[url];
    if (b === 'fail') return new Response('busy', { status: 429 });
    if (b === 'remark') return new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' }));
    if (b === 'empty') return new Response(JSON.stringify({ elements: [] }));
    return new Response(JSON.stringify(ANSWER));
  }) as unknown as typeof fetch;
  return { fn, calls };
}

async function service(urls: string[], f: typeof fetch, retryDelaysMs: number[] = []) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bce-stairs-'));
  const cache = new FileCache<never>(dir, 'stairs');
  const client = new OverpassClient(urls, { timeoutMs: 1000, userAgent: 'test', fetch: f, busyRetryDelayMs: 1 });
  return { svc: new StairsService(client, cache, BBOX, silentLog, retryDelaysMs), dir };
}

describe('Overpass stairs', () => {
  it('builds a bbox query in Overpass order (lat, lon)', () => {
    expect(stairsQuery(BBOX)).toBe('[out:json][timeout:60];way["highway"="steps"](49.12,16.45,49.3,16.75);out body geom;');
  });

  it('falls through to the next endpoint when one fails or reports a timeout', async () => {
    const f = fakeFetch({ 'https://a.test/api': 'fail', 'https://b.test/api': 'remark', 'https://c.test/api': 'ok' });
    const { svc } = await service(['https://a.test/api', 'https://b.test/api', 'https://c.test/api'], f.fn);
    await svc.refresh();
    // a.test answered "busy" (429): retried once before moving on
    expect(f.calls).toEqual(['https://a.test/api', 'https://a.test/api', 'https://b.test/api', 'https://c.test/api']);
    const r = svc.get();
    expect(r.meta).toMatchObject({ source: 'overpass', sourceUrl: 'https://c.test/api', count: 2, osmTimestamp: '2026-11-16T10:00:00Z', lastError: null });
    expect(r.stairs[0]).toMatchObject({ id: 'osm:1', stepCount: 30 });
  });

  it('keeps the last good data and the cache when a refresh fails', async () => {
    let mode: 'ok' | 'fail' = 'ok';
    const f = (async () => (mode === 'ok' ? new Response(JSON.stringify(ANSWER)) : new Response('', { status: 504 }))) as unknown as typeof fetch;
    const { svc, dir } = await service(['https://a.test/api'], f);
    await svc.refresh();
    mode = 'fail';
    await expect(svc.refresh()).rejects.toThrow(/Overpass.*HTTP 504/);
    expect(svc.get().stairs).toHaveLength(2);
    expect(svc.get().meta.lastError?.message).toMatch(/HTTP 504/);
    // a restarted server loads the cache without asking Overpass
    let asked = false;
    const restarted = new StairsService(
      new OverpassClient(['https://a.test/api'], { timeoutMs: 1000, userAgent: 't', fetch: (async () => ((asked = true), new Response(''))) as unknown as typeof fetch }),
      new FileCache(dir, 'stairs'),
      BBOX,
      silentLog,
    );
    await restarted.init(7);
    expect(restarted.get().stairs).toHaveLength(2);
    expect(asked).toBe(false);
  });

  it('treats an empty answer as an error, and is off without endpoints', async () => {
    const { svc } = await service(['https://a.test/api'], fakeFetch({ 'https://a.test/api': 'empty' }).fn);
    await expect(svc.refresh()).rejects.toThrow(/žádné schody/);
    const { svc: off } = await service([], fakeFetch({}).fn);
    expect(off.available).toBe(false);
    await off.init(7);
    expect(off.get().meta).toMatchObject({ source: 'none', count: 0, refreshing: false });
  });

  it('retries the same endpoint once when it is busy (502), then succeeds', async () => {
    let n = 0;
    const f = (async () => (++n === 1 ? new Response('', { status: 502 }) : new Response(JSON.stringify(ANSWER)))) as unknown as typeof fetch;
    const { svc } = await service(['https://a.test/api'], f);
    await svc.refresh();
    expect(n).toBe(2);
    expect(svc.get().stairs).toHaveLength(2);
  });

  it('without data, a failed download is retried automatically with backoff', async () => {
    let n = 0;
    // fails twice (each with its busy retry), then works
    const f = (async () => (++n <= 4 ? new Response('', { status: 504 }) : new Response(JSON.stringify(ANSWER)))) as unknown as typeof fetch;
    const { svc } = await service(['https://a.test/api'], f, [20, 40]);
    await expect(svc.refresh()).rejects.toThrow(/HTTP 504/);
    expect(svc.get().meta.nextRetryAt).not.toBeNull();
    await new Promise((r) => setTimeout(r, 150));
    expect(svc.get().stairs).toHaveLength(2);
    expect(svc.get().meta).toMatchObject({ source: 'overpass', lastError: null, nextRetryAt: null });
    svc.dispose();
  });

  it('with data, a failed refresh does not schedule fast retries', async () => {
    let ok = true;
    const f = (async () => (ok ? new Response(JSON.stringify(ANSWER)) : new Response('', { status: 504 }))) as unknown as typeof fetch;
    const { svc } = await service(['https://a.test/api'], f, [10]);
    await svc.refresh();
    ok = false;
    await expect(svc.refresh()).rejects.toThrow();
    expect(svc.get().meta.nextRetryAt).toBeNull();
  });
});
