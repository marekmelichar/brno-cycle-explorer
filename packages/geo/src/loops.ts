import type { LngLat } from '@bce/shared';
import { destination } from './distance';

/** Typical ratio between a routed loop and the ideal circle (roads are not circles). */
export const LOOP_ROAD_FACTOR = 1.3;

/** Initial ring radius (m) for a loop of `target` metres. */
export const loopRadius = (target: number) => target / (2 * Math.PI * LOOP_ROAD_FACTOR);

/**
 * Helper points for a loop that starts and ends at `start` and heads out along `bearing`:
 * the ring's centre lies `radius` metres from the start in that direction, and three points sit on
 * the ring at 90° steps, so start → p1 → p2 → p3 → start goes round once (clockwise).
 */
export function loopWaypoints(start: LngLat, bearing: number, radius: number): LngLat[] {
  const centre = destination(start, bearing, radius);
  const back = (bearing + 180) % 360; // direction from the centre to the start
  return [1, 2, 3].map((k) => destination(centre, (back + k * 90) % 360, radius));
}

/** Next radius after a routed loop came out `actual` metres long (clamped to avoid wild jumps). */
export function rescaleRadius(radius: number, target: number, actual: number): number {
  const ratio = Math.min(2, Math.max(0.5, target / Math.max(1, actual)));
  return radius * ratio;
}

export const LOOP_DIRECTIONS = [
  { code: 'n', bearing: 0 },
  { code: 'e', bearing: 90 },
  { code: 's', bearing: 180 },
  { code: 'w', bearing: 270 },
] as const;
