import { describe, expect, it } from 'vitest';
import { assignTracks, flowTracks, type TrackLane } from './tracks.ts';
import { overBudget, type BudgetMark } from './budget.ts';
import { Grid } from './grid.ts';

const lane = (id: string, start: number, end: number, extra: Partial<TrackLane> = {}): TrackLane =>
  ({ id, group: 'g', start, end, weight: 1, relations: [], ...extra });

describe('assignTracks', () => {
  it('keeps a succession chain in one track and never overlaps lanes in a track', () => {
    const lanes = [
      lane('qin', -220, -205, { relations: [{ type: 'becomes', targets: ['han'] }] }),
      lane('han', -201, 221, { weight: 6 }),
      lane('chu', -1000, -222),
      lane('wei', 220, 266, { relations: [{ type: 'succeeds', targets: ['han'] }] }),
      lane('wu', 222, 281),
    ];
    const a = assignTracks(lanes, ['g']);
    expect(a.trackOf.get('qin')).toBe(a.trackOf.get('han'));
    expect(a.trackOf.get('wei')).toBe(a.trackOf.get('han'));
    for (const t of a.tracks) {
      const ls = t.map((id) => lanes.find((l) => l.id === id)!).sort((x, y) => x.start - y.start);
      for (let i = 1; i < ls.length; i++) expect(ls[i]!.start).toBeGreaterThanOrEqual(ls[i - 1]!.end - 4);
    }
  });

  it('places related chains next to each other', () => {
    const lanes = [
      lane('a', 0, 100, { relations: [{ type: 'conquers', targets: ['d'] }] }),
      lane('b', 0, 100),
      lane('c', 0, 100),
      lane('d', 0, 100),
    ];
    const a = assignTracks(lanes, ['g']);
    expect(Math.abs(a.trackOf.get('a')! - a.trackOf.get('d')!)).toBe(1);
  });

  it('respects pins', () => {
    const lanes = [lane('a', 0, 100, { pin: 2 }), lane('b', 0, 100), lane('c', 0, 100)];
    expect(assignTracks(lanes, ['g']).trackOf.get('a')).toBe(2);
  });
});

describe('flowTracks', () => {
  it('stable mode gives each track one x for its whole life', () => {
    const flow = flowTracks({
      tracks: [{ group: 'a', lanes: [{ start: 0, end: 100, need: 300 }] }, { group: 'b', lanes: [{ start: 50, end: 100, need: 200 }] }],
      year0: 0, year1: 100, step: 10, groupGap: 40, pad: 10,
    });
    expect([flow.x(0, 0), flow.x(0, 90), flow.x(1, 0), flow.x(1, 90)]).toEqual([10, 10, 350, 350]);
    expect(flow.width).toBe(560);
  });

  it('collapses empty tracks and keeps tracks ordered', () => {
    const flow = flowTracks({
      tracks: [
        { group: 'g', lanes: [{ start: 0, end: 500, need: 400 }] },
        { group: 'g', lanes: [{ start: 300, end: 500, need: 400 }] },
      ],
      year0: 0, year1: 500, step: 10, groupGap: 0, pad: 0, mode: 'flow',
    });
    expect(flow.width).toBe(800);
    for (let y = 0; y <= 500; y += 25) expect(flow.x(1, y)).toBeGreaterThanOrEqual(flow.x(0, y));
    // Early on track 1 is empty, so track 0 gets the extra room.
    expect(flow.w(0, 0)).toBeGreaterThan(flow.w(0, 480));
  });
});

describe('overBudget', () => {
  it('demotes the least important marks in a crowded window', () => {
    const marks: BudgetMark[] = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`, x: i * 10, y: 0, w: 5, h: 5, prominence: i < 4 ? 2 : 3, readableAt: () => true,
    }));
    const out = overBudget(marks, { s: 1, viewW: 1000, viewH: 1000, maxReadable: 8 });
    expect(out).toHaveLength(4);
    expect(out.every((id) => Number(id.slice(1)) >= 4)).toBe(true);
  });
});

describe('Grid', () => {
  it('tracks free space', () => {
    const g = new Grid(1000, 1000, 10);
    g.mark(100, 100, 50, 50);
    expect(g.isFree(0, 0, 90, 90)).toBe(true);
    expect(g.isFree(120, 120, 10, 10)).toBe(false);
    expect(g.freeRunRight(0, 110, 10, 500)).toBe(100);
  });

  it('measures how full a box is', () => {
    const g = new Grid(1000, 1000, 10);
    g.mark(0, 0, 395, 395); // 40×40 cells
    const occ = g.occupancy(4);
    expect(occ(0, 0, 400, 400)).toBeCloseTo(1);
    expect(occ(400, 400, 400, 400)).toBe(0);
    expect(occ(0, 0, 800, 800)).toBeCloseTo(0.25);
  });
});
