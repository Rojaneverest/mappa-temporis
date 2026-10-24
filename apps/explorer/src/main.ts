import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import type { Folio } from '../../../packages/render/src/folio.ts';
import { Viewer, type ViewState } from './viewer.ts';
import { Panel } from './panel.ts';
import { Atlas } from './atlas.ts';
import { Search } from './search.ts';
import { Tours } from './tours.ts';
import type { Tour } from '../../../packages/core/src/schema.ts';

// ?sheet=<id> picks a sheet (default: the whole world poster); see content/sheets/.
const SHEET = new URLSearchParams(location.search).get('sheet') ?? 'world';
const CHART = `/chart/${SHEET}`;

const [dl, folio, tourList]: [DisplayList, Folio, Tour[]] = await Promise.all([
  fetch(`${CHART}.json`).then((r) => r.json()),
  fetch(`${CHART}.folio.json`).then((r) => r.json()),
  fetch(`${CHART}.tours.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
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
  viewer.select(s && folio.entries[s] ? s : null);
  panel.show(s && folio.entries[s] ? s : null);
}
readHash();
// Pasted links and back/forward (our own replaceState writes don't fire this).
window.addEventListener('hashchange', readHash);

// ---- layers: optional threads (off by default — calm first) and the atmosphere engravings
// (on by default: decoration, decision 30). Remembered per browser.
const layersEl = document.getElementById('layers')!;
const layersBtn = document.getElementById('layers-btn')!;
const stored = (() => { try { return JSON.parse(localStorage.getItem('mt-layers') ?? '[]') as string[]; } catch { return []; } })();
const on = new Set(stored.filter((l) => folio.threads.some((t) => `thread:${t.id}` === l)));
const atmosphereOff = (() => { try { return localStorage.getItem('mt-atmosphere') === 'off'; } catch { return false; } })();
if (!atmosphereOff) on.add('atmosphere');
layersEl.innerHTML = `<h4>Paper</h4><label><input type="checkbox" data-layer="atmosphere" ${on.has('atmosphere') ? 'checked' : ''}>Engravings of each age</label>
  <p>Faint period engravings in the open paper; they fade as you zoom in.</p>`
  + '<h4>Threads</h4>' + folio.threads.map((t) => `
  <label><input type="checkbox" data-layer="thread:${t.id}" ${on.has(`thread:${t.id}`) ? 'checked' : ''}>
  <span class="swatch" style="background:${t.color}"></span>${t.name}
  <a href="#" class="go" data-go="thread:${t.id}" title="Show the whole thread">view ↗</a></label>`).join('')
  + '<p>Journeys of goods and ideas across regions.</p>';
viewer.setLayers(on);
layersEl.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  if (box.checked) on.add(box.dataset.layer!); else on.delete(box.dataset.layer!);
  viewer.setLayers(on);
  try {
    localStorage.setItem('mt-layers', JSON.stringify([...on].filter((l) => l !== 'atmosphere')));
    localStorage.setItem('mt-atmosphere', on.has('atmosphere') ? 'on' : 'off');
  } catch { /* private mode: not remembered */ }
});
layersEl.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
  if (!a) return;
  e.preventDefault();
  const id = a.dataset.go!;
  if (!on.has(id)) { on.add(id); viewer.setLayers(on); (layersEl.querySelector(`[data-layer="${id}"]`) as HTMLInputElement).checked = true; }
  select(id, true);
});
const toggleLayers = () => {
  const open = layersEl.classList.toggle('open');
  layersBtn.setAttribute('aria-expanded', String(open));
};
layersBtn.addEventListener('click', toggleLayers);
window.addEventListener('keydown', (e) => { if ((e.key === 'l' || e.key === 'L') && !(e.target as HTMLElement).closest?.('input')) toggleLayers(); });

// ---- atlas: the world in the year under the cursor
const atlasEl = document.getElementById('atlas')!;
const atlasBtn = document.getElementById('atlas-btn')!;
const atlas = new Atlas(atlasEl);
atlas.load(`/atlas/${SHEET}.topo.json`).catch((err) => console.warn('atlas', err));
atlas.onPickLane = (laneId) => select(laneId, true);
const laneOf = (ref: string | null) => {
  const e = ref ? folio.entries[ref] : undefined;
  return e ? (e.kind === 'lane' ? e.id : e.laneId || null) : null;
};
viewer.onFocus = (year, hover, selected) => atlas.set(year, laneOf(hover) ?? laneOf(selected));
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
  if (e.kind === 'thread' && !on.has(id)) { on.add(id); viewer.setLayers(on); (layersEl.querySelector(`[data-layer="${id}"]`) as HTMLInputElement | null)?.setAttribute('checked', ''); }
  select(id, true);
});
document.getElementById('search-btn')!.addEventListener('click', () => search.open());

// ---- tours: the panel stays closed; the tour card narrates while the camera flies
new Tours(document.getElementById('tour-card')!, document.getElementById('tours-menu')!, document.getElementById('tours-btn')!, tourList,
  (target, zoom) => {
    const e = folio.entries[target]!;
    if (e.kind === 'thread' && !on.has(target)) { on.add(target); viewer.setLayers(on); }
    viewer.select(target);
    panel.show(null);
    const [x, y, w, h] = e.box;
    const pad = e.kind === 'event' || e.kind === 'image' ? [1100, 900] : [400, 300];
    viewer.flyTo([x - pad[0]!, y - pad[1]!, w + 2 * pad[0]!, h + 2 * pad[1]!], { maxZ: zoom ?? (e.kind === 'event' ? 10 : 5) });
  },
  () => viewer.select(null));

// Handy for debugging from the console.
(window as unknown as { viewer: Viewer }).viewer = viewer;
