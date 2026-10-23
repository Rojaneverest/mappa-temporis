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
  alpha?: number;
  /** Stable id of the content item this mark belongs to (for picking / the Folio). */
  ref?: string;
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
  treatment: 'cutout' | 'plate';
}

export type Item = TextItem | PathItem | RectItem | LineItem | ImageItem;

export interface DisplayList {
  version: 1;
  title: string;
  width: number;
  height: number;
  /** y = y0 + (astronomicalYear - year0) * unitsPerYear */
  time: { y0: number; year0: number; year1: number; unitsPerYear: number };
  /** Column headers for the frozen HUD: [x0, x1, name]. */
  regions: { x0: number; x1: number; name: string }[];
  items: Item[];
  stats: Record<string, number>;
}

export function yearToY(dl: Pick<DisplayList, 'time'>, year: number): number {
  return dl.time.y0 + (year - dl.time.year0) * dl.time.unitsPerYear;
}

export function yToYear(dl: Pick<DisplayList, 'time'>, y: number): number {
  return dl.time.year0 + (y - dl.time.y0) / dl.time.unitsPerYear;
}
