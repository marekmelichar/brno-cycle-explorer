import { createHash } from 'node:crypto';
import type { LngLat, OsmInterval, RideType, RouteCandidate, RoutePreference, RouteRequest, RouteResponse } from '@bce/shared';
import { haversine, parseWayTags } from '@bce/geo';
import type { FetchLike } from '../brno-gis/arcgis-client';
import { RoutingError, type RoutingProvider } from './types';
import { TREKKING_PROFILE } from './brouter-trekking-profile';

type Assigns = Record<string, string | number | boolean>;

export interface BrouterVariant {
  label: string;
  /** Language-neutral id, translated in the UI */
  code: string;
  /** Built-in profile name on the server, OR a custom profile = trekking + `assigns`. */
  builtin?: string;
  assigns?: Assigns;
  alternatives?: number;
}

/**
 * Overrides `assign <name> = <value>` lines of a BRouter profile. Only names that exist in the
 * profile are allowed, so a changed base profile fails loudly instead of being silently ignored.
 */
export function applyAssigns(profile: string, assigns: Assigns): string {
  let out = profile;
  for (const [name, value] of Object.entries(assigns)) {
    const re = new RegExp(`^(assign\\s+${name}\\s*=\\s*)(\\S+)`, 'm');
    if (!re.test(out)) throw new Error(`BRouter profile has no parameter "${name}"`);
    out = out.replace(re, `$1${String(value)}`);
  }
  return out;
}

const RIDER: Record<RideType, Assigns> = {
  leisure: { bikerPower: 80, totalMass: 90 },
  urban: { bikerPower: 100, totalMass: 90 },
  ebike: { bikerPower: 250, totalMass: 110 },
  sport: { bikerPower: 200, totalMass: 85, maxSpeed: 50 },
};

/**
 * Variants per preference. Custom variants change only documented trekking parameters:
 * avoid_unsafe (avoid standard roads), consider_traffic / consider_noise / consider_river,
 * uphillcost/uphillcutoff (climbing), bikerPower/totalMass (travel time).
 */
export function brouterVariants(pref: RoutePreference, ride: RideType): BrouterVariant[] {
  const r = RIDER[ride];
  switch (pref) {
    case 'max_paths':
      return [
        { label: 'BRouter: klidná trasa (mimo silnice, u řek, v tichu)', code: 'brouter.pleasant', assigns: { ...r, avoid_unsafe: true, consider_traffic: true, consider_noise: true, consider_river: true }, alternatives: 1 },
        { label: 'BRouter: mimo silnice', code: 'brouter.quiet', assigns: { ...r, avoid_unsafe: true, consider_traffic: true } },
        { label: 'BRouter: profil safety', code: 'brouter.safety', builtin: 'safety' },
      ];
    case 'min_roads':
      return [
        { label: 'BRouter: mimo silnice', code: 'brouter.quiet', assigns: { ...r, avoid_unsafe: true, consider_traffic: true }, alternatives: 1 },
        { label: 'BRouter: profil safety', code: 'brouter.safety', builtin: 'safety' },
      ];
    case 'min_climb':
      return [
        { label: 'BRouter: co nejméně stoupání', code: 'brouter.flat', assigns: { ...r, avoid_unsafe: true, uphillcost: 80, uphillcutoff: 1.0 }, alternatives: 1 },
        { label: 'BRouter: profil trekking', code: 'brouter.trekking', builtin: 'trekking' },
      ];
    case 'shortest':
    default:
      return [
        { label: 'BRouter: nejkratší', code: 'brouter.shortest', builtin: 'shortest' },
        { label: 'BRouter: rychlá jízda (fastbike)', code: 'brouter.fastbike', builtin: 'fastbike', alternatives: 1 },
      ];
  }
}

interface BrouterGeoJson {
  features?: Array<{
    geometry?: { type: string; coordinates: number[][] };
    properties?: Record<string, unknown> & { messages?: string[][] };
  }>;
}

/** Converts BRouter "messages" (one row per tag change: end point + segment Distance) into intervals. */
export function messagesToIntervals(messages: string[][] | undefined): OsmInterval[] {
  if (!Array.isArray(messages) || messages.length < 2) return [];
  const header = messages[0];
  const iDist = header.indexOf('Distance');
  const iTags = header.indexOf('WayTags');
  if (iDist < 0 || iTags < 0) return [];
  const out: OsmInterval[] = [];
  let at = 0;
  for (const row of messages.slice(1)) {
    const d = Number(row[iDist]);
    if (!Number.isFinite(d) || d <= 0) continue;
    out.push({ from: at, to: at + d, tags: parseWayTags(row[iTags]) });
    at += d;
  }
  return out;
}

export function parseBrouterTrack(json: BrouterGeoJson) {
  const f = json.features?.[0];
  const g = f?.geometry;
  if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    throw new RoutingError('BRouter nevrátil platnou trasu.');
  }
  const coords: LngLat[] = g.coordinates.map((c) => [c[0], c[1]]);
  const ele = g.coordinates.every((c) => c.length > 2 && Number.isFinite(c[2])) ? g.coordinates.map((c) => c[2]) : null;
  const p = f.properties ?? {};
  let distance = Number(p['track-length']);
  if (!Number.isFinite(distance)) distance = coords.slice(1).reduce((s, c, i) => s + haversine(coords[i], c), 0);
  const duration = Number(p['total-time']) || 0;
  return { coords, ele, distance, duration, osm: messagesToIntervals(p.messages) };
}

function similar(a: LngLat[], b: LngLat[], da: number, db: number): boolean {
  if (Math.abs(da - db) / Math.max(da, db) > 0.01) return false;
  for (let i = 0; i <= 20; i++) {
    if (haversine(a[Math.floor((i / 20) * (a.length - 1))], b[Math.floor((i / 20) * (b.length - 1))]) > 30) return false;
  }
  return true;
}

export class BrouterProvider implements RoutingProvider {
  readonly id = 'brouter';
  readonly available = true;
  readonly attribution = 'Trasy: BRouter · data © OpenStreetMap přispěvatelé';
  private readonly fetchFn: FetchLike;
  private readonly profileIds = new Map<string, { id: string; at: number }>();
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    fetchFn?: FetchLike,
    /** Minimum gap between requests to the server (ms): the public brouter.de has limited capacity. */
    private readonly spacingMs = 1100,
  ) {
    this.fetchFn = fetchFn ?? ((i, init) => fetch(i, init));
  }

  get description() {
    return `BRouter – cyklistické profily nad OSM, server ${this.baseUrl}`;
  }

  /** Serialises requests with a minimum spacing. */
  private request(url: string, init?: RequestInit): Promise<Response> {
    const task = this.queue.then(async () => {
      const wait = Math.max(0, this.last + this.spacingMs - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      try {
        return await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (e) {
        throw new RoutingError(`Směrovač BRouter není dostupný: ${e instanceof Error ? e.message : e}`, 502, e instanceof Error ? e.message : String(e));
      }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async uploadProfile(text: string, force = false): Promise<string> {
    const key = createHash('sha256').update(text).digest('hex');
    const cached = this.profileIds.get(key);
    if (cached && !force && Date.now() - cached.at < 30 * 60 * 1000) return cached.id;
    const res = await this.request(`${this.baseUrl}/brouter/profile`, { method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' } });
    const body = (await res.json().catch(() => ({}))) as { profileid?: string; error?: string };
    if (!res.ok || !body.profileid || !/^custom_\d+$/.test(body.profileid)) {
      throw new RoutingError(`BRouter odmítl profil: ${body.error ?? `HTTP ${res.status}`}`);
    }
    this.profileIds.set(key, { id: body.profileid, at: Date.now() });
    return body.profileid;
  }

  private async track(points: LngLat[], profile: string, alt: number) {
    const lonlats = points.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join('|');
    const url = `${this.baseUrl}/brouter?lonlats=${lonlats}&profile=${encodeURIComponent(profile)}&alternativeidx=${alt}&format=geojson`;
    const res = await this.request(url);
    const text = await res.text();
    if (!res.ok) {
      const msg = text.trim().slice(0, 200) || `HTTP ${res.status}`;
      throw new RoutingError(`Směrovač BRouter: ${msg}`, /not found|no track|target island|too far/i.test(msg) ? 422 : 502, msg);
    }
    try {
      return parseBrouterTrack(JSON.parse(text) as BrouterGeoJson);
    } catch (e) {
      if (e instanceof RoutingError) throw e;
      throw new RoutingError('BRouter vrátil neplatnou odpověď.');
    }
  }

  private async runVariant(points: LngLat[], v: BrouterVariant, alt: number) {
    if (v.builtin) return this.track(points, v.builtin, alt);
    const text = applyAssigns(TREKKING_PROFILE, v.assigns ?? {});
    const id = await this.uploadProfile(text);
    try {
      return await this.track(points, id, alt);
    } catch (e) {
      // Uploaded profiles expire on the server; upload again once.
      if (e instanceof RoutingError && e.statusCode !== 422) return this.track(points, await this.uploadProfile(text, true), alt);
      throw e;
    }
  }

  async route(req: RouteRequest): Promise<RouteResponse> {
    const pts = [...req.waypoints];
    if (req.roundTrip && pts.length >= 2) pts.push(pts[0]);
    if (pts.length < 2) throw new RoutingError('Zadejte alespoň start a cíl.', 400);
    if (pts.length > 20) throw new RoutingError('Maximálně 20 bodů trasy.', 400);
    const candidates: RouteCandidate[] = [];
    const warnings: string[] = [];
    const variants = brouterVariants(req.preference, req.rideType);
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      for (let alt = 0; alt <= (v.alternatives ?? 0); alt++) {
        try {
          const t = await this.runVariant(pts, v, alt);
          if (candidates.some((c) => similar(c.coordinates, t.coords, c.distance, t.distance))) continue;
          candidates.push({
            id: `b${i}-${alt}`,
            variant: alt === 0 ? v.label : `${v.label} – alternativa ${alt}`,
            variantCode: v.code,
            alternative: alt,
            coordinates: t.coords,
            elevation: t.ele,
            elevationInterval: null,
            distance: t.distance,
            duration: t.duration,
            provider: this.id,
            osm: t.osm,
          });
        } catch (e) {
          if (i === 0 && alt === 0) throw e; // primary variant failed → report, never fabricate
          warnings.push(`Varianta „${v.label}${alt ? ` (alternativa ${alt})` : ''}“ selhala: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    return { provider: this.id, attribution: this.attribution, candidates, warnings };
  }
}
