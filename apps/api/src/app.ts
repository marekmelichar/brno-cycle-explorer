import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { ApiConfig } from './config';
import type { InfrastructureService } from './services/infrastructure-service';
import type { RoutingProvider } from './adapters/routing/types';
import type { NominatimGeocoder } from './adapters/geocoding/nominatim';
import type { StairsService } from './services/stairs-service';
import { registerHealthRoutes } from './routes/health';
import { registerInfrastructureRoutes } from './routes/infrastructure';
import { registerRoutingRoutes } from './routes/routing';
import { registerGeocodeRoutes } from './routes/geocode';
import { registerStairsRoutes } from './routes/stairs';

export interface AppDeps {
  config: ApiConfig;
  infrastructure: InfrastructureService;
  routing: RoutingProvider;
  geocoder: NominatimGeocoder | null;
  stairs: StairsService;
}

export async function buildApp(deps: AppDeps, opts: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: deps.config.logLevel },
    bodyLimit: 30 * 1024 * 1024,
    trustProxy: true,
  });
  await app.register(cors, { origin: deps.config.corsOrigin });
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'Request failed');
    reply.status(status).send({ error: status >= 500 && !err.statusCode ? 'Interní chyba serveru.' : err.message, code: status === 400 ? 'invalid' : 'server_error' });
  });
  registerHealthRoutes(app, deps);
  registerInfrastructureRoutes(app, deps);
  registerRoutingRoutes(app, deps);
  registerGeocodeRoutes(app, deps);
  registerStairsRoutes(app, deps);
  return app;
}
