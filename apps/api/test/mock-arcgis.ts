import type { FetchLike } from '../src/adapters/brno-gis/arcgis-client';

export interface MockOptions {
  count: number;
  maxRecordCount?: number;
  /** ids for which a batch silently drops records (simulates partial responses) */
  truncateOver?: number;
  failMetadata?: boolean;
  failAfterCalls?: number;
  dropIds?: number[];
}

const TYPES = ['Stezka pro cyklisty - C8', 'Vyhrazený jízdní pruh pro cyklisty - V14', 'Piktogramový koridor pro cyklisty - V20', null];

/** In-memory ArcGIS FeatureServer emulator (metadata, returnIdsOnly, objectIds GeoJSON queries). */
export function mockArcGis(o: MockOptions) {
  const max = o.maxRecordCount ?? 2000;
  const calls: string[] = [];
  let n = 0;
  const fetchFn: FetchLike = async (url, init) => {
    n++;
    calls.push(url);
    if (o.failAfterCalls !== undefined && n > o.failAfterCalls) return new Response('boom', { status: 503 });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('?f=json')) {
      if (o.failMetadata) return json({ error: { code: 500, message: 'Service unavailable' } });
      return json({
        name: 'mock_lines',
        geometryType: 'esriGeometryPolyline',
        maxRecordCount: max,
        supportedQueryFormats: 'JSON, geoJSON, PBF',
        fields: [
          { name: 'ObjectId', type: 'esriFieldTypeOID' },
          { name: 'typ_opatreni', type: 'esriFieldTypeString' },
          { name: 'rok_realizace', type: 'esriFieldTypeSmallInteger' },
          { name: 'delka', type: 'esriFieldTypeSingle' },
          { name: 'datum_exportu', type: 'esriFieldTypeDateOnly' },
          { name: 'Shape__Length', type: 'esriFieldTypeDouble' },
        ],
      });
    }
    if (url.includes('returnIdsOnly=true')) {
      return json({ objectIdFieldName: 'ObjectId', objectIds: Array.from({ length: o.count }, (_, i) => o.count - i) });
    }
    if (url.endsWith('/query') && init?.body) {
      const params = new URLSearchParams(String(init.body));
      if (params.get('f') !== 'geojson' || params.get('outSR') !== '4326') return json({ error: { code: 400, message: 'bad params' } });
      let ids = params.get('objectIds')!.split(',').map(Number);
      ids = ids.filter((id) => !(o.dropIds ?? []).includes(id));
      let exceeded = false;
      const limit = Math.min(max, o.truncateOver ?? Infinity);
      if (ids.length > limit) {
        ids = ids.slice(0, limit);
        exceeded = true;
      }
      return json({
        type: 'FeatureCollection',
        properties: exceeded ? { exceededTransferLimit: true } : undefined,
        features: ids.map((id) => ({
          type: 'Feature',
          id,
          geometry: { type: 'LineString', coordinates: [[16.6 + id * 1e-5, 49.19], [16.6 + id * 1e-5, 49.1905]] },
          properties: { ObjectId: id, typ_opatreni: TYPES[id % TYPES.length], rok_realizace: 2010 + (id % 14), delka: 55.6, datum_exportu: '2026-11-13', Shape__Length: 85 },
        })),
      });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchFn, calls };
}

export const silentLog = { info: () => undefined, warn: () => undefined, error: () => undefined };
