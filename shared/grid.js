// Tile math for the march. Movement is orthogonal. Attacks use chebyshev
// distance, so a diagonal neighbour is in melee range.

export const DIRS = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];

export const DIR_NAMES = ['north', 'east', 'south', 'west'];

export function key(x, z) {
  return `${x},${z}`;
}

export function chebyshev(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

export function inBounds(battle, x, z) {
  return x >= 0 && z >= 0 && x < battle.width && z < battle.depth;
}

export function tileAt(battle, x, z) {
  if (!inBounds(battle, x, z)) return null;
  return battle.tiles.find((tile) => tile.x === x && tile.z === z) || null;
}

export function unitAt(battle, x, z) {
  return battle.units.find((unit) => unit.x === x && unit.z === z && occupies(unit)) || null;
}

export function occupies(unit) {
  if (!unit) return false;
  if (unit.side === 'enemy' && unit.downed) return false;
  return true;
}

export function stepCost(fromH, toH, jump) {
  const dh = toH - fromH;
  if (dh > jump) return Infinity;
  if (fromH - toH > jump + 1) return Infinity;
  return 1 + Math.max(0, dh);
}

export function facingFromDelta(dx, dz) {
  if (dx === 0 && dz === 0) return null;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  if (dz > 0) return 0;
  if (dz < 0) return 2;
  return dx > 0 ? 1 : 3;
}

export function attackSide(attacker, target) {
  const dx = attacker.x - target.x;
  const dz = attacker.z - target.z;
  if (dx === 0 && dz === 0) return 'front';
  const back = DIRS[(target.facing + 2) % 4];
  const front = DIRS[target.facing];
  const left = DIRS[(target.facing + 3) % 4];
  const right = DIRS[(target.facing + 1) % 4];
  const options = [
    ['back', dx * back.x + dz * back.z],
    ['flank', dx * left.x + dz * left.z],
    ['flank', dx * right.x + dz * right.z],
    ['front', dx * front.x + dz * front.z],
  ];
  let best = 'front';
  let score = -Infinity;
  for (const [name, value] of options) {
    if (value > score) {
      score = value;
      best = name;
    }
  }
  return best;
}

export function awayDir(from, to) {
  return facingFromDelta(to.x - from.x, to.z - from.z) ?? 0;
}

export function inRange(battle, origin, x, z, ability) {
  if (!inBounds(battle, x, z)) return false;
  if (ability.aim === 'self') return x === origin.x && z === origin.z;
  const dist = chebyshev(origin.x, origin.z, x, z);
  if (dist < 1) return false;
  const from = tileAt(battle, origin.x, origin.z);
  const to = tileAt(battle, x, z);
  const oh = from ? from.h : 0;
  const th = to ? to.h : 0;
  const jump = origin.jump ?? 1;
  if (ability.melee) return dist === 1 && Math.abs(th - oh) <= jump;
  const reach = (ability.range ?? 1) + (oh - th);
  if (dist > reach) return false;
  if (th - oh > jump + 2) return false;
  return true;
}

export function aoeTiles(battle, x, z, radius) {
  const r = radius || 0;
  const tiles = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) > r) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(battle, nx, nz)) continue;
      tiles.push({ x: nx, z: nz, primary: dx === 0 && dz === 0 });
    }
  }
  return tiles;
}

// Tiles this unit can stop on. Paths may pass through living allies.
export function reachable(battle, unit, budget) {
  const startKey = key(unit.x, unit.z);
  const best = new Map([[startKey, 0]]);
  const prev = new Map();
  const open = [{ x: unit.x, z: unit.z, cost: 0 }];
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost || a.x - b.x || a.z - b.z);
    const cur = open.shift();
    const here = key(cur.x, cur.z);
    if (cur.cost !== best.get(here)) continue;
    for (const dir of DIRS) {
      const nx = cur.x + dir.x;
      const nz = cur.z + dir.z;
      if (!inBounds(battle, nx, nz)) continue;
      const tile = tileAt(battle, nx, nz);
      if (!tile || tile.type === 'water') continue;
      const fromTile = tileAt(battle, cur.x, cur.z);
      const cost = stepCost(fromTile.h, tile.h, unit.jump ?? 1);
      if (!Number.isFinite(cost)) continue;
      const next = cur.cost + cost;
      if (next > budget) continue;
      const occ = unitAt(battle, nx, nz);
      if (occ && occ.id !== unit.id) {
        const ally = occ.side === unit.side && !occ.downed;
        if (!ally) continue;
      }
      const nk = key(nx, nz);
      if (next >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, next);
      prev.set(nk, { x: cur.x, z: cur.z });
      open.push({ x: nx, z: nz, cost: next });
    }
  }
  const stops = [];
  for (const [k, cost] of best) {
    if (k === startKey) continue;
    const [x, z] = k.split(',').map(Number);
    const occ = unitAt(battle, x, z);
    if (occ && occ.id !== unit.id) continue;
    const path = [];
    let cx = x;
    let cz = z;
    const guard = new Set();
    while (prev.has(key(cx, cz)) && !guard.has(key(cx, cz))) {
      guard.add(key(cx, cz));
      path.push({ x: cx, z: cz });
      const p = prev.get(key(cx, cz));
      cx = p.x;
      cz = p.z;
    }
    path.reverse();
    stops.push({ x, z, cost, path });
  }
  stops.sort((a, b) => a.cost - b.cost || a.x - b.x || a.z - b.z);
  return stops;
}

export function slide(battle, unit, dirIndex, dist) {
  const dir = DIRS[dirIndex];
  let x = unit.x;
  let z = unit.z;
  const path = [];
  for (let i = 0; i < dist; i++) {
    const nx = x + dir.x;
    const nz = z + dir.z;
    if (!inBounds(battle, nx, nz)) break;
    const tile = tileAt(battle, nx, nz);
    if (!tile || tile.type === 'water') break;
    const occ = unitAt(battle, nx, nz);
    if (occ && occ.id !== unit.id) break;
    const fromH = tileAt(battle, x, z).h;
    if (tile.h - fromH > 1) break;
    x = nx;
    z = nz;
    path.push({ x, z });
  }
  return { x, z, path };
}
