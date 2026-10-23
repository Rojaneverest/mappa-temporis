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

export const LaneImage = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** met:<objectID> (Met Open Access) or commons:File:<name> (Wikimedia Commons). */
  source: z.string().regex(/^(met:\d+|commons:File:.+)$/),
  /** Where on the time axis the image belongs. */
  date: DateText,
  prominence: Prominence,
  /** cutout: object lifted from its photo with a soft shadow; plate: framed rectangle (paintings, scenes). */
  treatment: z.enum(['cutout', 'plate']),
  caption: z.string().max(80),
  /** Made in the era it illustrates (vs. a later depiction). */
  ofItsTime: z.boolean().default(true),
});
export type LaneImage = z.infer<typeof LaneImage>;

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
  /** Sub-region the lane belongs to (e.g. china, korea); groups are laid out in the order the sheet lists them. */
  group: z.string().optional(),
  /** Optional hand pin: fixed track position within the group. Normally the layout engine decides. */
  column: z.number().int().min(0).optional(),
  segments: z.array(Segment).default([]),
  relations: z.array(Relation).default([]),
  events: z.array(Event).default([]),
  images: z.array(LaneImage).default([]),
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
  /** Sub-regions, west to east. Lanes without a group use the region id. */
  groups: z.array(z.string()).default([]),
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

export const Thread = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
export const ThreadFile = z.object({ threads: z.array(Thread) });
export type Thread = z.infer<typeof Thread>;
