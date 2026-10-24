// World columns (decision 48): every succession chain is one straight column, but a column
// only takes room while it is alive. Chains are kept in west → east order and separated
// from every chain they overlap in time; within those constraints each one sits as close as
// it can to an even ("justified") spread of whatever is alive across its lifetime. The sheet
// is then as wide as the world's busiest moment, not the sum of every region's busiest
// moment, and quiet centuries spread out instead of leaving one region's column empty.
//
// The solver is the "satisfy" pass of VPSC (Dwyer, Marriott & Stuckey 2005): variables are
// merged into blocks along violated separation constraints, each block sitting at the
// weighted mean of its members' desired positions.

export interface ColumnSpan {
  /** World y range in which this piece of the column is alive (already padded). */
  y0: number;
  y1: number;
  /** Width this piece needs (lane, margins and label room). */
  need: number;
}

export interface ColumnItem {
  id: string;
  /** West → east order: constraints only run from lower to higher. */
  order: number;
  /** Region index; a change of region adds `regionGap`. */
  region: number;
  /** Group within the region; a change of group adds `groupGap`. */
  group: string;
  /** The column's pieces over time (one per lane in the chain). */
  spans: ColumnSpan[];
  /** How strongly this column wants its desired position (long-lived columns hold their place). */
  weight: number;
}

export interface ColumnInput {
  items: ColumnItem[];
  regionGap: number;
  groupGap: number;
  /** Sampling step in world y for the justified spread. */
  step: number;
  /** Related columns (a split, a succession) that should sit side by side: [a, b, strength 0–1]. */
  pairs?: [string, string, number][];
}

export interface ColumnLayout {
  /** Left edge of each column. */
  x: Map<string, number>;
  /** Total width (left edge 0). */
  width: number;
  /** Width of the busiest moment, before spreading. */
  busiest: number;
  /** Narrowest possible width: every column packed as far left as the constraints allow. */
  packed: number;
}

const top = (it: ColumnItem) => Math.min(...it.spans.map((s) => s.y0));
const bottom = (it: ColumnItem) => Math.max(...it.spans.map((s) => s.y1));
const needAt = (it: ColumnItem, y: number) => Math.max(0, ...it.spans.filter((s) => y >= s.y0 && y < s.y1).map((s) => s.need));
const gapBetween = (a: ColumnItem, b: ColumnItem, inp: ColumnInput) => (a.region !== b.region ? inp.regionGap : a.group !== b.group ? inp.groupGap : 0);

interface Constraint { left: number; right: number; gap: number }

/** For items sorted west → east: each one's constraints from earlier items it overlaps in time. */
function constraints(items: ColumnItem[], input: Pick<ColumnInput, 'regionGap' | 'groupGap'>): Constraint[][] {
  const incoming: Constraint[][] = items.map(() => []);
  for (let j = 0; j < items.length; j++) {
    const b = items[j]!;
    for (let i = 0; i < j; i++) {
      const a = items[i]!;
      // The widest piece of `a` alive while `b` is.
      let need = 0;
      for (const sa of a.spans) for (const sb of b.spans) if (sa.y0 < sb.y1 && sb.y0 < sa.y1) need = Math.max(need, sa.need);
      if (need) incoming[j]!.push({ left: i, right: j, gap: need + gapBetween(a, b, input as ColumnInput) });
    }
  }
  return incoming;
}

function longestPath(items: ColumnItem[], incoming: Constraint[][]): number {
  const left = new Float64Array(items.length);
  let packed = 0;
  for (let j = 0; j < items.length; j++) {
    for (const c of incoming[j]!) left[j] = Math.max(left[j]!, left[c.left]! + c.gap);
    packed = Math.max(packed, left[j]! + Math.max(...items[j]!.spans.map((s) => s.need)));
  }
  return packed;
}

/** The narrowest width these columns can take in their current west → east order. */
export function packedWidth(items: ColumnItem[], input: Pick<ColumnInput, 'regionGap' | 'groupGap'>): number {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  return longestPath(sorted, constraints(sorted, input));
}

export function layoutColumns(input: ColumnInput): ColumnLayout {
  const items = [...input.items].sort((a, b) => a.order - b.order);
  const n = items.length;
  if (!n) return { x: new Map(), width: 0, busiest: 0, packed: 0 };
  const y0 = Math.min(...items.map(top)), y1 = Math.max(...items.map(bottom));

  // ---- the justified spread at each sample: alive columns share the busiest moment's width
  const samples: number[] = [];
  for (let y = y0; y <= y1; y += input.step) samples.push(y);
  const rows = samples.map((y) => {
    const alive = items.map((it, i) => ({ i, need: needAt(it, y) })).filter((a) => a.need > 0);
    let total = 0;
    const starts: number[] = [];
    alive.forEach((a, k) => {
      if (k > 0) total += gapBetween(items[alive[k - 1]!.i]!, items[a.i]!, input);
      starts.push(total);
      total += a.need;
    });
    return { alive, starts, total };
  });
  const busiest = Math.max(...rows.map((r) => r.total));
  const sum = new Float64Array(n), cnt = new Float64Array(n);
  for (const r of rows) {
    if (!r.alive.length) continue;
    const k = busiest / r.total;
    r.alive.forEach((a, j) => {
      // Each slot (and the gap before it) is stretched by k; the column centres in its slot.
      const slot = a.need * k;
      sum[a.i] = sum[a.i]! + r.starts[j]! * k + (slot - a.need) / 2;
      cnt[a.i] = cnt[a.i]! + 1;
    });
  }
  const desired = items.map((it, i) => (cnt[i] ? sum[i]! / cnt[i]! : 0));
  // Related columns give up some of the even spread to sit next to each other.
  const indexOf = new Map(items.map((it, i) => [it.id, i]));
  for (let round = 0; round < 6; round++) {
    for (const [ida, idb, k] of input.pairs ?? []) {
      let a = indexOf.get(ida), b = indexOf.get(idb);
      if (a === undefined || b === undefined || a === b) continue;
      if (a > b) [a, b] = [b, a];
      const gap = Math.max(...items[a]!.spans.map((q) => q.need)) + gapBetween(items[a]!, items[b]!, input);
      const err = desired[b]! - desired[a]! - gap;
      if (err <= 0) continue;
      desired[a] = desired[a]! + (err * k) / 2;
      desired[b] = desired[b]! - (err * k) / 2;
    }
  }

  // ---- separation constraints: a column clears every earlier column it overlaps in time
  const incoming = constraints(items, input);
  const packed = longestPath(items, incoming);

  // ---- VPSC satisfy: merge blocks along the most violated incoming constraint
  const offset = new Float64Array(n);
  const blockOf = new Int32Array(n);
  const blocks = items.map((it, i) => ({ vars: [i], wsum: it.weight, wd: it.weight * desired[i]!, posn: desired[i]! }));
  items.forEach((_, i) => (blockOf[i] = i));
  const pos = (v: number) => blocks[blockOf[v]!]!.posn + offset[v]!;
  for (let v = 0; v < n; v++) {
    let b = blockOf[v]!;
    for (;;) {
      let worst: Constraint | null = null, worstV = 1e-6;
      for (const u of blocks[b]!.vars) {
        for (const c of incoming[u]!) {
          if (c.left > v || blockOf[c.left] === b) continue;
          const viol = pos(c.left) + c.gap - pos(c.right);
          if (viol > worstV) { worstV = viol; worst = c; }
        }
      }
      if (!worst) break;
      const bl = blockOf[worst.left]!;
      const dist = offset[worst.left]! + worst.gap - offset[worst.right]!;
      const B = blocks[b]!, L = blocks[bl]!;
      for (const x of B.vars) { offset[x] = offset[x]! + dist; blockOf[x] = bl; L.vars.push(x); }
      L.wsum += B.wsum;
      L.wd += B.wd - dist * B.wsum;
      L.posn = L.wd / L.wsum;
      B.vars = [];
      b = bl;
    }
  }
  // Safety sweep: the block pass can leave small violations to columns merged earlier.
  const xs = items.map((_, i) => pos(i));
  for (let j = 0; j < n; j++) for (const c of incoming[j]!) xs[j] = Math.max(xs[j]!, xs[c.left]! + c.gap);

  const minX = Math.min(...xs);
  const x = new Map<string, number>();
  let width = 0;
  items.forEach((it, i) => {
    const v = xs[i]! - minX;
    x.set(it.id, v);
    width = Math.max(width, v + Math.max(...it.spans.map((s) => s.need)));
  });
  return { x, width, busiest, packed };
}

/** True when two columns overlap in time and in x (for tests). */
export function overlaps(a: ColumnItem, b: ColumnItem, xa: number, xb: number): boolean {
  for (const sa of a.spans) for (const sb of b.spans) {
    if (!(sa.y0 < sb.y1 && sb.y0 < sa.y1)) continue;
    if (xa < xb + sb.need - 1e-6 && xb < xa + sa.need - 1e-6) return true;
  }
  return false;
}
