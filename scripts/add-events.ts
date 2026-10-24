// Append events (or images) to lanes without reformatting the lane files: each item is inserted
// as one flow-style line at the end of its lane's `events:` (or `images:`) list.
//
//   node scripts/add-events.ts batch.yaml            events
//   node scripts/add-events.ts --images batch.yaml   images
//
// batch.yaml maps lane ids to item lists:  { ottoman: [ { id, date, label, prominence, sources, … } ] }
// Every item is checked against the schema first; ids must be new.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';
import { Event, LaneFile, LaneImage } from '../packages/core/src/schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const IMAGES = process.argv.includes('--images');
const KEY = IMAGES ? 'images' : 'events';
const file = process.argv.slice(2).find((a) => !a.startsWith('--'))!;
type Item = z.infer<typeof Event> | z.infer<typeof LaneImage>;
const batch: Record<string, Item[]> = z.record(z.string(), z.array(IMAGES ? LaneImage : Event).nullable().transform((v) => v ?? [])).parse(YAML.parse(readFileSync(file, 'utf8')));

const files = walk(join(ROOT, 'content/lanes'));
const fileOf = new Map<string, string>();
const ids = new Set<string>();
for (const f of files) {
  for (const l of LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes) {
    fileOf.set(l.id, f);
    for (const e of [...l.events, ...l.images]) ids.add(e.id);
  }
}

/** One image as a flow mapping, keys in the house order, defaults left out. */
function imageLine(i: z.infer<typeof LaneImage>): string {
  const parts = [`id: ${i.id}`, `source: ${JSON.stringify(i.source)}`, `date: ${i.date}`, `prominence: ${i.prominence}`, `treatment: ${i.treatment}`, `caption: ${JSON.stringify(i.caption)}`];
  if (!i.ofItsTime) parts.push('ofItsTime: false');
  return `      - { ${parts.join(', ')} }`;
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
  if (e.people.length) parts.push(`people: [${e.people.join(', ')}]`);
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
  const keyRe = new RegExp(`^    ${KEY}:`);
  let ev = lines.findIndex((l, i) => i > start && i < end && keyRe.test(l));
  if (ev === -1) {
    // No events yet: open the list just before the lane's sources (or at the end of the block).
    let at = lines.findIndex((l, i) => i > start && i < end && /^    sources:/.test(l));
    if (at === -1) { at = end; while (at > start && lines[at - 1]!.trim() === '') at--; }
    lines.splice(at, 0, `    ${KEY}:`);
    ev = at;
    end++;
  } else if (lines[ev] === `    ${KEY}: []`) lines[ev] = `    ${KEY}:`;
  let last = ev;
  // Walk past every item of the list, flow (one line) or block (an indented continuation).
  while (last + 1 < end && /^(      - |        \S)/.test(lines[last + 1]!)) last++;
  lines.splice(last + 1, 0, ...events.map((x) => (IMAGES ? imageLine(x as z.infer<typeof LaneImage>) : line(x as z.infer<typeof Event>))));
  writeFileSync(file, lines.join('\n'));
  added += events.length;
}
console.log(`added ${added} ${KEY} to ${Object.keys(batch).length} lanes`);
