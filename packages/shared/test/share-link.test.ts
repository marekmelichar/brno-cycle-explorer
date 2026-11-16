import { describe, expect, it } from 'vitest';
import { SHARE_MAX_WAYPOINTS, decodeSharedPlan, encodeSharedPlan, stripSharedPlan, type SharedPlan } from '../src/share-link';

const PLAN: SharedPlan = {
  waypoints: [
    { position: [16.6068012, 49.1951034], name: 'Hlavní nádraží' },
    { position: [16.6084, 49.2071], name: null },
    { position: [16.626, 49.2], name: 'Lužánky, Brno' },
  ],
  rideType: 'ebike',
  preference: 'min_climb',
  engine: 'brouter',
  roundTrip: false,
};

describe('share link', () => {
  it('round-trips a plan (coordinates rounded to 5 decimals)', () => {
    const back = decodeSharedPlan(encodeSharedPlan(PLAN));
    expect(back).toEqual({
      ...PLAN,
      waypoints: [
        { position: [16.6068, 49.1951], name: 'Hlavní nádraží' },
        { position: [16.6084, 49.2071], name: null },
        { position: [16.626, 49.2], name: 'Lužánky, Brno' },
      ],
    });
  });

  it('is short and readable', () => {
    const q = encodeSharedPlan({ waypoints: PLAN.waypoints.map((w) => ({ ...w, name: null })), roundTrip: false });
    expect(q).toBe('wp=16.6068%2C49.1951%3B16.6084%2C49.2071%3B16.626%2C49.2');
  });

  it('keeps the loop length only for one-point loops', () => {
    const one = decodeSharedPlan(encodeSharedPlan({ waypoints: [PLAN.waypoints[0]], roundTrip: true, targetKm: 42 }));
    expect(one).toMatchObject({ roundTrip: true, targetKm: 42 });
    const many = decodeSharedPlan(encodeSharedPlan({ ...PLAN, roundTrip: true, targetKm: 42 }));
    expect(many?.roundTrip).toBe(true);
    expect(many?.targetKm).toBeUndefined();
  });

  it('sanitises names (no separators, length limit)', () => {
    const q = encodeSharedPlan({ waypoints: [{ position: [16.6, 49.2], name: `A|B\nC ${'x'.repeat(200)}` }], roundTrip: false });
    const name = decodeSharedPlan(q)!.waypoints[0].name!;
    expect(name.startsWith('A B C x')).toBe(true);
    expect(name.length).toBe(80);
  });

  it('rejects links without valid points', () => {
    expect(decodeSharedPlan('')).toBeNull();
    expect(decodeSharedPlan('?foo=1')).toBeNull();
    expect(decodeSharedPlan('?wp=abc')).toBeNull();
    expect(decodeSharedPlan('?wp=16.6')).toBeNull();
    expect(decodeSharedPlan('?wp=16.6,')).toBeNull();
    expect(decodeSharedPlan('?wp=200,49')).toBeNull();
    expect(decodeSharedPlan('?wp=16.6,95')).toBeNull();
    const tooMany = Array.from({ length: SHARE_MAX_WAYPOINTS + 1 }, () => '16.6,49.2').join(';');
    expect(decodeSharedPlan(`?wp=${tooMany}`)).toBeNull();
  });

  it('drops unknown options instead of failing', () => {
    const p = decodeSharedPlan('?wp=16.6,49.2;16.61,49.21&ride=rocket&pref=fastest&eng=<x>&km=500&loop=1');
    expect(p).toEqual({
      waypoints: [
        { position: [16.6, 49.2], name: null },
        { position: [16.61, 49.21], name: null },
      ],
      roundTrip: true,
    });
  });

  it('strips only the share parameters', () => {
    expect(stripSharedPlan('?wp=1,2&n=a&ride=ebike&utm_source=x')).toBe('?utm_source=x');
    expect(stripSharedPlan('?wp=1,2&loop=1&km=20')).toBe('');
  });
});
