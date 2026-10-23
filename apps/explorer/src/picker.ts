// Hit-testing: which content item (lane, event, image) is under a point at the current zoom.
import Flatbush from 'flatbush';
import type { DisplayList, Item } from '../../../packages/render/src/displaylist.ts';
import { fadeAt } from '../../../packages/render/src/painter.ts';

/** Text, images and marks beat the lane they sit on. */
const KIND_RANK: Record<Item['k'], number> = { text: 3, image: 3, rect: 2, line: 1, path: 0 };
/** Marks on an optional layer sit on top of everything, so they win ties. */
const rankOf = (it: Item) => KIND_RANK[it.k] + (it.layer ? 4 : 0);

export class Picker {
  private index: Flatbush;
  private ids: number[] = [];
  private dl: DisplayList;

  constructor(dl: DisplayList) {
    this.dl = dl;
    dl.items.forEach((it, i) => { if (it.ref) this.ids.push(i); });
    this.index = new Flatbush(Math.max(1, this.ids.length));
    for (const i of this.ids) {
      const b = dl.items[i]!.b!;
      this.index.add(b[0], b[1], b[2], b[3]);
    }
    if (!this.ids.length) this.index.add(0, 0, 0, 0);
    this.index.finish();
  }

  /** The ref under world point (wx, wy) at scale s (CSS px per unit), or null. */
  /** Optional layers currently switched on (items on other layers can't be picked). */
  layers: ReadonlySet<string> = new Set();

  pick(wx: number, wy: number, s: number): { ref: string; item: Item } | null {
    const tol = 4 / s;
    let best: { ref: string; item: Item; rank: number; i: number } | null = null;
    for (const hit of this.index.search(wx - tol, wy - tol, wx + tol, wy + tol)) {
      const i = this.ids[hit];
      if (i === undefined) continue;
      const it = this.dl.items[i]!;
      if (it.layer && !this.layers.has(it.layer)) continue;
      if (fadeAt(it.fade, s) < 0.3) continue;
      if (it.k === 'text' && it.size * s < 3) continue;
      if (it.k === 'image' && Math.max(it.w, it.h) * s < 8) continue;
      const rank = rankOf(it);
      if (!best || rank > best.rank || (rank === best.rank && i > best.i)) best = { ref: it.ref!, item: it, rank, i };
    }
    return best && { ref: best.ref, item: best.item };
  }

  /** Union of the boxes of every visible item carrying this ref (for highlighting). */
  boxOf(ref: string, s: number): [number, number, number, number] | null {
    let box: [number, number, number, number] | null = null;
    for (const i of this.ids) {
      const it = this.dl.items[i]!;
      if (it.ref !== ref || fadeAt(it.fade, s) < 0.3 || (it.layer && !this.layers.has(it.layer))) continue;
      if (it.k === 'path' && it.stroke && !it.fill) continue;
      const b = it.b!;
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : [...b];
    }
    return box;
  }
}
