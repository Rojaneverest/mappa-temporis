import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import type { Folio } from '../../../packages/render/src/folio.ts';
import { Viewer, type ViewState } from './viewer.ts';
import { Panel } from './panel.ts';
import { Atlas } from './atlas.ts';
import { Search } from './search.ts';
import { Meanwhile, roundYear } from './meanwhile.ts';

// ?sheet=<id> picks a sheet (default: the whole world poster); see content/sheets/.
const SHEET = new URLSearchParams(location.search).get('sheet') ?? 'world';
// Everything is fetched relative to where the site is served (a subpath on GitHub Pages).
const BASE = import.meta.env.BASE_URL;
const CHART = `${BASE}chart/${SHEET}`;

// Every build rewrites these files, so always revalidate rather than trust a cached copy.
const fresh = { cache: 'no-cache' } as const;
const [dl, folio]: [DisplayList, Folio] = await Promise.all([
  fetch(`${CHART}.json`, fresh).then((r) => r.json()),
  fetch(`${CHART}.folio.json`, fresh).then((r) => r.json()),
]);
document.title = `Mappa Temporis — ${dl.title}`;

const viewer = new Viewer(document.getElementById('view') as HTMLCanvasElement, dl, folio, `${CHART}.json`, document.getElementById('status')!);
const panel = new Panel(document.getElementById('folio')!, folio, (id, fly) => select(id || null, fly));

function select(id: string | null, fly = false) {
  viewer.select(id);
  panel.show(id);
  if (id && fly) {
    const e = folio.entries[id]!;
    // Land with some surroundings in view: about a century around an event, more around a lane.
    const [x, y, w, h] = e.box;
    const pad = e.kind === 'lane' || e.kind === 'thread' ? [400, 200] : [900, 700];
    viewer.flyTo([x - pad[0]!, y - pad[1]!, w + 2 * pad[0]!, h + 2 * pad[1]!], { panel: true, maxZ: e.kind === 'event' || e.kind === 'image' ? 14 : 6 });
  }
  writeHash();
}
viewer.onPick = (ref) => select(ref);

// ---- deep links: #v=<cx>,<cy>,<zoom>&s=<id>
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const v = viewer.view;
    const parts = [`v=${Math.round(v.cx)},${Math.round(v.cy)},${v.z.toFixed(2)}`];
    if (panel.current) parts.push(`s=${encodeURIComponent(panel.current)}`);
    history.replaceState(null, '', `#${parts.join('&')}`);
  }, 250);
}
viewer.onViewChange = writeHash;

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const v = params.get('v')?.split(',').map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite)) viewer.setView({ cx: v[0]!, cy: v[1]!, z: v[2]! } satisfies ViewState);
  const s = params.get('s');
  if (s?.startsWith('meanwhile:') && Number.isFinite(Number(s.slice(10)))) { showMeanwhile(Number(s.slice(10))); return; }
  viewer.select(s && folio.entries[s] ? s : null);
  panel.show(s && folio.entries[s] ? s : null);
}

// ---- layers: what is drawn beyond the content. `on` holds every switched-on layer: the atmosphere
// engravings (on by default, decision 30), at most one lens ("lens:<id>") and any threads ("thread:<id>").
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };
const recall = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const on = new Set<string>();
for (const l of JSON.parse(recall('mt-layers') ?? '[]') as string[]) if (folio.threads.some((t) => `thread:${t.id}` === l)) on.add(l);
if (recall('mt-atmosphere') !== 'off') on.add('atmosphere');
const storedLens = recall('mt-lens');
if (storedLens && dl.lenses?.some((l) => l.id === storedLens)) on.add(`lens:${storedLens}`);
const applyLayers = () => {
  viewer.setLayers(on);
  updateSeal();
  remember('mt-layers', JSON.stringify([...on].filter((l) => l.startsWith('thread:'))));
  remember('mt-atmosphere', on.has('atmosphere') ? 'on' : 'off');
  remember('mt-lens', [...on].find((l) => l.startsWith('lens:'))?.slice(5) ?? '');
  renderLenses();
  renderThreads();
};

/** Toolbar menus open under their own button; opening one closes the others. */
const menus: [HTMLElement, HTMLElement][] = [];
// ---- tools: folded behind the compass rose in the frame's corner until asked for (remembered).
const seal = document.getElementById('seal')!;
const toolbar = document.getElementById('toolbar')!;
function setTools(open: boolean) {
  toolbar.classList.toggle('collapsed', !open);
  seal.setAttribute('aria-expanded', String(open));
  if (!open) for (const [b, m] of menus) { m.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
  remember('mt-tools', open ? 'open' : 'closed');
}
/** While the tools are folded, a dot on the rose says a lens or thread is still on. */
function updateSeal() {
  const badge = seal.querySelector('.badge') as HTMLElement;
  const lens = dl.lenses?.find((l) => on.has(`lens:${l.id}`));
  const thread = folio.threads.find((t) => on.has(`thread:${t.id}`));
  badge.classList.toggle('on', !!(lens || thread));
  badge.style.background = lens?.color ?? '#B8392D';
}
seal.addEventListener('click', () => setTools(toolbar.classList.contains('collapsed')));

function menu(btnId: string, menuId: string) {
  const btn = document.getElementById(btnId)!, el = document.getElementById(menuId)!;
  menus.push([btn, el]);
  const toggle = (open = !el.classList.contains('open')) => {
    for (const [b, m] of menus) if (m !== el) { m.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
    // Opened by a shortcut while the tools are folded away, a menu sits where the toolbar would be.
    const r = btn.getBoundingClientRect();
    el.style.left = `${r.width ? r.left : 76}px`;
    el.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => toggle());
  return { el, toggle };
}
const hotkey = (keys: string, fn: () => void) => window.addEventListener('keydown', (e) => {
  if (keys.includes(e.key) && !e.metaKey && !e.ctrlKey && !(e.target as HTMLElement).closest?.('input, textarea')) fn();
});

// Layers: the paper's engravings.
const layersMenu = menu('layers-btn', 'layers');
layersMenu.el.innerHTML = `<h4>Paper</h4><label><input type="checkbox" data-layer="atmosphere" ${on.has('atmosphere') ? 'checked' : ''}>Engravings of each age</label>
  <p>Faint period engravings in the open paper.</p>`;
layersMenu.el.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  if (box.checked) on.add(box.dataset.layer!); else on.delete(box.dataset.layer!);
  applyLayers();
});
hotkey('lL', () => layersMenu.toggle());
hotkey('.', () => setTools(toolbar.classList.contains('collapsed')));
setTools(recall('mt-tools') === 'open');

// ---- lenses: one theme lit up, everything else steps back (Phase 4)
const lensMenu = menu('lenses-btn', 'lenses-menu');
const lensChip = document.getElementById('lens-chip')!;
const lensDot = document.querySelector('#lenses-btn .dot') as HTMLElement;
const activeLens = () => dl.lenses?.find((l) => on.has(`lens:${l.id}`)) ?? null;
function setLens(id: string | null) {
  for (const l of [...on]) if (l.startsWith('lens:')) on.delete(l);
  if (id) on.add(`lens:${id}`);
  applyLayers();
}
function renderLenses() {
  const cur = activeLens();
  lensMenu.el.innerHTML = '<h4>Lenses</h4>' + (dl.lenses ?? []).map((l) => `
    <div class="row ${cur?.id === l.id ? 'on' : ''}" data-lens="${l.id}" title="${l.note.replace(/"/g, '&quot;')}">
      <span class="swatch" style="background:${l.color}"></span><span>${l.name}<span class="desc">${l.note}</span></span><span class="n">${l.count}</span></div>`).join('')
    + `<div class="row" data-lens="">No lens</div><p>Lights up one theme across the whole chart; coloured dots mark it even when zoomed out. K toggles this menu.</p>`;
  lensChip.classList.toggle('on', !!cur);
  lensChip.innerHTML = cur ? `<span class="swatch" style="background:${cur.color}"></span>${cur.name}<span class="n">${cur.count} marked</span><button aria-label="Turn the lens off">×</button>` : '';
  lensDot.classList.toggle('on', !!cur);
  if (cur) lensDot.style.background = cur.color;
}
lensMenu.el.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest('[data-lens]') as HTMLElement | null;
  if (!row) return;
  const id = row.dataset.lens || null;
  setLens(activeLens()?.id === id ? null : id);
});
lensChip.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) setLens(null); });
hotkey('kK', () => lensMenu.toggle());

// ---- threads: follow a story across regions (Phase 4)
const threadMenu = menu('threads-btn', 'threads-menu');
function renderThreads() {
  threadMenu.el.innerHTML = '<h4>Threads</h4>' + folio.threads.map((t) => `
    <label title="${(t.note ?? '').replace(/"/g, '&quot;')}"><input type="checkbox" data-thread="${t.id}" ${on.has(`thread:${t.id}`) ? 'checked' : ''}>
      <span class="bar" style="background:${t.color}"></span><span>${t.name}<span class="desc">${t.note ?? ''}</span></span>
      <a href="#" class="n" data-follow-thread="${t.id}" title="Follow it stop by stop">${t.events.length} stops ▶</a></label>`).join('')
    + '<p>Tick to draw a thread on the chart; ▶ follows it stop by stop. T toggles this menu.</p>';
}
threadMenu.el.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  const id = `thread:${box.dataset.thread}`;
  if (box.checked) on.add(id); else on.delete(id);
  applyLayers();
});
threadMenu.el.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('[data-follow-thread]') as HTMLElement | null;
  if (!a) return;
  e.preventDefault();
  threadMenu.toggle(false);
  follow(a.dataset.followThread!);
});
hotkey('tT', () => threadMenu.toggle());
/** Follow a thread: draw it, and step from its first stop; the panel shows ◀ ▶ for the rest. */
function follow(threadId: string | null) {
  panel.following = threadId;
  if (!threadId) { if (panel.current) panel.show(panel.current); return; }
  if (!on.has(`thread:${threadId}`)) { on.add(`thread:${threadId}`); applyLayers(); }
  const first = folio.threads.find((t) => t.id === threadId)?.events[0];
  if (first) select(first, true);
}
panel.onFollow = follow;

// ---- meanwhile: everything at one year (Phase 4). Opened from the toolbar (the year at the middle
// of the screen), with Y (the year under the cursor), or by clicking the year ruler.
const meanwhile = new Meanwhile(folio, dl.regions.map((r) => r.name));
let cursorYear: number | null = null;
function showMeanwhile(clicked: number) {
  const year = roundYear(clicked);
  viewer.select(null);
  panel.showHtml(`meanwhile:${year}`, meanwhile.render(year));
  writeHash();
}
panel.onMeanwhile = showMeanwhile;
viewer.onRulerClick = showMeanwhile;
document.getElementById('meanwhile-btn')!.addEventListener('click', () => showMeanwhile(viewer.centerYear));
hotkey('yY', () => showMeanwhile(cursorYear ?? viewer.centerYear));

applyLayers();
readHash();
// Pasted links and back/forward (our own replaceState writes don't fire this).
window.addEventListener('hashchange', readHash);

// ---- atlas: the world in the year under the cursor
const atlasEl = document.getElementById('atlas')!;
const atlasBtn = document.getElementById('atlas-btn')!;
const atlas = new Atlas(atlasEl);
atlas.load(`${BASE}atlas/${SHEET}.atlas.json`).catch((err) => console.warn('atlas', err));
atlas.onPickLane = (laneId) => select(laneId, true);
const laneOf = (ref: string | null) => {
  const e = ref ? folio.entries[ref] : undefined;
  return e ? (e.kind === 'lane' ? e.id : e.laneId || null) : null;
};
viewer.onFocus = (year, hover, selected) => { cursorYear = Math.round(year); atlas.set(year, laneOf(hover) ?? laneOf(selected)); };
const setAtlas = (open: boolean) => {
  atlasEl.classList.toggle('hidden', !open);
  atlasBtn.setAttribute('aria-pressed', String(open));
  viewer.miniBottom = open ? 48 + atlasEl.offsetHeight + 24 : 48;
  try { localStorage.setItem('mt-atlas', open ? '1' : '0'); } catch { /* not remembered */ }
};
setAtlas((() => { try { return localStorage.getItem('mt-atlas') !== '0'; } catch { return true; } })());
atlasBtn.addEventListener('click', () => setAtlas(atlasEl.classList.contains('hidden')));
window.addEventListener('keydown', (e) => { if ((e.key === 'a' || e.key === 'A') && !(e.target as HTMLElement).closest?.('input')) setAtlas(atlasEl.classList.contains('hidden')); });

// ---- search
const search = new Search(document.getElementById('search')!, folio, (id) => {
  const e = folio.entries[id]!;
  if (e.kind === 'thread' && !on.has(id)) { on.add(id); applyLayers(); }
  select(id, true);
});
document.getElementById('search-btn')!.addEventListener('click', () => search.open());

// Handy for debugging from the console.
(window as unknown as { viewer: Viewer }).viewer = viewer;
