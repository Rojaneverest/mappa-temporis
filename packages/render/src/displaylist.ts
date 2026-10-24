import { yearToYOf, yToYearOf, upyAt, type TimeSegment } from '../../core/src/timescale.ts';
// The display list: the compiled chart. Every mark with its exact world position,
// produced once by the build and drawn identically in the browser, print and video.
// World units: 1 unit ≈ 1 screen pixel at "detail" zoom (scale 1).

export type TextRole =
  | 'title' | 'subtitle' | 'era' | 'region' | 'year'
  | 'lane-major' | 'lane-minor' | 'segment' | 'endonym'
  | 'label-strong' | 'label' | 'whisper' | 'caption' | 'specimen';

/** Scale range over which an item fades in: [invisible below, fully visible at]. */
export type Fade = [number, number];

interface Base {
  /** Bounding box [minX, minY, maxX, maxY] in world units (filled by the build). */
  b?: [number, number, number, number];
  fade?: Fade;
  /** Scale range over which an item fades out: [fully visible below, invisible at]. */
  fadeOut?: Fade;
  alpha?: number;
  /** Stable id of the content item this mark belongs to (for picking / the Folio). */
  ref?: string;
  /** Optional layer (e.g. "thread:silk-road"): drawn only when the viewer switches it on. */
  layer?: string;
  /** How a lens treats this mark: labels and images not in the lens fade hard, lanes a little. */
  lk?: 'label' | 'lane' | 'image';
  /** Lenses this mark belongs to (stays bright when one of them is on). */
  lens?: string[];
}

export interface TextItem extends Base {
  k: 'text';
  role: TextRole;
  text: string;
  /** Optional muted prefix drawn before the text (e.g. a date). */
  pre?: string;
  x: number;
  y: number;
  /** Wrap width (along the reading direction). */
  w: number;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** -90: reads bottom-to-top, occupying (x, y, h, w) in world space. */
  rot?: 0 | -90;
  /** Measured at build time with the same fonts: per-line widths, line height, total height. */
  lines: number[];
  lineH: number;
  h: number;
}

export interface PathItem extends Base {
  k: 'path';
  d: string;
  fill?: string;
  stroke?: string;
  /** Stroke width in world units, or in screen pixels when `hair` is set. */
  sw?: number;
  hair?: boolean;
  dash?: number[];
  multiply?: boolean;
  /** Vertical alpha ramp for feathered (uncertain) ends: stops of [t, alpha] between y0 and y1. */
  grad?: { y0: number; y1: number; stops: [number, number][] };
}

export interface RectItem extends Base {
  k: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  hair?: boolean;
  r?: number;
  multiply?: boolean;
  /** A dot of this radius in screen pixels, centred on (x, y), the same size at every zoom (lens marks). */
  dot?: number;
}

export interface LineItem extends Base {
  k: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  sw: number;
  hair?: boolean;
  dash?: number[];
}

export interface ImageItem extends Base {
  k: 'image';
  /** Asset id: files live at /img/<id>/<size>.webp */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Available long-side pixel sizes, ascending. */
  sizes: number[];
  treatment: 'cutout' | 'plate' | 'backdrop' | 'coin';
}

export type Item = TextItem | PathItem | RectItem | LineItem | ImageItem;

export interface DisplayList {
  version: 1;
  title: string;
  /** Which sheet this is, the sheet its fold strip switches to (decision 49), and whose Atlas it uses. */
  sheet?: { id: string; fold?: { sheet: string; label: string }; atlas: string };
  /** Path of this sheet's subset fonts, relative to the site root. */
  fonts: string;
  width: number;
  height: number;
  /** y = y0 + (astronomicalYear - year0) * unitsPerYear, or piecewise via `segments` when a prologue is compressed. */
  time: { y0: number; year0: number; year1: number; unitsPerYear: number; segments?: TimeSegment[] };
  /** Column headers for the frozen HUD. Columns flow over time (decision 48): `samples` gives each
   *  region's extent down the sheet; x0/x1 are its limits over all time. */
  regions: { x0: number; x1: number; name: string; short?: string; samples?: { y: number; x0: number; x1: number }[] }[];
  /** Lenses offered by the viewer, with how many drawn labels each lights up. */
  lenses?: { id: string; name: string; color: string; note: string; count: number }[];
  items: Item[];
  stats: Record<string, number>;
}

export function yearToY(dl: Pick<DisplayList, 'time'>, year: number): number {
  return dl.time.segments ? yearToYOf(dl.time.segments, year) : dl.time.y0 + (year - dl.time.year0) * dl.time.unitsPerYear;
}

export function yToYear(dl: Pick<DisplayList, 'time'>, y: number): number {
  return dl.time.segments ? yToYearOf(dl.time.segments, y) : dl.time.year0 + (y - dl.time.y0) / dl.time.unitsPerYear;
}

/** Units per year around a given year (the prologue is compressed). */
export function unitsPerYearAt(dl: Pick<DisplayList, 'time'>, year: number): number {
  return dl.time.segments ? upyAt(dl.time.segments, year) : dl.time.unitsPerYear;
}

/** A region's horizontal extent at world y (nearest sample), or null where it has no lanes. */
export function regionExtentAt(r: DisplayList['regions'][number], y: number): [number, number] | null {
  if (!r.samples?.length) return [r.x0, r.x1];
  let best = r.samples[0]!;
  for (const q of r.samples) if (Math.abs(q.y - y) < Math.abs(best.y - y)) best = q;
  return Math.abs(best.y - y) > 1500 ? null : [best.x0, best.x1];
}
