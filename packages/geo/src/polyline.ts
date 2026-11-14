import type { LngLat } from '@bce/shared';

/** Decodes an encoded polyline (Valhalla uses precision 6). Returns [lon, lat] pairs. */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  let index = 0, lat = 0, lng = 0;
  const coords: LngLat[] = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, byte: number;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < str.length + 1);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}
