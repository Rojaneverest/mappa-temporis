// Draws a window of the display list onto a Skia canvas. Shared by the browser tile
// workers and the Node print/video path.
import type { Canvas, CanvasKit, FontCollection, Image, Paint, Paragraph, Path } from 'canvaskit-wasm';
import type { DisplayList, ImageItem, Item, TextItem } from './displaylist.ts';
import { buildParagraph } from './text.ts';
import { PAPER, INK_SOFT } from '../../core/src/palette.ts';

/** Below this on-screen size text is drawn as soft grey lines ("greeking"). */
export const GREEK_BELOW_PX = 3.4;
/** Below this on-screen size text is not drawn at all. */
export const SKIP_BELOW_PX = 0.6;

// Paper: a warm base, soft mottling anchored to the world (so it zooms like a real sheet),
// and fine grain anchored to the screen. Both are small pre-baked tileable textures —
// sampling an image is ~100x cheaper on the CPU than evaluating noise per pixel.
const MOTTLE_SIZE = 256;
const GRAIN_SIZE = 128;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise in [0,1], tileable over `size` with lattice cells of `cell` pixels. */
function tileableNoise(size: number, cells: number, rand: () => number): Float32Array {
  const lattice = Array.from({ length: cells * cells }, rand);
  const at = (i: number, j: number) => lattice[((j + cells) % cells) * cells + ((i + cells) % cells)]!;
  const out = new Float32Array(size * size);
  const step = size / cells;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / step, fy = y / step;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    out[y * size + x] = a + (b - a) * sv;
  }
  return out;
}

/** Raw RGBA (unpremultiplied) paper textures, shared by Skia and the browser viewer. */
export function paperPixels() {
  const rand = rng(1066);
  const n1 = tileableNoise(MOTTLE_SIZE, 4, rand);
  const n2 = tileableNoise(MOTTLE_SIZE, 11, rand);
  const n3 = tileableNoise(MOTTLE_SIZE, 29, rand);
  const mottle = new Uint8Array(MOTTLE_SIZE * MOTTLE_SIZE * 4);
  for (let i = 0; i < n1.length; i++) {
    const m = n1[i]! * 0.55 + n2[i]! * 0.3 + n3[i]! * 0.15; // 0..1, mean ~0.5
    // Dark-brown stain whose opacity follows the noise (unpremultiplied).
    mottle.set([92, 70, 44, Math.round(Math.max(0, m - 0.32) * 70)], i * 4);
  }
  const grain = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE * 4);
  for (let i = 0; i < GRAIN_SIZE * GRAIN_SIZE; i++) {
    const g = rand();
    grain.set(g > 0.5 ? [255, 252, 240, Math.round((g - 0.5) * 40)] : [70, 55, 40, Math.round((0.5 - g) * 34)], i * 4);
  }
  return { mottle: { size: MOTTLE_SIZE, data: mottle }, grain: { size: GRAIN_SIZE, data: grain } };
}

/** World units per texel of each mottling octave, and its opacity. Shared with the viewer. */
export const MOTTLE_OCTAVES: [number, number][] = [[9, 0.8], [3.7, 0.4]];

/**
 * Mottling only shows once its blotches are large on screen; zoomed out, a real sheet
 * reads as an even tone. Returns the opacity of an octave at scale `s` (px per unit).
 */
export function mottleOpacity([unitsPerTexel, opacity]: [number, number], s: number): number {
  const periodPx = unitsPerTexel * MOTTLE_SIZE * s;
  const t = Math.min(1, Math.max(0, (periodPx - 500) / 1500));
  return opacity * t * t;
}

function makePaperImages(ck: CanvasKit) {
  const px = paperPixels();
  const info = (size: number) => ({ width: size, height: size, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
  return {
    mottle: ck.MakeImage(info(px.mottle.size), px.mottle.data, px.mottle.size * 4)!,
    grain: ck.MakeImage(info(px.grain.size), px.grain.data, px.grain.size * 4)!,
  };
}

/** Decoded images by "<id>/<size>". The caller loads what `imageNeeds` asks for before painting. */
export type ImageStore = Map<string, Image>;

/** The smallest stored size that is at least as sharp as the screen needs (largest if none is). */
export function pickImageSize(item: ImageItem, s: number): number {
  const px = Math.max(item.w, item.h) * s;
  return item.sizes.find((z) => z >= px) ?? item.sizes[item.sizes.length - 1]!;
}

/** Image files ("<id>/<size>") a view will draw. */
export function imageNeeds(dl: DisplayList, indices: Iterable<number>, s: number, zoom = s): string[] {
  const out: string[] = [];
  for (const i of indices) {
    const it = dl.items[i]!;
    if (it.k !== 'image' || fadeAt(it.fade, zoom) <= 0.01 || (it.fadeOut && fadeAt(it.fadeOut, zoom) >= 0.99) || Math.max(it.w, it.h) * s < 2) continue;
    out.push(`${it.id}/${pickImageSize(it, s)}`);
  }
  return out;
}

export interface View {
  /** World coordinates of the tile's top-left corner. */
  x0: number;
  y0: number;
  /** Device pixels per world unit. */
  s: number;
  /**
   * Zoom in CSS pixels per world unit, used for the calm-by-default fade-ins (designed in CSS px).
   * Defaults to `s`; on a Retina screen the browser passes s / devicePixelRatio.
   */
  zoom?: number;
  /** Optional layers switched on; items with a `layer` not in this set are skipped. */
  layers?: ReadonlySet<string>;
  widthPx: number;
  heightPx: number;
}

export class Painter {
  private paragraphs = new Map<number, Paragraph>();
  private paths = new Map<number, Path>();
  private paper: { mottle: Image; grain: Image };
  private pen: Paint;
  private layer: Paint;

  private ck: CanvasKit;
  private fonts: FontCollection;
  private dl: DisplayList;
  private images: ImageStore;

  constructor(ck: CanvasKit, fonts: FontCollection, dl: DisplayList, images: ImageStore = new Map()) {
    this.ck = ck;
    this.fonts = fonts;
    this.dl = dl;
    this.images = images;
    this.paper = makePaperImages(ck);
    this.pen = new ck.Paint();
    this.pen.setAntiAlias(true);
    this.layer = new ck.Paint();
  }

  /**
   * Draw the items with the given indices (already culled to the view, in z order).
   * `paper: false` leaves the background transparent — the browser viewer lays the paper
   * underneath and its texture on top on the GPU, which is far cheaper than doing it here.
   */
  paint(canvas: Canvas, view: View, indices: Iterable<number>, opts: { paper: boolean } = { paper: true }): void {
    const ck = this.ck;
    canvas.clear(opts.paper ? ck.parseColorString(PAPER) : ck.TRANSPARENT);
    canvas.save();
    canvas.scale(view.s, view.s);
    canvas.translate(-view.x0, -view.y0);
    const zoom = view.zoom ?? view.s;
    for (const i of indices) {
      const item = this.dl.items[i]!;
      if (item.layer && !view.layers?.has(item.layer)) continue;
      const alpha = (item.alpha ?? 1) * fadeAt(item.fade, zoom) * (item.fadeOut ? 1 - fadeAt(item.fadeOut, zoom) : 1);
      if (alpha <= 0.01) continue;
      switch (item.k) {
        case 'text': this.drawText(canvas, i, item, alpha, view.s); break;
        case 'image': this.drawImage(canvas, item, alpha, view.s); break;
        case 'rect': {
          const p = this.styled(item.fill ?? item.stroke!, alpha, item.fill ? 'fill' : 'stroke', item.sw, item.hair, view.s, undefined, item.multiply);
          const rect = ck.XYWHRect(item.x, item.y, item.w, item.h);
          if (item.r) canvas.drawRRect(ck.RRectXY(rect, item.r, item.r), p);
          else canvas.drawRect(rect, p);
          if (item.fill && item.stroke) {
            const s = this.styled(item.stroke, alpha, 'stroke', item.sw, item.hair, view.s);
            if (item.r) canvas.drawRRect(ck.RRectXY(rect, item.r, item.r), s);
            else canvas.drawRect(rect, s);
          }
          break;
        }
        case 'line': {
          const p = this.styled(item.stroke, alpha, 'stroke', item.sw, item.hair, view.s, item.dash);
          canvas.drawLine(item.x1, item.y1, item.x2, item.y2, p);
          break;
        }
        case 'path': {
          let path = this.paths.get(i);
          if (!path) {
            path = ck.Path.MakeFromSVGString(item.d) ?? undefined;
            if (!path) continue;
            this.paths.set(i, path);
          }
          const ramp = (p: Paint, color: string) => {
            if (!item.grad) return;
            const { y0, y1, stops } = item.grad;
            const base = ck.parseColorString(color);
            const colors = stops.map(([, a]) => ck.Color4f(base[0]!, base[1]!, base[2]!, a * alpha));
            p.setShader(ck.Shader.MakeLinearGradient([0, y0], [0, y1], colors, stops.map(([t]) => t), ck.TileMode.Clamp));
          };
          if (item.fill) {
            const p = this.styled(item.fill, alpha, 'fill', 0, false, view.s, undefined, item.multiply);
            ramp(p, item.fill);
            canvas.drawPath(path, p);
            p.setShader(null);
          }
          if (item.stroke) {
            const p = this.styled(item.stroke, alpha, 'stroke', item.sw, item.hair, view.s, item.dash);
            if (!item.fill) ramp(p, item.stroke);
            canvas.drawPath(path, p);
            p.setShader(null);
          }
          break;
        }
      }
    }
    canvas.restore();
    if (opts.paper) this.drawPaperTexture(canvas, view);
  }

  /** Mottling and grain laid over everything, as if the ink had soaked into the sheet. */
  private drawPaperTexture(canvas: Canvas, view: View) {
    const ck = this.ck;
    const p = this.pen;
    p.setBlendMode(ck.BlendMode.SrcOver);
    p.setStyle(ck.PaintStyle.Fill);
    p.setPathEffect(null);
    p.setColor(ck.BLACK);
    const rect = ck.XYWHRect(0, 0, view.widthPx, view.heightPx);
    // Two octaves of world-anchored mottling at unrelated periods, so the repeat never shows.
    for (const octave of MOTTLE_OCTAVES) {
      const opacity = mottleOpacity(octave, view.s);
      if (opacity < 0.01) continue;
      const k = octave[0] * view.s;
      const m = ck.Matrix.multiply(ck.Matrix.translated(-view.x0 * view.s, -view.y0 * view.s), ck.Matrix.scaled(k, k));
      const shader = this.paper.mottle.makeShaderOptions(ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Linear, ck.MipmapMode.None, m);
      p.setShader(shader);
      p.setAlphaf(opacity);
      canvas.drawRect(rect, p);
      shader.delete();
    }
    // Screen-anchored grain, offset so neighbouring tiles at one zoom line up.
    const gx = -((view.x0 * view.s) % GRAIN_SIZE), gy = -((view.y0 * view.s) % GRAIN_SIZE);
    const grain = this.paper.grain.makeShaderOptions(ck.TileMode.Repeat, ck.TileMode.Repeat, ck.FilterMode.Nearest, ck.MipmapMode.None, ck.Matrix.translated(gx, gy));
    p.setShader(grain);
    p.setAlphaf(1);
    canvas.drawRect(rect, p);
    p.setShader(null);
    grain.delete();
  }

  private styled(color: string, alpha: number, style: 'fill' | 'stroke', sw = 1, hair = false, s = 1, dash?: number[], multiply = false): Paint {
    const ck = this.ck;
    const p = this.pen;
    const c = ck.parseColorString(color);
    p.setShader(null);
    p.setColor(ck.Color4f(c[0]!, c[1]!, c[2]!, c[3]! * alpha));
    p.setStyle(style === 'fill' ? ck.PaintStyle.Fill : ck.PaintStyle.Stroke);
    p.setStrokeWidth(hair ? sw / s : sw);
    p.setBlendMode(multiply ? ck.BlendMode.Multiply : ck.BlendMode.SrcOver);
    p.setPathEffect(dash ? ck.PathEffect.MakeDash(hair ? dash.map((d) => d / s) : dash, 0) : null);
    return p;
  }

  private drawImage(canvas: Canvas, it: ImageItem, alpha: number, s: number) {
    const ck = this.ck;
    if (Math.max(it.w, it.h) * s < 2) return;
    const img = this.images.get(`${it.id}/${pickImageSize(it, s)}`)
      // Any loaded size beats a hole while the right one arrives.
      ?? it.sizes.map((z) => this.images.get(`${it.id}/${z}`)).find(Boolean);
    const dst = ck.XYWHRect(it.x, it.y, it.w, it.h);
    if (it.treatment === 'plate') {
      // A plate tipped into the book: soft shadow, a pale mount, a hairline frame.
      const m = Math.max(it.w, it.h) * 0.035;
      const mount = ck.XYWHRect(it.x - m, it.y - m, it.w + 2 * m, it.h + 2 * m);
      canvas.drawRect(ck.XYWHRect(it.x - m + m * 0.5, it.y - m + m * 0.8, it.w + 2 * m, it.h + 2 * m), this.styled('#5C4630', alpha * 0.18, 'fill'));
      canvas.drawRect(mount, this.styled('#F7F1E3', alpha, 'fill'));
      canvas.drawRect(mount, this.styled(INK_SOFT, alpha * 0.6, 'stroke', 1, true, s));
    }
    if (!img) {
      canvas.drawRect(dst, this.styled(INK_SOFT, alpha * 0.08, 'fill'));
      return;
    }
    const p = this.styled('#000000', alpha, 'fill', 0, false, s, undefined, it.treatment === 'backdrop');
    canvas.drawImageRectOptions(img, ck.XYWHRect(0, 0, img.width(), img.height()), dst, ck.FilterMode.Linear, ck.MipmapMode.None, p);
  }

  private drawText(canvas: Canvas, i: number, t: TextItem, alpha: number, s: number) {
    const px = t.size * s;
    if (px < SKIP_BELOW_PX) return;
    canvas.save();
    if (t.rot === -90) {
      canvas.translate(t.x, t.y + t.w);
      canvas.rotate(-90, 0, 0);
    } else {
      canvas.translate(t.x, t.y);
    }
    if (px < GREEK_BELOW_PX) {
      // Soft grey bars where the lines of text would be, like a poster seen from across a room.
      const p = this.styled(t.color, alpha * 0.28, 'fill');
      t.lines.forEach((lw, li) => {
        const x = t.align === 'center' ? (t.w - lw) / 2 : t.align === 'right' ? t.w - lw : 0;
        canvas.drawRect(this.ck.XYWHRect(x, li * t.lineH + t.lineH * 0.3, lw, t.lineH * 0.42), p);
      });
    } else {
      let para = this.paragraphs.get(i);
      if (!para) {
        para = buildParagraph(this.ck, this.fonts, { ...t, color: t.color });
        this.paragraphs.set(i, para);
        if (this.paragraphs.size > 3000) this.evict();
      }
      if (alpha < 0.999) {
        this.layer.setAlphaf(alpha);
        canvas.saveLayer(this.layer);
        canvas.drawParagraph(para, 0, 0);
        canvas.restore();
      } else {
        canvas.drawParagraph(para, 0, 0);
      }
    }
    canvas.restore();
  }

  private evict() {
    // Drop the oldest third; Map iteration order is insertion order.
    let n = Math.floor(this.paragraphs.size / 3);
    for (const [k, p] of this.paragraphs) {
      if (n-- <= 0) break;
      p.delete();
      this.paragraphs.delete(k);
    }
  }
}

export function fadeAt(fade: [number, number] | undefined, s: number): number {
  if (!fade) return 1;
  const [a, b] = fade;
  if (s <= a) return 0;
  if (s >= b) return 1;
  const t = (s - a) / (b - a);
  return t * t * (3 - 2 * t);
}

export function itemBox(item: Item): [number, number, number, number] {
  if (item.b) return item.b;
  throw new Error('display-list item without bbox');
}
