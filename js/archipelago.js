// A world's archipelago: a small hub island in the middle and one island per figure, joined by plank bridges.
// Islands stand north of the hub in two staggered rows (odd figures in front, even ones behind the gaps); a
// causeway runs north from the hub to a boardwalk, and a spur leads from the boardwalk into each island's south
// side (where every island keeps a clear path to its pedestal) — the back row's spurs pass between the front
// islands. Bridges are breeze lanes: you cross them fast. Only one figure island is active (its puzzle loaded): the archipelago is shifted so that island sits
// at the origin, which is what the game expects, and `api` answers the player's queries across all islands and
// bridges in those shifted coordinates. Moving to another island just changes the shift.
import * as THREE from 'three';
import { PEDESTAL_TOP } from './world.js';
import { Batch, GEO, projectInside, sdBox } from './world-kit.js';
import { toon, LAYER_OVERLAY } from './render.js';
import { mergeFigure } from './voxels.js';
import { expandLevel } from './levels.js';

const DECK = 0.22; // bridge deck height
const GAP = 5.4; // between front-row islands (a back-row bridge passes through)
const BOOST = 2.4; // walking speed on the bridges
const SPUR = 4.5; // boardwalk to island
const CAUSE = 6; // hub to boardwalk
const HW = 1.2; // half width of a bridge

// furthest extent of an island's ground in one direction (scan along z at a few x positions)
function reach(world, dirZ) {
  let best = 0;
  for (let x = -world.R; x <= world.R; x += 1) {
    for (let d = 0; d <= world.R + 2; d += 0.5) if (world.walkSd(x, d * dirZ) < 0) best = Math.max(best, d);
  }
  return best;
}
// where the ground ends going along +z (or -z) from the centre line
function coast(world, dirZ) {
  let d = 0;
  while (d < world.R + 4 && world.walkSd(0, (d + 0.25) * dirZ) < 0) d += 0.25;
  return d;
}

// chapter: index; levels: its figures; makePart(level) -> { world, footR }; makeHub(seaY) -> world
// isOpen(level) / isDone(level); figureMaterial: material for finished figures standing on inactive islands
export function buildArchipelago({ chapter, levels, makePart, makeHub, isOpen, isDone, figureMaterial }) {
  const root = new THREE.Group();
  const parts = levels.map(level => ({ level, ...makePart(level), p: new THREE.Vector3() }));
  const hubWorld = makeHub(parts[0].world.seaY);
  const hub = { world: hubWorld, p: new THREE.Vector3() };
  const floating = hubWorld.voidY !== undefined;

  // ---- layout: two staggered rows north of the hub ----
  const zJ = -(reach(hubWorld, -1) + CAUSE); // the boardwalk
  const front = parts.filter((pt, i) => i % 2 === 0 || i === parts.length - 1); // an even count ends the front row
  const back = parts.filter(pt => !front.includes(pt));
  for (const pt of parts) { pt.coast = coast(pt.world, 1); pt.south = reach(pt.world, 1); pt.north = reach(pt.world, -1); }
  let x = 0;
  front.forEach((pt, k) => { if (k) x += front[k - 1].world.R + pt.world.R + GAP; pt.p.set(x, 0, zJ - SPUR - pt.south); });
  const mid = (front[0].p.x + front[front.length - 1].p.x) / 2;
  for (const pt of front) pt.p.x -= mid;
  // a back-row island stands behind the gap between its two front-row neighbours, clear of their north shores
  // (and of the back-row island before it)
  back.forEach((pt, k) => {
    const L = front[k], Rt = front[k + 1] || front[k];
    const gx = Rt === L ? L.p.x + L.world.R + GAP / 2 : (L.p.x + L.world.R + Rt.p.x - Rt.world.R) / 2;
    let z = Math.min(L.p.z - L.north, Rt.p.z - Rt.north) - 3 - pt.south;
    const prev = back[k - 1];
    if (prev && Math.abs(gx - prev.p.x) < prev.world.R + pt.world.R + 2) z = Math.min(z, prev.p.z - prev.north - 3 - pt.south);
    pt.p.set(gx, 0, z);
  });
  for (const pt of parts) pt.entry = new THREE.Vector3(pt.p.x, 0, pt.p.z + pt.coast); // where its spur reaches the island
  const hubN = coast(hubWorld, -1);
  const xMin = Math.min(...parts.map(pt => pt.p.x)), xMax = Math.max(...parts.map(pt => pt.p.x));
  // bridges as rectangles [x0, z0, x1, z1] (archipelago coordinates: the hub at the origin)
  const causeway = [-HW, zJ - HW, HW, -hubN + 0.8];
  const boardwalk = [xMin - HW, zJ - HW, xMax + HW, zJ + HW];
  parts.forEach(pt => { pt.spur = [pt.p.x - HW + 0.1, pt.entry.z - 0.8, pt.p.x + HW - 0.1, zJ]; });
  const rectSd = ([x0, z0, x1, z1]) => sdBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2);
  const fixedSd = [rectSd(causeway), rectSd(boardwalk)];
  parts.forEach(pt => { pt.spurSd = rectSd(pt.spur); });
  // a locked island's spur is closed off by a gate where it leaves the boardwalk
  const bridgeSd = (x, z) => {
    let d = Math.min(fixedSd[0](x, z), fixedSd[1](x, z));
    for (const pt of parts) d = Math.min(d, pt.open ? pt.spurSd(x, z) : Math.max(pt.spurSd(x, z), (zJ - HW - 0.3) - z));
    return d;
  };

  // ---- place the islands ----
  hubWorld.group.position.copy(hub.p);
  root.add(hubWorld.group);
  for (const pt of parts) { pt.world.group.position.copy(pt.p); root.add(pt.world.group); }

  // ---- bridge looks ----
  const B = new Batch();
  const deck = ([x0, z0, x1, z1], gaps = []) => {
    const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, w = alongX ? z1 - z0 : x1 - x0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.put(GEO.box(), 0x8a5a3c, cx, DECK - 0.12, cz, { sx: alongX ? L : w, sy: 0.16, sz: alongX ? w : L });
    // the breeze lane: a glowing dashed stripe down the middle
    for (let t = 0.6; t < L - 0.4; t += 1.4) {
      const px = alongX ? x0 + t : cx, pz = alongX ? cz : z0 + t;
      B.put(GEO.box(), 0x9cf5ff, px, DECK + 0.015, pz, { sx: alongX ? 0.8 : 0.3, sy: 0.02, sz: alongX ? 0.3 : 0.8, kind: 'glow' });
    }
    for (let t = 0.25; t < L; t += 0.5) {
      const px = alongX ? x0 + t : cx, pz = alongX ? cz : z0 + t;
      B.put(GEO.box(), Math.round(t * 2) % 2 ? 0xc08a5c : 0xb27b50, px, DECK - 0.02, pz, { sx: alongX ? 0.44 : w + 0.1, sy: 0.06, sz: alongX ? w + 0.1 : 0.44, kind: 'ground' });
    }
    // posts and a rope rail along both sides (with openings where other bridges join)
    for (const s of [-1, 1]) {
      const off = (w / 2 + 0.05) * s;
      for (let t = 0.4; t < L; t += 2.2) {
        const px = alongX ? x0 + t : cx + off, pz = alongX ? cz + off : z0 + t;
        if (gaps.some(g => Math.abs((alongX ? px : pz) - g) < 1.6)) continue;
        const postH = floating ? 1.6 : DECK - hubWorld.seaY + 0.7;
        B.put(GEO.cyl(6), 0x6b4a36, px, DECK + 0.7 - postH / 2, pz, { sx: 0.11, sy: postH, sz: 0.11 });
        B.put(GEO.box(), 0xe9dfcf, px, DECK + 0.62, pz, { sx: alongX ? 2.2 : 0.06, sy: 0.05, sz: alongX ? 0.06 : 2.2 });
      }
    }
  };
  deck(causeway, [zJ]);
  deck(boardwalk, [0, ...parts.map(pt => pt.p.x)]);
  for (const pt of parts) deck(pt.spur, [zJ]);
  const bridgeBlockers = [];
  B.build(root, bridgeBlockers);

  // gates on the spurs of locked islands, and finished figures on the islands you're not on
  const gateGeo = new THREE.BoxGeometry(1, 1, 1);
  const wood = toon(0x8a5a3c), dark = toon(0x5c3a28);
  let lockTex = null;
  const lockBadge = () => {
    if (lockTex) return lockTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 70, 54, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9dfcf'; g.beginPath(); g.arc(64, 62, 50, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a1f3d'; g.lineWidth = 9; g.beginPath(); g.arc(64, 52, 16, Math.PI, 0); g.stroke();
    g.fillStyle = '#2a1f3d'; g.fillRect(42, 52, 44, 32);
    lockTex = new THREE.CanvasTexture(cv); lockTex.colorSpace = THREE.SRGBColorSpace;
    return lockTex;
  };
  for (const pt of parts) {
    const g = new THREE.Group();
    const z = zJ - HW - 0.25;
    for (const s of [-1, 1]) { const m = new THREE.Mesh(gateGeo, wood); m.scale.set(0.24, 1.5, 0.24); m.position.set(pt.p.x + s * (HW - 0.05), DECK + 0.75, z); g.add(m); }
    for (const y of [0.55, 1.1]) { const m = new THREE.Mesh(gateGeo, dark); m.scale.set(HW * 2, 0.14, 0.1); m.position.set(pt.p.x, DECK + y, z); g.add(m); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockBadge(), depthWrite: false, transparent: true }));
    sp.scale.setScalar(0.7); sp.position.set(pt.p.x, DECK + 1.95, z); sp.layers.set(LAYER_OVERLAY); sp.renderOrder = 5;
    g.add(sp);
    g.traverse(o => { o.castShadow = true; });
    root.add(g);
    pt.gate = g;
    pt.gatePos = new THREE.Vector3(pt.p.x, 0, z);
  }

  let active = null;
  const A = new THREE.Vector3(); // archipelago position of the active island
  const pieces = [hub, ...parts];
  const api = {
    group: root, theme: hubWorld.theme, themeId: hubWorld.themeId, atmos: hubWorld.atmos, archipelago: true,
    get onFlash() { return hubWorld.onFlash; }, set onFlash(f) { hubWorld.onFlash = f; },
    get onGust() { return hubWorld.onGust; }, set onGust(f) { hubWorld.onGust = f; },
    get calm() { return hubWorld.calm; }, set calm(v) { hubWorld.calm = v; },
    gravityScale: hubWorld.gravityScale, wind: hubWorld.wind, voidY: hubWorld.voidY,
    colliders: [], blockers: [],
    // the puzzle lives on the active island (its own coordinates are the scene's)
    get R() { return active.world.R; }, get tops() { return active.world.tops; },
    radiusAt: th => active.world.radiusAt(th),
    isFreeGround: (x, z, m) => active.world.isFreeGround(x, z, m),
    heightAt: (x, z, maxY) => active.world.heightAt(x, z, maxY),
    groundY: (x, z) => active.world.groundY(x, z),
    dropPoint: (x, z, maxY, px, pz) => active.world.dropPoint(x, z, maxY, px, pz),
    // ---- the player walks across everything ----
    floorAt(x, z) {
      const ax = x + A.x, az = z + A.z;
      let best = null;
      for (const k of pieces) {
        const lx = ax - k.p.x, lz = az - k.p.z;
        if (k.world.walkSd(lx, lz) < 0.35) { const f = k.world.floorAt(lx, lz); if (f !== null && (best === null || f > best)) best = f; }
      }
      if (bridgeSd(ax, az) < 0.05 && (best === null || DECK > best)) best = DECK;
      return best;
    },
    walkSd(x, z) {
      const ax = x + A.x, az = z + A.z;
      let d = bridgeSd(ax, az);
      for (const k of pieces) d = Math.min(d, k.world.walkSd(ax - k.p.x, az - k.p.z));
      return d;
    },
    surfaceAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      const k = pieceAt(ax, az, -0.3);
      if (!k && bridgeSd(ax, az) < 0.05) return { friction: 1, slow: BOOST, sound: 'wood' };
      return (k || active).world.surfaceAt(ax - (k || active).p.x, az - (k || active).p.z, y);
    },
    padAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      for (const k of pieces) { const pd = k.world.padAt(ax - k.p.x, az - k.p.z, y); if (pd) return pd; }
      return null;
    },
    safeAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      if (bridgeSd(ax, az) < -0.6 && Math.abs(y - DECK) < 0.15) return true;
      const k = pieceAt(ax, az, -0.6);
      return !!k && k.world.safeAt(ax - k.p.x, az - k.p.z, y);
    },
    // carrying blocks keeps you on the active island; otherwise anywhere on land or a bridge
    restrict: null, onBlocked: null,
    clampPlayer(pos) {
      if (api.restrict?.()) {
        const x = pos.x, z = pos.z;
        active.world.clampPlayer(pos);
        if (Math.abs(pos.x - x) + Math.abs(pos.z - z) > 1e-4 && bridgeSd(x + A.x, z + A.z) < 0.3) api.onBlocked?.();
        return;
      }
      if (floating && (pos.y > 0.05 || pos.y < -0.3)) return;
      if (api.walkSd(pos.x, pos.z) > -0.45) projectInside(api.walkSd, pos, 0.45);
    },
    update(dt, t, cam) {
      const c = cam ? cam.clone().add(A) : null;
      for (const k of pieces) k.world.update(dt, t, c ? c.clone().sub(k.p) : null);
      // the sun's shadow follows you round the archipelago
      const sun = hubWorld.atmos.sun;
      if (sun && c) {
        sun.target.position.set(c.x, 0, c.z);
        sun.position.copy(sunDir).multiplyScalar(40).add(sun.target.position);
      }
    },
    dispose() {
      for (const k of pieces) k.world.dispose();
      root.traverse(o => { if (o.parent && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      for (const d of displays.values()) d.geometry.dispose();
      wood.dispose(); dark.dispose(); lockTex?.dispose();
    },
  };
  const sunDir = new THREE.Vector3(...hubWorld.theme.sunPos).normalize();
  if (hubWorld.atmos.sun) {
    const cam = hubWorld.atmos.sun.shadow.camera, e = 30;
    Object.assign(cam, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 110 });
    cam.updateProjectionMatrix();
  }
  // a piece whose ground is under (ax, az), at least `inside` deep
  function pieceAt(ax, az, inside = 0) {
    for (const k of pieces) if (k.world.walkSd(ax - k.p.x, az - k.p.z) < inside) return k;
    return null;
  }

  const displays = new Map();
  function dress() {
    for (const pt of parts) {
      pt.open = isOpen(pt.level);
      pt.gate.visible = !pt.open;
      const show = pt !== active && isDone(pt.level);
      if (show && !displays.has(pt)) {
        const m = new THREE.Mesh(mergeFigure(expandLevel(pt.level).cells), figureMaterial);
        m.position.set(0, PEDESTAL_TOP, 0);
        m.castShadow = m.receiveShadow = true;
        pt.world.group.add(m);
        displays.set(pt, m);
      }
      if (displays.has(pt)) displays.get(pt).visible = show;
    }
  }

  const arch = {
    chapter, api, group: root, parts,
    // make `level`'s island the active one; returns how far the scene moved (add it to anything you keep, like the player)
    setActive(level) {
      const pt = parts.find(p => p.level === level);
      const old = A.clone();
      active = pt;
      A.copy(pt.p);
      root.position.set(-A.x, 0, -A.z);
      api.colliders = [];
      api.blockers = [...bridgeBlockers];
      for (const k of pieces) {
        const o = new THREE.Vector3(k.p.x - A.x, 0, k.p.z - A.z);
        for (const b of k.world.colliders) { const c = b.clone().translate(o); c.sound = b.sound; api.colliders.push(c); }
        api.blockers.push(...k.world.blockers);
      }
      root.updateMatrixWorld(true);
      dress();
      return old.sub(A);
    },
    refresh: dress,
    // the open figure island under the player (well inside its shore), if any
    partAt(x, z) {
      const ax = x + A.x, az = z + A.z;
      return parts.find(p => p.open && p.world.walkSd(ax - p.p.x, az - p.p.z) < -0.8) || null;
    },
    boardwalkZ() { return zJ - A.z; },
    offsetOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.p.x - A.x, 0, pt.p.z - A.z) : null; },
    // scene positions: where you arrive by portal, an island's bridge entry, the portal itself
    arrival() { const pz = hubWorld.portal?.z ?? 4; return { x: hub.p.x - A.x, z: hub.p.z + pz - 2.6 - A.z, yaw: 0 }; },
    entryOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.entry.x - A.x, DECK + 1, pt.entry.z + 1.5 - A.z) : null; },
    portalPos() { const pz = hubWorld.portal?.z ?? 4; return new THREE.Vector3(hub.p.x - A.x, 1.8, hub.p.z + pz - A.z); },
    atPortal(x, z) { const p = arch.portalPos(); return Math.hypot(x - p.x, z - p.z) < 1.3; },
    // a locked spur's gate you're pressing against
    lockedGateAt(x, z) {
      for (const pt of parts) if (!pt.open && Math.hypot(x + A.x - pt.gatePos.x, z + A.z - pt.gatePos.z) < 2.2) return pt;
      return null;
    },
  };
  return arch;
}
