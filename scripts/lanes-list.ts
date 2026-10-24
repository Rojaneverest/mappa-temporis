// List lanes (id · span · prominence · event count) for a region, optionally limited to a year window.
//   node scripts/lanes-list.ts <region> [fromYear] [toYear]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { LaneFile } from '../packages/core/src/schema.ts';
import { parseSpan } from '../packages/core/src/dates.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const [region, from = '-99999', to = '99999'] = process.argv.slice(2);
for (const f of walk(join(ROOT, 'content/lanes'))) {
  for (const l of LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes) {
    const sp = parseSpan(l.span);
    if (l.region !== region || sp.end.year < +from || sp.start.year > +to) continue;
    console.log(`${relative(ROOT, f)}  ${l.id.padEnd(28)} P${l.prominence}  ${l.span.padEnd(26)} ${l.events.length} events`);
  }
}
