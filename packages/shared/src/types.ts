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
  lastError: { message: string; at: string } | null;
  schemaWarnings: string[];
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

export interface AppConfig {
  basemaps: BasemapStyle[];
  defaultBasemap: string;
  routing: { provider: string; available: boolean; description: string; attribution: string };
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
}

export interface RouteCandidate {
  id: string;
  /** Description of how the candidate was produced (e.g. engine parameters) */
  variant: string;
  coordinates: LngLat[];
  /** Elevation profile samples (m), if the engine provided them */
  elevation: number[] | null;
  elevationInterval: number | null;
  distance: number;
  duration: number;
  provider: string;
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
