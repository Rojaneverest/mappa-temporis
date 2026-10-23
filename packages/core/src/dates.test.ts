import { describe, expect, it } from 'vitest';
import { formatDate, formatSpan, formatYear, parseDate, parseSpan, roundYears, toAstronomical, yearsBetween } from './dates.ts';

describe('astronomical years', () => {
  it('maps BCE with no year zero', () => {
    expect(toAstronomical(1, 'BCE')).toBe(0);
    expect(toAstronomical(202, 'BCE')).toBe(-201);
    expect(toAstronomical(1, 'CE')).toBe(1);
  });

  it('measures across the era boundary without an off-by-one', () => {
    // 1 BCE → 1 CE is one year.
    expect(yearsBetween(toAstronomical(1, 'BCE'), toAstronomical(1, 'CE'))).toBe(1);
    // Cleopatra's death (30 BCE) → Moon landing (1969) vs. Great Pyramid (c. 2560 BCE) → Cleopatra.
    const cleo = toAstronomical(30, 'BCE');
    expect(yearsBetween(cleo, 1969)).toBeLessThan(yearsBetween(toAstronomical(2560, 'BCE'), cleo));
  });
});

describe('parseDate', () => {
  it('parses plain and circa years', () => {
    expect(parseDate('105 CE')).toMatchObject({ year: 105, precision: 'year', circa: false });
    const d = parseDate('c. 138 BCE');
    expect(d).toMatchObject({ year: -137, circa: true });
    expect(d.earliest).toBeLessThan(d.year);
    expect(parseDate('AD 1066').year).toBe(1066);
    expect(parseDate('3,300 BC').year).toBe(-3299);
    expect(parseDate('1453').year).toBe(1453);
  });

  it('parses centuries, including BCE and early/late', () => {
    const c5bce = parseDate('5th c. BCE');
    expect(c5bce.precision).toBe('century');
    expect(c5bce.earliest).toBe(-499); // 500 BCE
    expect(c5bce.latest).toBe(-400); // 401 BCE
    const late3 = parseDate('late 3rd century');
    expect(late3.earliest).toBeGreaterThan(230);
    expect(late3.latest).toBe(300);
    expect(late3.circa).toBe(true);
  });

  it('parses decades', () => {
    expect(parseDate('1920s')).toMatchObject({ precision: 'decade', earliest: 1920, latest: 1929 });
  });

  it('rejects nonsense', () => {
    expect(() => parseDate('soon')).toThrow();
    expect(() => parseDate('0 BCE')).toThrow();
  });
});

describe('parseSpan', () => {
  it('handles mixed eras and inherited eras', () => {
    const han = parseSpan('202 BCE – 220 CE');
    expect([han.start.year, han.end.year]).toEqual([-201, 220]);
    expect(parseSpan('9 – 23 CE').start.year).toBe(9);
    const ws = parseSpan('475 – 221 BCE');
    expect([ws.start.year, ws.end.year]).toEqual([-474, -220]);
  });

  it('refuses spans that run backwards', () => {
    expect(() => parseSpan('220 – 202 CE')).toThrow();
  });
});

describe('formatting', () => {
  it('round-trips readable forms', () => {
    expect(formatYear(-201)).toBe('202 BCE');
    expect(formatYear(105)).toBe('105 CE');
    expect(formatYear(1453)).toBe('1453');
    expect(formatDate(parseDate('c. 138 BCE'))).toBe('c. 138 BCE');
    expect(formatDate(parseDate('5th c. BCE'))).toBe('5th c. BCE');
    expect(formatSpan(parseSpan('202 BCE – 220 CE'))).toBe('202 BCE – 220 CE');
    expect(formatSpan(parseSpan('9 – 23 CE'))).toBe('9 – 23 CE');
    expect(formatSpan(parseSpan('475 – 221 BCE'))).toBe('475 – 221 BCE');
  });
});

describe('roundYears', () => {
  it('lands on calendar-round years on both sides of the era boundary', () => {
    const labels = roundYears(toAstronomical(250, 'BCE'), 150, 100).map((a) => formatYear(a));
    expect(labels).toEqual(['200 BCE', '100 BCE', '1 CE', '100 CE']);
  });
});
