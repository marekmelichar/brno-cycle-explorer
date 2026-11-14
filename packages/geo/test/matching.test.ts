import { describe, expect, it } from 'vitest';
import type { LngLat } from '@bce/shared';
import { InfraIndex, analyzeRoute, densify } from '../src/matching';
import { computeDatasetStats, scoreRoute } from '../src/stats';
import { lineLength } from '../src/distance';
import { ORIGIN, eastLine, feature, offset } from './helpers';

const C8 = 'Stezka pro cyklisty - C8';
const C9 = 'Stezka pro chodce a cyklisty (nedělená) - C9';
const V14 = 'Vyhrazený jízdní pruh pro cyklisty - V14';
const V20 = 'Piktogramový koridor pro cyklisty - V20';

const share = (a: ReturnType<typeof analyzeRoute>, key: string) => a.byCategory.find((c) => c.key === key)?.share ?? 0;
const groupLen = (a: ReturnType<typeof analyzeRoute>, key: string) => a.byGroup.find((g) => g.key === key)!.length;

describe('densify', () => {
  it('splits into pieces ≤ step whose lengths sum to the geodesic length', () => {
    const line = eastLine(0, 123, 0, 3);
    const pieces = densify([line], 5);
    expect(pieces.every((p) => p.length <= 5 + 1e-9)).toBe(true);
    expect(pieces.reduce((s, p) => s + p.length, 0)).toBeCloseTo(lineLength(line), 6);
  });
});

describe('route ↔ infrastructure matching', () => {
  it('route following a separated cycle path is classified as dedicated', () => {
    const idx = new InfraIndex([feature(eastLine(0, 300), C8)]);
    // GPS track 3 m north of the centreline, with sparse vertices
    const a = analyzeRoute([eastLine(10, 280, 3, 4)], idx);
    expect(share(a, 'separated_path')).toBeGreaterThan(0.99);
    expect(a.reconciliation.ok).toBe(true);
    expect(a.quality.highConfidenceShare).toBeGreaterThan(0.9);
  });

  it('respects the distance tolerance', () => {
    const idx = new InfraIndex([feature(eastLine(0, 300), C8)]);
    expect(share(analyzeRoute([eastLine(10, 280, 8)], idx, { tolerance: 12 }), 'separated_path')).toBeGreaterThan(0.99);
    expect(share(analyzeRoute([eastLine(10, 280, 10)], idx), 'separated_path')).toBe(0); // default 8 m
    const far = analyzeRoute([eastLine(10, 280, 30)], idx, { tolerance: 12 });
    expect(share(far, 'separated_path')).toBe(0);
    expect(share(far, 'unmatched')).toBe(1);
    expect(far.sections[0].label).toBe('Neověřeno / bez odpovídajícího záznamu');
  });

  it('a perpendicular road crossing a cycle path is NOT counted as following it', () => {
    // cycle path runs north–south through x=150 m; the route runs east across it
    const path = [offset(ORIGIN, 150, -200), offset(ORIGIN, 150, 200)];
    const idx = new InfraIndex([feature(path, C8)]);
    const a = analyzeRoute([eastLine(0, 300, 0, 30)], idx);
    expect(share(a, 'separated_path')).toBe(0);
    const crossing = a.pieces.filter((x) => x.candidates.some((c) => /směr|souběh/.test(c.rejectReason ?? '')) || /Krátký/.test(x.reason));
    expect(crossing.length).toBeGreaterThan(0);
  });

  it('a very short parallel contact (< minRunLength) is suppressed as noise', () => {
    const path = [offset(ORIGIN, 150, 2), offset(ORIGIN, 156, 2)]; // 6 m stub
    const idx = new InfraIndex([feature(path, C9)]);
    const a = analyzeRoute([eastLine(0, 300, 0, 30)], idx);
    expect(share(a, 'shared_path')).toBe(0);
    expect(a.pieces.some((p) => /Krátký souběh/.test(p.reason))).toBe(true);
    // with suppression disabled the contact is visible
    const raw = analyzeRoute([eastLine(0, 300, 0, 30)], idx, { minRunLength: 0 });
    expect(share(raw, 'shared_path')).toBeGreaterThan(0);
  });

  it('overlapping municipal lines are never double-counted', () => {
    const line = eastLine(0, 400);
    const idx = new InfraIndex([
      feature(line, C8),
      feature(line, C8), // exact duplicate
      feature(eastLine(0, 400, 1.5), C9), // parallel line 1.5 m away
      feature(eastLine(0, 400, 4), V14),
    ]);
    const route = eastLine(20, 360, 0.5, 6);
    const a = analyzeRoute([route], idx);
    const matched = a.byCategory.filter((c) => c.key !== 'unmatched').reduce((s, c) => s + c.length, 0);
    expect(matched).toBeLessThanOrEqual(a.totalLength + 1e-6);
    expect(a.reconciliation.ok).toBe(true);
    expect(Math.abs(a.reconciliation.sum - lineLength(route))).toBeLessThan(0.5);
    // the closest line wins
    expect(share(a, 'separated_path')).toBeGreaterThan(0.95);
    // and an ambiguity is reported because a different class is within 2 m
    expect(a.quality.ambiguousShare).toBeGreaterThan(0.5);
  });

  it('mixed route: lane then nothing → ~50/50 with reconciled totals', () => {
    const idx = new InfraIndex([feature(eastLine(0, 200), V14)]);
    const a = analyzeRoute([eastLine(0, 400, 2, 8)], idx);
    expect(groupLen(a, 'lane') / a.totalLength).toBeGreaterThan(0.45);
    expect(groupLen(a, 'lane') / a.totalLength).toBeLessThan(0.55);
    expect(groupLen(a, 'unclassified') / a.totalLength).toBeGreaterThan(0.45);
    const sumShares = a.byGroup.reduce((s, g) => s + g.share, 0);
    expect(sumShares).toBeCloseTo(1, 9);
    expect(a.sections.length).toBe(2);
  });

  it('pictogram corridors fall into "other", never into dedicated paths', () => {
    const idx = new InfraIndex([feature(eastLine(0, 300), V20)]);
    const a = analyzeRoute([eastLine(10, 280, 1)], idx);
    expect(groupLen(a, 'dedicated')).toBe(0);
    expect(groupLen(a, 'other') / a.totalLength).toBeGreaterThan(0.99);
  });

  it('ignores not_infrastructure records (cancelled / cycling banned)', () => {
    const idx = new InfraIndex([feature(eastLine(0, 300), 'Vjezd cyklistům zakázán')]);
    const a = analyzeRoute([eastLine(10, 280, 1)], idx);
    expect(share(a, 'unmatched')).toBe(1);
  });

  it('empty infrastructure gives all-unclassified and low quality', () => {
    const a = analyzeRoute([eastLine(0, 300)], new InfraIndex([]));
    expect(share(a, 'unmatched')).toBe(1);
    expect(a.quality.level).toBe('nízká');
  });

  it('skips invalid vertices and does not bridge between track segments', () => {
    const idx = new InfraIndex([feature(eastLine(0, 1000), C8)]);
    const seg1 = [...eastLine(0, 100, 0, 4), [NaN, 49] as LngLat];
    const seg2 = eastLine(500, 100, 0, 4);
    const a = analyzeRoute([seg1, seg2], idx);
    expect(a.totalLength).toBeCloseTo(200, 0);
    expect(a.reconciliation.ok).toBe(true);
  });

  it('reports areas outside the dataset coverage', () => {
    const idx = new InfraIndex([feature(eastLine(0, 300), C8)]);
    const far: LngLat[] = [[14.42, 50.08], [14.43, 50.085]]; // Prague
    const a = analyzeRoute([far], idx);
    expect(a.pieces[0].reason).toMatch(/Mimo území/);
    expect(a.quality.outsideCoverageShare).toBe(1);
  });
});

describe('dataset statistics', () => {
  it('deduplicates overlapping geometry but keeps recorded totals', () => {
    const line = eastLine(0, 500);
    const feats = [feature(line, C8), feature(line, C9), feature(eastLine(1000, 200), V14), feature(eastLine(2000, 100), 'Úsek byl zrušen')];
    const s = computeDatasetStats(feats);
    expect(s.geodesicLength).toBeCloseTo(1200, -1);
    expect(s.dedupLength).toBeCloseTo(700, -1);
    expect(s.overlapLength).toBeCloseTo(500, -1);
    expect(s.byYear[0].year).toBe(2020);
    expect(s.byCategory.find((c) => c.category === 'not_infrastructure')!.count).toBe(1);
  });
});

describe('route scoring', () => {
  it('prefers routes with more dedicated infrastructure for "max_paths"', () => {
    const idx = new InfraIndex([feature(eastLine(0, 1000), C8)]);
    const onPath = analyzeRoute([eastLine(0, 1000, 1)], idx);
    const offPath = analyzeRoute([eastLine(0, 1000, 200)], idx);
    expect(scoreRoute(onPath, 'max_paths').score).toBeGreaterThan(scoreRoute(offPath, 'max_paths').score);
    expect(scoreRoute(onPath, 'max_paths').explanation).toBeTruthy();
  });
});

describe('gap bridging', () => {
  it('bridges a small break between two lines of the same class, with medium confidence', () => {
    const idx = new InfraIndex([feature(eastLine(0, 150), C9), feature(eastLine(158, 150), C9)]);
    const a = analyzeRoute([eastLine(0, 300, 1, 30)], idx, { maxGapFill: 10 });
    expect(share(a, 'shared_path')).toBeGreaterThan(0.99);
    expect(a.pieces.some((p) => /Krátká mezera/.test(p.reason) && p.confidence === 'medium')).toBe(true);
    const noFill = analyzeRoute([eastLine(0, 300, 1, 30)], idx, { maxGapFill: 0 });
    expect(share(noFill, 'unmatched')).toBeGreaterThan(0);
  });
  it('does not bridge between different classes or long gaps', () => {
    const idx = new InfraIndex([feature(eastLine(0, 150), C9), feature(eastLine(158, 150), V14), feature(eastLine(400, 100), V14)]);
    const a = analyzeRoute([eastLine(0, 500, 1, 50)], idx, { maxGapFill: 10 });
    expect(a.pieces.filter((p) => /Krátká mezera/.test(p.reason))).toHaveLength(0);
  });
});
