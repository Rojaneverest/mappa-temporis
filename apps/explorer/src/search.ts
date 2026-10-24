// Search (⌘K / Ctrl-K / "/"): every lane, event, person, voice, object and thread in the Folio — including
// the ones archived off the canvas for calm. Small enough to search in memory, instantly.
import type { Folio, FolioEntry } from '../../../packages/render/src/folio.ts';

const KIND: Record<FolioEntry['kind'], string> = { lane: 'Civilization', event: 'Event', image: 'Object', thread: 'Thread', era: 'Era', climate: 'Climate', population: 'People', person: 'Person', voice: 'Voice', daily: 'Daily life' };
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Doc { e: FolioEntry; title: string; words: string[]; extra: string }

export class Search {
  private el: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private docs: Doc[];
  private results: Doc[] = [];
  private active = 0;
  private onPick: (id: string) => void;

  constructor(el: HTMLElement, folio: Folio, onPick: (id: string) => void) {
    this.el = el;
    this.onPick = onPick;
    this.docs = Object.values(folio.entries).map((e) => {
      const title = fold(e.title);
      return { e, title, words: title.split(/[^a-z0-9]+/).filter(Boolean), extra: fold(`${e.laneName} ${e.region} ${e.endonym?.translit ?? ''} ${e.dates} ${e.role ?? ''} ${e.quote ? `${e.quote.speaker} ${e.quote.text}` : ''}`) };
    });
    el.innerHTML = '<input type="search" placeholder="Search people, empires, events, objects…" aria-label="Search the chart"><ul role="listbox"></ul>';
    this.input = el.querySelector('input')!;
    this.list = el.querySelector('ul')!;
    this.input.addEventListener('input', () => this.run());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { const r = this.results[this.active]; if (r) this.pick(r.e.id); }
      else if (e.key === 'Escape') this.close();
    });
    this.list.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest('li') as HTMLElement | null;
      if (li) { e.preventDefault(); this.pick(li.dataset.id!); }
    });
    this.input.addEventListener('blur', () => setTimeout(() => this.close(), 120));
    window.addEventListener('keydown', (e) => {
      const typing = (e.target as HTMLElement).closest?.('input, textarea');
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); this.open(); }
    });
  }

  open() {
    this.el.classList.add('open');
    this.input.focus();
    this.input.select();
    this.run();
  }

  close() {
    this.el.classList.remove('open');
  }

  private pick(id: string) {
    this.close();
    this.input.blur();
    this.onPick(id);
  }

  private move(d: number) {
    if (!this.results.length) return;
    this.active = (this.active + d + this.results.length) % this.results.length;
    this.render();
  }

  private run() {
    const q = fold(this.input.value.trim());
    if (!q) { this.results = []; this.render(); return; }
    const terms = q.split(/\s+/);
    const scored: [number, Doc][] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of terms) {
        if (d.title.startsWith(t)) score += 6;
        else if (d.words.some((w) => w.startsWith(t))) score += 4;
        else if (d.title.includes(t)) score += 2;
        else if (d.extra.includes(t)) score += 1;
        else { score = 0; break; }
      }
      if (!score) continue;
      // Prefer the big things, and things you can see on the chart.
      score += (5 - d.e.prominence) * 0.4 + (d.e.kind === 'lane' ? 1 : 0) + (d.e.drawn ? 0.3 : 0);
      scored.push([score, d]);
    }
    this.results = scored.sort((a, b) => b[0] - a[0]).slice(0, 12).map(([, d]) => d);
    this.active = 0;
    this.render();
  }

  private render() {
    this.list.innerHTML = this.results.map((d, i) => `
      <li data-id="${esc(d.e.id)}" role="option" aria-selected="${i === this.active}" class="${i === this.active ? 'on' : ''}">
        <span class="t">${esc(d.e.title)}</span>
        <span class="m">${KIND[d.e.kind]} · ${esc(d.e.dates)}${d.e.laneName && d.e.kind !== 'lane' ? ' · ' + esc(d.e.laneName) : ''}</span>
      </li>`).join('') || (this.input.value.trim() ? '<li class="none">Nothing found</li>' : '');
  }
}
