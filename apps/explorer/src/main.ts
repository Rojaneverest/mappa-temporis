import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import type { Folio } from '../../../packages/render/src/folio.ts';
import { Viewer, type ViewState } from './viewer.ts';
import { Panel } from './panel.ts';

const CHART = '/chart/proof-east-asia';

const [dl, folio]: [DisplayList, Folio] = await Promise.all([
  fetch(`${CHART}.json`).then((r) => r.json()),
  fetch(`${CHART}.folio.json`).then((r) => r.json()),
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
    const pad = e.kind === 'lane' ? [400, 200] : [900, 700];
    viewer.flyTo([x - pad[0]!, y - pad[1]!, w + 2 * pad[0]!, h + 2 * pad[1]!], { panel: true, maxZ: e.kind === 'lane' ? 6 : 14 });
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

// Handy for debugging from the console.
(window as unknown as { viewer: Viewer }).viewer = viewer;
