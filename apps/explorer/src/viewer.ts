// The deep-zoom viewer: camera, input, tile scheduling across a worker pool, GPU
// compositing of paper + ink tiles, and the frozen HUD (year ruler, region headers).
import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import { yToYear, yearToY } from '../../../packages/render/src/displaylist.ts';
import { paperPixels, MOTTLE_OCTAVES, mottleOpacity } from '../../../packages/render/src/painter.ts';
import { PAPER, INK, INK_SOFT } from '../../../packages/core/src/palette.ts';
import { formatYear, roundYears } from '../../../packages/core/src/dates.ts';
import type { FromWorker, ToWorker } from './tile-worker.ts';

/** Tile edge in CSS pixels. */
const TILE = 256;
const MAX_SCALE = 2.5;
const MAX_TILES = 260;
const RULER_W = 64;
const HEADER_H = 30;

interface CachedTile { bitmap: ImageBitmap; used: number }

export class Viewer {
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private cssW = 0;
  private cssH = 0;
  /** Camera: world coordinate at the viewport's top-left, and CSS pixels per world unit. */
  private x0 = 0;
  private y0 = 0;
  private s = 0.05;
  private fitScale = 0.05;
  /** Until the user moves the camera, keep the whole sheet fitted (also fixes loading in a hidden tab). */
  private userMoved = false;

  private workers: { w: Worker; busy: boolean; ready: boolean }[] = [];
  private cache = new Map<string, CachedTile>();
  private inflight = new Set<string>();
  private queue: { id: string; k: number; i: number; j: number; pri: number }[] = [];
  private frame = 0;
  private dirty = true;
  private renderMs: number[] = [];
  private showStats = false;
  private cursor: { x: number; y: number } | null = null;
  private velocity = { x: 0, y: 0 };
  private patterns: { mottle: CanvasPattern; grain: CanvasPattern } | null = null;
  private status: HTMLElement;
  private dl: DisplayList;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, dl: DisplayList, chartUrl: string, status: HTMLElement) {
    this.canvas = canvas;
    this.dl = dl;
    this.status = status;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    this.fit();
    this.makePaper();
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./tile-worker.ts', import.meta.url), { type: 'module' });
      const slot = { w, busy: false, ready: false };
      w.onmessage = (e: MessageEvent<FromWorker>) => this.onWorker(slot, e.data);
      w.postMessage({ type: 'init', chartUrl } satisfies ToWorker);
      this.workers.push(slot);
    }
    this.bindInput();
    window.addEventListener('resize', () => {
      this.resize();
      if (!this.userMoved) this.fit();
      this.dirty = true;
    });
    const loop = () => { this.tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ camera
  private resize() {
    this.cssW = Math.max(1, window.innerWidth);
    this.cssH = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
  }

  fit() {
    this.fitScale = Math.max(1e-4, Math.min((this.cssW - RULER_W - 20) / this.dl.width, (this.cssH - HEADER_H - 10) / this.dl.height));
    this.s = this.fitScale;
    this.x0 = -(RULER_W + (this.cssW - RULER_W - this.dl.width * this.s) / 2) / this.s;
    this.y0 = -(HEADER_H + (this.cssH - HEADER_H - this.dl.height * this.s) / 2) / this.s;
    this.dirty = true;
  }

  private zoomAt(px: number, py: number, factor: number) {
    this.userMoved = true;
    const s = Math.min(MAX_SCALE, Math.max(this.fitScale * 0.5, this.s * factor));
    const wx = this.x0 + px / this.s;
    const wy = this.y0 + py / this.s;
    this.s = s;
    this.x0 = wx - px / s;
    this.y0 = wy - py / s;
    this.dirty = true;
  }

  private panBy(dx: number, dy: number) {
    this.userMoved = true;
    this.x0 -= dx / this.s;
    this.y0 -= dy / this.s;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const lines = e.deltaMode === 1 ? 33 : 1;
      if (e.ctrlKey) {
        this.zoomAt(px, py, Math.exp(-e.deltaY * lines * 0.012)); // trackpad pinch
      } else if (e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 40)) {
        this.panBy(-e.deltaX, -e.deltaY); // trackpad two-finger scroll
      } else {
        this.zoomAt(px, py, Math.exp(-e.deltaY * lines * 0.0025)); // mouse wheel
      }
    }, { passive: false });

    let drag: { x: number; y: number; t: number } | null = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.velocity = { x: 0, y: 0 };
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.dirty = true;
      if (!drag) return;
      const now = performance.now();
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const dt = Math.max(1, now - drag.t);
      this.velocity = { x: 0.8 * (dx / dt) + 0.2 * this.velocity.x, y: 0.8 * (dy / dt) + 0.2 * this.velocity.y };
      this.panBy(dx, dy);
      drag = { x: e.clientX, y: e.clientY, t: now };
    });
    const end = () => {
      if (drag && performance.now() - drag.t > 80) this.velocity = { x: 0, y: 0 };
      drag = null;
      c.classList.remove('dragging');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.cursor = null; this.dirty = true; });
    c.addEventListener('dblclick', (e) => {
      const r = c.getBoundingClientRect();
      this.animateZoom(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 0.5 : 2);
    });
    window.addEventListener('keydown', (e) => {
      const step = 120;
      const cx = this.cssW / 2, cy = this.cssH / 2;
      if (e.key === '0') { this.fit(); this.userMoved = false; }
      else if (e.key === '+' || e.key === '=') this.animateZoom(cx, cy, 2);
      else if (e.key === '-') this.animateZoom(cx, cy, 0.5);
      else if (e.key === 'ArrowLeft') this.panBy(step, 0);
      else if (e.key === 'ArrowRight') this.panBy(-step, 0);
      else if (e.key === 'ArrowUp') this.panBy(0, step);
      else if (e.key === 'ArrowDown') this.panBy(0, -step);
      else if (e.key === 'd' || e.key === 'D') { this.showStats = !this.showStats; this.dirty = true; }
    });
  }

  private animateZoom(px: number, py: number, factor: number) {
    const start = performance.now();
    let applied = 1;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 260);
      const eased = 1 - (1 - t) ** 3;
      const target = factor ** eased;
      this.zoomAt(px, py, target / applied);
      applied = target;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------ tiles
  /** Pyramid level for the current scale: tiles are rendered at 2^k CSS px per unit, never blurrier than now. */
  private levelFor(s: number) {
    return Math.max(-9, Math.min(Math.ceil(Math.log2(MAX_SCALE)), Math.ceil(Math.log2(s) - 1e-9)));
  }

  private visibleTiles(k: number) {
    const tw = TILE / 2 ** k;
    const i0 = Math.floor(this.x0 / tw), i1 = Math.floor((this.x0 + this.cssW / this.s) / tw);
    const j0 = Math.floor(this.y0 / tw), j1 = Math.floor((this.y0 + this.cssH / this.s) / tw);
    const out: { i: number; j: number }[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // Skip tiles entirely outside the chart.
      if ((i + 1) * tw < 0 || i * tw > this.dl.width || (j + 1) * tw < 0 || j * tw > this.dl.height) continue;
      out.push({ i, j });
    }
    return out;
  }

  private request(k: number, tiles: { i: number; j: number }[]) {
    const cx = this.x0 + this.cssW / this.s / 2, cy = this.y0 + this.cssH / this.s / 2;
    const tw = TILE / 2 ** k;
    this.queue = tiles
      .map(({ i, j }) => ({ id: `${k}/${i}/${j}`, k, i, j, pri: Math.hypot((i + 0.5) * tw - cx, (j + 0.5) * tw - cy) }))
      .filter((t) => !this.cache.has(t.id) && !this.inflight.has(t.id))
      .sort((a, b) => a.pri - b.pri);
    this.pump();
  }

  private pump() {
    for (const slot of this.workers) {
      if (!slot.ready || slot.busy) continue;
      const job = this.queue.shift();
      if (!job) return;
      const sDev = 2 ** job.k * this.dpr;
      const tw = TILE / 2 ** job.k;
      slot.busy = true;
      this.inflight.add(job.id);
      slot.w.postMessage({ type: 'tile', id: job.id, x0: job.i * tw, y0: job.j * tw, s: sDev, size: Math.round(TILE * this.dpr) } satisfies ToWorker);
    }
  }

  private onWorker(slot: { busy: boolean; ready: boolean }, msg: FromWorker) {
    if (msg.type === 'ready') { slot.ready = true; document.getElementById('loading')?.remove(); this.dirty = true; this.pump(); return; }
    if (msg.type === 'error') { console.error('tile worker:', msg.message); slot.busy = false; return; }
    slot.busy = false;
    this.inflight.delete(msg.id);
    this.cache.set(msg.id, { bitmap: msg.bitmap, used: this.frame });
    this.renderMs.push(msg.ms);
    if (this.renderMs.length > 200) this.renderMs.shift();
    this.evict();
    this.dirty = true;
    this.pump();
  }

  private evict() {
    if (this.cache.size <= MAX_TILES) return;
    const entries = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [id, t] of entries.slice(0, this.cache.size - MAX_TILES)) {
      t.bitmap.close();
      this.cache.delete(id);
    }
  }

  // ------------------------------------------------------------------ drawing
  private makePaper() {
    const px = paperPixels();
    const toCanvas = ({ size, data }: { size: number; data: Uint8Array }) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
      return c;
    };
    this.patterns = {
      mottle: this.ctx.createPattern(toCanvas(px.mottle), 'repeat')!,
      grain: this.ctx.createPattern(toCanvas(px.grain), 'repeat')!,
    };
  }

  private tick() {
    this.frame++;
    if (Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > 0.02 && !this.canvas.classList.contains('dragging')) {
      this.panBy(this.velocity.x * 16, this.velocity.y * 16);
      this.velocity.x *= 0.92;
      this.velocity.y *= 0.92;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  }

  private draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const k = this.levelFor(this.s);
    const tiles = this.visibleTiles(k);
    this.request(k, tiles);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (const { i, j } of tiles) this.drawTile(k, i, j);

    this.drawPaperTexture();
    this.drawHud(k);
  }

  /** Draw tile (k,i,j), or the best coarser ancestor's matching region while it renders. */
  private drawTile(k: number, i: number, j: number) {
    const tw = TILE / 2 ** k;
    const sx = (i * tw - this.x0) * this.s, sy = (j * tw - this.y0) * this.s;
    const ex = ((i + 1) * tw - this.x0) * this.s, ey = ((j + 1) * tw - this.y0) * this.s;
    const x = Math.floor(sx), y = Math.floor(sy), w = Math.ceil(ex) - x, h = Math.ceil(ey) - y;
    const own = this.cache.get(`${k}/${i}/${j}`);
    if (own) {
      own.used = this.frame;
      this.ctx.drawImage(own.bitmap, x, y, w, h);
      return;
    }
    for (let up = 1; up <= 6; up++) {
      const f = 2 ** up;
      const pi = Math.floor(i / f), pj = Math.floor(j / f);
      const parent = this.cache.get(`${k - up}/${pi}/${pj}`);
      if (!parent) continue;
      parent.used = this.frame;
      const src = parent.bitmap.width / f;
      this.ctx.drawImage(parent.bitmap, (i - pi * f) * src, (j - pj * f) * src, src, src, x, y, w, h);
      return;
    }
  }

  private drawPaperTexture() {
    if (!this.patterns) return;
    const { ctx } = this;
    for (const octave of MOTTLE_OCTAVES) {
      const opacity = mottleOpacity(octave, this.s);
      if (opacity < 0.01) continue;
      const k = octave[0] * this.s;
      this.patterns.mottle.setTransform(new DOMMatrix().translate(-this.x0 * this.s, -this.y0 * this.s).scale(k, k));
      ctx.globalAlpha = opacity;
      ctx.fillStyle = this.patterns.mottle;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    this.patterns.grain.setTransform(new DOMMatrix().scale(1 / this.dpr, 1 / this.dpr));
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.patterns.grain;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  private drawHud(k: number) {
    const { ctx } = this;
    const yOf = (year: number) => (yearToY(this.dl, year) - this.y0) * this.s;

    // Frozen region headers.
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.cssW, HEADER_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.font = '600 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of this.dl.regions) {
      const a = Math.max(RULER_W + 8, (r.x0 - this.x0) * this.s);
      const b = Math.min(this.cssW - 8, (r.x1 - this.x0) * this.s);
      if (b - a < 60) continue;
      ctx.fillText(spaced(r.name.toUpperCase()), (a + b) / 2, HEADER_H / 2 + 1);
    }
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(0, HEADER_H - 1, this.cssW, 1);

    // Frozen year ruler with steps that adapt to the zoom.
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, HEADER_H, RULER_W, this.cssH - HEADER_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(RULER_W - 1, HEADER_H, 1, this.cssH - HEADER_H);
    const pxPerYear = this.dl.time.unitsPerYear * this.s;
    const step = [1, 5, 10, 25, 50, 100, 250, 500, 1000].find((st) => st * pxPerYear >= 46) ?? 1000;
    const minor = [1, 5, 10, 25, 50, 100, 250, 500, 1000].find((st) => st * pxPerYear >= 9) ?? step;
    const yTop = yToYear(this.dl, this.y0 + HEADER_H / this.s);
    const yBot = yToYear(this.dl, this.y0 + this.cssH / this.s);
    ctx.textAlign = 'right';
    ctx.font = '11px ui-sans-serif, -apple-system, sans-serif';
    const majors = new Set(roundYears(Math.ceil(yTop), Math.floor(yBot), step));
    for (const yr of roundYears(Math.ceil(yTop), Math.floor(yBot), minor)) {
      if (yr < this.dl.time.year0 || yr > this.dl.time.year1) continue;
      const py = yOf(yr);
      const major = majors.has(yr);
      ctx.fillStyle = major ? INK : INK_SOFT;
      ctx.fillRect(RULER_W - (major ? 10 : 5), py, major ? 10 : 5, 1);
      if (major) ctx.fillText(rulerLabel(yr), RULER_W - 13, py);
    }
    // Cursor year.
    if (this.cursor && this.cursor.y > HEADER_H) {
      const yr = Math.round(yToYear(this.dl, this.y0 + this.cursor.y / this.s));
      if (yr >= this.dl.time.year0 && yr <= this.dl.time.year1) {
        ctx.fillStyle = 'rgba(184, 57, 45, 0.9)';
        ctx.fillRect(0, this.cursor.y, RULER_W, 1);
        ctx.fillRect(RULER_W, this.cursor.y, this.cssW - RULER_W, 0.5);
      }
    }

    // Status line.
    const z = this.s / this.fitScale;
    const level = z < 2.5 ? 'The wall' : z < 7 ? 'The era' : z < 22 ? 'The century' : 'Detail';
    const cursorYear = this.cursor ? formatYear(Math.round(yToYear(this.dl, this.y0 + this.cursor.y / this.s))) : '';
    let text = `${level} · ×${z < 10 ? z.toFixed(1) : Math.round(z)}${cursorYear ? ' · ' + cursorYear : ''}`;
    if (this.showStats) {
      const sorted = [...this.renderMs].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      text += `\nlevel ${k} · tiles ${this.cache.size} cached, ${this.inflight.size} rendering, ${this.queue.length} queued\nrender median ${med.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · ${this.workers.length} workers`;
    }
    if (this.status.textContent !== text) this.status.textContent = text;
  }
}

function spaced(s: string) {
  return s.split('').join(' ');
}

function rulerLabel(yr: number) {
  const t = formatYear(yr);
  return t.replace(' BCE', ' BC').replace(' CE', '');
}
