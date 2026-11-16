import { describe, expect, it } from 'vitest';
import { distanceToStair, isPracticeStair, stairsFromOverpass, stairsFromTiles, type OverpassWay } from '../src/stairs';

// Synthetic Overpass ways (hand-made, not real OSM data). Coordinates ~ central Brno.
const way = (id: number, nodes: number[], coords: Array<[number, number]>, tags: Record<string, string>): OverpassWay => ({
  type: 'way',
  id,
  nodes,
  geometry: coords.map(([lon, lat]) => ({ lon, lat })),
  tags: { highway: 'steps', ...tags },
});

describe('stairs from Overpass', () => {
  it('joins flights that meet end to end and sums their steps', () => {
    const s = stairsFromOverpass([
      way(1, [10, 11], [[16.6, 49.2], [16.6001, 49.2001]], { step_count: '12', incline: 'up', width: '2' }),
      // drawn the other way round: must be reversed, its "down" then means up along the chain
      way(2, [12, 11], [[16.6002, 49.2002], [16.6001, 49.2001]], { step_count: '20', incline: 'down', width: '1.5 m', handrail: 'yes' }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      id: 'osm:1+2',
      osmIds: [1, 2],
      stepCount: 32,
      stepCountPartial: false,
      drop: 5.1,
      width: 1.5,
      handrail: true,
      sheltered: false,
      restricted: false,
    });
    expect(s[0].lines[0][0]).toEqual([16.6, 49.2]);
    expect(s[0].lines[1]).toEqual([[16.6001, 49.2001], [16.6002, 49.2002]]);
    expect(s[0].top).toEqual([16.6002, 49.2002]);
    expect(s[0].bottom).toEqual([16.6, 49.2]);
    expect(s[0].length).toBeGreaterThan(20);
  });

  it('does not join at junctions of three flights, and keeps the top unknown without incline', () => {
    const s = stairsFromOverpass([
      way(1, [1, 2], [[16.6, 49.2], [16.6001, 49.2]], {}),
      way(2, [2, 3], [[16.6001, 49.2], [16.6002, 49.2]], {}),
      way(3, [2, 4], [[16.6001, 49.2], [16.6001, 49.2001]], {}),
    ]);
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.top === null && x.stepCount === null && x.drop === null)).toBe(true);
  });

  it('marks a partial step count when a flight lacks it', () => {
    const [s] = stairsFromOverpass([
      way(1, [1, 2], [[16.6, 49.2], [16.6001, 49.2]], { step_count: '10' }),
      way(2, [2, 3], [[16.6001, 49.2], [16.6002, 49.2]], {}),
    ]);
    expect(s).toMatchObject({ stepCount: 10, stepCountPartial: true });
  });

  it('flags indoor, underground and private stairs, which are not practice candidates', () => {
    const s = stairsFromOverpass([
      way(1, [1, 2], [[16.6, 49.2], [16.6001, 49.2]], { tunnel: 'yes' }),
      way(2, [3, 4], [[16.61, 49.2], [16.6101, 49.2]], { level: '-1' }),
      way(3, [5, 6], [[16.62, 49.2], [16.6201, 49.2]], { access: 'private' }),
      way(4, [7, 8], [[16.63, 49.2], [16.6301, 49.2]], { bicycle: 'no', lit: 'yes', ramp: 'yes', surface: 'paving_stones' }),
    ]);
    const byId = Object.fromEntries(s.map((x) => [x.id, x]));
    expect(byId['osm:1'].sheltered).toBe(true);
    expect(byId['osm:2'].sheltered).toBe(true);
    expect(byId['osm:3'].restricted).toBe(true);
    expect(byId['osm:4']).toMatchObject({ bicycle: 'no', lit: true, ramp: true, surface: 'paving_stones', sheltered: false });
    expect(s.filter(isPracticeStair).map((x) => x.id)).toEqual(['osm:4']);
  });

  it('never joins an outdoor flight to an underground one', () => {
    const s = stairsFromOverpass([
      way(1, [1, 2], [[16.6, 49.2], [16.6001, 49.2]], {}),
      way(2, [2, 3], [[16.6001, 49.2], [16.6002, 49.2]], { tunnel: 'yes' }),
    ]);
    expect(s).toHaveLength(2);
  });

  it('ignores non-steps ways and broken geometry, and sorts by step count', () => {
    const s = stairsFromOverpass([
      { type: 'way', id: 9, nodes: [1, 2], geometry: [{ lon: 16.6, lat: 49.2 }, { lon: 16.61, lat: 49.2 }], tags: { highway: 'footway' } },
      { type: 'way', id: 8, nodes: [1], geometry: [{ lon: 16.6, lat: 49.2 }], tags: { highway: 'steps' } },
      { type: 'node', id: 7 },
      way(1, [1, 2], [[16.6, 49.2], [16.6001, 49.2]], { step_count: '5' }),
      way(2, [3, 4], [[16.61, 49.2], [16.6101, 49.2]], { step_count: '40' }),
    ]);
    expect(s.map((x) => x.stepCount)).toEqual([40, 5]);
  });
});

describe('stairs from map tiles (fallback)', () => {
  it('deduplicates repeated pieces, re-joins pieces cut at tile edges, and maps tile attributes', () => {
    const a: Array<[number, number]> = [[16.6, 49.2], [16.6001, 49.2001]];
    const b: Array<[number, number]> = [[16.6001, 49.2001], [16.6002, 49.2002]];
    const s = stairsFromTiles([
      { coordinates: a, properties: { subclass: 'steps', surface: 'paved', ramp: 1 } },
      { coordinates: [...a].reverse(), properties: { subclass: 'steps' } }, // same piece from another tile/zoom
      { coordinates: b, properties: { subclass: 'steps', bicycle: 'no' } },
      { coordinates: [[16.62, 49.2], [16.6201, 49.2]], properties: { subclass: 'steps', brunnel: 'tunnel', level: -1 } },
    ]);
    expect(s).toHaveLength(2);
    const joined = s.find((x) => x.lines.length === 2)!;
    expect(joined).toMatchObject({ surface: 'paved', ramp: true, bicycle: 'no', stepCount: null, top: null, osmIds: [] });
    expect(joined.id.startsWith('tile:')).toBe(true);
    expect(s.find((x) => x.lines.length === 1)!.sheltered).toBe(true);
  });
});

describe('distanceToStair', () => {
  it('measures to the nearest point of the staircase', () => {
    const [s] = stairsFromOverpass([way(1, [1, 2], [[16.6, 49.2], [16.61, 49.2]], {})]);
    expect(distanceToStair([16.61, 49.2], s)).toBeCloseTo(0, 3);
    expect(distanceToStair([16.6, 49.209], s)).toBeGreaterThan(990);
  });
});
