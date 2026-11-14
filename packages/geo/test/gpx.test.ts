import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGpx, elevationStats, GpxParseError, parseGpx, trackDistance } from '../src/gpx';
import { xmlParser } from './helpers';

const fixture = (n: string) => readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/${n}`, import.meta.url)), 'utf8');

describe('GPX parsing', () => {
  it('parses a real track with elevation', () => {
    const g = parseGpx(fixture('rullerovo-riviera.gpx'), xmlParser);
    expect(g.name).toBe('Rullerovo nábřeží – Riviéra');
    expect(g.segments).toHaveLength(1);
    expect(g.stats.invalidPointCount).toBe(0);
    expect(g.stats.elevationCoverage).toBe(1);
    const d = trackDistance(g.segments);
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(4500);
  });

  it('handles multi-segment tracks, routes, missing elevation and corrupted points', () => {
    const xml = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="49.2" lon="16.6"><name>Start</name></wpt>
  <trk><name>Multi</name>
    <trkseg>
      <trkpt lat="49.19" lon="16.60"><ele>210</ele></trkpt>
      <trkpt lat="abc" lon="16.601"/>
      <trkpt lat="49.191" lon="16.602"/>
      <trkpt lat="95" lon="16.603"/>
      <trkpt lat="49.192" lon="16.604"><ele>215</ele></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="49.20" lon="16.61"/>
      <trkpt lat="49.201" lon="16.611"/>
    </trkseg>
    <trkseg>
      <trkpt lat="49.30" lon="16.70"/>
    </trkseg>
  </trk>
  <rte><name>R</name><rtept lat="49.21" lon="16.62"/><rtept lat="49.211" lon="16.621"/></rte>
</gpx>`;
    const g = parseGpx(xml, xmlParser);
    expect(g.segments.length).toBe(3); // 2 valid trk segments + 1 rte; single-point segment dropped
    expect(g.segments[0]).toHaveLength(3);
    expect(g.segments[0][1].ele).toBeNull();
    expect(g.stats.invalidPointCount).toBe(2);
    expect(g.stats.trackCount).toBe(1);
    expect(g.stats.routeCount).toBe(1);
    expect(g.waypoints).toHaveLength(1);
    expect(g.warnings.join(' ')).toMatch(/neplatných bodů/);
    expect(g.warnings.join(' ')).toMatch(/jediným platným bodem/);
  });

  it('rejects non-GPX and empty input with a typed error', () => {
    expect(() => parseGpx('', xmlParser)).toThrow(GpxParseError);
    expect(() => parseGpx('<kml></kml>', xmlParser)).toThrow(/gpx/);
    expect(() => parseGpx('<gpx><trk><trkseg></trkseg></trk></gpx>', xmlParser)).toThrow(/žádnou trasu/);
  });

  it('round-trips through buildGpx', () => {
    const xml = buildGpx({
      name: 'Test & <trasa>',
      segments: [[{ lon: 16.6, lat: 49.2, ele: 200 }, { lon: 16.61, lat: 49.21, ele: null }], [{ lon: 16.62, lat: 49.22 }, { lon: 16.63, lat: 49.23 }]],
      waypoints: [{ name: 'Start', lon: 16.6, lat: 49.2 }],
    });
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml).toContain('Test &amp; &lt;trasa&gt;');
    const g = parseGpx(xml, xmlParser);
    expect(g.segments).toHaveLength(2);
    expect(g.segments[0][0].ele).toBe(200);
    expect(g.waypoints[0].name).toBe('Start');
  });
});

describe('elevation statistics', () => {
  it('returns null without elevation data', () => {
    expect(elevationStats([null, null])).toBeNull();
  });
  it('filters noise with hysteresis', () => {
    const noisy = [200, 201, 200, 201, 200, 201, 200];
    expect(elevationStats(noisy)!.gain).toBe(0);
    const climb = [200, 205, 210, 208, 220, 215, 200];
    const s = elevationStats(climb)!;
    expect(s.gain).toBe(20);
    expect(s.loss).toBe(20);
    expect(s.reliable).toBe(true);
  });
  it('flags partial coverage as unreliable', () => {
    const s = elevationStats([200, null, null, null, 210])!;
    expect(s.reliable).toBe(false);
  });
});
