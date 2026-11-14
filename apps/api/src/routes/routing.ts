import type { FastifyInstance } from 'fastify';
import type { RouteRequest } from '@bce/shared';
import type { AppDeps } from '../app';
import { RoutingError } from '../adapters/routing/types';

const schema = {
  body: {
    type: 'object',
    required: ['waypoints', 'rideType', 'preference'],
    properties: {
      waypoints: {
        type: 'array',
        minItems: 2,
        maxItems: 20,
        items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
      },
      rideType: { type: 'string', enum: ['leisure', 'urban', 'ebike', 'sport'] },
      preference: { type: 'string', enum: ['max_paths', 'min_roads', 'min_climb', 'shortest'] },
      roundTrip: { type: 'boolean' },
      engine: { type: 'string', enum: ['brouter', 'valhalla'] },
    },
  },
} as const;

export function registerRoutingRoutes(app: FastifyInstance, { routing }: AppDeps) {
  app.post<{ Body: RouteRequest }>('/api/route', { schema }, async (req, reply) => {
    for (const [lon, lat] of req.body.waypoints) {
      if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) {
        reply.status(400);
        return { error: 'Neplatné souřadnice bodu trasy.' };
      }
    }
    try {
      return await routing.route(req.body);
    } catch (e) {
      const status = e instanceof RoutingError ? e.statusCode : 502;
      reply.status(status);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
}
