import type { InfraCategory } from './categories';

export type LngLat = [number, number];

/** Original attributes as published by the municipality (kept verbatim for inspection). */
export interface MunicipalProperties {
  ObjectId?: number;
  ogcfid?: number;
  typ_opatreni?: string | null;
  rok_realizace?: number | null;
  delka?: number | null;
  datum_exportu?: string | number | null;
  Shape__Length?: number | null;
  GlobalID?: string;
  [key: string]: unknown;
}

export interface InfraFeatureProperties {
  /** Stable numeric id (ObjectId) used for feature-state highlighting */
  id: number;
  category: InfraCategory;
  originalType: string | null;
  year: number | null;
  /** Length recorded by the municipality (delka, metres) */
  recordedLength: number | null;
  /** Geodesic length computed from the WGS84 geometry (metres) */
  geodesicLength: number;
  source: 'official' | 'imported';
  original: MunicipalProperties;
}

export interface InfraFeature {
  type: 'Feature';
  id: number;
  geometry:
    | { type: 'LineString'; coordinates: LngLat[] }
    | { type: 'MultiLineString'; coordinates: LngLat[][] };
  properties: InfraFeatureProperties;
}

export interface InfraFeatureCollection {
  type: 'FeatureCollection';
  features: InfraFeature[];
}

/** Language-neutral warnings about the downloaded / imported dataset. */
export type DataWarning =
  | { code: 'mercator_converted' }
  | { code: 'missing_fields'; fields: string[] }
  | { code: 'skipped_no_geometry'; count: number }
  | { code: 'no_geojson_support' }
  | { code: 'unexpected_geometry'; type: string }
  | { code: 'partial'; received: number; expected: number };

export interface DatasetMeta {
  source: 'official' | 'imported' | 'none';
  sourceUrl: string;
  layerName: string | null;
  featureCount: number;
  expectedCount: number | null;
  /** ISO timestamp of the last successful download */
  lastRefreshed: string | null;
  /** Latest value of datum_exportu in the records */
  latestExportDate: string | null;
  lastError: { message: string; at: string; code?: 'data_unavailable' } | null;
  /** Data-quality notes about the source (codes; plain strings only in caches written before 15 Nov 2026) */
  schemaWarnings: Array<DataWarning | string>;
  distinctTypes: Array<{ value: string | null; count: number; category: InfraCategory }>;
  refreshing: boolean;
}

export interface InfrastructureResponse {
  meta: DatasetMeta;
  data: InfraFeatureCollection;
}

export interface BasemapStyle {
  id: string;
  label: string;
  url: string;
  dark: boolean;
  attribution?: string;
}

export interface RoutingEngineInfo {
  id: string;
  label: string;
  description: string;
  attribution: string;
}

export interface AppConfig {
  basemaps: BasemapStyle[];
  defaultBasemap: string;
  routing: {
    provider: string;
    available: boolean;
    description: string;
    attribution: string;
    engines: RoutingEngineInfo[];
    defaultEngine: string | null;
  };
  geocoding: { provider: string; available: boolean; attribution: string };
  /** Stairs finder (OSM via Overpass). */
  stairs: { available: boolean };
  infrastructureSource: string;
}

export type RideType = 'leisure' | 'urban' | 'ebike' | 'sport';
export type RoutePreference = 'max_paths' | 'min_roads' | 'min_climb' | 'shortest';

export interface RouteRequest {
  waypoints: LngLat[];
  rideType: RideType;
  preference: RoutePreference;
  roundTrip?: boolean;
  /** Routing engine id (e.g. "brouter", "valhalla"); defaults to the server's default engine. */
  engine?: string;
  /**
   * Desired loop length (m). With roundTrip and a single waypoint (the start), the server plans
   * loops of about this length in several directions instead of a point-to-point route.
   */
  targetDistance?: number;
}

/** OSM tags of the ways a calculated route uses, as distance intervals along that route (metres). */
export interface OsmInterval {
  from: number;
  to: number;
  tags: Record<string, string>;
}

export interface RouteCandidate {
  id: string;
  /** Description of how the candidate was produced (e.g. engine parameters), Czech */
  variant: string;
  /** Language-neutral variant id (e.g. "brouter.pleasant", "loop.n") and alternative number, for translation */
  variantCode?: string;
  alternative?: number;
  /** For planned loops: the requested length (m) */
  targetDistance?: number;
  coordinates: LngLat[];
  /** Elevation profile samples (m), if the engine provided them */
  elevation: number[] | null;
  elevationInterval: number | null;
  distance: number;
  duration: number;
  provider: string;
  /** OSM way tags along the route (BRouter only); null when the engine does not report them. */
  osm?: OsmInterval[] | null;
}

export interface RouteResponse {
  provider: string;
  attribution: string;
  candidates: RouteCandidate[];
  warnings: string[];
}

export interface GeocodeResult {
  id: string;
  label: string;
  lat: number;
  lon: number;
  type: string;
  bbox?: [number, number, number, number];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  version: string;
  dataset: { featureCount: number; lastRefreshed: string | null; lastError: string | null };
  routing: { provider: string; available: boolean };
}

/** A staircase from OpenStreetMap (highway=steps), possibly joined from several connected flights. */
export interface Stair {
  /** "osm:123" or "osm:123+456" (joined flights); "tile:…" for map-tile fallback data. */
  id: string;
  /** OSM way ids (empty for tile data). */
  osmIds: number[];
  name: string | null;
  /** Ordered from one end to the other; `lines[0][0]` is the start of the chain. */
  lines: LngLat[][];
  length: number;
  /** Sum of `step_count` over all flights; null when no flight has it. */
  stepCount: number | null;
  /** Some flights lack `step_count`, so `stepCount` is a lower bound. */
  stepCountPartial: boolean;
  /** Estimated height drop (m) from the step count (~16 cm per step); null without a step count. */
  drop: number | null;
  /** Upper/lower end, known only from OSM `incline` (up/down); null when OSM does not say. */
  top: LngLat | null;
  bottom: LngLat | null;
  surface: string | null;
  /** Narrowest flight width (m). */
  width: number | null;
  handrail: boolean | null;
  lit: boolean | null;
  /** A ramp/wheel channel (ramp:bicycle, ramp:stroller, ramp=yes). */
  ramp: boolean | null;
  /** OSM `bicycle` tag of any flight that sets it (no beats yes). */
  bicycle: string | null;
  /** Indoor, in a tunnel/underpass, covered or below ground. */
  sheltered: boolean;
  /** access/foot = private or no. */
  restricted: boolean;
}

export interface StairsMeta {
  source: 'overpass' | 'none';
  /** Overpass endpoint that served the data. */
  sourceUrl: string | null;
  count: number;
  lastRefreshed: string | null;
  /** OSM data timestamp reported by Overpass. */
  osmTimestamp: string | null;
  lastError: { message: string; at: string } | null;
  refreshing: boolean;
  /** When the next automatic attempt runs after a failed first download (null when not scheduled). */
  nextRetryAt: string | null;
}

export interface StairsResponse {
  meta: StairsMeta;
  stairs: Stair[];
}
