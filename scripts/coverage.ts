// Coverage audit (Phase 3 balance): events per era × region against targets, plus likely
// duplicate events (same lane, close dates, overlapping words).
//
//   node scripts/coverage.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { LaneFile, Sheet } from '../packages/core/src/schema.ts';
import { parseDate, parseSpan } from '../packages/core/src/dates.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const sheet = Sheet.parse(YAML.parse(readFileSync(join(ROOT, 'content/sheets/world.yaml'), 'utf8')));
const lanes = walk(join(ROOT, 'content/lanes')).flatMap((f) => LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes);
const targets = YAML.parse(readFileSync(join(ROOT, 'content/coverage.yaml'), 'utf8')) as { eras: Record<string, number>; regions: Record<string, number>; distinct?: [string, string][] };
const distinct = new Set((targets.distinct ?? []).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

const eras = sheet.eras.map((e) => ({ id: e.id, ...parseSpan(e.span) }));
const eraOf = (y: number) => eras.find((e) => y >= e.start.year && y <= e.end.year)?.id ?? '?';
const regions = sheet.regions.map((r) => r.id);
const count: Record<string, Record<string, number>> = {};
for (const l of lanes) for (const ev of l.events) {
  const e = eraOf(parseDate(ev.date).year);
  (count[e] ??= {})[l.region] = (count[e][l.region] ?? 0) + 1;
}
/** Target for a cell: the era's per-region baseline scaled by the region's weight. */
const target = (era: string, region: string) => Math.round((targets.eras[era] ?? 0) * (targets.regions[region] ?? 1));

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
    if (shared / Math.min(wa.size, wb.size) >= 0.5) dupes.push(`  ${l.id}: ${a.id} "${a.label}"  ≈  ${b.id} "${b.label}"`);
  }
}
console.log(`\n${dupes.length} likely duplicates${dupes.length ? ':' : ''}`);
for (const d of dupes) console.log(d);
