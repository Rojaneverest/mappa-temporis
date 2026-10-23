// Font registry shared by the build (measuring) and the renderer (drawing).
// Identical files + identical shaping engine (Skia/HarfBuzz) = labels fit to the pixel everywhere.
import type { CanvasKit, TypefaceFontProvider } from 'canvaskit-wasm';
import type { TextRole } from './displaylist.ts';

export const FONT_FILES: { family: string; file: string }[] = [
  { family: 'Plex Cond', file: 'PlexCond-Regular.ttf' },
  { family: 'Plex Cond', file: 'PlexCond-Italic.ttf' },
  { family: 'Plex Cond', file: 'PlexCond-SemiBold.ttf' },
  { family: 'Cinzel', file: 'Cinzel.ttf' },
  { family: 'Source Serif', file: 'SourceSerif4.ttf' },
  { family: 'Source Serif', file: 'SourceSerif4-Italic.ttf' },
  { family: 'Noto Sans', file: 'NotoSans.ttf' },
  { family: 'Noto Serif TC', file: 'NotoSerifTC.ttf' },
  { family: 'Noto Cuneiform', file: 'NotoSansCuneiform.ttf' },
  { family: 'Noto Hieroglyphs', file: 'NotoSansEgyptianHieroglyphs.ttf' },
  { family: 'Noto Old Persian', file: 'NotoSansOldPersian.ttf' },
  { family: 'Noto Ethiopic', file: 'NotoSansEthiopic.ttf' },
];

/** Every role falls back through these so any script renders. */
const FALLBACK = ['Noto Sans', 'Noto Serif TC', 'Noto Cuneiform', 'Noto Hieroglyphs', 'Noto Old Persian', 'Noto Ethiopic'];

export interface RoleStyle {
  families: string[];
  weight: number;
  italic: boolean;
  /** Letter spacing as a fraction of the font size. */
  tracking: number;
  /** Line height as a multiple of the font size. */
  leading: number;
  /** Variable-font axes (Cinzel, Source Serif are variable). */
  wght?: number;
}

const sans = (weight: number, italic = false, tracking = 0, leading = 1.18): RoleStyle =>
  ({ families: ['Plex Cond', ...FALLBACK], weight, italic, tracking, leading });

export const ROLES: Record<TextRole, RoleStyle> = {
  title: { families: ['Cinzel', ...FALLBACK], weight: 700, italic: false, tracking: 0.06, leading: 1.1, wght: 700 },
  subtitle: { families: ['Source Serif', ...FALLBACK], weight: 400, italic: true, tracking: 0, leading: 1.25 },
  era: { families: ['Cinzel', ...FALLBACK], weight: 600, italic: false, tracking: 0.22, leading: 1, wght: 600 },
  region: { families: ['Cinzel', ...FALLBACK], weight: 600, italic: false, tracking: 0.18, leading: 1, wght: 600 },
  year: sans(400, false, 0.02, 1),
  'lane-major': sans(600, false, 0.01, 1),
  'lane-minor': sans(400, false, 0.01, 1),
  segment: sans(400, true, 0.01, 1),
  endonym: { families: ['Noto Serif TC', ...FALLBACK], weight: 600, italic: false, tracking: 0, leading: 1.02, wght: 600 },
  'label-strong': sans(600, false, 0, 1.12),
  label: sans(400, false, 0, 1.16),
  whisper: sans(400, true, 0, 1.16),
  caption: { families: ['Source Serif', ...FALLBACK], weight: 400, italic: true, tracking: 0, leading: 1.25 },
  specimen: { families: ['Source Serif', ...FALLBACK], weight: 400, italic: false, tracking: 0.02, leading: 1.3 },
};

export function registerFonts(ck: CanvasKit, buffers: Map<string, ArrayBuffer>): TypefaceFontProvider {
  const provider = ck.TypefaceFontProvider.Make();
  for (const { family, file } of FONT_FILES) {
    const buf = buffers.get(file);
    if (!buf) throw new Error(`Font ${file} not loaded`);
    provider.registerFont(buf, family);
  }
  return provider;
}
