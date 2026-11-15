import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export function registerGeocodeRoutes(app: FastifyInstance, { geocoder }: AppDeps) {
  app.get<{ Querystring: { lat?: string; lon?: string } }>('/api/geocode/reverse', async (req, reply) => {
    if (!geocoder) {
      reply.status(503);
      return { error: 'Vyhledávání adres není nakonfigurováno.' };
    }
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      reply.status(400);
      return { error: 'Neplatné souřadnice.' };
    }
    try {
      return await geocoder.reverse(lat, lon);
    } catch (e) {
      reply.status(502);
      return { error: `Vyhledání názvu selhalo: ${e instanceof Error ? e.message : e}` };
    }
  });

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
