// The Atlas: a small world map synced to the chart. It shows the polities that existed in
// the year under the cursor (Cliopatria, Seshat — CC BY 4.0), coloured like their lanes,
// and lights up the territory of the lane you hover or select. Loading, projecting and
// drawing happen in a worker (atlas-worker.ts) on an OffscreenCanvas; this side only
// forwards the year, the focus and the pointer, and shows the caption.
import { formatYear } from '../../../packages/core/src/dates.ts';
import type { FromAtlas, ToAtlas } from './atlas-worker.ts';

const W = 360;
const H = 196;

export class Atlas {
  private worker: Worker;
  private canvas: HTMLCanvasElement;
  private caption: HTMLElement;
  private sent = '';
  private hoverLane: string | null = null;
  /** Clicking a polity that has a lane selects that lane. */
  onPickLane: (laneId: string) => void = () => {};

  constructor(el: HTMLElement) {
    el.innerHTML = `<canvas width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas><div class="caption"></div>`;
    el.title = 'Borders: Cliopatria (Seshat Global History Databank), CC BY 4.0';
    this.canvas = el.querySelector('canvas')!;
    this.caption = el.querySelector('.caption')!;
    this.worker = new Worker(new URL('./atlas-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromAtlas>) => {
      const m = e.data;
      this.hoverLane = m.hoverLane;
      this.canvas.style.cursor = m.hoverLane ? 'pointer' : '';
      this.caption.textContent = `${formatYear(m.year)}${m.name ? ' · ' + m.name : ''}`;
    };
    // Pointer moves arrive far more often than frames: forward at most one per frame.
    let pending: { x: number; y: number } | null = null;
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (!pending) requestAnimationFrame(() => { if (pending) this.post({ type: 'hover', ...pending }); pending = null; });
      pending = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    this.canvas.addEventListener('mouseleave', () => { pending = null; this.post({ type: 'leave' }); });
    this.canvas.addEventListener('click', () => { if (this.hoverLane) this.onPickLane(this.hoverLane); });
  }

  private post(msg: ToAtlas, transfer: Transferable[] = []) { this.worker.postMessage(msg, transfer); }

  async load(indexUrl: string) {
    const offscreen = this.canvas.transferControlToOffscreen();
    this.post({ type: 'init', canvas: offscreen, indexUrl: new URL(indexUrl, location.href).href, w: W, h: H, dpr: 2 }, [offscreen]);
  }

  /** Update the year (astronomical) and the lane in focus; only changes are sent. */
  set(year: number, focus: string | null) {
    const key = `${Math.round(year)}|${focus}`;
    if (key === this.sent) return;
    this.sent = key;
    this.post({ type: 'set', year, focus });
  }
}
