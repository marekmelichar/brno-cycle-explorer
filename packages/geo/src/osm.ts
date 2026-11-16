import type { Lang, OsmInterval } from '@bce/shared';

/** Parses BRouter's "WayTags" string ("highway=residential surface=asphalt") into a tag map. */
export function parseWayTags(s: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const part of s.trim().split(/\s+/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** Coarse OSM way class, used to group unverified route length. */
export type OsmClass =
  | 'cycleway'
  | 'path'
  | 'pedestrian'
  | 'track'
  | 'quiet_street'
  | 'service'
  | 'minor_road'
  | 'main_road'
  | 'steps'
  | 'other';

export const OSM_CLASS_LABELS: Record<OsmClass, string> = {
  cycleway: 'cyklostezka podle OSM',
  path: 'stezka / chodník',
  pedestrian: 'pěší zóna',
  track: 'polní / lesní cesta',
  quiet_street: 'klidná ulice (obytná / zóna)',
  service: 'účelová komunikace',
  minor_road: 'místní silnice',
  main_road: 'hlavní silnice',
  steps: 'schody',
  other: 'jiné',
};

export const OSM_CLASS_LABELS_EN: Record<OsmClass, string> = {
  cycleway: 'cycle path in OSM',
  path: 'path / footway',
  pedestrian: 'pedestrian zone',
  track: 'field / forest track',
  quiet_street: 'quiet street (residential / zone)',
  service: 'service road',
  minor_road: 'minor road',
  main_road: 'main road',
  steps: 'steps',
  other: 'other',
};

export const osmClassLabel = (c: OsmClass, lang: Lang = 'cs') => (lang === 'en' ? OSM_CLASS_LABELS_EN[c] : OSM_CLASS_LABELS[c]);

export const OSM_CLASS_ORDER: OsmClass[] = ['cycleway', 'path', 'pedestrian', 'track', 'quiet_street', 'service', 'minor_road', 'main_road', 'steps', 'other'];

export function osmClass(tags: Record<string, string>): OsmClass {
  const h = tags.highway ?? '';
  if (h === 'cycleway' || (h === 'path' && tags.bicycle === 'designated')) return 'cycleway';
  if (h === 'steps') return 'steps';
  if (h === 'path' || h === 'footway' || h === 'bridleway') return 'path';
  if (h === 'pedestrian') return 'pedestrian';
  if (h === 'track') return 'track';
  if (h === 'living_street' || h === 'residential') return 'quiet_street';
  if (h === 'service') return 'service';
  if (h === 'unclassified' || h === 'tertiary' || h === 'tertiary_link') return 'minor_road';
  if (/^(primary|secondary|trunk)(_link)?$/.test(h)) return 'main_road';
  return 'other';
}

const SURFACE_EN: Record<string, string> = {
  asphalt: 'asphalt',
  paved: 'paved',
  concrete: 'concrete',
  'concrete:plates': 'concrete plates',
  paving_stones: 'paving stones',
  sett: 'setts',
  cobblestone: 'cobblestones',
  compacted: 'compacted gravel',
  fine_gravel: 'fine gravel',
  gravel: 'gravel',
  unpaved: 'unpaved',
  ground: 'ground',
  dirt: 'dirt',
  grass: 'grass',
  wood: 'wood',
  stone: 'stone',
  metal: 'metal',
};

const SURFACE: Record<string, string> = {
  asphalt: 'asfalt',
  paved: 'zpevněný povrch',
  concrete: 'beton',
  'concrete:plates': 'betonové panely',
  paving_stones: 'dlažba',
  sett: 'kostky',
  cobblestone: 'kočičí hlavy',
  compacted: 'zhutněný štěrk',
  fine_gravel: 'jemný štěrk',
  gravel: 'štěrk',
  unpaved: 'nezpevněný povrch',
  ground: 'hlína',
  dirt: 'hlína',
  grass: 'tráva',
  wood: 'dřevo',
  stone: 'kámen',
  metal: 'kov',
};

/** OSM surface value in the UI language (unknown values are shown as they are). */
export const surfaceLabel = (surface: string, lang: 'cs' | 'en') => (lang === 'en' ? SURFACE_EN : SURFACE)[surface] ?? surface;

/** Short Czech description of an OSM way, e.g. "klidná ulice (obytná / zóna), asfalt, max 30 km/h". */
export function describeOsm(tags: Record<string, string>, lang: Lang = 'cs'): string {
  const parts: string[] = [osmClassLabel(osmClass(tags), lang)];
  if (tags.surface) parts.push((lang === 'en' ? SURFACE_EN : SURFACE)[tags.surface] ?? tags.surface);
  if (tags.maxspeed && /^\d+$/.test(tags.maxspeed)) parts.push(`max ${tags.maxspeed} km/h`);
  if (tags.cycleway && tags.cycleway !== 'no') parts.push(`cycleway=${tags.cycleway}`);
  if (tags.bicycle === 'designated' && osmClass(tags) !== 'cycleway') parts.push(lang === 'en' ? 'designated for bikes' : 'určeno pro kola');
  return parts.join(', ');
}

/**
 * OSM tags for a stretch [from, to) of the analysed route, in analysed-route metres.
 * `scale` converts analysed metres to the engine's metres (engine length / analysed length),
 * because the engine measures distance slightly differently. Returns the interval covering most
 * of the stretch, with the share it covers.
 */
export function osmForRange(intervals: OsmInterval[], from: number, to: number, scale = 1): { tags: Record<string, string>; share: number } | null {
  const a = from * scale;
  const b = to * scale;
  if (b <= a || intervals.length === 0) return null;
  let best: OsmInterval | null = null;
  let bestLen = 0;
  for (const iv of intervals) {
    const len = Math.min(b, iv.to) - Math.max(a, iv.from);
    if (len > bestLen) {
      bestLen = len;
      best = iv;
    }
  }
  return best ? { tags: best.tags, share: bestLen / (b - a) } : null;
}

/** Length per OSM class over the given stretches (analysed-route metres). */
export function osmClassBreakdown(
  intervals: OsmInterval[],
  stretches: Array<{ from: number; to: number }>,
  scale = 1,
): Array<{ cls: OsmClass; label: string; length: number }> {
  const acc = new Map<OsmClass, number>();
  for (const st of stretches) {
    const a = st.from * scale;
    const b = st.to * scale;
    for (const iv of intervals) {
      const len = Math.min(b, iv.to) - Math.max(a, iv.from);
      if (len <= 0) continue;
      const c = osmClass(iv.tags);
      acc.set(c, (acc.get(c) ?? 0) + len / scale);
    }
  }
  return OSM_CLASS_ORDER.filter((c) => acc.has(c)).map((c) => ({ cls: c, label: OSM_CLASS_LABELS[c], length: acc.get(c)! }));
}
