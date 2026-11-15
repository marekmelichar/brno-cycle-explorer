import type { RouteCandidate, RouteRequest, RouteResponse } from '@bce/shared';
import { LOOP_DIRECTIONS, loopRadius, loopWaypoints, rescaleRadius } from '@bce/geo';
import { RoutingError, type RoutingProvider } from './types';

/** Loops within ±10 % of the requested length are accepted without another attempt. */
export const LOOP_TOLERANCE = 0.1;
export const MIN_LOOP = 3000;
export const MAX_LOOP = 150000;

/**
 * Plans round trips of about `targetDistance` from a single start: for each of four directions,
 * helper points on a ring around the start are routed by the engine (its primary, pleasant
 * variant); if the loop misses the target by more than 10 %, the ring is resized once.
 * Directions that fail are reported as warnings; nothing is ever invented.
 */
export async function planLoops(engine: RoutingProvider, req: RouteRequest): Promise<RouteResponse> {
  if (!engine.routeOnce) throw new RoutingError('Tento směrovač neumí plánovat okruhy.', 400);
  const target = req.targetDistance!;
  if (!(target >= MIN_LOOP && target <= MAX_LOOP)) throw new RoutingError(`Délka okruhu musí být ${MIN_LOOP / 1000}–${MAX_LOOP / 1000} km.`, 400);
  const start = req.waypoints[0];
  const candidates: RouteCandidate[] = [];
  const warnings: string[] = [];
  let lastError: unknown;

  for (const dir of LOOP_DIRECTIONS) {
    let radius = loopRadius(target);
    let best: RouteCandidate | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const c = await engine.routeOnce([start, ...loopWaypoints(start, dir.bearing, radius), start], req);
        if (!best || Math.abs(c.distance - target) < Math.abs(best.distance - target)) best = c;
        if (Math.abs(c.distance / target - 1) <= LOOP_TOLERANCE) break;
        radius = rescaleRadius(radius, target, c.distance);
      } catch (e) {
        lastError = e;
        break; // e.g. a helper point in a place without roads: skip this direction
      }
    }
    if (best) {
      candidates.push({ ...best, id: `loop-${dir.code}`, variant: `Okruh – směr ${dir.code}`, variantCode: `loop.${dir.code}`, alternative: 0, targetDistance: target });
    } else {
      warnings.push(`Okruh směrem ${dir.code} se nepodařilo naplánovat.`);
    }
  }
  if (!candidates.length) {
    if (lastError instanceof RoutingError) throw lastError;
    throw new RoutingError('Okruh se nepodařilo naplánovat.', 502);
  }
  return { provider: engine.id, attribution: engine.attribution, candidates, warnings };
}

/** A request asks for loop planning: round trip from one start with a target length. */
export const isLoopRequest = (req: RouteRequest) => !!req.roundTrip && !!req.targetDistance && req.waypoints.length === 1;
