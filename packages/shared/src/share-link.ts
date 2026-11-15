import type { LngLat, RideType, RoutePreference } from './types';

/**
 * Shareable planner link: the route *plan* (points + options), not the calculated geometry.
 * The receiving app recalculates the route, so links stay short and always follow the
 * current road network.
 *
 *   ?wp=16.60680,49.19510;16.62600,49.20000&n=Hlavní nádraží|Lužánky&ride=ebike&pref=max_paths&eng=brouter
 *   ?wp=16.60680,49.19510&loop=1&km=40
 */
export interface SharedPlan {
  waypoints: Array<{ position: LngLat; name: string | null }>;
  rideType?: RideType;
  preference?: RoutePreference;
  engine?: string;
  roundTrip: boolean;
  /** Loop length (km), only meaningful with roundTrip and one waypoint. */
  targetKm?: number;
}

/** Same limit as the API's `waypoints.maxItems`. */
export const SHARE_MAX_WAYPOINTS = 20;
export const SHARE_MAX_NAME = 80;
export const SHARE_PARAMS = ['wp', 'n', 'ride', 'pref', 'eng', 'loop', 'km'] as const;

const RIDE_TYPES: readonly RideType[] = ['leisure', 'urban', 'ebike', 'sport'];
const PREFERENCES: readonly RoutePreference[] = ['max_paths', 'min_roads', 'min_climb', 'shortest'];
const ENGINE_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/** 5 decimals ≈ 1 m: precise enough for a route point, keeps the link short. */
const coord = (v: number) => String(Number(v.toFixed(5)));
const cleanName = (n: string) => n.replace(/[|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SHARE_MAX_NAME);

export function encodeSharedPlan(plan: SharedPlan): string {
  const p = new URLSearchParams();
  const wps = plan.waypoints.slice(0, SHARE_MAX_WAYPOINTS);
  p.set('wp', wps.map((w) => `${coord(w.position[0])},${coord(w.position[1])}`).join(';'));
  const names = wps.map((w) => (w.name ? cleanName(w.name) : ''));
  if (names.some(Boolean)) p.set('n', names.join('|'));
  if (plan.rideType) p.set('ride', plan.rideType);
  if (plan.preference) p.set('pref', plan.preference);
  if (plan.engine) p.set('eng', plan.engine);
  if (plan.roundTrip) {
    p.set('loop', '1');
    if (wps.length === 1 && plan.targetKm) p.set('km', String(Math.round(plan.targetKm)));
  }
  return p.toString();
}

/**
 * Parses a shared plan from a query string. Returns null when the link carries no valid plan;
 * unknown or invalid options are dropped (the receiver keeps its own setting).
 */
export function decodeSharedPlan(search: string | URLSearchParams): SharedPlan | null {
  const p = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const raw = p.get('wp');
  if (!raw) return null;
  const parts = raw.split(';').filter(Boolean);
  if (!parts.length || parts.length > SHARE_MAX_WAYPOINTS) return null;
  const positions: LngLat[] = [];
  for (const part of parts) {
    const xy = part.split(',');
    if (xy.length !== 2) return null;
    const [lon, lat] = xy.map((v) => (v.trim() === '' ? NaN : Number(v)));
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    positions.push([lon, lat]);
  }
  const names = (p.get('n') ?? '').split('|');
  const ride = p.get('ride') as RideType | null;
  const pref = p.get('pref') as RoutePreference | null;
  const eng = p.get('eng');
  const roundTrip = p.get('loop') === '1';
  const km = Number(p.get('km'));
  return {
    waypoints: positions.map((position, i) => {
      const name = names[i] ? cleanName(names[i]) : '';
      return { position, name: name || null };
    }),
    ...(ride && RIDE_TYPES.includes(ride) ? { rideType: ride } : {}),
    ...(pref && PREFERENCES.includes(pref) ? { preference: pref } : {}),
    ...(eng && ENGINE_RE.test(eng) ? { engine: eng } : {}),
    roundTrip,
    ...(roundTrip && Number.isFinite(km) && km >= 5 && km <= 100 ? { targetKm: Math.round(km) } : {}),
  };
}

/** The query string with all share parameters removed (other parameters are kept). */
export function stripSharedPlan(search: string): string {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const k of SHARE_PARAMS) p.delete(k);
  const s = p.toString();
  return s ? `?${s}` : '';
}
