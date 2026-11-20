# Tactics Run

A browser co-op tactics roguelike. One to four players, one unit each, over a WebSocket room. Working title — rename it whenever you want.

The march is original. No borrowed characters, places, or job names beyond the three plain classes: Wizard, Rogue, Knight.

## Run locally

```bash
npm install
npm start
```

The server listens on `0.0.0.0` and `process.env.PORT` (default **47291**). Open `http://127.0.0.1:47291`.

- **Host a run** makes a 4-character room code.
- **Join** with that code from another browser, phone, or laptop.
- Everyone picks Wizard, Rogue, or Knight. Duplicates are allowed.
- The leader starts the march. An optional seed replays the same node map.

`npm run check` is a headless sim: movement and height, facing, all six combos, encounter scaling, a seeded run that can reach the boss, a scripted fight, a wipe back to the lobby, and two sockets creating and joining a room.

## Deploy

`render.yaml` is a free web service: `npm install`, `npm start`, health check `/healthz`. Render sets `PORT`. The free instance sleeps after idle time; the first open can be slow.

## How a round works

Party phase: every living player may move, use one ability, then press **End Turn**. You can go in any order, and abilities resolve immediately, so one player can set a status and another can detonate it before the enemy phase.

Then the enemy phase plays out. A downed ally can be Revived from an adjacent tile (that spends your action). If every player unit is down, the run is over and you return to the lobby with your class picks still set.

Between fights the node map offers battles, elites, a shop, a rest, a shrine, and a gatehouse boss. Enemy count and stats scale with the size of the company, so a solo run and a four-player run are different fights.

## Combos

Cross-class combos live in `shared/data.js` (`COMBOS`). The in-game **Combos** panel is generated from that list. They trigger in the same party phase:

| Combo | Setup | Payoff |
| --- | --- | --- |
| Storm Arc | Soaked | Bolt — bonus damage and Shocked (they skip a turn) |
| Wildfire | Oil | Ember — heavier hit and a stronger burn |
| Fume Burst | Poison | Ember — the poison detonates |
| Opening | Staggered | Rogue stab from behind or the flank — a crit |
| Ice Rink | Frost on the tile | Shove — the foe slides farther |
| Shatter | Frozen | Shield Bash — bonus damage and a chip to neighbors |

To add another, append an entry with a `when` clause and an `effect`. Effect keys the battle already understands: `bonus`, `multiplier`, `consume`, `addStatus`, `extraKnock`, `splash`, `bonusFromStatus`, `bonusScale`. A brand-new key needs a branch in `shared/battle.js` (`forecast`). The callout and the help panel pick up the name on their own.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | Click a blue tile. Your unit is already deployed when the fight starts | Tap a blue tile. A near miss still counts |
| Ability | Click the button, then a red tile | Same |
| End turn | End Turn, Enter, or E | End Turn |
| Undo a move | Undo, or U, before you act | Undo |
| Rotate the board | Rotate, or R | Rotate |
| Zoom | + / − | + / − |
| Cancel | Esc | Tap empty ground |
| Ability shortcuts | 1–4 | — |

The notch on a unit is the way it is facing. Backstabs and flanks hit harder. High ground stretches ranged attacks and costs extra movement to climb.

## Swapping in art

Placeholders are flat boxes, cylinders, and capsules. Gameplay does not read the meshes.

`public/js/visuals.js` is the only color and shape map:

- `UNIT_VISUALS` — `units/wizard`, `units/rogue`, `units/knight`, and the enemy ids `units/grunt`, `units/archer`, `units/brute`, `units/hexer`, `units/warden`
- `TILE_VISUALS` — `tiles/grass`, `tiles/stone`, `tiles/mud`, `tiles/water`
- `OVERLAY_VISUALS` — `tiles/frost`, `tiles/ground`, plus move / attack highlights

In the scene, each anchor has `userData.artGroup` set to that path. The drawable children live in a child group named `visual`.

- **Tiles:** the anchor sits on the ground (`y = 0`) at the tile center. Replace `visual`'s children; keep the anchor.
- **Units:** the anchor is at the feet. It is rotated so local **+Z** is forward. A replacement model should face +Z. The sibling `facing-notch` is a gameplay marker (the pale wedge). Remove it when your model shows facing. `player-band` is the per-player color, not class art.

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load('/assets/wizard.glb', (gltf) => {
  const anchor = TACTICS.scene.getObjectByName('unit-p1'); // or any units/wizard anchor
  const visual = anchor.userData.visual;
  visual.clear();
  visual.add(gltf.scene);
});
```

`TACTICS.scene` is the Three.js scene, `TACTICS.units` and `TACTICS.tiles` are the maps above. Put files in `public/assets/` and they are served from `/assets/...`.

To add a class later: a `CLASSES` entry and abilities in `shared/data.js`, a `units/<id>` row in `visuals.js`, and any combos that should mention it.
