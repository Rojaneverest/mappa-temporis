// The Folio: everything the side panel knows about each item on (or off) the chart.
// Built alongside the display list; keyed by the `ref` carried on display-list items.

export interface FolioSource {
  label: string;
  url: string;
}

export interface FolioEntry {
  id: string;
  kind: 'lane' | 'event' | 'image';
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
  sources: FolioSource[];
  themes?: string[];
  segments?: { name: string; dates: string }[];
  relations?: { type: string; laneId: string; laneName: string; dates: string }[];
  events?: { id: string; dates: string; label: string; drawn: boolean }[];
  images?: string[];
  image?: { caption: string; title: string; credit: string; license: string; url: string; sizes: number[]; width: number; height: number; treatment: string };
  /** World box to fly to: [x, y, w, h]. */
  box: [number, number, number, number];
}

export interface Folio {
  entries: Record<string, FolioEntry>;
  /** Lanes with their fixed centre line, for the pinned lane headers. */
  lanes: { id: string; name: string; cx: number; top: number; bottom: number; prominence: number }[];
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
