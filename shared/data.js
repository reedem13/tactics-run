// Class kits, enemy rosters, and cross-class combos.
//
// To add a class: add a CLASSES entry, its abilities in ABILITIES, a row in
// public/js/visuals.js under units/<id>, and any combos below.
//
// To add a combo: append to COMBOS. `when` decides if it matches. `effect`
// uses the keys applied in shared/battle.js (bonus, multiplier, consume,
// addStatus, extraKnock, splash, bonusFromStatus, bonusScale). A new effect
// key needs one branch there; the callout and the help panel pick the combo
// up on their own.

export const PLAYER_COLORS = ['#e2a23b', '#3cb8a8', '#e36b8a', '#7aa2f0'];
export const PLAYER_NAMES = ['Ash', 'Briar', 'Cade', 'Dune'];

export const HOW_TO = [
  'One unit each, one to four players. Duplicate classes are allowed.',
  'Fights start with every unit already on a spawn tile. There is no placement step.',
  'Party phase: anyone can go, in any order. Move, use one ability, then End Turn.',
  'Actions land as you take them. Set a status, then let your ally detonate it before the enemy phase.',
  'The notch on a unit is the direction it is facing. Backstabs and flanks hit harder.',
  'A downed ally can be Revived from an adjacent tile. If everyone is down, the run is over.',
];

export const STATUSES = {
  soaked: { name: 'Soaked', short: 'SOAK', color: '#79d0ea', blurb: 'Bolt this unit for Storm Arc.' },
  oil: { name: 'Oil', short: 'OIL', color: '#e0b15a', blurb: 'Ember this unit for Wildfire.' },
  burning: { name: 'Burning', short: 'BURN', color: '#f07848', blurb: 'Fire damage at the start of each of its turns.' },
  poison: { name: 'Poison', short: 'POIS', color: '#8dce62', blurb: 'Poison damage each turn. Ember detonates it.' },
  frozen: { name: 'Frozen', short: 'FROZE', color: '#b9dcff', blurb: 'Move reduced by 2. Shield Bash shatters it.' },
  staggered: { name: 'Staggered', short: 'STAG', color: '#f0d36a', blurb: 'Defense reduced by 3. A rogue backstab or flank crits.' },
  shocked: { name: 'Shocked', short: 'SHOCK', color: '#ffe36a', blurb: 'Loses its next action.' },
  guard: { name: 'Guard', short: 'GRD', color: '#9eb4c8', blurb: 'Incoming damage is halved.' },
  taunt: { name: 'Taunt', short: 'TAUNT', color: '#e7e1d6', blurb: 'Enemies prefer this unit.' },
};

export const CLASSES = {
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    blurb: 'Fragile ranged magic. Soak, burn, and freeze so the others can detonate.',
    base: { hp: 24, mp: 16, move: 3, jump: 2, power: 0, defense: 1, evade: 0, speed: 10 },
    abilities: ['soak', 'bolt', 'ember', 'rime'],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    blurb: 'Fast. Backstabs and flanks cut deeper. Oil and poison are ammo for a wizard.',
    base: { hp: 30, mp: 12, move: 5, jump: 2, power: 0, defense: 2, evade: 0.18, speed: 14 },
    abilities: ['stab', 'oil', 'needle'],
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    blurb: 'Holds the front. Bash to stagger, shove across frost, guard to pull blows.',
    base: { hp: 46, mp: 10, move: 3, jump: 1, power: 0, defense: 4, evade: 0, speed: 7 },
    abilities: ['slash', 'bash', 'shove', 'guard'],
  },
};

export const ENEMIES = {
  grunt: {
    id: 'grunt', name: 'Road Grunt',
    hp: 15, mp: 0, move: 3, jump: 1, power: 0, defense: 2, evade: 0, speed: 8,
    abilities: ['hack'],
  },
  archer: {
    id: 'archer', name: 'Toll Archer',
    hp: 12, mp: 0, move: 3, jump: 1, power: 0, defense: 1, evade: 0, speed: 11,
    abilities: ['shoot'],
  },
  brute: {
    id: 'brute', name: 'Cistern Brute',
    hp: 30, mp: 0, move: 2, jump: 1, power: 0, defense: 3, evade: 0, speed: 5,
    abilities: ['crush'],
  },
  hexer: {
    id: 'hexer', name: 'Ash Hexer',
    hp: 13, mp: 8, move: 3, jump: 1, power: 0, defense: 1, evade: 0, speed: 9,
    abilities: ['hex'],
  },
  warden: {
    id: 'warden', name: 'March Warden',
    hp: 44, mp: 6, move: 3, jump: 1, power: 0, defense: 3, evade: 0, speed: 6,
    abilities: ['smash', 'bulwark'],
  },
};

export const ABILITIES = {
  soak: {
    id: 'soak', name: 'Soak', mp: 3, cooldown: 0,
    blurb: 'A drenching bolt. Sets up Storm Arc.',
    aim: 'unit', target: 'enemy', melee: false, range: 4, school: 'magic', power: 2,
    tags: ['water'],
    grants: [{ id: 'soaked', roundsLeft: 2 }],
  },
  bolt: {
    id: 'bolt', name: 'Bolt', mp: 4, cooldown: 0,
    blurb: 'Lightning. Soaked foes take Storm Arc and lose their next action.',
    aim: 'unit', target: 'enemy', melee: false, range: 4, school: 'magic', power: 8,
    tags: ['lightning'],
  },
  ember: {
    id: 'ember', name: 'Ember', mp: 6, cooldown: 0,
    blurb: 'Fire a tile and the squares next to it. Oil becomes Wildfire. Poison becomes Fume Burst.',
    aim: 'tile', target: 'enemy', melee: false, range: 4, aoe: 1, school: 'magic',
    power: 7, splashPower: 3, comboSplash: true,
    tags: ['fire'],
    grants: [{ id: 'burning', ticksLeft: 2, potency: 3 }],
  },
  rime: {
    id: 'rime', name: 'Rime', mp: 5, cooldown: 0,
    blurb: 'Frost the target and the tile under them. Shove slides farther. Shield Bash shatters.',
    aim: 'unit', target: 'enemy', melee: false, range: 4, school: 'magic', power: 5,
    tags: ['ice'], frostTile: true,
    grants: [{ id: 'frozen', roundsLeft: 2 }],
  },
  slash: {
    id: 'slash', name: 'Slash', mp: 0, cooldown: 0,
    blurb: 'A heavy cut. Better from the flank or the back.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 8,
    tags: ['weapon'],
  },
  bash: {
    id: 'bash', name: 'Shield Bash', mp: 3, cooldown: 0,
    blurb: 'A stagger and a one-tile knockback. Frozen foes Shatter.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 5,
    knock: 1, tags: ['bash'],
    grants: [{ id: 'staggered', roundsLeft: 2 }],
  },
  shove: {
    id: 'shove', name: 'Shove', mp: 2, cooldown: 0,
    blurb: 'Push them two tiles. On frost, Ice Rink slides them farther.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 2,
    knock: 2, tags: ['shove'],
  },
  guard: {
    id: 'guard', name: 'Guard', mp: 0, cooldown: 1,
    blurb: 'Halve damage until the round ends and pull enemies onto you.',
    aim: 'self', target: 'self', melee: false, range: 0, school: 'none', power: 0,
    tags: ['guard'],
    grants: [
      { id: 'guard', roundsLeft: 1 },
      { id: 'taunt', roundsLeft: 1 },
    ],
  },
  stab: {
    id: 'stab', name: 'Stab', mp: 0, cooldown: 0,
    blurb: 'A quick blade. From behind or the flank it cuts deeper. Staggered foes take Opening.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 7,
    tags: ['weapon'],
  },
  oil: {
    id: 'oil', name: 'Oil Flask', mp: 3, cooldown: 0,
    blurb: 'Coat a foe in oil. A wizard’s Ember turns it into Wildfire.',
    aim: 'unit', target: 'enemy', melee: false, range: 3, school: 'magic', power: 1,
    tags: ['oil'],
    grants: [{ id: 'oil', roundsLeft: 3 }],
  },
  needle: {
    id: 'needle', name: 'Poison Needle', mp: 4, cooldown: 0,
    blurb: 'A stuck needle. Ember detonates the poison as Fume Burst.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 4,
    tags: ['poison'],
    grants: [{ id: 'poison', ticksLeft: 3, potency: 3 }],
  },
  revive: {
    id: 'revive', name: 'Revive', mp: 0, cooldown: 0,
    blurb: 'Get an adjacent ally back up. Uses your action.',
    aim: 'unit', target: 'ally-down', melee: true, range: 1, school: 'none', power: 0,
    healFrac: 0.4, tags: ['aid'],
  },
  hack: {
    id: 'hack', name: 'Hack', mp: 0, cooldown: 0,
    blurb: 'A road-gang chop.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 7,
    tags: ['weapon'],
  },
  shoot: {
    id: 'shoot', name: 'Shoot', mp: 0, cooldown: 0,
    blurb: 'A shortbow shot. High ground stretches it.',
    aim: 'unit', target: 'enemy', melee: false, range: 4, school: 'physical', power: 6,
    tags: ['weapon'],
  },
  crush: {
    id: 'crush', name: 'Crush', mp: 0, cooldown: 0,
    blurb: 'A brutal swing that staggers.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 8,
    tags: ['weapon'],
    grants: [{ id: 'staggered', roundsLeft: 1 }],
  },
  hex: {
    id: 'hex', name: 'Hex', mp: 0, cooldown: 0,
    blurb: 'A snapping curse.',
    aim: 'unit', target: 'enemy', melee: false, range: 3, school: 'magic', power: 7,
    tags: ['hex'],
  },
  smash: {
    id: 'smash', name: 'Smash', mp: 0, cooldown: 0,
    blurb: 'The warden’s mace.',
    aim: 'unit', target: 'enemy', melee: true, range: 1, school: 'physical', power: 9,
    tags: ['weapon'],
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', mp: 0, cooldown: 3,
    blurb: 'The warden braces.',
    aim: 'self', target: 'self', melee: false, range: 0, school: 'none', power: 0,
    tags: ['guard'],
    grants: [{ id: 'guard', roundsLeft: 1 }],
  },
};

export const COMBOS = [
  {
    id: 'storm-arc',
    name: 'Storm Arc',
    pair: 'Soaked + Bolt',
    detail: 'Bolt a soaked foe for bonus damage and Shocked. They skip their next action.',
    when: { ability: 'bolt', status: 'soaked' },
    effect: { bonus: 7, consume: 'soaked', addStatus: { id: 'shocked', roundsLeft: 1 } },
  },
  {
    id: 'wildfire',
    name: 'Wildfire',
    pair: 'Oil + Ember',
    detail: 'Ember on an oiled foe hits harder and leaves a stronger burn.',
    when: { tags: ['fire'], status: 'oil' },
    effect: {
      bonus: 6,
      consume: 'oil',
      addStatus: { id: 'burning', ticksLeft: 3, potency: 5 },
    },
  },
  {
    id: 'fume-burst',
    name: 'Fume Burst',
    pair: 'Poison + Ember',
    detail: 'Ember detonates poison for a burst and burns the toxin out.',
    when: { tags: ['fire'], status: 'poison' },
    effect: { bonusFromStatus: 'poison', bonusScale: 3, consume: 'poison' },
  },
  {
    id: 'opening',
    name: 'Opening',
    pair: 'Staggered + Rogue backstab',
    detail: 'A rogue stab from behind or the flank crits a staggered foe and clears the stagger.',
    when: { ability: 'stab', status: 'staggered', classId: 'rogue', sides: ['back', 'flank'] },
    effect: { multiplier: 1.5, consume: 'staggered' },
  },
  {
    id: 'ice-rink',
    name: 'Ice Rink',
    pair: 'Frost tile + Shove',
    detail: 'Shove a foe standing on frost and they slide much farther.',
    when: { ability: 'shove', tile: 'frost' },
    effect: { extraKnock: 2 },
  },
  {
    id: 'shatter',
    name: 'Shatter',
    pair: 'Frozen + Shield Bash',
    detail: 'Shield Bash a frozen foe for bonus damage. The freeze breaks and neighbors take a chip.',
    when: { ability: 'bash', status: 'frozen' },
    effect: { bonus: 8, consume: 'frozen', splash: 4 },
  },
];

// Allied AI reads these so a scripted party sets combos up. Players do not have to.
export const COMBO_SETUPS = [
  { apply: 'oil', needsAllyTags: ['fire'] },
  { apply: 'needle', needsAllyTags: ['fire'] },
  { apply: 'soak', needsAllyAbility: 'bolt' },
  { apply: 'bash', needsAllyAbility: 'stab' },
  { apply: 'rime', needsAllyAbility: 'bash' },
  { apply: 'rime', needsAllyAbility: 'shove' },
];

export const LEVEL_CHOICES = [
  { id: 'hp', name: '+8 Heart', desc: 'Max HP +8, and heal 8.' },
  { id: 'mp', name: '+5 Spirit', desc: 'Max MP +5, and restore 5.' },
  { id: 'edge', name: '+2 Edge', desc: 'Every ability deals 2 more damage.' },
];

export const UPGRADES = [
  { id: 'vital', name: 'Second Wind', desc: '+10 max HP, and heal 10.', classes: null },
  { id: 'spirit', name: 'Quiet Focus', desc: '+6 max MP, and restore 6.', classes: null },
  { id: 'march', name: 'Long March', desc: '+1 move.', classes: null },
  { id: 'mail', name: 'Extra Mail', desc: '+1 defense.', classes: null },
  { id: 'deep-cut', name: 'Deep Cut', desc: 'Backstabs cut deeper.', classes: ['rogue'] },
  { id: 'long-arm', name: 'Long Arm', desc: 'Shove pushes one tile farther.', classes: ['knight'] },
  { id: 'forked-spark', name: 'Forked Spark', desc: 'Bolt also snaps 4 damage onto a nearby foe.', classes: ['wizard'] },
];

export const SHOP_ITEMS = [
  { id: 'tonic', name: 'Field Tonic', desc: 'Heal 16 HP.', cost: 10, kind: 'heal', amount: 16 },
  { id: 'ether', name: 'Lamp Ether', desc: 'Restore 8 MP.', cost: 10, kind: 'mp', amount: 8 },
  { id: 'edge', name: 'Whetstone', desc: '+1 Edge for the rest of the run.', cost: 16, kind: 'power', amount: 1, stock: 1 },
  { id: 'mail', name: 'Mail Scrap', desc: '+1 defense for the rest of the run.', cost: 16, kind: 'defense', amount: 1, stock: 1 },
  { id: 'heart', name: 'Iron Ration', desc: '+6 max HP.', cost: 14, kind: 'maxHp', amount: 6, stock: 1 },
];

const ROSTERS = {
  battle: [
    ['grunt', 'archer'],
    ['grunt', 'grunt', 'archer'],
    ['grunt', 'grunt', 'archer', 'hexer'],
    ['grunt', 'grunt', 'archer', 'archer', 'hexer'],
  ],
  elite: [
    ['brute', 'grunt'],
    ['brute', 'grunt', 'archer'],
    ['brute', 'grunt', 'grunt', 'archer'],
    ['brute', 'grunt', 'grunt', 'archer', 'hexer'],
  ],
  boss: [
    ['warden'],
    ['warden', 'archer'],
    ['warden', 'archer', 'grunt'],
    ['warden', 'archer', 'grunt', 'hexer'],
  ],
};

export function clampPlayers(n) {
  return Math.max(1, Math.min(4, n | 0));
}

export function encounterRoster(tier, playerCount) {
  const table = ROSTERS[tier] || ROSTERS.battle;
  return table[clampPlayers(playerCount) - 1].slice();
}

export function scaleHp(base, playerCount) {
  const m = 0.88 + (clampPlayers(playerCount) - 1) * 0.12;
  return Math.max(1, Math.round(base * m));
}

export function scalePower(playerCount) {
  const n = clampPlayers(playerCount);
  if (n >= 4) return 2;
  if (n === 3) return 1;
  return 0;
}

export function xpNeed(level) {
  return 12 + (level - 1) * 8;
}

export function battleReward(tier, enemyCount) {
  if (tier === 'boss') return { gold: 24, xp: 18 };
  if (tier === 'elite') return { gold: 14 + enemyCount * 2, xp: 10 + enemyCount };
  return { gold: 8 + enemyCount * 2, xp: 7 + enemyCount };
}

export function unitAbilities(unit) {
  if (!unit) return [];
  if (unit.side === 'enemy') return ENEMIES[unit.classId]?.abilities?.slice() || [];
  return CLASSES[unit.classId]?.abilities?.slice() || [];
}

export function knowsAbility(unit, abilityId) {
  if (abilityId === 'revive' && unit.side === 'player') return true;
  return unitAbilities(unit).includes(abilityId);
}
