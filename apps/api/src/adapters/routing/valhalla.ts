import type { LngLat, RideType, RouteCandidate, RoutePreference, RouteRequest, RouteResponse } from '@bce/shared';
import { decodePolyline, haversine } from '@bce/geo';
import type { FetchLike } from '../brno-gis/arcgis-client';
import { RoutingError, type RoutingProvider } from './types';

const RIDE: Record<RideType, { bicycle_type: string; cycling_speed: number }> = {
  leisure: { bicycle_type: 'Hybrid', cycling_speed: 15 },
  urban: { bicycle_type: 'City', cycling_speed: 18 },
  ebike: { bicycle_type: 'Hybrid', cycling_speed: 23 },
  sport: { bicycle_type: 'Road', cycling_speed: 27 },
};

interface Variant {
  label: string;
  options: Record<string, unknown>;
  shortest?: boolean;
}

/** Engine parameter variants per preference; the app then scores every result by matched infrastructure. */
export function variantsFor(pref: RoutePreference, ride: RideType): Variant[] {
  // e-bikes make hills cheap; leisure riders avoid them more
  const hills = ride === 'ebike' ? 0.6 : ride === 'leisure' ? 0.25 : 0.5;
  switch (pref) {
    case 'max_paths':
      return [
        { label: 'Valhalla: use_roads=0.0', options: { use_roads: 0.0, use_hills: hills } },
        { label: 'Valhalla: use_roads=0.15', options: { use_roads: 0.15, use_hills: hills } },
        { label: 'Valhalla: use_roads=0.35', options: { use_roads: 0.35, use_hills: hills } },
      ];
    case 'min_roads':
      return [
        { label: 'Valhalla: use_roads=0.05, use_living_streets=0.8', options: { use_roads: 0.05, use_living_streets: 0.8, use_hills: hills } },
        { label: 'Valhalla: use_roads=0.2', options: { use_roads: 0.2, use_hills: hills } },
      ];
    case 'min_climb':
      return [
        { label: 'Valhalla: use_hills=0.0', options: { use_roads: 0.25, use_hills: 0.0 } },
        { label: 'Valhalla: use_hills=0.15', options: { use_roads: 0.15, use_hills: 0.15 } },
      ];
    case 'shortest':
    default:
      return [
        { label: 'Valhalla: shortest=true', options: { use_roads: 0.5, use_hills: 1.0 }, shortest: true },
        { label: 'Valhalla: use_roads=0.5', options: { use_roads: 0.5, use_hills: hills } },
      ];
  }
}

function similar(a: LngLat[], b: LngLat[], da: number, db: number): boolean {
  if (Math.abs(da - db) / Math.max(da, db) > 0.01) return false;
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const pa = a[Math.floor((i / n) * (a.length - 1))];
    const pb = b[Math.floor((i / n) * (b.length - 1))];
    if (haversine(pa, pb) > 30) return false;
  }
  return true;
}

export class ValhallaProvider implements RoutingProvider {
  readonly id = 'valhalla';
  readonly available = true;
  readonly attribution = 'Trasy: Valhalla (FOSSGIS) · data © OpenStreetMap přispěvatelé';
  private readonly fetchFn: FetchLike;

  constructor(private readonly baseUrl: string, private readonly timeoutMs: number, fetchFn?: FetchLike) {
    this.fetchFn = fetchFn ?? ((i, init) => fetch(i, init));
  }

  get description() {
    return `Valhalla – cyklistický profil (bicycle), server ${this.baseUrl}`;
  }

  private async call(locations: LngLat[], ride: RideType, v: Variant, alternates: number) {
    const body = {
      locations: locations.map(([lon, lat]) => ({ lon, lat, type: 'break' })),
      costing: 'bicycle',
      costing_options: { bicycle: { ...RIDE[ride], ...v.options, ...(v.shortest ? { shortest: true } : {}) } },
      directions_type: 'none',
      units: 'kilometers',
      elevation_interval: 30,
      ...(alternates > 0 ? { alternates } : {}),
    };
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new RoutingError(`Směrovací server není dostupný: ${e instanceof Error ? e.message : e}`, 502, e instanceof Error ? e.message : String(e));
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (json.error as string) ?? `HTTP ${res.status}`;
      throw new RoutingError(`Směrovací server vrátil chybu: ${msg}`, res.status === 400 ? 422 : 502, msg);
    }
    const trips = [json.trip, ...((json.alternates as Array<{ trip: unknown }> | undefined)?.map((a) => a.trip) ?? [])];
    return trips.filter(Boolean).map((t) => {
      const trip = t as { legs: Array<{ shape: string; elevation?: number[]; elevation_interval?: number }>; summary: { length: number; time: number } };
      const coords: LngLat[] = [];
      const elev: number[] = [];
      let hasElev = true;
      let interval: number | null = null;
      for (const leg of trip.legs) {
        const c = decodePolyline(leg.shape, 6);
        coords.push(...(coords.length ? c.slice(1) : c));
        if (Array.isArray(leg.elevation)) {
          elev.push(...leg.elevation);
          interval = leg.elevation_interval ?? 30;
        } else hasElev = false;
      }
      return { coords, elevation: hasElev && elev.length ? elev : null, interval, distance: trip.summary.length * 1000, duration: trip.summary.time };
    });
  }

  async routeOnce(points: LngLat[], req: Pick<RouteRequest, 'rideType' | 'preference'>): Promise<RouteCandidate> {
    const v = variantsFor(req.preference, req.rideType)[0];
    const [t] = await this.call(points, req.rideType, v, 0);
    if (!t) throw new RoutingError('Směrovací server nevrátil trasu.', 422);
    return {
      id: 'once',
      variant: v.label,
      coordinates: t.coords,
      elevation: t.elevation,
      elevationInterval: t.interval,
      distance: t.distance,
      duration: t.duration,
      provider: this.id,
    };
  }

  async route(req: RouteRequest): Promise<RouteResponse> {
    const pts = [...req.waypoints];
    if (req.roundTrip && pts.length >= 2) pts.push(pts[0]);
    if (pts.length < 2) throw new RoutingError('Zadejte alespoň start a cíl.', 400);
    if (pts.length > 20) throw new RoutingError('Maximálně 20 bodů trasy.', 400);
    const variants = variantsFor(req.preference, req.rideType);
    const candidates: RouteCandidate[] = [];
    const warnings: string[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      try {
        const trips = await this.call(pts, req.rideType, v, i === 0 && pts.length === 2 ? 2 : 0);
        trips.forEach((t, ti) => {
          if (candidates.some((c) => similar(c.coordinates, t.coords, c.distance, t.distance))) return;
          candidates.push({
            id: `v${i}-${ti}`,
            variant: ti === 0 ? v.label : `${v.label} – alternativa ${ti}`,
            coordinates: t.coords,
            elevation: t.elevation,
            elevationInterval: t.interval,
            distance: t.distance,
            duration: t.duration,
            provider: this.id,
          });
        });
      } catch (e) {
        if (i === 0) throw e; // primary request failed → report error, do not fabricate
        warnings.push(`Varianta „${v.label}“ selhala: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { provider: this.id, attribution: this.attribution, candidates, warnings };
  }
}
