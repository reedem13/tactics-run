// Mulberry32. Same seed, same sequence, in the server and the headless check.

export function makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngInt(rng, n) {
  return Math.floor(rng() * n);
}

export function pick(rng, arr) {
  return arr[rngInt(rng, arr.length)];
}

export function seedLabel(seed) {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

export function parseSeed(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return null;
  if (/^[0-9a-f]{1,8}$/.test(raw)) {
    const value = parseInt(raw, 16) >>> 0;
    return value || 1;
  }
  return hashSeed(raw) || 1;
}

export function forkRng(seed, salt) {
  return makeRng(hashSeed(`${seed >>> 0}:${salt}`));
}
