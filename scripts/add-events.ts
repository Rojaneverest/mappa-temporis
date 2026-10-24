// Append events to lanes without reformatting the lane files: each event is inserted as one
// flow-style line at the end of its lane's `events:` list.
//
//   node scripts/add-events.ts batch.yaml
//
// batch.yaml maps lane ids to event lists:  { ottoman: [ { id, date, label, prominence, sources, … } ] }
// Every event is checked against the schema first; ids must be new.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { Event, LaneFile } from '../packages/core/src/schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const batch = z.record(z.string(), z.array(Event).nullable().transform((v) => v ?? [])).parse(YAML.parse(readFileSync(process.argv[2]!, 'utf8')));

const files = walk(join(ROOT, 'content/lanes'));
const fileOf = new Map<string, string>();
const ids = new Set<string>();
for (const f of files) {
  for (const l of LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes) {
    fileOf.set(l.id, f);
    for (const e of l.events) ids.add(e.id);
  }
}

/** One event as a flow mapping, keys in the house order, defaults left out. */
function line(e: z.infer<typeof Event>): string {
  const q = (s: string) => (/^[\w .,'()–-]+$/.test(s) && !/^\d/.test(s) && !s.includes(': ') ? s : JSON.stringify(s));
  const parts = [`id: ${e.id}`, `date: ${e.date}`, `label: ${JSON.stringify(e.label)}`, `prominence: ${e.prominence}`];
  if (e.themes.length) parts.push(`themes: [${e.themes.join(', ')}]`);
  if (e.confidence !== 'attested') parts.push(`confidence: ${e.confidence}`);
  if (e.thread) parts.push(`thread: ${e.thread}`);
  parts.push(`sources: [${e.sources.join(', ')}]`);
  if (e.note) parts.push(`note: ${q(e.note)}`);
  return `      - { ${parts.join(', ')} }`;
}

// Check the whole batch before touching any file.
const problems: string[] = [];
for (const [laneId, events] of Object.entries(batch)) {
  if (!fileOf.has(laneId)) problems.push(`no lane ${laneId}`);
  for (const e of events) {
    if (ids.has(e.id)) problems.push(`duplicate event id ${e.id}`);
    ids.add(e.id);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

let added = 0;
for (const [laneId, events] of Object.entries(batch)) {
  const file = fileOf.get(laneId)!;
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l === `  - id: ${laneId}`);
  let end = lines.findIndex((l, i) => i > start && /^  - id: /.test(l));
  if (end === -1) end = lines.length;
  let ev = lines.findIndex((l, i) => i > start && i < end && /^    events:/.test(l));
  if (ev === -1) {
    // No events yet: open the list just before the lane's sources (or at the end of the block).
    let at = lines.findIndex((l, i) => i > start && i < end && /^    sources:/.test(l));
    if (at === -1) { at = end; while (at > start && lines[at - 1]!.trim() === '') at--; }
    lines.splice(at, 0, '    events:');
    ev = at;
    end++;
  } else if (/^    events: \[\]/.test(lines[ev]!)) lines[ev] = '    events:';
  let last = ev;
  while (last + 1 < end && /^      - /.test(lines[last + 1]!)) last++;
  lines.splice(last + 1, 0, ...events.map(line));
  writeFileSync(file, lines.join('\n'));
  added += events.length;
}
console.log(`added ${added} events to ${Object.keys(batch).length} lanes`);
