// One function builds every paragraph — used to measure at build time and to draw at
// render time, so wrapping and widths can never disagree.
import type { CanvasKit, FontCollection, Paragraph } from 'canvaskit-wasm';
import type { TextItem, TextRole } from './displaylist.ts';
import { ROLES } from './fonts.ts';

export interface TextSpec {
  role: TextRole;
  text: string;
  pre?: string;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  w: number;
}

export const PRE_COLOR = '#8A7C6E';

/** `alpha` bakes transparency into the glyph colours (cheaper than compositing a layer per label). */
export function buildParagraph(ck: CanvasKit, fonts: FontCollection, spec: TextSpec, alpha = 1): Paragraph {
  const role = ROLES[spec.role];
  const tint = (color: string) => { const c = ck.parseColorString(color); c[3] = c[3]! * alpha; return c; };
  const style = (color: string, weightBoost = 0) => ({
    color: tint(color),
    fontFamilies: role.families,
    fontSize: spec.size,
    letterSpacing: role.tracking * spec.size,
    heightMultiplier: role.leading,
    halfLeading: true,
    fontStyle: {
      weight: { value: role.weight + weightBoost },
      slant: role.italic ? ck.FontSlant.Italic : ck.FontSlant.Upright,
    },
    fontVariations: role.wght ? [{ axis: 'wght', value: role.wght }] : undefined,
  });
  const builder = ck.ParagraphBuilder.MakeFromFontCollection(
    new ck.ParagraphStyle({
      textStyle: style(spec.color),
      textAlign: spec.align === 'center' ? ck.TextAlign.Center : spec.align === 'right' ? ck.TextAlign.Right : ck.TextAlign.Left,
    }),
    fonts,
  );
  if (spec.pre) {
    builder.pushStyle(new ck.TextStyle(style(PRE_COLOR)));
    builder.addText(spec.pre + '  ');
    builder.pop();
  }
  builder.addText(spec.text);
  const p = builder.build();
  builder.delete();
  p.layout(spec.w);
  return p;
}

/** Measure a spec into the line metrics stored on a TextItem. */
export function measure(ck: CanvasKit, fonts: FontCollection, spec: TextSpec): Pick<TextItem, 'lines' | 'lineH' | 'h'> & { longest: number } {
  const p = buildParagraph(ck, fonts, spec);
  const metrics = p.getLineMetrics();
  const out = {
    lines: metrics.map((m) => Math.round(m.width * 10) / 10),
    lineH: metrics.length ? p.getHeight() / metrics.length : spec.size,
    h: p.getHeight(),
    longest: p.getLongestLine(),
  };
  p.delete();
  return out;
}
