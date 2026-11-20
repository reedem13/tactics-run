// Placeholder art map. Paul swaps models later; gameplay never reads these
// meshes. Every anchor stores `userData.artGroup` as `units/<class>` or
// `tiles/<type>` and keeps its drawable children in a child group named
// `visual`. Replace that group's children. Keep the anchor where it is:
// tile anchors sit on the ground (y = 0) at the tile center, unit anchors
// sit at the feet. Unit anchors are rotated to face +Z in local space, so a
// replacement model should face +Z.

export const UNIT_VISUALS = {
  wizard: {
    group: 'units/wizard',
    label: 'WZ',
    color: '#6d5ef0',
    parts: [
      { shape: 'capsule', color: '#6d5ef0', args: [0.24, 0.46, 4, 8], y: 0.58 },
      { shape: 'cylinder', color: '#d9d4ff', args: [0.16, 0.2, 0.16, 8], y: 1.02 },
    ],
  },
  rogue: {
    group: 'units/rogue',
    label: 'RG',
    color: '#2f9d6a',
    parts: [
      { shape: 'capsule', color: '#2f9d6a', args: [0.18, 0.52, 4, 8], y: 0.56 },
      { shape: 'box', color: '#123c2c', args: [0.28, 0.08, 0.16], y: 0.72, z: 0.12 },
    ],
  },
  knight: {
    group: 'units/knight',
    label: 'KN',
    color: '#4e6e90',
    parts: [
      { shape: 'box', color: '#4e6e90', args: [0.5, 0.62, 0.36], y: 0.42 },
      { shape: 'box', color: '#c5d0dc', args: [0.34, 0.16, 0.08], y: 0.62, z: 0.2 },
    ],
  },
  grunt: {
    group: 'units/grunt',
    label: 'GR',
    color: '#8d4b3c',
    parts: [
      { shape: 'box', color: '#8d4b3c', args: [0.42, 0.5, 0.34], y: 0.36 },
    ],
  },
  archer: {
    group: 'units/archer',
    label: 'AR',
    color: '#a86b3c',
    parts: [
      { shape: 'cylinder', color: '#a86b3c', args: [0.2, 0.22, 0.7, 8], y: 0.46 },
    ],
  },
  brute: {
    group: 'units/brute',
    label: 'BR',
    color: '#6e2e2e',
    parts: [
      { shape: 'box', color: '#6e2e2e', args: [0.62, 0.7, 0.48], y: 0.46 },
    ],
  },
  hexer: {
    group: 'units/hexer',
    label: 'HX',
    color: '#6d3d78',
    parts: [
      { shape: 'capsule', color: '#6d3d78', args: [0.22, 0.5, 4, 8], y: 0.58 },
    ],
  },
  warden: {
    group: 'units/warden',
    label: 'WD',
    color: '#c2a15a',
    parts: [
      { shape: 'box', color: '#c2a15a', args: [0.66, 0.78, 0.46], y: 0.5 },
      { shape: 'cylinder', color: '#efe4c4', args: [0.18, 0.18, 0.16, 8], y: 1.02 },
    ],
  },
};

export const TILE_VISUALS = {
  grass: { group: 'tiles/grass', color: '#5f7d49', top: '#6e9456' },
  stone: { group: 'tiles/stone', color: '#8b8174', top: '#a89b8c' },
  mud: { group: 'tiles/mud', color: '#6d5340', top: '#806049' },
  water: { group: 'tiles/water', color: '#3f6e78', top: '#4e8894' },
};

export const OVERLAY_VISUALS = {
  frost: { group: 'tiles/frost', color: '#d7eef8' },
  ground: { group: 'tiles/ground', color: '#1c1915' },
  move: { group: 'fx/move', color: '#7eb6ff' },
  attack: { group: 'fx/attack', color: '#ff6a45' },
  aoe: { group: 'fx/aoe', color: '#ffb057' },
};

export const TILE_SIZE = 1;
export const TILE_GAP = 0.07;

export function tileTopY(height) {
  if (height < 0) return 0.18;
  return 0.28 + height * 0.46;
}
