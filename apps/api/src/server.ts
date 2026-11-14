import { loadConfig } from './config';
import { buildApp } from './app';
import { ArcGisClient } from './adapters/brno-gis/arcgis-client';
import { FileCache } from './cache/file-cache';
import { InfrastructureService } from './services/infrastructure-service';
import { NoRoutingProvider, type RoutingProvider } from './adapters/routing/types';
import { ValhallaProvider } from './adapters/routing/valhalla';
import { NominatimGeocoder } from './adapters/geocoding/nominatim';
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
const routing: RoutingProvider =
  config.routingProvider === 'valhalla' ? new ValhallaProvider(config.valhallaUrl, config.routingTimeoutMs) : new NoRoutingProvider();
const geocoder = config.geocoderEnabled ? new NominatimGeocoder(config.geocoderUrl, config.geocoderUserAgent) : null;

const app = await buildApp({ config, infrastructure, routing, geocoder });
await infrastructure.init(config.refreshOnStartIfOlderThanHours);
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
