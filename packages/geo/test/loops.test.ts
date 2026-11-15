import { describe, expect, it } from 'vitest';
import { destination, haversine } from '../src/distance';
import { LOOP_ROAD_FACTOR, loopRadius, loopWaypoints, rescaleRadius } from '../src/loops';

const START: [number, number] = [16.6428, 49.2104];

describe('loop geometry', () => {
  it('destination() goes the requested distance and direction', () => {
    const north = destination(START, 0, 1000);
    expect(haversine(START, north)).toBeCloseTo(1000, 0);
    expect(north[0]).toBeCloseTo(START[0], 6);
    expect(north[1]).toBeGreaterThan(START[1]);
    const east = destination(START, 90, 2500);
    expect(haversine(START, east)).toBeCloseTo(2500, 0);
    expect(east[0]).toBeGreaterThan(START[0]);
  });

  it('helper points lie on a ring through the start, heading out in the chosen direction', () => {
    const r = 2000;
    const pts = loopWaypoints(START, 90, r);
    expect(pts).toHaveLength(3);
    const centre = destination(START, 90, r);
    for (const p of pts) expect(haversine(centre, p)).toBeCloseTo(r, -1);
    // the point opposite the start is ~2r east of it
    expect(haversine(START, pts[1])).toBeCloseTo(2 * r, -1);
    expect(pts[1][0]).toBeGreaterThan(START[0]);
    // ideal polygon length ≈ 4·r·√2 (square inscribed in the ring)
    const poly = [START, ...pts, START];
    let len = 0;
    for (let i = 1; i < poly.length; i++) len += haversine(poly[i - 1], poly[i]);
    expect(len / (4 * r * Math.SQRT2)).toBeCloseTo(1, 2);
  });

  it('radius scales with the target and rescaling is clamped', () => {
    expect(loopRadius(30000)).toBeCloseTo(30000 / (2 * Math.PI * LOOP_ROAD_FACTOR), 6);
    expect(rescaleRadius(1000, 30000, 36000)).toBeCloseTo(833.33, 1);
    expect(rescaleRadius(1000, 30000, 1000)).toBe(2000); // clamped ×2
    expect(rescaleRadius(1000, 30000, 300000)).toBe(500); // clamped ×0.5
  });
});
