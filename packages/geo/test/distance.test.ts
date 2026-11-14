import { describe, expect, it } from 'vitest';
import turfLength from '@turf/length';
import { bearing, haversine, isValidLngLat, lineLength, undirectedAngleDiff } from '../src/distance';
import { decodePolyline } from '../src/polyline';

describe('geodesic distance', () => {
  it('haversine: 1 degree of latitude ≈ 111.2 km', () => {
    expect(haversine([16.6, 49], [16.6, 50])).toBeCloseTo(111195, -1);
  });
  it('haversine is zero for identical points and symmetric', () => {
    expect(haversine([16.6, 49.2], [16.6, 49.2])).toBe(0);
    const a: [number, number] = [16.60, 49.19];
    const b: [number, number] = [16.65, 49.21];
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
  });
  it('Brno: Hlavní nádraží → Náměstí Svobody ≈ 600 m', () => {
    const d = haversine([16.6127, 49.1906], [16.6081, 49.1946]);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(650);
  });
  it('lineLength agrees with Turf.js within 0.01 %', () => {
    const line: [number, number][] = [[16.60, 49.19], [16.61, 49.195], [16.63, 49.20], [16.64, 49.21]];
    const turf = turfLength({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }, { units: 'meters' });
    expect(Math.abs(lineLength(line) - turf) / turf).toBeLessThan(1e-4);
  });
  it('validates coordinates', () => {
    expect(isValidLngLat([16.6, 49.2])).toBe(true);
    expect(isValidLngLat([NaN, 49.2])).toBe(false);
    expect(isValidLngLat([200, 49.2])).toBe(false);
    expect(isValidLngLat([16.6, -95])).toBe(false);
    expect(isValidLngLat(['16', 49] as unknown)).toBe(false);
    expect(isValidLngLat([16.6])).toBe(false);
  });
  it('bearing and undirected angle', () => {
    expect(bearing([16.6, 49.2], [16.6, 49.3])).toBeCloseTo(0, 5);
    expect(bearing([16.6, 49.2], [16.7, 49.2])).toBeCloseTo(90, 0);
    expect(undirectedAngleDiff(10, 190)).toBe(0);
    expect(undirectedAngleDiff(0, 90)).toBe(90);
    expect(undirectedAngleDiff(350, 20)).toBe(30);
  });
  it('decodes polyline6', () => {
    // encoded with precision 6: (49.2, 16.6) -> (49.21, 16.61)
    const enc = '_w|y|A_{dt^_pR_pR';
    const pts = decodePolyline(enc, 6);
    expect(pts[0][0]).toBeCloseTo(16.6, 5);
    expect(pts[0][1]).toBeCloseTo(49.2, 5);
    expect(pts[1][0]).toBeCloseTo(16.61, 5);
    expect(pts[1][1]).toBeCloseTo(49.21, 5);
  });
});
