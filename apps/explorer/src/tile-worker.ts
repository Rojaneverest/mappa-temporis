// Tile worker: owns a Skia (CanvasKit) instance, the fonts and the display list, and
// renders 'ink' tiles (transparent background) on request.
import CanvasKitModule from 'canvaskit-wasm';
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import Flatbush from 'flatbush';
import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import { FONT_FILES, registerFonts } from '../../../packages/render/src/fonts.ts';
import { Painter } from '../../../packages/render/src/painter.ts';

export type ToWorker =
  | { type: 'init'; chartUrl: string }
  | { type: 'tile'; id: string; x0: number; y0: number; s: number; size: number };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'tile'; id: string; bitmap: ImageBitmap; ms: number; items: number }
  | { type: 'error'; message: string };

// canvaskit-wasm is a CommonJS module whose default export is the init function.
const CanvasKitInit = CanvasKitModule as unknown as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;

let ck: CanvasKit;
let painter: Painter;
let index: Flatbush;
let surface: Surface | null = null;
let surfaceSize = 0;

const post = (msg: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') await init(msg.chartUrl);
    else if (msg.type === 'tile') renderTile(msg);
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.stack ?? err) });
  }
};

async function init(chartUrl: string) {
  const [kit, dl, ...fontBufs] = await Promise.all([
    CanvasKitInit({ locateFile: (f: string) => `/canvaskit/${f}` }),
    fetch(chartUrl).then((r) => r.json() as Promise<DisplayList>),
    ...FONT_FILES.map((f) => fetch(`/fonts/${f.file}`).then((r) => r.arrayBuffer())),
  ]);
  ck = kit;
  const buffers = new Map(FONT_FILES.map((f, i) => [f.file, fontBufs[i]!] as const));
  const fonts = ck.FontCollection.Make();
  fonts.setDefaultFontManager(registerFonts(ck, buffers));
  fonts.enableFontFallback();
  index = new Flatbush(dl.items.length);
  for (const it of dl.items) index.add(it.b![0], it.b![1], it.b![2], it.b![3]);
  index.finish();
  painter = new Painter(ck, fonts, dl);
  post({ type: 'ready' });
}

function renderTile(job: Extract<ToWorker, { type: 'tile' }>) {
  const t0 = performance.now();
  if (!surface || surfaceSize !== job.size) {
    surface?.delete();
    surface = ck.MakeSurface(job.size, job.size);
    surfaceSize = job.size;
  }
  const worldSize = job.size / job.s;
  // Flatbush returns hits in arbitrary order; display-list order is z-order.
  const hits = index.search(job.x0, job.y0, job.x0 + worldSize, job.y0 + worldSize).sort((a, b) => a - b);
  painter.paint(surface!.getCanvas(), { x0: job.x0, y0: job.y0, s: job.s, widthPx: job.size, heightPx: job.size }, hits, { paper: false });
  surface!.flush();
  const snapshot = surface!.makeImageSnapshot();
  const pixels = snapshot.readPixels(0, 0, {
    width: job.size, height: job.size,
    colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB,
  }) as Uint8Array;
  snapshot.delete();
  const data = new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength), job.size, job.size);
  createImageBitmap(data).then((bitmap) => {
    post({ type: 'tile', id: job.id, bitmap, ms: performance.now() - t0, items: hits.length }, [bitmap]);
  });
}
