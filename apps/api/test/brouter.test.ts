import { describe, expect, it } from 'vitest';
import { BrouterProvider, applyAssigns, brouterVariants, messagesToIntervals, parseBrouterTrack } from '../src/adapters/routing/brouter';
import { TREKKING_PROFILE } from '../src/adapters/routing/brouter-trekking-profile';
import { MultiRoutingProvider } from '../src/adapters/routing/multi';
import { parseEngines } from '../src/config';
import type { RoutingProvider } from '../src/adapters/routing/types';

const MESSAGES = [
  ['Longitude', 'Latitude', 'Elevation', 'Distance', 'CostPerKm', 'ElevCost', 'TurnCost', 'NodeCost', 'InitialCost', 'WayTags', 'NodeTags', 'Time', 'Energy'],
  ['16601976', '49184394', '200', '110', '3050', '0', '0', '0', '0', 'highway=pedestrian', '', '18', '1874'],
  ['16590000', '49185000', '201', '240', '1000', '0', '0', '0', '0', 'highway=cycleway surface=asphalt', '', '40', '2000'],
];

function track(offset = 0, length = 350) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { 'track-length': String(length), 'total-time': '60', 'filtered ascend': '3', messages: MESSAGES },
        geometry: { type: 'LineString', coordinates: [[16.6, 49.19 + offset, 200], [16.595, 49.191 + offset, 201], [16.59, 49.192 + offset, 202]] },
      },
    ],
  };
}

describe('BRouter profile handling', () => {
  it('overrides only existing documented parameters', () => {
    const p = applyAssigns(TREKKING_PROFILE, { avoid_unsafe: true, bikerPower: 250 });
    expect(p).toMatch(/^assign\s+avoid_unsafe\s*=\s*true/m);
    expect(p).toMatch(/^assign\s+bikerPower\s*=\s*250/m);
    expect(() => applyAssigns(TREKKING_PROFILE, { no_such_param: 1 })).toThrow(/no parameter/);
  });
  it('every custom variant applies cleanly to the bundled base profile', () => {
    for (const pref of ['max_paths', 'min_roads', 'min_climb', 'shortest'] as const)
      for (const ride of ['leisure', 'urban', 'ebike', 'sport'] as const)
        for (const v of brouterVariants(pref, ride)) if (v.assigns) expect(() => applyAssigns(TREKKING_PROFILE, v.assigns!)).not.toThrow();
  });
});

describe('BRouter response parsing', () => {
  it('turns messages into OSM distance intervals', () => {
    expect(messagesToIntervals(MESSAGES)).toEqual([
      { from: 0, to: 110, tags: { highway: 'pedestrian' } },
      { from: 110, to: 350, tags: { highway: 'cycleway', surface: 'asphalt' } },
    ]);
    expect(messagesToIntervals(undefined)).toEqual([]);
    expect(messagesToIntervals([['Longitude']])).toEqual([]);
  });
  it('parses geometry, elevation, length and time', () => {
    const t = parseBrouterTrack(track() as never);
    expect(t.coords).toHaveLength(3);
    expect(t.ele).toEqual([200, 201, 202]);
    expect(t.distance).toBe(350);
    expect(t.duration).toBe(60);
    expect(() => parseBrouterTrack({ features: [] })).toThrow();
  });
});

describe('BrouterProvider', () => {
  function fakeServer(opts: { failFirstCustomRoute?: boolean; routeError?: string } = {}) {
    const calls: string[] = [];
    let uploads = 0;
    let customFailed = false;
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/brouter/profile')) {
        uploads++;
        expect(String(init?.body)).toContain('assign');
        return new Response(JSON.stringify({ profileid: `custom_${1000 + uploads}` }));
      }
      if (opts.routeError) return new Response(opts.routeError, { status: 500 });
      const prof = new URL(url).searchParams.get('profile')!;
      if (opts.failFirstCustomRoute && prof.startsWith('custom_') && !customFailed) {
        customFailed = true;
        return new Response('unknown profile', { status: 500 });
      }
      const alt = Number(new URL(url).searchParams.get('alternativeidx'));
      const n = calls.filter((c) => c.includes('alternativeidx')).length;
      return new Response(JSON.stringify(track(alt * 0.01 + n * 0.001, 350 + n * 50)));
    };
    return { fetchFn, calls, uploads: () => uploads };
  }

  it('uploads the custom profile once, requests alternatives and returns OSM tags', async () => {
    const s = fakeServer();
    const p = new BrouterProvider('https://br.test', 1000, s.fetchFn, 0);
    const r = await p.route({ waypoints: [[16.6, 49.19], [16.59, 49.192]], rideType: 'ebike', preference: 'max_paths' });
    expect(r.provider).toBe('brouter');
    expect(r.candidates.length).toBe(4); // variant 1 + its alternative, variant 2, safety
    expect(r.candidates[0].osm?.[1].tags.highway).toBe('cycleway');
    expect(r.candidates[0].elevation).toEqual([200, 201, 202]);
    expect(s.calls.some((c) => c.includes('profile=safety'))).toBe(true);
    expect(s.uploads()).toBe(2); // two different custom variants; the alternative reuses its profile
  });

  it('re-uploads an expired custom profile once', async () => {
    const s = fakeServer({ failFirstCustomRoute: true });
    const p = new BrouterProvider('https://br.test', 1000, s.fetchFn, 0);
    const r = await p.route({ waypoints: [[16.6, 49.19], [16.59, 49.192]], rideType: 'urban', preference: 'min_roads' });
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(s.uploads()).toBe(2);
  });

  it('reports server errors and never fabricates a route', async () => {
    const p = new BrouterProvider('https://br.test', 1000, fakeServer({ routeError: 'no track found at pass=0' }).fetchFn, 0);
    await expect(p.route({ waypoints: [[16.6, 49.19], [16.59, 49.192]], rideType: 'urban', preference: 'shortest' })).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('no track found'),
    });
  });

  it('adds the start again for a round trip', async () => {
    const s = fakeServer();
    const p = new BrouterProvider('https://br.test', 1000, s.fetchFn, 0);
    await p.route({ waypoints: [[16.6, 49.19], [16.59, 49.192]], rideType: 'urban', preference: 'shortest', roundTrip: true });
    expect(s.calls.find((c) => c.includes('lonlats'))).toContain('lonlats=16.600000,49.190000|16.590000,49.192000|16.600000,49.190000');
  });
});

describe('engine selection', () => {
  const fake = (id: string): RoutingProvider => ({
    id,
    available: true,
    description: id,
    attribution: id,
    route: async () => ({ provider: id, attribution: id, candidates: [], warnings: [] }),
  });
  it('dispatches by engine, defaults to the first and rejects unknown engines', async () => {
    const m = new MultiRoutingProvider([fake('brouter'), fake('valhalla')]);
    const base = { waypoints: [[16.6, 49.19], [16.59, 49.192]] as [number, number][], rideType: 'urban' as const, preference: 'shortest' as const };
    expect((await m.route(base)).provider).toBe('brouter');
    expect((await m.route({ ...base, engine: 'valhalla' })).provider).toBe('valhalla');
    await expect(m.route({ ...base, engine: 'osrm' })).rejects.toMatchObject({ statusCode: 400 });
    expect(m.engineInfo.map((e) => e.id)).toEqual(['brouter', 'valhalla']);
  });
  it('parses ROUTING_ENGINES with backwards compatibility', () => {
    expect(parseEngines({})).toEqual(['brouter', 'valhalla']);
    expect(parseEngines({ ROUTING_PROVIDER: 'none' })).toEqual([]);
    expect(parseEngines({ ROUTING_PROVIDER: 'valhalla' })).toEqual(['valhalla']);
    expect(parseEngines({ ROUTING_ENGINES: 'valhalla, brouter,foo,valhalla' })).toEqual(['valhalla', 'brouter']);
  });
});
