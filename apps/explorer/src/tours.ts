// Tours: narrated camera flights through the chart, one card at a time.
import type { Tour } from '../../../packages/core/src/schema.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class Tours {
  private card: HTMLElement;
  private menu: HTMLElement;
  private tours: Tour[];
  private tour: Tour | null = null;
  private step = 0;
  /** Fly to and highlight a target; `zoom` caps the zoom for wide views. */
  private go: (target: string, zoom?: number) => void;
  private onEnd: () => void;

  constructor(card: HTMLElement, menu: HTMLElement, button: HTMLElement, tours: Tour[], go: (target: string, zoom?: number) => void, onEnd: () => void) {
    this.card = card;
    this.menu = menu;
    this.tours = tours;
    this.go = go;
    this.onEnd = onEnd;
    button.hidden = !tours.length;
    menu.innerHTML = '<h4>Tours</h4>' + tours.map((t) => `<button data-tour="${esc(t.id)}"><strong>${esc(t.title)}</strong><span>${esc(t.subtitle)}</span></button>`).join('');
    button.addEventListener('click', () => menu.classList.toggle('open'));
    menu.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-tour]') as HTMLElement | null;
      if (b) { menu.classList.remove('open'); this.start(b.dataset.tour!); }
    });
    card.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (act?.dataset.act === 'next') this.show(this.step + 1);
      else if (act?.dataset.act === 'prev') this.show(this.step - 1);
      else if (act?.dataset.act === 'end') this.end();
    });
    // While a tour runs, arrow keys step through it (capture phase, before the viewer pans).
    window.addEventListener('keydown', (e) => {
      if (!this.tour) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); this.show(this.step + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); this.show(this.step - 1); }
      else if (e.key === 'Escape') { e.stopImmediatePropagation(); this.end(); }
    }, true);
  }

  start(id: string) {
    this.tour = this.tours.find((t) => t.id === id) ?? null;
    if (this.tour) this.show(0);
  }

  get running() {
    return !!this.tour;
  }

  private show(i: number) {
    if (!this.tour) return;
    if (i >= this.tour.steps.length) { this.end(); return; }
    this.step = Math.max(0, i);
    const st = this.tour.steps[this.step]!;
    const n = this.tour.steps.length;
    this.card.innerHTML = `
      <div class="kicker">Tour · ${esc(this.tour.title)} · ${this.step + 1} / ${n}</div>
      <p>${esc(st.text)}</p>
      <div class="nav">
        <button data-act="prev" ${this.step === 0 ? 'disabled' : ''}>← Back</button>
        <button data-act="end" class="quiet">End tour</button>
        <button data-act="next" class="primary">${this.step === n - 1 ? 'Finish' : 'Next →'}</button>
      </div>`;
    this.card.classList.add('open');
    this.go(st.target, st.zoom);
  }

  end() {
    this.tour = null;
    this.card.classList.remove('open');
    this.onEnd();
  }
}
