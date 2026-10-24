// Atlas worker: loads the Cliopatria era files, sorts and projects the borders, and draws the
// map onto an OffscreenCanvas, so none of that work competes with panning on the main thread.
import { geoEqualEarth, geoPath, geoContains, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';

interface PolityProps { n: string; f: number; t: number; l?: string; c?: string }
type Polity = Feature<Geometry, PolityProps>;

export type ToAtlas =
  | { type: 'init'; canvas: OffscreenCanvas; indexUrl: string; w: number; h: number; dpr: number }
  | { type: 'set'; year: number; focus: string | null }
  | { type: 'hover'; x: number; y: number }
  | { type: 'leave' };

export type FromAtlas = { type: 'state'; year: number; name: string | null; hoverLane: string | null };

const UNLINKED = '#B9AB93';
let W = 0, H = 0;
let ctx: OffscreenCanvasRenderingContext2D;
const projection = geoEqualEarth();
let path: ReturnType<typeof geoPath>;
/** Sphere, graticule and land: the same for every year, drawn once. */
let base: OffscreenCanvas | null = null;
let land: FeatureCollection | null = null;
let polities: Polity[] = [];
let year = 0;
let focus: string | null = null;
let hoverPolity: Polity | null = null;
let drawn = '';
let scheduled = false;

const chunks: { from: number; to: number; url: string; polities?: Polity[]; loading?: Promise<void> }[] = [];
let current: (typeof chunks)[number] | null = null;
const post = (msg: FromAtlas) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (e: MessageEvent<ToAtlas>) => {
  const m = e.data;
  if (m.type === 'init') void init(m);
  else if (m.type === 'set') {
    year = Math.round(m.year);
    focus = m.focus;
    if (chunks.length && (!current || year < current.from || year > current.to)) void ensure(year);
    schedule();
  } else if (m.type === 'hover') {
    const ll = projection.invert?.([m.x, m.y]);
    const hit = ll ? alive().reverse().find((p) => geoContains(p, ll)) ?? null : null;
    if (hit !== hoverPolity) { hoverPolity = hit; schedule(); }
  } else if (m.type === 'leave' && hoverPolity) { hoverPolity = null; schedule(); }
};

async function init(m: Extract<ToAtlas, { type: 'init' }>) {
  W = m.w; H = m.h;
  ctx = m.canvas.getContext('2d')!;
  ctx.scale(m.dpr, m.dpr);
  projection.fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
  path = geoPath(projection, ctx as unknown as CanvasRenderingContext2D);
  const base = new URL(m.indexUrl.replace(/\.atlas\.json$/, '/'));
  const index = await fetch(m.indexUrl, { cache: 'no-cache' }).then((r) => r.json()) as { chunks: { from: number; to: number; url: string }[] };
  chunks.push(...index.chunks.map((c) => ({ ...c, url: new URL(c.url, base).href })));
  await ensure(year);
}

/** Load (once) the era file covering a year and make it current; then warm its neighbours. */
async function ensure(y: number) {
  const i = Math.max(0, chunks.findIndex((x) => y >= x.from && y <= x.to));
  const c = chunks.find((x) => y >= x.from && y <= x.to) ?? (y < (chunks[0]?.from ?? 0) ? chunks[0] : chunks[chunks.length - 1]);
  if (!c) return;
  current = c;
  await load(c);
  if (current === c) { polities = c.polities!; drawn = ''; schedule(); }
  // Panning usually continues: have the next and previous eras ready.
  for (const n of [chunks[i + 1], chunks[i - 1]]) if (n) void load(n);
}

function load(c: (typeof chunks)[number]) {
  c.loading ??= fetch(c.url).then((r) => r.json()).then((topo: Topology<{ polities: GeometryCollection<PolityProps>; land: GeometryCollection }>) => {
    const areaPath = geoPath(projection);
    c.polities = (feature(topo, topo.objects.polities) as FeatureCollection<Geometry, PolityProps>).features
      // Smaller shapes last, so vassals and city-states sit on top of the empires around them.
      .map((p) => ({ p, a: areaPath.area(p) ?? 0 })).sort((a, b) => b.a - a.a).map(({ p }) => p);
    if (!land) { land = feature(topo, topo.objects.land) as FeatureCollection; base = null; }
  });
  return c.loading;
}

const alive = () => polities.filter((p) => p.properties.f <= year && p.properties.t >= year);

/** Coalesce: however many updates arrive while busy, draw once with the latest state. */
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; draw(); }, 0);
}

function drawBase() {
  const dpr = ctx.getTransform().a;
  base = new OffscreenCanvas(Math.round(W * dpr), Math.round(H * dpr));
  const b = base.getContext('2d')!;
  b.scale(dpr, dpr);
  const p = geoPath(projection, b as unknown as CanvasRenderingContext2D);
  b.beginPath(); p({ type: 'Sphere' }); b.fillStyle = '#DCE3E0'; b.fill();
  b.beginPath(); p(geoGraticule10()); b.strokeStyle = 'rgba(107,95,85,0.12)'; b.lineWidth = 0.5; b.stroke();
  if (land) { b.beginPath(); p(land); b.fillStyle = '#EDE3CC'; b.fill(); }
}

function draw() {
  if (!ctx) return;
  const key = `${year}|${focus}|${hoverPolity?.properties.n}|${polities.length}`;
  if (key === drawn) return;
  drawn = key;
  if (!base) drawBase();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(base!, 0, 0);
  ctx.restore();
  const now = alive();
  const focusOn = !!focus && now.some((p) => p.properties.l === focus);
  for (const p of now) {
    const mine = p.properties.l === focus;
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
  for (const p of now) if (p.properties.l === focus) outline(p, '#2B2420', 1.4);
  outline(hoverPolity, '#B8392D', 1.4);
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(107,95,85,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
  const name = hoverPolity?.properties.n ?? (focusOn ? now.find((p) => p.properties.l === focus)?.properties.n ?? null : null);
  post({ type: 'state', year, name, hoverLane: hoverPolity?.properties.l ?? null });
}
