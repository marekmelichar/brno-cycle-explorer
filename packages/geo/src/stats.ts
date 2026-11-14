import { CATEGORIES, CATEGORY_ORDER, type InfraCategory, type InfraFeature, type LngLat, type RoutePreference } from '@bce/shared';
import { InfraIndex, densify, type RouteAnalysis } from './matching';
import { undirectedAngleDiff } from './distance';

export interface CategoryTotals {
  category: InfraCategory;
  count: number;
  /** Sum of municipal `delka` attribute (m) */
  recordedLength: number;
  /** Sum of geodesic lengths of geometries (m) */
  geodesicLength: number;
  /** Geodesic length after removing geometrically overlapping duplicates (m) */
  dedupLength: number;
}

export interface DatasetStats {
  featureCount: number;
  recordedLength: number;
  geodesicLength: number;
  dedupLength: number;
  overlapLength: number;
  byCategory: CategoryTotals[];
  byYear: Array<{ year: number; length: number; count: number; byCategory: Partial<Record<InfraCategory, number>> }>;
  missingYearCount: number;
  missingLengthCount: number;
}

function featureLines(f: InfraFeature): LngLat[][] {
  return f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
}

/**
 * Citywide totals. `dedupLength` counts each geographic location once: a 5 m piece of a
 * feature is a duplicate when an earlier feature runs parallel within 3 m.
 * `not_infrastructure` records are excluded from all infrastructure totals.
 */
export function computeDatasetStats(features: InfraFeature[]): DatasetStats {
  const infra = features.filter((f) => f.properties.category !== 'not_infrastructure');
  const index = new InfraIndex(infra);
  const idToOrder = new Map<number, number>();
  index.features.forEach((f, i) => idToOrder.set(f.id, i));
  const proj = index.proj;

  const byCat = new Map<InfraCategory, CategoryTotals>();
  for (const c of CATEGORY_ORDER) byCat.set(c, { category: c, count: 0, recordedLength: 0, geodesicLength: 0, dedupLength: 0 });
  const years = new Map<number, { length: number; count: number; byCategory: Partial<Record<InfraCategory, number>> }>();
  let missingYearCount = 0;
  let missingLengthCount = 0;

  for (const f of features) {
    const p = f.properties;
    const t = byCat.get(p.category)!;
    t.count++;
    t.geodesicLength += p.geodesicLength;
    if (p.recordedLength !== null && Number.isFinite(p.recordedLength)) t.recordedLength += p.recordedLength;
    else missingLengthCount++;
    if (p.category === 'not_infrastructure') continue;
    if (p.year && p.year > 1900) {
      const y = years.get(p.year) ?? { length: 0, count: 0, byCategory: {} };
      y.length += p.geodesicLength;
      y.count++;
      y.byCategory[p.category] = (y.byCategory[p.category] ?? 0) + p.geodesicLength;
      years.set(p.year, y);
    } else missingYearCount++;

    const order = idToOrder.get(p.id);
    if (order === undefined) continue;
    for (const piece of densify(featureLines(f), 5)) {
      const A = proj.project(piece.from);
      const B = proj.project(piece.to);
      const M: [number, number] = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const pb = (Math.atan2(B[0] - A[0], B[1] - A[1]) * 180) / Math.PI;
      const hits = index.search(M[0] - 3, M[1] - 3, M[0] + 3, M[1] + 3);
      let dup = false;
      for (const h of hits) {
        const s = index.segments[h];
        if (s.featureIdx >= order) continue;
        const dx = s.b[0] - s.a[0];
        const dy = s.b[1] - s.a[1];
        const l2 = dx * dx + dy * dy;
        const tt = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((M[0] - s.a[0]) * dx + (M[1] - s.a[1]) * dy) / l2));
        const d = Math.hypot(s.a[0] + tt * dx - M[0], s.a[1] + tt * dy - M[1]);
        if (d > 3) continue;
        const sb = (Math.atan2(dx, dy) * 180) / Math.PI;
        if (undirectedAngleDiff(pb, sb) <= 20) {
          dup = true;
          break;
        }
      }
      if (!dup) t.dedupLength += piece.length;
    }
  }

  const list = CATEGORY_ORDER.map((c) => byCat.get(c)!).filter((c) => c.count > 0);
  const infraList = list.filter((c) => c.category !== 'not_infrastructure');
  const geodesicLength = infraList.reduce((s, c) => s + c.geodesicLength, 0);
  const dedupLength = infraList.reduce((s, c) => s + c.dedupLength, 0);
  return {
    featureCount: features.length,
    recordedLength: infraList.reduce((s, c) => s + c.recordedLength, 0),
    geodesicLength,
    dedupLength,
    overlapLength: geodesicLength - dedupLength,
    byCategory: list,
    byYear: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, ...v })),
    missingYearCount,
    missingLengthCount,
  };
}

export interface RouteScore {
  score: number;
  infraShare: number;
  comfort: number;
  explanation: string;
}

/**
 * Transparent score (0–100) of a candidate route, based only on data the app has:
 * matched infrastructure classes, distance and (if available) elevation gain.
 * It does NOT model traffic volumes or safety.
 */
export function scoreRoute(
  analysis: RouteAnalysis,
  preference: RoutePreference,
  opts: { elevationGain?: number | null; shortestDistance?: number } = {},
): RouteScore {
  const total = analysis.totalLength || 1;
  let comfortSum = 0;
  for (const c of analysis.byCategory) {
    const w = c.key === 'unmatched' ? 0.3 : CATEGORIES[c.key].comfortWeight;
    comfortSum += w * c.length;
  }
  const comfort = comfortSum / total; // 0..1
  const infraShare = analysis.byGroup.filter((g) => g.key !== 'unclassified').reduce((s, g) => s + g.share, 0);
  const sepShare = analysis.byGroup.filter((g) => g.key === 'dedicated' || g.key === 'shared').reduce((s, g) => s + g.share, 0);
  const detour = opts.shortestDistance ? total / opts.shortestDistance - 1 : 0; // 0 = shortest
  const climbPerKm = opts.elevationGain != null ? opts.elevationGain / (total / 1000) : null;

  let score: number;
  let explanation: string;
  switch (preference) {
    case 'max_paths':
      score = 70 * comfort + 30 * sepShare - 20 * Math.max(0, detour - 0.3);
      explanation = 'Váha: komfort dle typu infrastruktury 70 %, podíl stezek mimo vozovku 30 %, penalizace objížďky nad 30 %.';
      break;
    case 'min_roads':
      score = 60 * infraShare + 40 * comfort - 20 * Math.max(0, detour - 0.3);
      explanation = 'Váha: podíl úseků se záznamem cykloopatření 60 %, komfort 40 %. Neověřené úseky snižují skóre (nejde o měření provozu).';
      break;
    case 'min_climb':
      score = 100 - Math.min(100, (climbPerKm ?? 0) * 5) * 0.7 + 30 * comfort - 30;
      explanation = climbPerKm == null ? 'Převýšení není k dispozici – hodnoceno jen podle komfortu.' : 'Váha: převýšení na km 70 %, komfort 30 %.';
      break;
    case 'shortest':
    default:
      score = 100 - 100 * Math.min(1, detour) * 0.8 + 20 * comfort - 20;
      explanation = 'Váha: délka trasy 80 %, komfort 20 %.';
  }
  return { score: Math.max(0, Math.min(100, score)), infraShare, comfort, explanation };
}
