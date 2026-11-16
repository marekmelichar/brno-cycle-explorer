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
export const STAIRS_LAYER_IDS = ['bce-stairs', 'bce-stairs-casing'];
export const STAIRS_COLOR = '#d21fd2';

export interface OverlayData {
  infra: GeoJSON.FeatureCollection;
  route: GeoJSON.FeatureCollection;
  candidates: GeoJSON.FeatureCollection;
  manual: GeoJSON.FeatureCollection;
  selectedSection: GeoJSON.FeatureCollection;
  /** Start point of the active route (first coordinate). */
  routeStart: GeoJSON.FeatureCollection;
  /** Stairs shown in the Stairs tab (empty elsewhere). */
  stairs: GeoJSON.FeatureCollection;
  /** Selected staircase: its lines plus a Point at the upper end (when known). */
  selectedStair: GeoJSON.FeatureCollection;
}

const ARROW_IMAGE = 'bce-arrow';

/** White chevron with a dark outline, pointing along +x (= line direction for symbol-placement line). */
function createArrowImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const size = 40; // drawn at pixelRatio 2 → 20 css px
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const chevron = () => {
    ctx.beginPath();
    ctx.moveTo(11, 7);
    ctx.lineTo(28, 20);
    ctx.lineTo(11, 33);
  };
  chevron();
  ctx.strokeStyle = '#0b1220';
  ctx.lineWidth = 12;
  ctx.stroke();
  chevron();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6.5;
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: img.data };
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
  src('bce-route-start', data.routeStart);
  src('bce-stairs', data.stairs);
  src('bce-stairs-selected', data.selectedStair);
  // Images are part of the style: re-add after every basemap switch.
  if (!map.hasImage(ARROW_IMAGE)) map.addImage(ARROW_IMAGE, createArrowImage(), { pixelRatio: 2 });

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

  // Stairs: wide dark casing + magenta line with short dashes (reads as steps); selected = white halo
  add({
    id: 'bce-stairs-selected-halo',
    type: 'line',
    source: 'bce-stairs-selected',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 10, 17, 22], 'line-opacity': 0.9 },
  });
  add({
    id: 'bce-stairs-casing',
    type: 'line',
    source: 'bce-stairs',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0b1220', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 14], 'line-opacity': 0.8 },
  });
  add({
    id: 'bce-stairs',
    type: 'line',
    source: 'bce-stairs',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': STAIRS_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10], 'line-dasharray': [0.6, 0.35] },
  });
  add({
    id: 'bce-stairs-top',
    type: 'circle',
    source: 'bce-stairs-selected',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 7, 'circle-color': '#16a34a', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
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

  // Direction of travel: chevrons along the route in coordinate order (calculated routes follow the
  // waypoint order, GPX tracks their recording order), so loops show which way round they go.
  const arrowLayout = {
    'symbol-placement': 'line' as const,
    'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 11, 70, 16, 110] as ExpressionSpecification,
    'icon-image': ARROW_IMAGE,
    'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.75, 15, 1.05, 18, 1.3] as ExpressionSpecification,
    'icon-rotation-alignment': 'map' as const,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'icon-padding': 0,
  };
  add({ id: 'bce-route-arrows', type: 'symbol', source: 'bce-route', layout: arrowLayout });
  add({
    id: 'bce-route-start',
    type: 'circle',
    source: 'bce-route-start',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 8],
      'circle-color': '#16a34a',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
    },
  });

  add({
    id: 'bce-manual-line',
    type: 'line',
    source: 'bce-manual',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#f97316', 'line-width': 3, 'line-dasharray': [2, 1] },
  });
  add({ id: 'bce-manual-arrows', type: 'symbol', source: 'bce-manual', filter: ['==', ['geometry-type'], 'LineString'], layout: arrowLayout });
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
