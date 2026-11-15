import { gpx as gpxToGeoJSON } from '@tmcw/togeojson';
import type { LngLat } from '@bce/shared';
import { haversine, isValidLngLat } from './distance';

export interface TrackPoint {
  lon: number;
  lat: number;
  ele: number | null;
  time: string | null;
}

export interface ParsedGpx {
  name: string | null;
  /** Each segment is a continuous line; tracks with several trkseg produce several segments. */
  segments: TrackPoint[][];
  waypoints: Array<{ name: string | null; lon: number; lat: number }>;
  stats: {
    rawPointCount: number;
    validPointCount: number;
    invalidPointCount: number;
    segmentCount: number;
    trackCount: number;
    routeCount: number;
    elevationCoverage: number;
  };
  warnings: GpxWarning[];
}

export type GpxErrorCode = 'no_parser' | 'empty' | 'invalid_xml' | 'not_gpx' | 'no_track';

/** Thrown for documents that are not usable GPX at all; `code` is language-neutral. */
export class GpxParseError extends Error {
  constructor(readonly code: GpxErrorCode) {
    super(code);
  }
}

export type GpxWarning =
  | { code: 'single_point_segment' }
  | { code: 'invalid_points'; count: number }
  | { code: 'no_elevation' }
  | { code: 'partial_elevation' };

interface DomParserLike {
  parseFromString(s: string, type: string): Document;
}

function getParser(parser?: DomParserLike): DomParserLike {
  if (parser) return parser;
  const g = globalThis as unknown as { DOMParser?: new () => DomParserLike };
  if (!g.DOMParser) throw new GpxParseError('no_parser');
  return new g.DOMParser();
}

/** Counts raw trkpt/rtept elements and how many of them have valid coordinates. */
function countPoints(doc: Document): { raw: number; valid: number } {
  let raw = 0;
  let valid = 0;
  for (const tag of ['trkpt', 'rtept']) {
    const els = doc.getElementsByTagName(tag);
    for (let i = 0; i < els.length; i++) {
      raw++;
      const el = els[i];
      const lat = el.getAttribute('lat');
      const lon = el.getAttribute('lon');
      if (lat !== null && lon !== null && lat.trim() !== '' && lon.trim() !== '' && isValidLngLat([Number(lon), Number(lat)])) valid++;
    }
  }
  return { raw, valid };
}

/**
 * Parses a GPX document (tracks and routes). Corrupted points (non-numeric or
 * out-of-range coordinates) are skipped and reported; parsing never throws for
 * individual bad points, only for documents that are not GPX at all.
 */
export function parseGpx(xml: string, parser?: DomParserLike): ParsedGpx {
  if (typeof xml !== 'string' || xml.trim() === '') throw new GpxParseError('empty');
  const domParser = getParser(parser);
  let doc: Document;
  try {
    doc = domParser.parseFromString(xml, 'application/xml');
  } catch {
    // some parsers (e.g. xmldom) throw instead of returning a <parsererror> document
    throw new GpxParseError('invalid_xml');
  }
  if (!doc || doc.getElementsByTagName('parsererror').length > 0) {
    throw new GpxParseError('invalid_xml');
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase().replace(/^.*:/, '') !== 'gpx') {
    throw new GpxParseError('not_gpx');
  }

  const { raw: rawPointCount, valid: rawValidCount } = countPoints(doc);
  const warnings: GpxWarning[] = [];
  const fc = gpxToGeoJSON(doc);

  const segments: TrackPoint[][] = [];
  const waypoints: ParsedGpx['waypoints'] = [];
  let name: string | null = null;
  let trackCount = 0;
  let routeCount = 0;
  let valid = 0;
  let withEle = 0;

  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    if (g.type === 'Point') {
      const c = g.coordinates as number[];
      if (isValidLngLat(c)) waypoints.push({ name: (props.name as string) ?? null, lon: c[0], lat: c[1] });
      continue;
    }
    if (g.type !== 'LineString' && g.type !== 'MultiLineString') continue;
    if (props._gpxType === 'rte') routeCount++;
    else trackCount++;
    if (!name && typeof props.name === 'string') name = props.name;

    const lines = (g.type === 'LineString' ? [g.coordinates] : g.coordinates) as number[][][];
    const coordProps = props.coordinateProperties as { times?: unknown } | undefined;
    const timesRaw = coordProps?.times;
    const timesPerLine: (string[] | undefined)[] = Array.isArray(timesRaw)
      ? Array.isArray(timesRaw[0])
        ? (timesRaw as string[][])
        : [timesRaw as string[]]
      : [];

    lines.forEach((line, li) => {
      const seg: TrackPoint[] = [];
      line.forEach((raw, pi) => {
        const c = raw as number[];
        if (!isValidLngLat(c)) return;
        const ele = raw.length > 2 && Number.isFinite(raw[2]) ? raw[2] : null;
        if (ele !== null) withEle++;
        valid++;
        seg.push({ lon: c[0], lat: c[1], ele, time: timesPerLine[li]?.[pi] ?? null as string | null });
      });
      // drop consecutive duplicates
      const dedup = seg.filter((p, i) => i === 0 || p.lon !== seg[i - 1].lon || p.lat !== seg[i - 1].lat);
      if (dedup.length >= 2) segments.push(dedup);
      else if (dedup.length === 1 && !warnings.some((w) => w.code === 'single_point_segment')) warnings.push({ code: 'single_point_segment' });
    });
  }

  const invalid = rawPointCount - rawValidCount;
  const singles = rawValidCount - valid;
  if (singles > 0 && !warnings.some((w) => w.code === 'single_point_segment')) warnings.push({ code: 'single_point_segment' });
  if (invalid > 0) warnings.push({ code: 'invalid_points', count: invalid });
  if (segments.length === 0) throw new GpxParseError('no_track');

  const elevationCoverage = valid ? withEle / valid : 0;
  if (elevationCoverage === 0) warnings.push({ code: 'no_elevation' });
  else if (elevationCoverage < 0.9) warnings.push({ code: 'partial_elevation' });

  return {
    name,
    segments,
    waypoints,
    stats: {
      rawPointCount,
      validPointCount: valid,
      invalidPointCount: invalid,
      segmentCount: segments.length,
      trackCount,
      routeCount,
      elevationCoverage,
    },
    warnings,
  };
}

export function segmentsToLines(segments: TrackPoint[][]): LngLat[][] {
  return segments.map((s) => s.map((p) => [p.lon, p.lat] as LngLat));
}

export interface ElevationStats {
  gain: number;
  loss: number;
  min: number;
  max: number;
  reliable: boolean;
  /** Why the numbers are unreliable (language-neutral), or null */
  reason: { code: 'coverage'; share: number } | { code: 'range' } | null;
}

/**
 * Elevation gain/loss with a hysteresis threshold to suppress GPS/barometric noise.
 * Returns null when there is no elevation data at all.
 */
export function elevationStats(values: Array<number | null>, threshold = 3): ElevationStats | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return null;
  const coverage = present.length / values.length;
  let gain = 0;
  let loss = 0;
  let anchor = present[0];
  for (const v of present) {
    const d = v - anchor;
    if (d >= threshold) {
      gain += d;
      anchor = v;
    } else if (d <= -threshold) {
      loss += -d;
      anchor = v;
    }
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  let reason: ElevationStats['reason'] = null;
  if (coverage < 0.9) reason = { code: 'coverage', share: coverage };
  else if (max - min > 3000) reason = { code: 'range' };
  return { gain, loss, min, max, reliable: reason === null, reason };
}

export function trackDistance(segments: TrackPoint[][]): number {
  let d = 0;
  for (const s of segments) for (let i = 1; i < s.length; i++) d += haversine([s[i - 1].lon, s[i - 1].lat], [s[i].lon, s[i].lat]);
  return d;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface GpxExportInput {
  name: string;
  description?: string;
  segments: Array<Array<{ lon: number; lat: number; ele?: number | null }>>;
  waypoints?: Array<{ name: string; lon: number; lat: number }>;
  /** Export as <rte> instead of <trk> */
  asRoute?: boolean;
}

/** Produces a GPX 1.1 document. */
export function buildGpx(input: GpxExportInput): string {
  const f = (n: number) => n.toFixed(7);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx version="1.1" creator="Brno Cycle Explorer" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
  );
  lines.push('  <metadata>');
  lines.push(`    <name>${esc(input.name)}</name>`);
  if (input.description) lines.push(`    <desc>${esc(input.description)}</desc>`);
  lines.push(`    <time>${new Date().toISOString()}</time>`);
  lines.push('  </metadata>');
  for (const w of input.waypoints ?? []) {
    lines.push(`  <wpt lat="${f(w.lat)}" lon="${f(w.lon)}"><name>${esc(w.name)}</name></wpt>`);
  }
  const pt = (tag: string, p: { lon: number; lat: number; ele?: number | null }, indent: string) =>
    p.ele !== undefined && p.ele !== null && Number.isFinite(p.ele)
      ? `${indent}<${tag} lat="${f(p.lat)}" lon="${f(p.lon)}"><ele>${p.ele.toFixed(1)}</ele></${tag}>`
      : `${indent}<${tag} lat="${f(p.lat)}" lon="${f(p.lon)}"/>`;
  if (input.asRoute) {
    lines.push('  <rte>');
    lines.push(`    <name>${esc(input.name)}</name>`);
    for (const s of input.segments) for (const p of s) lines.push(pt('rtept', p, '    '));
    lines.push('  </rte>');
  } else {
    lines.push('  <trk>');
    lines.push(`    <name>${esc(input.name)}</name>`);
    for (const s of input.segments) {
      if (s.length === 0) continue;
      lines.push('    <trkseg>');
      for (const p of s) lines.push(pt('trkpt', p, '      '));
      lines.push('    </trkseg>');
    }
    lines.push('  </trk>');
  }
  lines.push('</gpx>');
  return lines.join('\n') + '\n';
}
