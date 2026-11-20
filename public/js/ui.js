import { ABILITIES, CLASSES, COMBOS, HOW_TO, LEVEL_CHOICES, STATUSES, unitAbilities, xpNeed } from '/shared/data.js';
import { listTargets, moveBudget } from '/shared/battle.js';
import { nextNodeIds } from '/shared/run.js';
import { UNIT_VISUALS } from './visuals.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function statusChips(statuses, target) {
  target.replaceChildren();
  for (const status of statuses || []) {
    const info = STATUSES[status.id];
    const chip = el('i', '', info?.short || status.id);
    chip.style.background = info?.color || '#ddd';
    chip.title = info?.blurb || status.id;
    target.appendChild(chip);
  }
}

function fillHelp() {
  const body = $('help-body');
  body.replaceChildren();
  const how = el('ul');
  for (const line of HOW_TO) how.appendChild(el('li', '', line));
  body.appendChild(how);
  body.appendChild(el('h3', '', 'Combos'));
  const intro = el('p', '', 'These fire in the same party phase, as soon as the second ability lands. The callout says COMBO! and the name.');
  body.appendChild(intro);
  for (const combo of COMBOS) {
    const row = el('div', 'combo-row');
    row.appendChild(el('strong', '', `${combo.name} — ${combo.pair}`));
    row.appendChild(el('p', '', combo.detail));
    body.appendChild(row);
  }
  body.appendChild(el('h3', '', 'Statuses'));
  for (const status of Object.values(STATUSES)) {
    const row = el('div', 'combo-row');
    row.appendChild(el('strong', '', status.name));
    row.appendChild(el('p', '', status.blurb));
    body.appendChild(row);
  }
}

export function createUi(handlers) {
  fillHelp();
  const classBox = $('classes');
  for (const klass of Object.values(CLASSES)) {
    const button = el('button', 'class-btn');
    button.type = 'button';
    button.dataset.class = klass.id;
    const swatch = el('i', 'swatch');
    swatch.style.background = UNIT_VISUALS[klass.id]?.color || '#888';
    const copy = el('span');
    copy.appendChild(el('strong', '', klass.name));
    copy.appendChild(document.createTextNode(' '));
    const detail = el('span', '', klass.blurb);
    copy.appendChild(detail);
    button.append(swatch, copy);
    button.addEventListener('click', () => handlers.class(klass.id));
    classBox.appendChild(button);
  }

  $('btn-host').addEventListener('click', () => handlers.host($('name').value));
  $('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.join($('code').value, $('name').value);
  });
  $('btn-copy').addEventListener('click', () => handlers.copy($('room-code').textContent.trim()));
  $('btn-start').addEventListener('click', () => handlers.start($('seed').value));
  $('btn-end').addEventListener('click', () => handlers.end());
  $('btn-undo').addEventListener('click', () => handlers.undo());
  $('btn-rotate').addEventListener('click', () => handlers.rotate());
  $('btn-zin').addEventListener('click', () => handlers.zoom(0.9));
  $('btn-zout').addEventListener('click', () => handlers.zoom(1.1));
  for (const id of ['btn-help', 'map-help', 'btn-battle-help']) {
    $(id).addEventListener('click', () => $('help').classList.remove('hidden'));
  }
  $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
  $('abilities').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-ability]');
    if (!button || button.disabled) return;
    handlers.ability(button.dataset.ability);
  });

  let mapSig = '';
  let buyFor = null;

  function myPlayer(state, you) {
    return state?.players?.find((player) => player.id === you) || null;
  }

  function myBattleUnit(state, you) {
    return state?.battle?.units?.find((unit) => unit.ownerId === you) || null;
  }

  function show(mode) {
    document.body.dataset.mode = mode;
    const battleModes = new Set(['battle', 'victory', 'defeat', 'level', 'cleared']);
    $('lobby').classList.toggle('hidden', mode !== 'lobby' && mode !== 'boot');
    $('map').classList.toggle('hidden', mode !== 'map');
    $('battle-top').classList.toggle('hidden', mode !== 'battle');
    $('battle-dock').classList.toggle('hidden', mode !== 'battle');
    const overlay = ['shop', 'rest', 'shrine', 'level', 'victory', 'defeat', 'cleared'].includes(mode);
    $('overlay').classList.toggle('hidden', !overlay);
    $('stage').style.visibility = battleModes.has(mode) || mode === 'lobby' || mode === 'boot' ? 'visible' : 'hidden';
  }

  function renderLobby(state, you) {
    const inRoom = !!(state && state.phase === 'lobby');
    $('gate').classList.toggle('hidden', inRoom);
    $('room').classList.toggle('hidden', !inRoom);
    if (!inRoom) return;
    $('room-code').textContent = state.code;
    const roster = $('roster');
    roster.replaceChildren();
    for (const player of state.players) {
      const item = el('li');
      const swatch = el('i', 'swatch');
      swatch.style.background = player.color;
      const klass = player.classId ? CLASSES[player.classId].name : 'Picking a class';
      const label = el('span', '', `${player.name}${player.leader ? ' · leader' : ''}${player.connected ? '' : ' · away'} — ${klass}`);
      item.append(swatch, label);
      roster.appendChild(item);
    }
    const mine = myPlayer(state, you);
    for (const button of classBox.querySelectorAll('button')) {
      button.classList.toggle('on', button.dataset.class === mine?.classId);
    }
    const leader = mine?.leader;
    $('seed').disabled = !leader;
    const ready = state.players.every((player) => player.classId);
    $('btn-start').disabled = !leader || !ready;
    $('btn-start').textContent = leader ? (ready ? 'Begin the march' : 'Waiting on classes') : 'Waiting on the leader';
  }

  function renderPartyStrip(units, target) {
    target.replaceChildren();
    for (const unit of units || []) {
      const card = el('div', 'party-card');
      card.appendChild(el('b', '', `${unit.name} · ${CLASSES[unit.classId]?.name || unit.classId}`));
      card.appendChild(el('span', 'fine', `Lv ${unit.level} · HP ${unit.hp}/${unit.maxHp} · MP ${unit.mp}/${unit.maxMp}`));
      const need = xpNeed(unit.level);
      card.appendChild(el('span', 'fine', `XP ${unit.xp}/${need}`));
      target.appendChild(card);
    }
  }

  function renderMap(state) {
    const run = state.run;
    $('map-gold').textContent = `${run.gold} coin`;
    $('map-seed').textContent = `Seed ${state.seedLabel} · ${state.players.length} on the march`;
    renderPartyStrip(run.units, $('map-party'));
    $('map-feed').textContent = (state.feed || []).slice(-2).join(' ');
    const open = new Set(nextNodeIds(run));
    const sig = JSON.stringify({
      nodes: run.nodes.map((node) => node.id + node.type),
      edges: run.edges,
      current: run.currentId,
      cleared: run.cleared,
      open: [...open],
    });
    if (sig === mapSig) return;
    mapSig = sig;
    const board = $('map-board');
    board.replaceChildren();
    board.style.height = 'auto';
    const byRow = new Map();
    for (const node of run.nodes) {
      if (!byRow.has(node.row)) byRow.set(node.row, []);
      byRow.get(node.row).push(node);
    }
    for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
      const line = el('div', 'map-row');
      for (const node of byRow.get(row)) {
        const reachable = open.has(node.id);
        const done = run.cleared.includes(node.id);
        const here = node.id === run.currentId;
        const control = el(reachable ? 'button' : 'div', `node ${node.type}${reachable ? ' reachable' : ''}${done ? ' done' : ' locked'}${here ? ' here' : ''}`);
        if (reachable) control.type = 'button';
        const kind = done && node.type !== 'start' ? `${node.type} · clear` : node.type;
        control.appendChild(el('span', 'kind', kind));
        control.appendChild(el('strong', '', node.name));
        if (reachable) {
          control.appendChild(el('span', 'kind', 'open'));
          control.addEventListener('click', () => handlers.node(node.id));
        }
        line.appendChild(control);
      }
      board.appendChild(line);
    }
  }

  function renderBattle(state, you, armed) {
    const battle = state.battle;
    const me = myBattleUnit(state, you);
    const partyPhase = battle?.phase === 'party';
    $('phase-label').textContent = battle?.phase === 'enemy' ? 'Enemy phase' : `Party phase · round ${battle?.round || 1}`;
    $('phase-sub').textContent = battle?.phase === 'enemy'
      ? 'Watch the march answer.'
      : 'Move, one ability, End Turn. Order is yours — set up the combo, then spring it.';
    $('battle-code').textContent = state.code;
    const chips = $('party-chips');
    chips.replaceChildren();
    for (const unit of battle.units.filter((entry) => entry.side === 'player')) {
      const chip = el('div', `chip${unit.ownerId === you ? ' me' : ''}`);
      const dot = el('i', 'swatch');
      dot.style.background = unit.color || '#ccc';
      chip.appendChild(dot);
      chip.appendChild(el('span', '', unit.downed ? `${unit.name} down` : unit.name));
      if (unit.ready) chip.appendChild(el('span', 'tick', '✓'));
      chips.appendChild(chip);
    }
    if (!me) return;
    $('me-name').textContent = me.name;
    $('me-class').textContent = `${CLASSES[me.classId]?.name || me.classId} · move ${moveBudget(me)}`;
    const hpPct = Math.max(0, Math.min(1, me.hp / me.maxHp));
    const mpPct = me.maxMp ? Math.max(0, Math.min(1, me.mp / me.maxMp)) : 0;
    $('me-hp').style.width = `${hpPct * 100}%`;
    $('me-mp').style.width = `${mpPct * 100}%`;
    $('me-hp-n').textContent = `${Math.max(0, me.hp)}/${me.maxHp}`;
    $('me-mp-n').textContent = `${me.mp}/${me.maxMp}`;
    statusChips(me.statuses, $('me-statuses'));
    const downedNear = !me.downed && !me.ready && !me.acted && partyPhase
      && listTargets(battle, me, ABILITIES.revive).length > 0;
    const ids = me.downed ? [] : [...unitAbilities(me), ...(downedNear ? ['revive'] : [])];
    const box = $('abilities');
    box.replaceChildren();
    let help = 'You are already deployed. Tap a blue tile to move, then an ability, then a red tile.';
    for (const id of ids) {
      const ability = ABILITIES[id];
      const button = el('button');
      button.type = 'button';
      button.dataset.ability = id;
      button.appendChild(el('b', '', ability.name));
      button.appendChild(el('small', '', ability.mp ? `${ability.mp} MP` : 'Free'));
      const cooled = (me.cds?.[id] || 0) > 0;
      const poor = me.mp < (ability.mp || 0);
      const gated = !partyPhase || me.ready || me.acted || me.downed || cooled || poor;
      button.disabled = gated;
      if (armed === id) {
        button.classList.add('on');
        help = ability.blurb;
      }
      if (cooled) button.title = 'Not ready yet';
      box.appendChild(button);
    }
    if (me.downed) help = 'You are down. An ally can Revive you from an adjacent tile.';
    else if (me.ready) help = 'Waiting on the rest of the company.';
    else if (!partyPhase) help = 'Enemy phase.';
    $('ability-help').textContent = help;
    $('me-meta').textContent = me.downed ? 'Down' : me.moved && !me.acted ? 'Moved — spend the action or undo.' : '';
    const end = $('btn-end');
    end.disabled = !partyPhase || me.downed || me.ready;
    end.textContent = me.ready ? 'Waiting on the party' : !partyPhase ? 'Enemy phase' : 'End Turn';
    end.classList.toggle('pulse', partyPhase && !me.ready && (me.acted || me.moved));
    $('btn-undo').disabled = !(me.moved && !me.acted && !me.ready && partyPhase);
    const log = $('log');
    log.replaceChildren();
    for (const line of battle.log.slice(-6)) {
      log.appendChild(el('li', line.startsWith('COMBO!') ? 'combo' : '', line));
    }
  }

  function buttonRow(label, title, detail, onClick) {
    const button = el('button', 'choice');
    button.type = 'button';
    const text = el('span');
    text.appendChild(el('strong', '', title));
    text.appendChild(el('small', '', detail));
    button.append(text, el('b', '', label));
    button.addEventListener('click', onClick);
    return button;
  }

  function renderOverlay(state, you) {
    const card = $('overlay-card');
    card.replaceChildren();
    const phase = state.phase;
    if (phase === 'victory' || phase === 'defeat' || phase === 'cleared') {
      const summary = state.summary || {};
      card.appendChild(el('p', 'kicker', phase === 'defeat' ? 'Game over' : phase === 'cleared' ? 'The march breaks' : 'Field clear'));
      card.appendChild(el('h2', '', phase === 'defeat' ? 'The company is down' : phase === 'cleared' ? 'The gatehouse is empty' : summary.nodeName || 'Clear'));
      if (phase === 'defeat') {
        card.appendChild(el('p', '', 'A wipe ends the run. The lobby still has your classes. Start a fresh march.'));
        card.appendChild(buttonRow('Lobby', 'Back to the lobby', 'Same room, new run.', () => handlers.lobby()));
      } else if (phase === 'cleared') {
        card.appendChild(el('p', '', 'The March Warden is down and the road past the arch is just a road. Take the coin. Leave the names.'));
        if (summary.gold) card.appendChild(el('p', '', `+${summary.gold} coin · +${summary.xp} xp`));
        card.appendChild(buttonRow('Lobby', 'Back to the lobby', 'The company can take another contract.', () => handlers.lobby()));
      } else {
        card.appendChild(el('p', '', `+${summary.gold || 0} coin for the company. +${summary.xp || 0} xp each.`));
        for (const level of summary.leveled || []) card.appendChild(el('p', '', `${level.name} reached level ${level.level}.`));
        const boss = summary.nodeType === 'boss';
        card.appendChild(buttonRow(boss ? 'See the arch' : 'Onward', 'Continue', boss ? 'The gatehouse falls.' : 'Back to the node map.', () => handlers.continue()));
      }
      return;
    }
    if (phase === 'level') {
      card.appendChild(el('p', 'kicker', 'Level'));
      const offer = (state.run.offers || []).find((entry) => entry.playerId === you && !entry.picked);
      if (offer) {
        card.appendChild(el('h2', '', `${offer.name || 'You'} reached level ${offer.level}`));
        card.appendChild(el('p', '', 'Pick one gift. It lasts for the rest of the run.'));
        for (const choice of LEVEL_CHOICES) {
          card.appendChild(buttonRow('Take', choice.name, choice.desc, () => handlers.level(choice.id)));
        }
      } else {
        const waiting = (state.run.offers || []).filter((entry) => !entry.picked).map((entry) => entry.name).filter(Boolean);
        card.appendChild(el('h2', '', 'Waiting on gifts'));
        card.appendChild(el('p', '', waiting.length ? `Still choosing: ${waiting.join(', ')}` : 'Everyone has chosen.'));
        card.appendChild(buttonRow('Onward', 'Continue', 'Back to the node map.', () => handlers.continue()));
      }
      return;
    }
    if (phase === 'rest') {
      const node = state.run.nodes.find((entry) => entry.id === state.run.currentId);
      card.appendChild(el('p', 'kicker', 'Rest'));
      card.appendChild(el('h2', '', node?.name || 'Camp'));
      card.appendChild(el('p', '', node?.blurb || 'Sit down. Bind what is bleeding.'));
      card.appendChild(el('p', '', 'The company regains a large share of HP and MP.'));
      renderPartyStrip(state.run.units, card);
      card.appendChild(buttonRow('Rest', 'Take the rest', 'Then back to the road.', () => handlers.continue()));
      return;
    }
    if (phase === 'shop') {
      const node = state.run.nodes.find((entry) => entry.id === state.run.currentId);
      card.appendChild(el('p', 'kicker', `Shop · ${state.run.gold} coin`));
      card.appendChild(el('h2', '', node?.name || 'Waystation'));
      card.appendChild(el('p', '', 'Shared coin. Anyone can buy for anyone.'));
      if (!buyFor || !state.run.units.some((unit) => unit.ownerId === buyFor)) buyFor = you;
      const targets = el('div', 'targets');
      for (const unit of state.run.units) {
        const button = el('button', unit.ownerId === buyFor ? 'on' : '', unit.name);
        button.type = 'button';
        button.addEventListener('click', () => {
          buyFor = unit.ownerId;
          renderOverlay(state, you);
        });
        targets.appendChild(button);
      }
      card.appendChild(targets);
      for (const item of state.shop?.items || []) {
        const sold = item.left === 0;
        const label = sold ? 'Sold' : `${item.cost}c`;
        const detail = `${item.desc}${item.left != null ? ` · ${item.left} left` : ''}`;
        const button = buttonRow(label, item.name, detail, () => handlers.buy(item.id, buyFor));
        button.disabled = sold || state.run.gold < item.cost;
        card.appendChild(button);
      }
      card.appendChild(buttonRow('Leave', 'Back to the road', 'The stall closes.', () => handlers.continue()));
      return;
    }
    if (phase === 'shrine') {
      const node = state.run.nodes.find((entry) => entry.id === state.run.currentId);
      card.appendChild(el('p', 'kicker', 'Shrine'));
      card.appendChild(el('h2', '', node?.name || 'Road Shrine'));
      const picked = state.shrine?.picked?.[you];
      const options = state.shrine?.options?.[you] || [];
      if (!picked) {
        card.appendChild(el('p', '', 'One gift for your unit. It stays for the run.'));
        for (const option of options) {
          card.appendChild(buttonRow('Take', option.name, option.desc, () => handlers.shrine(option.id)));
        }
      } else {
        const mine = options.find((option) => option.id === picked);
        card.appendChild(el('p', '', `You took ${mine?.name || picked}.`));
        const waiting = state.run.units.filter((unit) => !state.shrine.picked[unit.ownerId]).map((unit) => unit.name);
        card.appendChild(el('p', '', waiting.length ? `Waiting on ${waiting.join(', ')}.` : 'The niche is quiet.'));
        card.appendChild(buttonRow('Leave', 'Back to the road', 'When everyone has chosen.', () => handlers.continue()));
      }
    }
  }

  function toast(text) {
    const node = el('div', 'toast', text);
    $('toasts').appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  return {
    toast,
    setConn(open) {
      $('conn').textContent = open ? 'Connected. Host a run or join with a code.' : 'Reconnecting…';
    },
    render(state, you, armed) {
      if (!state) {
        show('boot');
        renderLobby(null, you);
        return { field: false };
      }
      show(state.phase === 'lobby' ? 'lobby' : state.phase);
      if (state.phase === 'lobby') renderLobby(state, you);
      if (state.phase === 'map') renderMap(state);
      if (state.phase === 'battle') renderBattle(state, you, armed);
      if (['shop', 'rest', 'shrine', 'level', 'victory', 'defeat', 'cleared'].includes(state.phase)) renderOverlay(state, you);
      const field = ['battle', 'victory', 'defeat', 'level', 'cleared'].includes(state.phase) && !!state.battle;
      return { field };
    },
    inspect(text) {
      $('inspect').textContent = text || '';
    },
  };
}
