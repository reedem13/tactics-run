import { DIRS } from './grid.js';
import { rngInt } from './rng.js';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function canRaise(hmap, x, z) {
  const h = hmap[z][x];
  if (h >= 2) return false;
  for (const dir of DIRS) {
    const nx = x + dir.x;
    const nz = z + dir.z;
    if (nz < 0 || nx < 0 || nz >= hmap.length || nx >= hmap[0].length) continue;
    if (hmap[nz][nx] < h) return false;
  }
  return true;
}

function connected(width, depth, walkable) {
  const start = [];
  for (let x = 0; x < width; x++) if (walkable[0][x]) start.push([x, 0]);
  const seen = new Set(start.map(([x, z]) => `${x},${z}`));
  const q = start.slice();
  while (q.length) {
    const [x, z] = q.shift();
    for (const dir of DIRS) {
      const nx = x + dir.x;
      const nz = z + dir.z;
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
      if (!walkable[nz][nx]) continue;
      const k = `${nx},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([nx, nz]);
    }
  }
  for (let x = 0; x < width; x++) {
    if (walkable[depth - 1][x] && !seen.has(`${x},${depth - 1}`)) return false;
    if (walkable[0][x] && !seen.has(`${x},0`)) return false;
  }
  return true;
}

export function generateMap(rng, width = 8, depth = 8) {
  const hmap = Array.from({ length: depth }, () => Array(width).fill(0));
  const types = Array.from({ length: depth }, () => Array(width).fill('grass'));
  const plateaus = 2 + rngInt(rng, 2);
  for (let p = 0; p < plateaus; p++) {
    let x = 1 + rngInt(rng, width - 2);
    let z = 2 + rngInt(rng, Math.max(1, depth - 4));
    const steps = 4 + rngInt(rng, 5);
    for (let i = 0; i < steps; i++) {
      if (canRaise(hmap, x, z)) hmap[z][x] += 1;
      const dir = DIRS[rngInt(rng, 4)];
      x = clamp(x + dir.x, 1, width - 2);
      z = clamp(z + dir.z, 2, depth - 3);
    }
  }
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      if (z === 0 || z === depth - 1) {
        hmap[z][x] = 0;
        types[z][x] = 'stone';
        continue;
      }
      if (hmap[z][x] > 0) types[z][x] = 'stone';
      else if (rng() < 0.18) types[z][x] = 'mud';
    }
  }
  const walkable = () => types.map((row) => row.map((type) => type !== 'water'));
  let puddles = 0;
  for (let attempt = 0; attempt < 8 && puddles < 3; attempt++) {
    const x = rngInt(rng, width);
    const z = 2 + rngInt(rng, Math.max(1, depth - 4));
    if (hmap[z][x] !== 0 || types[z][x] === 'water') continue;
    types[z][x] = 'water';
    if (!connected(width, depth, walkable())) types[z][x] = 'mud';
    else puddles += 1;
  }
  const tiles = [];
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ x, z, h: hmap[z][x], type: types[z][x] });
    }
  }
  return { width, depth, tiles };
}

export function spreadXs(count, width) {
  if (count <= 1) return [Math.floor((width - 1) / 2)];
  const xs = [];
  for (let i = 0; i < count; i++) xs.push(Math.round((i * (width - 1)) / (count - 1)));
  return xs;
}

// Evenly spaced columns. Inset from the corners when a gap of two tiles
// still fits, so a two-player fight is not stuck on the clipped edges.
export function spacedXs(count, width) {
  const n = Math.max(0, count | 0);
  const w = Math.max(1, width | 0);
  if (n <= 1) return [Math.floor((w - 1) / 2)];
  if (n >= w) return Array.from({ length: w }, (_, i) => i);
  let lo = 0;
  let hi = w - 1;
  const minSpan = (n - 1) * 2;
  while (hi - lo > minSpan && lo < Math.floor((w - n) / 2)) {
    if ((hi - 1) - (lo + 1) >= minSpan) {
      lo += 1;
      hi -= 1;
    } else break;
  }
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(Math.round(lo + (i * (hi - lo)) / (n - 1)));
  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i] <= xs[i - 1]) xs[i] = Math.min(hi, xs[i - 1] + 1);
  }
  return xs;
}

function tileWalkable(tiles, x, z) {
  const tile = tiles.find((entry) => entry.x === x && entry.z === z);
  return !!(tile && tile.type !== 'water');
}

// Party pads on the south edge, enemy pads on the north edge. Both rows are
// kept clear of water by generateMap, so these are standing tiles with a
// path between them.
export function planSpawns(tiles, width, depth, partyCount, enemyCount) {
  const place = (count, z) => spacedXs(count, width).map((x) => {
    if (tileWalkable(tiles, x, z)) return { x, z };
    for (let delta = 1; delta < width; delta += 1) {
      if (x + delta < width && tileWalkable(tiles, x + delta, z)) return { x: x + delta, z };
      if (x - delta >= 0 && tileWalkable(tiles, x - delta, z)) return { x: x - delta, z };
    }
    return { x, z };
  });
  return {
    party: place(partyCount, 0),
    enemy: place(enemyCount, Math.max(0, depth - 1)),
  };
}
