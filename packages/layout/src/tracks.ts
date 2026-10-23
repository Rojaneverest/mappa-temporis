// Lane layout across time.
//
// 1. assignTracks: within each group (e.g. China, Korea, Japan), lanes that continue one
//    another form chains; chains are packed into as few tracks as possible and the tracks
//    are ordered so related lanes sit close together (shorter arrows, fewer crossings).
// 2. flowTracks: each track's horizontal position becomes a smooth function of time.
//    Tracks only take space while something lives in them, so crowded centuries pack
//    tight and quiet ones breathe — lanes drift gently sideways like rivers.

export type RelationKind = 'succeeds' | 'becomes' | 'splits-into' | 'merges-into' | 'conquers' | 'influences';

export interface TrackLane {
  id: string;
  group: string;
  /** Astronomical years; end is exclusive. */
  start: number;
  end: number;
  /** Visual importance used to weigh layout costs (larger = more important). */
  weight: number;
  /** Optional fixed track position within the group. */
  pin?: number;
  relations: { type: RelationKind; targets: string[] }[];
}

export interface TrackAssignment {
  /** lane id → global track index within the region (groups concatenated in order). */
  trackOf: Map<string, number>;
  /** Track ranges per group, in order: [first, count]. */
  groups: { id: string; first: number; count: number }[];
  /** lane ids per track. */
  tracks: string[][];
  /** Chains found (each lane's chain id), for debugging and tests. */
  chainOf: Map<string, number>;
}

/** Lanes in one track must be at least this many years apart. */
const GAP_YEARS = 6;
/** A chain link may overlap its predecessor by this many years (handovers are messy). */
const HANDOVER_YEARS = 4;
const REL_WEIGHT: Record<RelationKind, number> = { succeeds: 3, becomes: 3, 'splits-into': 3, 'merges-into': 2, conquers: 1.5, influences: 0.6 };

export function assignTracks(lanes: TrackLane[], groupOrder: string[]): TrackAssignment {
  const byId = new Map(lanes.map((l) => [l.id, l]));

  // ---- chains: pred → succ edges inside a group
  const succ = new Map<string, string>();
  const pred = new Map<string, string>();
  const link = (a: string, b: string) => {
    const la = byId.get(a), lb = byId.get(b);
    if (!la || !lb || la.group !== lb.group) return;
    if (succ.has(a) || pred.has(b)) return;
    if (lb.start < la.end - HANDOVER_YEARS) return;
    succ.set(a, b);
    pred.set(b, a);
  };
  const ordered = [...lanes].sort((a, b) => b.weight - a.weight);
  for (const l of ordered) {
    for (const r of l.relations) {
      if (r.type === 'becomes') r.targets.forEach((t) => link(l.id, t));
      else if (r.type === 'succeeds') r.targets.forEach((t) => link(t, l.id));
      else if (r.type === 'splits-into' && r.targets[0]) link(l.id, r.targets[0]);
    }
  }
  const chainOf = new Map<string, number>();
  const chains: { id: number; group: string; lanes: TrackLane[]; weight: number; start: number; pin?: number }[] = [];
  for (const l of [...lanes].sort((a, b) => a.start - b.start)) {
    if (pred.has(l.id)) continue;
    const members: TrackLane[] = [];
    for (let cur: string | undefined = l.id; cur; cur = succ.get(cur)) members.push(byId.get(cur)!);
    const id = chains.length;
    members.forEach((m) => chainOf.set(m.id, id));
    chains.push({
      id, group: l.group, lanes: members, start: members[0]!.start,
      weight: members.reduce((s, m) => s + m.weight * Math.sqrt(m.end - m.start), 0),
      pin: members.find((m) => m.pin !== undefined)?.pin,
    });
  }

  // ---- relation weights between chains
  const chainRel = new Map<string, number>();
  const sideRel = new Map<number, number>(); // chain → net pull towards the left (−) / right (+) group edge
  const groupIndex = new Map(groupOrder.map((g, i) => [g, i]));
  for (const l of lanes) {
    for (const r of l.relations) {
      for (const t of r.targets) {
        const other = byId.get(t);
        if (!other) continue;
        const a = chainOf.get(l.id)!, b = chainOf.get(t)!;
        if (a === b) continue;
        const w = REL_WEIGHT[r.type];
        if (other.group === l.group) {
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          chainRel.set(key, (chainRel.get(key) ?? 0) + w);
        } else {
          const dir = Math.sign((groupIndex.get(other.group) ?? 0) - (groupIndex.get(l.group) ?? 0));
          sideRel.set(a, (sideRel.get(a) ?? 0) + dir * w);
          sideRel.set(b, (sideRel.get(b) ?? 0) - dir * w);
        }
      }
    }
  }
  const relBetween = (a: number, b: number) => chainRel.get(a < b ? `${a}:${b}` : `${b}:${a}`) ?? 0;

  const overlaps = (a: TrackLane[], b: TrackLane[]) =>
    a.some((x) => b.some((y) => x.start < y.end + GAP_YEARS && y.start < x.end + GAP_YEARS));

  // ---- per group: greedy packing, then order the tracks
  const trackOf = new Map<string, number>();
  const tracksOut: string[][] = [];
  const groupsOut: TrackAssignment['groups'] = [];
  for (const g of groupOrder) {
    const gChains = chains.filter((c) => c.group === g).sort((a, b) => a.start - b.start || b.weight - a.weight);
    if (!gChains.length) continue;
    const tracks: { chains: typeof gChains; lanes: TrackLane[] }[] = [];
    const chainTrack = new Map<number, number>();
    for (const c of gChains) {
      let best = -1, bestCost = Infinity;
      for (let t = 0; t <= tracks.length; t++) {
        const isNew = t === tracks.length;
        if (!isNew && overlaps(tracks[t]!.lanes, c.lanes)) continue;
        if (!isNew && c.pin !== undefined && tracks[t]!.chains.some((o) => o.pin !== undefined && o.pin !== c.pin)) continue;
        let cost = isNew ? 2.5 : 0;
        for (const [other, ot] of chainTrack) cost += relBetween(c.id, other) * Math.abs(t - ot);
        if (cost < bestCost) { bestCost = cost; best = t; }
      }
      if (best === tracks.length) tracks.push({ chains: [], lanes: [] });
      tracks[best]!.chains.push(c);
      tracks[best]!.lanes.push(...c.lanes);
      chainTrack.set(c.id, best);
    }

    // Order tracks: minimise Σ relation × distance, pull cross-group relations to the facing edge,
    // and keep the heaviest tracks towards the middle (a main line flanked by its neighbours).
    const n = tracks.length;
    const trackWeight = tracks.map((t) => t.chains.reduce((s, c) => s + c.weight, 0));
    const maxW = Math.max(...trackWeight, 1);
    const pinned = tracks.map((t) => t.chains.find((c) => c.pin !== undefined)?.pin);
    const cost = (perm: number[]) => {
      // perm[position] = track
      const pos = new Array<number>(n);
      perm.forEach((t, p) => (pos[t] = p));
      let total = 0;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        let w = 0;
        for (const ca of tracks[a]!.chains) for (const cb of tracks[b]!.chains) w += relBetween(ca.id, cb.id);
        total += w * Math.abs(pos[a]! - pos[b]!);
      }
      for (let t = 0; t < n; t++) {
        const pull = tracks[t]!.chains.reduce((s, c) => s + (sideRel.get(c.id) ?? 0), 0);
        total += pull > 0 ? pull * (n - 1 - pos[t]!) : -pull * pos[t]!;
        total += 0.6 * (trackWeight[t]! / maxW) * Math.abs(pos[t]! - (n - 1) / 2);
        if (pinned[t] !== undefined && pos[t] !== pinned[t]) total += 1e6;
      }
      return total;
    };
    const perm = bestPermutation(n, cost);
    perm.forEach((t, p) => {
      const global = tracksOut.length;
      tracksOut.push(tracks[t]!.lanes.sort((a, b) => a.start - b.start).map((l) => l.id));
      for (const l of tracks[t]!.lanes) trackOf.set(l.id, global);
      void p;
    });
    groupsOut.push({ id: g, first: tracksOut.length - n, count: n });
  }
  return { trackOf, groups: groupsOut, tracks: tracksOut, chainOf };
}

/** Exhaustive search for small n, pairwise-swap hill climbing otherwise. */
function bestPermutation(n: number, cost: (perm: number[]) => number): number[] {
  const identity = Array.from({ length: n }, (_, i) => i);
  if (n <= 1) return identity;
  if (n <= 7) {
    let best = identity, bestCost = cost(identity);
    const permute = (arr: number[], k: number) => {
      if (k === arr.length) {
        const c = cost(arr);
        if (c < bestCost - 1e-9) { bestCost = c; best = [...arr]; }
        return;
      }
      for (let i = k; i < arr.length; i++) {
        [arr[k], arr[i]] = [arr[i]!, arr[k]!];
        permute(arr, k + 1);
        [arr[k], arr[i]] = [arr[i]!, arr[k]!];
      }
    };
    permute([...identity], 0);
    return best;
  }
  let cur = identity, curCost = cost(cur);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const next = [...cur];
      [next[i], next[j]] = [next[j]!, next[i]!];
      const c = cost(next);
      if (c < curCost - 1e-9) { cur = next; curCost = c; improved = true; }
    }
  }
  return cur;
}

// ------------------------------------------------------------------------- flow

export interface FlowInput {
  /** Tracks in left-to-right order with the lanes living in them. */
  tracks: { group: string; lanes: { start: number; end: number; need: number }[] }[];
  year0: number;
  year1: number;
  /** Sample spacing in years. */
  step: number;
  /** Extra space between neighbouring groups. */
  groupGap: number;
  /** Outer padding on each side of the region. */
  pad: number;
  /**
   * 'stable' (default): every track keeps one x for its whole life — straight lanes, like a printed chart.
   * 'flow': tracks take space only while occupied and drift smoothly; compact but restless.
   */
  mode?: 'stable' | 'flow';
}

export interface Flow {
  /** Region width needed to hold its busiest moment. */
  width: number;
  /** Left edge of track i (relative to the region) at astronomical year t. */
  x(track: number, year: number): number;
  /** Width allotted to track i at year t. */
  w(track: number, year: number): number;
}

export function flowTracks(input: FlowInput): Flow {
  const { tracks, year0, year1, step, groupGap, pad } = input;
  if ((input.mode ?? 'stable') === 'stable') {
    const widths = tracks.map((t) => Math.max(0, ...t.lanes.map((l) => l.need)));
    const xs: number[] = [];
    let x = pad;
    tracks.forEach((t, i) => {
      if (i > 0 && t.group !== tracks[i - 1]!.group) x += groupGap;
      xs.push(x);
      x += widths[i]!;
    });
    return { width: x + pad, x: (i) => xs[i]!, w: (i) => widths[i]! };
  }
  const samples = Math.ceil((year1 - year0) / step) + 1;
  const n = tracks.length;
  // need[i][s]: width demanded by track i at sample s (0 when empty).
  const need = tracks.map((t) => {
    const row = new Float64Array(samples);
    for (let s = 0; s < samples; s++) {
      const yr = year0 + s * step;
      // Open a little early and close a little late so lanes have room to arrive.
      for (const l of t.lanes) if (yr >= l.start - 2 * step && yr <= l.end + 2 * step) row[s] = Math.max(row[s]!, l.need);
    }
    // Keep short gaps open: a track that empties for under 80 years would only wiggle.
    const holdSamples = Math.ceil(80 / step);
    for (let s = 0; s < samples; s++) {
      if (row[s]! > 0) continue;
      let a = s; while (a >= 0 && row[a] === 0) a--;
      let b = s; while (b < samples && row[b] === 0) b++;
      if (a >= 0 && b < samples && b - a - 1 <= holdSamples) row[s] = Math.max(row[a]!, row[b]!);
    }
    return row;
  });

  const totals = Array.from({ length: samples }, (_, s) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += need[i]![s]!;
    for (let i = 1; i < n; i++) if (tracks[i]!.group !== tracks[i - 1]!.group) sum += groupGap;
    return sum;
  });
  const width = Math.max(...totals) + 2 * pad;

  // Raw positions: occupied tracks share out spare room (up to +80% each), the rest centres the group.
  const raw = tracks.map(() => new Float64Array(samples));
  const rawW = tracks.map(() => new Float64Array(samples));
  for (let s = 0; s < samples; s++) {
    const spare = width - 2 * pad - totals[s]!;
    const sumNeed = need.reduce((acc, row) => acc + row[s]!, 0) || 1;
    const bonus = need.map((row) => Math.min(row[s]! * 0.8, (spare * row[s]!) / sumNeed));
    const used = totals[s]! + bonus.reduce((a, b) => a + b, 0);
    let x = pad + (width - 2 * pad - used) / 2;
    for (let i = 0; i < n; i++) {
      if (i > 0 && tracks[i]!.group !== tracks[i - 1]!.group) x += groupGap;
      raw[i]![s] = x;
      rawW[i]![s] = need[i]![s]! + bonus[i]!;
      x += rawW[i]![s]!;
    }
  }

  // Smooth over time (two passes of a ~90-year triangular kernel) so drifts are gentle.
  const smooth = (row: Float64Array) => {
    const k = Math.max(1, Math.round(45 / step));
    let cur = row;
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float64Array(samples);
      for (let s = 0; s < samples; s++) {
        let acc = 0, wsum = 0;
        for (let d = -k; d <= k; d++) {
          const j = Math.min(samples - 1, Math.max(0, s + d));
          const wt = k + 1 - Math.abs(d);
          acc += cur[j]! * wt;
          wsum += wt;
        }
        out[s] = acc / wsum;
      }
      cur = out;
    }
    return cur;
  };
  const xs = raw.map(smooth);
  const ws = rawW.map(smooth);

  const at = (rows: Float64Array[], i: number, year: number) => {
    const f = Math.min(samples - 1, Math.max(0, (year - year0) / step));
    const s0 = Math.floor(f), s1 = Math.min(samples - 1, s0 + 1);
    const t = f - s0;
    return rows[i]![s0]! * (1 - t) + rows[i]![s1]! * t;
  };
  return { width, x: (i, year) => at(xs, i, year), w: (i, year) => at(ws, i, year) };
}
