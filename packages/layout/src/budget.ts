// Density budgets: at each zoom checkpoint, no screen-sized window may hold more than
// `maxReadable` readable marks. Overflow is resolved by demoting the least important
// marks in the crowded window (calm by default, docs/PLAN.md §3).

export interface BudgetMark {
  id: string;
  /** Bounding box in world units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1 = most important. */
  prominence: number;
  /** Is this mark readable (not faded / greeked) at scale s? */
  readableAt: (s: number) => boolean;
}

export interface BudgetCheckpoint {
  /** Scale (CSS px per world unit). */
  s: number;
  /** Viewport in CSS px. */
  viewW: number;
  viewH: number;
  maxReadable: number;
}

/**
 * Returns the ids to demote (one step each) so that every window satisfies its budget.
 * Call repeatedly after applying demotions until it returns nothing.
 */
export function overBudget(marks: BudgetMark[], cp: BudgetCheckpoint): string[] {
  const ww = cp.viewW / cp.s, wh = cp.viewH / cp.s;
  const readable = marks.filter((m) => cp.s > 0 && m.readableAt(cp.s));
  if (readable.length <= cp.maxReadable) return [];
  const minX = Math.min(...readable.map((m) => m.x)), maxX = Math.max(...readable.map((m) => m.x + m.w));
  const minY = Math.min(...readable.map((m) => m.y)), maxY = Math.max(...readable.map((m) => m.y + m.h));
  const demote = new Set<string>();
  // Slide windows with half-window strides; a mark counts if its centre is inside.
  for (let wy = minY - wh / 2; wy < maxY; wy += wh / 2) {
    for (let wx = minX - ww / 2; wx < maxX; wx += ww / 2) {
      const inside = readable.filter((m) => !demote.has(m.id) && m.x + m.w / 2 >= wx && m.x + m.w / 2 < wx + ww && m.y + m.h / 2 >= wy && m.y + m.h / 2 < wy + wh);
      if (inside.length <= cp.maxReadable) continue;
      inside
        .sort((a, b) => b.prominence - a.prominence || b.y - a.y)
        .slice(0, inside.length - cp.maxReadable)
        .forEach((m) => demote.add(m.id));
    }
  }
  return [...demote];
}
