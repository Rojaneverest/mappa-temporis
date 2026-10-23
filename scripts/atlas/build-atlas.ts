// Atlas data for a sheet: Cliopatria polity borders (Seshat, CC BY 4.0) within the sheet's
// window, simplified, linked to our lanes, plus Natural Earth land — as one small TopoJSON.
//
//   node scripts/atlas/build-atlas.ts [sheetId]
//
// Expects .cache/datasets/cliopatria/cliopatria_polities_only_v021.geojson (see docs).
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { LaneFile, Sheet, type Lane } from '../../packages/core/src/schema.ts';
import { parseSpan } from '../../packages/core/src/dates.ts';
import { laneColor } from '../../packages/core/src/palette.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SHEET_ID = process.argv[2] ?? 'classical-world';
const CACHE = join(ROOT, '.cache/atlas');
const CLIO = join(ROOT, '.cache/datasets/cliopatria/cliopatria_polities_only_v021.geojson');
const LAND = join(ROOT, '.cache/datasets/natural-earth/ne_110m_land.geojson');
const OUT = join(ROOT, 'apps/explorer/public/atlas');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : [];
});
const sheet = Sheet.parse(YAML.parse(readFileSync(join(ROOT, `content/sheets/${SHEET_ID}.yaml`), 'utf8')));
const regions = new Set(sheet.regions.map((r) => r.id));
const lanes: Lane[] = walk(join(ROOT, 'content/lanes'))
  .flatMap((f) => LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes)
  .filter((l) => regions.has(l.region) && l.prominence <= 4);
const win = parseSpan(sheet.window);

// ---- matching Cliopatria names to lanes: hand-picked names first, then an exact name, then Wikidata.
const lower = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
const byOverride = new Map<string, Lane>();
for (const l of lanes) for (const n of l.cliopatria) byOverride.set(lower(n), l);
const byQid = new Map(lanes.filter((l) => l.wikidata).map((l) => [l.wikidata!, l]));
const byName = new Map(lanes.map((l) => [lower(l.name), l]));

interface Feature { type: 'Feature'; properties: Record<string, string | number>; geometry: unknown }
const clio = JSON.parse(readFileSync(CLIO, 'utf8')) as { features: Feature[] };
const matched = new Map<string, Set<string>>();
const features: Feature[] = [];
for (const f of clio.features) {
  const p = f.properties as { Name: string; FromYear: number; ToYear: number; Wikidata: string };
  if (p.ToYear < win.start.year || p.FromYear > win.end.year) continue;
  // Exact names beat Wikidata IDs: Cliopatria tags its "Roman Empire" with Byzantium's QID (Q12544).
  const lane = byOverride.get(lower(p.Name)) ?? byName.get(lower(p.Name)) ?? byQid.get(p.Wikidata);
  if (lane) {
    if (!matched.has(lane.id)) matched.set(lane.id, new Set());
    matched.get(lane.id)!.add(p.Name);
  }
  // Compact properties: name, from, to, lane, colour.
  features.push({
    type: 'Feature', geometry: f.geometry,
    properties: { n: p.Name, f: p.FromYear, t: p.ToYear, ...(lane ? { l: lane.id, c: laneColor(lane.sphere, Math.min(3, lane.prominence) as 1 | 2 | 3) } : {}) },
  });
}
writeFileSync(join(CACHE, `${SHEET_ID}-polities.geojson`), JSON.stringify({ type: 'FeatureCollection', features }));

// ---- simplify + quantise into one TopoJSON with two objects: polities and land
const out = join(OUT, `${SHEET_ID}.topo.json`);
execFileSync('npx', ['mapshaper',
  '-i', join(CACHE, `${SHEET_ID}-polities.geojson`), LAND, 'combine-files',
  '-rename-layers', 'polities,land',
  // Thousands of shapes on the world sheet: simplify harder so the inset map stays light.
  '-simplify', features.length > 5000 ? '2.5%' : '7%', 'keep-shapes', 'target=*',
  '-o', 'format=topojson', 'quantization=20000', 'target=*', out,
], { stdio: 'pipe', cwd: ROOT });

const size = statSync(out).size;
console.log(`✓ atlas ${SHEET_ID}: ${features.length} shapes, ${matched.size}/${lanes.length} lanes linked, ${(size / 1024).toFixed(0)} KB`);
const unmatched = lanes.filter((l) => !matched.has(l.id) && parseSpan(l.span).end.year >= win.start.year && parseSpan(l.span).start.year <= win.end.year);
if (process.env.VERBOSE) console.log('  not linked:', unmatched.map((l) => l.id).join(', '));
