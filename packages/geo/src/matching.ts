import Flatbush from 'flatbush';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  ROUTE_GROUP_ORDER,
  UNMATCHED_LABEL,
  type InfraCategory,
  type InfraFeature,
  type LngLat,
  type RouteGroup,
} from '@bce/shared';
import { haversine, isValidLngLat, makeLocalProjection, undirectedAngleDiff } from './distance';

export interface MatchOptions {
  /** Max lateral distance (m) between route and infrastructure line. */
  tolerance: number;
  /** Max undirected angle (deg) between route direction and infrastructure direction. */
  maxAngle: number;
  /** Route densification step (m). */
  step: number;
  /** Matched runs shorter than this (m) surrounded by other classes are discarded as noise/crossings. */
  minRunLength: number;
  /** Minimum ratio between the length of the route piece projected onto the infrastructure line and the piece length. */
  minOverlapRatio: number;
  /**
   * Unmatched gaps up to this length (m) between two runs of the SAME category are bridged
   * (typical breaks of municipal lines at junctions). Bridged pieces get 'medium' confidence
   * and an explicit reason. 0 disables bridging.
   */
  maxGapFill: number;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  tolerance: 8,
  maxAngle: 30,
  step: 5,
  minRunLength: 15,
  minOverlapRatio: 0.5,
  maxGapFill: 10,
};

type XY = [number, number];

interface IndexedSegment {
  featureIdx: number;
  a: XY;
  b: XY;
}

interface IndexedFeature {
  id: number;
  category: InfraCategory;
  originalType: string | null;
}

/** Spatial index of infrastructure line segments in a local metric projection. */
export class InfraIndex {
  readonly features: IndexedFeature[] = [];
  readonly segments: IndexedSegment[] = [];
  readonly bbox: [number, number, number, number] | null;
  private readonly index: Flatbush | null;
  readonly proj: ReturnType<typeof makeLocalProjection>;
  readonly refLat: number;

  constructor(features: InfraFeature[], refLat = 49.2) {
    this.refLat = refLat;
    this.proj = makeLocalProjection(refLat);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const f of features) {
      const cat = f.properties.category;
      if (!CATEGORIES[cat]?.matchable) continue;
      const fi = this.features.length;
      this.features.push({ id: f.properties.id, category: cat, originalType: f.properties.originalType });
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
          const p = line[i - 1];
          const q = line[i];
          if (!isValidLngLat(p) || !isValidLngLat(q)) continue;
          const a = this.proj.project(p);
          const b = this.proj.project(q);
          this.segments.push({ featureIdx: fi, a, b });
          minX = Math.min(minX, p[0], q[0]);
          maxX = Math.max(maxX, p[0], q[0]);
          minY = Math.min(minY, p[1], q[1]);
          maxY = Math.max(maxY, p[1], q[1]);
        }
      }
    }
    if (this.segments.length === 0) {
      this.index = null;
      this.bbox = null;
      return;
    }
    this.bbox = [minX, minY, maxX, maxY];
    const idx = new Flatbush(this.segments.length);
    for (const s of this.segments) {
      idx.add(Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]));
    }
    idx.finish();
    this.index = idx;
  }

  get size() {
    return this.features.length;
  }

  search(minX: number, minY: number, maxX: number, maxY: number): number[] {
    return this.index ? this.index.search(minX, minY, maxX, maxY) : [];
  }

  contains(c: LngLat, marginDeg = 0.01): boolean {
    if (!this.bbox) return false;
    const [a, b, cc, d] = this.bbox;
    return c[0] >= a - marginDeg && c[0] <= cc + marginDeg && c[1] >= b - marginDeg && c[1] <= d + marginDeg;
  }
}

function nearestOnSegment(p: XY, a: XY, b: XY): { point: XY; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point: XY = [a[0] + t * dx, a[1] + t * dy];
  return { point, dist: Math.hypot(point[0] - p[0], point[1] - p[1]) };
}

function xyBearing(a: XY, b: XY): number {
  // bearing measured clockwise from north, degrees
  return ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

export type Confidence = 'high' | 'medium' | 'none';

export interface CandidateInfo {
  featureId: number;
  category: InfraCategory;
  /** Mean lateral distance of piece start/middle/end to the feature (m). */
  distance: number;
  maxDistance: number;
  angle: number;
  overlapRatio: number;
  accepted: boolean;
  rejectReason?: string;
}

export interface RoutePiece {
  segmentIndex: number;
  from: LngLat;
  to: LngLat;
  length: number;
  /** Distance along the route at the piece start (m). */
  startDistance: number;
  category: InfraCategory | null;
  featureId: number | null;
  distance: number | null;
  angle: number | null;
  confidence: Confidence;
  ambiguous: boolean;
  reason: string;
  candidates: CandidateInfo[];
}

export interface RouteSection {
  id: number;
  segmentIndex: number;
  category: InfraCategory | null;
  group: RouteGroup;
  label: string;
  coordinates: LngLat[];
  length: number;
  startDistance: number;
  featureIds: number[];
  originalTypes: string[];
  meanDistance: number | null;
  maxAngle: number | null;
  confidence: Confidence;
  ambiguousLength: number;
  reasons: string[];
}

export interface CategoryStat {
  key: InfraCategory | 'unmatched';
  label: string;
  length: number;
  share: number;
}

export interface QualityReport {
  level: 'vysoká' | 'střední' | 'nízká';
  matchedShare: number;
  highConfidenceShare: number;
  ambiguousShare: number;
  outsideCoverageShare: number;
  meanPointSpacing: number;
  notes: string[];
}

export interface RouteAnalysis {
  totalLength: number;
  pieces: RoutePiece[];
  sections: RouteSection[];
  byCategory: CategoryStat[];
  byGroup: Array<{ key: RouteGroup; length: number; share: number }>;
  reconciliation: { sum: number; total: number; difference: number; tolerance: number; ok: boolean };
  quality: QualityReport;
  options: MatchOptions;
}

/** Splits the route into straight pieces no longer than `step`. Invalid vertices are skipped. */
export function densify(lines: LngLat[][], step: number): Array<Omit<RoutePiece, 'category' | 'featureId' | 'distance' | 'angle' | 'confidence' | 'ambiguous' | 'reason' | 'candidates'>> {
  const out: Array<Omit<RoutePiece, 'category' | 'featureId' | 'distance' | 'angle' | 'confidence' | 'ambiguous' | 'reason' | 'candidates'>> = [];
  let along = 0;
  lines.forEach((rawLine, segmentIndex) => {
    const line = rawLine.filter(isValidLngLat);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const len = haversine(a, b);
      if (len === 0) continue;
      const n = Math.max(1, Math.ceil(len / step));
      const pieceLen = len / n;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        out.push({
          segmentIndex,
          from: [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
          to: [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
          length: pieceLen,
          startDistance: along,
        });
        along += pieceLen;
      }
    }
  });
  return out;
}

/**
 * Geometric line matching of a route against the infrastructure index.
 *
 * For every short route piece we look up nearby infrastructure segments, and for each
 * candidate FEATURE compute (a) lateral distances of the piece start, middle and end,
 * (b) the direction of the feature where the piece projects onto it, and (c) the
 * overlap ratio = length of the piece projected onto the feature / piece length.
 * A crossing street therefore fails (angle ≈ 90°, overlap ≈ 0) even though it is
 * within the distance tolerance. Each piece is assigned to at most ONE feature
 * (the best geometric fit), so overlapping municipal lines are never double counted.
 */
export function analyzeRoute(lines: LngLat[][], index: InfraIndex, opts: Partial<MatchOptions> = {}): RouteAnalysis {
  const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...opts };
  const { tolerance, maxAngle, minOverlapRatio } = options;
  const base = densify(lines, options.step);
  const proj = index.proj;

  const pieces: RoutePiece[] = base.map((p) => {
    const A = proj.project(p.from);
    const B = proj.project(p.to);
    const M: XY = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const pieceLenXY = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const pieceBearing = xyBearing(A, B);

    const outside = !index.contains(p.from) && !index.contains(p.to);
    const m = tolerance * 1.5;
    const hits = index.search(
      Math.min(A[0], B[0]) - m,
      Math.min(A[1], B[1]) - m,
      Math.max(A[0], B[0]) + m,
      Math.max(A[1], B[1]) + m,
    );

    // group by feature
    const byFeature = new Map<number, number[]>();
    for (const h of hits) {
      const fi = index.segments[h].featureIdx;
      const arr = byFeature.get(fi);
      if (arr) arr.push(h);
      else byFeature.set(fi, [h]);
    }

    const candidates: CandidateInfo[] = [];
    for (const [fi, segIdxs] of byFeature) {
      let bestA = { point: [0, 0] as XY, dist: Infinity };
      let bestB = { point: [0, 0] as XY, dist: Infinity };
      let bestM = { dist: Infinity, seg: -1 };
      for (const si of segIdxs) {
        const s = index.segments[si];
        const na = nearestOnSegment(A, s.a, s.b);
        if (na.dist < bestA.dist) bestA = na;
        const nb = nearestOnSegment(B, s.a, s.b);
        if (nb.dist < bestB.dist) bestB = nb;
        const nm = nearestOnSegment(M, s.a, s.b);
        if (nm.dist < bestM.dist) bestM = { dist: nm.dist, seg: si };
      }
      const projLen = Math.hypot(bestB.point[0] - bestA.point[0], bestB.point[1] - bestA.point[1]);
      const overlapRatio = pieceLenXY > 0 ? Math.min(1, projLen / pieceLenXY) : 0;
      let featBearing: number;
      if (projLen >= Math.min(2, pieceLenXY * 0.5)) featBearing = xyBearing(bestA.point, bestB.point);
      else {
        const s = index.segments[bestM.seg];
        featBearing = xyBearing(s.a, s.b);
      }
      const angle = undirectedAngleDiff(pieceBearing, featBearing);
      const maxDistance = Math.max(bestA.dist, bestB.dist, bestM.dist);
      const distance = (bestA.dist + bestB.dist + bestM.dist) / 3;
      const feat = index.features[fi];
      let rejectReason: string | undefined;
      if (bestM.dist > tolerance) rejectReason = `vzdálenost ${bestM.dist.toFixed(1)} m > ${tolerance} m`;
      else if (maxDistance > tolerance * 1.5) rejectReason = `trasa se od linie vzdaluje (${maxDistance.toFixed(1)} m)`;
      else if (angle > maxAngle) rejectReason = `odlišný směr (${angle.toFixed(0)}°) – pravděpodobně křížení`;
      else if (overlapRatio < minOverlapRatio) rejectReason = `nedostatečný souběh (${(overlapRatio * 100).toFixed(0)} %)`;
      candidates.push({
        featureId: feat.id,
        category: feat.category,
        distance,
        maxDistance,
        angle,
        overlapRatio,
        accepted: !rejectReason,
        rejectReason,
      });
    }
    candidates.sort((x, y) => x.distance + x.angle * 0.2 - (y.distance + y.angle * 0.2));
    const accepted = candidates.filter((c) => c.accepted);
    const best = accepted[0];
    if (!best) {
      let reason: string;
      if (outside) reason = 'Mimo území pokryté městskou datovou sadou.';
      else if (candidates.length === 0) reason = `V okruhu ${tolerance} m není žádný záznam cykloopatření.`;
      else reason = `Blízké záznamy zamítnuty: ${candidates[0].rejectReason}.`;
      return { ...p, category: null, featureId: null, distance: null, angle: null, confidence: 'none' as Confidence, ambiguous: false, reason, candidates: candidates.slice(0, 4) };
    }
    const second = accepted.find((c) => c.category !== best.category);
    const ambiguous = !!second && second.distance + second.angle * 0.2 - (best.distance + best.angle * 0.2) < 2;
    const confidence: Confidence = !ambiguous && best.maxDistance <= tolerance * 0.6 && best.angle <= 15 ? 'high' : 'medium';
    let reason = `Souběh s linií #${best.featureId}: odstup ${best.distance.toFixed(1)} m, odchylka směru ${best.angle.toFixed(0)}°, překryv ${(best.overlapRatio * 100).toFixed(0)} %.`;
    if (ambiguous && second) reason += ` Nejednoznačné – blízko je i „${CATEGORIES[second.category].label}“ (#${second.featureId}).`;
    return {
      ...p,
      category: best.category,
      featureId: best.featureId,
      distance: best.distance,
      angle: best.angle,
      confidence,
      ambiguous,
      reason,
      candidates: candidates.slice(0, 4),
    };
  });

  bridgeGaps(pieces, options.maxGapFill);
  suppressShortRuns(pieces, options.minRunLength);
  const sections = buildSections(pieces);
  const totalLength = pieces.reduce((s, p) => s + p.length, 0);

  const catLen = new Map<InfraCategory | 'unmatched', number>();
  for (const p of pieces) {
    const k = p.category ?? 'unmatched';
    catLen.set(k, (catLen.get(k) ?? 0) + p.length);
  }
  const share = (l: number) => (totalLength > 0 ? l / totalLength : 0);
  const byCategory: CategoryStat[] = [...CATEGORY_ORDER, 'unmatched' as const]
    .filter((k) => catLen.has(k))
    .map((k) => ({
      key: k,
      label: k === 'unmatched' ? UNMATCHED_LABEL : CATEGORIES[k].label,
      length: catLen.get(k)!,
      share: share(catLen.get(k)!),
    }));
  const groupLen = new Map<RouteGroup, number>(ROUTE_GROUP_ORDER.map((g) => [g, 0]));
  for (const p of pieces) {
    const g: RouteGroup = p.category ? CATEGORIES[p.category].group : 'unclassified';
    groupLen.set(g, groupLen.get(g)! + p.length);
  }
  const byGroup = ROUTE_GROUP_ORDER.map((g) => ({ key: g, length: groupLen.get(g)!, share: share(groupLen.get(g)!) }));

  // Reconciliation: category sums must equal the geodesic route length.
  let geodesicTotal = 0;
  for (const l of lines) {
    const v = l.filter(isValidLngLat);
    for (let i = 1; i < v.length; i++) geodesicTotal += haversine(v[i - 1], v[i]);
  }
  const sum = byGroup.reduce((s, g) => s + g.length, 0);
  const tol = Math.max(0.5, geodesicTotal * 1e-6);
  const reconciliation = { sum, total: geodesicTotal, difference: Math.abs(sum - geodesicTotal), tolerance: tol, ok: Math.abs(sum - geodesicTotal) <= tol };

  const quality = assessQuality(lines, pieces, totalLength, index);
  return { totalLength: geodesicTotal, pieces, sections, byCategory, byGroup, reconciliation, quality, options };
}

function bridgeGaps(pieces: RoutePiece[], maxGap: number) {
  if (maxGap <= 0) return;
  let i = 0;
  while (i < pieces.length) {
    if (pieces[i].category !== null) {
      i++;
      continue;
    }
    let j = i;
    let len = 0;
    while (j < pieces.length && pieces[j].category === null && pieces[j].segmentIndex === pieces[i].segmentIndex) {
      len += pieces[j].length;
      j++;
    }
    const before = pieces[i - 1];
    const after = pieces[j];
    if (
      before &&
      after &&
      before.category !== null &&
      before.category === after.category &&
      before.segmentIndex === pieces[i].segmentIndex &&
      after.segmentIndex === pieces[i].segmentIndex &&
      len <= maxGap
    ) {
      for (let k = i; k < j; k++) {
        const p = pieces[k];
        p.category = before.category;
        p.featureId = null;
        p.confidence = 'medium';
        p.reason = `Krátká mezera (${len.toFixed(0)} m) mezi úseky stejné kategorie – pravděpodobně přerušení linie v datech (např. křižovatka); přiřazeno se střední jistotou. ${p.reason}`;
      }
    }
    i = j;
  }
}

function suppressShortRuns(pieces: RoutePiece[], minRun: number) {
  if (minRun <= 0) return;
  let i = 0;
  while (i < pieces.length) {
    const cat = pieces[i].category;
    const seg = pieces[i].segmentIndex;
    let j = i;
    let len = 0;
    while (j < pieces.length && pieces[j].category === cat && pieces[j].segmentIndex === seg) {
      len += pieces[j].length;
      j++;
    }
    if (cat !== null && len < minRun) {
      for (let k = i; k < j; k++) {
        const p = pieces[k];
        p.reason = `Krátký souběh (${len.toFixed(0)} m < ${minRun} m) s „${CATEGORIES[cat].label}“ byl vyřazen – pravděpodobně křížení nebo šum. ${p.reason}`;
        p.category = null;
        p.featureId = null;
        p.confidence = 'none';
        p.ambiguous = false;
      }
    }
    i = j;
  }
}

function buildSections(pieces: RoutePiece[]): RouteSection[] {
  const sections: RouteSection[] = [];
  let cur: RouteSection | null = null;
  let distSum = 0;
  let distLen = 0;
  let highLen = 0;
  const flush = () => {
    if (!cur) return;
    cur.meanDistance = distLen > 0 ? distSum / distLen : null;
    cur.confidence = cur.category === null ? 'none' : highLen / cur.length >= 0.7 ? 'high' : 'medium';
    sections.push(cur);
  };
  for (const p of pieces) {
    if (!cur || cur.category !== p.category || cur.segmentIndex !== p.segmentIndex) {
      flush();
      cur = {
        id: sections.length,
        segmentIndex: p.segmentIndex,
        category: p.category,
        group: p.category ? CATEGORIES[p.category].group : 'unclassified',
        label: p.category ? CATEGORIES[p.category].label : UNMATCHED_LABEL,
        coordinates: [p.from],
        length: 0,
        startDistance: p.startDistance,
        featureIds: [],
        originalTypes: [],
        meanDistance: null,
        maxAngle: null,
        confidence: 'none',
        ambiguousLength: 0,
        reasons: [],
      };
      distSum = 0;
      distLen = 0;
      highLen = 0;
    }
    cur.coordinates.push(p.to);
    cur.length += p.length;
    if (p.featureId !== null && !cur.featureIds.includes(p.featureId)) cur.featureIds.push(p.featureId);
    if (p.distance !== null) {
      distSum += p.distance * p.length;
      distLen += p.length;
    }
    if (p.angle !== null) cur.maxAngle = Math.max(cur.maxAngle ?? 0, p.angle);
    if (p.confidence === 'high') highLen += p.length;
    if (p.ambiguous) cur.ambiguousLength += p.length;
    if (cur.reasons.length < 3 && !cur.reasons.includes(p.reason)) cur.reasons.push(p.reason);
  }
  flush();
  return sections;
}

function assessQuality(lines: LngLat[][], pieces: RoutePiece[], total: number, index: InfraIndex): QualityReport {
  const notes: string[] = [];
  let matched = 0,
    high = 0,
    amb = 0,
    outside = 0;
  for (const p of pieces) {
    if (p.category) matched += p.length;
    if (p.confidence === 'high') high += p.length;
    if (p.ambiguous) amb += p.length;
    if (!index.contains(p.from) && !index.contains(p.to)) outside += p.length;
  }
  let vertexCount = 0;
  for (const l of lines) vertexCount += l.length;
  const meanPointSpacing = vertexCount > 1 ? total / Math.max(1, vertexCount - lines.length) : 0;
  const s = (v: number) => (total > 0 ? v / total : 0);
  const matchedShare = s(matched);
  const highConfidenceShare = matched > 0 ? high / matched : 0;
  const ambiguousShare = s(amb);
  const outsideCoverageShare = s(outside);

  if (index.size === 0) notes.push('Data o cykloinfrastruktuře nejsou načtena – nelze nic přiřadit.');
  if (meanPointSpacing > 50) notes.push(`Řídké body trasy (průměrně ${meanPointSpacing.toFixed(0)} m) – přímé spojnice mohou zkreslit přiřazení.`);
  if (outsideCoverageShare > 0.05) notes.push(`${(outsideCoverageShare * 100).toFixed(0)} % trasy leží mimo území městské datové sady.`);
  if (ambiguousShare > 0.05) notes.push(`${(ambiguousShare * 100).toFixed(0)} % trasy má v blízkosti více různých typů opatření.`);
  notes.push('Úseky bez záznamu nemusí být běžnou silnicí – městská data nezahrnují všechny cyklisticky vhodné cesty.');

  let level: QualityReport['level'] = 'vysoká';
  if (index.size === 0 || meanPointSpacing > 100 || outsideCoverageShare > 0.5) level = 'nízká';
  else if (meanPointSpacing > 50 || ambiguousShare > 0.1 || highConfidenceShare < 0.6 || outsideCoverageShare > 0.1) level = 'střední';
  return { level, matchedShare, highConfidenceShare, ambiguousShare, outsideCoverageShare, meanPointSpacing, notes };
}
