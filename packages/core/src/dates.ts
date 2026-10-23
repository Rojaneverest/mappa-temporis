// Historical dates.
//
// Authors write dates the way historians do ("c. 138 BCE", "202 BCE – 220 CE",
// "5th c. BCE", "1920s"). Internally every year is an *astronomical* year:
// 1 CE = 1, 1 BCE = 0, 2 BCE = -1 … so durations are plain subtraction and the
// missing year zero never needs special handling.

export type Precision = 'year' | 'decade' | 'century' | 'millennium';

export interface HistDate {
  /** Astronomical year (1 BCE = 0). For coarse precisions this is the midpoint. */
  year: number;
  precision: Precision;
  circa: boolean;
  /** Inclusive astronomical range the date could fall in. */
  earliest: number;
  latest: number;
}

export interface HistSpan {
  start: HistDate;
  end: HistDate;
}

export type Era = 'BCE' | 'CE';

export function toAstronomical(year: number, era: Era): number {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`Historical years start at 1, got ${year} ${era}`);
  }
  return era === 'BCE' ? 1 - year : year;
}

export function fromAstronomical(year: number): { year: number; era: Era } {
  return year <= 0 ? { year: 1 - year, era: 'BCE' } : { year, era: 'CE' };
}

const ERA_RE = /\b(BCE|BC|CE|AD)\b\.?/i;
const CIRCA_RE = /^(c\.|ca\.|circa|~)\s*/i;
const SPAN_SEP_RE = /\s+(?:–|—|-|to)\s+/;

function eraOf(text: string): Era | undefined {
  const m = text.match(ERA_RE);
  if (!m) return undefined;
  const e = m[1]!.toUpperCase();
  return e === 'BCE' || e === 'BC' ? 'BCE' : 'CE';
}

function ordinalNumber(word: string): number | undefined {
  const m = word.match(/^(\d+)(st|nd|rd|th)$/i);
  return m ? Number(m[1]) : undefined;
}

/**
 * Parse a single date. `defaultEra` applies when the text carries no era
 * (used for the first half of spans like "300 – 200 BCE").
 */
export function parseDate(input: string, defaultEra: Era = 'CE'): HistDate {
  let text = input.trim();
  let circa = false;
  const c = text.match(CIRCA_RE);
  if (c) {
    circa = true;
    text = text.slice(c[0].length);
  }
  const era = eraOf(text) ?? defaultEra;
  const body = text.replace(ERA_RE, '').trim();

  // "5th c.", "early 5th century", "late 3rd millennium"
  const coarse = body.match(/^(early|mid|middle|late)?\s*(\d+(?:st|nd|rd|th))\s+(c\.|cent\.?|century|millennium)$/i);
  if (coarse) {
    const n = ordinalNumber(coarse[2]!)!;
    const isMillennium = /millennium/i.test(coarse[3]!);
    const size = isMillennium ? 1000 : 100;
    // Nth century CE = years (N-1)*100+1 … N*100; BCE mirrors it.
    const firstCal = era === 'CE' ? (n - 1) * size + 1 : n * size;
    const lastCal = era === 'CE' ? n * size : (n - 1) * size + 1;
    let a = toAstronomical(firstCal, era);
    let b = toAstronomical(lastCal, era);
    const third = (b - a + 1) / 3;
    const part = coarse[1]?.toLowerCase();
    if (part === 'early') b = Math.round(a + third - 1);
    else if (part === 'mid' || part === 'middle') { a = Math.round(a + third); b = Math.round(a + third - 1); }
    else if (part === 'late') a = Math.round(b - third + 1);
    return {
      year: Math.round((a + b) / 2),
      precision: isMillennium ? 'millennium' : 'century',
      circa: circa || part !== undefined,
      earliest: a,
      latest: b,
    };
  }

  // "1920s" / "1920s CE" / "490s BCE"
  const decade = body.match(/^(\d+)0s$/);
  if (decade) {
    const start = Number(decade[1]) * 10;
    const a = era === 'CE' ? toAstronomical(Math.max(1, start), 'CE') : toAstronomical(start + 9, 'BCE');
    const b = era === 'CE' ? toAstronomical(start + 9, 'CE') : toAstronomical(Math.max(1, start), 'BCE');
    return { year: Math.round((a + b) / 2), precision: 'decade', circa, earliest: a, latest: b };
  }

  const plain = body.replace(/,/g, '').match(/^(\d+)$/);
  if (plain) {
    const y = toAstronomical(Number(plain[1]), era);
    // A circa date is uncertain by roughly 10% of its distance from today, within sane bounds.
    const slack = circa ? Math.min(50, Math.max(5, Math.round(Math.abs(2000 - y) * 0.01))) : 0;
    return { year: y, precision: 'year', circa, earliest: y - slack, latest: y + slack };
  }

  throw new SyntaxError(`Cannot parse date "${input}"`);
}

/** Parse "202 BCE – 220 CE", "9 – 23 CE", "c. 300 BCE – c. 300 CE", or a single date. */
export function parseSpan(input: string): HistSpan {
  const parts = input.trim().split(SPAN_SEP_RE);
  if (parts.length === 1) {
    const d = parseDate(parts[0]!);
    return { start: d, end: d };
  }
  if (parts.length !== 2) throw new SyntaxError(`Cannot parse span "${input}"`);
  const [a, b] = parts as [string, string];
  const endEra = eraOf(b) ?? 'CE';
  // "300 – 200 BCE": the start inherits the end's era when it has none of its own.
  const start = parseDate(a, eraOf(a) ?? endEra);
  const end = parseDate(b, endEra);
  if (end.year < start.year) throw new RangeError(`Span ends before it starts: "${input}"`);
  return { start, end };
}

export interface FormatOptions {
  /** Always print the era, even for years ≥ 1000 CE. */
  forceEra?: boolean;
}

export function formatYear(year: number, opts: FormatOptions = {}): string {
  const { year: y, era } = fromAstronomical(year);
  if (era === 'BCE') return `${y} BCE`;
  return opts.forceEra || y < 1000 ? `${y} CE` : String(y);
}

export function formatDate(d: HistDate, opts: FormatOptions = {}): string {
  const prefix = d.circa && d.precision === 'year' ? 'c. ' : '';
  if (d.precision === 'year') return prefix + formatYear(d.year, opts);
  if (d.precision === 'decade') {
    const { year, era } = fromAstronomical(d.earliest);
    const start = era === 'CE' ? year - (year % 10) : year - (year % 10);
    return `${start}s${era === 'BCE' ? ' BCE' : ''}`;
  }
  const size = d.precision === 'millennium' ? 1000 : 100;
  const { year, era } = fromAstronomical(d.year);
  const n = Math.ceil(year / size);
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix} ${size === 1000 ? 'millennium' : 'c.'}${era === 'BCE' ? ' BCE' : ''}`;
}

export function formatSpan(s: HistSpan): string {
  if (s.start.year === s.end.year && s.start.precision === s.end.precision) return formatDate(s.start);
  const sameEra = (s.start.year <= 0) === (s.end.year <= 0);
  const a = formatDate(s.start);
  const b = formatDate(s.end);
  // "9 – 23 CE" rather than "9 CE – 23 CE"; keep both eras when they differ.
  if (sameEra && s.start.year > 0 && s.end.year < 1000) return `${a.replace(/ CE$/, '')} – ${b}`;
  if (sameEra && s.start.year <= 0) return `${a.replace(/ BCE$/, '')} – ${b}`;
  return `${a} – ${b}`;
}

/** Years between two astronomical years (no year-zero correction needed). */
export function yearsBetween(a: number, b: number): number {
  return Math.abs(b - a);
}

/**
 * Astronomical years whose *calendar* year is a multiple of `step` (…, 200 BCE, 100 BCE, 1 CE, 100 CE, …),
 * within [from, to]. 1 CE stands in for the missing year zero.
 */
export function roundYears(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  // BCE side: calendar n·step BCE is astronomical 1 − n·step.
  const nMax = Math.floor((1 - from) / step);
  const nMin = Math.max(1, Math.ceil((1 - to) / step));
  for (let n = nMax; n >= nMin; n--) out.push(1 - n * step);
  if (from <= 1 && to >= 1) out.push(1);
  for (let m = Math.max(1, Math.ceil(from / step)); m * step <= to; m++) out.push(m * step);
  return out;
}
