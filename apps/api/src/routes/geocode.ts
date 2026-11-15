import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

export function registerGeocodeRoutes(app: FastifyInstance, { geocoder }: AppDeps) {
  app.get<{ Querystring: { lat?: string; lon?: string } }>('/api/geocode/reverse', async (req, reply) => {
    if (!geocoder) {
      reply.status(503);
      return { error: 'Vyhledávání adres není nakonfigurováno.', code: 'geocoder_disabled' };
    }
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      reply.status(400);
      return { error: 'Neplatné souřadnice.', code: 'invalid' };
    }
    try {
      return await geocoder.reverse(lat, lon);
    } catch (e) {
      reply.status(502);
      return { error: `Vyhledání názvu selhalo: ${e instanceof Error ? e.message : e}`, code: 'geocoder_failed', detail: e instanceof Error ? e.message : String(e) };
    }
  });

  app.get<{ Querystring: { q?: string; viewbox?: string; lang?: string } }>('/api/geocode', async (req, reply) => {
    if (!geocoder) {
      reply.status(503);
      return { error: 'Vyhledávání adres není nakonfigurováno.', code: 'geocoder_disabled' };
    }
    const q = (req.query.q ?? '').trim();
    if (q.length < 3 || q.length > 200) {
      reply.status(400);
      return { error: 'Zadejte 3 až 200 znaků.', code: 'query_length' };
    }
    try {
      const vb = (req.query.viewbox ?? '').split(',').map(Number);
      const viewbox =
        vb.length === 4 && vb.every(Number.isFinite) && vb[0] < vb[2] && vb[1] < vb[3] && Math.abs(vb[1]) <= 90 && Math.abs(vb[3]) <= 90
          ? (vb as [number, number, number, number])
          : undefined;
      return { results: await geocoder.search(q, { viewbox, lang: req.query.lang === 'en' ? 'en' : 'cs' }) };
    } catch (e) {
      reply.status(502);
      return { error: `Vyhledávání selhalo: ${e instanceof Error ? e.message : e}`, code: 'geocoder_failed', detail: e instanceof Error ? e.message : String(e) };
    }
  });
}
