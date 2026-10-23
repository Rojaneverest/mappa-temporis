// The Atlas: a small world map synced to the chart. It shows the polities that existed in
// the year under the cursor (Cliopatria, Seshat — CC BY 4.0), coloured like their lanes,
// and lights up the territory of the lane you hover or select.
import { geoEqualEarth, geoPath, geoContains, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { formatYear } from '../../../packages/core/src/dates.ts';

interface PolityProps { n: string; f: number; t: number; l?: string; c?: string }
type Polity = Feature<Geometry, PolityProps>;

const W = 360;
const H = 196;
const UNLINKED = '#B9AB93';

export class Atlas {
  private ctx: CanvasRenderingContext2D;
  private polities: Polity[] = [];
  private land: FeatureCollection | null = null;
  private projection = geoEqualEarth();
  private path: ReturnType<typeof geoPath>;
  private year = 0;
  private focus: string | null = null;
  private hoverPolity: Polity | null = null;
  private drawn = '';
  private el: HTMLElement;
  private caption: HTMLElement;
  /** Clicking a polity that has a lane selects that lane. */
  onPickLane: (laneId: string) => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = `<canvas width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas><div class="caption"></div>`;
    const canvas = el.querySelector('canvas')!;
    this.caption = el.querySelector('.caption')!;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(2, 2);
    this.projection.fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
    this.path = geoPath(this.projection, this.ctx);
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const ll = this.projection.invert?.([e.clientX - r.left, e.clientY - r.top]);
      const hit = ll ? this.alive().reverse().find((p) => geoContains(p, ll)) ?? null : null;
      if (hit !== this.hoverPolity) { this.hoverPolity = hit; canvas.style.cursor = hit?.properties.l ? 'pointer' : ''; this.draw(true); }
    });
    canvas.addEventListener('mouseleave', () => { this.hoverPolity = null; this.draw(true); });
    canvas.addEventListener('click', () => { if (this.hoverPolity?.properties.l) this.onPickLane(this.hoverPolity.properties.l); });
  }

  async load(url: string) {
    const topo = await fetch(url).then((r) => r.json()) as Topology<{ polities: GeometryCollection<PolityProps>; land: GeometryCollection }>;
    this.polities = (feature(topo, topo.objects.polities) as FeatureCollection<Geometry, PolityProps>).features
      // Smaller shapes last, so vassals and city-states sit on top of the empires around them.
      .sort((a, b) => (this.path.area(b) ?? 0) - (this.path.area(a) ?? 0));
    this.land = feature(topo, topo.objects.land) as FeatureCollection;
    this.draw(true);
  }

  /** Update the year (astronomical) and the lane in focus; redraws only when something changed. */
  set(year: number, focus: string | null) {
    this.year = Math.round(year);
    this.focus = focus;
    this.draw();
  }

  private alive() {
    return this.polities.filter((p) => p.properties.f <= this.year && p.properties.t >= this.year);
  }

  private draw(force = false) {
    const key = `${this.year}|${this.focus}|${this.hoverPolity?.properties.n}`;
    if (!force && key === this.drawn) return;
    this.drawn = key;
    const { ctx, path } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = '#DCE3E0'; ctx.fill();
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = 'rgba(107,95,85,0.12)'; ctx.lineWidth = 0.5; ctx.stroke();
    if (this.land) { ctx.beginPath(); path(this.land); ctx.fillStyle = '#EDE3CC'; ctx.fill(); }
    const alive = this.alive();
    const focusOn = !!this.focus && alive.some((p) => p.properties.l === this.focus);
    for (const p of alive) {
      const mine = p.properties.l === this.focus;
      ctx.beginPath(); path(p);
      ctx.globalAlpha = focusOn && !mine ? 0.32 : p.properties.l ? 0.85 : 0.55;
      ctx.fillStyle = p.properties.c ?? UNLINKED;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(247,241,227,0.9)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    const outline = (p: Polity | undefined | null, color: string, width: number) => {
      if (!p) return;
      ctx.beginPath(); path(p); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    for (const p of alive) if (p.properties.l === this.focus) outline(p, '#2B2420', 1.4);
    outline(this.hoverPolity, '#B8392D', 1.4);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(107,95,85,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    const name = this.hoverPolity?.properties.n ?? (focusOn ? alive.find((p) => p.properties.l === this.focus)?.properties.n : undefined);
    this.caption.textContent = `${formatYear(this.year)}${name ? ' · ' + name : ''}`;
    this.el.title = 'Borders: Cliopatria (Seshat Global History Databank), CC BY 4.0';
  }
}
