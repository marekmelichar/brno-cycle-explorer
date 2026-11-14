import type { LngLat } from '@bce/shared';

/** WGS84 mean earth radius used by haversine (IUGG). */
export const EARTH_RADIUS_M = 6371008.8;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function isValidLngLat(c: unknown): c is LngLat {
  if (!Array.isArray(c) || c.length < 2) return false;
  const [lon, lat] = c as number[];
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/** Great-circle distance in metres (haversine). */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function lineLength(coords: LngLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += haversine(coords[i - 1], coords[i]);
  return sum;
}

/** Initial bearing (degrees, 0..360) from a to b. */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Linear interpolation along the segment (accurate for short segments). */
export function interpolate(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Local equirectangular projection to metres around a reference latitude.
 * Error < 0.1 % within ~50 km, which is ample for city-scale matching.
 */
export function makeLocalProjection(refLat: number) {
  const kx = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(toRad(refLat));
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  return {
    project: (c: LngLat): [number, number] => [c[0] * kx, c[1] * ky],
    metersToDegLon: (m: number) => m / kx,
    metersToDegLat: (m: number) => m / ky,
  };
}

/** Distance (same units as inputs) from point p to segment ab, all in projected metres. */
export function pointSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}

/** Smallest undirected angle between two bearings (0..90). */
export function undirectedAngleDiff(b1: number, b2: number): number {
  let d = Math.abs(b1 - b2) % 180;
  if (d > 90) d = 180 - d;
  return d;
}
