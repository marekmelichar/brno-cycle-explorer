import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { ArcGisClient } from '../src/adapters/brno-gis/arcgis-client';
import { FileCache } from '../src/cache/file-cache';
import { InfrastructureService } from '../src/services/infrastructure-service';
import { NoRoutingProvider } from '../src/adapters/routing/types';
import { ValhallaProvider, variantsFor } from '../src/adapters/routing/valhalla';
import { NominatimGeocoder } from '../src/adapters/geocoding/nominatim';
import { mockArcGis, silentLog } from './mock-arcgis';
import { OverpassClient } from '../src/adapters/osm/overpass-client';
import { StairsService } from '../src/services/stairs-service';

async function app(opts: { routing?: 'none' | 'valhalla'; valhallaFetch?: typeof fetch } = {}) {
  const config = loadConfig({ CACHE_DIR: await mkdtemp(path.join(os.tmpdir(), 'bce-')) } as NodeJS.ProcessEnv);
  const infrastructure = new InfrastructureService(
    new ArcGisClient({ layerUrl: config.arcgisLayerUrl, timeoutMs: 1000, batchSize: 500, retries: 0, fetch: mockArcGis({ count: 25 }).fetchFn }),
    new FileCache(config.cacheDir, 'infrastructure'),
    config.arcgisLayerUrl,
    silentLog,
  );
  const routing = opts.routing === 'valhalla' ? new ValhallaProvider('https://valhalla.test', 1000, opts.valhallaFetch) : new NoRoutingProvider();
  const geocoder = new NominatimGeocoder('https://nominatim.test', 'test', async (url: string) =>
    url.includes('/reverse?')
      ? new Response(JSON.stringify({ display_name: 'Karlova, Maloměřice, Brno', address: { road: 'Karlova', suburb: 'Maloměřice', city: 'Brno' } }))
      : new Response(JSON.stringify([{ osm_type: 'way', osm_id: 1, display_name: 'Karlova, Brno', lat: '49.21', lon: '16.64', type: 'primary', boundingbox: ['49.2', '49.22', '16.63', '16.65'] }])),
  );
  const stairs = new StairsService(new OverpassClient([], { timeoutMs: 1000, userAgent: 'test' }), new FileCache(config.cacheDir, 'stairs'), config.stairsBbox, silentLog);
  return { server: await buildApp({ config, infrastructure, routing, geocoder, stairs }, { logger: false }), infrastructure };
}

describe('REST API', () => {
  it('health reports degraded without data, ok after refresh', async () => {
    const { server } = await app();
    let r = await server.inject('/api/health');
    expect(r.json().status).toBe('degraded');
    r = await server.inject({ method: 'POST', url: '/api/infrastructure/refresh' });
    expect(r.statusCode).toBe(200);
    expect(r.json().meta.featureCount).toBe(25);
    r = await server.inject('/api/health');
    expect(r.json()).toMatchObject({ status: 'ok', dataset: { featureCount: 25 } });
  });

  it('config exposes basemaps and routing availability', async () => {
    const { server } = await app();
    const c = (await server.inject('/api/config')).json();
    expect(c.basemaps[0].url).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(c.basemaps.some((b: { url: string }) => b.url.includes('tile.openstreetmap.org'))).toBe(false);
    expect(c.routing.available).toBe(false);
  });

  it('routing returns 503 when not configured and validates input', async () => {
    const { server } = await app();
    const r = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2], [16.61, 49.21]], rideType: 'ebike', preference: 'max_paths' } });
    expect(r.statusCode).toBe(503);
    const bad = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2]], rideType: 'x', preference: 'max_paths' } });
    expect(bad.statusCode).toBe(400);
  });

  it('valhalla adapter decodes routes, adds round trip and dedupes identical variants', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fake = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return new Response(
        JSON.stringify({ trip: { legs: [{ shape: '_w|y|A_{dt^_pR_pR', elevation: [200, 205], elevation_interval: 30 }], summary: { length: 1.4, time: 300 } } }),
      );
    }) as typeof fetch;
    const { server } = await app({ routing: 'valhalla', valhallaFetch: fake });
    const r = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2], [16.61, 49.21]], rideType: 'ebike', preference: 'max_paths', roundTrip: true } });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.candidates).toHaveLength(1); // all variants identical → deduped
    expect(j.candidates[0].coordinates[0][0]).toBeCloseTo(16.6, 5);
    expect(j.candidates[0].distance).toBe(1400);
    expect(bodies[0].costing).toBe('bicycle');
    expect((bodies[0].locations as unknown[]).length).toBe(3); // round trip appends start
    expect(bodies.length).toBe(variantsFor('max_paths', 'ebike').length);
  });

  it('valhalla errors are reported, never replaced by straight lines', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: 'No path could be found' }), { status: 400 })) as unknown as typeof fetch;
    const { server } = await app({ routing: 'valhalla', valhallaFetch: fake });
    const r = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2], [16.61, 49.21]], rideType: 'urban', preference: 'shortest' } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toMatch(/No path/);
  });

  it('geocode searches worldwide, biased to the visible map, in the UI language', async () => {
    const seen: string[] = [];
    const g = new NominatimGeocoder('https://nominatim.test', 'test', async (url: string) => {
      seen.push(url);
      return new Response('[]');
    });
    await g.search('Paris', { viewbox: [2.2, 48.8, 2.4, 48.9], lang: 'en' });
    expect(seen[0]).not.toContain('countrycodes');
    expect(seen[0]).toContain('viewbox=2.2%2C48.9%2C2.4%2C48.8');
    expect(seen[0]).toContain('bounded=0');
    expect(seen[0]).toContain('accept-language=en');
  });

  it('geocode validates query length and returns normalized results', async () => {
    const { server } = await app();
    expect((await server.inject('/api/geocode?q=ab')).statusCode).toBe(400);
    const r = await server.inject('/api/geocode?q=Karlova');
    expect(r.json().results[0]).toMatchObject({ label: 'Karlova, Brno', lat: 49.21, lon: 16.64 });
  });

  it('reverse geocode returns a short street name and validates coordinates', async () => {
    const { server } = await app();
    expect((await server.inject('/api/geocode/reverse?lat=abc&lon=16.6')).statusCode).toBe(400);
    expect((await server.inject('/api/geocode/reverse?lat=95&lon=16.6')).statusCode).toBe(400);
    const r = await server.inject('/api/geocode/reverse?lat=49.2104&lon=16.6428');
    expect(r.json()).toEqual({ label: 'Karlova, Maloměřice' });
  });

  it('a single waypoint is only accepted for a round trip with a target length', async () => {
    const { server } = await app();
    const one = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2]], rideType: 'ebike', preference: 'max_paths' } });
    expect(one.statusCode).toBe(400);
    const tooShort = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2]], rideType: 'ebike', preference: 'max_paths', roundTrip: true, targetDistance: 1000 } });
    expect(tooShort.statusCode).toBe(400);
    const loop = await server.inject({ method: 'POST', url: '/api/route', payload: { waypoints: [[16.6, 49.2]], rideType: 'ebike', preference: 'max_paths', roundTrip: true, targetDistance: 20000 } });
    expect(loop.statusCode).toBe(503); // routing not configured in this test app, but the request itself is valid
  });

  it('import endpoint rejects invalid payloads', async () => {
    const { server } = await app();
    const r = await server.inject({ method: 'POST', url: '/api/infrastructure/import', payload: { hello: 'world' } });
    expect(r.statusCode).toBe(400);
  });
});
