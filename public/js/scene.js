import * as THREE from 'three';
import { OVERLAY_VISUALS, TILE_VISUALS, UNIT_VISUALS, tileTopY } from './visuals.js';

const FACE_YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function disposeObject(obj) {
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
      else child.material.dispose();
    }
  });
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x14110e, 1);

  const scene = new THREE.Scene();
  scene.name = 'world';
  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 90);
  scene.add(new THREE.HemisphereLight(0xf6f0e4, 0x2c261f, 1.2));
  const sun = new THREE.DirectionalLight(0xfff3d8, 1.05);
  sun.position.set(7, 14, 5);
  scene.add(sun);

  const tilesGroup = new THREE.Group();
  tilesGroup.name = 'tiles';
  const unitsGroup = new THREE.Group();
  unitsGroup.name = 'units';
  const fxGroup = new THREE.Group();
  fxGroup.name = 'fx';
  scene.add(tilesGroup, unitsGroup, fxGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const unitMeshes = new Map();
  const tileMeshes = [];
  const tops = new Map();
  const tweens = [];
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.028, 6, 20),
    new THREE.MeshBasicMaterial({ color: 0xe0a23a }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  ring.name = 'fx/select';
  fxGroup.add(ring);

  let yaw = Math.PI / 4;
  let zoom = 1;
  let width = 5;
  let depth = 5;
  let mode = 'empty';
  let battleId = null;
  let selectedId = null;

  function applyFrustum(pad) {
    const aspect = Math.max(0.45, (canvas.clientWidth || 1) / Math.max(1, canvas.clientHeight || 1));
    camera.left = (-pad * aspect) / 2;
    camera.right = (pad * aspect) / 2;
    camera.top = pad / 2;
    camera.bottom = -pad / 2;
    camera.updateProjectionMatrix();
  }

  function fit() {
    const cx = (width - 1) / 2;
    const cz = (depth - 1) / 2;
    const elev = 50 * Math.PI / 180;
    const dist = 18;
    camera.position.set(
      cx + Math.sin(yaw) * Math.cos(elev) * dist,
      1.2 + Math.sin(elev) * dist,
      cz + Math.cos(yaw) * Math.cos(elev) * dist,
    );
    camera.lookAt(cx, 0.45, cz);
    const corners = [
      [0, 1.4, 0],
      [width - 1, 1.4, 0],
      [0, 1.4, depth - 1],
      [width - 1, 1.4, depth - 1],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    let pad = Math.max(width, depth) * 0.9 * zoom;
    for (let i = 0; i < 6; i++) {
      applyFrustum(pad);
      let maxN = 0;
      for (const corner of corners) {
        const projected = corner.clone().project(camera);
        maxN = Math.max(maxN, Math.abs(projected.x), Math.abs(projected.y));
      }
      if (maxN < 0.78) break;
      pad *= Math.max(1.05, maxN / 0.72);
    }
    applyFrustum(pad);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    fit();
  }

  function clearGroups() {
    for (const group of [tilesGroup, unitsGroup]) {
      for (const child of [...group.children]) {
        group.remove(child);
        disposeObject(child);
      }
    }
    stripFx('frost');
    stripFx('highlight');
    unitMeshes.clear();
    tileMeshes.length = 0;
    tops.clear();
    tweens.length = 0;
  }

  function stripFx(kind) {
    for (const child of [...fxGroup.children]) {
      if (child.userData.kind === kind) {
        fxGroup.remove(child);
        child.geometry?.dispose();
        child.material?.dispose();
      }
    }
  }

  function partMesh(part) {
    let geometry;
    if (part.shape === 'capsule') geometry = new THREE.CapsuleGeometry(...(part.args || [0.22, 0.4, 4, 8]));
    else if (part.shape === 'cylinder') geometry = new THREE.CylinderGeometry(...(part.args || [0.2, 0.2, 0.6, 8]));
    else geometry = new THREE.BoxGeometry(...(part.args || [0.4, 0.4, 0.4]));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: part.color }));
    mesh.position.set(part.x || 0, part.y || 0, part.z || 0);
    return mesh;
  }

  function buildUnit(unit) {
    const spec = UNIT_VISUALS[unit.classId] || UNIT_VISUALS.grunt;
    const anchor = new THREE.Group();
    anchor.name = `unit-${unit.id}`;
    anchor.userData.artGroup = spec.group;
    anchor.userData.unitId = unit.id;
    anchor.userData.kind = 'unit';
    const visual = new THREE.Group();
    visual.name = 'visual';
    for (const part of spec.parts) visual.add(partMesh(part));
    anchor.add(visual);
    anchor.userData.visual = visual;
    const notch = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xf4ecdf }),
    );
    notch.name = 'facing-notch';
    notch.position.set(0, 0.22, 0.36);
    anchor.add(notch);
    if (unit.color) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.055, 0.5),
        new THREE.MeshLambertMaterial({ color: unit.color }),
      );
      band.name = 'player-band';
      band.position.y = 0.045;
      anchor.add(band);
    }
    unitsGroup.add(anchor);
    unitMeshes.set(unit.id, anchor);
    return anchor;
  }

  function buildTile(tile) {
    const spec = TILE_VISUALS[tile.type] || TILE_VISUALS.grass;
    const height = tile.type === 'water' ? 0.16 : tileTopY(tile.h);
    const anchor = new THREE.Group();
    anchor.name = `tile-${tile.x}-${tile.z}`;
    anchor.position.set(tile.x, 0, tile.z);
    anchor.userData.artGroup = spec.group;
    anchor.userData.tile = { x: tile.x, z: tile.z, type: tile.type, h: tile.h };
    anchor.userData.kind = 'tile';
    const visual = new THREE.Group();
    visual.name = 'visual';
    const color = new THREE.Color(spec.top);
    if (tile.h > 0) color.offsetHSL(0, 0, Math.min(0.12, tile.h * 0.045));
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.93, height, 0.93),
      new THREE.MeshLambertMaterial({
        color,
        transparent: tile.type === 'water',
        opacity: tile.type === 'water' ? 0.94 : 1,
      }),
    );
    mesh.position.y = height / 2;
    mesh.userData.tile = anchor.userData.tile;
    mesh.userData.kind = 'tile';
    visual.add(mesh);
    anchor.add(visual);
    anchor.userData.visual = visual;
    tilesGroup.add(anchor);
    tileMeshes.push(mesh);
    tops.set(`${tile.x},${tile.z}`, height);
    return anchor;
  }

  function addGround(cx, cz, w, d) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color: OVERLAY_VISUALS.ground.color }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.03, cz);
    ground.name = 'tiles/ground';
    ground.userData.artGroup = OVERLAY_VISUALS.ground.group;
    tilesGroup.add(ground);
  }

  function showDiorama() {
    if (mode === 'diorama') return;
    mode = 'diorama';
    battleId = null;
    clearGroups();
    width = 5;
    depth = 5;
    const heights = [
      [0, 0, 1, 1, 0],
      [0, 1, 1, 2, 1],
      [0, 0, 1, 1, 1],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 5; x++) {
        const type = heights[z][x] > 0 ? 'stone' : x === 0 && z === 3 ? 'mud' : 'grass';
        buildTile({ x, z, h: heights[z][x], type });
      }
    }
    addGround(2, 2, 12, 12);
    const samples = [
      { id: 'demo-w', classId: 'wizard', x: 1, z: 1, facing: 0, color: '#e2a23b' },
      { id: 'demo-r', classId: 'rogue', x: 2, z: 1, facing: 1, color: '#3cb8a8' },
      { id: 'demo-k', classId: 'knight', x: 3, z: 1, facing: 0, color: '#e36b8a' },
    ];
    for (const unit of samples) {
      const anchor = buildUnit(unit);
      anchor.position.set(unit.x, tops.get(`${Math.round(unit.x)},${Math.round(unit.z)}`) || 0.3, unit.z);
      anchor.rotation.y = FACE_YAW[unit.facing] || 0;
      anchor.userData.placed = true;
    }
    yaw = Math.PI / 4;
    zoom = 1;
    fit();
  }

  function topAt(x, z) {
    return tops.get(`${x},${z}`) ?? 0.3;
  }

  function showBattle(battle) {
    const fresh = battleId !== battle.id;
    mode = 'battle';
    if (fresh) {
      battleId = battle.id;
      clearGroups();
      width = battle.width;
      depth = battle.depth;
      yaw = Math.PI / 4;
      zoom = 1;
      addGround((width - 1) / 2, (depth - 1) / 2, width + 6, depth + 6);
      for (const tile of battle.tiles) buildTile(tile);
      fit();
    }
    stripFx('frost');
    for (const [key, turns] of Object.entries(battle.frost || {})) {
      if (!(turns > 0)) continue;
      const [x, z] = key.split(',').map(Number);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.045, 0.84),
        new THREE.MeshLambertMaterial({ color: OVERLAY_VISUALS.frost.color, transparent: true, opacity: 0.9 }),
      );
      plate.position.set(x, topAt(x, z) + 0.03, z);
      plate.userData.kind = 'frost';
      plate.userData.artGroup = OVERLAY_VISUALS.frost.group;
      plate.name = `tiles/frost-${x}-${z}`;
      fxGroup.add(plate);
    }
    const seen = new Set();
    for (const unit of battle.units) {
      seen.add(unit.id);
      const anchor = unitMeshes.get(unit.id) || buildUnit(unit);
      anchor.userData.unit = unit;
      const targetY = topAt(unit.x, unit.z);
      const target = new THREE.Vector3(unit.x, targetY, unit.z);
      if (!anchor.userData.placed) {
        anchor.position.copy(target);
        anchor.userData.placed = true;
      } else if (anchor.position.distanceTo(target) > 0.04) {
        tweens.push({
          anchor,
          from: anchor.position.clone(),
          to: target,
          t: 0,
          dur: 0.36,
        });
      } else {
        anchor.position.copy(target);
      }
      anchor.rotation.y = FACE_YAW[unit.facing] ?? 0;
      const visual = anchor.userData.visual;
      const down = !!unit.downed;
      visual.scale.y = down ? 0.34 : 1;
      visual.position.y = 0;
      anchor.visible = !(unit.side === 'enemy' && unit.downed);
    }
    for (const [id, anchor] of unitMeshes) {
      if (seen.has(id)) continue;
      unitsGroup.remove(anchor);
      disposeObject(anchor);
      unitMeshes.delete(id);
    }
  }

  function setHighlights({ move = [], attack = [], aoe = [] }) {
    stripFx('highlight');
    const paint = (list, color, opacity, lift) => {
      for (const tile of list) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.98, 0.98),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(tile.x, topAt(tile.x, tile.z) + lift, tile.z);
        mesh.userData.kind = 'highlight';
        mesh.raycast = () => {};
        fxGroup.add(mesh);
      }
    };
    paint(move, OVERLAY_VISUALS.move.color, 0.78, 0.05);
    paint(aoe, OVERLAY_VISUALS.aoe.color, 0.42, 0.06);
    paint(attack, OVERLAY_VISUALS.attack.color, 0.55, 0.07);
  }

  function setSelected(id) {
    selectedId = id || null;
    ring.visible = !!selectedId && unitMeshes.has(selectedId);
  }

  function closest(clientX, clientY, tiles, radius = 52) {
    const rect = canvas.getBoundingClientRect();
    let best = null;
    let bestD = radius;
    for (const tile of tiles || []) {
      const projected = projectTile(tile.x, tile.z);
      if (!projected) continue;
      const dist = Math.hypot(rect.left + projected.x - clientX, rect.top + projected.y - clientY);
      if (dist <= bestD) {
        bestD = dist;
        best = tile;
      }
    }
    return best;
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...unitMeshes.values(), ...tileMeshes], true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        if (obj.userData?.unitId) {
          const unit = obj.userData.unit;
          return {
            unitId: obj.userData.unitId,
            x: unit ? unit.x : Math.round(obj.position.x),
            z: unit ? unit.z : Math.round(obj.position.z),
          };
        }
        if (obj.userData?.tile) return { ...obj.userData.tile, unitId: null };
        obj = obj.parent;
      }
    }
    return null;
  }

  function project(object, lift = 1.05) {
    if (!object) return null;
    const point = new THREE.Vector3();
    object.getWorldPosition(point);
    point.y += lift;
    point.project(camera);
    if (point.z > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (point.x * 0.5 + 0.5) * rect.width,
      y: (-point.y * 0.5 + 0.5) * rect.height,
    };
  }

  function projectTile(x, z) {
    const point = new THREE.Vector3(x, topAt(x, z) + 0.8, z);
    point.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (point.x * 0.5 + 0.5) * rect.width,
      y: (-point.y * 0.5 + 0.5) * rect.height,
    };
  }

  let last = performance.now();
  function frame(now) {
    if (window.TACTICS?.pause) {
      requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tween = tweens[i];
      tween.t += dt;
      const k = Math.min(1, tween.t / tween.dur);
      const eased = 1 - (1 - k) * (1 - k);
      tween.anchor.position.lerpVectors(tween.from, tween.to, eased);
      if (k >= 1) tweens.splice(i, 1);
    }
    if (mode === 'diorama') {
      yaw = Math.PI / 4 + Math.sin(now / 1000 * 0.28) * 0.22;
      fit();
    }
    const stage = canvas.parentElement;
    const hidden = !stage || getComputedStyle(stage).visibility === 'hidden' || stage.clientWidth < 2;
    if (hidden) {
      requestAnimationFrame(frame);
      return;
    }
    if (selectedId && unitMeshes.has(selectedId)) {
      const anchor = unitMeshes.get(selectedId);
      ring.visible = anchor.visible;
      ring.position.set(anchor.position.x, anchor.position.y + 0.05, anchor.position.z);
    } else {
      ring.visible = false;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  showDiorama();
  resize();
  requestAnimationFrame(frame);

  return {
    resize,
    showDiorama,
    showBattle,
    setHighlights,
    setSelected,
    pick,
    closest,
    project,
    projectTile,
    anchorOf(id) {
      return unitMeshes.get(id) || null;
    },
    rotate() {
      yaw += Math.PI / 2;
      fit();
    },
    zoomBy(factor) {
      zoom = Math.min(1.55, Math.max(0.72, zoom * factor));
      fit();
    },
    get scene() {
      return scene;
    },
  };
}
