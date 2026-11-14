import { DOMParser } from '@xmldom/xmldom';
import { normalizeTypOpatreni, type InfraCategory, type InfraFeature, type LngLat } from '@bce/shared';
import { lineLength } from '../src/distance';

export const xmlParser = new DOMParser() as unknown as { parseFromString(s: string, t: string): Document };

/** Offset a point by metres east/north (local approximation, Brno latitude). */
export function offset([lon, lat]: LngLat, east: number, north: number): LngLat {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  return [lon + east / kx, lat + north / 110574];
}

export const ORIGIN: LngLat = [16.6068, 49.1951];

/** Straight line from origin going east for `len` metres, optionally shifted north. */
export function eastLine(startEast: number, len: number, north = 0, steps = 10): LngLat[] {
  const pts: LngLat[] = [];
  for (let i = 0; i <= steps; i++) pts.push(offset(ORIGIN, startEast + (len * i) / steps, north));
  return pts;
}

let nextId = 1;
export function feature(coords: LngLat[], typ: string | null, category?: InfraCategory): InfraFeature {
  const id = nextId++;
  return {
    type: 'Feature',
    id,
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      id,
      category: category ?? normalizeTypOpatreni(typ),
      originalType: typ,
      year: 2020,
      recordedLength: lineLength(coords),
      geodesicLength: lineLength(coords),
      source: 'official',
      original: { ObjectId: id, typ_opatreni: typ },
    },
  };
}
