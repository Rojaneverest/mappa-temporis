// List existing events for a region within a year window, grouped by lane (for writing new ones
// without duplicating).   node scripts/events-list.ts <region> <fromYear> <toYear>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { LaneFile } from '../packages/core/src/schema.ts';
import { parseDate, parseSpan } from '../packages/core/src/dates.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const [region, from, to] = process.argv.slice(2) as [string, string, string];
for (const f of walk(join(ROOT, 'content/lanes'))) {
  for (const l of LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes) {
    const sp = parseSpan(l.span);
    if (l.region !== region || sp.end.year < +from || sp.start.year > +to) continue;
    const evs = l.events.filter((e) => { const y = parseDate(e.date).year; return y >= +from && y <= +to; });
    console.log(`${l.id} (${l.span}, P${l.prominence})`);
    for (const e of evs) console.log(`    ${e.date} · ${e.label}`);
  }
}
