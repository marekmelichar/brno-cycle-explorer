import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, NORMALIZATION_TABLE, normalizeTypOpatreni } from '@bce/shared';
import { normalizeInfrastructure } from '../src/normalize';

const sample = JSON.parse(readFileSync(fileURLToPath(new URL('../../../tests/fixtures/arcgis-sample.geojson', import.meta.url)), 'utf8'));

describe('infrastructure normalization', () => {
  it('maps every verified municipal value', () => {
    expect(normalizeTypOpatreni('Stezka pro cyklisty - C8')).toBe('separated_path');
    expect(normalizeTypOpatreni('Stezka pro chodce a cyklisty (nedělená) - C9')).toBe('shared_path');
    expect(normalizeTypOpatreni('Vyhrazený jízdní pruh pro cyklisty - V14')).toBe('reserved_lane');
    expect(normalizeTypOpatreni('Ochranný jízdní pruh pro cyklisty')).toBe('protective_lane');
    expect(normalizeTypOpatreni('Jízda cyklistů v protisměru')).toBe('contraflow');
    expect(normalizeTypOpatreni('Úsek byl zrušen')).toBe('not_infrastructure');
    expect(normalizeTypOpatreni('Vjezd cyklistům zakázán')).toBe('not_infrastructure');
  });
  it('never counts pictograms or lanes as physically separated paths', () => {
    expect(normalizeTypOpatreni('Piktogramový koridor pro cyklisty - V20')).toBe('pictogram');
    expect(CATEGORIES.pictogram.physicallySeparated).toBe(false);
    expect(CATEGORIES.pictogram.group).not.toBe('dedicated');
    expect(CATEGORIES.reserved_lane.physicallySeparated).toBe(false);
    expect(CATEGORIES.protective_lane.group).toBe('lane');
  });
  it('treats unknown, empty and non-string values as unknown', () => {
    expect(normalizeTypOpatreni(null)).toBe('unknown');
    expect(normalizeTypOpatreni('')).toBe('unknown');
    expect(normalizeTypOpatreni('   ')).toBe('unknown');
    expect(normalizeTypOpatreni('Cyklodálnice')).toBe('unknown');
    expect(normalizeTypOpatreni(42)).toBe('unknown');
  });
  it('normalization table has unique originals', () => {
    const vals = NORMALIZATION_TABLE.map((r) => r.original);
    expect(new Set(vals).size).toBe(vals.length);
  });
  it('normalizes a real ArcGIS GeoJSON response, keeping original properties', () => {
    const r = normalizeInfrastructure(sample, 'official');
    expect(r.features.length).toBeGreaterThan(40);
    const f = r.features[0];
    expect(f.properties.original).toHaveProperty('typ_opatreni');
    expect(f.properties.original).toHaveProperty('datum_exportu');
    expect(f.properties.geodesicLength).toBeGreaterThan(0);
    expect(f.geometry.coordinates.length).toBeGreaterThan(0);
    expect(r.latestExportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // WGS84 within Brno
    const c = f.geometry.type === 'LineString' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    expect(c[0]).toBeGreaterThan(16.3);
    expect(c[1]).toBeGreaterThan(49.0);
    // recorded length vs geometry: same order of magnitude
    const withLen = r.features.filter((x) => x.properties.recordedLength);
    const ratio = withLen.reduce((s, x) => s + x.properties.geodesicLength, 0) / withLen.reduce((s, x) => s + (x.properties.recordedLength ?? 0), 0);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });
  it('skips null / invalid geometries and converts Web Mercator', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: null, properties: { ObjectId: 1, typ_opatreni: null } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [16.6, 49.2] }, properties: { ObjectId: 2 } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1848638, 6308000], [1848738, 6308100]] }, properties: { ObjectId: 3, typ_opatreni: 'Stezka pro cyklisty - C8' } },
        { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[NaN, 1]], [[1848638, 6308000], [1848700, 6308000]]] }, properties: { ObjectId: 3 } },
      ],
    };
    const r = normalizeInfrastructure(fc, 'imported');
    expect(r.features).toHaveLength(2);
    expect(r.skipped).toBe(2);
    expect(r.features[0].geometry.coordinates[0]).toEqual([expect.closeTo(16.6066, 3), expect.closeTo(49.18, 1)]);
    expect(r.features[1].id).not.toBe(3); // duplicate id replaced
    expect(r.warnings.join(' ')).toMatch(/Mercator/);
  });
  it('rejects non-FeatureCollection input', () => {
    expect(() => normalizeInfrastructure({ foo: 1 }, 'imported')).toThrow();
  });
});
