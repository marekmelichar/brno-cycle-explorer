import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export function registerInfrastructureRoutes(app: FastifyInstance, { infrastructure }: AppDeps) {
  app.get('/api/infrastructure', async (_req, reply) => {
    await infrastructure.waitForData(60000);
    reply.header('Cache-Control', 'no-cache');
    return infrastructure.get();
  });

  app.get('/api/infrastructure/meta', async () => infrastructure.getMeta());

  app.post('/api/infrastructure/refresh', async (_req, reply) => {
    try {
      await infrastructure.refresh();
      return infrastructure.get();
    } catch (e) {
      reply.status(502);
      return { error: e instanceof Error ? e.message : String(e), code: 'data_unavailable', meta: infrastructure.getMeta() };
    }
  });

  app.post('/api/infrastructure/import', async (req, reply) => {
    try {
      await infrastructure.importGeoJson(req.body);
      return infrastructure.get();
    } catch (e) {
      reply.status(400);
      return { error: e instanceof Error ? e.message : String(e), code: 'import_invalid' };
    }
  });
}
