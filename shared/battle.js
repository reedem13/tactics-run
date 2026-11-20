import {
  ABILITIES,
  CLASSES,
  COMBOS,
  ENEMIES,
  STATUSES,
  battleReward,
  encounterRoster,
  knowsAbility,
  scaleHp,
  scalePower,
  unitAbilities,
} from './data.js';
import {
  aoeTiles,
  attackSide,
  awayDir,
  facingFromDelta,
  inRange,
  key,
  reachable,
  slide,
  tileAt,
  unitAt,
} from './grid.js';
import { generateMap, planSpawns } from './map.js';
import { forkRng } from './rng.js';

export { unitAbilities, knowsAbility };

export function statusOf(unit, id) {
  return unit?.statuses?.find((status) => status.id === id) || null;
}

export function statusName(id) {
  return STATUSES[id]?.name || id;
}

export function removeStatus(unit, id) {
  unit.statuses = unit.statuses.filter((status) => status.id !== id);
}

export function addStatus(unit, spec) {
  if (!unit || unit.downed || !spec?.id) return;
  const existing = statusOf(unit, spec.id);
  if (existing) {
    if (spec.roundsLeft != null) existing.roundsLeft = Math.max(existing.roundsLeft || 0, spec.roundsLeft);
    if (spec.ticksLeft != null) existing.ticksLeft = Math.max(existing.ticksLeft || 0, spec.ticksLeft);
    existing.potency = Math.max(existing.potency || 0, spec.potency || 0);
    return;
  }
  const next = { id: spec.id, potency: spec.potency || 0 };
  if (spec.roundsLeft != null) next.roundsLeft = spec.roundsLeft;
  if (spec.ticksLeft != null) next.ticksLeft = spec.ticksLeft;
  unit.statuses.push(next);
}

export function moveBudget(unit) {
  let n = unit.move || 0;
  if (statusOf(unit, 'frozen')) n -= 2;
  return Math.max(0, n);
}

export function defenseOf(unit) {
  let defense = unit.defense || 0;
  if (statusOf(unit, 'staggered')) defense -= 3;
  return Math.max(0, defense);
}

function pushLog(battle, text) {
  battle.log.push(text);
  if (battle.log.length > 40) battle.log.splice(0, battle.log.length - 40);
}

export function unitById(battle, id) {
  return battle.units.find((unit) => unit.id === id) || null;
}

export function makeUnit(partial) {
  const classId = partial.classId;
  const kit = partial.side === 'enemy' ? ENEMIES[classId] : CLASSES[classId];
  const base = kit?.base || kit || {};
  const maxHp = partial.maxHp ?? partial.hp ?? base.hp ?? 10;
  const maxMp = partial.maxMp ?? partial.mp ?? base.mp ?? 0;
  return {
    id: partial.id || (partial.ownerId ? `u-${partial.ownerId}` : ''),
    name: partial.name || kit?.name || classId,
    side: partial.side,
    ownerId: partial.ownerId ?? null,
    classId,
    color: partial.color || null,
    x: partial.x ?? 0,
    z: partial.z ?? 0,
    facing: partial.facing ?? (partial.side === 'enemy' ? 2 : 0),
    hp: partial.hp ?? maxHp,
    maxHp,
    mp: partial.mp ?? maxMp,
    maxMp,
    move: partial.move ?? base.move ?? 3,
    jump: partial.jump ?? base.jump ?? 1,
    power: partial.power ?? base.power ?? 0,
    defense: partial.defense ?? base.defense ?? 0,
    evade: partial.evade ?? base.evade ?? 0,
    speed: partial.speed ?? base.speed ?? 8,
    level: partial.level ?? 1,
    xp: partial.xp ?? 0,
    upgrades: [...(partial.upgrades || [])],
    statuses: (partial.statuses || []).map((status) => ({ ...status })),
    cds: { ...(partial.cds || {}) },
    moved: false,
    acted: false,
    ready: false,
    downed: partial.downed ?? false,
    moveFrom: null,
  };
}

export function flatTiles(width, depth, type = 'grass') {
  const tiles = [];
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) tiles.push({ x, z, h: 0, type });
  }
  return tiles;
}

export function makeBattle({ width = 8, depth = 8, tiles = null, units, frost = {}, name = 'Test', tier = 'battle' }) {
  return {
    id: 'fixed',
    tier,
    name,
    nodeId: 'test',
    round: 1,
    phase: 'party',
    width,
    depth,
    tiles: tiles || flatTiles(width, depth),
    frost: { ...frost },
    units,
    log: [],
    enemyCount: units.filter((unit) => unit.side === 'enemy').length,
    playerCount: units.filter((unit) => unit.side === 'player').length,
    committed: false,
  };
}

function placeParty(unit, x, z) {
  unit.x = x;
  unit.z = z;
  unit.facing = 0;
}

export function createBattle({ seed, nodeId, tier, name, playerCount, party }) {
  const rng = forkRng(seed, `map:${nodeId}`);
  const map = generateMap(rng, 8, 8);
  const roster = encounterRoster(tier, playerCount);
  const bonus = scalePower(playerCount);
  const counts = {};
  for (const id of roster) counts[id] = (counts[id] || 0) + 1;
  const seen = {};
  const enemies = roster.map((classId, index) => {
    const kit = ENEMIES[classId];
    seen[classId] = (seen[classId] || 0) + 1;
    const label = counts[classId] > 1 ? `${kit.name} ${seen[classId]}` : kit.name;
    return makeUnit({
      id: `e${index + 1}`,
      name: label,
      side: 'enemy',
      classId,
      hp: scaleHp(kit.hp, playerCount),
      maxHp: scaleHp(kit.hp, playerCount),
      mp: kit.mp,
      maxMp: kit.mp,
      move: kit.move,
      jump: kit.jump,
      power: (kit.power || 0) + bonus,
      defense: kit.defense,
      evade: kit.evade,
      speed: kit.speed,
      facing: 2,
    });
  });
  const players = party.map((src) => makeUnit({
    ...src,
    id: `u-${src.ownerId}`,
    side: 'player',
    hp: src.hp,
    maxHp: src.maxHp,
  }));
  const spawns = planSpawns(map.tiles, map.width, map.depth, players.length, enemies.length);
  players.forEach((unit, i) => {
    const pad = spawns.party[i];
    placeParty(unit, pad.x, pad.z);
  });
  enemies.forEach((unit, i) => {
    const pad = spawns.enemy[i];
    unit.x = pad.x;
    unit.z = pad.z;
    unit.facing = 2;
  });
  const battle = {
    id: `b-${nodeId}`,
    tier,
    name,
    nodeId,
    round: 1,
    phase: 'party',
    width: map.width,
    depth: map.depth,
    tiles: map.tiles,
    spawns,
    frost: {},
    units: [...players, ...enemies],
    log: [`${name}. Units are deployed. Blue tiles are your move, then one ability, then End Turn.`],
    enemyCount: enemies.length,
    playerCount,
    committed: false,
  };
  for (const unit of battle.units) {
    if (unit.side === 'player' && unit.downed) unit.ready = true;
  }
  return battle;
}

export function livingUnits(battle, side) {
  return battle.units.filter((unit) => unit.side === side && !unit.downed && unit.hp > 0);
}

export function syncOutcome(battle) {
  if (battle.phase === 'victory' || battle.phase === 'defeat') return battle.phase;
  const players = battle.units.filter((unit) => unit.side === 'player');
  const enemies = battle.units.filter((unit) => unit.side === 'enemy');
  if (players.length && players.every((unit) => unit.downed || unit.hp <= 0)) {
    battle.phase = 'defeat';
    pushLog(battle, 'The company is down.');
    return 'defeat';
  }
  if (enemies.length && enemies.every((unit) => unit.downed || unit.hp <= 0)) {
    battle.phase = 'victory';
    pushLog(battle, 'The field is clear.');
    return 'victory';
  }
  return null;
}

function knockDown(battle, unit, events) {
  unit.hp = 0;
  unit.downed = true;
  unit.ready = true;
  unit.acted = true;
  unit.statuses = [];
  events.push({
    t: unit.side === 'enemy' ? 'death' : 'down',
    id: unit.id,
    name: unit.name,
    x: unit.x,
    z: unit.z,
  });
  pushLog(battle, unit.side === 'enemy' ? `${unit.name} falls.` : `${unit.name} is down.`);
}

export function activationStart(battle, unit) {
  const events = [];
  if (!unit || unit.downed) return { events, skip: true };
  for (const status of [...unit.statuses]) {
    if (status.ticksLeft == null) continue;
    const amount = status.potency || 0;
    if (amount > 0) {
      unit.hp -= amount;
      events.push({ t: 'damage', id: unit.id, amount, x: unit.x, z: unit.z, kind: status.id });
      pushLog(battle, `${unit.name} suffers ${amount} from ${statusName(status.id)}.`);
    }
    status.ticksLeft -= 1;
    if (status.ticksLeft <= 0) removeStatus(unit, status.id);
    if (unit.hp <= 0) {
      knockDown(battle, unit, events);
      syncOutcome(battle);
      return { events, skip: true };
    }
  }
  if (statusOf(unit, 'shocked')) {
    removeStatus(unit, 'shocked');
    events.push({ t: 'skip', id: unit.id, x: unit.x, z: unit.z, reason: 'shocked' });
    pushLog(battle, `${unit.name} is shocked and loses the action.`);
    return { events, skip: true };
  }
  return { events, skip: false };
}

function canPay(unit, ability) {
  if (!ability) return false;
  if ((unit.mp || 0) < (ability.mp || 0)) return false;
  if ((unit.cds?.[ability.id] || 0) > 0) return false;
  return true;
}

function accepts(ability, origin, target) {
  if (!target || target.id === origin.id) return false;
  if (ability.target === 'ally-down') return target.side === origin.side && target.downed;
  return target.side !== origin.side && !target.downed;
}

export function listTargets(battle, origin, ability, { ignoreTurn = false } = {}) {
  if (!ability || !origin) return [];
  if (!ignoreTurn && (origin.downed || origin.ready || origin.acted)) return [];
  if (!canPay(origin, ability)) return [];
  if (ability.aim === 'self') return [{ x: origin.x, z: origin.z, aoe: [], unitId: origin.id }];
  const out = [];
  for (const tile of battle.tiles) {
    if (!inRange(battle, origin, tile.x, tile.z, ability)) continue;
    const area = ability.aim === 'tile' ? aoeTiles(battle, tile.x, tile.z, ability.aoe || 0) : [{ x: tile.x, z: tile.z, primary: true }];
    if (ability.aim === 'unit') {
      const target = unitAt(battle, tile.x, tile.z);
      if (!accepts(ability, origin, target)) continue;
      out.push({ x: tile.x, z: tile.z, aoe: area, unitId: target.id });
      continue;
    }
    const hits = area
      .map((cell) => ({ cell, target: unitAt(battle, cell.x, cell.z) }))
      .filter((hit) => accepts(ability, origin, hit.target));
    if (!hits.length) continue;
    out.push({ x: tile.x, z: tile.z, aoe: area, unitId: hits[0].target.id });
  }
  return out;
}

export function moveOptions(battle, unit) {
  if (!unit || unit.downed || unit.ready || unit.acted || unit.moved) return [];
  if (battle.phase !== 'party') return [];
  return reachable(battle, unit, moveBudget(unit));
}

function comboMatches(combo, ctx) {
  const when = combo.when || {};
  if (when.ability && ctx.ability.id !== when.ability) return false;
  if (when.tags && !when.tags.every((tag) => (ctx.ability.tags || []).includes(tag))) return false;
  if (when.status && !statusOf(ctx.target, when.status)) return false;
  if (when.classId && ctx.attacker.classId !== when.classId) return false;
  if (when.sides && !when.sides.includes(ctx.side)) return false;
  if (when.tile === 'frost' && !ctx.frost) return false;
  if (when.primary === true && !ctx.primary) return false;
  return true;
}

export function forecast(battle, attacker, target, ability, opts = {}) {
  const school = ability.school || 'physical';
  const side = attackSide(attacker, target);
  let evade = 0;
  if (school === 'physical' && side !== 'back') evade = target.evade || 0;
  const mitigation = school === 'magic' ? Math.floor(defenseOf(target) / 2) : school === 'none' ? 0 : defenseOf(target);
  let mult = 1;
  if (school === 'physical') {
    if (side === 'back') mult = 1.5;
    else if (side === 'flank') mult = 1.25;
    if (attacker.classId === 'rogue') {
      if (side === 'back') mult += 0.35 + (attacker.upgrades?.includes('deep-cut') ? 0.25 : 0);
      else if (side === 'flank') mult += 0.15;
    }
  }
  const power = opts.power ?? ability.power ?? 0;
  const raw = power + (opts.addPower === false ? 0 : attacker.power || 0);
  let damage = Math.max(school === 'none' && power <= 0 ? 0 : 1, raw - mitigation) * mult;
  const frost = !!(battle.frost && battle.frost[key(target.x, target.z)] > 0);
  const primary = opts.primary !== false;
  const allowCombo = opts.allowCombo !== false;
  const matched = allowCombo
    ? COMBOS.filter((combo) => comboMatches(combo, { ability, target, attacker, side, frost, primary }))
    : [];
  let extraKnock = 0;
  let splash = 0;
  for (const combo of matched) {
    const effect = combo.effect || {};
    if (effect.multiplier) damage *= effect.multiplier;
    if (effect.bonus) damage += effect.bonus;
    if (effect.bonusFromStatus) {
      const status = statusOf(target, effect.bonusFromStatus);
      if (status) damage += (status.potency || 0) * (effect.bonusScale || 1);
    }
    if (effect.extraKnock) extraKnock += effect.extraKnock;
    if (effect.splash) splash += effect.splash;
  }
  if (statusOf(target, 'guard') && damage > 0 && school !== 'none') damage *= 0.5;
  damage = damage <= 0 ? 0 : Math.max(1, Math.round(damage));
  return { damage, evade, side, combos: matched, extraKnock, splash, frost };
}

function chip(battle, target, amount, events) {
  if (!target || target.downed || amount <= 0) return;
  let damage = amount;
  if (statusOf(target, 'guard')) damage = Math.max(1, Math.ceil(damage * 0.5));
  target.hp -= damage;
  events.push({ t: 'damage', id: target.id, amount: damage, x: target.x, z: target.z, kind: 'splash' });
  if (target.hp <= 0) knockDown(battle, target, events);
}

function spend(unit, ability) {
  unit.mp = Math.max(0, (unit.mp || 0) - (ability.mp || 0));
  if (ability.cooldown > 0) unit.cds[ability.id] = ability.cooldown + 1;
  unit.acted = true;
}

function faceToward(unit, x, z) {
  const facing = facingFromDelta(x - unit.x, z - unit.z);
  if (facing != null) unit.facing = facing;
}

export function perform(battle, unit, abilityId, x, z, rng) {
  const ability = ABILITIES[abilityId];
  const events = [];
  if (!ability) return { error: 'Unknown ability.', events };
  if (ability.aim === 'self') {
    spend(unit, ability);
    for (const grant of ability.grants || []) addStatus(unit, grant);
    pushLog(battle, `${unit.name} uses ${ability.name}.`);
    events.push({ t: 'cast', id: unit.id, ability: ability.id, x: unit.x, z: unit.z });
    syncOutcome(battle);
    return { events };
  }
  if (ability.target === 'ally-down') {
    const ally = unitAt(battle, x, z);
    if (!ally || !ally.downed) return { error: 'No one to revive there.', events };
    const heal = Math.max(1, Math.round(ally.maxHp * (ability.healFrac || 0.4)));
    ally.downed = false;
    ally.hp = heal;
    ally.ready = false;
    ally.acted = false;
    ally.moved = false;
    ally.moveFrom = null;
    ally.statuses = [];
    spend(unit, ability);
    faceToward(unit, ally.x, ally.z);
    events.push({ t: 'heal', id: ally.id, amount: heal, x: ally.x, z: ally.z });
    pushLog(battle, `${unit.name} revives ${ally.name}.`);
    return { events };
  }

  const area = ability.aim === 'tile'
    ? aoeTiles(battle, x, z, ability.aoe || 0)
    : [{ x, z, primary: true }];
  const aim = { x, z };
  let hits = 0;
  for (const cell of area) {
    const target = unitAt(battle, cell.x, cell.z);
    if (!target || target.downed || target.side === unit.side) continue;
    if (ability.aim === 'unit' && !cell.primary) continue;
    const primary = cell.primary !== false && cell.x === aim.x && cell.z === aim.z;
    const allowCombo = primary || ability.comboSplash === true;
    const power = primary ? ability.power : (ability.splashPower ?? 0);
    if (!primary && power <= 0) continue;
    const cast = forecast(battle, unit, target, ability, {
      power,
      addPower: primary,
      primary,
      allowCombo,
    });
    if (cast.evade > 0 && rng && rng() < cast.evade) {
      events.push({ t: 'miss', id: target.id, x: target.x, z: target.z });
      pushLog(battle, `${target.name} slips past ${unit.name}.`);
      hits += 1;
      continue;
    }
    const origin = { x: target.x, z: target.z };
    if (cast.damage > 0) {
      target.hp -= cast.damage;
      events.push({
        t: 'damage',
        id: target.id,
        amount: cast.damage,
        x: origin.x,
        z: origin.z,
        side: cast.side,
        crit: cast.combos.some((combo) => combo.id === 'opening'),
      });
      const sideNote = cast.side === 'back' ? ' from behind' : cast.side === 'flank' ? ' from the flank' : '';
      pushLog(battle, `${unit.name} hits ${target.name} for ${cast.damage}${sideNote}.`);
    }
    for (const combo of cast.combos) {
      events.push({ t: 'combo', id: combo.id, name: combo.name, x: origin.x, z: origin.z, targetId: target.id });
      pushLog(battle, `COMBO! ${combo.name} — ${unit.name} on ${target.name}.`);
      const effect = combo.effect || {};
      if (effect.consume) removeStatus(target, effect.consume);
      if (effect.addStatus) addStatus(target, effect.addStatus);
    }
    if (primary) {
      for (const grant of ability.grants || []) addStatus(target, grant);
    }
    if (primary && ability.frostTile) {
      battle.frost[key(origin.x, origin.z)] = 2;
      events.push({ t: 'frost', x: origin.x, z: origin.z });
    }
    if (cast.splash > 0) {
      for (const near of aoeTiles(battle, origin.x, origin.z, 1)) {
        if (near.x === origin.x && near.z === origin.z) continue;
        const other = unitAt(battle, near.x, near.z);
        if (other && other.side !== unit.side) chip(battle, other, cast.splash, events);
      }
    }
    if (target.hp <= 0 && !target.downed) knockDown(battle, target, events);
    else if (primary && (ability.knock || cast.extraKnock) && !target.downed) {
      let knock = (ability.knock || 0) + cast.extraKnock;
      if (ability.id === 'shove' && unit.upgrades?.includes('long-arm')) knock += 1;
      const dir = awayDir(unit, target);
      const from = { x: target.x, z: target.z };
      const slid = slide(battle, target, dir, knock);
      if (slid.path.length) {
        target.x = slid.x;
        target.z = slid.z;
        events.push({ t: 'move', id: target.id, from, to: { x: target.x, z: target.z }, path: slid.path, knock: true });
      }
    }
    if (primary && ability.id === 'bolt' && unit.upgrades?.includes('forked-spark')) {
      const neighbors = aoeTiles(battle, origin.x, origin.z, 1)
        .map((cell) => unitAt(battle, cell.x, cell.z))
        .filter((other) => other && other.id !== target.id && other.side !== unit.side && !other.downed)
        .sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id));
      if (neighbors[0]) chip(battle, neighbors[0], 4, events);
    }
    hits += 1;
    if (battle.phase === 'victory' || battle.phase === 'defeat') break;
    syncOutcome(battle);
    if (battle.phase === 'victory' || battle.phase === 'defeat') break;
  }
  if (!hits) return { error: 'No target.', events };
  spend(unit, ability);
  faceToward(unit, x, z);
  events.unshift({ t: 'cast', id: unit.id, ability: ability.id, x, z });
  syncOutcome(battle);
  return { events };
}

export function forceMove(battle, unit, dest) {
  const from = { x: unit.x, z: unit.z, facing: unit.facing };
  const path = dest.path || [];
  unit.x = dest.x;
  unit.z = dest.z;
  const prev = path.length >= 2 ? path[path.length - 2] : from;
  const facing = facingFromDelta(unit.x - prev.x, unit.z - prev.z);
  if (facing != null) unit.facing = facing;
  unit.moved = true;
  return {
    events: [{ t: 'move', id: unit.id, from, to: { x: unit.x, z: unit.z }, path }],
  };
}

export function tryMove(battle, unitId, x, z) {
  const unit = unitById(battle, unitId);
  if (!unit || unit.side !== 'player') return { error: 'That unit is not yours.' };
  if (battle.phase !== 'party') return { error: 'Wait for the party phase.' };
  if (unit.downed) return { error: 'You are down.' };
  if (unit.ready) return { error: 'You already ended your turn.' };
  if (unit.acted || unit.moved) return { error: 'You already moved.' };
  const dest = moveOptions(battle, unit).find((tile) => tile.x === x && tile.z === z);
  if (!dest) return { error: 'You cannot reach that tile.' };
  const from = { x: unit.x, z: unit.z, facing: unit.facing };
  const moved = forceMove(battle, unit, dest);
  unit.moveFrom = from;
  return moved;
}

export function tryUndo(battle, unitId) {
  const unit = unitById(battle, unitId);
  if (!unit) return { error: 'Missing unit.' };
  if (!unit.moved || unit.acted || !unit.moveFrom) return { error: 'Nothing to undo.' };
  const back = unit.moveFrom;
  const from = { x: unit.x, z: unit.z };
  unit.x = back.x;
  unit.z = back.z;
  unit.facing = back.facing;
  unit.moved = false;
  unit.moveFrom = null;
  return { events: [{ t: 'move', id: unit.id, from, to: { x: unit.x, z: unit.z }, path: [{ x: unit.x, z: unit.z }], undo: true }] };
}

export function tryAct(battle, unitId, abilityId, x, z, rng) {
  const unit = unitById(battle, unitId);
  if (!unit || unit.side !== 'player') return { error: 'That unit is not yours.' };
  if (battle.phase !== 'party') return { error: 'Wait for the party phase.' };
  if (unit.downed) return { error: 'You are down.' };
  if (unit.ready) return { error: 'You already ended your turn.' };
  if (unit.acted) return { error: 'You already acted.' };
  const ability = ABILITIES[abilityId];
  if (!ability) return { error: 'Unknown ability.' };
  if (!knowsAbility(unit, abilityId)) return { error: 'That unit does not know that.' };
  if (!canPay(unit, ability)) {
    if ((unit.cds?.[abilityId] || 0) > 0) return { error: 'That ability is not ready.' };
    return { error: 'Not enough MP.' };
  }
  const aimX = ability.aim === 'self' ? unit.x : x;
  const aimZ = ability.aim === 'self' ? unit.z : z;
  const targets = listTargets(battle, unit, ability);
  if (!targets.some((target) => target.x === aimX && target.z === aimZ)) return { error: 'No legal target there.' };
  return perform(battle, unit, abilityId, aimX, aimZ, rng);
}

export function allReady(battle) {
  const players = battle.units.filter((unit) => unit.side === 'player');
  return players.length > 0 && players.every((unit) => unit.downed || unit.ready);
}

export function tryEndTurn(battle, unitId) {
  const unit = unitById(battle, unitId);
  if (!unit || unit.side !== 'player') return { error: 'That unit is not yours.' };
  if (battle.phase !== 'party') return { error: 'Wait for the party phase.' };
  if (unit.downed) return { error: 'You are down.' };
  if (unit.ready) return { error: 'Already waiting.' };
  unit.ready = true;
  pushLog(battle, `${unit.name} is ready.`);
  return { events: [{ t: 'ready', id: unit.id, name: unit.name }] };
}

export function closeRound(battle) {
  for (const unit of battle.units) {
    if (!unit.downed) {
      unit.statuses = unit.statuses.filter((status) => {
        if (status.ticksLeft != null) return status.ticksLeft > 0;
        if (status.roundsLeft == null) return true;
        status.roundsLeft -= 1;
        return status.roundsLeft > 0;
      });
    }
    for (const id of Object.keys(unit.cds || {})) {
      unit.cds[id] -= 1;
      if (unit.cds[id] <= 0) delete unit.cds[id];
    }
    unit.moved = false;
    unit.acted = false;
    unit.ready = false;
    unit.moveFrom = null;
  }
  for (const tileKey of Object.keys(battle.frost)) {
    battle.frost[tileKey] -= 1;
    if (battle.frost[tileKey] <= 0) delete battle.frost[tileKey];
  }
  battle.round += 1;
  battle.phase = 'party';
  const events = [];
  for (const unit of battle.units) {
    if (unit.side !== 'player') continue;
    if (unit.downed) {
      unit.ready = true;
      continue;
    }
    unit.mp = Math.min(unit.maxMp, (unit.mp || 0) + 2);
    const start = activationStart(battle, unit);
    events.push(...start.events);
    if (start.skip && !unit.downed) {
      unit.ready = true;
      unit.acted = true;
    }
    if (unit.downed) unit.ready = true;
  }
  syncOutcome(battle);
  if (battle.phase === 'party') {
    pushLog(battle, `Round ${battle.round}. Party phase.`);
    events.push({ t: 'phase', phase: 'party', round: battle.round });
  }
  return { events };
}

export function rewardFor(battle) {
  return battleReward(battle.tier, battle.enemyCount);
}

export { tileAt, unitAt, key };
