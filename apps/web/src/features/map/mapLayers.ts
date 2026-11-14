import type { Map as MlMap, StyleSpecification, ExpressionSpecification } from 'maplibre-gl';
import { CATEGORIES, CATEGORY_ORDER, UNMATCHED_COLOR, type InfraCategory } from '@bce/shared';

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Placeholder style shown while the real basemap style loads (no external requests). */
export const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bce-blank', type: 'background', paint: { 'background-color': '#dfe4ea' } }],
};

export const infraLayerId = (c: InfraCategory) => `bce-infra-${c}`;
export const INFRA_LAYER_IDS = CATEGORY_ORDER.map(infraLayerId);
export const ROUTE_LAYER_IDS = ['bce-route-matched', 'bce-route-unmatched'];

export interface OverlayData {
  infra: GeoJSON.FeatureCollection;
  route: GeoJSON.FeatureCollection;
  candidates: GeoJSON.FeatureCollection;
  manual: GeoJSON.FeatureCollection;
  selectedSection: GeoJSON.FeatureCollection;
}

/** (Re)creates all application overlays. Called after every style load, so switching basemaps keeps overlays. */
export function addOverlays(map: MlMap, data: OverlayData) {
  const src = (id: string, d: GeoJSON.FeatureCollection, promoteId?: string) => {
    if (map.getSource(id)) return;
    map.addSource(id, { type: 'geojson', data: d, ...(promoteId ? { promoteId } : {}) });
  };
  src('bce-infra', data.infra, 'id');
  src('bce-route', data.route);
  src('bce-candidates', data.candidates);
  src('bce-manual', data.manual);
  src('bce-selected-section', data.selectedSection);

  // Insert every overlay BELOW the basemap's first label layer, so street names, road numbers and
  // place labels stay readable on top of the cycling lines.
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  const add = (layer: Parameters<MlMap['addLayer']>[0]) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, firstLabel);
  };

  add({
    id: 'bce-candidates',
    type: 'line',
    source: 'bce-candidates',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#334155', 'line-width': 4, 'line-opacity': 0.55, 'line-dasharray': [1.5, 1.2] },
  });

  add({
    id: 'bce-infra-casing',
    type: 'line',
    source: 'bce-infra',
    filter: ['!=', ['get', 'category'], 'not_infrastructure'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#0b1220',
      'line-opacity': 0.45,
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 5, 17, 9],
    },
  });

  for (const c of CATEGORY_ORDER) {
    const info = CATEGORIES[c];
    add({
      id: infraLayerId(c),
      type: 'line',
      source: 'bce-infra',
      filter: ['==', ['get', 'category'], c],
      layout: { 'line-cap': info.dash ? 'butt' : 'round', 'line-join': 'round' },
      paint: {
        'line-color': info.color,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          info.width * 0.45,
          14,
          info.width,
          17,
          info.width * 1.9,
        ] as ExpressionSpecification,
        ...(info.dash ? { 'line-dasharray': info.dash } : {}),
      },
    });
  }

  add({
    id: 'bce-infra-hover',
    type: 'line',
    source: 'bce-infra',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 8, 17, 13],
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.55, 0],
    },
  });
  add({
    id: 'bce-infra-selected',
    type: 'line',
    source: 'bce-infra',
    filter: ['==', ['get', 'id'], -1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#22d3ee', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 9, 17, 14], 'line-opacity': 0.75 },
  });

  add({
    id: 'bce-route-casing',
    type: 'line',
    source: 'bce-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0b1220', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 15, 11], 'line-opacity': 0.85 },
  });
  add({
    id: 'bce-route-matched',
    type: 'line',
    source: 'bce-route',
    filter: ['!=', ['get', 'category'], 'unmatched'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 15, 7] },
  });
  add({
    id: 'bce-route-unmatched',
    type: 'line',
    source: 'bce-route',
    filter: ['==', ['get', 'category'], 'unmatched'],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#f1f5f9',
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 6],
      'line-dasharray': [1.2, 1],
    },
  });
  add({
    id: 'bce-route-selected',
    type: 'line',
    source: 'bce-selected-section',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#22d3ee', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 9, 15, 15], 'line-opacity': 0.6 },
  });

  add({
    id: 'bce-manual-line',
    type: 'line',
    source: 'bce-manual',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#f97316', 'line-width': 3, 'line-dasharray': [2, 1] },
  });
  add({
    id: 'bce-manual-points',
    type: 'circle',
    source: 'bce-manual',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 5, 'circle-color': '#f97316', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
  });
}

export function setSourceData(map: MlMap, id: string, data: GeoJSON.FeatureCollection) {
  const s = map.getSource(id) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
  s?.setData?.(data);
}

export { UNMATCHED_COLOR };
