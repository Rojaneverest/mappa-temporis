// The deep-zoom viewer: camera, input, tile scheduling across a worker pool, GPU
// compositing of paper + ink tiles, picking, and the frozen HUD (year ruler, region
// and lane headers, minimap, status).
import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import { yToYear, yearToY, regionExtentAt } from '../../../packages/render/src/displaylist.ts';
import type { Folio } from '../../../packages/render/src/folio.ts';
import { paperPixels, MOTTLE_OCTAVES, mottleOpacity } from '../../../packages/render/src/painter.ts';
import { PAPER, INK, INK_SOFT } from '../../../packages/core/src/palette.ts';
import { formatYear, roundYears } from '../../../packages/core/src/dates.ts';
import type { FromWorker, ToWorker } from './tile-worker.ts';
import { Picker } from './picker.ts';

/** Tile edge in CSS pixels. */
const TILE = 256;
const MAX_SCALE = 1.2;
const MAX_TILES = 260;
const RULER_W = 64;
const HEADER_H = 30;
const LANE_HEADER_H = 22;
const MINI_W = 150;
const ACCENT = '#B8392D';

interface CachedTile { bitmap: ImageBitmap; used: number }
type Slot = { w: Worker; busy: boolean; ready: boolean };

export interface ViewState { cx: number; cy: number; z: number }

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
  /** Until the user moves the camera, keep the opening view (also fixes loading in a hidden tab). */
  private userMoved = false;

  private workers: Slot[] = [];
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
  private folio: Folio;
  private canvas: HTMLCanvasElement;
  private picker: Picker;
  private hover: string | null = null;
  private selected: string | null = null;
  private flight: number | null = null;
  private mini: { bitmap: ImageBitmap; s: number; x: number; y: number; w: number; h: number } | null = null;
  private miniRequested = false;
  private showMini = true;
  /** Optional layers switched on, and a generation counter so tiles from an older state are ignored. */
  private layers = new Set<string>();
  private gen = 0;
  /** Tiles from before the last layer switch, shown until their replacements arrive. */
  private stale = new Map<string, CachedTile>();

  /** Called when the user picks something on the chart (or empty paper: null). */
  onPick: (ref: string | null) => void = () => {};
  /** Called with the year when the year ruler is clicked. */
  onRulerClick: (year: number) => void = () => {};
  /** Called (debounced by the caller) whenever the camera settles somewhere new. */
  onViewChange: (v: ViewState) => void = () => {};
  /** Called every frame drawn: the year under the cursor (or at the centre) and what is hovered / selected. */
  onFocus: (year: number, hover: string | null, selected: string | null) => void = () => {};
  /** Distance of the minimap from the bottom edge (other panels may sit below it). */
  miniBottom = 48;

  constructor(canvas: HTMLCanvasElement, dl: DisplayList, folio: Folio, chartUrl: string, status: HTMLElement) {
    this.canvas = canvas;
    this.dl = dl;
    this.folio = folio;
    this.status = status;
    this.picker = new Picker(dl);
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    this.fit();
    this.makePaper();
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./tile-worker.ts', import.meta.url), { type: 'module' });
      const slot: Slot = { w, busy: false, ready: false };
      w.onmessage = (e: MessageEvent<FromWorker>) => this.onWorker(slot, e.data);
      w.postMessage({ type: 'init', chartUrl } satisfies ToWorker);
      this.workers.push(slot);
    }
    this.bindInput();
    const onResize = () => {
      // Keep the same world point centred at the same absolute scale.
      const keep = this.userMoved ? { cx: this.x0 + this.cssW / 2 / this.s, cy: this.y0 + this.cssH / 2 / this.s } : null;
      this.resize();
      if (keep) {
        this.x0 = keep.cx - this.cssW / 2 / this.s;
        this.y0 = keep.cy - this.cssH / 2 / this.s;
        this.clamp();
      } else this.fit();
      this.dirty = true;
    };
    window.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(canvas);
    const loop = () => { this.tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ camera
  /**
   * Window size changes also change the "fit" reference scale that zoom factors are measured against.
   * Fit means *cover*: the paper fills the screen and is the furthest you can zoom out (decision 28).
   */
  private resize() {
    this.cssW = Math.max(1, window.innerWidth);
    this.cssH = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.fitScale = Math.max(1e-4, Math.max((this.cssW - RULER_W) / this.dl.width, (this.cssH - HEADER_H) / this.dl.height));
  }

  /** The opening view: the paper filling the screen, from the top of time. */
  fit() {
    this.s = this.fitScale;
    this.x0 = -Infinity;
    this.y0 = -Infinity;
    this.clamp();
    this.dirty = true;
  }

  /** Keep the camera on the paper: never smaller than the screen, never past its edges. */
  private clamp() {
    this.s = Math.min(MAX_SCALE, Math.max(this.fitScale, this.s));
    const fitAxis = (v: number, lead: number, screen: number, size: number) => {
      const lo = -lead / this.s, hi = size - screen / this.s;
      return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    };
    this.x0 = fitAxis(this.x0, RULER_W, this.cssW, this.dl.width);
    this.y0 = fitAxis(this.y0, HEADER_H, this.cssH, this.dl.height);
  }

  /** The year at the middle of the screen. */
  get centerYear(): number {
    return Math.round(yToYear(this.dl, this.y0 + (HEADER_H + (this.cssH - HEADER_H) / 2) / this.s));
  }

  get view(): ViewState {
    return { cx: this.x0 + this.cssW / 2 / this.s, cy: this.y0 + this.cssH / 2 / this.s, z: this.s / this.fitScale };
  }

  setView(v: ViewState) {
    this.s = Math.min(MAX_SCALE, Math.max(this.fitScale, v.z * this.fitScale));
    this.x0 = v.cx - this.cssW / 2 / this.s;
    this.y0 = v.cy - this.cssH / 2 / this.s;
    this.clamp();
    this.userMoved = true;
    this.dirty = true;
  }

  private moved() {
    this.clamp();
    this.userMoved = true;
    this.dirty = true;
    this.onViewChange(this.view);
  }

  private zoomAt(px: number, py: number, factor: number) {
    const s = Math.min(MAX_SCALE, Math.max(this.fitScale, this.s * factor));
    const wx = this.x0 + px / this.s;
    const wy = this.y0 + py / this.s;
    this.s = s;
    this.x0 = wx - px / s;
    this.y0 = wy - py / s;
    this.moved();
  }

  private panBy(dx: number, dy: number) {
    this.x0 -= dx / this.s;
    this.y0 -= dy / this.s;
    this.moved();
  }

  /** Smoothly fly so that the world box [x, y, w, h] fills a comfortable part of the screen. */
  flyTo(box: [number, number, number, number], opts: { maxZ?: number; panel?: boolean } = {}) {
    const usableW = this.cssW - RULER_W - (opts.panel ? 400 : 0) - 80;
    const usableH = this.cssH - HEADER_H - LANE_HEADER_H - 80;
    let s = Math.min(usableW / Math.max(box[2], 1), usableH / Math.max(box[3], 1));
    s = Math.min(MAX_SCALE, (opts.maxZ ?? 40) * this.fitScale, Math.max(this.fitScale, s));
    const target = {
      s,
      cx: box[0] + box[2] / 2,
      cy: box[1] + box[3] / 2,
    };
    const offsetX = (RULER_W - (opts.panel ? 400 : 0)) / 2;
    const from = { s: this.s, cx: this.x0 + (this.cssW / 2 + offsetX) / this.s, cy: this.y0 + (this.cssH / 2) / this.s };
    // Zoom out a little mid-flight when travelling far, like a map.
    const dist = Math.hypot(target.cx - from.cx, target.cy - from.cy);
    const peak = Math.min(from.s, target.s, (Math.min(this.cssW, this.cssH) * 0.9) / Math.max(dist, 1));
    const start = performance.now();
    const dur = Math.min(1400, 450 + Math.sqrt(dist * from.s) * 18);
    if (this.flight) cancelAnimationFrame(this.flight);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const logS = Math.log(from.s) * (1 - e) + Math.log(target.s) * e;
      const dip = Math.sin(Math.PI * e) * Math.max(0, Math.log(Math.min(from.s, target.s)) - Math.log(peak));
      this.s = Math.exp(logS - dip);
      const cx = from.cx + (target.cx - from.cx) * e, cy = from.cy + (target.cy - from.cy) * e;
      this.x0 = cx - (this.cssW / 2 + offsetX) / this.s;
      this.y0 = cy - (this.cssH / 2) / this.s;
      this.dirty = true;
      if (t < 1) this.flight = requestAnimationFrame(step);
      else { this.flight = null; this.moved(); }
    };
    this.flight = requestAnimationFrame(step);
  }

  setLayers(layers: Iterable<string>) {
    this.layers = new Set(layers);
    this.picker.layers = this.layers;
    this.gen++;
    for (const t of this.stale.values()) t.bitmap.close();
    // Re-key current tiles without their generation so drawTile can still find them.
    this.stale = new Map([...this.cache].map(([id, t]) => [id.slice(id.indexOf('/') + 1), t]));
    this.cache.clear();
    this.inflight.clear();
    this.queue = [];
    this.dirty = true;
  }

  select(ref: string | null) {
    this.selected = ref;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ input
  private toWorld(px: number, py: number) {
    return { x: this.x0 + px / this.s, y: this.y0 + py / this.s };
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.flight) { cancelAnimationFrame(this.flight); this.flight = null; }
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

    let drag: { x: number; y: number; t: number; sx: number; sy: number } | null = null;
    c.addEventListener('pointerdown', (e) => {
      if (this.flight) { cancelAnimationFrame(this.flight); this.flight = null; }
      const r = c.getBoundingClientRect();
      if (this.miniHit(e.clientX - r.left, e.clientY - r.top)) {
        this.miniJump(e.clientX - r.left, e.clientY - r.top);
        c.setPointerCapture(e.pointerId);
        drag = null;
        (c as HTMLCanvasElement & { miniDrag?: boolean }).miniDrag = true;
        return;
      }
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY };
      this.velocity = { x: 0, y: 0 };
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      this.cursor = { x: px, y: py };
      this.dirty = true;
      if ((c as HTMLCanvasElement & { miniDrag?: boolean }).miniDrag) { this.miniJump(px, py); return; }
      if (!drag) {
        const w = this.toWorld(px, py);
        const hit = px > RULER_W && py > HEADER_H && !this.miniHit(px, py) ? this.picker.pick(w.x, w.y, this.s) : null;
        const ref = hit?.ref ?? null;
        if (ref !== this.hover) { this.hover = ref; c.style.cursor = ref ? 'pointer' : ''; }
        return;
      }
      const now = performance.now();
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const dt = Math.max(1, now - drag.t);
      this.velocity = { x: 0.8 * (dx / dt) + 0.2 * this.velocity.x, y: 0.8 * (dy / dt) + 0.2 * this.velocity.y };
      this.panBy(dx, dy);
      drag = { ...drag, x: e.clientX, y: e.clientY, t: now };
    });
    const end = (e: PointerEvent) => {
      (c as HTMLCanvasElement & { miniDrag?: boolean }).miniDrag = false;
      if (drag) {
        const still = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4;
        if (performance.now() - drag.t > 80 || still) this.velocity = { x: 0, y: 0 };
        if (still && e.type === 'pointerup') {
          const r = c.getBoundingClientRect();
          const px = e.clientX - r.left, py = e.clientY - r.top;
          const w = this.toWorld(px, py);
          if (px <= RULER_W && py > HEADER_H) this.onRulerClick(Math.round(yToYear(this.dl, w.y)));
          else {
            const hit = px > RULER_W && py > HEADER_H ? this.picker.pick(w.x, w.y, this.s) : null;
            this.onPick(hit?.ref ?? null);
          }
        }
      }
      drag = null;
      c.classList.remove('dragging');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.cursor = null; this.hover = null; this.dirty = true; });
    c.addEventListener('dblclick', (e) => {
      const r = c.getBoundingClientRect();
      this.animateZoom(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 0.5 : 2);
    });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      const step = 120;
      const cx = this.cssW / 2, cy = this.cssH / 2;
      if (e.key === '0') { this.fit(); this.userMoved = false; this.onViewChange(this.view); }
      else if (e.key === '+' || e.key === '=') this.animateZoom(cx, cy, 2);
      else if (e.key === '-') this.animateZoom(cx, cy, 0.5);
      else if (e.key === 'ArrowLeft') this.panBy(step, 0);
      else if (e.key === 'ArrowRight') this.panBy(-step, 0);
      else if (e.key === 'ArrowUp') this.panBy(0, step);
      else if (e.key === 'ArrowDown') this.panBy(0, -step);
      else if (e.key === 'd' || e.key === 'D') { this.showStats = !this.showStats; this.dirty = true; }
      else if (e.key === 'm' || e.key === 'M') { this.showMini = !this.showMini; this.dirty = true; }
      else if (e.key === 'Escape') this.onPick(null);
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
      if ((i + 1) * tw < 0 || i * tw > this.dl.width || (j + 1) * tw < 0 || j * tw > this.dl.height) continue;
      out.push({ i, j });
    }
    return out;
  }

  private request(k: number, tiles: { i: number; j: number }[]) {
    const cx = this.x0 + this.cssW / this.s / 2, cy = this.y0 + this.cssH / this.s / 2;
    const tw = TILE / 2 ** k;
    this.queue = tiles
      .map(({ i, j }) => ({ id: `${this.gen}/${k}/${i}/${j}`, k, i, j, pri: Math.hypot((i + 0.5) * tw - cx, (j + 0.5) * tw - cy) }))
      .filter((t) => !this.cache.has(t.id) && !this.inflight.has(t.id))
      .sort((a, b) => a.pri - b.pri);
    this.pump();
  }

  private pump() {
    for (const slot of this.workers) {
      if (!slot.ready || slot.busy) continue;
      if (!this.mini && !this.miniRequested) { this.requestMini(slot); continue; }
      const job = this.queue.shift();
      if (!job) return;
      const sDev = 2 ** job.k * this.dpr;
      const tw = TILE / 2 ** job.k;
      const size = Math.round(TILE * this.dpr);
      slot.busy = true;
      this.inflight.add(job.id);
      slot.w.postMessage({ type: 'tile', id: job.id, x0: job.i * tw, y0: job.j * tw, s: sDev, zoom: 2 ** job.k, w: size, h: size, layers: [...this.layers] } satisfies ToWorker);
    }
  }

  private requestMini(slot: Slot) {
    this.miniRequested = true;
    const s = (MINI_W * this.dpr) / this.dl.width;
    slot.busy = true;
    slot.w.postMessage({ type: 'tile', id: 'mini', x0: 0, y0: 0, s, zoom: s / this.dpr, w: Math.round(this.dl.width * s), h: Math.round(this.dl.height * s), layers: [] } satisfies ToWorker);
  }

  private onWorker(slot: Slot, msg: FromWorker) {
    if (msg.type === 'ready') { slot.ready = true; document.getElementById('loading')?.remove(); this.dirty = true; this.pump(); return; }
    if (msg.type === 'error') { console.error('tile worker:', msg.message); slot.busy = false; return; }
    slot.busy = false;
    if (msg.id === 'mini') {
      const h = (MINI_W * this.dl.height) / this.dl.width;
      this.mini = { bitmap: msg.bitmap, s: MINI_W / this.dl.width, x: 12, y: 0, w: MINI_W, h };
      this.dirty = true;
      this.pump();
      return;
    }
    this.inflight.delete(msg.id);
    if (!msg.id.startsWith(`${this.gen}/`)) { msg.bitmap.close(); this.pump(); return; }
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

  // ------------------------------------------------------------------ minimap
  private miniRect() {
    if (!this.mini || !this.showMini || this.s / this.fitScale < 1.6) return null;
    const h = Math.min(this.mini.h, this.cssH * 0.45);
    const w = (h / this.mini.h) * this.mini.w;
    return { x: RULER_W + 12, y: this.cssH - h - this.miniBottom, w, h };
  }

  private miniHit(px: number, py: number) {
    const r = this.miniRect();
    return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  private miniJump(px: number, py: number) {
    const r = this.miniRect();
    if (!r) return;
    const wx = ((px - r.x) / r.w) * this.dl.width;
    const wy = ((py - r.y) / r.h) * this.dl.height;
    this.x0 = wx - this.cssW / 2 / this.s;
    this.y0 = wy - this.cssH / 2 / this.s;
    this.moved();
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
    this.clamp();
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
    this.drawHighlight(this.hover, 0.45, 1.2);
    this.drawHighlight(this.selected, 0.9, 2);
    this.drawHud(k);
    this.drawMinimap();
    const focusY = this.cursor && this.cursor.y > HEADER_H ? this.cursor.y : this.cssH / 2;
    const year = Math.min(this.dl.time.year1, Math.max(this.dl.time.year0, yToYear(this.dl, this.y0 + focusY / this.s)));
    this.onFocus(year, this.hover, this.selected);
  }

  /** Draw tile (k,i,j), or the best coarser ancestor's matching region while it renders. */
  private drawTile(k: number, i: number, j: number) {
    const tw = TILE / 2 ** k;
    const sx = (i * tw - this.x0) * this.s, sy = (j * tw - this.y0) * this.s;
    const ex = ((i + 1) * tw - this.x0) * this.s, ey = ((j + 1) * tw - this.y0) * this.s;
    const x = Math.floor(sx), y = Math.floor(sy), w = Math.ceil(ex) - x, h = Math.ceil(ey) - y;
    const own = this.cache.get(`${this.gen}/${k}/${i}/${j}`);
    if (own) {
      own.used = this.frame;
      this.ctx.drawImage(own.bitmap, x, y, w, h);
      return;
    }
    const old = this.stale.get(`${k}/${i}/${j}`);
    if (old) {
      this.ctx.drawImage(old.bitmap, x, y, w, h);
      return;
    }
    for (let up = 1; up <= 6; up++) {
      const f = 2 ** up;
      const pi = Math.floor(i / f), pj = Math.floor(j / f);
      const parent = this.cache.get(`${this.gen}/${k - up}/${pi}/${pj}`);
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

  private drawHighlight(ref: string | null, alpha: number, width: number) {
    if (!ref) return;
    const box = this.picker.boxOf(ref, this.s) ?? this.folio.entries[ref]?.box.map((v, i) => (i < 2 ? v : 0)) as [number, number, number, number] | undefined;
    if (!box) return;
    const pad = 6;
    const x = (box[0] - this.x0) * this.s - pad, y = (box[1] - this.y0) * this.s - pad;
    const w = (box[2] - box[0]) * this.s + 2 * pad, h = (box[3] - box[1]) * this.s + 2 * pad;
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawHud(k: number) {
    const { ctx } = this;
    const yOf = (year: number) => (yearToY(this.dl, year) - this.y0) * this.s;

    // Pinned lane headers: when a lane's own name has scrolled away, keep it at the top.
    const z = this.s / this.fitScale;
    const viewTop = this.y0 + (HEADER_H + LANE_HEADER_H) / this.s;
    const viewBottom = this.y0 + this.cssH / this.s;
    const laneHeads = z < 2.2 ? [] : this.folio.lanes.filter((l) =>
      l.top < viewTop && l.bottom > viewTop + 40 / this.s && l.bottom < Infinity && l.top < viewBottom && l.prominence <= (z < 6 ? 2 : z < 15 ? 3 : 4));
    const headerH = HEADER_H + (laneHeads.length ? LANE_HEADER_H : 0);

    ctx.globalAlpha = 0.93;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.cssW, headerH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.font = '600 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Region names: shrink to fit their column; drop any that would collide.
    let lastRight = -Infinity;
    const midY = this.y0 + this.cssH / 2 / this.s;
    for (const r of this.dl.regions) {
      const ext = regionExtentAt(r, midY);
      if (!ext) continue;
      const a = Math.max(RULER_W + 8, (ext[0] - this.x0) * this.s);
      const b = Math.min(this.cssW - 8, (ext[1] - this.x0) * this.s);
      if (b - a < 40) continue;
      let label = spaced(r.name.toUpperCase());
      let size = 12;
      ctx.font = `600 ${size}px Georgia, serif`;
      let w = ctx.measureText(label).width;
      if (r.short && w * 8 / 12 > b - a - 6) { label = spaced(r.short.toUpperCase()); w = ctx.measureText(label).width; }
      if (w > b - a - 6) { size = Math.max(8, Math.floor((size * (b - a - 6)) / w)); ctx.font = `600 ${size}px Georgia, serif`; w = ctx.measureText(label).width; }
      const cx = (a + b) / 2;
      if (w > b - a + 4 || cx - w / 2 < lastRight + 6) continue;
      ctx.fillText(label, cx, HEADER_H / 2 + 1);
      lastRight = cx + w / 2;
    }
    if (laneHeads.length) {
      ctx.font = '600 11px ui-sans-serif, -apple-system, sans-serif';
      let lastRight = -Infinity;
      for (const l of [...laneHeads].sort((a, b) => a.cx - b.cx)) {
        const x = (l.cx - this.x0) * this.s;
        if (x < RULER_W + 10 || x > this.cssW - 10) continue;
        const w = ctx.measureText(l.name).width;
        if (x - w / 2 < lastRight + 8) continue;
        lastRight = x + w / 2;
        ctx.fillStyle = l.prominence <= 2 ? INK : INK_SOFT;
        ctx.fillText(l.name, x, HEADER_H + LANE_HEADER_H / 2);
        ctx.fillRect(x - 0.5, HEADER_H + LANE_HEADER_H - 4, 1, 4);
      }
    }
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(0, headerH - 1, this.cssW, 1);

    // Frozen year ruler with steps that adapt to the zoom.
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, headerH, RULER_W, this.cssH - headerH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK_SOFT;
    ctx.fillRect(RULER_W - 1, headerH, 1, this.cssH - headerH);
    // Tick spacing follows the local scale: each stretch of the piecewise time axis gets its own steps.
    const steps = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const yTop = yToYear(this.dl, this.y0 + headerH / this.s);
    const yBot = yToYear(this.dl, this.y0 + this.cssH / this.s);
    const t = this.dl.time;
    const parts = t.segments ?? [{ year0: t.year0, year1: t.year1, upy: t.unitsPerYear }];
    ctx.textAlign = 'right';
    ctx.font = '11px ui-sans-serif, -apple-system, sans-serif';
    let lastLabel = -Infinity;
    for (const seg of parts) {
      const a = Math.max(seg.year0, yTop, t.year0);
      const b = Math.min(seg.year1 - 1e-9, yBot, t.year1);
      if (b < a) continue;
      const pxPerYear = seg.upy * this.s;
      const step = steps.find((st) => st * pxPerYear >= 46) ?? 5000;
      const minor = steps.find((st) => st * pxPerYear >= 9) ?? step;
      const majors = new Set(roundYears(Math.ceil(a), Math.floor(b), step));
      for (const yr of roundYears(Math.ceil(a), Math.floor(b), minor)) {
        const py = yOf(yr);
        const major = majors.has(yr) && py - lastLabel >= 16;
        ctx.fillStyle = major ? INK : INK_SOFT;
        ctx.fillRect(RULER_W - (major ? 10 : 5), py, major ? 10 : 5, 1);
        if (major) { ctx.fillText(rulerLabel(yr), RULER_W - 13, py); lastLabel = py; }
      }
    }
    if (this.cursor && this.cursor.y > headerH) {
      const yr = Math.round(yToYear(this.dl, this.y0 + this.cursor.y / this.s));
      if (yr >= this.dl.time.year0 && yr <= this.dl.time.year1) {
        ctx.fillStyle = 'rgba(184, 57, 45, 0.9)';
        ctx.fillRect(0, this.cursor.y, RULER_W, 1);
        ctx.fillRect(RULER_W, this.cursor.y, this.cssW - RULER_W, 0.5);
      }
    }

    const level = z < 2.5 ? 'The wall' : z < 7 ? 'The era' : z < 22 ? 'The century' : 'Detail';
    const cursorYear = this.cursor ? formatYear(Math.round(yToYear(this.dl, this.y0 + this.cursor.y / this.s))) : '';
    const hoverName = this.hover ? this.folio.entries[this.hover]?.title : undefined;
    let text = `${level} · ×${z < 10 ? z.toFixed(1) : Math.round(z)}${cursorYear ? ' · ' + cursorYear : ''}${hoverName ? ' · ' + hoverName : ''}`;
    if (this.showStats) {
      const sorted = [...this.renderMs].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      text += `\nlevel ${k} · tiles ${this.cache.size} cached, ${this.inflight.size} rendering, ${this.queue.length} queued\nrender median ${med.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · ${this.workers.length} workers`;
    }
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  private drawMinimap() {
    const r = this.miniRect();
    if (!r || !this.mini) return;
    const { ctx } = this;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = PAPER;
    ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.mini.bitmap, r.x, r.y, r.w, r.h);
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    const k = r.w / this.dl.width;
    const vx = r.x + this.x0 * k, vy = r.y + this.y0 * k, vw = (this.cssW / this.s) * k, vh = (this.cssH / this.s) * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.fillStyle = 'rgba(184, 57, 45, 0.12)';
    ctx.fillRect(vx, vy, Math.max(3, vw), Math.max(3, vh));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, Math.max(3, vw), Math.max(3, vh));
    ctx.restore();
  }
}

function spaced(s: string) {
  return s.split('').join(' ');
}

function rulerLabel(yr: number) {
  const t = formatYear(yr);
  return t.replace(' BCE', ' BC').replace(' CE', '');
}
