import { loadConfig } from './config';
import { buildApp } from './app';
import { ArcGisClient } from './adapters/brno-gis/arcgis-client';
import { FileCache } from './cache/file-cache';
import { InfrastructureService } from './services/infrastructure-service';
import { NoRoutingProvider, type RoutingProvider } from './adapters/routing/types';
import { ValhallaProvider } from './adapters/routing/valhalla';
import { BrouterProvider } from './adapters/routing/brouter';
import { MultiRoutingProvider } from './adapters/routing/multi';
import { NominatimGeocoder } from './adapters/geocoding/nominatim';
import { OverpassClient } from './adapters/osm/overpass-client';
import { StairsService } from './services/stairs-service';
import pino from 'pino';

const config = loadConfig();
const log = pino({ level: config.logLevel });

const client = new ArcGisClient({
  layerUrl: config.arcgisLayerUrl,
  timeoutMs: config.arcgisTimeoutMs,
  batchSize: config.arcgisBatchSize,
  log,
});
const infrastructure = new InfrastructureService(client, new FileCache(config.cacheDir, 'infrastructure'), config.arcgisLayerUrl, log);
const engines = config.routingEngines.map((e) =>
  e === 'brouter' ? new BrouterProvider(config.brouterUrl, config.routingTimeoutMs) : new ValhallaProvider(config.valhallaUrl, config.routingTimeoutMs),
);
const routing: RoutingProvider = engines.length ? new MultiRoutingProvider(engines) : new NoRoutingProvider();
const geocoder = config.geocoderEnabled ? new NominatimGeocoder(config.geocoderUrl, config.geocoderUserAgent) : null;

const overpass = new OverpassClient(config.overpassUrls, { timeoutMs: config.overpassTimeoutMs, userAgent: config.geocoderUserAgent, log });
const stairs = new StairsService(overpass, new FileCache(config.cacheDir, 'stairs'), config.stairsBbox, log);

const app = await buildApp({ config, infrastructure, routing, geocoder, stairs });
await infrastructure.init(config.refreshOnStartIfOlderThanHours);
await stairs.init(config.stairsRefreshDays);
if (stairs.available) {
  // check daily; the service refreshes only data older than STAIRS_REFRESH_DAYS
  setInterval(() => stairs.refreshIfStale(config.stairsRefreshDays), 24 * 3.6e6).unref();
}
if (config.refreshIntervalHours > 0) {
  setInterval(() => infrastructure.refresh().catch(() => undefined), config.refreshIntervalHours * 3.6e6).unref();
}
await app.listen({ port: config.port, host: config.host });
app.log.info({ cacheDir: config.cacheDir, routing: routing.id }, 'Brno Cycle Explorer API ready');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0));
  });
}
