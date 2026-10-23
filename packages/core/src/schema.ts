// Content schema. YAML files under content/ are validated against these on every build.
import { z } from 'zod';
import { parseDate, parseSpan } from './dates.ts';

/** P1 landmark … P5 archive (not drawn). See docs/PLAN.md §3. */
export const Prominence = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type Prominence = z.infer<typeof Prominence>;

export const Confidence = z.enum(['attested', 'probable', 'disputed', 'legendary']);
/** How we know a lane exists — drives its texture (texts: plain, archaeology: stone, legend: mist). */
export const Basis = z.enum(['texts', 'archaeology', 'legend']);

const DateText = z.string().refine((s) => { try { parseDate(s); return true; } catch { return false; } }, 'unparseable date');
const SpanText = z.string().refine((s) => { try { parseSpan(s); return true; } catch { return false; } }, 'unparseable span');

export const Endonym = z.object({
  text: z.string(),
  script: z.string(),
  translit: z.string().optional(),
});

export const Segment = z.object({
  name: z.string(),
  span: SpanText,
  /** Relative width step 1–6 (overrides the lane default). */
  weight: z.number().int().min(1).max(6).optional(),
  style: z.enum(['normal', 'interregnum']).default('normal'),
});

export const RelationType = z.enum(['succeeds', 'becomes', 'splits-into', 'merges-into', 'conquers', 'influences']);
export const Relation = z.object({
  type: RelationType,
  lane: z.string().optional(),
  lanes: z.array(z.string()).optional(),
  at: DateText,
});

export const Event = z.object({
  id: z.string(),
  date: DateText,
  label: z.string().max(90),
  prominence: Prominence,
  confidence: Confidence.default('attested'),
  themes: z.array(z.string()).default([]),
  thread: z.string().optional(),
  sources: z.array(z.string()).min(1, 'every event needs a source'),
  note: z.string().optional(),
});

export const Lane = z.object({
  id: z.string(),
  name: z.string(),
  endonym: Endonym.optional(),
  wikidata: z.string().regex(/^Q\d+$/).optional(),
  region: z.string(),
  sphere: z.string(),
  prominence: Prominence,
  basis: Basis.default('texts'),
  span: SpanText,
  /** Hand-pinned column within the region (the layout engine will propose these later). */
  column: z.number().int().min(0),
  segments: z.array(Segment).default([]),
  relations: z.array(Relation).default([]),
  events: z.array(Event).default([]),
  sources: z.array(z.string()).default([]),
});
export type Lane = z.infer<typeof Lane>;
export type Event = z.infer<typeof Event>;

export const LaneFile = z.object({ lanes: z.array(Lane) });

export const Era = z.object({
  id: z.string(),
  name: z.string(),
  span: SpanText,
  forces: z.array(z.enum(['climate', 'migration', 'disease', 'war', 'technology', 'ideas'])).default([]),
  turningPoint: z.object({ label: z.string(), span: SpanText }).optional(),
});
export type Era = z.infer<typeof Era>;

export const Region = z.object({
  id: z.string(),
  name: z.string(),
  columns: z.number().int().min(1),
});
export type Region = z.infer<typeof Region>;

export const Sheet = z.object({
  title: z.string(),
  subtitle: z.string(),
  window: SpanText,
  regions: z.array(Region),
  eras: z.array(Era),
});
export type Sheet = z.infer<typeof Sheet>;
