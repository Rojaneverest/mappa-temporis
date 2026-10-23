import { describe, expect, it } from 'vitest';
import { makeTimescale, yearToYOf, yToYearOf, upyAt } from './timescale.ts';

describe('timescale', () => {
  const segs = makeTimescale(1000, [
    { year0: -9999, year1: -3299, upy: 2.4 },
    { year0: -3299, year1: 2027, upy: 12 },
  ]);

  it('is continuous across the scale break', () => {
    expect(yearToYOf(segs, -9999)).toBe(1000);
    expect(yearToYOf(segs, -3299)).toBeCloseTo(1000 + 6700 * 2.4);
    expect(yearToYOf(segs, -3298) - yearToYOf(segs, -3299)).toBeCloseTo(12);
  });

  it('round-trips', () => {
    for (const yr of [-9000, -3299, -500, 1, 1453, 2026]) expect(yToYearOf(segs, yearToYOf(segs, yr))).toBeCloseTo(yr);
  });

  it('reports the local scale', () => {
    expect(upyAt(segs, -5000)).toBe(2.4);
    expect(upyAt(segs, 1000)).toBe(12);
  });
});
