// "Meanwhile…": everything happening at one moment, region by region: the states that existed,
// what happened around then (including items too minor to be drawn), who was alive, and what
// people said. Built from the Folio in the browser, so it costs nothing until it is opened.
import type { Folio, FolioEntry } from '../../../packages/render/src/folio.ts';
import { formatYear } from '../../../packages/core/src/dates.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** How far around the year to look: wide in deep time, narrow in the crowded recent centuries. */
export function windowFor(year: number): number {
  if (year < -3300) return 250;
  if (year < -1000) return 50;
  if (year < 500) return 25;
  if (year < 1500) return 15;
  if (year < 1800) return 10;
  return 5;
}

/** A clicked year rounded the way it is read: 150 BCE rather than 151 BCE (1 BCE is year 0). */
export function roundYear(year: number): number {
  const w = windowFor(year);
  const step = w >= 50 ? 10 : w >= 15 ? 5 : 1;
  if (year > 0) return Math.max(1, Math.round(year / step) * step);
  return 1 - Math.round((1 - year) / step) * step;
}

export class Meanwhile {
  private folio: Folio;
  private regions: string[];
  private byKind: Record<string, FolioEntry[]> = {};

  constructor(folio: Folio, regionNames: string[]) {
    this.folio = folio;
    this.regions = regionNames;
    for (const e of Object.values(folio.entries)) if (e.years) (this.byKind[e.kind] ??= []).push(e);
  }

  /** The panel's HTML for a year (astronomical). Links use data-go, so the panel can fly to them. */
  render(year: number): string {
    const w = windowFor(year);
    const alive = (e: FolioEntry) => e.years![0] <= year && e.years![1] >= year;
    const near = (e: FolioEntry) => Math.abs(e.years![0] - year) <= w;
    const states = (this.byKind.lane ?? []).filter(alive);
    const events = (this.byKind.event ?? []).filter(near);
    const people = (this.byKind.person ?? []).filter(alive);
    const voices = (this.byKind.voice ?? []).filter(near);
    const daily = (this.byKind.daily ?? []).filter(alive);
    const span = `${formatYear(year - w)} – ${formatYear(year + w)}`;
    const parts: string[] = [
      `<div class="kicker">Meanwhile · the whole world</div>`,
      `<h2>Around ${esc(formatYear(year))}</h2>`,
      `<div class="dates">${states.length} states and peoples · ${events.length} events between ${esc(span)} · ${people.length} people alive</div>`,
      `<div class="mw-nav"><button data-mw="${year - w}">◀ ${w} years earlier</button><button data-mw="${year + w}">${w} years later ▶</button></div>`,
    ];
    for (const region of this.regions) {
      const inRegion = (e: FolioEntry) => e.region === region;
      const st = states.filter(inRegion).sort((a, b) => a.prominence - b.prominence || a.title.localeCompare(b.title));
      const ev = events.filter(inRegion).sort((a, b) => a.years![0] - b.years![0] || a.prominence - b.prominence);
      const pp = people.filter(inRegion).sort((a, b) => a.prominence - b.prominence || a.years![0] - b.years![0]);
      const vv = voices.filter(inRegion);
      const dd = daily.filter(inRegion);
      if (!st.length && !ev.length && !pp.length) continue;
      parts.push(`<section class="mw-region"><h3>${esc(region)}</h3>`);
      if (st.length) {
        parts.push('<div class="mw-states">' + st.map((s) => {
          const name = esc(s.title);
          return `<a href="#" data-go="${esc(s.id)}">${s.prominence <= 2 ? `<b>${name}</b>` : name}</a>`;
        }).join(' · ') + '</div>');
      }
      if (ev.length) {
        parts.push('<ul class="list events">' + ev.map((e) =>
          `<li><a href="#" data-go="${esc(e.id)}"><span>${esc(e.dates)}</span>${esc(e.title)}</a>${e.drawn ? '' : ' <em class="mw-off">(off the chart)</em>'}</li>`).join('') + '</ul>');
      }
      if (pp.length) {
        parts.push('<ul class="list">' + pp.map((p) =>
          `<li><a href="#" data-go="${esc(p.id)}"><span>aged ${Math.max(0, year - p.years![0])}</span>${esc(p.title)}, ${esc(p.role ?? '')}</a></li>`).join('') + '</ul>');
      }
      for (const v of vv) parts.push(`<blockquote class="voice">“${esc(v.quote!.text)}”<cite>— ${esc(v.quote!.speaker)}, ${esc(v.dates)}</cite></blockquote>`);
      if (dd.length) parts.push('<ul class="list">' + dd.map((d) => `<li><a href="#" data-go="${esc(d.id)}"><span>daily life</span>${esc(d.title)}</a></li>`).join('') + '</ul>');
      parts.push('</section>');
    }
    return parts.join('');
  }
}
