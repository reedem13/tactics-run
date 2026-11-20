import { ABILITIES, COMBO_SETUPS, unitAbilities } from './data.js';
import {
  activationStart,
  allReady,
  closeRound,
  forceMove,
  forecast,
  listTargets,
  livingUnits,
  moveBudget,
  perform,
  statusOf,
  tryEndTurn,
} from './battle.js';
import { chebyshev, reachable, unitAt } from './grid.js';

function allyCanPayoff(battle, unit, setup) {
  return livingUnits(battle, 'player').some((ally) => {
    if (ally.id === unit.id || ally.downed) return false;
    if (ally.acted || ally.ready) return false;
    const known = unitAbilities(ally);
    if (setup.needsAllyAbility) return known.includes(setup.needsAllyAbility);
    if (setup.needsAllyTags) {
      return known.some((id) => setup.needsAllyTags.some((tag) => (ABILITIES[id].tags || []).includes(tag)));
    }
    return false;
  });
}

function bestAction(battle, unit, { setups = false } = {}) {
  const budget = unit.moved ? 0 : moveBudget(unit);
  const steps = unit.moved ? [] : reachable(battle, unit, budget);
  const spots = [{ x: unit.x, z: unit.z, path: [], cost: 0 }, ...steps];
  const taunt = livingUnits(battle, unit.side === 'player' ? 'enemy' : 'player').some((foe) => statusOf(foe, 'taunt'));
  let best = null;
  const consider = (score, spot, ability, x, z) => {
    if (!(score > 0)) return;
    const key = `${score.toFixed(3)}:${ability?.id || ''}:${x}:${z}:${spot.cost}`;
    if (!best || score > best.score + 0.001 || (Math.abs(score - best.score) <= 0.001 && key < best.key)) {
      best = { score, spot, ability, x, z, key };
    }
  };
  for (const spot of spots) {
    const ghost = { ...unit, x: spot.x, z: spot.z };
    for (const abilityId of unitAbilities(unit)) {
      const ability = ABILITIES[abilityId];
      if (!ability) continue;
      const targets = listTargets(battle, ghost, ability, { ignoreTurn: true });
      for (const target of targets) {
        if (ability.aim === 'self') {
          const low = unit.hp <= unit.maxHp * 0.5;
          consider(low ? 7 : 0, spot, ability, unit.x, unit.z);
          continue;
        }
        const area = target.aoe?.length ? target.aoe : [{ x: target.x, z: target.z, primary: true }];
        let score = 0;
        let kill = false;
        let setupHit = false;
        for (const cell of area) {
          const foe = unitAt(battle, cell.x, cell.z);
          if (!foe || foe.downed || foe.side === unit.side) continue;
          const primary = cell.x === target.x && cell.z === target.z;
          const cast = forecast(battle, ghost, foe, ability, {
            primary,
            power: primary ? ability.power : ability.splashPower,
            addPower: primary,
            allowCombo: primary || ability.comboSplash === true,
          });
          const expected = cast.damage * (1 - (cast.evade || 0));
          score += expected;
          if (cast.side === 'back') score += 2;
          if (foe.hp <= cast.damage) kill = true;
          if (statusOf(foe, 'taunt')) score += 8;
          else if (taunt) score *= 0.35;
          if (setups && primary) {
            const matched = COMBO_SETUPS.some((setup) => setup.apply === ability.id && allyCanPayoff(battle, unit, setup));
            if (matched) setupHit = true;
          }
        }
        if (kill) score += 40;
        if (setupHit && !kill) score += 28;
        score -= spot.cost * 0.15;
        consider(score, spot, ability, target.x, target.z);
      }
    }
  }
  if (best) {
    const moving = best.spot.x !== unit.x || best.spot.z !== unit.z;
    return {
      move: moving ? best.spot : null,
      ability: best.ability,
      x: best.x,
      z: best.z,
    };
  }
  const foes = livingUnits(battle, unit.side === 'player' ? 'enemy' : 'player');
  if (!unit.moved && foes.length && steps.length) {
    let pick = null;
    for (const spot of steps) {
      const dist = Math.min(...foes.map((foe) => chebyshev(spot.x, spot.z, foe.x, foe.z)));
      if (!pick || dist < pick.dist || (dist === pick.dist && spot.cost < pick.spot.cost)) {
        pick = { spot, dist };
      }
    }
    if (pick) return { move: pick.spot, ability: null };
  }
  return { move: null, ability: null };
}

export function planEnemyAction(battle, unit) {
  return bestAction(battle, unit, { setups: false });
}

export function planPartyAction(battle, unit) {
  return bestAction(battle, unit, { setups: true });
}

export function runEnemyPhase(battle, rng) {
  const events = [{ t: 'phase', phase: 'enemy', round: battle.round }];
  if (battle.phase !== 'party') return { events };
  battle.phase = 'enemy';
  battle.log.push('Enemy phase.');
  const order = battle.units
    .filter((unit) => unit.side === 'enemy' && !unit.downed)
    .sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id));
  for (const enemy of order) {
    if (battle.phase !== 'enemy') break;
    if (enemy.downed) continue;
    const start = activationStart(battle, enemy);
    events.push(...start.events);
    if (start.skip || enemy.downed || battle.phase !== 'enemy') continue;
    const plan = planEnemyAction(battle, enemy);
    if (plan.move) events.push(...forceMove(battle, enemy, plan.move).events);
    if (plan.ability && battle.phase === 'enemy') {
      const resolved = perform(battle, enemy, plan.ability.id, plan.x, plan.z, rng);
      if (resolved.events) events.push(...resolved.events);
    }
  }
  if (battle.phase === 'enemy') {
    const closed = closeRound(battle);
    events.push(...closed.events);
  }
  return { events };
}

export function simulateBattle(battle, rng, maxRounds = 20) {
  let spins = 0;
  while (battle.phase === 'party' && battle.round <= maxRounds && spins++ < 500) {
    const unit = livingUnits(battle, 'player')
      .filter((actor) => !actor.ready)
      .sort((a, b) => b.speed - a.speed || a.id.localeCompare(b.id))[0];
    if (!unit) {
      if (allReady(battle)) runEnemyPhase(battle, rng);
      else break;
      continue;
    }
    const plan = planPartyAction(battle, unit);
    if (plan.move) forceMove(battle, unit, plan.move);
    if (plan.ability && battle.phase === 'party') perform(battle, unit, plan.ability.id, plan.x, plan.z, rng);
    if (battle.phase !== 'party') break;
    if (!unit.ready && !unit.downed) tryEndTurn(battle, unit.id);
    if (battle.phase === 'party' && allReady(battle)) runEnemyPhase(battle, rng);
  }
  return battle;
}
