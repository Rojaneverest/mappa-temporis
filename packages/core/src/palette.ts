// Colour system: every cultural sphere is a historical pigment (docs/PLAN.md §4).
// Prominence controls how strongly the pigment is laid on the paper.
import type { Prominence } from './schema.ts';

export const PAPER = '#EFE6D2';
export const INK = '#2B2420';
export const INK_SOFT = '#6B5F55';

export const PIGMENTS: Record<string, { name: string; hex: string }> = {
  'north-american': { name: 'Hopewell copper', hex: '#B06C3E' },
  mesoamerican: { name: 'Maya blue', hex: '#3B92AD' },
  andean: { name: 'Cochineal', hex: '#9C2541' },
  african: { name: 'Red ochre', hex: '#9A4632' },
  'celtic-germanic': { name: 'Woad', hex: '#56748F' },
  roman: { name: 'Tyrian purple', hex: '#6C2D5F' },
  hellenic: { name: 'Egyptian blue', hex: '#3D78BE' },
  egyptian: { name: 'Orpiment', hex: '#E0B83A' },
  persian: { name: 'Lapis lazuli', hex: '#2E4B96' },
  islamic: { name: 'Malachite', hex: '#2E8A5C' },
  steppe: { name: 'Scythian gold', hex: '#A88432' },
  indic: { name: 'Saffron', hex: '#DD7F2E' },
  sinic: { name: 'Cinnabar', hex: '#B8392D' },
  'korean-japanese': { name: 'Indigo', hex: '#34476F' },
  'southeast-asian': { name: 'Celadon', hex: '#82AF96' },
  oceanian: { name: 'Tapa', hex: '#8A5B3C' },
};

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Linear mix in sRGB: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as RGB);
}

/** How much paper shows through the pigment at each prominence. */
const WASH: Record<Prominence, number> = { 1: 0, 2: 0.08, 3: 0.38, 4: 0.62, 5: 1 };

export function laneColor(sphere: string, p: Prominence): string {
  const pigment = PIGMENTS[sphere];
  if (!pigment) throw new Error(`Unknown sphere "${sphere}"`);
  return mix(pigment.hex, PAPER, WASH[p]);
}
