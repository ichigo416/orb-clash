/**
 * A uniform spatial hash grid used to avoid O(n^2) collision checks.
 *
 * Every entity is inserted into exactly one cell, keyed by the cell its
 * center point falls into. To find everything within `reach` of a point,
 * we scan every cell whose bounding box could contain a point that close
 * — no more, no less — and return their contents directly. Because each
 * entity lives in exactly one cell, results never contain duplicates.
 *
 * This turns "check every player against every other player" into
 * "check every player against only the handful of players near it",
 * which is the standard first optimization for any real-time game with
 * more than a few dozen entities. A quadtree would adapt better to
 * clustered/uneven entity density, but a uniform grid is simpler to
 * reason about and plenty fast at this game's scale.
 */
export class SpatialGrid<T extends { id: string; x: number; y: number }> {
  private cells = new Map<string, T[]>();

  constructor(private cellSize: number) {}

  clear() {
    this.cells.clear();
  }

  insert(entity: T) {
    const key = this.cellKey(entity.x, entity.y);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(entity);
    } else {
      this.cells.set(key, [entity]);
    }
  }

  /** Returns every entity whose cell could contain something within `reach` of (x, y). */
  queryRadius(x: number, y: number, reach: number): T[] {
    const minCx = Math.floor((x - reach) / this.cellSize);
    const maxCx = Math.floor((x + reach) / this.cellSize);
    const minCy = Math.floor((y - reach) / this.cellSize);
    const maxCy = Math.floor((y + reach) / this.cellSize);

    const results: T[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(`${cx},${cy}`);
        if (bucket) results.push(...bucket);
      }
    }
    return results;
  }

  private cellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }
}