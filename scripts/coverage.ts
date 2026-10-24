// Coverage audit (Phase 3 balance): events per era × region against targets, plus likely
// duplicate events (same lane, close dates, overlapping words).
//
//   node scripts/coverage.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { DailyFile, LaneFile, PeopleFile, Sheet, VoicesFile } from '../packages/core/src/schema.ts';
import { parseDate, parseSpan } from '../packages/core/src/dates.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const sheet = Sheet.parse(YAML.parse(readFileSync(join(ROOT, 'content/sheets/world.yaml'), 'utf8')));
const lanes = walk(join(ROOT, 'content/lanes')).flatMap((f) => LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes);
const targets = YAML.parse(readFileSync(join(ROOT, 'content/coverage.yaml'), 'utf8')) as { eras: Record<string, number>; regions: Record<string, number>; distinct?: [string, string][]; overrides?: Record<string, number> };
const distinct = new Set((targets.distinct ?? []).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

const eras = sheet.eras.map((e) => ({ id: e.id, ...parseSpan(e.span) }));
const eraOf = (y: number) => eras.find((e) => y >= e.start.year && y <= e.end.year)?.id ?? '?';
const regions = sheet.regions.map((r) => r.id);
const count: Record<string, Record<string, number>> = {};
for (const l of lanes) for (const ev of l.events) {
  const e = eraOf(parseDate(ev.date).year);
  (count[e] ??= {})[l.region] = (count[e][l.region] ?? 0) + 1;
}
/** Target for a cell: the era's per-region baseline scaled by the region's weight, unless overridden. */
const target = (era: string, region: string) => targets.overrides?.[`${region}/${era}`] ?? Math.round((targets.eras[era] ?? 0) * (targets.regions[region] ?? 1));

const col = (s: string | number, w = 9) => String(s).padStart(w);
console.log('events / target'.padEnd(14) + regions.map((r) => col(r.slice(0, 8))).join('') + col('total', 8));
let short = 0;
for (const e of eras) {
  const cells = regions.map((r) => {
    const n = count[e.id]?.[r] ?? 0, t = target(e.id, r);
    if (n < t) short += t - n;
    return col(`${n < t ? '!' : ''}${n}/${t}`);
  });
  console.log(e.id.padEnd(14) + cells.join('') + col(Object.values(count[e.id] ?? {}).reduce((a, b) => a + b, 0), 8));
}
console.log(`\n${short} events short of target ('!' marks a cell below it)`);

// ---- people, voices, daily life and coins per region
const regionOf = new Map(lanes.map((l) => [l.id, l.region]));
const people = readdirSync(join(ROOT, 'content/people')).filter((f) => f.endsWith('.yaml')).flatMap((f) => PeopleFile.parse(YAML.parse(readFileSync(join(ROOT, 'content/people', f), 'utf8'))).people);
const voices = VoicesFile.parse(YAML.parse(readFileSync(join(ROOT, 'content/voices.yaml'), 'utf8'))).voices;
const cards = DailyFile.parse(YAML.parse(readFileSync(join(ROOT, 'content/daily-life.yaml'), 'utf8'))).cards;
const coins = lanes.flatMap((l) => l.images.filter((i) => i.treatment === 'coin').map(() => l.id));
const per = (ids: string[]) => regions.map((r) => col(ids.filter((id) => regionOf.get(id) === r).length)).join('');
console.log('\n' + ''.padEnd(14) + regions.map((r) => col(r.slice(0, 8))).join('') + col('total', 8));
console.log('people'.padEnd(14) + per(people.map((p) => p.lane)) + col(people.length, 8));
console.log('voices'.padEnd(14) + per(voices.map((v) => v.lane)) + col(voices.length, 8));
console.log('daily life'.padEnd(14) + per(cards.map((c) => c.lane)) + col(cards.length, 8));
console.log('coins'.padEnd(14) + per(coins) + col(coins.length, 8));

// ---- likely duplicates
const STOP = new Set('the a an of and in to on at by for from with its his her their as is are into first last'.split(' '));
const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const dupes: string[] = [];
for (const l of lanes) {
  for (let i = 0; i < l.events.length; i++) for (let j = i + 1; j < l.events.length; j++) {
    const a = l.events[i]!, b = l.events[j]!;
    if (Math.abs(parseDate(a.date).year - parseDate(b.date).year) > 10 || distinct.has(`${a.id}|${b.id}`)) continue;
    const wa = words(a.label), wb = words(b.label);
    const shared = [...wa].filter((w) => wb.has(w)).length;
    const close = Math.abs(parseDate(a.date).year - parseDate(b.date).year) <= 2;
    if (shared / Math.min(wa.size, wb.size) >= (close ? 0.34 : 0.5)) dupes.push(`  ${l.id}: ${a.id} "${a.label}"  ≈  ${b.id} "${b.label}"`);
  }
}
// Across lanes of one region: the same story told twice (same or adjacent year, most words shared).
const byRegion = new Map<string, { lane: string; ev: (typeof lanes)[number]['events'][number] }[]>();
for (const l of lanes) for (const ev of l.events) (byRegion.get(l.region) ?? byRegion.set(l.region, []).get(l.region)!).push({ lane: l.id, ev });
for (const list of byRegion.values()) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]!, b = list[j]!;
    if (a.lane === b.lane || Math.abs(parseDate(a.ev.date).year - parseDate(b.ev.date).year) > 2 || distinct.has(`${a.ev.id}|${b.ev.id}`)) continue;
    const wa = words(a.ev.label), wb = words(b.ev.label);
    const shared = [...wa].filter((w) => wb.has(w)).length;
    if (shared / Math.min(wa.size, wb.size) >= 0.6) dupes.push(`  ${a.lane}/${b.lane}: ${a.ev.id} "${a.ev.label}"  ≈  ${b.ev.id} "${b.ev.label}"`);
  }
}
console.log(`\n${dupes.length} likely duplicates${dupes.length ? ':' : ''}`);
for (const d of dupes) console.log(d);
