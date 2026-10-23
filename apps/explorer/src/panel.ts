// The Folio side panel: details, voices of the sources, images and links for one item.
import type { Folio, FolioEntry } from '../../../packages/render/src/folio.ts';

const PROMINENCE = ['', 'Landmark', 'Major', 'Standard', 'Whisper', 'Archive'];
const RELATION: Record<string, string> = {
  succeeds: 'Succeeds', becomes: 'Becomes', 'splits-into': 'Splits into', 'merges-into': 'Absorbed by',
  conquers: 'Conquers', influences: 'Influences',
};

const wikiCache = new Map<string, Promise<{ extract: string; url: string } | null>>();
function wikiSummary(title: string) {
  let p = wikiCache.get(title);
  if (!p) {
    p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.extract ? { extract: j.extract as string, url: j.content_urls?.desktop?.page as string } : null))
      .catch(() => null);
    wikiCache.set(title, p);
  }
  return p;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class Panel {
  private el: HTMLElement;
  private body: HTMLElement;
  private folio: Folio;
  private onSelect: (id: string, fly: boolean) => void;
  current: string | null = null;

  constructor(el: HTMLElement, folio: Folio, onSelect: (id: string, fly: boolean) => void) {
    this.el = el;
    this.folio = folio;
    this.onSelect = onSelect;
    el.innerHTML = '<button class="close" aria-label="Close">×</button><div class="body"></div>';
    this.body = el.querySelector('.body')!;
    el.querySelector('.close')!.addEventListener('click', () => this.onSelect('', false));
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
      if (a) { e.preventDefault(); this.onSelect(a.dataset.go!, true); }
    });
  }

  show(id: string | null) {
    this.current = id;
    const entry = id ? this.folio.entries[id] : undefined;
    this.el.classList.toggle('open', !!entry);
    if (!entry) return;
    this.body.innerHTML = this.render(entry);
    this.body.scrollTop = 0;
    if (entry.wikipedia) {
      const slot = this.body.querySelector('.wiki');
      wikiSummary(entry.wikipedia).then((w) => {
        if (this.current !== id || !slot) return;
        slot.innerHTML = w
          ? `<p>${esc(w.extract)}</p><p class="attr">From <a href="${esc(w.url)}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA 4.0</p>`
          : '';
      });
    }
  }

  private render(e: FolioEntry): string {
    const kind = e.kind === 'lane' ? 'Civilization · state · period' : e.kind === 'event' ? 'Event' : 'Object';
    const parts: string[] = [];
    parts.push(`<div class="kicker">${kind} · ${esc(e.region)}${e.kind !== 'lane' ? ` · <a href="#" data-go="${esc(e.laneId)}">${esc(e.laneName)}</a>` : ''}</div>`);
    if (e.endonym) parts.push(`<div class="endonym">${esc(e.endonym.text)}${e.endonym.translit ? `<span>${esc(e.endonym.translit)}</span>` : ''}</div>`);
    parts.push(`<h2>${esc(e.title)}</h2>`);
    const badges = [`<span class="badge p${e.prominence}">${PROMINENCE[e.prominence]}</span>`];
    if (e.confidence && e.confidence !== 'attested') badges.push(`<span class="badge warn">${esc(e.confidence)}</span>`);
    if (e.basis && e.basis !== 'texts') badges.push(`<span class="badge warn">known from ${esc(e.basis)}</span>`);
    if (!e.drawn) badges.push('<span class="badge">not drawn on the chart</span>');
    parts.push(`<div class="dates">${esc(e.dates)} ${badges.join(' ')}</div>`);
    if (e.image) {
      const size = e.image.sizes.find((z) => z >= 900) ?? e.image.sizes[e.image.sizes.length - 1];
      parts.push(`<figure class="${e.image.treatment}"><img src="/img/${esc(e.id)}/${size}.webp" alt="${esc(e.image.caption)}"><figcaption>${esc(e.image.title)}<br><span>${esc(e.image.credit)} · ${esc(e.image.license)}</span></figcaption></figure>`);
    }
    if (e.wikipedia) parts.push('<div class="wiki"><p class="loading">Loading summary…</p></div>');
    if (e.segments?.length) {
      parts.push('<h3>Phases</h3><ul class="list">' + e.segments.map((s) => `<li><span>${esc(s.dates)}</span>${esc(s.name)}</li>`).join('') + '</ul>');
    }
    if (e.events?.length) {
      parts.push('<h3>Events</h3><ul class="list events">' + e.events.map((ev) =>
        `<li><a href="#" data-go="${esc(ev.id)}"><span>${esc(ev.dates)}</span>${esc(ev.label)}</a>${ev.drawn ? '' : ' <em>(off the chart)</em>'}</li>`).join('') + '</ul>');
    }
    if (e.images?.length) {
      parts.push('<h3>Objects</h3><div class="thumbs">' + e.images.map((id) => {
        const img = this.folio.entries[id]?.image;
        return img ? `<a href="#" data-go="${esc(id)}" title="${esc(img.caption)}"><img src="/img/${esc(id)}/256.webp" alt="${esc(img.caption)}"></a>` : '';
      }).join('') + '</div>');
    }
    if (e.relations?.length) {
      parts.push('<h3>Connections</h3><ul class="list">' + e.relations.map((r) =>
        `<li><span>${esc(r.dates)}</span>${RELATION[r.type] ?? r.type} <a href="#" data-go="${esc(r.laneId)}">${esc(r.laneName)}</a></li>`).join('') + '</ul>');
    }
    if (e.sources.length) {
      parts.push('<h3>Sources</h3><ul class="sources">' + e.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join('') + '</ul>');
    }
    return parts.join('');
  }
}
