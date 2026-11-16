import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export function registerStairsRoutes(app: FastifyInstance, { stairs }: AppDeps) {
  // Bounded wait: if Overpass is slow or blocked, the client falls back to map-tile data instead of hanging.
  app.get('/api/stairs', async (_req, reply) => {
    await stairs.waitForData(15000);
    reply.header('Cache-Control', 'no-cache');
    return stairs.get();
  });

  app.post('/api/stairs/refresh', async (_req, reply) => {
    if (!stairs.available) {
      reply.status(404);
      return { error: 'Hledání schodů není nakonfigurováno (OVERPASS_URLS).', code: 'not_configured' };
    }
    try {
      await stairs.refresh();
      return stairs.get();
    } catch (e) {
      reply.status(502);
      return { error: e instanceof Error ? e.message : String(e), code: 'data_unavailable', meta: stairs.getMeta() };
    }
  });
}
