import type { Map as MlMap } from 'maplibre-gl';
import type { LngLat } from '@bce/shared';

/** The single MapLibre instance, for panels that need to read the view (set by MapView). */
let current: MlMap | null = null;

export const setMapHandle = (m: MlMap | null) => {
  current = m;
};
export const getMapHandle = () => current;

export function mapCenter(): LngLat | null {
  const c = current?.getCenter();
  return c ? [c.lng, c.lat] : null;
}
