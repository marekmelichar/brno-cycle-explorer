import bbox from '@turf/bbox';
import type { LngLat } from '@bce/shared';

export function linesBounds(lines: LngLat[][]): [number, number, number, number] | null {
  const coords = lines.flat();
  if (coords.length === 0) return null;
  const b = bbox({ type: 'MultiLineString', coordinates: lines }) as [number, number, number, number];
  return b;
}

export const BRNO_CENTER: LngLat = [16.6068, 49.1951];
export const BRNO_BOUNDS: [number, number, number, number] = [16.45, 49.12, 16.75, 49.3];

export function downloadText(filename: string, text: string, mime = 'application/gpx+xml') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'trasa';
}
