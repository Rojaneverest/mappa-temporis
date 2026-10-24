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
  /** Further threads this event is a stop on (an event can sit on several). */
  threads: z.array(z.string()).default([]),
  sources: z.array(z.string()).min(1, 'every event needs a source'),
  note: z.string().optional(),
  /** People who took part: the build checks they were alive at the date. */
  people: z.array(z.string()).default([]),
});

export const LaneImage = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** met:<objectID> (Met Open Access) or commons:File:<name> (Wikimedia Commons). */
  source: z.string().regex(/^(met:\d+|commons:File:.+)$/),
  /** Where on the time axis the image belongs. */
  date: DateText,
  prominence: Prominence,
  /** cutout: object lifted from its photo with a soft shadow; plate: framed rectangle (paintings, scenes);
   *  backdrop: printed into the paper (multiplied), unframed — the era maps; coin: a coin lifted from its
   *  photo as an embossed roundel (struck in the ruler's lifetime). */
  treatment: z.enum(['cutout', 'plate', 'backdrop', 'coin']),
  caption: z.string().max(80),
  /** Made in the era it illustrates (vs. a later depiction). */
  ofItsTime: z.boolean().default(true),
  /** Backdrops only: print light as ink (photographs of Earth against black space). */
  invert: z.boolean().default(false),
  /** Backdrops only: lift the object off its photo's background (Apple Vision) before printing. */
  lift: z.boolean().default(false),
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
  /** Cliopatria polity names to show for this lane in the Atlas, when Wikidata/name matching misses. */
  cliopatria: z.array(z.string()).default([]),
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
  /** "The world as they saw it": a map made in (or about) this era, printed into the left margin. */
  map: LaneImage.optional(),
  /** Paper tint for the era's substrate band (very faint). */
  tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  /** A few sentences for the Folio. */
  note: z.string().optional(),
  sources: z.array(z.string()).default([]),
});
export type Era = z.infer<typeof Era>;

export const Region = z.object({
  id: z.string(),
  name: z.string(),
  /** Used in the frozen header when the full name doesn't fit. */
  short: z.string().optional(),
  /** Sub-regions, west to east. Lanes without a group use the region id. */
  groups: z.array(z.string()).default([]),
});
export type Region = z.infer<typeof Region>;

export const Sheet = z.object({
  title: z.string(),
  subtitle: z.string(),
  window: SpanText,
  /** Compressed stretches (e.g. the Neolithic prologue): `factor` 5 = a fifth of the normal space per year. */
  /** Piecewise time scale: space per year relative to the main scale (0.2 = compressed fivefold, 2 = doubled).
   *  Stretches not listed use the main scale. Each label is printed just below where its stretch begins. */
  scale: z.array(z.object({ span: SpanText, factor: z.number().min(0.05).max(10), label: z.string().optional() })).default([]),
  /** Draw the population curve and climate ribbons in the right margin. */
  margins: z.boolean().default(false),
  regions: z.array(Region),
  eras: z.array(Era),
  /** Use another sheet's Atlas files (a variant of that sheet with a different window). */
  atlas: z.string().optional(),
  /** A fold strip at the top of the sheet that switches to a sheet with more (or less) deep time (decision 49). */
  fold: z.object({ sheet: z.string(), label: z.string() }).optional(),
});
export type Sheet = z.infer<typeof Sheet>;

export const Thread = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  /** One line on what the thread follows. */
  note: z.string().optional(),
});
export const ClimateEpisode = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  span: SpanText,
  kind: z.enum(['warm', 'cold', 'dry', 'wet']),
  note: z.string(),
  sources: z.array(z.string()).min(1),
});
export type ClimateEpisode = z.infer<typeof ClimateEpisode>;

export const MarginsFile = z.object({
  population: z.object({
    note: z.string(),
    sources: z.array(z.string()).min(1),
    /** [date, millions of people] */
    points: z.array(z.tuple([DateText, z.number().positive()])).min(2),
    callouts: z.array(z.object({ year: DateText, label: z.string() })).default([]),
  }),
  climate: z.array(ClimateEpisode),
});
export type MarginsFile = z.infer<typeof MarginsFile>;

export const ThreadFile = z.object({ threads: z.array(Thread) });

/** Atmosphere: a faint ink-printed engraving in the open paper of an era × region (decisions 30–31).
 *  Decoration, not information: no prominence, never clickable, credited like every image. */
export const Engraving = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  source: z.string().regex(/^(met:\d+|commons:File:.+)$/),
  region: z.string(),
  /** The stretch of time it may sit in; the layout picks the emptiest spot inside it. */
  span: SpanText,
  /** What it shows, for the credits. */
  caption: z.string().max(80),
  /** s / m / l: how much open paper it wants. */
  size: z.enum(['s', 'm', 'l']).default('m'),
  /** Made in the era it decorates (vs. a later depiction). */
  ofItsTime: z.boolean().default(false),
  invert: z.boolean().default(false),
  lift: z.boolean().default(false),
  /** Keep only this part of the scan, as fractions [left, top, right, bottom] (drops plate frames and captions). */
  crop: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});
export type Engraving = z.infer<typeof Engraving>;
export const AtmosphereFile = z.object({ engravings: z.array(Engraving) });
export type Thread = z.infer<typeof Thread>;

/** A person, drawn beside their lane at the century zoom with a thin bar for their lifetime. */
export const Person = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().max(40),
  lane: z.string(),
  /** Birth – death, human-style ("c. 551 – 479 BCE"). */
  life: SpanText,
  /** What they did, in a few words ("teacher of rulers"). */
  role: z.string().max(60),
  /** Themes for the lenses (religion, art, war, women…), like events. */
  themes: z.array(z.string()).default([]),
  prominence: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  endonym: Endonym.optional(),
  sources: z.array(z.string()).min(1),
});
export type Person = z.infer<typeof Person>;
export const PeopleFile = z.object({ people: z.array(Person) });

/** A voice: a short quotation from a primary source, set in italic beside a landmark (P1–P2) lane. */
export const Voice = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  lane: z.string(),
  date: DateText,
  /** The words, in English (keep under ~20 words; long quotes belong in the Folio, not on the canvas). */
  text: z.string().max(160),
  speaker: z.string().max(50),
  /** The work it comes from ("Analects 2.4"). */
  work: z.string().max(80),
  /** The translation used, when it is not our own plain rendering. */
  translation: z.string().optional(),
  themes: z.array(z.string()).default([]),
  prominence: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  sources: z.array(z.string()).min(1),
});
export type Voice = z.infer<typeof Voice>;
export const VoicesFile = z.object({ voices: z.array(Voice) });

/** Daily life: a short card on how ordinary people lived. Folio only, never drawn. */
export const DailyCard = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  lane: z.string(),
  span: SpanText,
  title: z.string().max(60),
  text: z.string().max(700),
  sources: z.array(z.string()).min(1),
});
export type DailyCard = z.infer<typeof DailyCard>;
export const DailyFile = z.object({ cards: z.array(DailyCard) });

/** A lens: one theme lit up across the chart, the rest dimmed. Matches items by their themes. */
export const Lens = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  themes: z.array(z.string()).min(1),
  note: z.string(),
});
export type Lens = z.infer<typeof Lens>;
export const LensFile = z.object({ lenses: z.array(Lens) });
