import WebSocket from 'ws';
import { COMBOS, CLASSES, ENEMIES, encounterRoster, scaleHp } from '../shared/data.js';
import { makeRng } from '../shared/rng.js';
import { reachable } from '../shared/grid.js';
import {
  activationStart,
  createBattle,
  flatTiles,
  makeBattle,
  makeUnit,
  moveBudget,
  statusOf,
  syncOutcome,
  tryAct,
} from '../shared/battle.js';
import { simulateBattle } from '../shared/ai.js';
import { applyRest, buildShop, createRun, nextNodeIds, nodeById, reachableBoss } from '../shared/run.js';
import {
  addPlayer,
  chooseNode,
  commandBuy,
  continueForward,
  newRoom,
  observe,
  pickClass,
  returnToLobby,
  startRun,
} from '../shared/room.js';
import { createApp } from '../server.js';
import { TILE_VISUALS, UNIT_VISUALS } from '../public/js/visuals.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function pair() {
  const wizard = makeUnit({
    id: 'wiz', name: 'Ash', side: 'player', ownerId: 'p1', classId: 'wizard', x: 2, z: 2, facing: 0,
  });
  const grunt = makeUnit({
    id: 'grunt', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 2, z: 4, facing: 2, hp: 40, maxHp: 40,
  });
  const battle = makeBattle({ units: [wizard, grunt] });
  return { battle, wizard, grunt };
}

function act(battle, unitId, ability, x, z) {
  const result = tryAct(battle, unitId, ability, x, z, makeRng(1));
  if (result.error) throw new Error(result.error);
  return result;
}

const comboIds = COMBOS.map((combo) => combo.id);
assert(comboIds.length >= 4 && comboIds.length <= 8, `expected a small combo list, got ${comboIds.length}`);
for (const id of ['storm-arc', 'wildfire', 'fume-burst', 'opening', 'ice-rink', 'shatter']) {
  const combo = COMBOS.find((entry) => entry.id === id);
  assert(combo && combo.name && combo.detail && combo.when && combo.effect, `combo ${id} is incomplete`);
}

for (const id of Object.keys(CLASSES)) {
  assert(UNIT_VISUALS[id]?.group === `units/${id}`, `missing units/${id} visual`);
}
for (const id of Object.keys(ENEMIES)) {
  assert(UNIT_VISUALS[id]?.group === `units/${id}`, `missing units/${id} visual`);
}
for (const type of ['grass', 'stone', 'mud', 'water']) {
  assert(TILE_VISUALS[type]?.group === `tiles/${type}`, `missing tiles/${type} visual`);
}

assert(encounterRoster('battle', 1).length < encounterRoster('battle', 4).length, 'more players should mean more enemies');
assert(encounterRoster('boss', 1).length < encounterRoster('boss', 4).length, 'boss fights should add bodies');
assert(scaleHp(ENEMIES.grunt.hp, 4) > scaleHp(ENEMIES.grunt.hp, 1), 'enemy hp should scale up');

function party(n, classId = 'wizard') {
  return Array.from({ length: n }, (_, i) => ({
    ownerId: `p${i + 1}`,
    name: `P${i + 1}`,
    classId,
    color: '#fff',
    hp: 24, maxHp: 24, mp: 16, maxMp: 16,
    move: 3, jump: 2, power: 0, defense: 1, evade: 0, speed: 10,
    level: 1, xp: 0, upgrades: [],
  }));
}

const solo = createBattle({ seed: 11, nodeId: 'n1', tier: 'battle', name: 'A', playerCount: 1, party: party(1) });
const squad = createBattle({ seed: 11, nodeId: 'n1', tier: 'battle', name: 'A', playerCount: 4, party: party(4) });
assert(solo.enemyCount < squad.enemyCount, 'generated battle did not scale enemy count');
const hp = (battle) => battle.units.filter((unit) => unit.side === 'enemy').reduce((sum, unit) => sum + unit.maxHp, 0);
assert(hp(squad) > hp(solo), 'generated battle did not scale enemy hp');
const again = createBattle({ seed: 11, nodeId: 'n1', tier: 'battle', name: 'A', playerCount: 1, party: party(1) });
assert(JSON.stringify(solo.tiles) === JSON.stringify(again.tiles), 'map generation was not stable for a seed');

const boss1 = createBattle({ seed: 4, nodeId: 'boss', tier: 'boss', name: 'Gate', playerCount: 1, party: party(1, 'knight') });
const boss4 = createBattle({ seed: 4, nodeId: 'boss', tier: 'boss', name: 'Gate', playerCount: 4, party: party(4, 'knight') });
assert(hp(boss4) > hp(boss1), 'boss should be tougher with four players');

{
  const tiles = flatTiles(5, 5);
  tiles.find((tile) => tile.x === 2 && tile.z === 1).h = 2;
  tiles.find((tile) => tile.x === 1 && tile.z === 2).h = 1;
  const knight = makeUnit({ id: 'k', name: 'Ash', side: 'player', classId: 'knight', x: 1, z: 1, move: 2, jump: 1 });
  const field = makeBattle({ width: 5, depth: 5, tiles, units: [knight] });
  const stops = reachable(field, knight, moveBudget(knight));
  assert(!stops.some((tile) => tile.x === 2 && tile.z === 1), 'jump 1 walked up a height of 2');
  assert(stops.some((tile) => tile.x === 1 && tile.z === 2), 'jump 1 could not step up a height of 1');
}

{
  const knight = makeUnit({ id: 'k', name: 'Ash', side: 'player', classId: 'knight', x: 3, z: 4 });
  const back = makeUnit({ id: 'b', name: 'Back', side: 'enemy', classId: 'grunt', x: 3, z: 5, facing: 0, hp: 40, maxHp: 40 });
  const field = makeBattle({ units: [knight, back] });
  const backHit = act(field, 'k', 'slash', 3, 5);
  const backDamage = backHit.events.find((event) => event.t === 'damage').amount;
  const knight2 = makeUnit({ id: 'k2', name: 'Ash', side: 'player', classId: 'knight', x: 3, z: 4 });
  const ahead = makeUnit({ id: 'f2', name: 'Front', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 0, hp: 40, maxHp: 40 });
  const field2 = makeBattle({ units: [knight2, ahead] });
  const frontHit = act(field2, 'k2', 'slash', 3, 3);
  const frontDamage = frontHit.events.find((event) => event.t === 'damage').amount;
  assert(backDamage > frontDamage, `back attack (${backDamage}) should beat a front attack (${frontDamage})`);
}

{
  const { battle, grunt } = pair();
  grunt.statuses = [{ id: 'soaked', roundsLeft: 2, potency: 0 }];
  const soaked = act(battle, 'wiz', 'bolt', grunt.x, grunt.z);
  const plain = pair();
  const normal = act(plain.battle, 'wiz', 'bolt', plain.grunt.x, plain.grunt.z);
  const soakedDamage = soaked.events.find((event) => event.t === 'damage').amount;
  const normalDamage = normal.events.find((event) => event.t === 'damage').amount;
  assert(soakedDamage > normalDamage, 'Storm Arc did not add damage');
  assert(soaked.events.some((event) => event.t === 'combo' && event.name === 'Storm Arc'), 'Storm Arc callout missing');
  assert(!statusOf(grunt, 'soaked'), 'Storm Arc should consume Soaked');
  assert(statusOf(grunt, 'shocked'), 'Storm Arc should Shock');
}

{
  const { battle, grunt } = pair();
  grunt.statuses = [{ id: 'oil', roundsLeft: 3, potency: 0 }];
  const oiled = act(battle, 'wiz', 'ember', grunt.x, grunt.z);
  const plain = pair();
  const normal = act(plain.battle, 'wiz', 'ember', plain.grunt.x, plain.grunt.z);
  const oiledDamage = oiled.events.filter((event) => event.t === 'damage' && event.id === grunt.id).reduce((sum, event) => sum + event.amount, 0);
  const normalDamage = normal.events.filter((event) => event.t === 'damage').reduce((sum, event) => sum + event.amount, 0);
  assert(oiledDamage > normalDamage, 'Wildfire did not add damage');
  assert(oiled.events.some((event) => event.name === 'Wildfire'), 'Wildfire callout missing');
  assert(!statusOf(grunt, 'oil'), 'Wildfire should burn off Oil');
  assert((statusOf(grunt, 'burning')?.potency || 0) >= 5, 'Wildfire burn should be stronger');
}

{
  const { battle, grunt } = pair();
  grunt.statuses = [{ id: 'poison', ticksLeft: 3, potency: 3 }];
  const burst = act(battle, 'wiz', 'ember', grunt.x, grunt.z);
  const plain = pair();
  const normal = act(plain.battle, 'wiz', 'ember', plain.grunt.x, plain.grunt.z);
  const burstDamage = burst.events.filter((event) => event.t === 'damage' && event.id === grunt.id).reduce((sum, event) => sum + event.amount, 0);
  const normalDamage = normal.events.filter((event) => event.t === 'damage').reduce((sum, event) => sum + event.amount, 0);
  assert(burstDamage > normalDamage, 'Fume Burst did not add damage');
  assert(burst.events.some((event) => event.name === 'Fume Burst'), 'Fume Burst callout missing');
  assert(!statusOf(grunt, 'poison'), 'Fume Burst should consume Poison');
}

{
  const rogue = makeUnit({ id: 'rg', name: 'Briar', side: 'player', classId: 'rogue', x: 3, z: 4, facing: 2 });
  const grunt = makeUnit({
    id: 'g', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 2, hp: 40, maxHp: 40,
    statuses: [{ id: 'staggered', roundsLeft: 2, potency: 0 }],
  });
  const field = makeBattle({ units: [rogue, grunt] });
  const crit = act(field, 'rg', 'stab', 3, 3);
  const plainRogue = makeUnit({ ...rogue, id: 'rg2' });
  const plainGrunt = makeUnit({ ...grunt, id: 'g2', statuses: [] });
  const plain = makeBattle({ units: [plainRogue, plainGrunt] });
  const normal = act(plain, 'rg2', 'stab', 3, 3);
  const critDamage = crit.events.find((event) => event.t === 'damage').amount;
  const normalDamage = normal.events.find((event) => event.t === 'damage').amount;
  assert(critDamage > normalDamage, 'Opening should crit harder than a plain backstab');
  assert(crit.events.some((event) => event.name === 'Opening'), 'Opening callout missing');
  assert(!statusOf(grunt, 'staggered'), 'Opening should clear Stagger');

  const frontRogue = makeUnit({ id: 'rg3', name: 'Briar', side: 'player', classId: 'rogue', x: 3, z: 2 });
  const frontGrunt = makeUnit({
    id: 'g3', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 2, hp: 40, maxHp: 40,
    statuses: [{ id: 'staggered', roundsLeft: 2, potency: 0 }],
  });
  const front = makeBattle({ units: [frontRogue, frontGrunt] });
  const faced = act(front, 'rg3', 'stab', 3, 3);
  assert(!faced.events.some((event) => event.t === 'combo'), 'Opening should not trigger from the front');
  assert(statusOf(frontGrunt, 'staggered'), 'a front stab should leave Stagger');
}

{
  const knight = makeUnit({ id: 'k', name: 'Cade', side: 'player', classId: 'knight', x: 3, z: 2 });
  const grunt = makeUnit({ id: 'g', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 2, hp: 40, maxHp: 40 });
  const icy = makeBattle({ units: [knight, grunt], frost: { '3,3': 2 } });
  const slid = act(icy, 'k', 'shove', 3, 3);
  const far = makeBattle({
    units: [
      makeUnit({ id: 'k2', name: 'Cade', side: 'player', classId: 'knight', x: 3, z: 2 }),
      makeUnit({ id: 'g2', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 2, hp: 40, maxHp: 40 }),
    ],
  });
  const short = act(far, 'k2', 'shove', 3, 3);
  const icyEnd = slid.events.find((event) => event.t === 'move' && event.knock);
  const dryEnd = short.events.find((event) => event.t === 'move' && event.knock);
  assert(icyEnd && dryEnd, 'shove should move the target');
  assert(icyEnd.path.length > dryEnd.path.length, `Ice Rink slid ${icyEnd.path.length}, dry shove slid ${dryEnd.path.length}`);
  assert(slid.events.some((event) => event.name === 'Ice Rink'), 'Ice Rink callout missing');
}

{
  const knight = makeUnit({ id: 'k', name: 'Cade', side: 'player', classId: 'knight', x: 3, z: 2 });
  const grunt = makeUnit({
    id: 'g', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 2, hp: 40, maxHp: 40,
    statuses: [{ id: 'frozen', roundsLeft: 2, potency: 0 }],
  });
  const neighbor = makeUnit({ id: 'n', name: 'Toll Archer', side: 'enemy', classId: 'archer', x: 4, z: 3, hp: 20, maxHp: 20 });
  const field = makeBattle({ units: [knight, grunt, neighbor] });
  const hit = act(field, 'k', 'bash', 3, 3);
  const plain = makeBattle({
    units: [
      makeUnit({ id: 'k2', name: 'Cade', side: 'player', classId: 'knight', x: 3, z: 2 }),
      makeUnit({ id: 'g2', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, facing: 2, hp: 40, maxHp: 40 }),
    ],
  });
  const dull = act(plain, 'k2', 'bash', 3, 3);
  const shattered = hit.events.find((event) => event.t === 'damage' && event.id === 'g').amount;
  const normal = dull.events.find((event) => event.t === 'damage').amount;
  assert(shattered > normal, 'Shatter should add damage');
  assert(hit.events.some((event) => event.name === 'Shatter'), 'Shatter callout missing');
  assert(!statusOf(grunt, 'frozen'), 'Shatter should break Frozen');
  assert(neighbor.hp === 16, `Shatter splash should chip a neighbor, hp ${neighbor.hp}`);
}

{
  const grunt = makeUnit({
    id: 'g', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 2, z: 2, hp: 20, maxHp: 20,
    statuses: [{ id: 'burning', ticksLeft: 2, potency: 3 }],
  });
  const field = makeBattle({ units: [grunt] });
  activationStart(field, grunt);
  assert(grunt.hp === 17, 'burning should tick at the start of the turn');
  assert(statusOf(grunt, 'burning').ticksLeft === 1, 'burning should have a tick left');
}

{
  const players = [
    { id: 'p1', name: 'Ash', classId: 'wizard', color: '#e2a23b' },
    { id: 'p2', name: 'Briar', classId: 'wizard', color: '#3cb8a8' },
  ];
  const first = createRun(42, players);
  const second = createRun(42, players);
  assert(JSON.stringify(first.nodes) === JSON.stringify(second.nodes), 'run map was not seeded');
  assert(first.units.every((unit) => unit.classId === 'wizard'), 'duplicate classes should be allowed');
  for (let seed = 1; seed <= 24; seed++) {
    const run = createRun(seed, players);
    assert(reachableBoss(run), `seed ${seed} cannot reach the boss`);
    for (const node of run.nodes) {
      const children = run.edges.filter((edge) => edge.from === node.id);
      const parents = run.edges.filter((edge) => edge.to === node.id);
      if (node.type !== 'boss') assert(children.length > 0, `${node.id} has no way forward`);
      if (node.type !== 'start') assert(parents.length > 0, `${node.id} is unreachable`);
    }
  }
}

{
  const knight = makeUnit({ id: 'k', name: 'Ash', side: 'player', ownerId: 'p1', classId: 'knight', x: 2, z: 0 });
  const grunt = makeUnit({ id: 'g', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 2, z: 5 });
  const field = makeBattle({ units: [knight, grunt] });
  simulateBattle(field, makeRng(1), 16);
  assert(field.phase === 'victory', `knight should beat one grunt, phase ${field.phase} hp ${knight.hp}`);
}

{
  const rogue = makeUnit({ id: 'rg', name: 'Briar', side: 'player', ownerId: 'p2', classId: 'rogue', x: 3, z: 4 });
  const wizard = makeUnit({ id: 'wz', name: 'Ash', side: 'player', ownerId: 'p1', classId: 'wizard', x: 4, z: 3 });
  const grunt = makeUnit({ id: 'g', name: 'Road Grunt', side: 'enemy', classId: 'grunt', x: 3, z: 3, hp: 80, maxHp: 80 });
  const field = makeBattle({ units: [rogue, wizard, grunt] });
  simulateBattle(field, makeRng(2), 4);
  assert(field.log.some((line) => line.includes('COMBO!')), `party AI should set up a combo\n${field.log.join('\n')}`);
}

function boot(classIds) {
  const room = newRoom('TEST');
  classIds.forEach((classId, index) => {
    const added = addPlayer(room, { name: ['Ash', 'Briar', 'Cade', 'Dune'][index], token: `t${index}` });
    pickClass(room, added.player.id, classId);
  });
  const started = startRun(room, 'p1', '11');
  assert(!started.error, started.error || 'start failed');
  return room;
}

{
  const room = boot(['knight', 'rogue']);
  assert(room.phase === 'map', 'run should open on the node map');
  const battleNode = nextNodeIds(room.run)
    .map((id) => nodeById(room.run, id))
    .find((node) => node.type === 'battle');
  const entered = chooseNode(room, 'p1', battleNode.id);
  assert(!entered.error, entered.error || 'could not enter battle');
  assert(room.phase === 'battle', 'battle did not start');
  assert(room.battle.enemyCount === encounterRoster('battle', 2).length, 'room battle ignored party size');
  for (const unit of room.battle.units) {
    if (unit.side === 'enemy') {
      unit.hp = 0;
      unit.downed = true;
    }
  }
  observe(room);
  assert(room.phase === 'victory', `wipe of the enemy should win, got ${room.phase}`);
  const gold = room.run.gold;
  assert(gold > 0, 'victory should pay coin');
  const after = continueForward(room, 'p1');
  assert(!after.error, after.error || 'continue failed');
  assert(room.phase === 'map', `expected the march, got ${room.phase}`);
  room.run.units[0].hp = 4;
  room.phase = 'shop';
  room.shop = buildShop();
  const bought = commandBuy(room, 'p1', 'tonic', 'p1');
  assert(!bought.error, bought.error || 'buy failed');
  assert(room.run.units[0].hp > 4, 'tonic should heal');
  assert(room.run.gold === gold - 10, 'tonic should cost coin');
  const hurt = room.run.units[0].hp;
  room.run.units[0].hp = Math.max(1, hurt - 10);
  applyRest(room.run);
  assert(room.run.units[0].hp > Math.max(1, hurt - 10), 'rest should heal');
}

{
  const room = boot(['wizard']);
  const battleNode = nextNodeIds(room.run).map((id) => nodeById(room.run, id)).find((node) => node.type === 'battle');
  chooseNode(room, 'p1', battleNode.id);
  for (const unit of room.battle.units) {
    if (unit.side === 'player') {
      unit.hp = 0;
      unit.downed = true;
    }
  }
  observe(room);
  assert(room.phase === 'defeat', 'a full wipe should end the run');
  const back = returnToLobby(room, 'p1');
  assert(!back.error, back.error || 'lobby return failed');
  assert(room.phase === 'lobby', 'game over should return to the lobby');
  assert(room.run === null && room.battle === null, 'the failed run should be cleared');
  assert(room.players[0].classId === 'wizard', 'class pick should stick in the lobby');
}

{
  const app = createApp();
  const address = await app.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${address.port}`;
  const sockets = [];
  function open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const messages = [];
      let ping = null;
      sockets.push(ws);
      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        if (ping) {
          const fn = ping;
          ping = null;
          fn();
        }
      });
      ws.on('error', reject);
      ws.on('open', () => resolve({
        send(obj) { ws.send(JSON.stringify(obj)); },
        async waitFor(pred, label) {
          const start = Date.now();
          while (Date.now() - start < 3000) {
            const found = messages.find(pred);
            if (found) return found;
            await new Promise((done) => {
              ping = done;
              setTimeout(done, 40);
            });
          }
          throw new Error(`timeout ${label}: ${messages.map((message) => message.type).join(',')}`);
        },
      }));
    });
  }
  try {
    const host = await open();
    host.send({ type: 'create', name: 'Ash' });
    const welcome = await host.waitFor((message) => message.type === 'welcome', 'welcome');
    assert(welcome.code.length === 4, 'room code should be 4 characters');
    const joined = [];
    for (const name of ['Briar', 'Cade', 'Dune']) {
      const guest = await open();
      guest.send({ type: 'join', code: welcome.code, name });
      joined.push(guest);
      await guest.waitFor((message) => message.type === 'welcome', `join ${name}`);
    }
    const extra = await open();
    extra.send({ type: 'join', code: welcome.code, name: 'Eve' });
    const rejected = await extra.waitFor((message) => message.type === 'error', 'full room');
    assert(/full/i.test(rejected.text), 'a fifth player should be refused');
    const guest = joined[0];
    host.send({ type: 'class', classId: 'wizard' });
    guest.send({ type: 'class', classId: 'rogue' });
    await host.waitFor((message) => message.type === 'state' && message.state.players.filter((player) => player.classId).length >= 2, 'classes');
    const others = joined.slice(1);
    for (const client of others) client.send({ type: 'class', classId: 'knight' });
    await host.waitFor((message) => message.type === 'state' && message.state.players.every((player) => player.classId), 'all classes');
    host.send({ type: 'start', seed: '11' });
    const mapped = await host.waitFor((message) => message.type === 'state' && message.state.phase === 'map', 'map');
    const node = mapped.state.run.nodes.find((entry) => nextNodeIds(mapped.state.run).includes(entry.id) && entry.type === 'battle');
    host.send({ type: 'node', nodeId: node.id });
    const battle = await guest.waitFor((message) => message.type === 'state' && message.state.phase === 'battle', 'battle');
    const units = battle.state.battle.units;
    assert(units.some((unit) => unit.classId === 'wizard' && unit.side === 'player'), 'wizard missing');
    assert(units.some((unit) => unit.classId === 'rogue' && unit.side === 'player'), 'rogue missing');
    assert(battle.state.battle.enemyCount === encounterRoster('battle', 4).length, 'socket battle did not scale to the party');
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
  }
}

console.log(`simcheck ok — ${COMBOS.length} combos, scaled encounters, seeded runs`);
