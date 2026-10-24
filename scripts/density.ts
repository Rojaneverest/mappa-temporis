// Density report (Phase 5): how much of the chart a screen actually shows at the reference
// views — readable labels, pictures and open paper per 1440×900 screen (decision 46).
//
//   node scripts/density.ts [sheet]        (default: world)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yearToY, type DisplayList, type Item, type TextItem } from '../packages/render/src/displaylist.ts';
import { GREEK_BELOW_PX } from '../packages/render/src/painter.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = process.argv[2] ?? 'world';
const dl = JSON.parse(readFileSync(join(ROOT, `apps/explorer/public/chart/${SHEET}.json`), 'utf8')) as DisplayList;
const folio = JSON.parse(readFileSync(join(ROOT, `apps/explorer/public/chart/${SHEET}.folio.json`), 'utf8')) as { lanes: { id: string; cx: number; top: number; bottom: number }[] };

const VIEW_W = 1440, VIEW_H = 900;
/** Readable = drawn at this size or more (CSS px). */
const READABLE_PX = 8;
/** Targets for the era view (decision 46). */
const TARGET = { labels: [150, 250], images: [15, 25], openMax: 0.2 };

/** Content text, as opposed to the rulers and margins. */
const CONTENT_ROLES = new Set(['label', 'label-strong', 'whisper', 'caption', 'lane-major', 'lane-minor', 'segment', 'endonym']);
const DECOR = /^(atm-|map-)/;

function alphaAt(it: Item, s: number): number {
  if (it.layer) return 0;
  let a = it.alpha ?? 1;
  if (it.fade) { const [f0, f1] = it.fade; if (s <= f0) return 0; if (s < f1) a *= (s - f0) / (f1 - f0); }
  if (it.fadeOut) { const [o0, o1] = it.fadeOut; if (s >= o1) return 0; if (s > o0) a *= 1 - (s - o0) / (o1 - o0); }
  return a;
}

interface Report { name: string; s: number; labels: number; greeked: number; tiny: number; images: number; open: number }

function measureView(name: string, cx: number, cy: number, s: number): Report {
  const w = VIEW_W / s, h = VIEW_H / s, x0 = cx - w / 2, y0 = cy - h / 2;
  const inView = (it: Item) => it.b && it.b[2] > x0 && it.b[0] < x0 + w && it.b[3] > y0 && it.b[1] < y0 + h;
  // Open paper: 12 px cells, marked by every drawn content mark (bounding boxes).
  const CELL = 12, cols = Math.ceil(VIEW_W / CELL), rows = Math.ceil(VIEW_H / CELL);
  const ink = new Uint8Array(cols * rows);
  const markBox = (b: [number, number, number, number]) => {
    const c0 = Math.max(0, Math.floor((b[0] - x0) * s / CELL)), c1 = Math.min(cols - 1, Math.floor((b[2] - x0) * s / CELL));
    const r0 = Math.max(0, Math.floor((b[1] - y0) * s / CELL)), r1 = Math.min(rows - 1, Math.floor((b[3] - y0) * s / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ink[r * cols + c] = 1;
  };
  const r: Report = { name, s, labels: 0, greeked: 0, tiny: 0, images: 0, open: 0 };
  for (const it of dl.items) {
    if (!inView(it) || alphaAt(it, s) < 0.3) continue;
    if (it.k === 'text') {
      if (!CONTENT_ROLES.has((it as TextItem).role)) continue;
      const px = it.size * s;
      if (px >= READABLE_PX) r.labels++;
      else if (px < GREEK_BELOW_PX) r.greeked++;
      else r.tiny++;
      markBox(it.b!);
    } else if (it.k === 'image') {
      if (DECOR.test(it.id)) continue;
      r.images++;
      markBox(it.b!);
    } else if (it.k === 'path' && it.fill && !it.multiply) {
      // Lane bodies (era tints are multiply washes and do not count as ink).
      if (it.b![2] - it.b![0] < dl.width / 3) markBox(it.b!);
    } else if (it.k === 'path' && it.fill && it.multiply && it.b![2] - it.b![0] < dl.width / 3) {
      markBox(it.b!);
    }
  }
  r.open = ink.reduce((n, v) => n + (v ? 0 : 1), 0) / ink.length;
  return r;
}

// ---------------------------------------------------------------- reference views
const fit = Math.max(VIEW_W / dl.width, VIEW_H / dl.height);
const views: Report[] = [];
views.push(measureView('wall (cover)', dl.width / 2, Math.min(dl.height, VIEW_H / fit) / 2, fit));

/** Era views (s = 0.1) centred on landmark lanes at a year inside them. */
const ERA_S = 0.1, CENTURY_S = 0.3;
const PLACES: [string, number][] = [
  ['roman-empire', 100], ['han', 0], ['maurya', -250], ['maya', 300], ['abbasid', 850], ['egypt-new-kingdom', -1300],
  ['holy-roman-empire', 1600], ['aztec', 1450], ['mughal', 1650], ['kush', -300],
];
const lanesById = new Map(folio.lanes.map((l) => [l.id, l]));
const eraViews: Report[] = [];
for (const [id, year] of PLACES) {
  const lane = lanesById.get(id);
  if (!lane || year < dl.time.year0 || year > dl.time.year1) continue;
  const y = yearToY(dl, year);
  if (y < lane.top || y > lane.bottom) continue;
  eraViews.push(measureView(`era · ${id} ${year}`, lane.cx, y, ERA_S));
}
views.push(...eraViews);
const rome = lanesById.get('roman-empire');
if (rome && dl.time.year0 <= 100) views.push(measureView('century · roman-empire 100', rome.cx, yearToY(dl, 100), CENTURY_S));

// ---------------------------------------------------------------- report
const pad = (v: string | number, n: number) => String(v).padStart(n);
console.log(`${dl.title} (${SHEET}) · ${Math.round(dl.width)} × ${Math.round(dl.height)} units · cover s=${fit.toFixed(4)}`);
console.log('view'.padEnd(34) + pad('s', 7) + pad('readable', 10) + pad('small', 7) + pad('greeked', 9) + pad('pictures', 10) + pad('open', 7));
for (const v of views) {
  console.log(v.name.padEnd(34) + pad(v.s.toFixed(3), 7) + pad(v.labels, 10) + pad(v.tiny, 7) + pad(v.greeked, 9) + pad(v.images, 10) + pad(`${Math.round(v.open * 100)}%`, 7));
}
if (eraViews.length) {
  const avg = (f: (r: Report) => number) => eraViews.reduce((a, r) => a + f(r), 0) / eraViews.length;
  const L = avg((r) => r.labels), I = avg((r) => r.images), O = avg((r) => r.open);
  const ok = (v: number, [a]: number[]) => (v >= a! ? '✓' : '✗');
  console.log(`\nera view average: ${Math.round(L)} readable labels ${ok(L, TARGET.labels)} (target ${TARGET.labels.join('–')}) · ${I.toFixed(1)} pictures ${ok(I, TARGET.images)} (target ${TARGET.images.join('–')}) · ${Math.round(O * 100)}% open ${O <= TARGET.openMax ? '✓' : '✗'} (target ≤ ${TARGET.openMax * 100}%)`);
}
