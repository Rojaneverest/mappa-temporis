// Compile content/ into the display list for the explorer.
// Phase 0 layout (v0): columns are hand-pinned in the YAML; this script sizes lanes,
// places names and event labels, enforces the calm-by-default density rules, and
// measures every piece of text with the same Skia engine the renderer uses.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import YAML from 'yaml';
import type { CanvasKit, FontCollection } from 'canvaskit-wasm';
import { LaneFile, Sheet, type Lane, type Prominence } from '../packages/core/src/schema.ts';
import { parseDate, parseSpan, formatDate, formatYear, roundYears } from '../packages/core/src/dates.ts';
import { INK, INK_SOFT, PAPER, laneColor, mix, PIGMENTS } from '../packages/core/src/palette.ts';
import { FONT_FILES, registerFonts } from '../packages/render/src/fonts.ts';
import { measure, type TextSpec } from '../packages/render/src/text.ts';
import type { DisplayList, Fade, Item, PathItem, TextItem } from '../packages/render/src/displaylist.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/explorer/public');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- geometry constants
const UNITS_PER_YEAR = 12;
const HEADER = 2400;
const FOOTER = 900;
const MARGIN_L = 1700;
const MARGIN_R = 1100;
const REGION_GAP = 260;
const SLOT: Record<string, number> = { steppe: 1300, 'east-asia': 1000 };
/** Lane width per weight step. */
const WEIGHT_W = [0, 16, 56, 96, 140, 190, 240];
const DEFAULT_WEIGHT: Record<Prominence, number> = { 1: 6, 2: 4, 3: 3, 4: 1, 5: 1 };
const LABEL_SIZE: Record<Prominence, number> = { 1: 54, 2: 40, 3: 25, 4: 13, 5: 0 };
/** Calm by default: scale ranges over which each prominence fades in (proof-sheet fit ≈ 0.043). */
const LABEL_FADE: Record<Prominence, Fade | undefined> = { 1: undefined, 2: [0.075, 0.12], 3: [0.17, 0.26], 4: [0.42, 0.62], 5: undefined };
const LANE_NAME_FADE: Record<Prominence, Fade | undefined> = { 1: undefined, 2: undefined, 3: [0.06, 0.1], 4: [0.3, 0.5], 5: undefined };
/** A label may slide this far below its date before it is demoted out of the canvas. */
const MAX_SLIDE_YEARS = 28;

// ---------------------------------------------------------------- load content
function loadYaml(path: string): unknown {
  return YAML.parse(readFileSync(path, 'utf8'));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : [];
  });
}

const sheet = Sheet.parse(loadYaml(join(ROOT, 'content/sheets/proof-east-asia.yaml')));
const lanes: Lane[] = walk(join(ROOT, 'content/lanes')).flatMap((f) => {
  const parsed = LaneFile.safeParse(loadYaml(f));
  if (!parsed.success) {
    console.error(`✗ ${f}\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    process.exit(1);
  }
  return parsed.data.lanes;
});
const laneById = new Map(lanes.map((l) => [l.id, l]));
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

// ---------------------------------------------------------------- frame
const win = parseSpan(sheet.window);
const year0 = win.start.year;
const year1 = win.end.year;
const y = (year: number) => HEADER + (year - year0) * UNITS_PER_YEAR;
const yTop = y(year0);
const yBottom = y(year1);
const height = yBottom + FOOTER;

let cursor = MARGIN_L;
const regionX = new Map<string, { x0: number; x1: number; slot: number }>();
for (const r of sheet.regions) {
  const slot = SLOT[r.id] ?? 1000;
  regionX.set(r.id, { x0: cursor, x1: cursor + r.columns * slot, slot });
  cursor += r.columns * slot + REGION_GAP;
}
const width = cursor - REGION_GAP + MARGIN_R;

const items: Item[] = [];
const layers = { grid: [] as Item[], bands: [] as Item[], links: [] as Item[], lanes: [] as Item[], marks: [] as Item[], text: [] as Item[] };
const stats = { lanes: lanes.length, events: 0, drawnEvents: 0, demoted: 0, archived: 0 };

function text(spec: TextSpec & { x: number; y: number; rot?: 0 | -90; fade?: Fade; alpha?: number; ref?: string }): TextItem {
  const m = measure(ck, fonts, spec);
  const t: TextItem = { k: 'text', ...spec, lines: m.lines, lineH: m.lineH, h: m.h };
  t.b = spec.rot === -90 ? [spec.x, spec.y, spec.x + m.h, spec.y + spec.w] : [spec.x, spec.y, spec.x + spec.w, spec.y + m.h];
  return t;
}

function fitWidth(spec: TextSpec): number {
  return measure(ck, fonts, { ...spec, w: 1e6 }).longest;
}

// ---------------------------------------------------------------- frame: title, regions, eras, grid
layers.text.push(text({ role: 'title', text: sheet.title, size: 300, color: INK, align: 'left', w: 6000, x: MARGIN_L, y: 380 }));
layers.text.push(text({ role: 'subtitle', text: sheet.subtitle, size: 150, color: INK_SOFT, align: 'left', w: 9000, x: MARGIN_L, y: 760 }));
layers.text.push(text({
  role: 'specimen', size: 70, color: INK_SOFT, align: 'left', w: 9000, x: MARGIN_L, y: 1020,
  text: 'Names in their own scripts — Sumer 𒆠𒂗𒄀 · Egypt 𓆎𓅓𓏏𓊖 · Persia 𐎱𐎠𐎼𐎿 · Hellas Ἑλλάς · Han 漢 · Aksum አክሱም',
}));

for (const r of sheet.regions) {
  const { x0, x1 } = regionX.get(r.id)!;
  layers.text.push(text({ role: 'region', text: r.name.toUpperCase(), size: 190, color: INK, align: 'center', w: x1 - x0, x: x0, y: HEADER - 520 }));
  layers.grid.push({ k: 'line', x1: x0, y1: HEADER - 260, x2: x1, y2: HEADER - 260, stroke: INK, sw: 6, b: [x0, HEADER - 263, x1, HEADER - 257] });
}
// Region dividers.
for (const r of sheet.regions.slice(1)) {
  const x = regionX.get(r.id)!.x0 - REGION_GAP / 2;
  layers.grid.push({ k: 'line', x1: x, y1: yTop - 200, x2: x, y2: yBottom, stroke: INK_SOFT, sw: 1.2, hair: true, alpha: 0.5, b: [x - 2, yTop - 200, x + 2, yBottom] });
}

// Century lines and year labels in both margins.
const fullX0 = MARGIN_L - 260;
const fullX1 = width - MARGIN_R + 200;
const majorCenturies = new Set(roundYears(year0, year1, 500));
for (const yr of roundYears(year0, year1, 100)) {
  const yy = y(yr);
  const major = majorCenturies.has(yr);
  layers.grid.push({ k: 'line', x1: fullX0, y1: yy, x2: fullX1, y2: yy, stroke: '#FFFDF6', sw: major ? 2.2 : 1.4, hair: true, alpha: 0.85, b: [fullX0, yy - 2, fullX1, yy + 2] });
  const label = formatYear(yr, { forceEra: true });
  layers.text.push(text({ role: 'year', text: label, size: 64, color: INK_SOFT, align: 'right', w: 560, x: MARGIN_L - 860, y: yy - 38 }));
  layers.text.push(text({ role: 'year', text: label, size: 64, color: INK_SOFT, align: 'left', w: 560, x: width - MARGIN_R + 260, y: yy - 38 }));
}

// Eras: heavy rules at boundaries, names down the left margin, turning-point bands.
for (const era of sheet.eras) {
  const span = parseSpan(era.span);
  const a = Math.max(span.start.year, year0);
  const b = Math.min(span.end.year + 1, year1);
  if (b <= a) continue;
  if (span.start.year > year0) {
    layers.bands.push({ k: 'rect', x: fullX0 - 900, y: y(a) - 9, w: fullX1 - fullX0 + 1100, h: 18, fill: INK, alpha: 0.82, b: [fullX0 - 900, y(a) - 9, fullX1 + 200, y(a) + 9] });
  }
  const len = y(b) - y(a);
  const name = era.name.toUpperCase();
  const size = Math.min(300, len * 0.07);
  if (size > 60) {
    const w = Math.min(len - 200, fitWidth({ role: 'era', text: name, size, color: INK, align: 'center', w: 1 }) + 40);
    layers.text.push(text({ role: 'era', text: name, size, color: INK, align: 'center', w, x: 240, y: y(a) + (len - w) / 2, rot: -90 }));
  }
  if (era.turningPoint) {
    const tp = parseSpan(era.turningPoint.span);
    const ta = y(Math.max(tp.start.year, year0));
    const tb = y(Math.min(tp.end.year + 1, year1));
    layers.bands.push({ k: 'rect', x: fullX0, y: ta, w: fullX1 - fullX0, h: tb - ta, fill: '#7A6A58', alpha: 0.07, multiply: true, b: [fullX0, ta, fullX1, tb] });
    layers.text.push(text({ role: 'caption', text: era.turningPoint.label, size: 58, color: INK_SOFT, align: 'left', w: 2600, x: regionX.get('east-asia')!.x0 + 2150, y: ta + 18, fade: [0.05, 0.09] }));
  }
}

// ---------------------------------------------------------------- lanes
interface Placed {
  lane: Lane;
  cx: number;
  top: number;
  bottom: number;
  /** Lane half-width as a function of y. */
  halfAt: (yy: number) => number;
  maxW: number;
  colX: number;
  slot: number;
}
const placed = new Map<string, Placed>();

const yearOf = (s: string) => parseSpan(s);

for (const lane of lanes) {
  if (lane.prominence === 5) { stats.archived++; continue; }
  const reg = regionX.get(lane.region);
  if (!reg) throw new Error(`Lane ${lane.id}: unknown region ${lane.region}`);
  const span = yearOf(lane.span);
  if (span.end.year < year0 || span.start.year > year1) continue;

  const defaultW = WEIGHT_W[DEFAULT_WEIGHT[lane.prominence]]!;
  const segs = (lane.segments.length ? lane.segments : [{ name: lane.name, span: lane.span, style: 'normal' as const, weight: undefined }]).map((s) => {
    const sp = yearOf(s.span);
    return { ...s, a: sp.start.year, b: sp.end.year + 1, w: s.weight ? WEIGHT_W[s.weight]! : defaultW };
  });
  const colX = reg.x0 + lane.column * reg.slot;
  const maxW = Math.max(...segs.map((s) => s.w));
  const cx = colX + 60 + WEIGHT_W[6]! / 2;
  const clippedTop = span.start.year < year0;
  const clippedBottom = span.end.year + 1 > year1;
  const top = y(Math.max(span.start.year, year0));
  const bottom = y(Math.min(span.end.year + 1, year1));

  // Outline: right edge down, left edge up, with smooth tapers where the width changes.
  const bounds = segs.map((s) => ({ a: y(Math.max(s.a, year0)), b: y(Math.min(s.b, year1)), w: s.w })).filter((s) => s.b > s.a);
  if (!bounds.length) continue;
  bounds[0]!.a = top;
  bounds[bounds.length - 1]!.b = bottom;
  const first = bounds[0]!;
  const last = bounds[bounds.length - 1]!;
  const rTop = clippedTop ? 0 : Math.min(first.w / 2, 70);
  const rBot = clippedBottom ? 0 : Math.min(last.w / 2, 70);
  const edge = (side: 1 | -1) => {
    const parts: string[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const s = bounds[i]!;
      const n = bounds[i + 1]!;
      const T = Math.min(90, (s.b - s.a) / 3, (n.b - n.a) / 3);
      parts.push(`L ${cx + (side * s.w) / 2} ${s.b - T}`);
      parts.push(`C ${cx + (side * s.w) / 2} ${s.b} ${cx + (side * n.w) / 2} ${s.b} ${cx + (side * n.w) / 2} ${s.b + T}`);
    }
    return parts;
  };
  const right = edge(1);
  const leftReversed: string[] = [];
  {
    // Walk the left edge bottom-up by mirroring the same construction.
    for (let i = bounds.length - 2; i >= 0; i--) {
      const s = bounds[i]!;
      const n = bounds[i + 1]!;
      const T = Math.min(90, (s.b - s.a) / 3, (n.b - n.a) / 3);
      leftReversed.push(`L ${cx - n.w / 2} ${s.b + T}`);
      leftReversed.push(`C ${cx - n.w / 2} ${s.b} ${cx - s.w / 2} ${s.b} ${cx - s.w / 2} ${s.b - T}`);
    }
  }
  const d = [
    `M ${cx - first.w / 2 + rTop} ${top}`,
    `L ${cx + first.w / 2 - rTop} ${top}`,
    `Q ${cx + first.w / 2} ${top} ${cx + first.w / 2} ${top + rTop}`,
    ...right,
    `L ${cx + last.w / 2} ${bottom - rBot}`,
    `Q ${cx + last.w / 2} ${bottom} ${cx + last.w / 2 - rBot} ${bottom}`,
    `L ${cx - last.w / 2 + rBot} ${bottom}`,
    `Q ${cx - last.w / 2} ${bottom} ${cx - last.w / 2} ${bottom - rBot}`,
    ...leftReversed,
    `L ${cx - first.w / 2} ${top + rTop}`,
    `Q ${cx - first.w / 2} ${top} ${cx - first.w / 2 + rTop} ${top}`,
    'Z',
  ].join(' ');

  // Feathered ends: uncertain dates fade over their uncertainty; window clips fade over ~25 years.
  const fadeTop = clippedTop ? 300 : span.start.circa ? Math.max(120, (span.start.year - span.start.earliest) * UNITS_PER_YEAR * 2) : 0;
  const fadeBot = clippedBottom ? 300 : span.end.circa ? Math.max(120, (span.end.latest - span.end.year) * UNITS_PER_YEAR * 2) : 0;
  const len = bottom - top;
  const color = laneColor(lane.sphere, lane.prominence);
  const lanePath: PathItem = {
    k: 'path', d, fill: color, multiply: true, ref: lane.id,
    alpha: lane.basis === 'archaeology' ? 0.62 : 1,
    b: [cx - maxW / 2, top, cx + maxW / 2, bottom],
  };
  if (fadeTop || fadeBot) {
    lanePath.grad = { y0: top, y1: bottom, stops: [[0, fadeTop ? 0 : 1], [Math.min(0.45, fadeTop / len), 1], [Math.max(0.55, 1 - fadeBot / len), 1], [1, fadeBot ? 0 : 1]] };
  }
  layers.lanes.push(lanePath);
  if (lane.basis !== 'texts') {
    // Known only from archaeology (or legend): a dashed outline instead of a confident edge.
    layers.lanes.push({ k: 'path', d, stroke: mix(PIGMENTS[lane.sphere]!.hex, INK, 0.3), sw: 1.4, hair: true, dash: [6, 5], alpha: 0.7, b: lanePath.b });
  }
  for (const s of segs.filter((s) => s.style === 'interregnum')) {
    const a = y(s.a), b = y(s.b);
    layers.lanes.push({ k: 'rect', x: cx - s.w / 2, y: a, w: s.w, h: b - a, fill: PAPER, alpha: 0.55, b: [cx - s.w / 2, a, cx + s.w / 2, b] });
  }

  const halfAt = (yy: number) => {
    const s = bounds.find((s) => yy >= s.a && yy <= s.b) ?? (yy < top ? first : last);
    return s.w / 2;
  };
  placed.set(lane.id, { lane, cx, top, bottom, halfAt, maxW, colX, slot: reg.slot });

  // ---- names
  const pigment = PIGMENTS[lane.sphere]!.hex;
  const onLane = luminance(color) < 0.22 ? PAPER : mix(pigment, INK, 0.62);
  let reservedTop = top + (rTop || 40);
  const chars = lane.endonym ? [...lane.endonym.text] : [];
  const sealSize = Math.min(first.w * 0.52, 110);
  const sealH = chars.length * sealSize * 1.08 + sealSize * 0.5;
  if (lane.endonym && /\p{Script=Han}/u.test(lane.endonym.text) && first.w >= 90 && !clippedTop && len > sealH * 2.2) {
    // CJK endonyms stack vertically in a small seal at the head of the lane.
    const size = sealSize;
    const sealW = size * 1.45;
    const sx = cx - sealW / 2, sy = top + Math.max(rTop, 30) + 20;
    layers.marks.push({ k: 'rect', x: sx, y: sy, w: sealW, h: sealH, r: size * 0.12, fill: PAPER, stroke: mix(pigment, INK, 0.2), sw: size * 0.06, alpha: 0.95, ref: lane.id, b: [sx, sy, sx + sealW, sy + sealH] });
    layers.text.push(text({ role: 'endonym', text: chars.join('\n'), size, color: mix(pigment, INK, 0.2), align: 'center', w: sealW, x: sx, y: sy + size * 0.22, ref: lane.id }));
    reservedTop = sy + sealH + 40;
  }

  const segNamed = lane.segments.length > 1;
  const longest = bounds.reduce((m, s, i) => (s.b - s.a > bounds[m]!.b - bounds[m]!.a ? i : m), 0);
  bounds.forEach((s, i) => {
    const seg = segs[i]!;
    const a = Math.max(s.a, i === 0 ? reservedTop : s.a) + 30;
    const b = s.b - 30;
    const room = b - a;
    if (room < 200) return;
    const isMain = i === longest;
    if (lane.prominence === 4) {
      if (!isMain) return;
      // Hairline lanes carry their name beside them, quietly.
      const size = 12;
      const w = Math.min(room, fitWidth({ role: 'whisper', text: lane.name, size, color: INK_SOFT, align: 'left', w: 1 }) + 4);
      layers.text.push(text({ role: 'whisper', text: lane.name, size, color: INK_SOFT, align: 'left', w, x: cx + s.w / 2 + 6, y: a + (room - w) / 2, rot: -90, fade: LANE_NAME_FADE[4], ref: lane.id }));
      return;
    }
    const subName = segNamed && seg.name !== lane.name ? seg.name : undefined;
    if (isMain) {
      let size = Math.min(subName ? s.w * 0.46 : s.w * 0.6, lane.prominence === 1 ? 150 : 110);
      const role = lane.prominence <= 2 ? 'lane-major' : 'lane-minor';
      let w = fitWidth({ role, text: lane.name, size, color: onLane, align: 'center', w: 1 }) + 10;
      if (w > room) { size *= room / w; w = room; }
      const gap = subName ? s.w * 0.07 : 0;
      const subSize = subName ? Math.min(s.w * 0.2, 44) : 0;
      const blockW = size * 1.2 + gap + subSize * 1.2;
      const x = cx - blockW / 2;
      layers.text.push(text({ role, text: lane.name, size, color: onLane, align: 'center', w, x, y: a + (room - w) / 2, rot: -90, fade: LANE_NAME_FADE[lane.prominence], ref: lane.id }));
      if (subName) {
        const sw = Math.min(room, fitWidth({ role: 'segment', text: subName, size: subSize, color: onLane, align: 'center', w: 1 }) + 10);
        layers.text.push(text({ role: 'segment', text: subName, size: subSize, color: onLane, align: 'center', w: sw, x: x + size * 1.2 + gap, y: a + (room - sw) / 2, rot: -90, fade: [0.07, 0.11], alpha: 0.9, ref: lane.id }));
      }
    } else if (subName) {
      const size = Math.min(s.w * 0.5, 54);
      if (size < 14) return;
      const w = Math.min(room, fitWidth({ role: 'segment', text: subName, size, color: onLane, align: 'center', w: 1 }) + 10);
      layers.text.push(text({ role: 'segment', text: subName, size, color: onLane, align: 'center', w, x: cx - size * 0.6, y: a + (room - w) / 2, rot: -90, fade: [0.07, 0.11], alpha: 0.9, ref: lane.id }));
    }
  });
}

// ---------------------------------------------------------------- relations
const ARROW = (x: number, yy: number, dir: 1 | -1, size: number) =>
  `M ${x} ${yy} L ${x - dir * size} ${yy - size * 0.55} L ${x - dir * size} ${yy + size * 0.55} Z`;

for (const p of placed.values()) {
  for (const rel of p.lane.relations) {
    const at = y(parseDate(rel.at).year);
    const targets = (rel.lanes ?? (rel.lane ? [rel.lane] : [])).map((id) => placed.get(id)).filter((t): t is Placed => !!t);
    const color = laneColor(p.lane.sphere, Math.min(3, p.lane.prominence) as Prominence);
    for (const t of targets) {
      if (rel.type === 'conquers' || rel.type === 'influences' || rel.type === 'merges-into') {
        // A thin arrow at the date, edge to edge.
        const dir: 1 | -1 = t.cx > p.cx ? 1 : -1;
        const x1 = p.cx + dir * p.halfAt(at);
        const x2 = t.cx - dir * (t.halfAt(at) + 10);
        const d = rel.type === 'merges-into'
          ? `M ${p.cx} ${Math.min(at, p.bottom) - 40} C ${p.cx} ${at + 40} ${x2 - dir * 120} ${at + 40} ${x2} ${at + 40}`
          : `M ${x1} ${at} L ${x2} ${at}`;
        const yy = rel.type === 'merges-into' ? at + 40 : at;
        const dashed = rel.type === 'influences';
        layers.links.push({ k: 'path', d, stroke: mix(color, INK, 0.25), sw: 2.2, hair: true, dash: dashed ? [5, 5] : undefined, alpha: 0.75, b: [Math.min(x1, x2, p.cx) - 20, at - 60, Math.max(x1, x2, p.cx) + 20, at + 80] });
        layers.links.push({ k: 'path', d: ARROW(x2 + dir * 10, yy, dir, 34), fill: mix(color, INK, 0.25), alpha: 0.85, b: [x2 - 40, yy - 30, x2 + 50, yy + 30] });
      } else {
        // Succession / splits: a soft ribbon from the end of one lane into the start of the next.
        if (Math.abs(t.cx - p.cx) < 1) continue;
        const ya = Math.min(p.bottom, at) - 10;
        const yb = Math.max(t.top, at) + 10;
        const mid = (ya + yb) / 2 + 140;
        const w = Math.max(14, Math.min(p.halfAt(ya), t.halfAt(yb)) * 0.7);
        const d = `M ${p.cx} ${ya - 80} C ${p.cx} ${mid} ${t.cx} ${mid - 140} ${t.cx} ${yb + 80}`;
        layers.links.push({ k: 'path', d, stroke: color, sw: w, alpha: 0.55, multiply: true, b: [Math.min(p.cx, t.cx) - w, ya - 100, Math.max(p.cx, t.cx) + w, yb + 100] } as PathItem);
      }
    }
  }
}

// ---------------------------------------------------------------- event labels (calm by default)
const byColumn = new Map<string, { p: Placed; ev: Lane['events'][number]; yy: number }[]>();
for (const p of placed.values()) {
  for (const ev of p.lane.events) {
    stats.events++;
    if (ev.prominence === 5) { stats.archived++; continue; }
    const d = parseDate(ev.date);
    if (d.year < year0 || d.year > year1) continue;
    const key = `${p.lane.region}:${p.lane.column}`;
    if (!byColumn.has(key)) byColumn.set(key, []);
    byColumn.get(key)!.push({ p, ev, yy: y(d.year) });
  }
}

for (const list of byColumn.values()) {
  list.sort((a, b) => a.yy - b.yy || a.ev.prominence - b.ev.prominence);
  let floor = -Infinity;
  for (const { p, ev, yy } of list) {
    const prom = ev.prominence as Prominence;
    const size = LABEL_SIZE[prom];
    const role = prom === 1 ? 'label-strong' : prom === 4 ? 'whisper' : 'label';
    const color = prom === 4 ? INK_SOFT : INK;
    const labelX = p.cx + WEIGHT_W[6]! / 2 + 60;
    const w = p.colX + p.slot - labelX - 50;
    const pre = formatDate(parseDate(ev.date));
    const m = measure(ck, fonts, { role, text: ev.label, pre, size, color, align: 'left', w });
    let top = yy - m.lineH / 2;
    if (top < floor + size * 0.5) top = floor + size * 0.5;
    const slide = top - (yy - m.lineH / 2);
    if (slide > MAX_SLIDE_YEARS * UNITS_PER_YEAR) {
      // No room near its date: off the canvas, into the Folio (logged so we curate deliberately).
      stats.demoted++;
      console.warn(`  ↓ demoted to archive (no room): ${ev.id}`);
      continue;
    }
    floor = top + m.h;
    stats.drawnEvents++;
    const fade = LABEL_FADE[prom];
    const laneEdge = p.cx + p.halfAt(yy);
    const tick = prom <= 2 ? 26 : 16;
    layers.marks.push({ k: 'line', x1: laneEdge, y1: yy, x2: laneEdge + tick, y2: yy, stroke: INK, sw: prom <= 2 ? 3 : 2, alpha: 0.8, fade, b: [laneEdge, yy - 3, laneEdge + tick, yy + 3] });
    const anchorY = top + m.lineH / 2;
    if (Math.abs(anchorY - yy) > 4) {
      layers.marks.push({ k: 'path', d: `M ${laneEdge + tick} ${yy} C ${labelX - 30} ${yy} ${laneEdge + tick} ${anchorY} ${labelX - 10} ${anchorY}`, stroke: INK_SOFT, sw: 1, hair: true, alpha: 0.6, fade, b: [laneEdge, Math.min(yy, anchorY) - 4, labelX, Math.max(yy, anchorY) + 4] });
    } else {
      layers.marks.push({ k: 'line', x1: laneEdge + tick, y1: yy, x2: labelX - 10, y2: yy, stroke: INK_SOFT, sw: 1, hair: true, alpha: 0.5, fade, b: [laneEdge, yy - 2, labelX, yy + 2] });
    }
    layers.text.push(text({ role, text: ev.label, pre, size, color, align: 'left', w, x: labelX, y: top, fade, ref: ev.id }));
  }
}

// ---------------------------------------------------------------- assemble & write
for (const layer of Object.values(layers)) items.push(...layer);
for (const it of items) if (!it.b) throw new Error(`item without bbox: ${JSON.stringify(it).slice(0, 120)}`);

const dl: DisplayList = {
  version: 1,
  title: `${sheet.title} — ${sheet.subtitle}`,
  width,
  height,
  time: { y0: HEADER, year0, year1, unitsPerYear: UNITS_PER_YEAR },
  regions: sheet.regions.map((r) => ({ ...regionX.get(r.id)!, name: r.name })).map(({ x0, x1, name }) => ({ x0, x1, name })),
  items,
  stats: { ...stats, items: items.length },
};

mkdirSync(join(OUT, 'chart'), { recursive: true });
mkdirSync(join(OUT, 'fonts'), { recursive: true });
mkdirSync(join(OUT, 'canvaskit'), { recursive: true });
writeFileSync(join(OUT, 'chart/proof-east-asia.json'), JSON.stringify(dl));
for (const { file } of FONT_FILES) copyFileSync(join(ROOT, 'assets/fonts', file), join(OUT, 'fonts', file));
copyFileSync(join(ckDir, 'canvaskit.wasm'), join(OUT, 'canvaskit/canvaskit.wasm'));

console.log(`✓ ${dl.title}`);
console.log(`  ${Math.round(width)} × ${Math.round(height)} units · ${items.length} marks · ${stats.lanes} lanes · ${stats.drawnEvents}/${stats.events} events drawn · ${stats.demoted} demoted · ${stats.archived} archived`);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// ---------------------------------------------------------------- lints
function lint() {
  const problems: string[] = [];
  for (const l of lanes) {
    const span = parseSpan(l.span);
    for (const s of l.segments) {
      const ss = parseSpan(s.span);
      if (ss.start.year < span.start.year - 1 || ss.end.year > span.end.year + 1) problems.push(`${l.id}: segment "${s.name}" outside the lane's span`);
    }
    for (const e of l.events) {
      const d = parseDate(e.date);
      if (d.latest < span.start.year - 1 || d.earliest > span.end.year + 1) problems.push(`${l.id}: event ${e.id} (${e.date}) outside ${l.span}`);
    }
    for (const r of l.relations) for (const id of r.lanes ?? (r.lane ? [r.lane] : [])) if (!laneById.has(id)) problems.push(`${l.id}: relation to unknown lane "${id}"`);
    if (!PIGMENTS[l.sphere]) problems.push(`${l.id}: unknown sphere "${l.sphere}"`);
  }
  // Two lanes may not share a column at the same time.
  const cols = new Map<string, Lane[]>();
  for (const l of lanes) cols.set(`${l.region}:${l.column}`, [...(cols.get(`${l.region}:${l.column}`) ?? []), l]);
  for (const [key, ls] of cols) {
    const spans = ls.map((l) => ({ l, s: parseSpan(l.span) })).sort((a, b) => a.s.start.year - b.s.start.year);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]!.s.start.year < spans[i - 1]!.s.end.year) problems.push(`column ${key}: ${spans[i - 1]!.l.id} overlaps ${spans[i]!.l.id}`);
    }
  }
  if (problems.length) {
    console.error('✗ content lint failed:\n' + problems.map((p) => '  ' + p).join('\n'));
    process.exit(1);
  }
}
