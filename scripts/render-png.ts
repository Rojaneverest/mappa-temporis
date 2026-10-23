// Render a view of the display list to PNG with the same painter the browser uses.
// Usage: node scripts/render-png.ts <out.png> [scale] [x0 y0 widthPx heightPx]
//   With only a scale, renders the whole sheet at that scale.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { CanvasKit } from 'canvaskit-wasm';
import type { DisplayList } from '../packages/render/src/displaylist.ts';
import { FONT_FILES, registerFonts } from '../packages/render/src/fonts.ts';
import { Painter, type ImageStore } from '../packages/render/src/painter.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const [out = 'proof.png', scaleArg, ...rest] = process.argv.slice(2);

const dl: DisplayList = JSON.parse(readFileSync(join(ROOT, 'apps/explorer/public/chart/proof-east-asia.json'), 'utf8'));
const CanvasKitInit = require('canvaskit-wasm/bin/canvaskit.js');
const ckDir = dirname(require.resolve('canvaskit-wasm/bin/canvaskit.wasm'));
const ck: CanvasKit = await CanvasKitInit({ locateFile: (f: string) => join(ckDir, f) });
const buffers = new Map<string, ArrayBuffer>();
for (const { file } of FONT_FILES) {
  const b = readFileSync(join(ROOT, 'assets/fonts', file));
  buffers.set(file, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const fonts = ck.FontCollection.Make();
fonts.setDefaultFontManager(registerFonts(ck, buffers));
fonts.enableFontFallback();

const s = Number(scaleArg ?? 1600 / dl.width);
const [x0 = 0, y0 = 0, wPx = Math.ceil(dl.width * s), hPx = Math.ceil(dl.height * s)] = rest.map(Number);
const surface = ck.MakeSurface(wPx, hPx)!;
// Load every image size from the web build (fine for local renders).
const images: ImageStore = new Map();
for (const it of dl.items) {
  if (it.k !== 'image') continue;
  for (const z of it.sizes) {
    const bytes = readFileSync(join(ROOT, 'apps/explorer/public/img', it.id, `${z}.webp`));
    const img = ck.MakeImageFromEncoded(bytes);
    if (img) images.set(`${it.id}/${z}`, img);
  }
}
const painter = new Painter(ck, fonts, dl, images);
const x1 = x0 + wPx / s, y1 = y0 + hPx / s;
const visible = dl.items.map((it, i) => [it, i] as const).filter(([it]) => it.b![2] >= x0 && it.b![0] <= x1 && it.b![3] >= y0 && it.b![1] <= y1).map(([, i]) => i);
// Paint a few times: the first pass builds paragraph/path caches, later passes show steady-state cost.
const times: number[] = [];
for (let r = 0; r < (process.env.BENCH ? 5 : 1); r++) {
  const t0 = performance.now();
  painter.paint(surface.getCanvas(), { x0, y0, s, widthPx: wPx, heightPx: hPx }, visible, { paper: !process.env.TRANSPARENT });
  surface.flush();
  times.push(performance.now() - t0);
}
const ms = times.at(-1)!;
if (process.env.BENCH) console.log('passes (ms):', times.map((t) => t.toFixed(1)).join(' '));
const png = surface.makeImageSnapshot().encodeToBytes()!;
writeFileSync(out, png);
console.log(`${out}: ${wPx}×${hPx}px at scale ${s.toFixed(4)}, ${visible.length} items, ${ms.toFixed(0)} ms`);
