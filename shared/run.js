import { CLASSES, LEVEL_CHOICES, SHOP_ITEMS, UPGRADES, xpNeed } from './data.js';
import { rewardFor } from './battle.js';
import { forkRng, makeRng, rngInt } from './rng.js';

const FLAVOR = {
  start: [['Camp', 'The company waits at the edge of the Grey March.']],
  battle: [
    ['Road Skirmish', 'A toll gang blocks the cart track.'],
    ['Ditch Ambush', 'Spears waiting in the reed ditch.'],
    ['Bridge Push', 'They want the stone bridge.'],
    ['Orchard Wall', 'Figures along a broken orchard wall.'],
    ['Mile Marker', 'An old stone post, and an unfriendly camp.'],
    ['Reed Cut', 'The path narrows between wet reeds.'],
    ['Cart Stones', 'A broken cart and people who want it.'],
    ['Low Ford', 'They hold the shallow crossing.'],
  ],
  elite: [
    ['Cistern Yard', 'Something heavy is waiting by the cistern.'],
    ['Banner Party', 'A marked crew, better armed than the last.'],
  ],
  shop: [
    ['Waystation', 'A shuttered stall still sells to anyone with coin.'],
    ['Mile Cart', 'A cart with a canvas roof and a locked box.'],
  ],
  rest: [
    ['Campfire', 'A low fire and a dry wall to sit against.'],
    ['Shepherd Shed', 'The roof leaks. The floor is dry enough.'],
  ],
  shrine: [
    ['Road Shrine', 'A nameless shrine. Leave a habit, take a trick.'],
    ['Mile Saint', 'The statue has no face. The niche is still warm.'],
  ],
  boss: [['The Gatehouse', 'The March Warden holds the last arch.']],
};

function shuffle(rng, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function takeFlavor(rng, type, used) {
  const pool = FLAVOR[type] || FLAVOR.battle;
  const fresh = pool.filter((entry) => !used.has(entry[0]));
  const choice = (fresh.length ? fresh : pool)[rngInt(rng, (fresh.length ? fresh : pool).length)];
  used.add(choice[0]);
  return { name: choice[0], blurb: choice[1] };
}

export function createRun(seed, players) {
  const rng = makeRng(seed || 1);
  const spec = [
    ['start'],
    ['battle', 'battle'],
    ['battle', 'rest', 'shop'],
    ['elite', 'shrine', 'battle'],
    ['battle', 'battle'],
    ['rest', 'shop', 'shrine'],
    ['boss'],
  ];
  const rows = spec.map((row, index) => (index === 0 || index === spec.length - 1 ? row.slice() : shuffle(rng, row)));
  const used = new Set();
  const nodes = [];
  rows.forEach((types, row) => {
    types.forEach((type, index) => {
      const flavor = takeFlavor(rng, type, used);
      nodes.push({
        id: `n${nodes.length}`,
        type,
        row,
        col: (index + 1) / (types.length + 1),
        name: flavor.name,
        blurb: flavor.blurb,
      });
    });
  });
  const edges = [];
  const link = (from, to) => {
    if (!edges.some((edge) => edge.from === from && edge.to === to)) edges.push({ from, to });
  };
  for (let row = 0; row < rows.length - 1; row++) {
    const froms = nodes.filter((node) => node.row === row);
    const tos = nodes.filter((node) => node.row === row + 1);
    for (const from of froms) {
      const near = tos.filter((to) => tos.length === 1 || froms.length === 1 || Math.abs(from.col - to.col) <= 0.36);
      const targets = near.length ? near : [tos.slice().sort((a, b) => Math.abs(a.col - from.col) - Math.abs(b.col - from.col))[0]];
      for (const to of targets) link(from.id, to.id);
    }
    for (const to of tos) {
      if (edges.some((edge) => edge.to === to.id)) continue;
      const parent = froms.slice().sort((a, b) => Math.abs(a.col - to.col) - Math.abs(b.col - to.col))[0];
      link(parent.id, to.id);
    }
  }
  const start = nodes[0];
  const units = players.map((player) => {
    const kit = CLASSES[player.classId];
    const base = kit.base;
    return {
      ownerId: player.id,
      name: player.name,
      classId: player.classId,
      color: player.color,
      hp: base.hp,
      maxHp: base.hp,
      mp: base.mp,
      maxMp: base.mp,
      move: base.move,
      jump: base.jump,
      power: base.power,
      defense: base.defense,
      evade: base.evade,
      speed: base.speed,
      level: 1,
      xp: 0,
      upgrades: [],
    };
  });
  return {
    seed,
    gold: 0,
    nodes,
    edges,
    currentId: start.id,
    cleared: [start.id],
    units,
    offers: [],
    summary: null,
  };
}

export function nodeById(run, id) {
  return run?.nodes?.find((node) => node.id === id) || null;
}

export function nextNodeIds(run) {
  if (!run) return [];
  const current = nodeById(run, run.currentId);
  if (!current) return [];
  if (current.type !== 'start' && !run.cleared.includes(current.id)) return [];
  return run.edges.filter((edge) => edge.from === current.id && !run.cleared.includes(edge.to)).map((edge) => edge.to);
}

export function commitVictory(run, battle) {
  if (battle.committed) return run.summary;
  battle.committed = true;
  const reward = rewardFor(battle);
  run.gold += reward.gold;
  const leveled = [];
  for (const unit of battle.units.filter((entry) => entry.side === 'player')) {
    const src = run.units.find((entry) => entry.ownerId === unit.ownerId);
    if (!src) continue;
    if (unit.downed) {
      src.hp = Math.max(1, Math.ceil(src.maxHp * 0.35));
      src.mp = Math.max(0, Math.ceil(src.maxMp * 0.25));
    } else {
      src.hp = Math.max(1, Math.min(src.maxHp, unit.hp + 4));
      src.mp = Math.min(src.maxMp, unit.mp || 0);
    }
    src.xp += reward.xp;
    while (src.xp >= xpNeed(src.level)) {
      src.xp -= xpNeed(src.level);
      src.level += 1;
      run.offers.push({ playerId: src.ownerId, name: src.name, level: src.level, picked: null });
      leveled.push({ name: src.name, level: src.level });
    }
  }
  if (!run.cleared.includes(battle.nodeId)) run.cleared.push(battle.nodeId);
  run.currentId = battle.nodeId;
  run.summary = {
    nodeName: battle.name,
    nodeType: battle.tier,
    gold: reward.gold,
    xp: reward.xp,
    leveled,
    defeat: false,
  };
  return run.summary;
}

export function applyRest(run) {
  for (const unit of run.units) {
    unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(1, Math.round(unit.maxHp * 0.45)));
    unit.mp = Math.min(unit.maxMp, unit.mp + Math.max(1, Math.round(unit.maxMp * 0.5)));
  }
}

export function buildShop() {
  return {
    items: SHOP_ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      desc: item.desc,
      cost: item.cost,
      kind: item.kind,
      amount: item.amount,
      left: item.stock ?? null,
    })),
  };
}

export function applyShopItem(unit, item) {
  if (item.kind === 'heal') {
    if (unit.hp >= unit.maxHp) return false;
    unit.hp = Math.min(unit.maxHp, unit.hp + item.amount);
    return true;
  }
  if (item.kind === 'mp') {
    if (unit.mp >= unit.maxMp) return false;
    unit.mp = Math.min(unit.maxMp, unit.mp + item.amount);
    return true;
  }
  if (item.kind === 'power') {
    unit.power += item.amount;
    return true;
  }
  if (item.kind === 'defense') {
    unit.defense += item.amount;
    return true;
  }
  if (item.kind === 'maxHp') {
    unit.maxHp += item.amount;
    unit.hp += item.amount;
    return true;
  }
  return false;
}

export function applyLevelChoice(unit, choiceId) {
  const choice = LEVEL_CHOICES.find((entry) => entry.id === choiceId);
  if (!choice) return false;
  if (choiceId === 'hp') {
    unit.maxHp += 8;
    unit.hp += 8;
  } else if (choiceId === 'mp') {
    unit.maxMp += 5;
    unit.mp += 5;
  } else if (choiceId === 'edge') {
    unit.power += 2;
  }
  return true;
}

export function applyUpgrade(unit, upgradeId) {
  const upgrade = UPGRADES.find((entry) => entry.id === upgradeId);
  if (!upgrade) return false;
  if (unit.upgrades.includes(upgradeId)) return false;
  if (upgrade.classes && !upgrade.classes.includes(unit.classId)) return false;
  unit.upgrades.push(upgradeId);
  if (upgradeId === 'vital') {
    unit.maxHp += 10;
    unit.hp = Math.min(unit.maxHp, unit.hp + 10);
  } else if (upgradeId === 'spirit') {
    unit.maxMp += 6;
    unit.mp = Math.min(unit.maxMp, unit.mp + 6);
  } else if (upgradeId === 'march') {
    unit.move = Math.min(7, unit.move + 1);
  } else if (upgradeId === 'mail') {
    unit.defense += 1;
  }
  return true;
}

export function rollShrine(run, nodeId) {
  const rng = forkRng(run.seed, `shrine:${nodeId}`);
  const options = {};
  for (const unit of run.units) {
    const pool = UPGRADES.filter((upgrade) => !unit.upgrades.includes(upgrade.id) && (!upgrade.classes || upgrade.classes.includes(unit.classId)));
    const picked = [];
    const specific = pool.filter((upgrade) => upgrade.classes);
    if (specific.length) picked.push(specific[rngInt(rng, specific.length)]);
    const rest = pool.filter((upgrade) => !picked.includes(upgrade));
    while (picked.length < 3 && rest.length) picked.push(rest.splice(rngInt(rng, rest.length), 1)[0]);
    options[unit.ownerId] = picked.map((upgrade) => ({ id: upgrade.id, name: upgrade.name, desc: upgrade.desc }));
  }
  return { options, picked: {} };
}

export function reachableBoss(run) {
  const start = run.nodes.find((node) => node.type === 'start');
  const seen = new Set([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of run.edges) {
      if (edge.from !== id || seen.has(edge.to)) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }
  const boss = run.nodes.find((node) => node.type === 'boss');
  return seen.has(boss.id);
}
