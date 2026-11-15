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
