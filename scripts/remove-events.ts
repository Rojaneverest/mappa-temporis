// Remove events by id from the lane files (flow or block style), leaving the rest untouched.
//   node scripts/remove-events.ts id1 id2 …
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : []; });
const ids = new Set(process.argv.slice(2));
const found = new Set<string>();
for (const file of walk(join(ROOT, 'content/lanes'))) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const flow = lines[i]!.match(/^      - \{ id: ([a-z0-9-]+),/);
    if (flow && ids.has(flow[1]!)) { found.add(flow[1]!); continue; }
    const block = lines[i]!.match(/^      - id: ([a-z0-9-]+)$/);
    if (block && ids.has(block[1]!)) {
      found.add(block[1]!);
      while (i + 1 < lines.length && /^        \S/.test(lines[i + 1]!)) i++;
      continue;
    }
    out.push(lines[i]!);
  }
  if (out.length !== lines.length) writeFileSync(file, out.join('\n'));
}
const missing = [...ids].filter((id) => !found.has(id));
console.log(`removed ${found.size}${missing.length ? `; not found: ${missing.join(', ')}` : ''}`);
