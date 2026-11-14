import { normalizeTypOpatreni, type InfraCategory, type InfraFeature, type LngLat, type MunicipalProperties } from '@bce/shared';
import { isValidLngLat, lineLength } from './distance';

export const EXPECTED_FIELDS = ['ObjectId', 'typ_opatreni', 'rok_realizace', 'delka', 'datum_exportu', 'Shape__Length'];

export interface NormalizeResult {
  features: InfraFeature[];
  warnings: string[];
  skipped: number;
  distinctTypes: Array<{ value: string | null; count: number; category: InfraCategory }>;
  latestExportDate: string | null;
}

const R = 6378137;
/** EPSG:3857 → WGS84 (used only if a source unexpectedly returns Web Mercator). */
export function mercatorToLngLat(x: number, y: number): LngLat {
  return [(x / R) * (180 / Math.PI), (Math.atan(Math.exp(y / R)) * 2 - Math.PI / 2) * (180 / Math.PI)];
}

function cleanLine(raw: unknown, mercator: boolean): LngLat[] {
  if (!Array.isArray(raw)) return [];
  const out: LngLat[] = [];
  for (const c of raw) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const x = Number(c[0]);
    const y = Number(c[1]);
    const ll = mercator ? mercatorToLngLat(x, y) : ([x, y] as LngLat);
    if (isValidLngLat(ll)) out.push([Math.round(ll[0] * 1e7) / 1e7, Math.round(ll[1] * 1e7) / 1e7]);
  }
  return out;
}

function formatExportDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return null;
}

/**
 * Converts a GeoJSON FeatureCollection (as returned by the ArcGIS FeatureServer with
 * f=geojson&outSR=4326, or imported manually) into normalized infrastructure features.
 * Original properties are kept verbatim in `properties.original`.
 */
export function normalizeInfrastructure(raw: unknown, source: 'official' | 'imported'): NormalizeResult {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || (raw as { type?: string }).type !== 'FeatureCollection' || !Array.isArray((raw as { features?: unknown }).features)) {
    throw new Error('Data nejsou GeoJSON FeatureCollection.');
  }
  const fc = raw as { features: Array<Record<string, unknown>>; crs?: { properties?: { name?: string } } };
  const crsName = fc.crs?.properties?.name ?? '';
  let mercator = /3857|102100|900913/.test(crsName);
  if (!mercator) {
    // heuristic: detect projected coordinates
    const first = fc.features.find((f) => /LineString/.test(String((f.geometry as { type?: string } | null)?.type))) as
      | { geometry: { coordinates: unknown } }
      | undefined;
    const flat = JSON.stringify(first?.geometry.coordinates ?? []).match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi);
    if (flat && Math.abs(Number(flat[0])) > 180) {
      mercator = true;
      warnings.push('Souřadnice byly v Web Mercator (EPSG:3857) a byly převedeny na WGS84.');
    }
  }

  const fieldNames = new Set<string>();
  const counts = new Map<string | null, number>();
  const features: InfraFeature[] = [];
  let skipped = 0;
  let latest: string | null = null;
  const usedIds = new Set<number>();
  let synthId = 1_000_000;

  for (const f of fc.features) {
    const props = ((f.properties as MunicipalProperties) ?? {}) as MunicipalProperties;
    Object.keys(props).forEach((k) => fieldNames.add(k));
    const g = f.geometry as { type?: string; coordinates?: unknown } | null;
    let lines: LngLat[][] = [];
    if (g?.type === 'LineString') lines = [cleanLine(g.coordinates, mercator)];
    else if (g?.type === 'MultiLineString' && Array.isArray(g.coordinates)) lines = g.coordinates.map((l) => cleanLine(l, mercator));
    lines = lines.filter((l) => l.length >= 2);
    if (lines.length === 0) {
      skipped++;
      continue;
    }
    let id = Number(props.ObjectId ?? f.id);
    if (!Number.isFinite(id) || usedIds.has(id)) id = synthId++;
    usedIds.add(id);
    const typ = typeof props.typ_opatreni === 'string' && props.typ_opatreni.trim() !== '' ? props.typ_opatreni.trim() : null;
    counts.set(typ, (counts.get(typ) ?? 0) + 1);
    const exp = formatExportDate(props.datum_exportu);
    if (exp && (!latest || exp > latest)) latest = exp;
    const year = Number(props.rok_realizace);
    const recorded = Number(props.delka);
    features.push({
      type: 'Feature',
      id,
      geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines },
      properties: {
        id,
        category: normalizeTypOpatreni(typ),
        originalType: typ,
        year: props.rok_realizace != null && Number.isFinite(year) ? year : null,
        recordedLength: props.delka != null && Number.isFinite(recorded) ? recorded : null,
        geodesicLength: lines.reduce((s, l) => s + lineLength(l), 0),
        source,
        original: props,
      },
    });
  }
  const missing = EXPECTED_FIELDS.filter((k) => !fieldNames.has(k));
  if (fc.features.length > 0 && missing.length) warnings.push(`Chybějící očekávaná pole: ${missing.join(', ')}.`);
  if (skipped) warnings.push(`${skipped} záznamů bez platné liniové geometrie bylo vynecháno.`);
  const distinctTypes = [...counts.entries()]
    .map(([value, count]) => ({ value, count, category: normalizeTypOpatreni(value) }))
    .sort((a, b) => b.count - a.count);
  return { features, warnings, skipped, distinctTypes, latestExportDate: latest };
}
