import { WORLD, FURNITURE, PLAYER_RADIUS, PROXIMITY_RADIUS } from './world.js';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const inRange = (a, b, radius = PROXIMITY_RADIUS) => distance(a, b) <= radius;

export function normalizedDirection(keys) {
  const dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  const len = Math.hypot(dx, dy);
  return len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
}

export function validPosition({ x, y }, radius = PLAYER_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < radius + 6 || y < radius + 6 || x > WORLD.width - radius - 6 || y > WORLD.height - radius - 6) return false;
  // Circle vs closest point of AABB: accurate collision without axis-dependent gaps.
  return !FURNITURE.some((item) => {
    const closestX = clamp(x, item.x, item.x + item.w);
    const closestY = clamp(y, item.y, item.y + item.h);
    return Math.hypot(x - closestX, y - closestY) < radius + 5;
  });
}

/** Move as far as possible, sliding along desks instead of walking through them. */
export function moveWithCollisions(start, desired) {
  if (validPosition(desired)) return desired;
  const xFirst = { x: desired.x, y: start.y };
  const yFirst = { x: start.x, y: desired.y };
  if (validPosition(xFirst)) return xFirst;
  if (validPosition(yFirst)) return yFirst;
  return start;
}

const CELL = 24;
const COLS = WORLD.width / CELL;
const ROWS = WORLD.height / CELL;
const cell = (x, y) => ({ c: clamp(Math.floor(x / CELL), 0, COLS - 1), r: clamp(Math.floor(y / CELL), 0, ROWS - 1) });
const midpoint = (c, r) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });
const keyOf = (c, r) => r * COLS + c;
const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

/** A* allows click-to-walk around objects, rather than stopping inside furniture. */
export function findPath(start, goal) {
  if (!validPosition(start)) return [];
  let dest = goal;
  if (!validPosition(dest)) {
    // Snap clicks on furniture to the nearest accessible grid cell.
    let best = Infinity;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const pos = midpoint(c, r);
      const d = distance(pos, goal);
      if (d < best && validPosition(pos)) { dest = pos; best = d; }
    }
  }
  const s = cell(start.x, start.y);
  const target = cell(dest.x, dest.y);
  const first = keyOf(s.c, s.r);
  const last = keyOf(target.c, target.r);
  if (first === last) return [dest];
  const frontier = [{ id: first, c: s.c, r: s.r, score: 0 }];
  const previous = new Map();
  const costs = new Map([[first, 0]]);
  const visited = new Set();
  const heuristic = (c, r) => Math.hypot(c - target.c, r - target.r);
  let found = false;
  while (frontier.length) {
    frontier.sort((a, b) => a.score - b.score);
    const current = frontier.shift();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if (current.id === last) { found = true; break; }
    for (const [dc, dr] of offsets) {
      const nc = current.c + dc; const nr = current.r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const nextPos = midpoint(nc, nr);
      if (!validPosition(nextPos)) continue;
      // Prevent slipping diagonally between corners of adjacent obstacles.
      if (dc && dr && (!validPosition(midpoint(current.c + dc, current.r)) || !validPosition(midpoint(current.c, current.r + dr)))) continue;
      const id = keyOf(nc, nr);
      const newCost = costs.get(current.id) + Math.hypot(dc, dr);
      if (newCost < (costs.get(id) ?? Infinity)) {
        costs.set(id, newCost); previous.set(id, current.id);
        frontier.push({ id, c: nc, r: nr, score: newCost + heuristic(nc, nr) });
      }
    }
  }
  if (!found) return [];
  const points = [];
  let cursor = last;
  while (cursor !== first) {
    const r = Math.floor(cursor / COLS); const c = cursor % COLS;
    points.unshift(midpoint(c, r));
    cursor = previous.get(cursor);
    if (cursor === undefined) return [];
  }
  // Start cell could be near furniture: first waypoint will be valid grid center.
  if (validPosition(dest) && distance(points.at(-1), dest) > 3 && segmentClear(points.at(-1), dest)) points.push(dest);
  return points;
}

/** Segment visibility lets us reduce path jitter through aligned free cells. */
export function segmentClear(a, b) {
  const d = distance(a, b);
  const samples = Math.max(1, Math.ceil(d / 7));
  for (let i = 0; i <= samples; i++) {
    const p = { x: a.x + (b.x - a.x) * i / samples, y: a.y + (b.y - a.y) * i / samples };
    if (!validPosition(p)) return false;
  }
  return true;
}

export function simplifyPath(start, path) {
  const output = [];
  let current = start;
  for (let i = 0; i < path.length;) {
    let best = i;
    for (let j = path.length - 1; j > i; j--) {
      if (segmentClear(current, path[j])) { best = j; break; }
    }
    output.push(path[best]); current = path[best]; i = best + 1;
  }
  return output;
}
