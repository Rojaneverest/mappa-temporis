// The Folio side panel: details, people, voices of the sources, daily life, images and links for one item.
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
  /** The thread being followed stop by stop, if any. */
  following: string | null = null;
  /** Called with a year when a Meanwhile link is clicked; with a thread id to follow (or null to stop). */
  onMeanwhile: (year: number) => void = () => {};
  onFollow: (threadId: string | null) => void = () => {};

  constructor(el: HTMLElement, folio: Folio, onSelect: (id: string, fly: boolean) => void) {
    this.el = el;
    this.folio = folio;
    this.onSelect = onSelect;
    el.innerHTML = '<button class="close" aria-label="Close">×</button><div class="body"></div>';
    this.body = el.querySelector('.body')!;
    el.querySelector('.close')!.addEventListener('click', () => this.onSelect('', false));
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const mw = t.closest('[data-mw]') as HTMLElement | null;
      if (mw) { e.preventDefault(); this.onMeanwhile(Number(mw.dataset.mw)); return; }
      const fl = t.closest('[data-follow]') as HTMLElement | null;
      if (fl) { e.preventDefault(); this.onFollow(fl.dataset.follow || null); return; }
      const a = t.closest('[data-go]') as HTMLElement | null;
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

  /** Show ready-made HTML (Meanwhile) under an id of its own, so deep links can name it. */
  showHtml(id: string, html: string) {
    this.current = id;
    this.el.classList.add('open');
    this.body.innerHTML = html;
    this.body.scrollTop = 0;
  }

  /** While following a thread: where this stop sits, with the previous and next stops. */
  private followBar(e: FolioEntry): string {
    const th = this.following ? this.folio.threads.find((t) => t.id === this.following) : undefined;
    const i = th ? th.events.indexOf(e.id) : -1;
    if (!th || i < 0) return '';
    const prev = th.events[i - 1], next = th.events[i + 1];
    return `<div class="follow"><span class="bar" style="background:${th.color}"></span><a href="#" data-go="thread:${esc(th.id)}">${esc(th.name)}</a>
      <span class="stop">${i + 1} / ${th.events.length}</span>
      <button ${prev ? `data-go="${esc(prev)}"` : 'disabled'} aria-label="Previous stop">◀</button>
      <button ${next ? `data-go="${esc(next)}"` : 'disabled'} aria-label="Next stop">▶</button>
      <button data-follow="" aria-label="Stop following">✕</button></div>`;
  }

  private render(e: FolioEntry): string {
    const kind = ({ lane: 'Civilization · state · period', event: 'Event', thread: 'Thread', image: 'Object', era: 'Era', climate: 'Climate', population: 'People', person: 'Person', voice: 'Voice', daily: 'Daily life' } as const)[e.kind];
    const parts: string[] = [this.followBar(e)];
    const laneLink = e.laneId ? ` · <a href="#" data-go="${esc(e.laneId)}">${esc(e.laneName)}</a>` : '';
    parts.push(`<div class="kicker">${kind} · ${esc(e.region)}${e.kind !== 'lane' ? laneLink : ''}</div>`);
    if (e.endonym) parts.push(`<div class="endonym">${esc(e.endonym.text)}${e.endonym.translit ? `<span>${esc(e.endonym.translit)}</span>` : ''}</div>`);
    parts.push(`<h2>${esc(e.title)}</h2>`);
    // Daily-life cards live only here by design: no prominence, nothing "missing" from the chart.
    const badges = e.kind === 'daily' ? [] : [`<span class="badge p${e.prominence}">${PROMINENCE[e.prominence]}</span>`];
    if (e.confidence && e.confidence !== 'attested') badges.push(`<span class="badge warn">${esc(e.confidence)}</span>`);
    if (e.basis && e.basis !== 'texts') badges.push(`<span class="badge warn">known from ${esc(e.basis)}</span>`);
    if (!e.drawn && e.kind !== 'daily') badges.push('<span class="badge">not drawn on the chart</span>');
    parts.push(`<div class="dates">${esc(e.dates)} ${badges.join(' ')}</div>`);
    if (e.image) {
      const size = e.image.sizes.find((z) => z >= 900) ?? e.image.sizes[e.image.sizes.length - 1];
      parts.push(`<figure class="${e.image.treatment}"><img src="${import.meta.env.BASE_URL}img/${esc(e.id)}/${size}.webp" alt="${esc(e.image.caption)}"><figcaption>${esc(e.image.title)}<br><span>${esc(e.image.credit)} · ${esc(e.image.license)}</span></figcaption></figure>`);
    }
    if (e.role) parts.push(`<p class="note">${esc(e.role[0]!.toUpperCase() + e.role.slice(1))}.</p>`);
    if (e.quote) {
      parts.push(`<blockquote class="voice">“${esc(e.quote.text)}”<cite>— ${esc(e.quote.speaker)}, <i>${esc(e.quote.work)}</i>${e.quote.translation ? ` · tr. ${esc(e.quote.translation)}` : ''}</cite></blockquote>`);
    }
    if (e.note) parts.push(...e.note.split(/\n\s*\n/).map((para) => `<p class="note">${esc(para)}</p>`));
    if (e.forces?.length) parts.push('<div class="forces">' + e.forces.map((f) => `<span class="force ${esc(f)}">${esc(f)}</span>`).join('') + '</div>');
    if (e.wikipedia) parts.push('<div class="wiki"><p class="loading">Loading summary…</p></div>');
    if (e.segments?.length) {
      parts.push('<h3>Phases</h3><ul class="list">' + e.segments.map((s) => `<li><span>${esc(s.dates)}</span>${esc(s.name)}</li>`).join('') + '</ul>');
    }
    if (e.kind === 'thread' && e.events?.length) parts.push(`<button class="start" data-follow="${esc(e.id.slice('thread:'.length))}">Follow this thread, stop by stop ▶</button>`);
    if (e.events?.length) {
      parts.push(`<h3>${e.kind === 'thread' ? 'Stops along the way' : 'Events'}</h3><ul class="list events">` + e.events.map((ev) =>
        `<li><a href="#" data-go="${esc(ev.id)}"><span>${esc(ev.dates)}</span>${esc(ev.label)}</a>${ev.drawn ? '' : ' <em>(off the chart)</em>'}</li>`).join('') + '</ul>');
    }
    if (e.people?.length) {
      parts.push('<h3>People</h3><ul class="list">' + e.people.map((p) =>
        `<li><a href="#" data-go="${esc(p.id)}"><span>${esc(p.dates)}</span>${esc(p.name)}, ${esc(p.role)}</a>${p.drawn ? '' : ' <em>(off the chart)</em>'}</li>`).join('') + '</ul>');
    }
    if (e.voices?.length) {
      parts.push('<h3>Voices</h3><ul class="list voices">' + e.voices.map((v) =>
        `<li><a href="#" data-go="${esc(v.id)}"><span>${esc(v.dates)}</span><q>${esc(v.text)}</q> — ${esc(v.speaker)}</a></li>`).join('') + '</ul>');
    }
    if (e.daily?.length) {
      parts.push('<h3>Daily life</h3><ul class="list">' + e.daily.map((d) =>
        `<li><a href="#" data-go="${esc(d.id)}"><span>${esc(d.dates)}</span>${esc(d.title)}</a></li>`).join('') + '</ul>');
    }
    if (e.images?.length) {
      parts.push('<h3>Objects</h3><div class="thumbs">' + e.images.map((id) => {
        const img = this.folio.entries[id]?.image;
        return img ? `<a href="#" data-go="${esc(id)}" title="${esc(img.caption)}"><img src="${import.meta.env.BASE_URL}img/${esc(id)}/256.webp" alt="${esc(img.caption)}"></a>` : '';
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
