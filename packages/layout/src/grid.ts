// Occupancy grid: a coarse bitmap of the canvas used to keep labels, images and
// lanes from colliding. Cells are CELL world units square.

export class Grid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private data: Uint8Array;

  constructor(width: number, height: number, cell = 16) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.data = new Uint8Array(this.cols * this.rows);
  }

  private range(x: number, y: number, w: number, h: number) {
    const c0 = Math.max(0, Math.floor(x / this.cell));
    const r0 = Math.max(0, Math.floor(y / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((x + w) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((y + h) / this.cell));
    return { c0, r0, c1, r1 };
  }

  mark(x: number, y: number, w: number, h: number, pad = 0): void {
    const { c0, r0, c1, r1 } = this.range(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
    for (let r = r0; r <= r1; r++) this.data.fill(1, r * this.cols + c0, r * this.cols + c1 + 1);
  }

  isFree(x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0) return false;
    const { c0, r0, c1, r1 } = this.range(x, y, w, h);
    if (c1 >= this.cols || r1 >= this.rows) return false;
    for (let r = r0; r <= r1; r++) {
      const row = r * this.cols;
      for (let c = c0; c <= c1; c++) if (this.data[row + c]) return false;
    }
    return true;
  }

  /** How far right from x the band [y, y+h] stays free, up to `max`. */
  freeRunRight(x: number, y: number, h: number, max: number): number {
    const { r0, r1 } = this.range(x, y, 0, h);
    const c0 = Math.max(0, Math.floor(x / this.cell));
    const cMax = Math.min(this.cols - 1, Math.floor((x + max) / this.cell));
    for (let c = c0; c <= cMax; c++) {
      for (let r = r0; r <= r1; r++) if (this.data[r * this.cols + c]) return Math.max(0, c * this.cell - x);
    }
    return max;
  }

  /** How far left from x the band [y, y+h] stays free, up to `max`. */
  freeRunLeft(x: number, y: number, h: number, max: number): number {
    const { r0, r1 } = this.range(x, y, 0, h);
    const c0 = Math.min(this.cols - 1, Math.floor(x / this.cell) - 1);
    const cMin = Math.max(0, Math.floor((x - max) / this.cell));
    for (let c = c0; c >= cMin; c--) {
      for (let r = r0; r <= r1; r++) if (this.data[r * this.cols + c]) return Math.max(0, x - (c + 1) * this.cell);
    }
    return max;
  }
}
