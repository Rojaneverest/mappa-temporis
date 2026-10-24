// The Folio: everything the side panel knows about each item on (or off) the chart.
// Built alongside the display list; keyed by the `ref` carried on display-list items.

export interface FolioSource {
  label: string;
  url: string;
}

export interface FolioEntry {
  id: string;
  kind: 'lane' | 'event' | 'image' | 'thread' | 'era' | 'climate' | 'population' | 'person' | 'voice' | 'daily';
  title: string;
  /** Human-readable date or span. */
  dates: string;
  region: string;
  laneId: string;
  laneName: string;
  prominence: number;
  /** Is it drawn on the canvas, or only here (archived for calm)? */
  drawn: boolean;
  confidence?: string;
  basis?: string;
  endonym?: { text: string; translit?: string };
  wikidata?: string;
  /** Wikipedia article title for the live summary. */
  wikipedia?: string;
  /** Our own short text (eras, climate, population). */
  note?: string;
  /** Forces at work (eras). */
  forces?: string[];
  sources: FolioSource[];
  themes?: string[];
  segments?: { name: string; dates: string }[];
  relations?: { type: string; laneId: string; laneName: string; dates: string }[];
  events?: { id: string; dates: string; label: string; drawn: boolean }[];
  /** Lanes: the people, voices and daily-life cards that belong to it. */
  people?: { id: string; dates: string; name: string; role: string; drawn: boolean }[];
  voices?: { id: string; dates: string; text: string; speaker: string }[];
  daily?: { id: string; dates: string; title: string }[];
  /** People: what they did. */
  role?: string;
  /** Voices: the words and who said them. */
  quote?: { text: string; speaker: string; work: string; translation?: string };
  images?: string[];
  image?: { caption: string; title: string; credit: string; license: string; url: string; sizes: number[]; width: number; height: number; treatment: string };
  /** World box to fly to: [x, y, w, h]. */
  box: [number, number, number, number];
}

export interface Folio {
  entries: Record<string, FolioEntry>;
  /** Lanes with their fixed centre line, for the pinned lane headers. */
  lanes: { id: string; name: string; cx: number; top: number; bottom: number; prominence: number }[];
  /** Threads drawn on this sheet (optional layers "thread:<id>"), with the events they pass through. */
  threads: { id: string; name: string; color: string; events: string[]; box: [number, number, number, number] }[];
}

export function sourceLink(key: string): FolioSource {
  const [kind, ...rest] = key.split(':');
  const ref = rest.join(':');
  switch (kind) {
    case 'wikipedia': return { label: `Wikipedia — ${ref.replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(ref)}` };
    case 'britannica': return { label: `Britannica — ${ref.replace(/-/g, ' ')}`, url: `https://www.britannica.com/search?query=${encodeURIComponent(ref.replace(/-/g, ' '))}` };
    case 'wikidata': return { label: `Wikidata ${ref}`, url: `https://www.wikidata.org/wiki/${ref}` };
    default: return { label: key, url: /^https?:/.test(key) ? key : `https://www.google.com/search?q=${encodeURIComponent(key)}` };
  }
}
