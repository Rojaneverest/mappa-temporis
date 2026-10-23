// Image pipeline: content → museum/Commons metadata + originals → cut-outs → web-ready sizes.
//
//   node scripts/images/pipeline.ts            process anything new
//   node scripts/images/pipeline.ts --force    redo everything
//
// Stages are cached in .cache/images so re-runs are cheap. Output goes to
// apps/explorer/public/img/<id>/<size>.webp plus manifest.json (credits included).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import sharp from 'sharp';
import { LaneFile, Sheet, type LaneImage } from '../../packages/core/src/schema.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, '.cache/images');
const OUT = join(ROOT, 'apps/explorer/public/img');
const CUTOUT = join(ROOT, 'tools/bin/cutout');
const FORCE = process.argv.includes('--force');
const UA = 'MappaTemporis/0.1 (personal, non-commercial history chart)';
/** Longest-side sizes in the pyramid; each image gets the ones it can fill. */
const SIZES = [128, 256, 512, 1024, 2048];

export interface ImageMeta {
  id: string;
  source: string;
  title: string;
  date: string;
  culture: string;
  credit: string;
  license: string;
  url: string;
  downloadUrl: string;
}

export interface ManifestEntry extends ImageMeta {
  treatment: LaneImage['treatment'];
  /** Final pixel size of the largest variant (aspect ratio source of truth). */
  width: number;
  height: number;
  sizes: number[];
}

for (const d of ['raw', 'meta', 'cut']) mkdirSync(join(CACHE, d), { recursive: true });
mkdirSync(OUT, { recursive: true });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith('.yaml') ? [p] : [];
  });
}

const images: LaneImage[] = walk(join(ROOT, 'content/lanes')).flatMap((f) => LaneFile.parse(YAML.parse(readFileSync(f, 'utf8'))).lanes.flatMap((l) => l.images));
// Era maps live on the sheets.
for (const f of walk(join(ROOT, 'content/sheets'))) for (const era of Sheet.parse(YAML.parse(readFileSync(f, 'utf8'))).eras) if (era.map && !images.some((i) => i.id === era.map!.id)) images.push(era.map);
const manifestPath = join(OUT, 'manifest.json');
const manifest: Record<string, ManifestEntry> = existsSync(manifestPath) && !FORCE ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/** Commons ObjectName often carries Wikidata label soup ("X title QS:P1476,…"); keep the plain name. */
/** Commons ObjectName often trails Wikidata label dumps ('… label QS:Len,"Earthrise" …'): prefer the English label. */
const cleanTitle = (s: string) => s.match(/label QS:Len,"([^"]+)"/)?.[1]?.trim() ?? s.split(/\s*(?:title|label) QS:/)[0]!.trim();
/** Commons sometimes repeats the artist text ("Unknown authorUnknown author"). */
const dedupe = (s: string) => {
  const h = s.length / 2;
  return Number.isInteger(h) && s.slice(0, h) === s.slice(h) ? s.slice(0, h) : s;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polite JSON fetch: museum APIs throttle bursts (the Met answers with an HTML challenge page). */
async function getJson(url: string) {
  for (let attempt = 1; ; attempt++) {
    await sleep(url.includes('metmuseum') ? 600 : 150);
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const type = r.headers.get('content-type') ?? '';
    if (r.ok && type.includes('json')) return r.json();
    if (attempt >= 5) throw new Error(`${r.status} ${type} ${url}`);
    console.warn(`  … throttled (${r.status}), retrying in ${attempt * 8}s`);
    await sleep(attempt * 8000);
  }
}

async function resolve(img: LaneImage): Promise<ImageMeta> {
  const metaPath = join(CACHE, 'meta', `${img.id}.json`);
  if (existsSync(metaPath) && !FORCE) return JSON.parse(readFileSync(metaPath, 'utf8'));
  let meta: ImageMeta;
  if (img.source.startsWith('met:')) {
    const id = img.source.slice(4);
    const o = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    if (!o.primaryImage) throw new Error(`Met ${id} has no open-access image`);
    meta = {
      id: img.id, source: img.source, title: o.title, date: o.objectDate, culture: o.period || o.culture || o.dynasty || '',
      credit: `The Metropolitan Museum of Art, ${o.creditLine}`, license: o.isPublicDomain ? 'CC0 (Met Open Access)' : 'Met (restricted)',
      url: o.objectURL, downloadUrl: o.primaryImage,
    };
  } else {
    const file = img.source.slice('commons:'.length);
    const q = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=3000&titles=${encodeURIComponent(file)}`);
    const page = Object.values(q.query.pages)[0] as { imageinfo?: { thumburl?: string; url: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] };
    const info = page.imageinfo?.[0];
    if (!info) throw new Error(`Commons file not found: ${file}`);
    const em = info.extmetadata;
    meta = {
      id: img.id, source: img.source, title: cleanTitle(stripHtml(em.ObjectName?.value)) || file.replace(/^File:|\.\w+$/g, ''),
      date: stripHtml(em.DateTimeOriginal?.value), culture: '',
      credit: `${dedupe(stripHtml(em.Artist?.value)) || 'Unknown'} / Wikimedia Commons`, license: stripHtml(em.LicenseShortName?.value) || 'see source',
      url: info.descriptionurl, downloadUrl: info.thumburl ?? info.url,
    };
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

async function download(meta: ImageMeta): Promise<string> {
  const path = join(CACHE, 'raw', `${meta.id}.img`);
  if (existsSync(path + '.jpg') && !FORCE) return path + '.jpg';
  // Originals are throttled hardest; a standard-width Commons thumbnail is plenty for the chart.
  const thumb = meta.downloadUrl.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w)\/(\w\w)\/([^?]+)/);
  let url = meta.downloadUrl;
  let r = await fetch(url, { headers: { 'User-Agent': UA } });
  for (let attempt = 1; r.status === 429 && attempt <= 5; attempt++) {
    if (thumb && attempt === 1) {
      const [, base, a, ab, name] = thumb;
      url = `${base}/thumb/${a}/${ab}/${name}/1920px-${name}${/\.tiff?$/i.test(name!) ? '.jpg' : ''}`;
      console.warn('  … original throttled, using the 1920px thumbnail');
    } else console.warn(`  … download throttled, retrying in ${attempt * 15}s`);
    await sleep(attempt * 15000);
    r = await fetch(url, { headers: { 'User-Agent': UA } });
  }
  if (!r.ok) throw new Error(`${r.status} downloading ${meta.downloadUrl}`);
  // Normalise everything to a PNG/JPEG the Vision tool can read.
  const buf = Buffer.from(await r.arrayBuffer());
  await sharp(buf).rotate().jpeg({ quality: 95 }).toFile(path + '.jpg');
  writeFileSync(path, ''); // marker
  return path + '.jpg';
}

/** Lift the subject and give it a soft contact shadow, as if the object sits on the paper. */
/** The subject alone, on transparency (cached). */
function liftPath(img: LaneImage, rawPath: string): string {
  const cutPath = join(CACHE, 'cut', `${img.id}.png`);
  if (!existsSync(cutPath) || FORCE) execFileSync(CUTOUT, [rawPath, cutPath], { stdio: 'pipe' });
  return cutPath;
}

async function cutout(img: LaneImage, rawPath: string): Promise<Buffer> {
  const cutPath = join(CACHE, 'cut', `${img.id}.png`);
  if (!existsSync(cutPath) || FORCE) execFileSync(CUTOUT, [rawPath, cutPath], { stdio: 'pipe' });
  const subject = sharp(cutPath).ensureAlpha();
  const { width = 1, height = 1 } = await subject.metadata();
  const long = Math.max(width, height);
  const blur = Math.max(2, long * 0.018);
  const off = { x: Math.round(long * 0.012), y: Math.round(long * 0.022) };
  const pad = Math.ceil(blur * 3 + Math.max(off.x, off.y));
  const alpha = await sharp(cutPath).ensureAlpha().extractChannel('alpha').toBuffer();
  // Shadow: the subject's silhouette, darkened, blurred, offset down-right.
  const shadow = await sharp({ create: { width, height, channels: 3, background: { r: 52, g: 38, b: 24 } } })
    .joinChannel(await sharp(alpha).linear(0.38, 0).toBuffer())
    .png().toBuffer();
  const canvasW = width + pad * 2, canvasH = height + pad * 2;
  const shadowLayer = await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, left: pad + off.x, top: pad + off.y }])
    .png().toBuffer();
  const blurred = await sharp(shadowLayer).blur(blur).png().toBuffer();
  return sharp(blurred).composite([{ input: await subject.png().toBuffer(), left: pad, top: pad }]).png().toBuffer();
}

/** Backdrops are printed into the paper: darkness becomes sepia ink, light becomes transparent —
 *  the same as multiplying the map onto whatever paper (and era tint) lies beneath. */
async function inkPrint(rawPath: string, invert: boolean): Promise<Buffer> {
  const { data, info } = await sharp(rawPath).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).grayscale().normalise({ lower: 2, upper: 96 }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    out[i * 4] = 58; out[i * 4 + 1] = 40; out[i * 4 + 2] = 24;
    const v = data[i * info.channels]!;
    out[i * 4 + 3] = invert ? v : 255 - v;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

let done = 0;
for (const m of Object.values(manifest)) { m.credit = m.credit.replace(/^(.+?)\1 \//, '$1 /'); m.title = cleanTitle(m.title); }
for (const img of images) {
  if (manifest[img.id] && !FORCE) continue;
  try {
    const meta = await resolve(img);
    const rawPath = await download(meta);
    let buf = img.treatment === 'cutout' ? await cutout(img, rawPath)
      : img.treatment === 'backdrop' ? await inkPrint(img.lift ? liftPath(img, rawPath) : rawPath, img.invert)
      : await sharp(rawPath).png().toBuffer();
    // Cap the master at 2048 on the long side.
    buf = await sharp(buf).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const { width = 1, height = 1 } = await sharp(buf).metadata();
    const long = Math.max(width, height);
    const sizes = SIZES.filter((s) => s <= long);
    if (!sizes.length || sizes.at(-1)! < long) sizes.push(long);
    mkdirSync(join(OUT, img.id), { recursive: true });
    for (const size of sizes) {
      await sharp(buf).resize({ width: size, height: size, fit: 'inside' })
        .webp({ quality: 84, alphaQuality: 90, effort: 5 }).toFile(join(OUT, img.id, `${size}.webp`));
    }
    manifest[img.id] = { ...meta, treatment: img.treatment, width, height, sizes };
    done++;
    console.log(`✓ ${img.id}  ${width}×${height}  ${meta.license}  — ${meta.title}`);
  } catch (err) {
    console.error(`✗ ${img.id}: ${(err as Error).message}`);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Human-readable credits, kept in the repo so attribution never depends on a build.
const rows = Object.values(manifest).sort((a, b) => a.id.localeCompare(b.id))
  .map((m) => `| ${m.id} | [${m.title.replace(/\|/g, '/')}](${m.url}) | ${m.credit.replace(/\|/g, '/')} | ${m.license} |`);
writeFileSync(join(ROOT, 'docs/CREDITS.md'), [
  '# Image credits',
  '',
  'Generated by `scripts/images/pipeline.ts` — do not edit by hand.',
  '',
  '| Id | Work | Credit | License |',
  '|---|---|---|---|',
  ...rows,
  '',
].join('\n'));
console.log(`${done} processed, ${Object.keys(manifest).length} in manifest`);
