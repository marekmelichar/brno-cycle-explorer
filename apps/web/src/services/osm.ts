import { describeOsm, osmClassBreakdown, osmForRange, type RouteAnalysis, type RouteSection } from '@bce/geo';
import type { ActiveRoute } from '../store/useAppStore';

/** Analysed metres → engine metres (the engine measures the same line slightly differently). */
export function osmScale(active: ActiveRoute | null, analysis: RouteAnalysis | null): number {
  return active?.engineDistance && analysis?.totalLength ? active.engineDistance / analysis.totalLength : 1;
}

/** OSM description of a route section (dominant way), only for calculated routes that carry OSM tags. */
export function sectionOsm(active: ActiveRoute | null, analysis: RouteAnalysis | null, s: RouteSection) {
  if (!active?.osm?.length || !analysis) return null;
  const r = osmForRange(active.osm, s.startDistance, s.startDistance + s.length, osmScale(active, analysis));
  return r ? { ...r, text: describeOsm(r.tags) } : null;
}

/** Unverified (no municipal record) length broken down by OSM way class. */
export function unverifiedOsmBreakdown(active: ActiveRoute | null, analysis: RouteAnalysis | null) {
  if (!active?.osm?.length || !analysis) return null;
  const stretches = analysis.sections.filter((s) => s.category === null).map((s) => ({ from: s.startDistance, to: s.startDistance + s.length }));
  if (!stretches.length) return null;
  return osmClassBreakdown(active.osm, stretches, osmScale(active, analysis));
}

/** Label for a section: municipal class, or "Neověřeno · OSM: …" when OSM tags are known. */
export function sectionLabel(active: ActiveRoute | null, analysis: RouteAnalysis | null, s: RouteSection): string {
  if (s.category !== null) return s.label;
  const o = sectionOsm(active, analysis, s);
  return o ? `Neověřeno · OSM: ${o.text}` : s.label;
}
