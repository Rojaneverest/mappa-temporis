// Piecewise-linear time → y mapping. The main chart is equidistant; a prologue (e.g. the
// Neolithic) may be compressed, with a clearly marked scale break between the parts.

export interface TimeSegment {
  /** Astronomical years covered, [year0, year1). */
  year0: number;
  year1: number;
  /** y at year0. */
  y0: number;
  /** World units per year inside this segment. */
  upy: number;
}

/** Build contiguous segments from parts (in time order), starting at y = y0. */
export function makeTimescale(y0: number, parts: { year0: number; year1: number; upy: number }[]): TimeSegment[] {
  const out: TimeSegment[] = [];
  let y = y0;
  for (const p of parts) {
    out.push({ ...p, y0: y });
    y += (p.year1 - p.year0) * p.upy;
  }
  return out;
}

export function yearToYOf(segs: TimeSegment[], year: number): number {
  const s = segs.find((s) => year < s.year1) ?? segs[segs.length - 1]!;
  const seg = year < segs[0]!.year0 ? segs[0]! : s;
  return seg.y0 + (year - seg.year0) * seg.upy;
}

export function yToYearOf(segs: TimeSegment[], y: number): number {
  const s = segs.find((s) => y < s.y0 + (s.year1 - s.year0) * s.upy) ?? segs[segs.length - 1]!;
  const seg = y < segs[0]!.y0 ? segs[0]! : s;
  return seg.year0 + (y - seg.y0) / seg.upy;
}

/** Units per year at a given year (for ruler tick spacing and slide limits). */
export function upyAt(segs: TimeSegment[], year: number): number {
  return (segs.find((s) => year < s.year1) ?? segs[segs.length - 1]!).upy;
}
