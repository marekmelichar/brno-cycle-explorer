import type { FastifyInstance } from 'fastify';
import type { AppConfig, HealthResponse } from '@bce/shared';
import type { AppDeps } from '../app';

const started = Date.now();

export function registerHealthRoutes(app: FastifyInstance, { config, infrastructure, routing, geocoder }: AppDeps) {
  app.get('/api/health', async (): Promise<HealthResponse> => {
    const meta = infrastructure.getMeta();
    return {
      status: meta.featureCount > 0 ? 'ok' : 'degraded',
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      version: config.version,
      dataset: { featureCount: meta.featureCount, lastRefreshed: meta.lastRefreshed, lastError: meta.lastError?.message ?? null },
      routing: { provider: routing.id, available: routing.available },
    };
  });

  app.get('/api/config', async (): Promise<AppConfig> => ({
    basemaps: config.basemaps,
    defaultBasemap: config.defaultBasemap,
    routing: { provider: routing.id, available: routing.available, description: routing.description, attribution: routing.attribution },
    geocoding: { provider: geocoder ? 'nominatim' : 'none', available: !!geocoder, attribution: geocoder?.attribution ?? '' },
    infrastructureSource: config.arcgisLayerUrl,
  }));
}
