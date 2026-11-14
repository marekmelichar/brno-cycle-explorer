import path from 'node:path';
import type { BasemapStyle } from '@bce/shared';

export interface ApiConfig {
  port: number;
  host: string;
  logLevel: string;
  cacheDir: string;
  arcgisLayerUrl: string;
  arcgisTimeoutMs: number;
  arcgisBatchSize: number;
  refreshIntervalHours: number;
  refreshOnStartIfOlderThanHours: number;
  routingProvider: 'valhalla' | 'none';
  valhallaUrl: string;
  routingTimeoutMs: number;
  geocoderUrl: string;
  geocoderUserAgent: string;
  geocoderEnabled: boolean;
  corsOrigin: string | boolean;
  basemaps: BasemapStyle[];
  defaultBasemap: string;
  version: string;
}

export const DEFAULT_ARCGIS_URL =
  'https://services6.arcgis.com/fUWVlHWZNxUvTUh8/ArcGIS/rest/services/cykloopatreni_realizovana_opendata/FeatureServer/0';

const OFM_ATTR = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data z <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

export const DEFAULT_BASEMAPS: BasemapStyle[] = [
  { id: 'ofm-liberty', label: 'Světlá (OpenFreeMap Liberty)', url: 'https://tiles.openfreemap.org/styles/liberty', dark: false, attribution: OFM_ATTR },
  { id: 'ofm-positron', label: 'Světlá minimalistická (Positron)', url: 'https://tiles.openfreemap.org/styles/positron', dark: false, attribution: OFM_ATTR },
  { id: 'ofm-dark', label: 'Tmavá (OpenFreeMap Dark)', url: 'https://tiles.openfreemap.org/styles/dark', dark: true, attribution: OFM_ATTR },
];

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  let basemaps = DEFAULT_BASEMAPS;
  if (env.BASEMAP_STYLES) {
    try {
      const parsed = JSON.parse(env.BASEMAP_STYLES) as BasemapStyle[];
      if (Array.isArray(parsed) && parsed.length && parsed.every((b) => b.id && b.url && b.label)) basemaps = parsed;
    } catch {
      // keep defaults; logged at startup
    }
  }
  const cors = env.CORS_ORIGIN;
  return {
    port: num(env.API_PORT ?? env.PORT, 3001),
    host: env.API_HOST ?? '0.0.0.0',
    logLevel: env.LOG_LEVEL ?? 'info',
    cacheDir: path.resolve(env.CACHE_DIR ?? path.join(process.cwd(), 'data-cache')),
    arcgisLayerUrl: env.ARCGIS_LAYER_URL ?? DEFAULT_ARCGIS_URL,
    arcgisTimeoutMs: num(env.ARCGIS_TIMEOUT_MS, 30000),
    arcgisBatchSize: num(env.ARCGIS_BATCH_SIZE, 500),
    refreshIntervalHours: num(env.DATA_REFRESH_INTERVAL_HOURS, 24),
    refreshOnStartIfOlderThanHours: num(env.DATA_REFRESH_ON_START_HOURS, 24),
    routingProvider: env.ROUTING_PROVIDER === 'none' ? 'none' : 'valhalla',
    valhallaUrl: (env.VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de').replace(/\/$/, ''),
    routingTimeoutMs: num(env.ROUTING_TIMEOUT_MS, 30000),
    geocoderUrl: (env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
    geocoderUserAgent: env.GEOCODER_USER_AGENT ?? 'BrnoCycleExplorer/1.0 (self-hosted open-source app)',
    geocoderEnabled: env.GEOCODER_ENABLED !== 'false',
    corsOrigin: cors === undefined || cors === '' ? true : cors === 'false' ? false : cors,
    basemaps,
    defaultBasemap: env.DEFAULT_BASEMAP && basemaps.some((b) => b.id === env.DEFAULT_BASEMAP) ? env.DEFAULT_BASEMAP : basemaps[0].id,
    version: env.APP_VERSION ?? '1.0.0',
  };
}
