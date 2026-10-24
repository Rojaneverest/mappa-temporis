// Compile content/ into the display list for the explorer.
//
//   1. load + validate + lint the YAML
//   2. tracks: chains of succession share a track; related lanes sit close   (packages/layout/tracks)
//   3. flow: track positions become smooth functions of time                   (packages/layout/tracks)
//   4. draw the frame, lanes, names, relations; mark everything on a collision grid
//   5. place labels and images by priority (P1 first), sliding/demoting when crowded
//   6. enforce density budgets per screen-sized window at each zoom level     (packages/layout/budget)
//   7. emit the display list; text is measured with the same Skia engine the renderer uses
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import YAML from 'yaml';
import subsetFont from 'subset-font';
import type { CanvasKit, FontCollection } from 'canvaskit-wasm';
import { AtmosphereFile, DailyFile, LaneFile, MarginsFile, PeopleFile, Sheet, ThreadFile, Tour, VoicesFile, type Lane, type LaneImage, type Person, type Prominence, type Voice } from '../packages/core/src/schema.ts';
import { parseDate, parseSpan, formatDate, formatSpan, formatYear, roundYears } from '../packages/core/src/dates.ts';
import { makeTimescale, yearToYOf, yToYearOf, upyAt } from '../packages/core/src/timescale.ts';
import { INK, INK_SOFT, PAPER, laneColor, mix, PIGMENTS } from '../packages/core/src/palette.ts';
import { FONT_FILES, registerFonts } from '../packages/render/src/fonts.ts';
import { measure, type TextSpec } from '../packages/render/src/text.ts';
import { fadeAt } from '../packages/render/src/painter.ts';
import type { DisplayList, Fade, ImageItem, Item, PathItem, TextItem, TextRole } from '../packages/render/src/displaylist.ts';
import { assignTracks, flowTracks, type Flow, type RelationKind, type TrackLane } from '../packages/layout/src/tracks.ts';
import { Grid } from '../packages/layout/src/grid.ts';
import { overBudget, type BudgetMark } from '../packages/layout/src/budget.ts';
import { sourceLink, type Folio, type FolioEntry } from '../packages/render/src/folio.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/explorer/public');
/** Which sheet to build: content/sheets/<id>.yaml */
const SHEET_ID = process.argv[2] ?? 'classical-world';
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- design constants (world units)
const UNITS_PER_YEAR = 12;
const HEADER = 2400;
const FOOTER = 900;
const REGION_GAP = 300;
/** Lane width per weight step. */
const WEIGHT_W = [0, 16, 56, 96, 140, 190, 240];
const DEFAULT_WEIGHT: Record<Prominence, number> = { 1: 6, 2: 4, 3: 3, 4: 1, 5: 1 };
/** Screen width (CSS px) landmark lanes never drop below when zoomed out (decision 29). */
const LANE_MIN_PX: Partial<Record<Prominence, number>> = { 1: 7, 2: 3.5 };
/** Atmosphere engravings (decision 30): longest side per size, faint ink, gone before P3 labels arrive. */
const ENGRAVING_SIZE = { s: 3400, m: 5000, l: 7000 };
const ENGRAVING_ALPHA = 0.13;
const ENGRAVING_FADE_OUT: Fade = [0.09, 0.16];
/** Most of an engraving's box must be open paper. */
const ENGRAVING_MAX_OCCUPIED = 0.06;
/** A track is: margin, its widest lane, a gap, then label space. Thin lanes get thin tracks. */
const TRACK_MARGIN = 40;
const TRACK_GAP = 30;
const LABEL_SPACE: Record<Prominence, number> = { 1: 700, 2: 600, 3: 460, 4: 200, 5: 0 };
const LABEL_SIZE: Record<Prominence, number> = { 1: 54, 2: 40, 3: 25, 4: 13, 5: 0 };
const LABEL_MAX_W: Record<Prominence, number> = { 1: 640, 2: 580, 3: 470, 4: 360, 5: 0 };
const IMAGE_LONG: Record<Prominence, number> = { 1: 900, 2: 540, 3: 310, 4: 0, 5: 0 };
const CAPTION_SIZE: Record<Prominence, number> = { 1: 34, 2: 22, 3: 15, 4: 0, 5: 0 };
/** Calm by default: scale ranges over which each prominence fades in (proof-sheet fit ≈ 0.045). */
const LABEL_FADE: Record<Prominence, Fade | undefined> = { 1: undefined, 2: [0.075, 0.12], 3: [0.17, 0.26], 4: [0.42, 0.62], 5: undefined };
const IMAGE_FADE: Record<Prominence, Fade | undefined> = { 1: undefined, 2: [0.04, 0.06], 3: [0.09, 0.14], 4: undefined, 5: undefined };
const LANE_NAME_FADE: Record<Prominence, Fade | undefined> = { 1: undefined, 2: undefined, 3: [0.06, 0.1], 4: [0.3, 0.5], 5: undefined };
/** A label or image may slide this far from its date before it is demoted. */
const MAX_SLIDE_YEARS = 28;
/** Density budgets per 1440×900 screen. */
const BUDGET = { viewW: 1440, viewH: 900, labels: 40, images: 6 };

// ---------------------------------------------------------------- load content
const loadYaml = (path: string): unknown => YAML.parse(readFileSync(path, 'utf8'));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : [];
  });
}

const sheet = Sheet.parse(loadYaml(join(ROOT, `content/sheets/${SHEET_ID}.yaml`)));
const margins = sheet.margins ? MarginsFile.parse(loadYaml(join(ROOT, 'content/margins.yaml'))) : undefined;
/** The left margin carries years, era names and turning points; the right one years and, optionally, the margins. */
const MARGIN_L = sheet.margins ? 3300 : 1700;
const MARGIN_R = sheet.margins ? 4300 : 1100;
const lanes: Lane[] = walk(join(ROOT, 'content/lanes')).flatMap((f) => {
  const parsed = LaneFile.safeParse(loadYaml(f));
  if (!parsed.success) {
    console.error(`✗ ${f}\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    process.exit(1);
  }
  return parsed.data.lanes;
});
const laneById = new Map(lanes.map((l) => [l.id, l]));
const people: Person[] = existsSync(join(ROOT, 'content/people'))
  ? walk(join(ROOT, 'content/people')).flatMap((f) => PeopleFile.parse(loadYaml(f)).people) : [];
const voices: Voice[] = existsSync(join(ROOT, 'content/voices.yaml')) ? VoicesFile.parse(loadYaml(join(ROOT, 'content/voices.yaml'))).voices : [];
const dailyCards = existsSync(join(ROOT, 'content/daily-life.yaml')) ? DailyFile.parse(loadYaml(join(ROOT, 'content/daily-life.yaml'))).cards : [];
const personById = new Map(people.map((p) => [p.id, p]));
const groupOf = (l: Lane) => l.group ?? l.region;
const manifestPath = join(OUT, 'img/manifest.json');
const manifest: Record<string, { width: number; height: number; sizes: number[]; treatment: 'cutout' | 'plate' | 'backdrop' | 'coin'; credit: string; license: string; title: string; url: string }> =
  existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
lint();

// ---------------------------------------------------------------- Skia for measuring
const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const ckDir = dirname(require.resolve('canvaskit-wasm/bin/canvaskit.wasm'));
const ck: CanvasKit = await CanvasKitInit({ locateFile: (f: string) => join(ckDir, f) });
const fontBuffers = new Map<string, ArrayBuffer>();
for (const { file } of FONT_FILES) {
  const b = readFileSync(join(ROOT, 'assets/fonts', file));
  fontBuffers.set(file, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const fonts: FontCollection = ck.FontCollection.Make();
fonts.setDefaultFontManager(registerFonts(ck, fontBuffers));
fonts.enableFontFallback();
// Every native name must be drawable: each character needs a glyph in one of our fonts.
{
  const faces = [...fontBuffers.values()].map((b) => ck.Typeface.MakeTypefaceFromData(b)!).filter(Boolean);
  const missing: string[] = [];
  for (const l of [...lanes, ...people]) {
    if (!l.endonym) continue;
    for (const ch of new Set([...l.endonym.text].filter((c) => /[^\s\p{M}\u200d\u200c·]/u.test(c)))) {
      if (!faces.some((f) => f.getGlyphIDs(ch)[0] !== 0)) missing.push(`${l.id}: '${ch}' U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`);
    }
  }
  for (const f of faces) f.delete();
  if (missing.length) {
    console.error(`✗ native names with characters no font can draw:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- frame & tracks
const win = parseSpan(sheet.window);
const year0 = win.start.year;
const year1 = win.end.year;
// Piecewise time: each scaled stretch takes `factor` times the main scale's space per year —
// sparse deep time is squeezed, the crowded recent centuries are given room.
const timeParts: { year0: number; year1: number; upy: number }[] = [];
{
  const cuts = sheet.scale.map((c) => { const sp = parseSpan(c.span); return { a: Math.max(year0, sp.start.year), b: Math.min(year1, sp.end.year + 1), upy: UNITS_PER_YEAR * c.factor }; })
    .filter((c) => c.b > c.a).sort((p, q) => p.a - q.a);
  let at = year0;
  for (const c of cuts) {
    if (c.a > at) timeParts.push({ year0: at, year1: c.a, upy: UNITS_PER_YEAR });
    timeParts.push({ year0: c.a, year1: c.b, upy: c.upy });
    at = c.b;
  }
  if (at < year1) timeParts.push({ year0: at, year1, upy: UNITS_PER_YEAR });
}
const timeSegs = makeTimescale(HEADER, timeParts);
const Y = (year: number) => yearToYOf(timeSegs, year);
const yearAt = (y: number) => yToYearOf(timeSegs, y);
const upy = (year: number) => upyAt(timeSegs, year);
const yTop = Y(year0);
const yBottom = Y(year1);
const height = yBottom + FOOTER;

// A sheet shows its regions; when a region lists groups, only those groups.
const sheetRegions = new Map(sheet.regions.map((r) => [r.id, r.groups]));
const inSheet = (l: Lane) => sheetRegions.has(l.region) && (!sheetRegions.get(l.region)!.length || sheetRegions.get(l.region)!.includes(groupOf(l)));
const visibleLanes = lanes.filter((l) => {
  const s = parseSpan(l.span);
  return inSheet(l) && l.prominence !== 5 && s.end.year >= year0 && s.start.year <= year1;
});

/** Room a lane needs beside it: none for a bare lane, more for many labels or a big image. */
function labelDemand(l: Lane): number {
  const shown = l.events.filter((e) => e.prominence <= 4).length;
  const bigImage = Math.max(0, ...l.images.filter((i) => manifest[i.id] && i.prominence <= 3).map((i) => {
    const a = manifest[i.id]!;
    const long = IMAGE_LONG[i.prominence];
    return a.width >= a.height ? long : long * (a.width / a.height);
  }));
  const forLabels = shown === 0 ? 40 : Math.min(LABEL_SPACE[l.prominence], 200 + 70 * shown);
  return Math.max(forLabels, bigImage + 80, l.prominence === 4 ? 120 : 0);
}

/** Widest width a lane reaches in any of its segments. */
function laneMaxW(l: Lane): number {
  const base = WEIGHT_W[DEFAULT_WEIGHT[l.prominence]]!;
  return Math.max(base, ...l.segments.map((s) => (s.weight ? WEIGHT_W[s.weight]! : base)));
}

interface RegionLayout { id: string; name: string; short?: string; x0: number; width: number; flow: Flow; trackOf: Map<string, number>; trackLaneW: number[] }
const regionLayouts: RegionLayout[] = [];
let cursor = MARGIN_L;
for (const r of sheet.regions) {
  const rl = visibleLanes.filter((l) => l.region === r.id);
  // Groups west → east as the sheet lists them; unlisted groups follow in order of appearance.
  const groupOrder = [...new Set([...r.groups, ...rl.map(groupOf)])];
  const tl: TrackLane[] = rl.map((l) => {
    const s = parseSpan(l.span);
    return {
      id: l.id, group: groupOf(l), start: s.start.year, end: s.end.year + 1,
      weight: ({ 1: 6, 2: 4, 3: 2, 4: 1, 5: 0 } as const)[l.prominence], pin: l.column,
      relations: l.relations.map((rel) => ({ type: rel.type as RelationKind, targets: rel.lanes ?? (rel.lane ? [rel.lane] : []) })),
    };
  });
  const assignment = assignTracks(tl, groupOrder);
  // Lanes chained in one track share a centre line, so the track is as wide as its widest lane.
  const trackLaneW = assignment.tracks.map((ids) => Math.max(...ids.map((id) => laneMaxW(laneById.get(id)!))));
  const flow = flowTracks({
    tracks: assignment.tracks.map((ids, t) => {
      const first = laneById.get(ids[0]!)!;
      return {
        group: groupOf(first),
        lanes: ids.map((id) => {
          const l = laneById.get(id)!;
          const s = parseSpan(l.span);
          return { start: s.start.year, end: s.end.year + 1, need: TRACK_MARGIN + trackLaneW[t]! + TRACK_GAP + labelDemand(l) };
        }),
      };
    }),
    year0, year1, step: 10, groupGap: 180, pad: 120,
  });
  regionLayouts.push({ id: r.id, name: r.name, short: r.short, x0: cursor, width: flow.width, flow, trackOf: assignment.trackOf, trackLaneW });
  if (process.env.VERBOSE) console.log(`  region ${r.id}: ${assignment.tracks.length} tracks, ${Math.round(flow.width)} wide`);
  cursor += flow.width + REGION_GAP;
}
const width = cursor - REGION_GAP + MARGIN_R;
const regionById = new Map(regionLayouts.map((r) => [r.id, r]));

const grid = new Grid(width, height, 16);
const layers = { substrate: [] as Item[], atmosphere: [] as Item[], grid: [] as Item[], bands: [] as Item[], links: [] as Item[], lanes: [] as Item[], images: [] as Item[], marks: [] as Item[], text: [] as Item[], threads: [] as Item[] };
const stats = { lanes: visibleLanes.length, events: 0, drawnEvents: 0, images: 0, drawnImages: 0, slid: 0, demoted: 0, archived: 0, budgetDemotions: 0, engravings: 0, engravingsSkipped: 0, people: 0, voices: 0, drawnPeople: 0, drawnVoices: 0 };

function text(spec: TextSpec & { x: number; y: number; rot?: 0 | -90; fade?: Fade; alpha?: number; ref?: string; layer?: string }): TextItem {
  const m = measure(ck, fonts, spec);
  const t: TextItem = { k: 'text', ...spec, lines: m.lines, lineH: m.lineH, h: m.h };
  t.b = spec.rot === -90 ? [spec.x, spec.y, spec.x + m.h, spec.y + spec.w] : [spec.x, spec.y, spec.x + spec.w, spec.y + m.h];
  return t;
}
const fitWidth = (spec: Omit<TextSpec, 'w'>) => measure(ck, fonts, { ...spec, w: 1e6 }).longest;

// ---------------------------------------------------------------- frame: title, regions, eras, grid
layers.text.push(text({ role: 'title', text: sheet.title, size: 300, color: INK, align: 'left', w: 6000, x: MARGIN_L, y: 380 }));
layers.text.push(text({ role: 'subtitle', text: sheet.subtitle, size: 150, color: INK_SOFT, align: 'left', w: 9000, x: MARGIN_L, y: 760 }));
layers.text.push(text({
  role: 'specimen', size: 70, color: INK_SOFT, align: 'left', w: 9000, x: MARGIN_L, y: 1020,
  text: 'Names in their own scripts — Sumer 𒆠𒂗𒄀 · Egypt 𓆎𓅓𓏏𓊖 · Persia 𐎱𐎠𐎼𐎿 · Hellas Ἑλλάς · Han 漢 · Aksum አክሱም',
}));
grid.mark(0, 0, width, yTop - 40);

for (const r of regionLayouts) {
  const x1 = r.x0 + r.width;
  const name = r.name.toUpperCase();
  const size = Math.min(190, (190 * (r.width - 80)) / fitWidth({ role: 'region', text: name, size: 190, color: INK, align: 'center' }));
  layers.text.push(text({ role: 'region', text: name, size, color: INK, align: 'center', w: r.width, x: r.x0, y: HEADER - 330 - size }));
  layers.grid.push({ k: 'line', x1: r.x0, y1: HEADER - 260, x2: x1, y2: HEADER - 260, stroke: INK, sw: 6, b: [r.x0, HEADER - 263, x1, HEADER - 257] });
}
for (const r of regionLayouts.slice(1)) {
  const x = r.x0 - REGION_GAP / 2;
  layers.grid.push({ k: 'line', x1: x, y1: yTop - 200, x2: x, y2: yBottom, stroke: INK_SOFT, sw: 1.2, hair: true, alpha: 0.5, b: [x - 2, yTop - 200, x + 2, yBottom] });
}
// Labels and images stay inside their region.
for (const r of regionLayouts) grid.mark(r.x0 - REGION_GAP, yTop, REGION_GAP - 10, yBottom - yTop);
grid.mark(0, yTop, MARGIN_L - 10, yBottom - yTop);
grid.mark(width - MARGIN_R + 10, yTop, MARGIN_R, yBottom - yTop);

const fullX0 = MARGIN_L - 260;
const fullX1 = width - MARGIN_R + 200;
const majorCenturies = new Set(roundYears(year0, year1, 500));
for (const seg of timeSegs) {
  // Century lines in the main scale; millennium lines where time is compressed; half-centuries where it is expanded.
  const step = seg.upy * 100 < 600 ? 1000 : seg.upy * 50 >= 900 ? 50 : 100;
  for (const yr of roundYears(Math.ceil(seg.year0), Math.floor(seg.year1 - 1e-9), step)) {
    const yy = Y(yr);
    const major = step === 1000 || majorCenturies.has(yr);
    layers.grid.push({ k: 'line', x1: fullX0, y1: yy, x2: fullX1, y2: yy, stroke: '#FFFDF6', sw: major ? 2.2 : 1.4, hair: true, alpha: 0.85, b: [fullX0, yy - 2, fullX1, yy + 2] });
    const label = formatYear(yr, { forceEra: true });
    layers.text.push(text({ role: 'year', text: label, size: 64, color: INK_SOFT, align: 'right', w: 560, x: MARGIN_L - 860, y: yy - 38 }));
    layers.text.push(text({ role: 'year', text: label, size: 64, color: INK_SOFT, align: 'left', w: 560, x: width - MARGIN_R + 260, y: yy - 38 }));
  }
}
// Scale breaks: a zig-zag rule wherever the space per year changes, with the new scale noted below it.
for (let i = 1; i < timeSegs.length; i++) {
  if (timeSegs[i]!.upy === timeSegs[i - 1]!.upy) continue;
  const yy = timeSegs[i]!.y0;
  const zig: string[] = [`M ${fullX0 - 900} ${yy}`];
  for (let x = fullX0 - 900, k = 0; x < fullX1 + 200; x += 120, k++) zig.push(`L ${x + 60} ${yy + (k % 2 ? 22 : -22)} L ${x + 120} ${yy}`);
  layers.bands.push({ k: 'path', d: zig.join(' '), stroke: INK, sw: 6, alpha: 0.7, b: [fullX0 - 900, yy - 30, fullX1 + 260, yy + 30] });
}
for (const c of sheet.scale) {
  if (!c.label) continue;
  const yy = Y(Math.max(parseSpan(c.span).start.year, year0));
  // Under the year labels, so it never sits beneath an era map.
  layers.text.push(sheet.margins
    ? text({ role: 'caption', text: c.label, size: 40, color: INK_SOFT, align: 'right', w: 560, x: MARGIN_L - 860, y: yy + 40 })
    : text({ role: 'caption', text: c.label, size: 54, color: INK_SOFT, align: 'right', w: 1400, x: MARGIN_L - 1580, y: yy + 50 }));
}

/** The forces behind each turning point (docs/PLAN.md §3), each with its own quiet colour. */
const FORCE_COLOR: Record<string, string> = {
  climate: '#3C7A86', migration: '#8A6A34', disease: '#6E7F2E', war: '#9C2E2E', technology: '#4C5C7E', ideas: '#7A4C8C',
};
const eraBoxes: Record<string, [number, number, number, number]> = {};
const TP_FADE: Fade = [0.07, 0.1];
const eraMapEntries: FolioEntry[] = [];
for (const era of sheet.eras) {
  const span = parseSpan(era.span);
  const a = Math.max(span.start.year, year0);
  const b = Math.min(span.end.year + 1, year1);
  if (b <= a) continue;
  const ref = `era:${era.id}`;
  eraBoxes[era.id] = [0, Y(a), width, Y(b) - Y(a)];
  if (span.start.year > year0) {
    layers.bands.push({ k: 'rect', x: fullX0 - 900, y: Y(a) - 9, w: fullX1 - fullX0 + 1100, h: 18, fill: INK, alpha: 0.82, b: [fullX0 - 900, Y(a) - 9, fullX1 + 200, Y(a) + 9] });
  }
  const len = Y(b) - Y(a);
  let tpBottom: number | undefined;
  // Substrate: each era tints the paper very faintly; neighbours cross-fade over a feathered seam.
  if (era.tint) {
    const F = Math.min(900, len * 0.2);
    const top = a > year0 ? Y(a) - F : Y(a);
    const bot = b < year1 ? Y(b) + F : Y(b);
    const H = bot - top;
    const fIn = a > year0 ? (2 * F) / H : 0;
    const fOut = b < year1 ? (2 * F) / H : 0;
    const light = era.tint.toUpperCase() === '#FFFFFF';
    layers.substrate.push({
      k: 'path', d: `M 0 ${top} H ${width} V ${bot} H 0 Z`, fill: era.tint, alpha: light ? 0.4 : 0.1, multiply: !light,
      grad: { y0: top, y1: bot, stops: [[0, fIn ? 0 : 1], [fIn, 1], [1 - fOut, 1], [1, fOut ? 0 : 1]] },
      b: [0, top, width, bot],
    });
  }
  const name = era.name.toUpperCase();
  const size = Math.min(300, len * 0.07);
  if (size > 60) {
    const w = Math.min(len - 200, fitWidth({ role: 'era', text: name, size, color: INK, align: 'center' }) + 40);
    layers.text.push(text({ role: 'era', text: name, size, color: INK, align: 'center', w, x: 240, y: Y(a) + (len - w) / 2, rot: -90, ref }));
  }
  if (era.turningPoint) {
    const tp = parseSpan(era.turningPoint.span);
    const ta = Y(Math.max(tp.start.year, year0));
    const tb = Y(Math.min(tp.end.year + 1, year1));
    layers.bands.push({ k: 'rect', x: fullX0, y: ta, w: fullX1 - fullX0, h: tb - ta, fill: '#7A6A58', alpha: 0.075, multiply: true, b: [fullX0, ta, fullX1, tb] });
    for (const yy of [ta, tb]) layers.bands.push({ k: 'line', x1: fullX0, y1: yy, x2: fullX1, y2: yy, stroke: '#7A6A58', sw: 1, hair: true, alpha: 0.45, b: [fullX0, yy - 2, fullX1, yy + 2] });
    // The hinge, named in the left margin, with the forces that turned it as small coloured chips.
    const colR = MARGIN_L - 1000;
    const colW = sheet.margins ? 1700 : 700;
    const head = text({ role: 'label-strong', text: era.turningPoint.label, size: 80, color: INK, align: 'right', w: colW, x: colR - colW, y: ta + 40, fade: TP_FADE, ref });
    layers.text.push(head);
    let cx = colR;
    const chipY = ta + 40 + head.h + 22;
    for (const f of [...era.forces].reverse()) {
      const word = f.toUpperCase();
      const tw = fitWidth({ role: 'label', text: word, size: 40, color: '#FFFFFF', align: 'left' });
      const cw = tw + 48;
      cx -= cw;
      layers.text.push({ ...text({ role: 'label', text: word, size: 40, color: '#FFFDF6', align: 'center', w: cw, x: cx, y: chipY + 12, fade: TP_FADE, ref }) });
      layers.bands.push({ k: 'rect', x: cx, y: chipY, w: cw, h: 68, r: 34, fill: FORCE_COLOR[f] ?? INK_SOFT, alpha: 0.9, fade: TP_FADE, ref, b: [cx, chipY, cx + cw, chipY + 68] });
      cx -= 18;
    }
    tpBottom = chipY + 68;
  }
  // "The world as they saw it": the era's map, printed into the left margin below the turning point.
  const asset = era.map && sheet.margins ? manifest[era.map.id] : undefined;
  if (era.map && asset) {
    const colR = MARGIN_L - 1000;
    const top = (tpBottom ?? Y(a) + 200) + 180;
    const avail = Y(b) - 420 - top;
    let w = 1700, h = (w * asset.height) / asset.width;
    if (h > avail) { h = avail; w = (h * asset.width) / asset.height; }
    if (h > 300) {
      const x = colR - w;
      const img: ImageItem = { k: 'image', id: era.map.id, x, y: top, w, h, sizes: asset.sizes, treatment: 'backdrop', alpha: 0.7, ref: era.map.id, b: [x, top, colR, top + h] };
      layers.images.push(img);
      const cap = text({ role: 'caption', text: `The world as they saw it — ${era.map.caption}`, size: 46, color: INK_SOFT, align: 'right', w: 1400, x: colR - 1400, y: top + h + 40, fade: TP_FADE, ref: era.map.id });
      layers.text.push(cap);
      eraMapEntries.push({
        id: era.map.id, kind: 'image', title: era.map.caption, dates: formatDate(parseDate(era.map.date)), region: 'The whole world', laneId: '', laneName: '',
        prominence: 2, drawn: true, sources: [{ label: asset.credit, url: asset.url }],
        image: { caption: era.map.caption, title: asset.title, credit: asset.credit, license: asset.license, url: asset.url, sizes: asset.sizes, width: asset.width, height: asset.height, treatment: 'plate' },
        box: [x, top, w, h + 40 + cap.h],
      });
    }
  }
}

// ---------------------------------------------------------------- margins: people and climate
const marginEntries: FolioEntry[] = [];
if (margins) {
  const xR = width - MARGIN_R;
  const fadeLabels: Fade = [0.08, 0.12];
  // Climate ribbons: overlapping episodes take side-by-side sub-ribbons; names stack beside them.
  const CLIMATE_COLOR = { warm: '#C0623A', cold: '#3F74A8', dry: '#C49A4A', wet: '#3E8C78' } as const;
  const ribX = xR + 960;
  const RIB_W = 90;
  const cols: number[] = [];
  const eps = margins.climate.map((c) => ({ c, sp: parseSpan(c.span) }))
    .map(({ c, sp }) => ({ c, a: Math.max(year0, sp.start.year), b: Math.min(year1, sp.end.year + 1) }))
    .filter((e) => e.b > e.a).sort((p, q) => p.a - q.a);
  let labelFloor = -Infinity;
  layers.text.push(text({ role: 'region', text: 'CLIMATE', size: 64, color: INK, align: 'left', w: 900, x: ribX, y: yTop - 170 }));
  for (const e of eps) {
    let col = cols.findIndex((end) => end <= e.a);
    if (col < 0) { col = cols.length; cols.push(0); }
    cols[col] = e.b;
    const ref = `climate:${e.c.id}`;
    const y0 = Y(e.a);
    const h = Math.max(Y(e.b) - y0, 60);
    const x = ribX + col * (RIB_W + 16);
    layers.bands.push({ k: 'rect', x, y: y0, w: RIB_W, h, r: 18, fill: CLIMATE_COLOR[e.c.kind], alpha: 0.55, ref, b: [x, y0, x + RIB_W, y0 + h] });
    const ly = Math.max(y0, labelFloor + 20);
    const lx = ribX + 3 * (RIB_W + 16) + 30;
    const t = text({ role: 'label', text: e.c.name, size: 80, color: CLIMATE_COLOR[e.c.kind], align: 'left', w: 900, x: lx, y: ly, fade: fadeLabels, ref });
    layers.text.push(t);
    if (ly > y0 + 40) layers.bands.push({ k: 'line', x1: x + RIB_W, y1: y0 + 20, x2: lx - 8, y2: ly + 36, stroke: CLIMATE_COLOR[e.c.kind], sw: 1, hair: true, alpha: 0.6, fade: fadeLabels, b: [x + RIB_W, y0, lx, ly + 40] });
    labelFloor = ly + t.h;
    marginEntries.push({
      id: ref, kind: 'climate', title: e.c.name, dates: formatSpan(parseSpan(e.c.span)), region: 'The whole world', laneId: '', laneName: '',
      prominence: 2, drawn: true, note: e.c.note, wikipedia: e.c.sources.find((s) => s.startsWith('wikipedia:'))?.slice(10),
      sources: e.c.sources.map(sourceLink), box: [x - 40, y0, lx + 820 - x, Math.max(h, t.h)],
    });
  }
  // World population on a log scale, 1 million → 10 billion.
  const popX0 = xR + 2350;
  const POP_W = 1750;
  const px = (m: number) => popX0 + (Math.log10(m) / 4) * POP_W;
  const pts = margins.population.points.map(([d, m]) => ({ year: parseDate(d).year, m })).filter((p) => p.year >= year0 && p.year <= year1);
  // Interpolate log-linearly every few years so the curve follows the time scale's changes.
  const curve: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!, q = pts[i + 1]!;
    const steps = Math.max(1, Math.ceil((Y(q.year) - Y(p.year)) / 120));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const yr = p.year + (q.year - p.year) * t;
      curve.push([px(10 ** (Math.log10(p.m) + (Math.log10(q.m) - Math.log10(p.m)) * t)), Y(yr)]);
    }
  }
  const last = pts[pts.length - 1]!;
  curve.push([px(last.m), Y(last.year)]);
  const r = (v: number) => Math.round(v);
  const line = curve.map(([x, y], i) => `${i ? 'L' : 'M'} ${r(x)} ${r(y)}`).join(' ');
  const yA = curve[0]![1], yB = curve[curve.length - 1]![1];
  layers.bands.push({ k: 'path', d: `${line} L ${popX0} ${r(yB)} L ${popX0} ${r(yA)} Z`, fill: '#5A4A3A', alpha: 0.07, multiply: true, ref: 'population', b: [popX0, yA, popX0 + POP_W, yB] });
  layers.bands.push({ k: 'path', d: line, stroke: '#5A4A3A', sw: 1.8, hair: true, alpha: 0.6, ref: 'population', b: [popX0, yA, popX0 + POP_W, yB] });
  layers.text.push(text({ role: 'region', text: 'PEOPLE', size: 64, color: INK, align: 'left', w: 1400, x: popX0, y: yTop - 170, ref: 'population' }));
  // Log gridlines, with their values repeated at the top of every era.
  const ticks: [number, string][] = [[1, '1 M'], [10, '10 M'], [100, '100 M'], [1000, '1 B'], [10000, '10 B']];
  for (const [m] of ticks) {
    const x = px(m);
    layers.grid.push({ k: 'line', x1: x, y1: yTop, x2: x, y2: yBottom, stroke: INK_SOFT, sw: 1, hair: true, alpha: 0.35, dash: [6, 10], b: [x - 2, yTop, x + 2, yBottom] });
  }
  for (const era of sheet.eras) {
    const ya = Y(Math.max(parseSpan(era.span).start.year, year0));
    for (const [m, lab] of ticks) layers.text.push(text({ role: 'year', text: lab, size: 44, color: INK_SOFT, align: 'center', w: 240, x: px(m) - 120, y: ya + 40, fade: [0.12, 0.18] }));
  }
  for (const c of margins.population.callouts) {
    const yr = parseDate(c.year).year;
    if (yr < year0 || yr > year1) continue;
    const yy = Y(yr);
    const near = curve.reduce((best, p) => (Math.abs(p[1] - yy) < Math.abs(best[1] - yy) ? p : best), curve[0]!);
    // Beside the curve, on whichever side has room.
    const left = near[0] - popX0 > 900;
    const lx = left ? near[0] - 40 - 760 : near[0] + 40;
    layers.bands.push({ k: 'path', d: `M ${r(near[0]) - 9} ${r(near[1])} a 9 9 0 1 0 18 0 a 9 9 0 1 0 -18 0`, fill: INK, alpha: 0.8, ref: 'population', b: [near[0] - 9, near[1] - 9, near[0] + 9, near[1] + 9] });
    layers.text.push(text({ role: 'label', text: c.label, size: 56, color: INK, align: left ? 'right' : 'left', w: 760, x: lx, y: yy + 20, fade: fadeLabels, ref: 'population' }));
  }
  marginEntries.push({
    id: 'population', kind: 'population', title: 'How many people?', dates: `${formatYear(pts[0]!.year)} – ${formatYear(last.year)}`, region: 'The whole world',
    laneId: '', laneName: '', prominence: 2, drawn: true, note: margins.population.note, wikipedia: 'Estimates_of_historical_world_population',
    sources: margins.population.sources.map(sourceLink), box: [popX0, yA, POP_W, yB - yA],
  });
}

// ---------------------------------------------------------------- lanes
interface PlacedLane {
  lane: Lane;
  region: RegionLayout;
  track: number;
  top: number;
  bottom: number;
  cxAt: (y: number) => number;
  halfAt: (y: number) => number;
  /** Right limit of this lane's track (its label space ends here). */
  limitAt: (y: number) => number;
}
const placed = new Map<string, PlacedLane>();
const SAMPLE_YEARS = 3;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Smooth cubic path through points (Catmull–Rom), continuing an existing path. */
function spline(pts: [number, number][]): string {
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6] as const;
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6] as const;
    out.push(`C ${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`);
  }
  return out.join(' ');
}

for (const lane of visibleLanes) {
  const region = regionById.get(lane.region)!;
  const track = region.trackOf.get(lane.id)!;
  const span = parseSpan(lane.span);
  const startY = Math.max(span.start.year, year0);
  const endY = Math.min(span.end.year + 1, year1);
  const top = Y(startY), bottom = Y(endY);
  const clippedTop = span.start.year < year0, clippedBottom = span.end.year + 1 > year1;
  const defaultW = WEIGHT_W[DEFAULT_WEIGHT[lane.prominence]]!;
  const segs = (lane.segments.length ? lane.segments : [{ name: lane.name, span: lane.span, style: 'normal' as const, weight: undefined }]).map((s) => {
    const sp = parseSpan(s.span);
    return { ...s, a: sp.start.year, b: sp.end.year + 1, w: s.weight ? WEIGHT_W[s.weight]! : defaultW };
  });
  // Width over time, with smooth tapers where segments change width.
  const TAPER = 8;
  const widthAtYear = (yr: number) => {
    let i = segs.findIndex((s) => yr < s.b);
    if (i === -1) i = segs.length - 1;
    const s = segs[i]!, next = segs[i + 1], prev = segs[i - 1];
    if (next && yr > s.b - TAPER) return s.w + (next.w - s.w) * smooth01((yr - (s.b - TAPER)) / (2 * TAPER));
    if (prev && yr < s.a + TAPER) return prev.w + (s.w - prev.w) * smooth01((yr - (s.a - TAPER)) / (2 * TAPER));
    return s.w;
  };
  const cxAtYear = (yr: number) => region.x0 + region.flow.x(track, yr) + TRACK_MARGIN + region.trackLaneW[track]! / 2;
  const cxAt = (y: number) => cxAtYear(yearAt(y));
  const halfAt = (y: number) => widthAtYear(Math.min(endY - 0.01, Math.max(startY, yearAt(y)))) / 2;
  const limitAt = (y: number) => region.x0 + region.flow.x(track, yearAt(y)) + region.flow.w(track, yearAt(y));
  placed.set(lane.id, { lane, region, track, top, bottom, cxAt, halfAt, limitAt });

  // ---- outline: sampled edges joined by smooth curves, rounded caps unless clipped by the window
  const wTop = widthAtYear(startY), wBot = widthAtYear(endY - 0.01);
  const rTop = clippedTop ? 0 : Math.min(wTop / 2, 70);
  const rBot = clippedBottom ? 0 : Math.min(wBot / 2, 70);
  const inner: number[] = [yearAt(top + rTop)];
  for (let yr = Math.ceil(yearAt(top + rTop) / SAMPLE_YEARS) * SAMPLE_YEARS; Y(yr) < bottom - rBot; yr += SAMPLE_YEARS) if (Y(yr) > top + rTop) inner.push(yr);
  inner.push(yearAt(bottom - rBot));
  const wAt = (yr: number) => widthAtYear(Math.min(endY - 0.01, yr));
  // Straight stretches need no intermediate points: keep only where width or position changes.
  const sig = (yr: number) => `${r1(wAt(yr))}:${r1(cxAtYear(yr))}`;
  for (let i = inner.length - 2; i >= 1; i--) {
    if (sig(inner[i - 1]!) === sig(inner[i]!) && sig(inner[i]!) === sig(inner[i + 1]!)) inner.splice(i, 1);
  }
  const right = inner.map((yr) => [cxAtYear(yr) + wAt(yr) / 2, Y(yr)] as [number, number]);
  const left = inner.map((yr) => [cxAtYear(yr) - wAt(yr) / 2, Y(yr)] as [number, number]).reverse();
  const cTop = cxAtYear(startY), cBot = cxAtYear(endY);
  const d = [
    `M ${r1(cTop - wTop / 2 + rTop)} ${r1(top)}`,
    `L ${r1(cTop + wTop / 2 - rTop)} ${r1(top)}`,
    `Q ${r1(right[0]![0])} ${r1(top)} ${r1(right[0]![0])} ${r1(right[0]![1])}`,
    spline(right),
    `Q ${r1(right[right.length - 1]![0])} ${r1(bottom)} ${r1(cBot + wBot / 2 - rBot)} ${r1(bottom)}`,
    `L ${r1(cBot - wBot / 2 + rBot)} ${r1(bottom)}`,
    `Q ${r1(left[0]![0])} ${r1(bottom)} ${r1(left[0]![0])} ${r1(left[0]![1])}`,
    spline(left),
    `Q ${r1(left[left.length - 1]![0])} ${r1(top)} ${r1(cTop - wTop / 2 + rTop)} ${r1(top)}`,
    'Z',
  ].join(' ');
  const xs = [...right, ...left].map((p) => p[0]);
  const bbox: [number, number, number, number] = [Math.min(...xs), top, Math.max(...xs), bottom];

  const fadeTop = clippedTop ? 300 : span.start.circa ? Math.max(120, (span.start.year - span.start.earliest) * upy(span.start.year) * 2) : 0;
  const fadeBot = clippedBottom ? 300 : span.end.circa ? Math.max(120, (span.end.latest - span.end.year) * upy(span.end.year) * 2) : 0;
  const len = bottom - top;
  const color = laneColor(lane.sphere, lane.prominence);
  const lanePath: PathItem = { k: 'path', d, fill: color, multiply: true, ref: lane.id, alpha: lane.basis === 'archaeology' ? 0.62 : 1, b: bbox };
  if (fadeTop || fadeBot) {
    lanePath.grad = { y0: top, y1: bottom, stops: [[0, fadeTop ? 0 : 1], [Math.min(0.45, fadeTop / len), 1], [Math.max(0.55, 1 - fadeBot / len), 1], [1, fadeBot ? 0 : 1]] };
  }
  layers.lanes.push(lanePath);
  // Zoomed out, a centre stroke keeps the lane at its minimum screen width; it fades once the lane is wider.
  const minPx = LANE_MIN_PX[lane.prominence];
  if (minPx) {
    const narrowest = Math.min(...segs.filter((s) => s.style !== 'interregnum').map((s) => s.w));
    const centres = inner.map((yr) => [cxAtYear(yr), Y(yr)] as [number, number]);
    const pad = 300;
    layers.lanes.push({
      k: 'path', d: `M ${r1(centres[0]![0])} ${r1(centres[0]![1])} ${spline(centres)}`, stroke: color, sw: minPx, hair: true,
      alpha: lanePath.alpha, grad: lanePath.grad, fadeOut: [minPx / narrowest, (minPx / narrowest) * 1.6],
      b: [bbox[0] - pad, top, bbox[2] + pad, bottom],
    });
  }
  if (lane.basis !== 'texts') {
    layers.lanes.push({ k: 'path', d, stroke: mix(PIGMENTS[lane.sphere]!.hex, INK, 0.3), sw: 1.1, hair: true, dash: [4, 6], alpha: 0.45, b: bbox });
  }
  for (const s of segs.filter((s) => s.style === 'interregnum')) {
    const a = Y(s.a), b = Y(s.b), c = cxAt((a + b) / 2);
    layers.lanes.push({ k: 'rect', x: c - s.w / 2, y: a, w: s.w, h: b - a, fill: PAPER, alpha: 0.55, b: [c - s.w / 2, a, c + s.w / 2, b] });
  }
  for (let yy = top; yy < bottom; yy += 48) {
    const h = Math.min(48, bottom - yy), half = halfAt(yy + h / 2), c = cxAt(yy + h / 2);
    grid.mark(c - half, yy, half * 2, h, 14);
  }

  // ---- names
  const pigment = PIGMENTS[lane.sphere]!.hex;
  const onLane = luminance(color) < 0.22 ? PAPER : mix(pigment, INK, 0.62);
  let reservedTop = top + (rTop || 40);
  const chars = lane.endonym ? [...lane.endonym.text] : [];
  const sealSize = Math.min(wTop * 0.52, 110);
  const sealH = chars.length * sealSize * 1.08 + sealSize * 0.5;
  if (lane.endonym && /\p{Script=Han}/u.test(lane.endonym.text) && wTop >= 90 && !clippedTop && len > sealH * 2.2) {
    // CJK endonyms stack vertically in a small seal at the head of the lane.
    const size = sealSize;
    const sealW = size * 1.45;
    const sy = top + Math.max(rTop, 30) + 20;
    const sx = cxAt(sy + sealH / 2) - sealW / 2;
    layers.marks.push({ k: 'rect', x: sx, y: sy, w: sealW, h: sealH, r: size * 0.12, fill: PAPER, stroke: mix(pigment, INK, 0.2), sw: size * 0.06, alpha: 0.95, ref: lane.id, b: [sx, sy, sx + sealW, sy + sealH] });
    layers.text.push(text({ role: 'endonym', text: chars.join('\n'), size, color: mix(pigment, INK, 0.2), align: 'center', w: sealW, x: sx, y: sy + size * 0.22, ref: lane.id }));
    reservedTop = sy + sealH + 40;
  } else if (lane.endonym && !/\p{Script=Han}/u.test(lane.endonym.text) && wTop >= 56 && !clippedTop) {
    // Other scripts: the name as its people wrote it, set vertically at the head of the lane.
    const size = Math.min(wTop * 0.4, 52);
    const w = fitWidth({ role: 'endonym', text: lane.endonym.text, size, color: onLane, align: 'center' }) + 10;
    const at = top + Math.max(rTop, 30) + 20;
    if (len > w * 3 + 400) {
      layers.text.push(text({ role: 'endonym', text: lane.endonym.text, size, color: onLane, align: 'center', w, x: cxAt(at + w / 2) - size * 0.6, y: at, rot: -90, alpha: 0.85, fade: [0.06, 0.1], ref: lane.id }));
      reservedTop = at + w + 50;
    }
  }

  /** The stretch of [a, b] of length `need` where the lane drifts least, so straight vertical text stays inside it. */
  const steadiest = (a: number, b: number, need: number) => {
    let best = { y: a + (b - a - need) / 2, drift: Infinity };
    for (let y = a; y + need <= b; y += 24) {
      let lo = Infinity, hi = -Infinity;
      for (let t = y; t <= y + need; t += 24) { const c = cxAt(t); lo = Math.min(lo, c); hi = Math.max(hi, c); }
      const drift = hi - lo + Math.abs(y + need / 2 - (a + b) / 2) * 0.02;
      if (drift < best.drift) best = { y, drift };
    }
    return { y: best.y, cx: cxAt(best.y + need / 2) };
  };

  const bounds = segs.map((s) => ({ ...s, ya: Y(Math.max(s.a, year0)), yb: Y(Math.min(s.b, year1)) })).filter((s) => s.yb > s.ya);
  const segNamed = lane.segments.length > 1;
  const longest = bounds.reduce((m, s, i) => (s.yb - s.ya > bounds[m]!.yb - bounds[m]!.ya ? i : m), 0);
  bounds.forEach((s, i) => {
    const a = Math.max(s.ya, i === 0 ? reservedTop : s.ya) + 30;
    const b = s.yb - 30;
    const room = b - a;
    if (room < 200) return;
    const isMain = i === longest;
    if (lane.prominence === 4) {
      if (!isMain) return;
      const size = 12;
      const w = Math.min(room, fitWidth({ role: 'whisper', text: lane.name, size, color: INK_SOFT, align: 'left' }) + 4);
      const at = steadiest(a, b, w);
      layers.text.push(text({ role: 'whisper', text: lane.name, size, color: INK_SOFT, align: 'left', w, x: at.cx + s.w / 2 + 6, y: at.y, rot: -90, fade: LANE_NAME_FADE[4], ref: lane.id }));
      grid.mark(at.cx + s.w / 2 + 6, at.y, size * 1.3, w, 6);
      return;
    }
    const subName = segNamed && s.name !== lane.name ? s.name : undefined;
    if (isMain) {
      let size = Math.min(subName ? s.w * 0.46 : s.w * 0.6, lane.prominence === 1 ? 150 : 110);
      const role: TextRole = lane.prominence <= 2 ? 'lane-major' : 'lane-minor';
      let w = fitWidth({ role, text: lane.name, size, color: onLane, align: 'center' }) + 10;
      if (w > room) { size *= room / w; w = room; }
      const gap = subName ? s.w * 0.07 : 0;
      const subSize = subName ? Math.min(s.w * 0.2, 44) : 0;
      const blockW = size * 1.2 + gap + subSize * 1.2;
      const at = steadiest(a, b, w);
      const x = at.cx - blockW / 2;
      layers.text.push(text({ role, text: lane.name, size, color: onLane, align: 'center', w, x, y: at.y, rot: -90, fade: LANE_NAME_FADE[lane.prominence], ref: lane.id }));
      if (subName) {
        const sw = Math.min(room, fitWidth({ role: 'segment', text: subName, size: subSize, color: onLane, align: 'center' }) + 10);
        layers.text.push(text({ role: 'segment', text: subName, size: subSize, color: onLane, align: 'center', w: sw, x: x + size * 1.2 + gap, y: at.y + (w - sw) / 2, rot: -90, fade: [0.07, 0.11], alpha: 0.9, ref: lane.id }));
      }
    } else if (subName) {
      const size = Math.min(s.w * 0.5, 54);
      if (size < 14) return;
      const w = Math.min(room, fitWidth({ role: 'segment', text: subName, size, color: onLane, align: 'center' }) + 10);
      const at = steadiest(a, b, w);
      layers.text.push(text({ role: 'segment', text: subName, size, color: onLane, align: 'center', w, x: at.cx - size * 0.6, y: at.y, rot: -90, fade: [0.07, 0.11], alpha: 0.9, ref: lane.id }));
    }
  });
}

// ---------------------------------------------------------------- relations
const ARROW = (x: number, yy: number, dir: 1 | -1, size: number) =>
  `M ${x} ${yy} L ${x - dir * size} ${yy - size * 0.55} L ${x - dir * size} ${yy + size * 0.55} Z`;

for (const p of placed.values()) {
  for (const rel of p.lane.relations) {
    const at = Y(parseDate(rel.at).year);
    const targets = (rel.lanes ?? (rel.lane ? [rel.lane] : [])).map((id) => placed.get(id)).filter((t): t is PlacedLane => !!t);
    const color = laneColor(p.lane.sphere, Math.min(3, p.lane.prominence) as Prominence);
    for (const t of targets) {
      if (rel.type === 'conquers' || rel.type === 'influences' || rel.type === 'merges-into') {
        const yy = rel.type === 'merges-into' ? Math.min(at, p.bottom) + 40 : at;
        const dir: 1 | -1 = t.cxAt(yy) > p.cxAt(yy) ? 1 : -1;
        const x1 = p.cxAt(yy) + dir * p.halfAt(yy);
        const x2 = t.cxAt(yy) - dir * (t.halfAt(yy) + 10);
        const d = rel.type === 'merges-into'
          ? `M ${p.cxAt(yy - 80)} ${yy - 80} C ${p.cxAt(yy)} ${yy} ${x2 - dir * 120} ${yy} ${x2} ${yy}`
          : `M ${x1} ${yy} L ${x2} ${yy}`;
        // Long-distance arrows would slash across whole regions at the wall view: let them appear only up close.
        const fade: Fade | undefined = Math.abs(x2 - x1) > 2500 ? [0.07, 0.11] : undefined;
        layers.links.push({ k: 'path', d, stroke: mix(color, INK, 0.25), sw: 2.2, hair: true, dash: rel.type === 'influences' ? [5, 5] : undefined, alpha: 0.75, fade, b: [Math.min(x1, x2) - 20, yy - 90, Math.max(x1, x2) + 20, yy + 30] });
        layers.links.push({ k: 'path', d: ARROW(x2 + dir * 10, yy, dir, 34), fill: mix(color, INK, 0.25), alpha: 0.85, fade, b: [Math.min(x2 - 40, x2 + 50), yy - 30, Math.max(x2 - 40, x2 + 50), yy + 30] });
        grid.mark(Math.min(x1, x2), yy - 14, Math.abs(x2 - x1), 28);
      } else {
        // Succession / splits between tracks: a soft ribbon from the end of one lane into the next.
        const ya = Math.min(p.bottom, at) - 10;
        const yb = Math.max(t.top, at) + 10;
        const xa = p.cxAt(ya), xb = t.cxAt(yb);
        if (p.track === t.track) continue;
        const mid = (ya + yb) / 2 + 140;
        const w = Math.max(14, Math.min(p.halfAt(ya), t.halfAt(yb)) * 0.7);
        const d = `M ${xa} ${ya - 80} C ${xa} ${mid} ${xb} ${mid - 140} ${xb} ${yb + 80}`;
        // Long ribbons (e.g. Alexander's empire to the Seleucids) become thin threads that appear up close.
        const far = Math.abs(xb - xa) > 2500;
        layers.links.push({
          k: 'path', d, stroke: color, sw: far ? 3 : w, hair: far, alpha: far ? 0.6 : 0.55, multiply: true,
          fade: far ? [0.07, 0.11] : undefined, b: [Math.min(xa, xb) - w, ya - 100, Math.max(xa, xb) + w, yb + 100],
        });
        if (far) continue;
        for (let k = 0; k <= 12; k++) {
          const t2 = k / 12, u = 1 - t2;
          const bx = u ** 3 * xa + 3 * u * u * t2 * xa + 3 * u * t2 * t2 * xb + t2 ** 3 * xb;
          const by = u ** 3 * (ya - 80) + 3 * u * u * t2 * mid + 3 * u * t2 * t2 * (mid - 140) + t2 ** 3 * (yb + 80);
          grid.mark(bx - w / 2, by - 20, w, 40, 6);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- labels & images, by priority
interface Placement {
  kind: 'label' | 'image';
  id: string;
  prom: Prominence;
  box: [number, number, number, number]; // x, y, w, h
  emit: (prom: Prominence) => Item[];
}
const placements: Placement[] = [];

/** What a label says and how it looks: an event, a person (with a lifetime bar) or a voice (a quotation). */
interface LabelSpec {
  id: string;
  text: string;
  pre?: string;
  /** Overrides the prominence's text role (voices are set in the italic caption face). */
  role?: TextRole;
  /** People: birth and death, drawn as a bar beside the lane. */
  life?: [number, number];
}
type Job =
  | { kind: 'label'; prom: Prominence; yy: number; lane: PlacedLane; spec: LabelSpec }
  | { kind: 'image'; prom: Prominence; yy: number; lane: PlacedLane; img: LaneImage };
const jobs: Job[] = [];
for (const p of placed.values()) {
  for (const ev of p.lane.events) {
    stats.events++;
    if (ev.prominence === 5) { stats.archived++; continue; }
    const d = parseDate(ev.date);
    if (d.year < year0 || d.year > year1) continue;
    jobs.push({ kind: 'label', prom: ev.prominence, yy: Y(d.year), lane: p, spec: { id: ev.id, text: ev.label, pre: formatDate(d) } });
  }
  for (const img of p.lane.images) {
    stats.images++;
    if (!manifest[img.id]) { console.warn(`  ! image ${img.id} not processed yet (run scripts/images/pipeline.ts)`); continue; }
    if (img.prominence >= 4) { stats.archived++; continue; }
    jobs.push({ kind: 'image', prom: img.prominence, yy: Y(parseDate(img.date).year), lane: p, img });
  }
}
// People sit beside their lane at the height of their working life; voices at their date.
for (const who of people) {
  const p = placed.get(who.lane);
  if (!p) continue;
  if (who.prominence === 5) { stats.archived++; continue; }
  const life = parseSpan(who.life);
  if (life.end.year < year0 || life.start.year > year1) continue;
  const prime = life.start.year + (life.end.year - life.start.year) * 0.65;
  const yy = Math.min(p.bottom - 20, Math.max(p.top + 20, Y(Math.max(year0, Math.min(year1, prime)))));
  stats.people++;
  jobs.push({ kind: 'label', prom: who.prominence, yy, lane: p, spec: { id: who.id, text: `${who.name}, ${who.role}`, pre: formatSpan(life), life: [life.start.year, life.end.year + 1] } });
}
for (const v of voices) {
  const p = placed.get(v.lane);
  if (!p) continue;
  if (v.prominence === 5) { stats.archived++; continue; }
  const d = parseDate(v.date);
  if (d.year < year0 || d.year > year1) continue;
  stats.voices++;
  jobs.push({ kind: 'label', prom: v.prominence, yy: Y(d.year), lane: p, spec: { id: v.id, text: `“${v.text}” — ${v.speaker}`, role: 'caption' } });
}
// Words before pictures: P1–P2 labels, then P1–P2 images, then P3 labels, P3 images, P4 labels.
const rank = (j: Job) => (j.kind === 'label' ? (j.prom <= 2 ? 0 : j.prom === 3 ? 2 : 4) : j.prom <= 2 ? 1 : 3);
jobs.sort((a, b) => rank(a) - rank(b) || a.prom - b.prom || a.yy - b.yy);
for (const job of jobs) {
  if (job.kind === 'label') placeLabel(job.lane, job.spec, job.yy, job.prom);
  else placeImage(job.lane, job.img, job.yy, job.prom);
}

function labelStyle(prom: Prominence) {
  return {
    size: LABEL_SIZE[prom],
    role: (prom === 1 ? 'label-strong' : prom === 4 ? 'whisper' : 'label') as TextRole,
    color: prom === 4 ? INK_SOFT : INK,
    fade: LABEL_FADE[prom],
  };
}

function placeLabel(p: PlacedLane, ev: LabelSpec, yy: number, prom: Prominence): void {
  if (prom > 4) { stats.archived++; return; }
  const st = { ...labelStyle(prom), ...(ev.role ? { role: ev.role } : {}) };
  const pre = ev.pre;
  const tick = prom <= 2 ? 26 : 16;
  const maxSlide = MAX_SLIDE_YEARS * UNITS_PER_YEAR;
  // Measurements are cached per wrap width (rounded), since sliding re-asks often.
  const measured = new Map<number, ReturnType<typeof measure>>();
  const measureAt = (w: number, align: 'left' | 'right') => {
    const key = Math.floor(w / 20) * 20 * (align === 'left' ? 1 : -1);
    let m = measured.get(key);
    if (!m) { m = measure(ck, fonts, { role: st.role, text: ev.text, pre, size: st.size, color: st.color, align, w: Math.abs(key) }); measured.set(key, m); }
    return { m, w: Math.abs(key) };
  };
  const tryAt = (side: 1 | -1) => {
    const edge = side === 1 ? p.cxAt(yy) + p.halfAt(yy) : p.cxAt(yy) - p.halfAt(yy);
    const x0 = edge + side * (tick + 40);
    // Slide: try the exact date first, then nudge down (or a little up). At each position, measure
    // the free run beside the lane and wrap the label to fit it.
    for (let dy = 0; dy <= maxSlide; dy += 10) {
      for (const sgn of dy === 0 ? [0] : [1, -1]) {
        if (sgn === -1 && dy > 3 * UNITS_PER_YEAR) continue;
        const bandTop = yy - st.size * 0.6 + sgn * dy;
        const run = side === 1
          // A label may borrow empty room from the next track; the grid keeps it off lanes and other labels.
          ? grid.freeRunRight(x0, bandTop, st.size * 1.2, LABEL_MAX_W[prom]) - 30
          : grid.freeRunLeft(x0, bandTop, st.size * 1.2, LABEL_MAX_W[prom]) - 30;
        const avail = Math.min(LABEL_MAX_W[prom], run);
        if (avail < Math.min(200, LABEL_MAX_W[prom])) continue;
        const { m } = measureAt(avail, side === 1 ? 'left' : 'right');
        const w = Math.ceil(m.longest) + 4;
        const x = side === 1 ? x0 : x0 - w;
        const top = yy - m.lineH / 2 + sgn * dy;
        if (grid.isFree(x, top, w, m.h)) return { x, top, w, h: m.h, lineH: m.lineH, side };
      }
    }
    return null;
  };
  const spot = tryAt(1) ?? tryAt(-1);
  if (!spot) {
    // No room near its date: one step quieter, and eventually off the canvas into the Folio.
    stats.demoted++;
    if (process.env.VERBOSE) console.warn(`  ↓ P${prom}→P${prom + 1} (no room): ${ev.id}`);
    if (prom === 4) { stats.archived++; console.warn(`  ↓ archived (no room): ${ev.id}`); return; }
    placeLabel(p, ev, yy, (prom + 1) as Prominence);
    return;
  }
  grid.mark(spot.x, spot.top, spot.w, spot.h, 10);
  if (Math.abs(spot.top + spot.lineH / 2 - yy) > 4) stats.slid++;
  if (ev.life) stats.drawnPeople++; else if (ev.role === 'caption') stats.drawnVoices++; else stats.drawnEvents++;
  // A lifetime bar runs beside the lane from birth to death, where the paper is free.
  const laneEdgeAt = (y: number) => (spot.side === 1 ? p.cxAt(y) + p.halfAt(y) : p.cxAt(y) - p.halfAt(y));
  let bar: { x: number; a: number; b: number } | null = null;
  if (ev.life) {
    const a = Math.max(p.top, Y(Math.max(year0, ev.life[0]))), b = Math.min(p.bottom, Y(Math.min(year1, ev.life[1])));
    const x = laneEdgeAt(yy) + spot.side * 8;
    if (b - a > 20 && grid.isFree(x - 3, a, 6, b - a)) { bar = { x, a, b }; grid.mark(x - 3, a, 6, b - a); }
  }
  placements.push({
    kind: 'label', id: ev.id, prom,
    box: [spot.x, spot.top, spot.w, spot.h],
    emit(current) {
      const s = labelStyle(current);
      const anchorY = spot.top + spot.lineH / 2;
      const laneEdge = spot.side === 1 ? p.cxAt(yy) + p.halfAt(yy) : p.cxAt(yy) - p.halfAt(yy);
      const tickEnd = laneEdge + spot.side * (current <= 2 ? 26 : 16);
      const labelEdge = spot.side === 1 ? spot.x - 10 : spot.x + spot.w + 10;
      const lead = Math.abs(anchorY - yy) > 4
        ? `M ${tickEnd} ${yy} C ${(tickEnd + labelEdge) / 2} ${yy} ${tickEnd} ${anchorY} ${labelEdge} ${anchorY}`
        : `M ${tickEnd} ${yy} L ${labelEdge} ${yy}`;
      const role = ev.role ?? s.role;
      const lifeBar: Item[] = bar ? [
        { k: 'line', x1: bar.x, y1: bar.a, x2: bar.x, y2: bar.b, stroke: INK_SOFT, sw: 1.6, hair: true, alpha: 0.5, fade: s.fade, ref: ev.id, b: [bar.x - 3, bar.a, bar.x + 3, bar.b] },
        { k: 'line', x1: bar.x - 5, y1: bar.a, x2: bar.x + 5, y2: bar.a, stroke: INK_SOFT, sw: 1.2, hair: true, alpha: 0.5, fade: s.fade, b: [bar.x - 6, bar.a - 2, bar.x + 6, bar.a + 2] },
        { k: 'line', x1: bar.x - 5, y1: bar.b, x2: bar.x + 5, y2: bar.b, stroke: INK_SOFT, sw: 1.2, hair: true, alpha: 0.5, fade: s.fade, b: [bar.x - 6, bar.b - 2, bar.x + 6, bar.b + 2] },
      ] : [];
      return [
        ...lifeBar,
        { k: 'line', x1: laneEdge, y1: yy, x2: tickEnd, y2: yy, stroke: INK, sw: current <= 2 ? 3 : 2, alpha: 0.8, fade: s.fade, b: [Math.min(laneEdge, tickEnd), yy - 3, Math.max(laneEdge, tickEnd), yy + 3] },
        { k: 'path', d: lead, stroke: INK_SOFT, sw: 1, hair: true, alpha: 0.55, fade: s.fade, b: [Math.min(tickEnd, labelEdge) - 4, Math.min(yy, anchorY) - 4, Math.max(tickEnd, labelEdge) + 4, Math.max(yy, anchorY) + 4] },
        text({ role, text: ev.text, pre, size: s.size, color: s.color, align: spot.side === 1 ? 'left' : 'right', w: spot.w, x: spot.x, y: spot.top, fade: s.fade, ref: ev.id }),
      ];
    },
  });
}

function placeImage(p: PlacedLane, img: LaneImage, yy: number, prom: Prominence, shrink = 1): void {
  const asset = manifest[img.id]!;
  const long = IMAGE_LONG[prom] * shrink;
  const aspect = asset.width / asset.height;
  const w = aspect >= 1 ? long : long * aspect;
  const h = aspect >= 1 ? long / aspect : long;
  const capSize = CAPTION_SIZE[prom];
  const capW = Math.max(w, 260);
  const cap = measure(ck, fonts, { role: 'caption', text: img.caption, size: capSize, color: INK_SOFT, align: 'center', w: capW });
  const boxW = Math.max(w, capW), boxH = h + capSize * 0.6 + cap.h + capSize;
  const m = asset.treatment === 'plate' ? Math.max(w, h) * 0.05 : 0;
  // Candidates beside the lane on either side, near the date; the nearest free spot wins.
  const candidates: { x: number; y: number; cost: number }[] = [];
  const maxSlide = MAX_SLIDE_YEARS * 1.5 * UNITS_PER_YEAR;
  for (let dy = -maxSlide * 0.4; dy <= maxSlide; dy += 30) {
    const top = yy - boxH / 2 + dy;
    const right = p.cxAt(yy) + p.halfAt(yy) + 60 + m;
    const left = p.cxAt(yy) - p.halfAt(yy) - 60 - m - boxW;
    for (let dx = 0; dx <= 900; dx += 40) {
      candidates.push({ x: right + dx, y: top, cost: Math.abs(dy) + dx * 0.6 });
      candidates.push({ x: left - dx, y: top, cost: Math.abs(dy) + dx * 0.6 + 120 });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const spot = candidates.find((c) => grid.isFree(c.x - m, c.y - m, boxW + 2 * m, boxH + 2 * m));
  if (!spot) {
    if (shrink > 0.65) return placeImage(p, img, yy, prom, shrink * 0.8);
    stats.demoted++;
    console.warn(`  ↓ image without room: ${img.id}`);
    return;
  }
  grid.mark(spot.x - m, spot.y - m, boxW + 2 * m, boxH + 2 * m, 24);
  stats.drawnImages++;
  const ix = spot.x + (boxW - w) / 2;
  placements.push({
    kind: 'image', id: img.id, prom,
    box: [spot.x, spot.y, boxW, boxH],
    emit(current) {
      const fade = IMAGE_FADE[current];
      const capFade: Fade = fade ? [fade[0] * 2.2, fade[1] * 2.2] : [0.06, 0.09];
      const item: ImageItem = { k: 'image', id: img.id, x: ix, y: spot.y, w, h, sizes: asset.sizes, treatment: asset.treatment, fade, ref: img.id, b: [ix - m * 1.6, spot.y - m * 1.6, ix + w + m * 1.6, spot.y + h + m * 1.6] };
      const capY = spot.y + h + capSize * 0.6 + m;
      return [
        item,
        text({ role: 'caption', text: img.caption, size: capSize, color: INK_SOFT, align: 'center', w: capW, x: spot.x + (boxW - capW) / 2, y: capY, fade: capFade, ref: img.id }),
        text({ role: 'whisper', text: `${asset.credit} · ${asset.license}`, size: Math.max(7, capSize * 0.42), color: INK_SOFT, align: 'center', w: capW, x: spot.x + (boxW - capW) / 2, y: capY + cap.h + 4, fade: [0.5, 0.8], alpha: 0.8, ref: img.id }),
      ];
    },
  });
}

// ---------------------------------------------------------------- density budgets
const fitS = Math.min(BUDGET.viewW / width, BUDGET.viewH / height);
for (const s of [1, 2.5, 7, 22].map((z) => fitS * z)) {
  for (let round = 0; round < 8; round++) {
    const marksOf = (kind: Placement['kind']): BudgetMark[] => placements.filter((p) => p.kind === kind).map((p) => ({
      id: p.id, x: p.box[0], y: p.box[1], w: p.box[2], h: p.box[3], prominence: p.prom,
      readableAt: kind === 'label'
        ? (sc) => LABEL_SIZE[p.prom] * sc >= 8 && fadeAt(LABEL_FADE[p.prom], sc) >= 0.5
        : (sc) => Math.max(p.box[2], p.box[3]) * sc >= 60 && fadeAt(IMAGE_FADE[p.prom], sc) >= 0.5,
    }));
    const over = [
      ...overBudget(marksOf('label'), { s, viewW: BUDGET.viewW, viewH: BUDGET.viewH, maxReadable: BUDGET.labels }),
      ...overBudget(marksOf('image'), { s, viewW: BUDGET.viewW, viewH: BUDGET.viewH, maxReadable: BUDGET.images }),
    ];
    if (!over.length) break;
    for (const id of over) {
      const i = placements.findIndex((p) => p.id === id);
      const p = placements[i]!;
      stats.budgetDemotions++;
      if (p.prom >= 4 || (p.kind === 'image' && p.prom >= 3)) { placements.splice(i, 1); stats.archived++; }
      else p.prom = (p.prom + 1) as Prominence;
    }
  }
}
for (const p of placements) {
  for (const it of p.emit(p.prom)) (it.k === 'image' ? layers.images : it.k === 'text' ? layers.text : layers.marks).push(it);
}

// ---------------------------------------------------------------- atmosphere: engravings in the open paper
// Placed last, into whatever room the content left: each one takes the emptiest spot inside its
// region and span, shrinking if it must, and is skipped (with a note) if there is no room at all.
const atmosphere = AtmosphereFile.parse(loadYaml(join(ROOT, 'content/atmosphere.yaml'))).engravings;
const occupied = grid.occupancy(4);
const engravingBoxes: [number, number, number, number][] = [];
const overlapsEngraving = (x: number, y: number, w: number, h: number) =>
  engravingBoxes.some(([bx, by, bw, bh]) => x < bx + bw + 400 && bx < x + w + 400 && y < by + bh + 400 && by < y + h + 400);
for (const e of atmosphere) {
  const region = regionById.get(e.region);
  const asset = manifest[e.id];
  const sp = parseSpan(e.span);
  if (!region || !asset || sp.end.year < year0 || sp.start.year > year1) continue;
  const ya = Y(Math.max(year0, sp.start.year)), yb = Y(Math.min(year1, sp.end.year + 1));
  const long = ENGRAVING_SIZE[e.size];
  let best: { x: number; y: number; w: number; h: number; score: number } | null = null;
  // A strict pass first; crowded columns get a second, more lenient one (smaller, a little overlap).
  const passes: [number, number][] = [[1, 1], [0.85, 1], [0.7, 1], [0.55, 1], [0.55, 2], [0.45, 2]];
  for (const [f, slack] of passes) {
    const maxOcc = ENGRAVING_MAX_OCCUPIED * slack;
    const k = (long * f) / Math.max(asset.width, asset.height);
    const w = asset.width * k, h = asset.height * k;
    if (h > yb - ya || w > region.width) continue;
    const step = Math.max(150, Math.min(w, h) / 8);
    for (let y = ya; y + h <= yb; y += step) {
      for (let x = region.x0; x + w <= region.x0 + region.width; x += step) {
        const occ = occupied(x, y, w, h);
        if (occ > maxOcc || overlapsEngraving(x, y, w, h)) continue;
        // Prefer the emptiest spot, then the middle of the span.
        const score = occ + Math.abs(y + h / 2 - (ya + yb) / 2) / (yb - ya) * 0.02;
        if (!best || score < best.score) best = { x, y, w, h, score };
      }
    }
    if (best) break;
  }
  if (!best) { console.log(`  · no room for engraving ${e.id} in ${e.region}`); stats.engravingsSkipped++; continue; }
  const { x, y, w, h } = best;
  engravingBoxes.push([x, y, w, h]);
  layers.atmosphere.push({
    k: 'image', id: e.id, x, y, w, h, sizes: asset.sizes, treatment: 'backdrop',
    alpha: ENGRAVING_ALPHA, fadeOut: ENGRAVING_FADE_OUT, layer: 'atmosphere', b: [x, y, x + w, y + h],
  });
  stats.engravings++;
}

// ---------------------------------------------------------------- threads (optional layers)
const threadDefs = ThreadFile.parse(loadYaml(join(ROOT, 'content/threads.yaml'))).threads;
const threadsOut: { id: string; name: string; color: string; events: string[]; box: [number, number, number, number] }[] = [];
for (const th of threadDefs) {
  // Each stop is where the event touches its lane: right edge, at its date.
  const stops = [...placed.values()].flatMap((p) => p.lane.events
    .filter((e) => e.thread === th.id && parseDate(e.date).year >= year0 && parseDate(e.date).year <= year1)
    .map((e) => { const yy = Y(parseDate(e.date).year); return { id: e.id, x: p.cxAt(yy) + p.halfAt(yy), y: yy }; }))
    .sort((a, b) => a.y - b.y);
  if (stops.length < 2) continue;
  const layer = `thread:${th.id}`;
  const d = [`M ${r1(stops[0]!.x)} ${r1(stops[0]!.y)}`, ...stops.slice(1).map((st, i) => {
    const prev = stops[i]!;
    const my = (prev.y + st.y) / 2;
    return `C ${r1(prev.x)} ${r1(my)} ${r1(st.x)} ${r1(my)} ${r1(st.x)} ${r1(st.y)}`;
  })].join(' ');
  const xs = stops.map((st) => st.x), ys = stops.map((st) => st.y);
  const box: [number, number, number, number] = [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + 40, Math.max(...ys) + 40];
  layers.threads.push({ k: 'path', d, stroke: th.color, sw: 3, hair: true, dash: [12, 7], alpha: 0.9, layer, ref: layer, b: box });
  for (const st of stops) {
    layers.threads.push({ k: 'rect', x: st.x - 22, y: st.y - 22, w: 44, h: 44, r: 22, fill: th.color, stroke: PAPER, sw: 6, alpha: 0.95, layer, ref: st.id, b: [st.x - 25, st.y - 25, st.x + 25, st.y + 25] });
  }
  const first = stops[0]!;
  layers.threads.push(text({ role: 'caption', text: th.name, size: 64, color: th.color, align: 'left', w: 900, x: first.x + 40, y: first.y - 110, layer, ref: layer } as Parameters<typeof text>[0]));
  threadsOut.push({ id: th.id, name: th.name, color: th.color, events: stops.map((st) => st.id), box: [box[0], box[1], box[2] - box[0], box[3] - box[1]] });
}

// ---------------------------------------------------------------- assemble & write
const items: Item[] = [layers.substrate, layers.atmosphere, layers.grid, layers.bands, layers.links, layers.lanes, layers.images, layers.marks, layers.text, layers.threads].flat();
for (const it of items) if (!it.b) throw new Error(`item without bbox: ${JSON.stringify(it).slice(0, 120)}`);

// ---------------------------------------------------------------- folio (side-panel data)
const folio: Folio = { entries: {}, lanes: [], threads: [] };
const placedBox = new Map(placements.map((p) => [p.id, p.box]));
for (const lane of lanes) {
  const p = placed.get(lane.id);
  const region = sheet.regions.find((r) => r.id === lane.region)?.name ?? lane.region;
  const wiki = lane.sources.find((s) => s.startsWith('wikipedia:'))?.slice(10);
  const laneBox: [number, number, number, number] = p ? [p.cxAt(p.top) - 260, p.top, 1000, p.bottom - p.top] : [0, 0, 0, 0];
  if (p) folio.lanes.push({ id: lane.id, name: lane.name, cx: p.cxAt(p.top), top: p.top, bottom: p.bottom, prominence: lane.prominence });
  const entry: FolioEntry = {
    id: lane.id, kind: 'lane', title: lane.name, dates: formatSpan(parseSpan(lane.span)), region, laneId: lane.id, laneName: lane.name,
    prominence: lane.prominence, drawn: !!p, basis: lane.basis, endonym: lane.endonym, wikidata: lane.wikidata, wikipedia: wiki,
    sources: [...lane.sources.map(sourceLink), ...(lane.wikidata ? [sourceLink(`wikidata:${lane.wikidata}`)] : [])],
    segments: lane.segments.map((s) => ({ name: s.name, dates: formatSpan(parseSpan(s.span)) })),
    relations: lane.relations.flatMap((r) => (r.lanes ?? (r.lane ? [r.lane] : [])).map((id) => ({ type: r.type, laneId: id, laneName: laneById.get(id)?.name ?? id, dates: formatDate(parseDate(r.at)) }))),
    events: [...lane.events].sort((a, b) => parseDate(a.date).year - parseDate(b.date).year)
      .map((e) => ({ id: e.id, dates: formatDate(parseDate(e.date)), label: e.label, drawn: placedBox.has(e.id) })),
    images: lane.images.filter((i) => manifest[i.id]).map((i) => i.id),
    people: people.filter((w) => w.lane === lane.id).sort((a, b) => parseSpan(a.life).start.year - parseSpan(b.life).start.year)
      .map((w) => ({ id: w.id, dates: formatSpan(parseSpan(w.life)), name: w.name, role: w.role, drawn: placedBox.has(w.id) })),
    voices: voices.filter((v) => v.lane === lane.id).map((v) => ({ id: v.id, dates: formatDate(parseDate(v.date)), text: v.text, speaker: v.speaker })),
    daily: dailyCards.filter((c) => c.lane === lane.id).map((c) => ({ id: c.id, dates: formatSpan(parseSpan(c.span)), title: c.title })),
    box: laneBox,
  };
  folio.entries[lane.id] = entry;
  const near = (year: number): [number, number, number, number] => (p ? [p.cxAt(Y(year)) - 200, Y(year) - 100, 600, 200] : laneBox);
  const wikiOf = (sources: string[]) => sources.find((x) => x.startsWith('wikipedia:'))?.slice(10);
  for (const w of people.filter((x) => x.lane === lane.id)) {
    const life = parseSpan(w.life);
    folio.entries[w.id] = {
      id: w.id, kind: 'person', title: w.name, dates: formatSpan(life), region, laneId: lane.id, laneName: lane.name,
      prominence: w.prominence, drawn: placedBox.has(w.id), role: w.role, endonym: w.endonym, wikipedia: wikiOf(w.sources),
      sources: w.sources.map(sourceLink), box: placedBox.get(w.id) ?? near(Math.round((life.start.year + life.end.year) / 2)),
      events: lanes.flatMap((l) => l.events.filter((e) => e.people.includes(w.id)).map((e) => ({ id: e.id, dates: formatDate(parseDate(e.date)), label: e.label, drawn: placedBox.has(e.id) }))),
    };
  }
  for (const v of voices.filter((x) => x.lane === lane.id)) {
    folio.entries[v.id] = {
      id: v.id, kind: 'voice', title: `${v.speaker}: “${v.text.length > 60 ? v.text.slice(0, 57) + '…' : v.text}”`, dates: formatDate(parseDate(v.date)), region, laneId: lane.id, laneName: lane.name,
      prominence: v.prominence, drawn: placedBox.has(v.id), quote: { text: v.text, speaker: v.speaker, work: v.work, translation: v.translation },
      sources: v.sources.map(sourceLink), box: placedBox.get(v.id) ?? near(parseDate(v.date).year),
    };
  }
  for (const c of dailyCards.filter((x) => x.lane === lane.id)) {
    const sp = parseSpan(c.span);
    folio.entries[c.id] = {
      id: c.id, kind: 'daily', title: c.title, dates: formatSpan(sp), region, laneId: lane.id, laneName: lane.name,
      prominence: 5, drawn: false, note: c.text, sources: c.sources.map(sourceLink), box: near(Math.round((sp.start.year + sp.end.year) / 2)),
    };
  }
  for (const e of lane.events) {
    const box = placedBox.get(e.id) ?? (p ? [p.cxAt(Y(parseDate(e.date).year)) - 200, Y(parseDate(e.date).year) - 100, 600, 200] as [number, number, number, number] : laneBox);
    const ewiki = e.sources.find((s) => s.startsWith('wikipedia:'))?.slice(10);
    folio.entries[e.id] = {
      id: e.id, kind: 'event', title: e.label, dates: formatDate(parseDate(e.date)), region, laneId: lane.id, laneName: lane.name,
      prominence: e.prominence, drawn: placedBox.has(e.id), confidence: e.confidence, themes: e.themes, wikipedia: ewiki,
      sources: e.sources.map(sourceLink), box,
    };
  }
  for (const i of lane.images) {
    const a = manifest[i.id];
    if (!a) continue;
    folio.entries[i.id] = {
      id: i.id, kind: 'image', title: i.caption, dates: formatDate(parseDate(i.date)), region, laneId: lane.id, laneName: lane.name,
      prominence: i.prominence, drawn: placedBox.has(i.id),
      sources: [{ label: a.credit, url: a.url }],
      image: { caption: i.caption, title: a.title, credit: a.credit, license: a.license, url: a.url, sizes: a.sizes, width: a.width, height: a.height, treatment: a.treatment },
      box: placedBox.get(i.id) ?? laneBox,
    };
  }
}

folio.threads = threadsOut;
for (const era of sheet.eras) {
  if (!eraBoxes[era.id]) continue;
  folio.entries[`era:${era.id}`] = {
    id: `era:${era.id}`, kind: 'era', title: era.name, dates: formatSpan(parseSpan(era.span)), region: 'The whole world', laneId: '', laneName: '',
    prominence: 1, drawn: true, forces: era.forces,
    note: [era.turningPoint && `Turning point: ${era.turningPoint.label} (${formatSpan(parseSpan(era.turningPoint.span))}).`, era.note].filter(Boolean).join(' '),
    sources: era.sources.map(sourceLink), wikipedia: era.sources.find((s) => s.startsWith('wikipedia:'))?.slice(10), box: eraBoxes[era.id]!,
  };
}
for (const m of [...marginEntries, ...eraMapEntries]) folio.entries[m.id] = m;
for (const th of threadsOut) {
  const evs = th.events.map((id) => folio.entries[id]!).filter(Boolean);
  folio.entries[`thread:${th.id}`] = {
    id: `thread:${th.id}`, kind: 'thread', title: th.name, dates: `${evs[0]?.dates} – ${evs[evs.length - 1]?.dates}`,
    region: 'Across regions', laneId: '', laneName: '', prominence: 2, drawn: true, sources: [],
    events: evs.map((e) => ({ id: e.id, dates: e.dates, label: `${e.title} (${e.laneName})`, drawn: e.drawn })),
    box: th.box,
  };
}

const dl: DisplayList = {
  version: 1,
  title: `${sheet.title} — ${sheet.subtitle}`,
  fonts: `/fonts/${SHEET_ID}/`,
  width,
  height,
  time: { y0: HEADER, year0, year1, unitsPerYear: UNITS_PER_YEAR, segments: timeSegs.length > 1 ? timeSegs : undefined },
  regions: regionLayouts.map((r) => ({ x0: r.x0, x1: r.x0 + r.width, name: r.name, short: r.short })),
  items,
  stats: { ...stats, items: items.length },
};

mkdirSync(join(OUT, 'chart'), { recursive: true });
mkdirSync(join(OUT, 'fonts', SHEET_ID), { recursive: true });
mkdirSync(join(OUT, 'canvaskit'), { recursive: true });
writeFileSync(join(OUT, `chart/${SHEET_ID}.json`), JSON.stringify(dl));
writeFileSync(join(OUT, `chart/${SHEET_ID}.folio.json`), JSON.stringify(folio));
// Tours for this sheet; every step must point at something in the Folio.
const tours = walk(join(ROOT, 'content/tours')).map((f) => Tour.parse(loadYaml(f))).filter((t) => t.sheet === SHEET_ID);
for (const t of tours) for (const st of t.steps) if (!folio.entries[st.target]) { console.error(`✗ tour ${t.id}: unknown target "${st.target}"`); process.exit(1); }
writeFileSync(join(OUT, `chart/${SHEET_ID}.tours.json`), JSON.stringify(tours));
// Ship only the glyphs the chart uses (every font gets the same character set, so
// font fallback behaves exactly as it did when the build measured the text).
const used = new Set<string>(' 0123456789.,;:–—-·()[]’\'"?!/&BCEADc');
for (const it of items) if (it.k === 'text') for (const ch of (it.pre ?? '') + it.text) used.add(ch);
const charset = [...used].join('');
let fontBytes = 0;
for (const { file } of FONT_FILES) {
  const src = readFileSync(join(ROOT, 'assets/fonts', file));
  const out = await subsetFont(src, charset, { targetFormat: 'truetype' });
  writeFileSync(join(OUT, 'fonts', SHEET_ID, file), out);
  fontBytes += out.length;
}
copyFileSync(join(ckDir, 'canvaskit.wasm'), join(OUT, 'canvaskit/canvaskit.wasm'));

console.log(`✓ ${dl.title}`);
console.log(`  ${Math.round(width)} × ${Math.round(height)} units · ${items.length} marks · ${stats.lanes} lanes`);
console.log(`  fonts subset to ${used.size} characters: ${(fontBytes / 1024).toFixed(0)} KB`);
console.log(`  events ${stats.drawnEvents}/${stats.events} drawn (${stats.slid} slid off their date) · images ${stats.drawnImages}/${stats.images} · ${stats.demoted} demoted for room · ${stats.budgetDemotions} budget demotions · ${stats.archived} archived · ${stats.engravings} engravings (${stats.engravingsSkipped} without room)`);
console.log(`  people ${stats.drawnPeople}/${stats.people} drawn · voices ${stats.drawnVoices}/${stats.voices} · daily-life cards ${dailyCards.length} (Folio only)`);

// ---------------------------------------------------------------- helpers & lints
function smooth01(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function lint() {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const l of lanes) {
    for (const id of [l.id, ...l.events.map((e) => e.id), ...l.images.map((i) => i.id)]) {
      if (ids.has(id)) problems.push(`duplicate id "${id}"`);
      ids.add(id);
    }
    const span = parseSpan(l.span);
    for (const s of l.segments) {
      const ss = parseSpan(s.span);
      if (ss.start.year < span.start.year - 1 || ss.end.year > span.end.year + 1) problems.push(`${l.id}: segment "${s.name}" outside the lane's span`);
    }
    for (const e of [...l.events, ...l.images]) {
      const d = parseDate(e.date);
      if (d.latest < span.start.year - 1 || d.earliest > span.end.year + 1) problems.push(`${l.id}: ${e.id} (${e.date}) outside ${l.span}`);
    }
    for (const r of l.relations) for (const id of r.lanes ?? (r.lane ? [r.lane] : [])) if (!laneById.has(id)) problems.push(`${l.id}: relation to unknown lane "${id}"`);
    if (!PIGMENTS[l.sphere]) problems.push(`${l.id}: unknown sphere "${l.sphere}"`);
    // People alive at their events (with the slack that 'c.' dates allow).
    for (const e of l.events) for (const pid of e.people) {
      const who = personById.get(pid);
      if (!who) { problems.push(`${e.id}: unknown person "${pid}"`); continue; }
      const life = parseSpan(who.life), d = parseDate(e.date);
      if (d.latest < life.start.earliest || d.earliest > life.end.latest) problems.push(`${e.id} (${e.date}) is outside ${who.name}'s life (${who.life})`);
    }
  }
  for (const x of [...people, ...voices, ...dailyCards]) {
    if (ids.has(x.id)) problems.push(`duplicate id "${x.id}"`);
    ids.add(x.id);
    if (!laneById.has(x.lane)) problems.push(`${x.id}: unknown lane "${x.lane}"`);
  }
  for (const p of people) {
    const life = parseSpan(p.life);
    if (life.end.year - life.start.year > 110) problems.push(`${p.id}: a life of ${life.end.year - life.start.year} years (${p.life})`);
  }
  for (const v of voices) {
    const lane = laneById.get(v.lane);
    if (!lane) continue;
    if (lane.prominence > 2) problems.push(`${v.id}: voices belong to landmark (P1–P2) lanes; ${lane.id} is P${lane.prominence}`);
    const span = parseSpan(lane.span), d = parseDate(v.date);
    if (d.latest < span.start.year - 1 || d.earliest > span.end.year + 1) problems.push(`${v.id} (${v.date}) outside ${lane.id} (${lane.span})`);
    if (v.text.split(/\s+/).length > 26) problems.push(`${v.id}: ${v.text.split(/\s+/).length} words — voices on the canvas stay short`);
  }
  if (problems.length) {
    console.error('✗ content lint failed:\n' + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
}
