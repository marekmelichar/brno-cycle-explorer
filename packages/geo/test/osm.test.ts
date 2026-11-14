import { describe, expect, it } from 'vitest';
import { describeOsm, osmClass, osmClassBreakdown, osmForRange, parseWayTags } from '../src/osm';

describe('OSM way tags', () => {
  it('parses BRouter WayTags strings', () => {
    expect(parseWayTags('reversedirection=yes highway=pedestrian')).toEqual({ reversedirection: 'yes', highway: 'pedestrian' });
    expect(parseWayTags('')).toEqual({});
    expect(parseWayTags(undefined)).toEqual({});
    expect(parseWayTags('highway=residential bogus surface=asphalt')).toEqual({ highway: 'residential', surface: 'asphalt' });
  });
  it('classifies ways', () => {
    expect(osmClass({ highway: 'cycleway' })).toBe('cycleway');
    expect(osmClass({ highway: 'path', bicycle: 'designated' })).toBe('cycleway');
    expect(osmClass({ highway: 'path' })).toBe('path');
    expect(osmClass({ highway: 'residential' })).toBe('quiet_street');
    expect(osmClass({ highway: 'secondary' })).toBe('main_road');
    expect(osmClass({ highway: 'primary_link' })).toBe('main_road');
    expect(osmClass({ highway: 'track' })).toBe('track');
    expect(osmClass({})).toBe('other');
  });
  it('describes ways in Czech with surface and speed limit', () => {
    expect(describeOsm({ highway: 'residential', surface: 'asphalt', maxspeed: '30' })).toBe('klidná ulice (obytná / zóna), asfalt, max 30 km/h');
    expect(describeOsm({ highway: 'track', surface: 'gravel' })).toBe('polní / lesní cesta, štěrk');
    expect(describeOsm({ highway: 'tertiary', bicycle: 'designated' })).toContain('určeno pro kola');
  });
  const intervals = [
    { from: 0, to: 100, tags: { highway: 'residential' } },
    { from: 100, to: 300, tags: { highway: 'cycleway' } },
    { from: 300, to: 400, tags: { highway: 'secondary' } },
  ];
  it('picks the interval covering most of a stretch, with distance scaling', () => {
    expect(osmForRange(intervals, 50, 250)!.tags.highway).toBe('cycleway');
    expect(osmForRange(intervals, 0, 90)!.share).toBeCloseTo(1, 5);
    // analysed route 2 % shorter than the engine's: 340 m analysed ≈ 346.8 m engine → secondary
    expect(osmForRange(intervals, 300 / 1.02, 390 / 1.02, 1.02)!.tags.highway).toBe('secondary');
    expect(osmForRange([], 0, 10)).toBeNull();
    expect(osmForRange(intervals, 10, 10)).toBeNull();
  });
  it('sums length per class over stretches', () => {
    const b = osmClassBreakdown(intervals, [{ from: 50, to: 150 }, { from: 350, to: 400 }]);
    expect(b).toEqual([
      { cls: 'cycleway', label: 'cyklostezka podle OSM', length: 50 },
      { cls: 'quiet_street', label: 'klidná ulice (obytná / zóna)', length: 50 },
      { cls: 'main_road', label: 'hlavní silnice', length: 50 },
    ]);
  });
});
