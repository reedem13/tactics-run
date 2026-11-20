import { ABILITIES, CLASSES, PLAYER_COLORS, PLAYER_NAMES } from './data.js';
import { makeRng, parseSeed as parseSeedText, seedLabel } from './rng.js';
import { allReady, createBattle, syncOutcome, tryAct, tryEndTurn, tryMove, tryUndo } from './battle.js';
import { runEnemyPhase } from './ai.js';
import {
  applyLevelChoice,
  applyRest,
  applyShopItem,
  applyUpgrade,
  buildShop,
  commitVictory,
  createRun,
  nextNodeIds,
  nodeById,
  rollShrine,
} from './run.js';

export function parseSeed(text) {
  return parseSeedText(text);
}

export function cleanName(name, fallback) {
  const text = String(name || '').replace(/[^\w .'-]/g, '').trim().slice(0, 14);
  return text || fallback;
}

export function newRoom(code) {
  return {
    code,
    players: [],
    leaderId: null,
    phase: 'lobby',
    seed: null,
    rng: null,
    run: null,
    battle: null,
    shop: null,
    shrine: null,
    summary: null,
    feed: [],
  };
}

function note(room, text) {
  room.feed.push(text);
  if (room.feed.length > 14) room.feed.splice(0, room.feed.length - 14);
}

function playerById(room, id) {
  return room.players.find((player) => player.id === id) || null;
}

function ownUnit(room, playerId) {
  return room.battle?.units.find((unit) => unit.ownerId === playerId) || null;
}

function connected(room, playerId) {
  return !!playerById(room, playerId)?.connected;
}

function settle(room) {
  if (room.phase !== 'battle' || !room.battle) return;
  if (room.battle.phase === 'victory') {
    room.summary = commitVictory(room.run, room.battle);
    room.phase = 'victory';
    note(room, `${room.summary.nodeName} cleared. +${room.summary.gold} coin, +${room.summary.xp} xp.`);
  } else if (room.battle.phase === 'defeat') {
    room.phase = 'defeat';
    room.summary = {
      nodeName: room.battle.name,
      nodeType: room.battle.tier,
      gold: 0,
      xp: 0,
      leveled: [],
      defeat: true,
    };
    note(room, 'The company is down.');
  }
}

function pump(room, result) {
  if (!result || result.error) return result || { error: 'Nothing happened.' };
  result.events = result.events || [];
  settle(room);
  let guard = 0;
  while (
    room.phase === 'battle'
    && room.battle
    && room.battle.phase === 'party'
    && allReady(room.battle)
    && guard++ < 6
  ) {
    const enemy = runEnemyPhase(room.battle, room.rng || Math.random);
    result.events.push(...(enemy.events || []));
    settle(room);
  }
  return result;
}

export function observe(room) {
  if (room.battle) syncOutcome(room.battle);
  return pump(room, { events: [] });
}

export function addPlayer(room, { name, token }) {
  if (room.players.length >= 4) return { error: 'That room is full (4).' };
  const index = room.players.length;
  const player = {
    id: `p${index + 1}`,
    name: cleanName(name, PLAYER_NAMES[index]),
    classId: null,
    token,
    connected: true,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
  };
  room.players.push(player);
  if (!room.leaderId) room.leaderId = player.id;
  note(room, `${player.name} joined.`);
  return { player, events: [] };
}

export function disconnectPlayer(room, playerId) {
  const player = playerById(room, playerId);
  if (!player) return { events: [] };
  player.connected = false;
  if (room.leaderId === playerId) {
    const next = room.players.find((entry) => entry.connected);
    if (next) room.leaderId = next.id;
  }
  const events = [];
  if (room.phase === 'battle' && room.battle?.phase === 'party') {
    const unit = ownUnit(room, playerId);
    if (unit && !unit.downed && !unit.ready) {
      const ended = tryEndTurn(room.battle, unit.id);
      if (ended.events) events.push(...ended.events);
      room.battle.log.push(`${player.name} disconnected. Their turn is skipped.`);
    }
  }
  note(room, `${player.name} disconnected.`);
  return pump(room, { events });
}

export function reconnectPlayer(room, playerId) {
  const player = playerById(room, playerId);
  if (!player) return { error: 'Unknown player.' };
  player.connected = true;
  if (!room.players.some((entry) => entry.id !== playerId && entry.connected) && !room.leaderId) {
    room.leaderId = playerId;
  }
  note(room, `${player.name} reconnected.`);
  return { events: [] };
}

export function pickClass(room, playerId, classId) {
  if (room.phase !== 'lobby') return { error: 'Classes lock when the run starts.' };
  if (!CLASSES[classId]) return { error: 'Unknown class.' };
  const player = playerById(room, playerId);
  if (!player) return { error: 'You are not in this room.' };
  player.classId = classId;
  return { events: [] };
}

export function startRun(room, playerId, seedText) {
  if (room.phase !== 'lobby') return { error: 'A run is already going.' };
  if (playerId !== room.leaderId) return { error: 'The leader starts the run.' };
  if (!room.players.length) return { error: 'Need at least one player.' };
  if (room.players.some((player) => !player.classId)) return { error: 'Everyone picks a class first.' };
  const parsed = parseSeedText(seedText);
  const seed = parsed || ((Math.floor(Math.random() * 0xffffffff) >>> 0) || 1);
  room.seed = seed;
  room.rng = makeRng((seed ^ 0x9e3779b9) >>> 0);
  room.run = createRun(seed, room.players);
  room.battle = null;
  room.shop = null;
  room.shrine = null;
  room.summary = null;
  room.phase = 'map';
  note(room, `Run ${seedLabel(seed)} begins. ${room.players.length} on the march.`);
  return { events: [] };
}

function finishNode(room) {
  const id = room.run?.currentId;
  if (id && !room.run.cleared.includes(id)) room.run.cleared.push(id);
  room.shop = null;
  room.shrine = null;
  room.phase = 'map';
}

export function chooseNode(room, playerId, nodeId) {
  if (room.phase !== 'map') return { error: 'You are not choosing a road.' };
  if (!playerById(room, playerId)) return { error: 'You are not in this room.' };
  if (!nextNodeIds(room.run).includes(nodeId)) return { error: 'That stop is not open.' };
  const node = nodeById(room.run, nodeId);
  if (!node) return { error: 'Unknown stop.' };
  room.run.currentId = node.id;
  note(room, `${playerById(room, playerId).name} takes ${node.name}.`);
  if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
    room.battle = createBattle({
      seed: room.seed,
      nodeId: node.id,
      tier: node.type,
      name: node.name,
      playerCount: room.run.units.length,
      party: room.run.units,
    });
    room.phase = 'battle';
    return { events: [{ t: 'phase', phase: 'battle', name: node.name }] };
  }
  if (node.type === 'shop') {
    room.shop = buildShop();
    room.phase = 'shop';
    return { events: [] };
  }
  if (node.type === 'rest') {
    room.phase = 'rest';
    return { events: [] };
  }
  if (node.type === 'shrine') {
    room.shrine = rollShrine(room.run, node.id);
    room.phase = 'shrine';
    return { events: [] };
  }
  return { error: 'That stop is empty.' };
}

export function commandMove(room, playerId, x, z) {
  if (room.phase !== 'battle' || !room.battle) return { error: 'No battle.' };
  const unit = ownUnit(room, playerId);
  if (!unit) return { error: 'You have no unit in this fight.' };
  return pump(room, tryMove(room.battle, unit.id, x, z));
}

export function commandUndo(room, playerId) {
  if (room.phase !== 'battle' || !room.battle) return { error: 'No battle.' };
  const unit = ownUnit(room, playerId);
  if (!unit) return { error: 'You have no unit in this fight.' };
  return pump(room, tryUndo(room.battle, unit.id));
}

export function commandAct(room, playerId, abilityId, x, z) {
  if (room.phase !== 'battle' || !room.battle) return { error: 'No battle.' };
  const unit = ownUnit(room, playerId);
  if (!unit) return { error: 'You have no unit in this fight.' };
  return pump(room, tryAct(room.battle, unit.id, abilityId, x, z, room.rng || Math.random));
}

export function commandEnd(room, playerId) {
  if (room.phase !== 'battle' || !room.battle) return { error: 'No battle.' };
  const unit = ownUnit(room, playerId);
  if (!unit) return { error: 'You have no unit in this fight.' };
  return pump(room, tryEndTurn(room.battle, unit.id));
}

export function commandBuy(room, playerId, itemId, targetId) {
  if (room.phase !== 'shop' || !room.shop) return { error: 'No stall here.' };
  const item = room.shop.items.find((entry) => entry.id === itemId);
  if (!item) return { error: 'Not for sale.' };
  if (item.left === 0) return { error: 'Sold out.' };
  if (room.run.gold < item.cost) return { error: 'Not enough coin.' };
  const target = room.run.units.find((unit) => unit.ownerId === (targetId || playerId));
  if (!target) return { error: 'Who is that for?' };
  if (!applyShopItem(target, item)) return { error: 'That would not help.' };
  room.run.gold -= item.cost;
  if (item.left != null) item.left -= 1;
  const buyer = playerById(room, playerId);
  note(room, `${buyer?.name || 'Someone'} bought ${item.name} for ${target.name}.`);
  return { events: [] };
}

export function commandShrine(room, playerId, upgradeId) {
  if (room.phase !== 'shrine' || !room.shrine) return { error: 'No shrine here.' };
  if (room.shrine.picked[playerId]) return { error: 'You already chose.' };
  const options = room.shrine.options[playerId] || [];
  if (!options.some((option) => option.id === upgradeId)) return { error: 'That gift is not offered.' };
  const unit = room.run.units.find((entry) => entry.ownerId === playerId);
  if (!applyUpgrade(unit, upgradeId)) return { error: 'Cannot take that.' };
  room.shrine.picked[playerId] = upgradeId;
  note(room, `${unit.name} takes ${options.find((option) => option.id === upgradeId).name}.`);
  return { events: [] };
}

export function commandLevel(room, playerId, choiceId) {
  if (room.phase !== 'level') return { error: 'No level gift right now.' };
  const offer = (room.run.offers || []).find((entry) => entry.playerId === playerId && !entry.picked);
  if (!offer) return { error: 'No gift waiting for you.' };
  const unit = room.run.units.find((entry) => entry.ownerId === playerId);
  if (!applyLevelChoice(unit, choiceId)) return { error: 'Unknown gift.' };
  offer.picked = choiceId;
  note(room, `${unit.name} takes the level ${offer.level} gift.`);
  return { events: [] };
}

function unpickedOffers(room) {
  return (room.run?.offers || []).filter((offer) => !offer.picked);
}

function autopickLevels(room) {
  for (const offer of unpickedOffers(room)) {
    if (connected(room, offer.playerId)) continue;
    const unit = room.run.units.find((entry) => entry.ownerId === offer.playerId);
    if (!unit) continue;
    applyLevelChoice(unit, 'hp');
    offer.picked = 'hp';
  }
}

export function continueForward(room, playerId) {
  if (!playerById(room, playerId)) return { error: 'You are not in this room.' };
  if (room.phase === 'victory') {
    const node = nodeById(room.run, room.run.currentId);
    room.battle = null;
    if (node?.type === 'boss') {
      room.phase = 'cleared';
      return { events: [] };
    }
    if (unpickedOffers(room).some((offer) => connected(room, offer.playerId))) {
      room.phase = 'level';
      return { events: [] };
    }
    autopickLevels(room);
    room.phase = 'map';
    return { events: [] };
  }
  if (room.phase === 'level') {
    if (unpickedOffers(room).some((offer) => offer.playerId === playerId && connected(room, playerId))) {
      return { error: 'Choose a level gift first.' };
    }
    const waiting = unpickedOffers(room).filter((offer) => offer.playerId !== playerId && connected(room, offer.playerId));
    if (waiting.length) {
      const names = [...new Set(waiting.map((offer) => offer.name || 'someone'))].join(', ');
      return { error: `Waiting on ${names}.` };
    }
    autopickLevels(room);
    room.battle = null;
    room.phase = 'map';
    return { events: [] };
  }
  if (room.phase === 'shop') {
    finishNode(room);
    return { events: [] };
  }
  if (room.phase === 'rest') {
    const before = room.run.units.map((unit) => unit.hp);
    applyRest(room.run);
    note(room, 'The company rests.');
    finishNode(room);
    return { events: [], rested: before };
  }
  if (room.phase === 'shrine') {
    const mine = room.run.units.find((unit) => unit.ownerId === playerId);
    if (mine && !room.shrine.picked[playerId] && connected(room, playerId)) {
      return { error: 'Choose a shrine gift first.' };
    }
    const waiting = room.run.units.filter((unit) => unit.ownerId !== playerId && !room.shrine.picked[unit.ownerId] && connected(room, unit.ownerId));
    if (waiting.length) return { error: `Waiting on ${waiting.map((unit) => unit.name).join(', ')}.` };
    for (const unit of room.run.units) {
      if (room.shrine.picked[unit.ownerId]) continue;
      const choice = room.shrine.options[unit.ownerId]?.[0];
      if (choice) {
        applyUpgrade(unit, choice.id);
        room.shrine.picked[unit.ownerId] = choice.id;
      }
    }
    finishNode(room);
    return { events: [] };
  }
  return { error: 'Nothing to continue.' };
}

export function returnToLobby(room, playerId) {
  if (!playerById(room, playerId)) return { error: 'You are not in this room.' };
  if (room.phase !== 'defeat' && room.phase !== 'cleared') {
    return { error: 'The run is still going.' };
  }
  room.phase = 'lobby';
  room.run = null;
  room.battle = null;
  room.shop = null;
  room.shrine = null;
  room.summary = null;
  room.seed = null;
  room.rng = null;
  note(room, 'Back in the lobby. Classes are still yours.');
  return { events: [] };
}

export function viewState(room) {
  return {
    code: room.code,
    phase: room.phase,
    leaderId: room.leaderId,
    seed: room.seed,
    seedLabel: room.seed == null ? null : seedLabel(room.seed),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      classId: player.classId,
      connected: player.connected,
      color: player.color,
      leader: player.id === room.leaderId,
    })),
    run: room.run,
    battle: room.battle,
    shop: room.shop,
    shrine: room.shrine,
    summary: room.summary,
    feed: room.feed,
  };
}

export function abilityById(id) {
  return ABILITIES[id] || null;
}
