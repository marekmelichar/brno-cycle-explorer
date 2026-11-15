import { describe, expect, it } from 'vitest';
import type { LngLat, RouteCandidate } from '@bce/shared';
import { haversine } from '@bce/geo';
import { isLoopRequest, planLoops } from '../src/adapters/routing/loops';
import { RoutingError, type RoutingProvider } from '../src/adapters/routing/types';

const START: LngLat = [16.6428, 49.2104];
const base = { waypoints: [START], rideType: 'ebike' as const, preference: 'max_paths' as const, roundTrip: true, targetDistance: 20000 };

/** Fake engine: routed length = polygon length × factor; optionally fails in some directions. */
function fakeEngine(factor: number, failIf?: (pts: LngLat[]) => boolean) {
  const calls: LngLat[][] = [];
  const engine: RoutingProvider = {
    id: 'fake',
    available: true,
    description: 'fake',
    attribution: 'fake',
    route: async () => ({ provider: 'fake', attribution: '', candidates: [], warnings: [] }),
    routeOnce: async (pts) => {
      calls.push(pts);
      if (failIf?.(pts)) throw new RoutingError('no track found', 422);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += haversine(pts[i - 1], pts[i]);
      return { id: 'x', variant: 'v', coordinates: pts, elevation: null, elevationInterval: null, distance: len * factor, duration: 1, provider: 'fake' } as RouteCandidate;
    },
  };
  return { engine, calls };
}

describe('loop planner', () => {
  it('plans four closed loops near the target, resizing once when needed', async () => {
    const { engine, calls } = fakeEngine(1.6); // roads much longer than the ring → needs a resize
    const r = await planLoops(engine, base);
    expect(r.candidates.map((c) => c.variantCode)).toEqual(['loop.n', 'loop.e', 'loop.s', 'loop.w']);
    for (const c of r.candidates) {
      expect(Math.abs(c.distance / 20000 - 1)).toBeLessThanOrEqual(0.1);
      expect(c.coordinates[0]).toEqual(START);
      expect(c.coordinates.at(-1)).toEqual(START);
      expect(c.targetDistance).toBe(20000);
    }
    expect(calls.length).toBe(8); // 2 attempts per direction
  });

  it('accepts a loop on the first try when it is already within 10 %', async () => {
    const { engine, calls } = fakeEngine(1.3 * (2 * Math.PI) / (4 * Math.SQRT2)); // ≈ exact target
    await planLoops(engine, base);
    expect(calls.length).toBe(4);
  });

  it('skips directions that fail and reports them', async () => {
    const { engine } = fakeEngine(1.3, (pts) => pts[2][1] < START[1] - 0.01); // fails heading south
    const r = await planLoops(engine, base);
    expect(r.candidates.map((c) => c.variantCode)).not.toContain('loop.s');
    expect(r.warnings.length).toBe(1);
  });

  it('reports the engine error when every direction fails, and validates the length', async () => {
    const { engine } = fakeEngine(1.3, () => true);
    await expect(planLoops(engine, base)).rejects.toMatchObject({ statusCode: 422 });
    await expect(planLoops(fakeEngine(1.3).engine, { ...base, targetDistance: 500 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('only single-start round trips with a length are loop requests', () => {
    expect(isLoopRequest(base)).toBe(true);
    expect(isLoopRequest({ ...base, roundTrip: false })).toBe(false);
    expect(isLoopRequest({ ...base, targetDistance: undefined })).toBe(false);
    expect(isLoopRequest({ ...base, waypoints: [START, [16.6, 49.19]] })).toBe(false);
  });
});
