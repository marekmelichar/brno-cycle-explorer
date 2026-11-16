import type { LngLat, Stair } from '@bce/shared';
import { haversine, lineLength } from './distance';

/** Typical riser height. Used only for the labelled estimate of the drop. */
export const RISER_M = 0.16;

/** One OSM way from an Overpass `out body geom` response. */
export interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface Flight {
  id: number;
  nodes: number[];
  coords: LngLat[];
  tags: Record<string, string>;
}

const yes = (v: string | undefined) => (v === undefined ? null : v === 'yes' || v === 'both' || v === 'left' || v === 'right' || v === 'center');
const num = (v: string | undefined) => {
  if (!v) return null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m)?\s*$/.exec(v);
  return m ? Number(m[1].replace(',', '.')) : null;
};

function isSheltered(t: Record<string, string>): boolean {
  const level = Number((t.level ?? '0').split(';')[0]);
  return (
    t.indoor === 'yes' ||
    t.tunnel === 'yes' ||
    t.tunnel === 'building_passage' ||
    t.covered === 'yes' ||
    t.location === 'underground' ||
    t.location === 'indoor' ||
    (Number.isFinite(level) && level < 0)
  );
}
const isRestricted = (t: Record<string, string>) => ['private', 'no'].includes(t.access ?? '') || ['private', 'no'].includes(t.foot ?? '');

/**
 * Turns Overpass `highway=steps` ways into staircases. Flights that meet end to end (a shared end
 * node used by exactly two flights) are joined into one staircase, so a long run split into
 * several OSM ways counts as one. Junctions of three or more flights are not joined: they are
 * usually stations or terraces, not one run.
 */
export function stairsFromOverpass(elements: unknown[]): Stair[] {
  const flights: Flight[] = [];
  for (const e of elements as OverpassWay[]) {
    if (e?.type !== 'way' || !Array.isArray(e.geometry) || e.geometry.length < 2 || !Array.isArray(e.nodes)) continue;
    const tags = e.tags ?? {};
    if (tags.highway !== 'steps') continue;
    const coords = e.geometry.filter((g) => g && Number.isFinite(g.lat) && Number.isFinite(g.lon)).map((g) => [g.lon, g.lat] as LngLat);
    if (coords.length < 2) continue;
    flights.push({ id: e.id, nodes: e.nodes, coords, tags });
  }
  return joinFlights(flights).map(toStair).sort((a, b) => (b.stepCount ?? 0) - (a.stepCount ?? 0) || b.length - a.length);
}

/** Groups flights into chains joined at end nodes shared by exactly two flights with the same shelter. */
function joinFlights(flights: Flight[]): Flight[][] {
  const ends = new Map<number, number[]>();
  flights.forEach((f, i) => {
    for (const n of [f.nodes[0], f.nodes[f.nodes.length - 1]]) ends.set(n, [...(ends.get(n) ?? []), i]);
  });
  const parent = flights.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const ids of ends.values()) {
    if (ids.length !== 2 || ids[0] === ids[1]) continue;
    const [a, b] = ids;
    if (isSheltered(flights[a].tags) !== isSheltered(flights[b].tags)) continue;
    parent[find(a)] = find(b);
  }
  const groups = new Map<number, Flight[]>();
  flights.forEach((f, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), f]));
  return [...groups.values()].map(orderChain);
}

/** Orders a chain end to end, reversing flights where needed so each continues from the previous one. */
function orderChain(group: Flight[]): Flight[] {
  if (group.length === 1) return group;
  const first = (f: Flight) => f.nodes[0];
  const last = (f: Flight) => f.nodes[f.nodes.length - 1];
  const count = new Map<number, number>();
  for (const f of group) for (const n of [first(f), last(f)]) count.set(n, (count.get(n) ?? 0) + 1);
  // start at a free end (degree 1); a closed loop starts anywhere
  const start = group.find((f) => count.get(first(f)) === 1 || count.get(last(f)) === 1) ?? group[0];
  let node = count.get(first(start)) === 1 ? first(start) : count.get(last(start)) === 1 ? last(start) : first(start);
  const out: Flight[] = [];
  const left = new Set(group);
  while (left.size) {
    const f = [...left].find((x) => first(x) === node || last(x) === node) ?? [...left][0];
    left.delete(f);
    const reversed = first(f) !== node && last(f) === node;
    out.push(reversed ? reverse(f) : f);
    node = reversed ? first(f) : last(f);
  }
  return out;
}

/** A flight walked against its OSM direction (incline flipped so it stays correct). */
function reverse(f: Flight): Flight {
  const incline = f.tags.incline === 'up' ? 'down' : f.tags.incline === 'down' ? 'up' : f.tags.incline;
  return { ...f, nodes: [...f.nodes].reverse(), coords: [...f.coords].reverse(), tags: { ...f.tags, ...(incline ? { incline } : {}) } };
}

function toStair(chain: Flight[]): Stair {
  const tag = (k: string) => chain.map((f) => f.tags[k]).find((v) => v !== undefined);
  const counts = chain.map((f) => (/^\d+$/.test(f.tags.step_count ?? '') ? Number(f.tags.step_count) : null));
  const known = counts.filter((c): c is number => c !== null);
  const stepCount = known.length ? known.reduce((a, b) => a + b, 0) : null;
  // walking the chain in order: "up" flights mean the chain end is the top
  const votes = chain.reduce((v, f) => v + (f.tags.incline === 'up' ? 1 : f.tags.incline === 'down' ? -1 : 0), 0);
  const startPt = chain[0].coords[0];
  const endPt = chain[chain.length - 1].coords[chain[chain.length - 1].coords.length - 1];
  const widths = chain.map((f) => num(f.tags.width)).filter((w): w is number => w !== null);
  const handrails = chain.map((f) => f.tags.handrail ?? (f.tags['handrail:left'] || f.tags['handrail:right'] || f.tags['handrail:center'] ? 'yes' : undefined));
  const ramps = chain.map((f) => f.tags['ramp:bicycle'] ?? f.tags.ramp ?? f.tags['ramp:stroller']);
  const bicycles = chain.map((f) => f.tags.bicycle).filter((b): b is string => !!b);
  return {
    id: `osm:${chain.map((f) => f.id).join('+')}`,
    osmIds: chain.map((f) => f.id),
    name: tag('name') ?? null,
    lines: chain.map((f) => f.coords),
    length: chain.reduce((s, f) => s + lineLength(f.coords), 0),
    stepCount,
    stepCountPartial: stepCount !== null && known.length < chain.length,
    drop: stepCount !== null ? Math.round(stepCount * RISER_M * 10) / 10 : null,
    top: votes > 0 ? endPt : votes < 0 ? startPt : null,
    bottom: votes > 0 ? startPt : votes < 0 ? endPt : null,
    surface: tag('surface') ?? null,
    width: widths.length ? Math.min(...widths) : null,
    handrail: handrails.some((h) => yes(h) === true) ? true : handrails.some((h) => h === 'no') ? false : null,
    lit: chain.some((f) => f.tags.lit === 'yes') ? true : chain.some((f) => f.tags.lit === 'no') ? false : null,
    ramp: ramps.some((r) => r === 'yes') ? true : ramps.some((r) => r === 'no') ? false : null,
    bicycle: bicycles.includes('no') ? 'no' : bicycles[0] ?? null,
    sheltered: chain.some((f) => isSheltered(f.tags)),
    restricted: chain.some((f) => isRestricted(f.tags)),
  };
}

/** A `highway=steps` feature from the OpenMapTiles `transportation` layer (subclass "steps"). */
export interface TileStepFeature {
  coordinates: LngLat[];
  properties: Record<string, unknown>;
}

/**
 * Fallback when Overpass is unavailable: staircases from the vector tiles already on screen.
 * Tiles cut lines at tile edges and repeat them across zoom levels, so pieces are deduplicated
 * and re-joined at matching ends. Tiles carry no step count, incline, width or handrail.
 */
export function stairsFromTiles(features: TileStepFeature[]): Stair[] {
  const key = (c: LngLat) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
  const seen = new Set<string>();
  const pieces: Flight[] = [];
  let nodeIds = 0;
  const nodeOf = new Map<string, number>();
  const node = (c: LngLat) => {
    const k = key(c);
    if (!nodeOf.has(k)) nodeOf.set(k, ++nodeIds);
    return nodeOf.get(k)!;
  };
  for (const f of features) {
    if (f.coordinates.length < 2) continue;
    const fwd = f.coordinates.map(key).join(';');
    const back = [...f.coordinates].reverse().map(key).join(';');
    if (seen.has(fwd) || seen.has(back)) continue;
    seen.add(fwd);
    const p = f.properties;
    const tags: Record<string, string> = { highway: 'steps' };
    if (typeof p.surface === 'string') tags.surface = p.surface;
    if (p.ramp === 1 || p.ramp === true) tags.ramp = 'yes';
    if (typeof p.bicycle === 'string') tags.bicycle = p.bicycle;
    if (p.brunnel === 'tunnel') tags.tunnel = 'yes';
    if (p.level !== undefined) tags.level = String(p.level);
    if (p.indoor === 1 || p.indoor === true) tags.indoor = 'yes';
    pieces.push({ id: pieces.length + 1, nodes: [node(f.coordinates[0]), node(f.coordinates[f.coordinates.length - 1])], coords: f.coordinates, tags });
  }
  return joinFlights(pieces)
    .map((chain) => {
      const s = toStair(chain);
      return { ...s, id: `tile:${key(s.lines[0][0])}`, osmIds: [], top: null, bottom: null };
    })
    .sort((a, b) => b.length - a.length);
}

/** Outdoor, public stairs: the ones worth riding. */
export const isPracticeStair = (s: Stair) => !s.sheltered && !s.restricted;

/** Distance (m) from a point to the nearest vertex of the staircase. */
export function distanceToStair(p: LngLat, s: Stair): number {
  let best = Infinity;
  for (const line of s.lines) for (const c of line) best = Math.min(best, haversine(p, c));
  return best;
}
