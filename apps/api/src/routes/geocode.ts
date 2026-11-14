import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export function registerGeocodeRoutes(app: FastifyInstance, { geocoder }: AppDeps) {
  app.get<{ Querystring: { q?: string } }>('/api/geocode', async (req, reply) => {
    if (!geocoder) {
      reply.status(503);
      return { error: 'Vyhledávání adres není nakonfigurováno.' };
    }
    const q = (req.query.q ?? '').trim();
    if (q.length < 3 || q.length > 200) {
      reply.status(400);
      return { error: 'Zadejte 3 až 200 znaků.' };
    }
    try {
      return { results: await geocoder.search(q) };
    } catch (e) {
      reply.status(502);
      return { error: `Vyhledávání selhalo: ${e instanceof Error ? e.message : e}` };
    }
  });
}
