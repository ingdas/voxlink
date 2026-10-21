// A world's archipelago: a small hub island in the middle and one island per figure, joined by plank bridges.
// Islands stand north of the hub in two staggered rows (odd figures in front, even ones behind the gaps); a
// causeway runs north from the hub to a boardwalk, and a spur leads from the boardwalk into each island's south
// side (where every island keeps a clear path to its pedestal) — the back row's spurs pass between the front
// islands. Bridges are breeze lanes: you cross them fast. Rails line every open edge. Only one figure island is active (its puzzle loaded): the archipelago is shifted so that island sits
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
// doorShut(level): a door at the island end of its bridge stays shut (the very first figure, until it's rebuilt)
export function buildArchipelago({ chapter, levels, makePart, makeHub, isOpen, isDone, doorShut = () => false, figureMaterial }) {
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
  for (const pt of parts) pt.doorZ = pt.entry.z + 1.3;
  const bridgeSd = (x, z) => {
    let d = Math.min(fixedSd[0](x, z), fixedSd[1](x, z));
    for (const pt of parts) {
      let e = pt.spurSd(x, z);
      if (!pt.open) e = Math.max(e, (zJ - HW - 0.3) - z);
      if (pt.shut) e = Math.max(e, 0.35 - Math.abs(z - pt.doorZ));
      d = Math.min(d, e);
    }
    return d;
  };

  // ---- place the islands ----
  hubWorld.group.position.copy(hub.p);
  root.add(hubWorld.group);
  for (const pt of parts) { pt.world.group.position.copy(pt.p); root.add(pt.world.group); }

  // ---- bridge looks ----
  const B = new Batch();
  const rects = [causeway, boardwalk, ...parts.map(pt => pt.spur)];
  const pieceList = [hub, ...parts];
  const onLand = (ax, az) => pieceList.some(k => k.world.walkSd(ax - k.p.x, az - k.p.z) < -0.05);
  const inOther = (ax, az, self) => rects.some(r => r !== self && ax > r[0] + 0.12 && ax < r[2] - 0.12 && az > r[1] + 0.12 && az < r[3] - 0.12);
  const postH = floating ? 1.6 : DECK - hubWorld.seaY + 0.9;
  const deck = r => {
    const [x0, z0, x1, z1] = r;
    const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, w = alongX ? z1 - z0 : x1 - x0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.put(GEO.box(), 0x8a5a3c, cx, DECK - 0.12, cz, { sx: alongX ? L : w, sy: 0.16, sz: alongX ? w : L });
    for (let t = 0.25; t < L; t += 0.5) {
      const px = alongX ? x0 + t : cx, pz = alongX ? cz : z0 + t;
      B.put(GEO.box(), Math.round(t * 2) % 2 ? 0xc08a5c : 0xb27b50, px, DECK - 0.02, pz, { sx: alongX ? 0.44 : w + 0.1, sy: 0.06, sz: alongX ? w + 0.1 : 0.44, kind: 'ground' });
    }
    // rails on every side, except where the bridge runs onto land or into another bridge
    const sides = [[x0, z0 - 0.05, x1, z0 - 0.05], [x0, z1 + 0.05, x1, z1 + 0.05], [x0 - 0.05, z0, x0 - 0.05, z1], [x1 + 0.05, z0, x1 + 0.05, z1]];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.3));
      let run = null;
      const flush = () => {
        if (!run || run.b - run.a < 0.3) { run = null; return; }
        const p = t => [ax + (bx - ax) * t / len, az + (bz - az) * t / len];
        const [sx, sz] = p(run.a), [ex, ez] = p(run.b), rl = run.b - run.a, along = Math.abs(bx - ax) > Math.abs(bz - az);
        for (const y of [0.42, 0.86]) B.put(GEO.box(), 0xc08a5c, (sx + ex) / 2, DECK + y, (sz + ez) / 2, { sx: along ? rl : 0.09, sy: 0.08, sz: along ? 0.09 : rl });
        const k = Math.max(1, Math.round(rl / 1.8));
        for (let i = 0; i <= k; i++) { const [px, pz] = p(run.a + rl * i / k); B.put(GEO.box(), 0x6b4a36, px, DECK + 0.95 - postH / 2, pz, { sx: 0.14, sy: postH, sz: 0.14 }); }
        run = null;
      };
      for (let i = 0; i <= n; i++) {
        const t = (len * i) / n, px = ax + (bx - ax) * t / len, pz = az + (bz - az) * t / len;
        if (onLand(px, pz) || inOther(px, pz, r)) flush();
        else if (run) run.b = t; else run = { a: t, b: t };
      }
      flush();
    }
  };
  for (const r of rects) deck(r);
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
    // a door at the island end, for the figure that has to be rebuilt before you may leave
    const d = new THREE.Group();
    for (const s of [-1, 1]) { const m = new THREE.Mesh(gateGeo, wood); m.scale.set(0.28, 2.5, 0.28); m.position.set(s * (HW - 0.02), DECK + 1.25, 0); d.add(m); }
    const lintel = new THREE.Mesh(gateGeo, wood); lintel.scale.set(HW * 2 + 0.3, 0.3, 0.34); lintel.position.set(0, DECK + 2.55, 0); d.add(lintel);
    pt.leaves = [-1, 1].map(s => {
      const hinge = new THREE.Group(); hinge.position.set(s * (HW - 0.16), DECK, 0);
      const leaf = new THREE.Mesh(gateGeo, dark); leaf.scale.set(HW - 0.18, 2.2, 0.1); leaf.position.set(-s * (HW - 0.18) / 2, 1.1, 0); hinge.add(leaf);
      const knob = new THREE.Mesh(gateGeo, toon(0xffd23f)); knob.scale.setScalar(0.12); knob.position.set(-s * (HW - 0.36), 1.05, 0.08); hinge.add(knob);
      hinge.userData.s = s;
      d.add(hinge);
      return hinge;
    });
    d.position.set(pt.p.x, 0, pt.doorZ);
    d.traverse(o => { o.castShadow = true; });
    root.add(d);
    pt.door = d;
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
      // (gentler with reduced motion)
      if (!k && bridgeSd(ax, az) < 0.05) return { friction: 1, slow: api.calmMotion?.() ? 1.4 : BOOST, sound: 'wood' };
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
      if (beacon.visible) {
        const { mark, beamMat } = beacon.userData;
        mark.position.y = beacon.userData.top + (api.calmMotion?.() ? 0 : Math.sin(t * 2.2) * 0.35);
        beamMat.opacity = 0.28 + Math.sin(t * 1.6) * 0.08;
      }
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
      wood.dispose(); dark.dispose(); lockTex?.dispose(); beacon.userData.tex.dispose();
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

  // a beacon over the next figure's island (or the portal): a tall column of light and a bobbing "?"
  const beacon = new THREE.Group();
  {
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 60, 20, 1, true), beamMat);
    beam.position.y = 30;
    beam.layers.set(LAYER_OVERLAY);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 70, 56, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 62, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1f3d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 72px Fredoka, sans-serif'; g.fillText('?', 64, 66);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    mark.scale.setScalar(2.4);
    mark.layers.set(LAYER_OVERLAY); mark.renderOrder = 6;
    beacon.add(beam, mark);
    beacon.userData = { beam, mark, beamMat, tex };
    beacon.visible = false;
    root.add(beacon);
  }
  let beaconFor;

  const displays = new Map();
  function dress() {
    for (const pt of parts) {
      pt.open = isOpen(pt.level);
      pt.gate.visible = !pt.open;
      pt.shut = doorShut(pt.level);
      pt.door.visible = pt.shut || pt.hadDoor;
      if (pt.shut) pt.hadDoor = true;
      for (const h of pt.leaves) h.rotation.y = pt.shut ? 0 : h.userData.s * 1.75; // swung open
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
    // is (x, z) on the active figure's island (bridges excluded)?
    onActive(x, z) { return active.world.walkSd(x, z) < 0.2 && bridgeSd(x + A.x, z + A.z) > 0.05; },
    offsetOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.p.x - A.x, 0, pt.p.z - A.z) : null; },
    // scene positions: where you arrive by portal, an island's bridge entry, the portal itself
    arrival() { const pz = hubWorld.portal?.z ?? 4; return { x: hub.p.x - A.x, z: hub.p.z + pz - 2.6 - A.z, yaw: 0 }; },
    entryOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.entry.x - A.x, DECK + 1, pt.entry.z + 1.5 - A.z) : null; },
    portalPos() { const pz = hubWorld.portal?.z ?? 4; return new THREE.Vector3(hub.p.x - A.x, 1.8, hub.p.z + pz - A.z); },
    atPortal(x, z) { const p = arch.portalPos(); return Math.hypot(x - p.x, z - p.z) < 1.3; },
    // a locked spur's gate you're pressing against
    // light the beacon over a figure's island (a level), the portal ('portal') or nothing (null)
    setBeacon(target) {
      if (target === beaconFor) return;
      beaconFor = target;
      beacon.visible = !!target;
      if (!target) return;
      if (target === 'portal') {
        const pz = hubWorld.portal?.z ?? 4;
        beacon.position.set(hub.p.x, 0, hub.p.z + pz);
        beacon.userData.top = 5;
      } else {
        const pt = parts.find(p => p.level === target);
        beacon.position.copy(pt.p);
        beacon.userData.top = PEDESTAL_TOP + expandLevel(target).height * 0.6 + 3;
      }
      beacon.userData.mark.position.y = beacon.userData.top;
    },
    shutDoorAt(x, z) {
      for (const pt of parts) if (pt.shut && Math.hypot(x + A.x - pt.p.x, z + A.z - pt.doorZ) < 2) return pt;
      return null;
    },
    lockedGateAt(x, z) {
      for (const pt of parts) if (!pt.open && Math.hypot(x + A.x - pt.gatePos.x, z + A.z - pt.gatePos.z) < 2.2) return pt;
      return null;
    },
  };
  return arch;
}
