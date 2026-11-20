import { ABILITIES, STATUSES } from '/shared/data.js';
import { listTargets, moveOptions, tileAt } from '/shared/battle.js';
import { connectNet } from './net.js';
import { createScene } from './scene.js';
import { createUi } from './ui.js';
import { UNIT_VISUALS, TILE_VISUALS } from './visuals.js';

const SESSION = 'tactics-run-session';
const canvas = document.getElementById('view');
const scene = createScene(canvas);
const net = connectNet();

let state = null;
let you = null;
let armed = null;
let inspectId = null;
let resuming = false;
let toldDeployed = false;
let battleSeen = null;
const markers = new Map();
const markerRoot = document.getElementById('markers');
const floaters = document.getElementById('floaters');
const comboEl = document.getElementById('combo');
let comboQueue = [];
let comboPlaying = false;

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { return null; }
}
function saveSession(session) {
  sessionStorage.setItem(SESSION, JSON.stringify(session));
}
function clearSession() {
  sessionStorage.removeItem(SESSION);
}

const ui = createUi({
  host(name) {
    clearSession();
    net.send({ type: 'create', name });
  },
  join(code, name) {
    clearSession();
    net.send({ type: 'join', code, name });
  },
  async copy(code) {
    try {
      await navigator.clipboard.writeText(code);
      ui.toast('Code copied');
    } catch {
      ui.toast(code);
    }
  },
  start(seed) { net.send({ type: 'start', seed }); },
  class(classId) { net.send({ type: 'class', classId }); },
  node(nodeId) { net.send({ type: 'node', nodeId }); },
  end() { net.send({ type: 'end' }); },
  undo() { net.send({ type: 'undo' }); armed = null; refresh(); },
  rotate() { scene.rotate(); },
  zoom(factor) { scene.zoomBy(factor); },
  ability(id) {
    armed = armed === id ? null : id;
    refresh();
  },
  continue() { net.send({ type: 'continue' }); },
  lobby() { net.send({ type: 'lobby' }); },
  buy(itemId, targetId) { net.send({ type: 'buy', itemId, targetId }); },
  shrine(upgradeId) { net.send({ type: 'shrine', upgradeId }); },
  level(choiceId) { net.send({ type: 'level', choiceId }); },
});

function myUnit() {
  return state?.battle?.units?.find((unit) => unit.ownerId === you) || null;
}

function layoutStage() {
  const stage = document.getElementById('stage');
  const mode = document.body.dataset.mode;
  const dock = document.getElementById('battle-dock');
  const top = document.getElementById('battle-top');
  if (mode === 'battle') {
    const desktop = window.innerWidth >= 960;
    stage.style.top = `${top.offsetHeight}px`;
    stage.style.left = '0px';
    if (desktop) {
      stage.style.right = `${dock.offsetWidth}px`;
      stage.style.bottom = '0px';
    } else {
      stage.style.right = '0px';
      stage.style.bottom = `${dock.offsetHeight}px`;
    }
  } else {
    stage.style.top = '0px';
    stage.style.right = '0px';
    stage.style.bottom = '0px';
    stage.style.left = '0px';
  }
  scene.resize();
}

function refresh() {
  if (state?.battle?.id !== battleSeen) {
    battleSeen = state?.battle?.id || null;
    toldDeployed = false;
  }
  const view = ui.render(state, you, armed);
  if (view?.field && state?.battle) scene.showBattle(state.battle);
  else scene.showDiorama();
  paintHighlights();
  const selected = inspectId || myUnit()?.id || null;
  scene.setSelected(state?.phase === 'battle' ? selected : null);
  ui.inspect(inspectLine());
  requestAnimationFrame(layoutStage);
}

function paintHighlights() {
  const battle = state?.battle;
  const me = myUnit();
  if (!battle || state.phase !== 'battle' || battle.phase !== 'party' || !me || me.downed || me.ready) {
    scene.setHighlights({ move: [], attack: [], aoe: [] });
    return;
  }
  if (armed && !me.acted) {
    const ability = ABILITIES[armed];
    const targets = listTargets(battle, me, ability);
    window.TACTICS.moves = [];
    window.TACTICS.attacks = targets;
    scene.setHighlights({
      move: [],
      attack: targets.map((target) => ({ x: target.x, z: target.z })),
      aoe: [],
    });
    return;
  }
  const moves = me.acted ? [] : moveOptions(battle, me);
  window.TACTICS.moves = moves;
  window.TACTICS.attacks = [];
  scene.setHighlights({ move: moves, attack: [], aoe: [] });
}

function inspectLine() {
  if (!state?.battle || !inspectId) return '';
  const unit = state.battle.units.find((entry) => entry.id === inspectId);
  if (!unit || (unit.side === 'enemy' && unit.downed)) return '';
  const tile = tileAt(state.battle, unit.x, unit.z);
  const tags = (unit.statuses || []).map((status) => STATUSES[status.id]?.name || status.id).join(', ');
  const down = unit.downed ? ' · DOWN' : '';
  return `${unit.name} · ${Math.max(0, unit.hp)}/${unit.maxHp} HP${unit.maxMp ? ` · ${unit.mp} MP` : ''}${tags ? ` · ${tags}` : ''}${tile ? ` · height ${tile.h}` : ''}${down}`;
}

function spawnFloater(event, text, kind) {
  const anchor = event.id ? scene.anchorOf(event.id) : null;
  const pos = anchor ? scene.project(anchor, 0.8) : scene.projectTile(event.x, event.z);
  if (!pos) return;
  const node = document.createElement('span');
  node.className = `floater ${kind || ''}`;
  node.textContent = text;
  node.style.left = `${pos.x}px`;
  node.style.top = `${pos.y}px`;
  floaters.appendChild(node);
  setTimeout(() => node.remove(), 900);
}

function playCombo(name) {
  comboQueue.push(name);
  pumpCombo();
}
function pumpCombo() {
  if (comboPlaying || !comboQueue.length) return;
  comboPlaying = true;
  const name = comboQueue.shift();
  comboEl.replaceChildren();
  const kicker = document.createElement('em');
  kicker.textContent = 'COMBO!';
  const title = document.createElement('strong');
  title.textContent = name;
  comboEl.append(kicker, title);
  comboEl.classList.remove('show');
  void comboEl.offsetWidth;
  comboEl.classList.add('show');
  setTimeout(() => {
    comboPlaying = false;
    pumpCombo();
  }, 1100);
}

function playEvents(events) {
  if (!events?.length) return;
  let delay = 0;
  for (const event of events) {
    if (event.t === 'damage') {
      const at = delay;
      const text = event.crit ? `${event.amount}!` : `-${event.amount}`;
      setTimeout(() => spawnFloater(event, text, event.crit ? 'crit' : ''), at);
      delay += 120;
    } else if (event.t === 'heal') {
      setTimeout(() => spawnFloater(event, `+${event.amount}`, 'heal'), delay);
      delay += 120;
    } else if (event.t === 'miss') {
      setTimeout(() => spawnFloater(event, 'MISS', 'miss'), delay);
      delay += 120;
    } else if (event.t === 'skip') {
      setTimeout(() => spawnFloater(event, 'SKIP', 'miss'), delay);
    } else if (event.t === 'combo') {
      const at = delay;
      setTimeout(() => playCombo(event.name), at);
      delay += 200;
    }
  }
}

function updateMarkers() {
  if (window.TACTICS?.pause) {
    requestAnimationFrame(updateMarkers);
    return;
  }
  const units = (state?.battle?.units || []).filter((unit) => !(unit.side === 'enemy' && unit.downed));
  const live = new Set();
  for (const unit of units) {
    const anchor = scene.anchorOf(unit.id);
    if (!anchor) continue;
    const pos = scene.project(anchor, unit.downed ? 0.45 : 1.2);
    if (!pos || pos.y < -20 || pos.x < -40) continue;
    live.add(unit.id);
    let node = markers.get(unit.id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'marker';
      markerRoot.appendChild(node);
      markers.set(unit.id, node);
    }
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    const bar = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    const color = unit.side === 'player' ? (unit.color || '#e15b42') : '#e15b42';
    const chips = (unit.statuses || []).map((status) => {
      const info = STATUSES[status.id];
      return `<i style="background:${info?.color || '#ccc'}">${info?.short || ''}</i>`;
    }).join('');
    node.innerHTML = `<b></b><div class="mini"><span style="width:${bar * 100}%;background:${color}"></span></div><div class="pips">${chips}</div>`;
    node.querySelector('b').textContent = unit.downed ? `${unit.name} DOWN` : unit.name;
  }
  for (const [id, node] of markers) {
    if (live.has(id)) continue;
    node.remove();
    markers.delete(id);
  }
  requestAnimationFrame(updateMarkers);
}

function legalTiles(me, battle) {
  if (!me || !battle || state.phase !== 'battle' || battle.phase !== 'party' || me.downed || me.ready) return [];
  if (armed && !me.acted) return listTargets(battle, me, ABILITIES[armed]);
  if (!me.moved && !me.acted && !armed) return moveOptions(battle, me);
  return [];
}

function onPick(hit) {
  if (!state || state.phase !== 'battle' || !state.battle) return;
  const battle = state.battle;
  const me = myUnit();
  if (!hit) {
    armed = null;
    inspectId = null;
    refresh();
    return;
  }
  if (hit.unitId) inspectId = hit.unitId;
  if (me && hit.unitId === me.id && !armed && !me.moved && !me.acted && !toldDeployed) {
    toldDeployed = true;
    ui.toast('You are already deployed. Tap a blue tile to move.');
  }
  if (me && battle.phase === 'party' && !me.downed && !me.ready && armed && !me.acted) {
    const targets = listTargets(battle, me, ABILITIES[armed]);
    if (targets.some((target) => target.x === hit.x && target.z === hit.z)) {
      net.send({ type: 'act', ability: armed, x: hit.x, z: hit.z });
      armed = null;
      return;
    }
  }
  if (me && battle.phase === 'party' && !me.moved && !me.acted && !me.ready && !armed) {
    if (moveOptions(battle, me).some((tile) => tile.x === hit.x && tile.z === hit.z)) {
      net.send({ type: 'move', x: hit.x, z: hit.z });
      return;
    }
  }
  if (armed && hit.unitId !== me?.id) {
    armed = null;
  }
  refresh();
}

function tapAt(x, y) {
  const now = performance.now();
  if (now - tapAt.last < 280) return;
  tapAt.last = now;
  const me = myUnit();
  const tiles = legalTiles(me, state?.battle);
  const snapped = scene.closest(x, y, tiles, 56);
  const hit = scene.pick(x, y);
  if (snapped) {
    const anchor = me ? scene.anchorOf(me.id) : null;
    const feet = anchor ? scene.project(anchor, 0.15) : null;
    const rect = canvas.getBoundingClientRect();
    const feetD = feet ? Math.hypot(rect.left + feet.x - x, rect.top + feet.y - y) : Infinity;
    const tile = scene.projectTile(snapped.x, snapped.z);
    const tileD = tile ? Math.hypot(rect.left + tile.x - x, rect.top + tile.y - y) : Infinity;
    const tappedSelf = hit?.unitId === me?.id && feetD + 6 < tileD;
    if (!tappedSelf) {
      onPick({ x: snapped.x, z: snapped.z, unitId: null });
      return;
    }
  }
  onPick(hit);
}
tapAt.last = 0;

const TAP_SLOP = 32;
let pointer = null;
const board = document.getElementById('stage');

board.addEventListener('pointerdown', (event) => {
  if (event.target.closest('#battle-dock, #battle-top, button, input, a')) return;
  if (event.pointerType === 'touch') event.preventDefault();
  try { board.setPointerCapture(event.pointerId); } catch { /* already gone, or a synthetic tap */ }
  pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
}, { passive: false });

function finishPointer(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = (event.clientX || pointer.x) - pointer.x;
  const dy = (event.clientY || pointer.y) - pointer.y;
  const x = pointer.x;
  const y = pointer.y;
  pointer = null;
  if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) return;
  tapAt(x, y);
}

board.addEventListener('pointerup', finishPointer);
board.addEventListener('pointercancel', finishPointer);
board.addEventListener('touchend', (event) => {
  if (pointer) return;
  const touch = event.changedTouches && event.changedTouches[0];
  if (!touch) return;
  tapAt(touch.clientX, touch.clientY);
}, { passive: true });
canvas.addEventListener('pointermove', (event) => {
  if (state?.phase !== 'battle' || !armed) return;
  const hit = scene.pick(event.clientX, event.clientY);
  const me = myUnit();
  const ability = ABILITIES[armed];
  if (!hit || !me || !ability || ability.aim !== 'tile') return;
  const targets = listTargets(state.battle, me, ability);
  const match = targets.find((target) => target.x === hit.x && target.z === hit.z);
  scene.setHighlights({
    move: [],
    attack: targets.map((target) => ({ x: target.x, z: target.z })),
    aoe: match ? (match.aoe || []).filter((cell) => cell.x !== match.x || cell.z !== match.z) : [],
  });
});

window.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea')) return;
  const me = myUnit();
  if (event.key === '?' ) {
    document.getElementById('help').classList.remove('hidden');
    return;
  }
  if (event.key === 'Escape') {
    armed = null;
    document.getElementById('help').classList.add('hidden');
    refresh();
    return;
  }
  if (!state || state.phase !== 'battle') return;
  if (event.key === 'e' || event.key === 'E' || event.key === 'Enter') {
    event.preventDefault();
    net.send({ type: 'end' });
  } else if (event.key === 'u' || event.key === 'U') {
    net.send({ type: 'undo' });
  } else if (event.key === 'r' || event.key === 'R') {
    scene.rotate();
  } else if (/^[1-9]$/.test(event.key) && me) {
    const buttons = [...document.querySelectorAll('#abilities button')];
    const button = buttons[Number(event.key) - 1];
    if (button && !button.disabled) {
      armed = armed === button.dataset.ability ? null : button.dataset.ability;
      refresh();
    }
  }
});

window.addEventListener('resize', layoutStage);
new ResizeObserver(() => layoutStage()).observe(document.getElementById('battle-dock'));

net.onStatus((open) => {
  ui.setConn(open);
  if (!open) return;
  const session = loadSession();
  if (session?.code && session?.token) {
    resuming = true;
    net.send({ type: 'resume', code: session.code, token: session.token });
  }
});

net.onMessage((msg) => {
  if (msg.type === 'welcome') {
    you = msg.playerId;
    saveSession({ code: msg.code, token: msg.token });
    resuming = false;
    return;
  }
  if (msg.type === 'error') {
    ui.toast(msg.text);
    if (resuming) {
      resuming = false;
      clearSession();
    }
    return;
  }
  if (msg.type === 'closed') return;
  if (msg.type === 'state') {
    const previous = state?.battle?.id;
    state = msg.state;
    you = msg.you || you;
    if (state.battle?.id !== previous) {
      armed = null;
      inspectId = null;
    }
    const me = myUnit();
    if (me && (me.acted || me.ready || me.downed)) armed = null;
    refresh();
    playEvents(msg.events);
  }
});

window.TACTICS = {
  scene: scene.scene,
  units: UNIT_VISUALS,
  tiles: TILE_VISUALS,
  moves: [],
  attacks: [],
  pick: (x, y) => scene.pick(x, y),
  projectTile(x, z) {
    const pos = scene.projectTile(x, z);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + pos.x, y: rect.top + pos.y };
  },
  snapshot: () => ({ state, you, armed }),
};
refresh();
updateMarkers();
