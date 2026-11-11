// Island generators, one per chapter world. Each fills the shared builder `W` (see buildWorld):
// ground shapes (W.walkSd / W.floorAt), colliders + tops, decoration into the merged batch W.B,
// and optional gameplay twists (W.surfaceAt, W.gravityScale, W.wind, W.pads, W.voidY).
import * as THREE from 'three';
import { LAYER_FX, LAYER_OVERLAY, toon } from './render.js';
import { GEO, contours, topGeometry, sdBlob, sdBox, sdEllipse, sdCapsule, sdUnion } from './world-kit.js';
import { GRAVITY } from './player.js';
import { glows } from './looks.js';
import { makePortal, paintView } from './portal.js';
import { put, putQ, putL, own, block, shade, mix, footTint, capTint, leafTint, tree, rock, tower, house, fence, column, lintel, picketFence, bale, bush, plaza, lampPost, sheep, igloo, penguin, snowman, stump, rowboat, shipwreck, starfish, crate, barrel, clam, crab, parasol, sandcastle } from './world-props.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const Q = new THREE.Quaternion(), V = new THREE.Vector3(), M = new THREE.Matrix4(), E = new THREE.Euler();

// each world's clouds: how many, the ring's inner radius, their height, size and how fast the ring turns (see
// buildWorld); the hub of a world's archipelago uses them for the whole archipelago
const SKIES = {
  meadow: { clouds: 18, cloudScale: 1.35, cloudY: 18 },
  farm: { clouds: 16, cloudScale: 1.3, cloudY: 17 },
  frost: { clouds: 9, cloudY: 22 },
  frostwood: { clouds: 10, cloudY: 20, cloudScale: 1.2 },
  reef: { clouds: 12, cloudY: 8, cloudScale: 1.2, cloudR: 90 },
  cove: { clouds: 14, cloudY: 18 },
  starfall: { clouds: 0 },
  moon: { clouds: 0 },
  cliffs: { clouds: 22, cloudY: 16, cloudSpin: 0.03, cloudScale: 1.2 },
  storm: { clouds: 26, cloudR: 45, cloudY: 24, cloudSpin: 0.045, cloudScale: 1.3 },
};

// ---------- shared props: js/world-props.js ----------
// classic plateaus: 1-3 tiers, stairs facing the pedestal
function plateauField(W, n, colors, test = () => true) {
  const { rng, clearR, difficulty } = W;
  const made = [];
  let tries = 0;
  while (made.length < n && tries++ < 700) {
    const th = rng() * Math.PI * 2, r = Math.sqrt(rng()) * W.bound;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const w = 2 + Math.round(rng() * 2) * 0.6, d = 2 + Math.round(rng() * 2) * 0.6;
    const ext = Math.max(w, d) / 2;
    const roll = rng();
    const tier = roll < 0.4 ? 1 : roll < 0.85 - difficulty * 0.2 ? 2 : 3;
    if (r < Math.max(6.5, clearR + 3.8)) continue;
    if (W.walkSd(x, z) > -(ext + 2.8)) continue;
    if (W.spawnPath(x, z, ext + 1)) continue;
    if (made.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 4.2 && Math.abs(p.z - z) < (p.d + d) / 2 + 4.2)) continue;
    if (W.crowded(x, z, ext + 1.2)) continue;
    const base = W.flatAt(x, z, ext + 2.2, 0.02);
    if (base === null || !test(x, z, ext, base)) continue;
    if (W.blocked(x, z, ext + 2.2, base, 4)) continue;
    const ox = -x / r, oz = -z / r; // towards the centre
    if (tier === 1) tower(W, x, z, w, d, 0.9 + rng() * 0.3, base, ox, oz, 0, colors);
    else if (tier === 2) tower(W, x, z, w, d, 2.0 + rng() * 0.4, base, ox, oz, 1, colors);
    else tower(W, x, z, w, d, 3.1 + rng() * 0.3, base, ox, oz, 2, colors);
    made.push({ x, z, w: w + 0.16, d: d + 0.16 });
    W.obstacles.push({ x, z, r: 0.2 });
  }
  return made;
}

// scatter n things with a minimum spacing; test(x, z) -> truthy
function scatterProps(W, n, test, fn, tries = 8) {
  let k = 0;
  for (let i = 0; i < n * tries && k < n; i++) {
    const th = W.rng() * Math.PI * 2, r = Math.sqrt(W.rng()) * W.bound;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (!test(x, z)) continue;
    fn(x, z);
    k++;
  }
  return k;
}
const okTree = (W, x, z, edge = 1.5) => !W.nearCentre(x, z, 1.9) && W.walkSd(x, z) < -edge && !W.spawnPath(x, z, 0.4)
  && W.flatAt(x, z, 0.5, 0.02) !== null && !W.crowded(x, z, 2.2) && !W.blocked(x, z, 0.9, W.floorAt(x, z) ?? 0, 3);

// ---------- classic: the original round island (Kubo's Garden) ----------
function classic(W) {
  const { R, T, seed } = W;
  const isl = sdBlob(0, 0, R, seed);
  W.walkSd = isl; W.radiusAt = isl.radiusAt;
  W.ground(isl, { top: T.grass, side: T.cliff });
  plateauField(W, Math.round(4 + R * 0.25), { body: T.dirt, cap: T.cap, step: T.cliff });
  scatterProps(W, Math.round(R * 0.7), (x, z) => okTree(W, x, z), (x, z) => tree(W, T.trees, x, z, 0.8 + W.rng() * 0.5));
  scatterProps(W, Math.round(R * 0.4), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.35 + W.rng() * 0.45));
}

// ---------- meadow: terraced hills, a pond with a bridge, fences and flower beds ----------
function meadow(W) {
  const { R, T, seed, rng, clearR } = W;
  const isl = sdBlob(0, 0, R, seed);
  W.radiusAt = isl.radiusAt;
  const STEP_H = 0.45, RING = 1.8;
  const hills = [];
  const th0 = -Math.PI / 2 + (rng() - 0.5) * 0.8;
  for (const a of [th0 - 1.2 - rng() * 0.3, th0 + 1.2 + rng() * 0.3]) {
    let rh = clamp(R * 0.3, 4.5, 8.5);
    const room = (R * 0.92 - 2.6 - clearR - 2.4) / 2;
    rh = Math.min(rh, room);
    if (rh < 3.4) continue;
    const dmin = clearR + 2.4 + rh, dmax = R * 0.92 - 2.6 - rh;
    const d = dmin + rng() * Math.max(0, dmax - dmin);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    if (hills.some(h => Math.hypot(h.cx - cx, h.cz - cz) < h.rh + rh + 2)) continue;
    hills.push({ cx, cz, rh, sd: sdBlob(cx, cz, rh, seed + 3 + hills.length, 0.9), levels: rh > 6.2 ? 3 : 2 });
  }
  const levelAt = (h, x, z) => { const s = h.sd(x, z); return s < 0 ? Math.min(h.levels, 1 + Math.floor(-s / RING)) : 0; };
  const terraceY = (x, z) => { let k = 0; for (const h of hills) k = Math.max(k, levelAt(h, x, z)); return k * STEP_H; };

  // pond (a hole in the ground) with a plank bridge across
  let pond = null, bridge = null;
  for (let i = 0; i < 30 && !pond; i++) {
    const rp = clamp(R * 0.13, 2.3, 3.6);
    const a = rng() * Math.PI * 2, d = clearR + 3 + rp + rng() * Math.max(0, R * 0.9 - 3 - rp - (clearR + 3 + rp));
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    if (hills.some(h => Math.hypot(h.cx - px, h.cz - pz) < h.rh * 1.15 + rp + 2.5)) continue;
    if (W.spawnPath(px, pz, rp + 1.5) || isl(px, pz) > -(rp + 2.5)) continue;
    pond = { px, pz, rp, sd: sdBlob(px, pz, rp, seed + 9, 0.5) };
  }
  const land = pond ? (x, z) => Math.max(isl(x, z), -pond.sd(x, z)) : isl;
  if (pond) {
    const half = pond.rp * 1.2 + 1.1;
    bridge = { x0: pond.px - half, x1: pond.px + half, z: pond.pz };
    const rect = sdBox(pond.px, pond.pz, half, 1.0);
    W.walkSd = (x, z) => Math.min(land(x, z), rect(x, z));
  } else W.walkSd = land;
  W.coastSd = isl;
  W.floorAt = (x, z) => terraceY(x, z);
  W.surfaceAt = (x, z, y) => (bridge && Math.abs(z - bridge.z) < 0.9 && x > bridge.x0 && x < bridge.x1 && y > 0.1 ? { friction: 1, slow: 1, sound: 'wood' } : null);

  W.ground(isl, { top: T.grass, side: T.cliff, hole: pond?.sd, holeDepth: 0.65, holeColor: T.dirt });
  // terraces: nested rings, each one step higher
  const terraceTops = [0x9fe27a, 0xaee98a, 0xbcef98];
  for (const h of hills) {
    const rect = [h.cx - h.rh * 1.4, h.cz - h.rh * 1.4, h.cx + h.rh * 1.4, h.cz + h.rh * 1.4];
    for (let k = 1; k <= h.levels; k++) {
      const sdk = (x, z) => h.sd(x, z) + (k - 1) * RING;
      W.ground(sdk, { y: k * STEP_H, top: terraceTops[k - 1], side: k % 2 ? T.dirt : 0xd79a6a, depth: STEP_H + 0.02, lip: 0.1, lipDepth: 0.12, rect, cliffKind: 'solid', step: 0.4 });
    }
  }
  if (pond) {
    const { px, pz, rp } = pond, d = W.drng;
    const area = [px - rp * 1.5, pz - rp * 1.5, px + rp * 1.5, pz + rp * 1.5];
    W.B.add(topGeometry(contours((x, z) => pond.sd(x, z) + 0.02, ...area, 0.3), -0.3), 0x6fd6ec, null, 'fx');
    // the middle is deeper
    W.B.add(topGeometry(contours((x, z) => pond.sd(x, z) + rp * 0.34, ...area, 0.3), -0.28), 0x45b9e0, null, 'fx');
    // stones round the rim (not where the bridge lands)
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2 + d() * 0.2, rr = pond.sd.radiusAt(a) + 0.12 + d() * 0.12;
      const x = px + Math.cos(a) * rr, z = pz + Math.sin(a) * rr, ss = 0.14 + d() * 0.16;
      if (Math.abs(z - pz) < 1.25 || d() < 0.2) continue;
      put(W, GEO.rock(), shade(T.rock, 0.9 + d() * 0.16), x, 0.02, z, { sx: ss * 1.25, sy: ss * 0.7, sz: ss, ry: d() * 6, tint: capTint(mix(T.rock, T.tuft, 0.5), 0.6, 0.9) });
    }
    W.skirts.push({ x: px, z: pz, y: 0, r: rp + 0.45 });
    // lily pads, some with a flower
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rp * 0.8;
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.abs(z - pz) < 1.1) continue;
      const s = 0.35 + rng() * 0.25, turn = d() * 6.283;
      // a round leaf with a notch cut out of it
      W.B.own(new THREE.CylinderGeometry(s, s, 0.03, 9, 1, false, turn, Math.PI * 1.8).translate(x, -0.262, z), i % 2 ? 0x4fae4a : 0x5fbf55, null, 'fx');
      if (rng() < 0.4) {
        for (let k = 0; k < 6; k++) { const pa = (k / 6) * 6.283; putL(W, GEO.octa(), k % 2 ? 0xff9ec7 : 0xffc2dc, x + Math.cos(pa) * 0.07, -0.19, z + Math.sin(pa) * 0.07, { sx: 0.05, sy: 0.11, sz: 0.035, ry: -pa, rz: -0.6, kind: 'fx' }); }
        put(W, GEO.ico(), 0xffd23f, x, -0.2, z, { sx: 0.045, sy: 0.045, sz: 0.045, kind: 'fx' });
      }
    }
    // reeds: a cattail with a couple of long leaves
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const x = px + Math.cos(a) * (rp + 0.1), z = pz + Math.sin(a) * (rp * 0.95);
      if (Math.abs(z - pz) < 1.3) continue;
      const h = 0.7 + rng() * 0.5;
      put(W, GEO.cyl(4), 0x5a9e48, x, -0.3 + h / 2, z, { sx: 0.03, sy: h, sz: 0.03, kind: 'fx' });
      put(W, GEO.cyl(6), 0x7a5236, x, -0.3 + h - 0.1, z, { sx: 0.06, sy: 0.22, sz: 0.06, kind: 'fx' });
      for (let k = 0; k < 2; k++) {
        const la = d() * 6.283, lh = h * (0.6 + d() * 0.3);
        putL(W, GEO.cone(4), k ? 0x6cb352 : 0x4f9444, x + Math.cos(la) * 0.1, -0.3 + lh / 2, z + Math.sin(la) * 0.1, { sx: 0.05, sy: lh, sz: 0.018, ry: -la, rz: -0.2 - d() * 0.25, kind: 'fx' });
      }
    }
    // bridge: a beam on four piles, planks of uneven length, posts with caps, two rails and braces
    const { x0, x1, z } = bridge;
    const L = x1 - x0, cx = (x0 + x1) / 2;
    put(W, GEO.box(), 0x8a5a3c, cx, 0.17, z, { sx: L, sy: 0.12, sz: 1.5 });
    for (let x = x0 + 0.25; x < x1; x += 0.5) {
      const odd = Math.round((x - x0) * 2) % 2;
      block(W, odd ? 0xc08a5c : 0xb27b50, x, 0.26, z + (d() - 0.5) * 0.06, 0.45, 0.075, 1.58 + d() * 0.1, { b: 0.014, tint: footTint(0.94, 1.03) });
    }
    const rx0 = pond.px - pond.rp * 1.2 - 0.2, rx1 = pond.px + pond.rp * 1.2 + 0.2;
    for (const s of [-1, 1]) {
      const nP = Math.max(2, Math.round((rx1 - rx0) / 1.3));
      for (let k = 0; k <= nP; k++) {
        const x = rx0 + ((rx1 - rx0) * k) / nP;
        put(W, GEO.box(), 0x7a4e32, x, 0.65, z + s * 0.8, { sx: 0.14, sy: 0.84, sz: 0.14, tint: footTint(0.82, 1.03) });
        put(W, GEO.cone(4), 0x8a5a3c, x, 1.13, z + s * 0.8, { sx: 0.125, sy: 0.12, sz: 0.125, ry: Math.PI / 4 });
        // a brace up to the rail
        if (k < nP) putL(W, GEO.box(), 0x8a5a3c, x + (rx1 - rx0) / nP / 2, 0.66, z + s * 0.8, { sx: 0.05, sy: 0.05, sz: Math.hypot((rx1 - rx0) / nP, 0.5) - 0.1, ry: Math.PI / 2, rx: (k % 2 ? 1 : -1) * Math.atan2(0.5, (rx1 - rx0) / nP) });
      }
      put(W, GEO.box(), 0xc08a5c, (rx0 + rx1) / 2, 1.0, z + s * 0.8, { sx: rx1 - rx0 + 0.2, sy: 0.1, sz: 0.12 });
      put(W, GEO.box(), 0xb27b50, (rx0 + rx1) / 2, 0.42, z + s * 0.8, { sx: rx1 - rx0, sy: 0.07, sz: 0.07 });
      for (const e of [rx0 + 0.5, rx1 - 0.5]) put(W, GEO.cyl(7), 0x6b4a36, e, -0.2, z + s * 0.62, { sx: 0.11, sy: 0.75, sz: 0.11 });
      W.box(rx0 - 0.1, 0.25, z + s * 0.8 - 0.08, rx1 + 0.1, 1.1, z + s * 0.8 + 0.08, { sound: 'wood' });
    }
    W.box(x0, -0.8, z - 0.8, x1, 0.3, z + 0.8, { sound: 'wood' });
  }

  // flower beds behind little fences (an opening faces the pedestal)
  const beds = [];
  scatterProps(W, 2, (x, z) => {
    if (W.nearCentre(x, z, 3) || W.spawnPath(x, z, 3) || W.walkSd(x, z) > -4.2) return false;
    if (beds.some(b => Math.hypot(b.x - x, b.z - z) < 9)) return false;
    return W.flatAt(x, z, 3.4, 0.01) !== null && !W.blocked(x, z, 3.2, W.floorAt(x, z), 2) && !W.crowded(x, z, 3.5);
  }, (x, z) => {
    const y = W.floorAt(x, z), hx = 2.3, hz = 1.7;
    beds.push({ x, z });
    const open = Math.abs(x) > Math.abs(z) ? (x > 0 ? 'w' : 'e') : (z > 0 ? 'n' : 's');
    // a bed of dark soil with a stone at each corner
    put(W, GEO.box(), 0x9a6a46, x, y + 0.012, z, { sx: hx * 2 - 0.3, sy: 0.03, sz: hz * 2 - 0.3, kind: 'fx' });
    put(W, GEO.box(), 0x7d5236, x, y + 0.016, z, { sx: hx * 2 - 0.9, sy: 0.03, sz: hz * 2 - 0.9, kind: 'fx' });
    const side = (ax, az, bx, bz, gapSide) => {
      // a white picket fence, with a 1.6 m opening in the middle of the open side
      const L = Math.hypot(bx - ax, bz - az);
      const segs = gapSide ? [[0, 0.5 - 0.8 / L], [0.5 + 0.8 / L, 1]] : [[0, 1]];
      for (const [t0, t1] of segs) picketFence(W, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, { y });
    };
    side(x - hx, z - hz, x + hx, z - hz, open === 'n');
    side(x - hx, z + hz, x + hx, z + hz, open === 's');
    side(x - hx, z - hz, x - hx, z + hz, open === 'w');
    side(x + hx, z - hz, x + hx, z + hz, open === 'e');
    W.extraFlowers = W.extraFlowers || [];
    const pal = [T.flowers[Math.floor(rng() * T.flowers.length)], T.flowers[Math.floor(rng() * T.flowers.length)], 0xffffff];
    for (let i = 0; i < 70; i++) {
      const fx = x + (rng() - 0.5) * (hx * 2 - 0.5), fz = z + (rng() - 0.5) * (hz * 2 - 0.5);
      W.extraFlowers.push({ x: fx, y, z: fz, c: pal[i % 3], s: 1.3 + rng() * 0.6 });
    }
    W.obstacles.push({ x, z, r: 0.1 });
  });
  W.noTuft = (x, z) => beds.some(b => Math.abs(b.x - x) < 2.5 && Math.abs(b.z - z) < 1.9);

  // hay bales: a pyramid of three to hop up
  scatterProps(W, Math.round(2 + R * 0.08), (x, z) => !W.nearCentre(x, z, 3.5) && !W.spawnPath(x, z, 2) && W.walkSd(x, z) < -3.5
    && W.flatAt(x, z, 2.2, 0.01) !== null && !W.blocked(x, z, 2.2, W.floorAt(x, z), 3) && !W.crowded(x, z, 2.6), (x, z) => {
    const y = W.floorAt(x, z), r = 0.55, L = 1.3;
    bale(W, x, y, z - r - 0.02, r, L); bale(W, x, y, z + r + 0.02, r, L);
    if (rng() < 0.7) bale(W, x, y + r * 2, z, r, L, true, { loose: false });
    W.obstacles.push({ x, z, r: 0.3 });
  });

  // a cottage at the edge of the island
  scatterProps(W, 1, (x, z) => !W.nearCentre(x, z, 6) && !W.spawnPath(x, z, 3) && W.walkSd(x, z) < -3 && W.walkSd(x, z) > -7
    && W.flatAt(x, z, 2.6, 0.01) !== null && !W.blocked(x, z, 2.6, W.floorAt(x, z), 4) && !W.crowded(x, z, 3), (x, z) => {
    const y = W.floorAt(x, z), ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
    const H = house(W, x, z, ry, { wall: 0xfff1dc, roof: 0xe0604f, door: 0x9a6b4f, chimney: 0xb8705a, shutters: 0x4fa58a, smoke: true, box: [1.45, 3.2], clear: 2.4, y });
    // a flower box under each front window, and stepping stones to the door
    for (const sa of [-1, 1]) {
      const a = sa * 2.8 * 0.3;
      put(W, GEO.box(), 0x8a5a3c, ...H.at(a, 0.8, 1.31), { sx: 0.62, sy: 0.14, sz: 0.2, ry });
      for (let k = 0; k < 4; k++) put(W, GEO.ico(), T.flowers[(k + (sa > 0 ? 1 : 0)) % T.flowers.length], ...H.at(a - 0.22 + k * 0.15, 0.93, 1.33), { sx: 0.07, sy: 0.07, sz: 0.07 });
    }
    for (let k = 0; k < 3; k++) {
      const [sx, sy, sz] = H.at((W.drng() - 0.5) * 0.3, 0.015, 2.05 + k * 0.68);
      if (W.walkSd(sx, sz) < -0.6 && Math.abs((W.floorAt(sx, sz) ?? 99) - y) < 0.01) put(W, GEO.cyl(7), k % 2 ? 0xd9cfbd : 0xc9bea9, sx, sy, sz, { sx: 0.3, sy: 0.04, sz: 0.24, ry: W.drng() * 3, kind: 'fx' });
    }
  });

  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.5)), (x, z) => okTree(W, x, z), (x, z) => tree(W, 'round', x, z, 0.75 + rng() * 0.5));
  // bushes and rocks
  scatterProps(W, Math.round(R * 0.6), (x, z) => okTree(W, x, z, 1.0), (x, z) => {
    const y = W.floorAt(x, z), s = 0.45 + rng() * 0.35;
    bush(W, x, y, z, s, T.leaves[Math.floor(rng() * 4)], rng() * 3);
    // some are in flower
    if (rng() < 0.5) for (let k = 0; k < 3; k++) {
      const c = T.flowers[Math.floor(rng() * T.flowers.length)], fx = x + (rng() - 0.5) * s * 1.6, fy = y + s * (0.7 + rng() * 0.4), fz = z + (rng() - 0.5) * s * 1.6;
      put(W, GEO.ico(), c, fx, fy, fz, { sx: 0.09, sy: 0.09, sz: 0.09 });
      for (let j = 0; j < 2; j++) put(W, GEO.ico(), c, x + (W.drng() - 0.5) * s * 1.8, y + s * (0.5 + W.drng() * 0.6), z + (W.drng() - 0.5) * s * 1.5, { sx: 0.07, sy: 0.07, sz: 0.07 });
    }
    W.obstacles.push({ x, z, r: s + 0.4 });
  });
  scatterProps(W, W.more('rocks', Math.round(R * 0.2)), (x, z) => okTree(W, x, z, 1.0), (x, z) => rock(W, x, z, 0.3 + rng() * 0.4));
  Object.assign(W, SKIES.meadow);
  W.extras.push(() => butterflies(W));
}

function butterflies(W) {
  const { rng, group, updaters, T } = W;
  const n = 14;
  const g = new THREE.BufferGeometry();
  // two wings hinged on the x = 0 axis
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.06, 0.16, 0, -0.1, 0.13, 0, 0.09, 0, 0, -0.06, -0.13, 0, 0.09, -0.16, 0, -0.1], 3));
  g.setAttribute('side', new THREE.Float32BufferAttribute([0, 1, 1, 0, -1, -1], 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const u = { uTime: { value: 0 } };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = 'uniform float uTime; attribute float side;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float flap = sin(uTime * 16.0 + ip.x * 3.0 + ip.z * 2.0) * 0.9;
      float ax = abs(transformed.x);
      transformed.y += ax * sin(flap) * 1.2;
      transformed.x = sign(transformed.x) * ax * cos(flap);`);
  };
  mat.customProgramCacheKey = () => 'vx-butterfly';
  const im = new THREE.InstancedMesh(g, mat, n);
  const cols = [0xffd23f, 0xff8fc7, 0xffffff, 0x9b5de5, 0xff9f43];
  const bs = [];
  for (let i = 0; i < n; i++) {
    const p = W.sample((x, z) => W.walkSd(x, z) < -2 && !W.nearCentre(x, z, 1)) || { x: 6, z: 6 };
    bs.push({ x: p.x, z: p.z, cx: p.x, cz: p.z, ph: rng() * 10, sp: 0.6 + rng() * 0.6, r: 1.5 + rng() * 2.5 });
    im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  im.layers.set(LAYER_OVERLAY);
  im.frustumCulled = false;
  im.userData.fairWeather = true; // hidden in the storm cutscene
  group.add(im);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1.4, 1.4, 1.4), up = new THREE.Vector3(0, 1, 0);
  updaters.push((dt, t) => {
    u.uTime.value = t;
    bs.forEach((b, i) => {
      const a = t * b.sp + b.ph;
      const x = b.cx + Math.cos(a) * b.r + Math.sin(a * 2.3) * 0.4, z = b.cz + Math.sin(a * 1.3) * b.r;
      const y = (W.floorAt(x, z) ?? 0) + 0.7 + Math.sin(a * 3.1) * 0.35 + Math.sin(a * 0.7) * 0.3;
      q.setFromAxisAngle(up, Math.atan2(x - b.x, z - b.z));
      b.x = x; b.z = z;
      im.setMatrixAt(i, m.compose(p.set(x, y, z), q, s));
    });
    im.instanceMatrix.needsUpdate = true;
  });
}

// a mark on the ice at (x, z): a crack that zigzags and forks, or a streak of shine with a shorter one beside it
function iceMark(W, x, z, y, len, ry) {
  const d = W.drng, c = Math.cos(ry), s = Math.sin(ry);
  if (d() < 0.55) {
    let px = x - c * len / 2, pz = z + s * len / 2, a = ry;
    for (let k = 0; k < 3; k++) {
      const l = len / 3, na = ry + (d() - 0.5) * 0.9, ex = px + Math.cos(na) * l, ez = pz - Math.sin(na) * l;
      put(W, GEO.box(), 0xf0fbff, (px + ex) / 2, y, (pz + ez) / 2, { sx: l + 0.03, sy: 0.01, sz: 0.045, ry: na, kind: 'fx' });
      if (k === 1) put(W, GEO.box(), 0xf0fbff, px + Math.cos(na + 0.9) * l * 0.3, y, pz - Math.sin(na + 0.9) * l * 0.3, { sx: l * 0.6, sy: 0.01, sz: 0.035, ry: na + 0.9, kind: 'fx' });
      px = ex; pz = ez; a = na;
    }
  } else {
    put(W, GEO.box(), 0xdff4ff, x, y, z, { sx: len, sy: 0.01, sz: 0.13, ry, kind: 'fx' });
    put(W, GEO.box(), 0xdff4ff, x + s * 0.3 + c * 0.2, y, z + c * 0.3 - s * 0.2, { sx: len * 0.45, sy: 0.01, sz: 0.07, ry, kind: 'fx' });
  }
}

// ---------- frost: an archipelago of snowy islets joined by a frozen lake and ice bridges ----------
function frost(W) {
  const { R, T, seed, rng, clearR } = W;
  const Rm = Math.max(11.5, clearR + 7.5, R * 0.58);
  const main = sdBlob(0, 0, Rm, seed, 0.8);
  const n = R > 26 ? 4 : 3;
  const rs = clamp(R * 0.34, 5.5, 10);
  const sats = [], links = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (2 * Math.PI / (n + 1)) + (rng() - 0.5) * 0.25;
    const D = main.radiusAt(a) + 3.2 + rs;
    const cx = Math.cos(a) * D, cz = Math.sin(a) * D;
    sats.push({ a, cx, cz, sd: sdBlob(cx, cz, rs, seed + 11 + i, 0.9) });
  }
  // the satellite straight ahead is joined by a wide frozen lake, the others by ice bridges
  const mid = sats.reduce((b, s) => (Math.abs(s.a + Math.PI / 2) < Math.abs(b.a + Math.PI / 2) ? s : b), sats[0]);
  for (const s of sats) {
    const dx = Math.cos(s.a), dz = Math.sin(s.a), e = main.radiusAt(s.a);
    if (s === mid) links.push(sdCapsule(dx * (e - 1.5), dz * (e - 1.5), s.cx - dx * (rs - 2), s.cz - dz * (rs - 2), 4.2));
    else links.push(sdCapsule(dx * (e - 1.5), dz * (e - 1.5), s.cx - dx * (rs - 1.5), s.cz - dz * (rs - 1.5), 1.45));
  }
  // a little skating rink on the main island, so the slippery ice shows up early
  let rink = null;
  for (let i = 0; i < 20 && !rink; i++) {
    const a = rng() * Math.PI * 2, rr = 2.6, d = clearR + 2.2 + rr + rng() * 2;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (W.spawnPath(x, z, rr + 0.5) || main(x, z) > -(rr + 2)) continue;
    rink = sdBlob(x, z, rr, seed + 31, 0.6);
  }
  const islands = sdUnion(main, ...sats.map(s => s.sd));
  const ice = rink ? sdUnion(...links, rink) : sdUnion(...links);
  const coast = sdUnion(islands, ...links);
  W.walkSd = coast; W.coastSd = coast;
  W.bound = Math.max(...sats.map(s => Math.hypot(s.cx, s.cz) + rs * 1.15)) + 1;
  W.seaY = -0.85;
  const onIce = (x, z) => (rink && rink(x, z) < 0) || (islands(x, z) > 0.1 && ice(x, z) < 0);
  W.surfaceAt = (x, z) => (onIce(x, z) ? { friction: 0.12, slow: 1, sound: 'ice' } : null);
  W.noBlocks = (x, z) => rink && rink(x, z) < 0.6;
  W.noTuft = (x, z) => onIce(x, z);

  W.ground(islands, { top: T.grass, side: T.cliff, depth: 5, hole: rink, holeDepth: 0 });
  W.ground(ice, { y: -0.05, top: T.ice, side: T.iceSide, depth: 0.9, lip: 0 });
  // cracks and frosty streaks on the ice
  scatterProps(W, 26, (x, z) => ice(x, z) < -0.8 && (islands(x, z) > 0.3 || (rink && rink(x, z) < -0.3)), (x, z) => iceMark(W, x, z, -0.045, 0.8 + rng() * 1.4, rng() * 3));
  // snow lies in little heaps where the ice meets the shore
  for (let i = 0, k = 0; i < 400 && k < 36; i++) {
    const a = W.drng() * 6.283, r = Math.sqrt(W.drng()) * W.bound, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ice(x, z) > -0.1 || islands(x, z) < 0.05 || islands(x, z) > 0.4) continue;
    const ss = 0.3 + W.drng() * 0.35;
    put(W, GEO.dome(), 0xffffff, x, -0.06, z, { sx: ss * 1.3, sy: ss * 0.4, sz: ss, ry: W.drng() * 3, kind: 'fx' });
    k++;
  }

  plateauField(W, Math.round(3 + R * 0.2), { body: 0x9fd4f2, cap: 0xffffff, step: 0xbfe4f8, sound: 'snow' }, (x, z, ext) => islands(x, z) < -(ext + 2.6) && ice(x, z) > ext + 2);
  // igloo on a satellite
  const ig = sats[(sats.indexOf(mid) + 1) % sats.length];
  {
    const p = W.sample((x, z) => ig.sd(x, z) < -3.4 && W.flatAt(x, z, 2.8, 0.01) !== null && !W.blocked(x, z, 2.8, 0, 3), 80);
    if (p) {
      const { x, z } = p, ry = Math.atan2(-x, -z);
      igloo(W, x, z, ry, { R: 2.0, H: 1.6, tunnel: 2.45 });
      // a sledge leaning on it, and a fishing hole with a rod beside the tunnel
      const fx = Math.sin(ry), fz = Math.cos(ry), sx0 = Math.cos(ry), sz0 = -Math.sin(ry);
      for (const e of [-1, 1]) putL(W, GEO.box(), 0x8a5a3c, x + sx0 * 2.2 + fx * (0.4 + e * 0.22), 0.5, z + sz0 * 2.2 + fz * (0.4 + e * 0.22), { sx: 0.06, sy: 1.2, sz: 0.1, ry, rz: 0.35 });
      for (const t of [-0.3, 0.05, 0.4]) putL(W, GEO.box(), 0xb07a50, x + sx0 * (2.2 - t * 0.36) + fx * 0.4, 0.5 + t, z + sz0 * (2.2 - t * 0.36) + fz * 0.4, { sx: 0.05, sy: 0.07, sz: 0.56, ry, rz: 0.35 });
      W.box(x - 1.45, 0, z - 1.45, x + 1.45, 1.4, z + 1.45, { sound: 'snow' });
      W.box(x - 0.9, 1.4, z - 0.9, x + 0.9, 1.65, z + 0.9, { sound: 'snow' });
      W.obstacles.push({ x, z, r: 2.6 }, { x: x + fx * 2, z: z + fz * 2, r: 0.9 });
    }
  }
  // pine forest along the shores
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.95)), (x, z) => islands(x, z) < -1.4 && islands(x, z) > -5 && ice(x, z) > 1.5 && okTree(W, x, z, 1.2),
    (x, z) => tree(W, 'pine', x, z, 0.8 + rng() * 0.55, 0), 10);
  // snow drifts and ice spikes
  scatterProps(W, Math.round(R * 0.6), (x, z) => islands(x, z) < -0.8 && ice(x, z) > 1 && okTree(W, x, z, 0.8), (x, z) => {
    const s = 0.8 + rng() * 1.2, hh = 0.3 + rng() * 0.2, ry = rng() * 3, d = W.drng;
    // a drift: one long mound with a couple of smaller ones riding on it
    put(W, GEO.dome(), 0xfafcff, x, -0.05, z, { sx: s * 1.4, sy: hh, sz: s, ry, kind: 'solid' });
    for (let k = 0; k < 2; k++) {
      const a = d() * 6.283, ss = s * (0.4 + d() * 0.25);
      put(W, GEO.dome(), k ? 0xffffff : 0xf0f6ff, x + Math.cos(a) * s * 0.6, -0.04, z + Math.sin(a) * s * 0.5, { sx: ss * 1.3, sy: hh * (0.7 + d() * 0.5), sz: ss, ry: d() * 3 });
    }
    W.obstacles.push({ x, z, r: s + 0.3 });
  });
  scatterProps(W, W.more('rocks', Math.round(R * 0.3)), (x, z) => islands(x, z) < -1 && ice(x, z) > 1 && okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.5 + rng() * 0.6, 0, 'ice'));
  // ice floes drifting on the dark water
  scatterProps(W, 30, (x, z) => coast(x, z) > 2 && coast(x, z) < 16, (x, z) => {
    const s = 0.6 + rng() * 1.6, sq = 0.6 + rng() * 0.5, ry = rng() * 3, d = W.drng;
    // a floe: a slab of ice with a paler rim under a cap of snow; a penguin or two stand on the bigger ones
    put(W, GEO.cyl(d() < 0.5 ? 6 : 7), 0xbfe4fa, x, W.seaY + 0.05, z, { sx: s, sy: 0.16, sz: s * sq, ry, kind: 'fx' });
    put(W, GEO.cyl(6), 0xf8fcff, x, W.seaY + 0.14, z, { sx: s * 0.86, sy: 0.06, sz: s * sq * 0.86, ry: ry + 0.2, kind: 'fx' });
    if (s > 1.5 && d() < 0.55) for (let k = 0; k < 1 + (d() < 0.4 ? 1 : 0); k++) penguin(W, x + (d() - 0.5) * s * 0.7, W.seaY + 0.17, z + (d() - 0.5) * s * sq * 0.7, Math.atan2(-x, -z) + (d() - 0.5), 0.9 + d() * 0.3);
  }, 4);
  Object.assign(W, SKIES.frost);
}

// ---------- reef: a sandy crescent around a shallow lagoon, piers and sea stacks ----------
function reef(W) {
  const { R, T, seed, rng, clearR } = W;
  const isl = sdBlob(0, 0, R, seed, 0.8);
  W.radiusAt = isl.radiusAt;
  const b = clamp((R - 2.2 - clearR - 2.5) / 2, 4, 9.5);
  const dL = clearR + 2.5 + b;
  const a = Math.min(b * 1.55, Math.sqrt(Math.max(0, (R * 0.88 - 2.4) ** 2 - dL ** 2)) * 1.05, R * 0.75);
  const lag = sdEllipse(0, -dL, Math.max(a, b * 0.9), b);
  const DEPTH = 0.5;
  W.walkSd = isl; W.coastSd = isl;
  W.floorAt = (x, z) => { const l = lag(x, z); return l < 0 ? -DEPTH * smooth(Math.min(1, -l / 2.2)) : 0; };
  W.surfaceAt = (x, z, y) => {
    const f = W.floorAt(x, z);
    return f < -0.12 && y < f + 0.1 ? { friction: 0.8, slow: 0.68, sound: 'water', splash: true } : null;
  };
  W.topSound = 'wood';
  W.ground(isl, { top: T.grass, side: T.cliff, hole: lag, holeDepth: 0 });
  // lagoon bed: a small heightfield coloured from wet sand to turquoise
  {
    const A = Math.max(a, b * 0.9) + 1, x0 = -A, x1 = A, z0 = -dL - b - 1, z1 = -dL + b + 1, st = 0.5;
    const nx = Math.ceil((x1 - x0) / st), nz = Math.ceil((z1 - z0) / st);
    const pos = [], col = [], idx = [];
    const c0 = new THREE.Color(0xe9c98a), c1 = new THREE.Color(T.lagoonDeep), c = new THREE.Color();
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * st, z = z0 + j * st;
      const l = lag(x, z);
      const y = l < 0 ? W.floorAt(x, z) : -0.03;
      pos.push(x, y, z);
      c.copy(c0).lerp(c1, clamp(-y / DEPTH, 0, 1) * 0.75);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * (nx + 1) + i;
      idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const bed = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true }));
    bed.receiveShadow = true;
    W.group.add(bed);
    W.blockers.push(bed);
    const wl = contours((x, z) => lag(x, z) + 0.05, x0, z0, x1, z1, 0.4);
    const water = new THREE.Mesh(topGeometry(wl, -0.12), toon(T.lagoon, { transparent: true, opacity: 0.6, depthWrite: false }));
    water.layers.set(LAYER_FX);
    water.renderOrder = 2;
    W.group.add(water);
    W.updaters.push((dt, t) => { water.material.opacity = 0.58 + Math.sin(t * 0.9) * 0.05; });
  }
  // piers: plank walkways into the lagoon with a wide end to stand on
  const pier = (x0, z0, x1, z1, end) => {
    const y = 0.32, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), w = 1.8;
    const d = W.drng;
    put(W, GEO.box(), 0x9a6a46, cx, y - 0.1, cz, { sx: alongX ? L : w, sy: 0.2, sz: alongX ? w : L });
    // planks of uneven length, a touch askew; piles with a rope band round their heads
    for (let t = 0.2; t < L; t += 0.55) {
      const px = alongX ? Math.min(x0, x1) + t : cx, pz = alongX ? cz : Math.min(z0, z1) + t, len = w + 0.06 + d() * 0.14, skew = (d() - 0.5) * 0.04;
      put(W, GEO.box(), Math.round(t / 0.55) % 2 ? 0xc89466 : d() < 0.2 ? 0xa97549 : 0xb98257, px, y + 0.01, pz, { sx: alongX ? 0.46 : len, sy: 0.04, sz: alongX ? len : 0.46, ry: skew });
    }
    for (let t = 0.6; t < L; t += 1.6) for (const s of [-1, 1]) {
      const px = alongX ? Math.min(x0, x1) + t : cx + s * (w / 2 + 0.05), pz = alongX ? cz + s * (w / 2 + 0.05) : Math.min(z0, z1) + t;
      put(W, GEO.taper(7, 0.85), 0x7a5236, px, y - 0.4, pz, { sx: 0.14, sy: 1.1, sz: 0.14, tint: footTint(0.7, 1.05) });
      put(W, GEO.cyl(7), 0xd9c49a, px, y + 0.05, pz, { sx: 0.14, sy: 0.06, sz: 0.14 });
    }
    W.box(Math.min(x0, x1) - (alongX ? 0 : w / 2), -0.8, Math.min(z0, z1) - (alongX ? w / 2 : 0), Math.max(x0, x1) + (alongX ? 0 : w / 2), y, Math.max(z0, z1) + (alongX ? w / 2 : 0), { sound: 'wood' });
    if (end) {
      const [ex, ez] = end, hw = 2.1, hd = 1.6;
      put(W, GEO.box(), 0x9a6a46, ex, y - 0.1, ez, { sx: hw * 2, sy: 0.2, sz: hd * 2 });
      put(W, GEO.box(), 0xc89466, ex, y + 0.01, ez, { sx: hw * 2 + 0.1, sy: 0.04, sz: hd * 2 + 0.1 });
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        put(W, GEO.taper(7, 0.85), 0x7a5236, ex + sx * hw, y - 0.1, ez + sz * hd, { sx: 0.16, sy: 1.6, sz: 0.16, tint: footTint(0.7, 1.05) });
        put(W, GEO.cyl(7), 0xffffff, ex + sx * hw, y + 0.6, ez + sz * hd, { sx: 0.15, sy: 0.12, sz: 0.15 });
        put(W, GEO.cyl(7), 0xd9c49a, ex + sx * hw, y + 0.42, ez + sz * hd, { sx: 0.155, sy: 0.07, sz: 0.155 });
      }
      // a rope slung between the posts on the lagoon side, a coil of rope, and a rowing boat tied up alongside
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4, sag = Math.sin(t * Math.PI) * 0.16;
        putL(W, GEO.cyl(5), 0xd9c49a, ex + sx * hw, y + 0.5 - sag, ez - hd + t * hd * 2, { sx: 0.022, sy: hd / 2 + 0.03, sz: 0.022, rx: Math.PI / 2 + (0.5 - t) * 0.5 });
      }
      for (let k = 0; k < 3; k++) put(W, GEO.cyl(10), k % 2 ? 0xc9b48a : 0xd9c49a, ex + hw * 0.55, y + 0.05 + k * 0.045, ez + hd * 0.5, { sx: 0.22 - k * 0.03, sy: 0.045, sz: 0.22 - k * 0.03 });
      rowboat(W, new THREE.Matrix4().compose(new THREE.Vector3(ex - hw - 0.75, -0.2, ez - 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, Math.PI / 2 + 0.15, 0.03, 'YXZ')), new THREE.Vector3(1, 1, 1)), { paint: 0x4cc9f0 });
      W.box(ex - hw, -0.8, ez - hd, ex + hw, y, ez + hd, { top: true, sound: 'wood' });
      W.box(ex + hw - 0.15, y, ez + hd - 0.15, ex + hw + 0.15, y + 0.75, ez + hd + 0.15);
      W.box(ex - hw - 0.15, y, ez - hd - 0.15, ex - hw + 0.15, y + 0.75, ez - hd + 0.15);
      W.box(ex + hw - 0.15, y, ez - hd - 0.15, ex + hw + 0.15, y + 0.75, ez - hd + 0.15);
      W.box(ex - hw - 0.15, y, ez + hd - 0.15, ex - hw + 0.15, y + 0.75, ez + hd + 0.15);
    }
  };
  const A = Math.max(a, b * 0.9);
  const pxA = -A * 0.42, zS = -dL + b * Math.sqrt(1 - (pxA / A) ** 2);
  pier(pxA, zS + 1.4, pxA, -dL - b * 0.25, [pxA, -dL - b * 0.25 - 1.6]);
  const pzB = -dL + b * 0.3, xE = A * Math.sqrt(1 - (0.3) ** 2);
  if (isl(xE + 1.6, pzB) < -1.2) pier(xE + 1.6, pzB, A * 0.2, pzB, null);
  // a sea stack in the lagoon with stepping stones up
  {
    const sx = A * 0.38, sz = -dL - b * 0.35, base = W.floorAt(sx, sz);
    tower(W, sx, sz, 2.2, 2.2, 3.1, base, -0.2, 1, 2, { body: 0xc98a5e, cap: 0x9edb6a, step: 0xd8a070, sound: 'stone' });
    W.obstacles.push({ x: sx, z: sz, r: 3.4 });
  }
  W.noTuft = (x, z) => lag(x, z) < 0.4;
  plateauField(W, Math.round(2 + R * 0.12), { body: 0xe3b27a, cap: 0xf3d9a4, step: 0xeec48c, sound: 'stone' }, (x, z, ext) => lag(x, z) > ext + 2.5);
  // palms along the beach, umbrellas, shells and starfish
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.6)), (x, z) => isl(x, z) < -1.8 && lag(x, z) > 1.6 && okTree(W, x, z, 1.6), (x, z) => tree(W, 'palm', x, z, 0.85 + rng() * 0.45, 0), 10);
  scatterProps(W, 3, (x, z) => lag(x, z) > 2.5 && okTree(W, x, z, 3), (x, z) => {
    const cols = [[0xff6b6b, 0xffffff], [0x4cc9f0, 0xffffff], [0xffd23f, 0xff8fc7]][Math.floor(rng() * 3)], d = W.drng;
    parasol(W, x, 0, z, cols, d() * 3);
    // a striped towel, a beach ball, a bucket and a sandcastle in its shade
    const tr = rng(), tc = Math.cos(tr), ts = Math.sin(tr);
    put(W, GEO.box(), cols[0], x + 0.9, 0.03, z + 0.3, { sx: 0.8, sy: 0.04, sz: 1.6, ry: tr, kind: 'fx' });
    for (const t of [-0.5, 0, 0.5]) put(W, GEO.box(), cols[1], x + 0.9 + ts * t, 0.035, z + 0.3 + tc * t, { sx: 0.8, sy: 0.04, sz: 0.16, ry: tr, kind: 'fx' });
    put(W, GEO.blob(), 0xffffff, x - 0.7, 0.2, z + 0.75, { sx: 0.2, sy: 0.2, sz: 0.2 });
    for (let k = 0; k < 3; k++) put(W, GEO.blob(), [cols[0], 0xffd23f, 0x4cc9f0][k], x - 0.7, 0.2, z + 0.75, { sx: 0.205, sy: 0.205, sz: 0.07, ry: k * 1.05 });
    put(W, GEO.taper(8, 1.3), 0x4cc9f0, x - 0.2, 0.11, z - 0.85, { sx: 0.1, sy: 0.2, sz: 0.1 });
    sandcastle(W, x - 0.85, 0, z - 0.45, 1, mix(T.grass, 0xffffff, 0.1));
    W.box(x - 0.12, 0, z - 0.12, x + 0.12, 2.2, z + 0.12);
    W.obstacles.push({ x, z, r: 1.6 });
  });
  scatterProps(W, Math.round(R * 1.6), (x, z) => isl(x, z) < -1 && lag(x, z) > 0.2 && !W.nearCentre(x, z, 0) && !W.crowded(x, z, 0.4), (x, z) => {
    if (rng() < 0.5) {
      // a scallop shell: a low fan with ribs
      const c = [0xffd6e0, 0xfff1e0, 0xffc9a8][Math.floor(rng() * 3)], ry = rng() * 3;
      put(W, GEO.dome(), c, x, 0, z, { sx: 0.16, sy: 0.08, sz: 0.13, ry, kind: 'fx' });
      for (let k = -1; k <= 1; k++) putL(W, GEO.box(), shade(c, 0.86), x, 0.05, z, { sx: 0.012, sy: 0.05, sz: 0.24, ry: ry + k * 0.5, kind: 'fx' });
    } else {
      const c = [0xff7a6b, 0xffa94d, 0xff8fc7][Math.floor(rng() * 3)], ry = rng() * 3;
      starfish(W, x, 0.005, z, c, ry);
    }
  }, 3);
  // coral and seaweed on the lagoon floor
  scatterProps(W, W.more('rocks', Math.round(b * 2.2)), (x, z) => lag(x, z) < -2.4 && !W.blocked(x, z, 0.8, -0.6, 2) && !W.crowded(x, z, 0.8), (x, z) => rock(W, x, z, 0.22 + rng() * 0.18, W.floorAt(x, z), 'coral', false));
  // tall sea stacks out in the sea
  scatterProps(W, 7, (x, z) => isl(x, z) > 5 && isl(x, z) < 22, (x, z) => {
    let y = W.seaY - 0.5, s = 1.6 + rng() * 1.4;
    const h = 4 + rng() * 6;
    const cols = [0xc98a5e, 0xd8a070, 0xb87a52];
    for (let k = 0; y < h; k++) {
      const hh = 1.2 + rng() * 1.2;
      // each layer a dressed block of rock, a ledge where one sits on the next
      block(W, cols[k % 3], x + (rng() - 0.5) * 0.4, y + hh / 2, z + (rng() - 0.5) * 0.4, s, hh, s * 0.9, { b: 0.12, ry: rng(), tint: footTint(0.86, 1.04) });
      y += hh; s *= 0.88;
    }
    block(W, 0x9edb6a, x, y + 0.12, z, s * 1.1, 0.25, s, { b: 0.06, ry: rng() });
    for (let k = 0; k < 3; k++) { const a = W.drng() * 6.283; put(W, GEO.rock(), cols[k % 3], x + Math.cos(a) * s * 1.1, W.seaY + 0.05, z + Math.sin(a) * s * 1.1, { sx: 0.5, sy: 0.35, sz: 0.42, ry: a }); }
    if (rng() < 0.5) { tree(W, 'palm', x, z, 0.6, y + 0.2); W.colliders.pop(); W.obstacles.pop(); }
  }, 6);
  Object.assign(W, SKIES.reef);
}

// ---------- starfall: floating islets over a sea of clouds, low gravity and jump pads ----------
const STAR_G = 0.6;
function launchVel(from, to, extra = 1.6, gScale = STAR_G) {
  const g = GRAVITY * gScale;
  const apex = Math.max(from.y, to.y) + extra;
  const vy = Math.sqrt(2 * g * (apex - from.y));
  const T = vy / g + Math.sqrt(2 * (apex - to.y) / g);
  return { vel: new THREE.Vector3((to.x - from.x) / T, vy, (to.z - from.z) / T), t: T };
}
function starfall(W) {
  const { R, T, seed, rng, clearR } = W;
  const Rm = Math.max(11.5, clearR + 7.5, R * 0.62);
  const main = sdBlob(0, 0, Rm, seed, 0.9);
  W.walkSd = main; W.coastSd = main; W.radiusAt = main.radiusAt;
  W.hasSea = false; W.voidY = -7; W.gravityScale = STAR_G;
  W.floorAt = (x, z) => (main(x, z) < 0.05 ? 0 : null);
  W.topSound = 'crystal';
  W.ground(main, { top: T.grass, side: T.cliff, depth: 3.2, taper: 1.0, jag: 0.5 });
  put(W, GEO.cone(10), T.dirt, 0, -3.15 - Rm * 0.6, 0, { sx: Rm - 1.1, sy: Rm * 1.2, sz: Rm - 1.1, rx: Math.PI });
  put(W, GEO.cone(7), T.cliff, Rm * 0.3, -3.15 - Rm * 0.35, -Rm * 0.2, { sx: Rm * 0.45, sy: Rm * 0.8, sz: Rm * 0.45, rx: Math.PI });
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = rng() * Rm * 0.6, h = 1.5 + rng() * 2.5;
    put(W, GEO.octa(), T.leaves[i % 3], Math.cos(a) * r, -3.4 - Rm * 0.2 * rng() - h * 0.5, Math.sin(a) * r, { sx: 0.4, sy: h, sz: 0.4, kind: 'glow' });
  }
  const islets = [];
  const fits = (x, z, r) => !islets.some(s => Math.hypot(s.x - x, s.z - z) < s.r + r + 1.4) && main(x, z) > r + 0.6;
  const islet = (x, z, r, top, deco = true) => {
    const cap = [T.cap, 0x9be0c0, 0x7fd0b0][islets.length % 3];
    put(W, GEO.cyl(8), cap, x, top - 0.17, z, { sx: r, sy: 0.34, sz: r, ry: Math.PI / 8 });
    put(W, GEO.cyl(8), T.cliff, x, top - 0.8, z, { sx: r * 0.93, sy: 0.95, sz: r * 0.93, ry: Math.PI / 8 });
    put(W, GEO.cone(8), T.dirt, x, top - 1.27 - r * 0.7, z, { sx: r * 0.93, sy: r * 1.4, sz: r * 0.93, rx: Math.PI, ry: Math.PI / 8 });
    if (deco) put(W, GEO.octa(), T.leaves[islets.length % 3], x + r * 0.3, top - 1.6 - r * 0.9, z - r * 0.2, { sx: 0.28, sy: 0.9, sz: 0.28, kind: 'glow' });
    for (const [hx, hz] of [[0.92, 0.38], [0.38, 0.92]]) W.box(x - hx * r, top - 1.3, z - hz * r, x + hx * r, top, z + hz * r, { sound: 'crystal' });
    W.box(x - 0.68 * r, top - 1.3, z - 0.68 * r, x + 0.68 * r, top, z + 0.68 * r, { top: true, sound: 'crystal' });
    islets.push({ x, z, r, top });
  };
  // chains of islets that climb away from the main island (each hop is an easy floaty jump)
  const nC = R > 24 ? 3 : 2;
  for (let k = 0; k < nC; k++) {
    const a = -Math.PI / 2 + (k - (nC - 1) / 2) * (nC === 3 ? 1.45 : 1.6) + (rng() - 0.5) * 0.2;
    const r1 = 2.6 + rng() * 0.5, d1 = main.radiusAt(a) + 0.8 + r1;
    let x = Math.cos(a) * d1, z = Math.sin(a) * d1, top = 1.35 + rng() * 0.2, r = r1;
    if (!fits(x, z, r1)) continue;
    islet(x, z, r1, top);
    const hops = R > 26 ? 2 : 1;
    let a2 = a;
    for (let h = 0; h < hops; h++) {
      a2 += (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.2);
      const r2 = 2.3 + rng() * 0.4;
      const nx = x + Math.cos(a2) * (r + 1.0 + r2), nz = z + Math.sin(a2) * (r + 1.0 + r2);
      if (!fits(nx, nz, r2)) break;
      top += 1.25 + rng() * 0.2;
      islet(nx, nz, r2, top);
      x = nx; z = nz; r = r2;
    }
  }
  // jump pads on the main island fling you up to the high islets (and back)
  const pad = (x, y, z, to) => {
    const { vel, t } = launchVel({ x, y, z }, to);
    W.pads.push({ x, y, z, r: 0.85, vel, t });
    put(W, GEO.cyl(14), 0x3a2f6a, x, y + 0.03, z, { sx: 1.05, sy: 0.06, sz: 1.05 });
    put(W, GEO.cyl(14), 0xff7ae0, x, y + 0.06, z, { sx: 0.8, sy: 0.08, sz: 0.8, kind: 'glow' });
    W.obstacles.push({ x, z, r: 1.5 });
    padRings.push({ x, y, z });
  };
  const padRings = [];
  for (const s of [-1, 1]) {
    const a = Math.PI / 2 + s * (1.1 + rng() * 0.15);
    const e = main.radiusAt(a), rH = 3.1;
    const px = Math.cos(a) * (e - 2.6), pz = Math.sin(a) * (e - 2.6);
    const hx = Math.cos(a) * (e + 2.6 + rH), hz = Math.sin(a) * (e + 2.6 + rH);
    if (!fits(hx, hz, rH)) continue;
    const top = 4.5 + rng() * 0.7;
    islet(hx, hz, rH, top);
    pad(px, 0, pz, { x: hx, y: top, z: hz });
    const bx = hx - Math.cos(a) * rH * 0.45, bz = hz - Math.sin(a) * rH * 0.45;
    pad(bx, top, bz, { x: Math.cos(a) * (e - 6), y: 0, z: Math.sin(a) * (e - 6) });
  }
  W.bound = Math.max(Rm * 1.15, ...islets.map(s => Math.hypot(s.x, s.z) + s.r)) + 1;

  // glowing pulse rings over each pad
  W.extras = [() => {
    const ringGeo = new THREE.RingGeometry(0.55, 0.8, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb3f0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(ringGeo, mat, padRings.length * 2);
    im.layers.set(LAYER_OVERLAY);
    glows(im);
    im.frustumCulled = false;
    W.group.add(im);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    W.updaters.push((dt, t) => {
      padRings.forEach((r, i) => {
        for (let k = 0; k < 2; k++) {
          const f = (t * 0.8 + k * 0.5 + i * 0.17) % 1;
          im.setMatrixAt(i * 2 + k, m.compose(p.set(r.x, r.y + 0.1 + f * 1.4, r.z), q, s.setScalar(1 + f * 0.5)));
        }
      });
      im.instanceMatrix.needsUpdate = true;
      mat.opacity = 0.55 + Math.sin(t * 5) * 0.2;
    });
  }];

  plateauField(W, Math.round(1 + R * 0.08), { body: 0x7a6bb0, cap: T.cap, step: 0x8a7bc0, sound: 'crystal' });
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.55)), (x, z) => okTree(W, x, z, 1.4), (x, z) => tree(W, 'crystal', x, z, 0.8 + rng() * 0.6, 0));
  // tall crystal spires at the rim
  scatterProps(W, 3, (x, z) => main(x, z) < -1.2 && main(x, z) > -3.5 && okTree(W, x, z, 1.2), (x, z) => {
    const c = T.leaves[Math.floor(rng() * 3)], h = 4 + rng() * 3;
    put(W, GEO.octa(), c, x, h * 0.5, z, { sx: 0.7, sy: h * 0.75, sz: 0.7, ry: rng() * 3, kind: 'glow' });
    put(W, GEO.octa(), c, x + 0.7, h * 0.3, z + 0.3, { sx: 0.4, sy: h * 0.4, sz: 0.4, rz: 0.3, kind: 'glow' });
    W.box(x - 0.6, 0, z - 0.6, x + 0.6, h, z + 0.6, { sound: 'crystal' });
    W.obstacles.push({ x, z, r: 1.4 });
  }, 12);
  scatterProps(W, W.more('rocks', Math.round(R * 0.25)), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.3 + rng() * 0.4, 0));
  // distant floating rocks for depth
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, d = W.bound + 10 + rng() * 45, r = 1 + rng() * 3.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = -14 + rng() * 30;
    put(W, GEO.cyl(7), T.cap, x, y, z, { sx: r, sy: 0.4, sz: r });
    put(W, GEO.cone(7), T.dirt, x, y - 0.2 - r * 0.75, z, { sx: r * 0.9, sy: r * 1.5, sz: r * 0.9, rx: Math.PI });
    if (rng() < 0.5) put(W, GEO.octa(), T.leaves[i % 3], x, y + 0.8, z, { sx: 0.35, sy: 1.2, sz: 0.35, kind: 'glow' });
  }
  Object.assign(W, SKIES.starfall);
}

// ---------- storm: a windswept cliff-top plateau with ruins, under a swirling vortex ----------
function storm(W) {
  const { R, T, seed, rng, clearR, spawnZ } = W;
  const isl = sdBlob(0, 0, R, seed, 1.6);
  W.walkSd = isl; W.radiusAt = isl.radiusAt;
  W.seaY = -9;
  W.windDir = rng() * Math.PI * 2;
  W.ground(isl, { top: T.grass, side: T.cliff, depth: 18, jag: 0.9, taper: -0.6 });
  W.surfaceAt = null;
  const ruin = { body: T.stone, cap: T.moss, step: T.stoneDark, lines: T.stoneDark, sound: 'stone' };

  // a gate arch over the path from where you start
  // as far ahead as the figure's footprint allows, so it frames the view from the start
  let gz = spawnZ - 5.5;
  while (gz < spawnZ - 1.6 && Math.hypot(3, gz) <= clearR + 2.2) gz += 0.5;
  if (Math.hypot(3, gz) > clearR + 2.2) {
    const st = { stone: T.stone, dark: T.stoneDark, moss: T.moss };
    for (const s of [-1, 1]) {
      column(W, s * 3.0, gz, 0.9, 4.08, st);
      W.box(s * 3.0 - 0.6, 0, gz - 0.6, s * 3.0 + 0.6, 4.1, gz + 0.6);
    }
    lintel(W, -3.7, gz, 3.7, gz, 4.45, 0.75, 1.2, st);
    W.box(-3.7, 4.05, gz - 0.6, 3.7, 4.85, gz + 0.6);
    W.obstacles.push({ x: -3, z: gz, r: 1 }, { x: 3, z: gz, r: 1 });
  }
  // a broken colonnade around the pedestal: low stumps can be hopped onto
  const rr = clearR + 4.4;
  if (rr < R - 4) {
    const n = Math.max(8, Math.round((2 * Math.PI * rr) / 3.4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (W.spawnPath(x, z, 0.8) || rng() < 0.25 || W.blocked(x, z, 0.8, 0, 3)) continue;
      const roll = rng();
      const h = roll < 0.35 ? 0.5 : roll < 0.6 ? 1.05 : 2.4 + rng() * 2.2;
      // a whole column keeps its capital; a stump ends in a broken course with a loose stone on it
      column(W, x, z, 0.95, h > 2 ? h + 0.24 : h, { stone: T.stone, dark: T.stoneDark, moss: T.moss, whole: h > 2, plinth: 0.24 });
      if (h > 2) {
        W.box(x - 0.62, 0, z - 0.62, x + 0.62, h + 0.24, z + 0.62);
      } else {
        block(W, T.stone, x + 0.1, h + 0.12, z - 0.1, 0.6, 0.24, 0.5, { b: 0.04, ry: rng(), tint: capTint(T.moss, 0.6, 0.95) });
        const ra = W.drng() * 6.283;
        put(W, GEO.rock(), T.stoneDark, x + Math.cos(ra) * 0.95, 0.12, z + Math.sin(ra) * 0.95, { sx: 0.3, sy: 0.2, sz: 0.24, ry: ra });
        W.box(x - 0.62, 0, z - 0.62, x + 0.62, h, z + 0.62, { top: h > 0.9, sound: 'stone' });
      }
      W.obstacles.push({ x, z, r: 0.9 });
    }
  }
  // climbable arches: two pillars and a lintel, with a stump to hop up from
  const arches = [];
  scatterProps(W, Math.round(1 + R * 0.06), (x, z) => !W.nearCentre(x, z, 6) && !W.spawnPath(x, z, 4) && isl(x, z) < -5 && !W.blocked(x, z, 3.4, 0, 3) && !W.crowded(x, z, 3.6)
    && !arches.some(p => Math.hypot(p.x - x, p.z - z) < 10), (x, z) => {
    arches.push({ x, z });
    const alongX = rng() < 0.5, ph = 1.75, L = 4.4;
    const ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
    const st = { stone: T.stone, dark: T.stoneDark, moss: T.moss };
    for (const s of [-1, 1]) {
      const px = x + ax * s * 1.7, pz = z + az * s * 1.7;
      column(W, px, pz, 0.9, ph, { ...st, whole: false, plinth: 0.22 });
      W.box(px - 0.45, 0, pz - 0.45, px + 0.45, ph, pz + 0.45);
    }
    lintel(W, x - ax * L / 2, z - az * L / 2, x + ax * L / 2, z + az * L / 2, ph + 0.2, 0.4, 1.0, st);
    W.box(x - (alongX ? L / 2 : 0.5), ph, z - (alongX ? 0.5 : L / 2), x + (alongX ? L / 2 : 0.5), ph + 0.42, z + (alongX ? 0.5 : L / 2), { top: true, sound: 'stone' });
    // the stump sits off one end of the lintel
    const sx = x + ax * (L / 2 + 0.8), sz = z + az * (L / 2 + 0.8);
    block(W, T.stoneDark, sx, 0.55, sz, 1.1, 1.1, 1.1, { b: 0.07, tint: capTint(T.moss, 0.6, 0.86) });
    W.box(sx - 0.55, 0, sz - 0.55, sx + 0.55, 1.1, sz + 0.55, { top: true, sound: 'stone' });
    W.obstacles.push({ x, z, r: 0.6 }, { x: sx, z: sz, r: 0.8 });
  });
  plateauField(W, Math.round(3 + R * 0.17), ruin);
  // fallen columns
  scatterProps(W, Math.round(R * 0.1), (x, z) => okTree(W, x, z, 2.5) && !W.blocked(x, z, 2, 0, 2), (x, z) => {
    const alongX = rng() < 0.5, L = 2.6;
    // three drums lying end to end, a little apart and each turned its own way, with a band where two meet
    const d = W.drng, turn = { rx: alongX ? 0 : Math.PI / 2, rz: alongX ? Math.PI / 2 : 0 };
    for (let k = 0; k < 3; k++) {
      const t = (k - 1) * (L / 3 + 0.02), dl = L / 3 - 0.03 - (k === 2 ? 0.18 : 0), o = (d() - 0.5) * 0.05;
      put(W, GEO.cyl(10), k % 2 ? shade(T.stone, 0.94) : T.stone, x + (alongX ? t - (k === 2 ? 0.09 : 0) : o), 0.42, z + (alongX ? o : t - (k === 2 ? 0.09 : 0)), { sx: 0.42, sy: dl, sz: 0.42, ...turn, tint: capTint(T.moss, 0.72, 0.9) });
      if (k < 2) put(W, GEO.cyl(10), T.stoneDark, x + (alongX ? t + L / 6 : 0), 0.42, z + (alongX ? 0 : t + L / 6), { sx: 0.45, sy: 0.07, sz: 0.45, ...turn });
    }
    put(W, GEO.rock(), T.stone, x + (alongX ? L / 2 + 0.25 : 0.2), 0.14, z + (alongX ? 0.2 : L / 2 + 0.25), { sx: 0.3, sy: 0.2, sz: 0.26, ry: d() * 6, tint: capTint(T.moss, 0.6, 0.9) });
    W.box(x - (alongX ? L / 2 : 0.42), 0, z - (alongX ? 0.42 : L / 2), x + (alongX ? L / 2 : 0.42), 0.84, z + (alongX ? 0.42 : L / 2), { sound: 'stone' });
    W.obstacles.push({ x, z, r: 1.6 });
  });
  // worn flagstones around the pedestal
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = clearR + 0.5 + rng() * 5.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isl(x, z) > -1 || W.blocked(x, z, 0.4, 0, 1)) continue;
    put(W, GEO.box(), rng() < 0.5 ? 0x6a6a78 : 0x5c5c6a, x, 0.015, z, { sx: 0.45 + rng() * 0.4, sy: 0.04, sz: 0.4 + rng() * 0.3, ry: rng() * 0.4, kind: 'fx' });
  }
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.3)), (x, z) => okTree(W, x, z), (x, z) => tree(W, 'bent', x, z, 0.7 + rng() * 0.4, 0));
  scatterProps(W, W.more('rocks', Math.round(R * 0.45)), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.35 + rng() * 0.5, 0));
  // jagged rocks rising from the sea
  scatterProps(W, 9, (x, z) => isl(x, z) > 4 && isl(x, z) < 30, (x, z) => {
    const h = 6 + rng() * 9, s = 1.5 + rng() * 2;
    put(W, GEO.cone(5), T.cliff, x, W.seaY + h / 2, z, { sx: s, sy: h, sz: s, ry: rng() * 3, rz: (rng() - 0.5) * 0.2 });
  }, 6);

  // wind gusts: every so often a gentle push, with leaves and rain blowing sideways
  W.tuftScale = 1.3; W.sway = 1.8;
  gusts(W, { first: 5 + rng() * 3, len: 3.0, peak: 1.1 });
  Object.assign(W, SKIES.storm);
  W.extras.push(() => leaves(W));
}

// every so often a gust of `len` seconds pushes the player (peak in m/s), from around W.windDir
function gusts(W, { first = 5, len = 3, peak = 1.1, calm = [8, 6] }) {
  W.wind = new THREE.Vector3();
  let wait = first, gust = 0, dir = W.windDir;
  W.updaters.push((dt, t, cam, api) => {
    if (gust > 0) {
      gust -= dt;
      const k = Math.sin(Math.PI * clamp(1 - gust / len, 0, 1));
      W.wind.set(Math.cos(dir) * k * peak, 0, Math.sin(dir) * k * peak);
      if (gust <= 0) { W.wind.set(0, 0, 0); wait = calm[0] + Math.random() * calm[1]; }
    } else if ((wait -= dt) <= 0) {
      gust = len;
      dir = W.windDir + (Math.random() - 0.5) * 1.4;
      api.onGust?.(dir);
    }
  });
}

// a bounce pad on the ground at (x, y, z) that throws the player onto `to`; draw(x, y, z) adds its look
function bouncePad(W, x, y, z, to, gScale, draw) {
  const { vel, t } = launchVel({ x, y, z }, to, 1.6, gScale);
  W.pads.push({ x, y, z, r: 0.85, vel, t });
  draw(x, y, z);
  W.obstacles.push({ x, z, r: 1.5 });
}

function leaves(W) {
  const n = 80, span = 30;
  const pos = new Float32Array(n * 3), seeds = new Float32Array(n), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos.set([(W.rng() - 0.5) * span, W.rng() * 5, (W.rng() - 0.5) * span], i * 3);
    seeds[i] = W.rng() * 100;
    c.setHex([0x6fa58a, 0x9bc46a, 0xc9a35a, 0x4c9a7a][i % 4]);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pm = new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(g, pm);
  pts.layers.set(LAYER_OVERLAY);
  pts.frustumCulled = false;
  W.group.add(pts);
  W.updaters.push((dt, t, cam) => {
    if (!cam) return;
    const wl = W.wind.length();
    pm.opacity = Math.min(1, wl * 1.2);
    if (wl < 0.02) return;
    const a = g.attributes.position.array, h = span / 2;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      let x = a[i * 3] + (W.wind.x * 9 + Math.sin(t * 3 + s) * 0.6) * dt;
      let y = a[i * 3 + 1] + Math.sin(t * 4 + s * 2) * dt * 1.2;
      let z = a[i * 3 + 2] + (W.wind.z * 9 + Math.cos(t * 2.6 + s) * 0.6) * dt;
      if (y < cam.y - 1.4) y += 4; else if (y > cam.y + 3) y -= 4;
      if (x - cam.x > h) x -= span; else if (x - cam.x < -h) x += span;
      if (z - cam.z > h) z -= span; else if (z - cam.z < -h) z += span;
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    g.attributes.position.needsUpdate = true;
  });
}

// ---------- farm: crop fields behind fences, a red barn and silo, a windmill on the rim; hay trampolines ----------
function farm(W) {
  const { R, T, seed, rng } = W;
  const isl = sdBlob(0, 0, R, seed, 0.8);
  W.walkSd = isl; W.coastSd = isl; W.radiusAt = isl.radiusAt;
  W.ground(isl, { top: T.grass, side: T.cliff });
  W.extras = [];

  // crop fields: tilled soil with rows of wheat, cabbages or carrots, fenced with a gap towards the pedestal
  const fields = [];
  const inField = (x, z, pad = 0) => fields.some(f => Math.abs(x - f.x) < f.hx + pad && Math.abs(z - f.z) < f.hz + pad);
  scatterProps(W, R > 20 ? 3 : 2, (x, z) => !W.nearCentre(x, z, 4) && !W.spawnPath(x, z, 4.5) && isl(x, z) < -5.5
    && !fields.some(f => Math.hypot(f.x - x, f.z - z) < 10) && !W.crowded(x, z, 4), (x, z) => {
    const hx = 2.4 + rng() * 0.8, hz = 1.8 + rng() * 0.5, alongX = hx > hz, crop = Math.floor(rng() * 3);
    fields.push({ x, z, hx, hz });
    // tilled soil with a darker edge, ridges along the rows, and the crop: sheaves of wheat with ears, cabbages
    // in their outer leaves, or carrot tops with the carrot's shoulder showing
    const d = W.drng;
    put(W, GEO.box(), 0x8a5a3c, x, 0.015, z, { sx: hx * 2 + 0.2, sy: 0.04, sz: hz * 2 + 0.2, kind: 'fx' });
    put(W, GEO.box(), 0x9a6a46, x, 0.022, z, { sx: hx * 2 - 0.1, sy: 0.05, sz: hz * 2 - 0.1, kind: 'fx' });
    const across = alongX ? hz : hx, along = alongX ? hx : hz;
    for (let r = -across + 0.45; r < across - 0.2; r += 0.9) {
      putL(W, GEO.cyl(6), 0x7d5236, alongX ? x : x + r, 0.035, alongX ? z + r : z, { sx: 0.17, sy: (alongX ? hx : hz) * 2 - 0.3, sz: 0.07, ry: alongX ? 0 : Math.PI / 2, rz: Math.PI / 2, kind: 'fx' });
      for (let t = -along + 0.4; t < along - 0.3; t += 0.55) {
        const px = (alongX ? x + t : x + r) + (d() - 0.5) * 0.06, pz = (alongX ? z + r : z + t) + (d() - 0.5) * 0.06;
        if (crop === 0) {
          for (let k = 0; k < 3; k++) {
            const a = k * 2.1 + d(), h = 0.5 + d() * 0.16, ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
            putL(W, GEO.cone(4), k ? 0xf0c75a : 0xe4b548, px + ox, 0.06 + h / 2, pz + oz, { sx: 0.035, sy: h, sz: 0.035, ry: -a, rz: -0.14, kind: 'fx' });
            putL(W, GEO.octa(), 0xf7d978, px + ox * 2.4, 0.06 + h, pz + oz * 2.4, { sx: 0.045, sy: 0.12, sz: 0.045, ry: -a, rz: -0.3, kind: 'fx' });
          }
        } else if (crop === 1) {
          put(W, GEO.lump(Math.floor(d() * 4)), 0x8fd96a, px, 0.15, pz, { sx: 0.17, sy: 0.14, sz: 0.17, ry: d() * 6, kind: 'fx' });
          for (let k = 0; k < 4; k++) { const a = k * 1.57 + d(); putL(W, GEO.dome(), k % 2 ? 0x6cc357 : 0x5cb04c, px + Math.cos(a) * 0.13, 0.07, pz + Math.sin(a) * 0.13, { sx: 0.14, sy: 0.1, sz: 0.1, ry: -a, rz: 0.9, kind: 'fx' }); }
        } else {
          for (let k = 0; k < 3; k++) { const a = k * 2.1 + d(); putL(W, GEO.cone(4), k ? 0x5fae4a : 0x4f9a40, px, 0.2, pz, { sx: 0.045, sy: 0.34, sz: 0.045, ry: -a, rz: -0.35, kind: 'fx' }); }
          put(W, GEO.cone(6), 0xff8a3d, px, 0.07, pz, { sx: 0.075, sy: 0.1, sz: 0.075, rx: Math.PI, kind: 'fx' });
        }
      }
    }
    // fence round it, open on the side that faces the pedestal
    const ex = hx + 0.4, ez = hz + 0.4, open = Math.abs(x) > Math.abs(z) ? (x > 0 ? 'w' : 'e') : (z > 0 ? 's' : 'n');
    const sideFence = (ax, az, bx, bz, gap) => {
      if (!gap) return fence(W, ax, az, bx, bz);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az), k = 0.9 / L;
      fence(W, ax, az, mx - (bx - ax) * k, mz - (bz - az) * k);
      fence(W, mx + (bx - ax) * k, mz + (bz - az) * k, bx, bz);
    };
    sideFence(x - ex, z - ez, x + ex, z - ez, open === 'n');
    sideFence(x - ex, z + ez, x + ex, z + ez, open === 's');
    sideFence(x - ex, z - ez, x - ex, z + ez, open === 'w');
    sideFence(x + ex, z - ez, x + ex, z + ez, open === 'e');
    W.obstacles.push({ x, z, r: 0.1 });
  });
  W.noTuft = (x, z) => inField(x, z, 0.3);
  W.noBlocks = (x, z) => inField(x, z, 0.6);

  // the red barn with its silo
  const barn = W.sample((x, z) => !W.nearCentre(x, z, 5) && !W.spawnPath(x, z, 4) && isl(x, z) < -5.5 && !inField(x, z, 4.5)
    && W.flatAt(x, z, 4, 0.01) !== null && !W.blocked(x, z, 4.2, 0, 3) && !W.crowded(x, z, 4), 150);
  if (barn) {
    const { x, z } = barn, ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
    const fwd = [Math.sin(ry), Math.cos(ry)], side = [Math.cos(ry), -Math.sin(ry)];
    const Hs = house(W, x, z, ry, { w: 4.4, d: 3.6, h: 2.6, roofH: 1.6, wall: 0xd8524a, roof: 0x8a4a3a, door: null, glass: 0xf2cf6b, trim: 0xfff1dc, footing: 0xcfc8b8 });
    // board walls: a batten every half metre on the front and back
    for (const so of [-1, 1]) for (let t = -1.9; t <= 1.91; t += 0.475) put(W, GEO.box(), 0xc4453f, ...Hs.at(t, 1.35, so * 1.81), { sx: 0.05, sy: 2.3, sz: 0.03, ry });
    // big barn doors: two leaves in a white frame, each with a white Z-brace and a hinge strap, a lantern above
    put(W, GEO.box(), 0xfff1dc, ...Hs.at(0, 1.02, 1.82), { sx: 2.0, sy: 2.04, sz: 0.06, ry });
    for (const e of [-1, 1]) {
      put(W, GEO.box(), 0xb8433d, ...Hs.at(e * 0.45, 0.98, 1.85), { sx: 0.84, sy: 1.88, sz: 0.05, ry });
      for (const up of [0.2, 0.98, 1.76]) put(W, GEO.box(), 0xfff1dc, ...Hs.at(e * 0.45, up, 1.88), { sx: 0.84, sy: 0.1, sz: 0.02, ry });
      for (const [up, r] of [[0.59, 0.74], [1.37, -0.74]]) putL(W, GEO.box(), 0xfff1dc, ...Hs.at(e * 0.45, up, 1.88), { sx: 0.1, sy: 1.06, sz: 0.02, ry, rz: e * r });
      put(W, GEO.box(), 0x3a3352, ...Hs.at(e * 0.82, 1.5, 1.895), { sx: 0.2, sy: 0.05, sz: 0.02, ry });
      put(W, GEO.box(), 0x3a3352, ...Hs.at(e * 0.82, 0.45, 1.895), { sx: 0.2, sy: 0.05, sz: 0.02, ry });
    }
    // the hay loft: an open hatch full of hay under the gable, a hoist beam with its hook
    put(W, GEO.box(), 0xfff1dc, ...Hs.at(0, 3.3, 1.82), { sx: 1.0, sy: 0.9, sz: 0.06, ry });
    put(W, GEO.box(), 0x6b3a30, ...Hs.at(0, 3.3, 1.84), { sx: 0.82, sy: 0.72, sz: 0.05, ry });
    put(W, GEO.lump(1), 0xf2cf6b, ...Hs.at(0, 3.12, 1.86), { sx: 0.4, sy: 0.22, sz: 0.12, ry });
    put(W, GEO.box(), 0x8a5a3c, ...Hs.at(0, 3.9, 2.05), { sx: 0.12, sy: 0.12, sz: 0.6, ry });
    put(W, GEO.cyl(5), 0xd9c49a, ...Hs.at(0, 3.62, 2.28), { sx: 0.015, sy: 0.5, sz: 0.015 });
    put(W, GEO.ico(), 0x5c5c6a, ...Hs.at(0, 3.36, 2.28), { sx: 0.05, sy: 0.06, sz: 0.05 });
    // a weathercock on the ridge
    put(W, GEO.cyl(5), 0x3a3352, ...Hs.at(1.4, 5.25, 0), { sx: 0.025, sy: 0.6, sz: 0.025 });
    put(W, GEO.box(), 0x3a3352, ...Hs.at(1.4, 5.38, 0), { sx: 0.5, sy: 0.03, sz: 0.03, ry });
    putL(W, GEO.cone(4), 0xffd23f, ...Hs.at(1.69, 5.38, 0), { sx: 0.07, sy: 0.16, sz: 0.03, ry, rz: -Math.PI / 2 });
    put(W, GEO.lump(2), 0xffd23f, ...Hs.at(1.36, 5.56, 0), { sx: 0.13, sy: 0.1, sz: 0.04, ry });
    const sx = x + side[0] * 3.3, sz = z + side[1] * 3.3;
    if (!W.blocked(sx, sz, 1.1, 0, 3)) {
      // the silo: staves between hoops, a ribbed dome with a finial, a ladder up its side, a hatch at the foot
      put(W, GEO.cyl(14), 0xd9d4e6, sx, 2.2, sz, { sx: 1.0, sy: 4.4, sz: 1.0, tint: footTint(0.86, 1.03) });
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; put(W, GEO.box(), 0xc6c1d4, sx + Math.cos(a) * 1.0, 2.2, sz + Math.sin(a) * 1.0, { sx: 0.03, sy: 4.38, sz: 0.05, ry: -a }); }
      for (const h of [0.5, 1.5, 2.5, 3.5, 4.3]) put(W, GEO.cyl(14), 0x9a95aa, sx, h, sz, { sx: 1.035, sy: 0.1, sz: 1.035 });
      put(W, GEO.dome(), 0x8fa0c0, sx, 4.4, sz, { sx: 1.07, sy: 0.82, sz: 1.07, tint: footTint(0.9, 1.08) });
      put(W, GEO.cyl(8), 0x6f80a0, sx, 5.24, sz, { sx: 0.13, sy: 0.1, sz: 0.13 });
      put(W, GEO.ico(), 0xffd23f, sx, 5.36, sz, { sx: 0.08, sy: 0.08, sz: 0.08 });
      // (the ladder and hatch face the same way as the barn's doors)
      const lx = sx + fwd[0] * 1.07, lz = sz + fwd[1] * 1.07;
      for (const e of [-1, 1]) put(W, GEO.box(), 0x5c5c6a, lx + side[0] * e * 0.2, 2.5, lz + side[1] * e * 0.2, { sx: 0.04, sy: 3.8, sz: 0.04, ry });
      for (let h = 0.8; h < 4.4; h += 0.4) put(W, GEO.box(), 0x5c5c6a, lx, h, lz, { sx: 0.4, sy: 0.035, sz: 0.035, ry });
      put(W, GEO.box(), 0x8a85a0, sx + fwd[0] * 1.0 + side[0] * 0.55, 0.45, sz + fwd[1] * 1.0 + side[1] * 0.55, { sx: 0.5, sy: 0.6, sz: 0.08, ry });
      W.box(sx - 1, 0, sz - 1, sx + 1, 5.1, sz + 1, { sound: 'stone' });
      W.obstacles.push({ x: sx, z: sz, r: 1.6 });
      W.skirts.push({ x: sx, z: sz, y: 0, r: 1.1 });
    }
  }

  // a windmill on the rim, its sails turning faster in the wind
  const mill = W.sample((x, z) => isl(x, z) < -2.4 && isl(x, z) > -5 && !W.spawnPath(x, z, 4) && !W.nearCentre(x, z, 7) && !inField(x, z, 3)
    && W.flatAt(x, z, 1.6, 0.01) !== null && !W.blocked(x, z, 1.8, 0, 3) && !W.crowded(x, z, 2.4), 150);
  if (mill) {
    const { x, z } = mill, a = Math.atan2(-x, -z);
    const fx = Math.sin(a), fz = Math.cos(a), wall = 0xf3e6cf, timber = 0x8a5a3c;
    // a tower that narrows upwards on a course of stones, a gallery half way up, a shingled cap; door and windows
    // face the pedestal
    for (let k = 0; k < 8; k++) { const sa = (k / 8) * Math.PI * 2 + 0.39; putL(W, GEO.bevel(0.1), k % 2 ? 0xcfc8b8 : 0xbdb5a4, x + Math.sin(sa) * 1.12, 0.2, z + Math.cos(sa) * 1.12, { sx: 0.9, sy: 0.4, sz: 0.34, ry: sa }); }
    put(W, GEO.taper(8, 0.74), wall, x, 2.1, z, { sx: 1.15, sy: 4.2, sz: 1.15, tint: footTint(0.9, 1.03) });
    put(W, GEO.cyl(8), timber, x, 2.25, z, { sx: 1.32, sy: 0.08, sz: 1.32 });
    for (let k = 0; k < 8; k++) {
      const sa = (k / 8) * Math.PI * 2 + 0.39, px = x + Math.sin(sa) * 1.27, pz = z + Math.cos(sa) * 1.27, sb = ((k + 1) / 8) * Math.PI * 2 + 0.39;
      put(W, GEO.box(), timber, px, 2.52, pz, { sx: 0.06, sy: 0.5, sz: 0.06 });
      putL(W, GEO.box(), shade(timber, 1.15), x + (Math.sin(sa) + Math.sin(sb)) * 0.635, 2.76, z + (Math.cos(sa) + Math.cos(sb)) * 0.635, { sx: 0.99, sy: 0.05, sz: 0.05, ry: (sa + sb) / 2 });
    }
    put(W, GEO.cyl(8), shade(0xb8433d, 0.8), x, 4.22, z, { sx: 0.95, sy: 0.12, sz: 0.95 });
    put(W, GEO.cone(8), 0xb8433d, x, 4.86, z, { sx: 1.3, sy: 1.3, sz: 1.3, tint: footTint(0.88, 1.06) });
    put(W, GEO.ico(), 0xffd23f, x, 5.56, z, { sx: 0.09, sy: 0.09, sz: 0.09 });
    put(W, GEO.box(), 0xfff8ec, x + fx * 1.12, 0.72, z + fz * 1.12, { sx: 0.86, sy: 1.44, sz: 0.1, ry: a });
    put(W, GEO.box(), 0x7a4e3a, x + fx * 1.16, 0.68, z + fz * 1.16, { sx: 0.66, sy: 1.3, sz: 0.06, ry: a });
    put(W, GEO.ico(), 0xffd23f, x + fx * 1.2 + fz * 0.22, 0.68, z + fz * 1.2 - fx * 0.22, { sx: 0.04, sy: 0.04, sz: 0.04 });
    for (const [sa, up] of [[a + 1.6, 1.5], [a - 1.6, 1.5], [a + 0.9, 3.2]]) {
      const rr = 1.15 * (1 - 0.26 * (up / 4.2)) + 0.01;
      put(W, GEO.box(), 0xfff8ec, x + Math.sin(sa) * rr, up, z + Math.cos(sa) * rr, { sx: 0.5, sy: 0.6, sz: 0.08, ry: sa });
      put(W, GEO.box(), 0x7ec8f0, x + Math.sin(sa) * (rr + 0.03), up, z + Math.cos(sa) * (rr + 0.03), { sx: 0.36, sy: 0.46, sz: 0.06, ry: sa });
    }
    W.box(x - 1.15, 0, z - 1.15, x + 1.15, 4.8, z + 1.15, { sound: 'wood' });
    W.obstacles.push({ x, z, r: 2 });
    W.skirts.push({ x, z, y: 0, r: 1.35 });
    W.extras.push(() => {
      const hub = new THREE.Group(), spin = new THREE.Group();
      hub.position.set(x + Math.sin(a) * 1.2, 4.1, z + Math.cos(a) * 1.2);
      hub.rotation.y = a;
      hub.add(spin);
      const wood = toon(0x8a5a3c), cloth = toon(0xfff8ec), dark = toon(0x6b4a36);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8).rotateX(Math.PI / 2), dark);
      axle.position.z = -0.12;
      spin.add(axle, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 8).rotateX(Math.PI / 2), wood));
      // each sail: a whip, a frame of slats, the cloth laced onto it
      const slat = new THREE.BoxGeometry(0.72, 0.05, 0.05), whip = new THREE.BoxGeometry(0.13, 2.8, 0.09), sheet = new THREE.BoxGeometry(0.6, 2.0, 0.03), edge = new THREE.BoxGeometry(0.05, 2.05, 0.05);
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group();
        arm.rotation.z = (k * Math.PI) / 2;
        const beam = new THREE.Mesh(whip, wood); beam.position.y = 1.4;
        const sail = new THREE.Mesh(sheet, cloth); sail.position.set(0.39, 1.68, 0.03);
        const rim = new THREE.Mesh(edge, wood); rim.position.set(0.71, 1.68, 0.02);
        arm.add(beam, sail, rim);
        for (let j = 0; j < 5; j++) { const sl = new THREE.Mesh(slat, wood); sl.position.set(0.37, 0.7 + j * 0.49, 0.0); arm.add(sl); }
        spin.add(arm);
      }
      hub.traverse(o => { if (o.isMesh) o.castShadow = true; });
      W.group.add(hub);
      W.updaters.push(dt => { spin.rotation.z -= dt * 0.7; });
    });
  }

  // hay trampolines: bounce up onto tall stacks of hay bales (some blocks wait up there)
  const stacks = [];
  scatterProps(W, R > 20 ? 3 : 2, (x, z) => {
    if (W.nearCentre(x, z, 5) || W.spawnPath(x, z, 3) || isl(x, z) > -4 || inField(x, z, 3) || stacks.some(s => Math.hypot(s.x - x, s.z - z) < 8)) return false;
    if (W.flatAt(x, z, 1.8, 0.01) === null || W.blocked(x, z, 1.8, 0, 4) || W.crowded(x, z, 2.2)) return false;
    const d = Math.hypot(x, z), px = x - (x / d) * 3.3, pz = z - (z / d) * 3.3;
    return !W.spawnPath(px, pz, 1) && W.flatAt(px, pz, 1.1, 0.01) !== null && !W.blocked(px, pz, 1.2, 0, 2) && !inField(px, pz, 1.4);
  }, (x, z) => {
    const h = 3.2, w = 2.2, d = Math.hypot(x, z);
    // four layers of square bales, each layer two bales side by side turned across the one below, twine round each
    const dr = W.drng;
    for (let k = 0; k < 4; k++) {
      const ww = w - k * 0.06, turn = (k % 2) * Math.PI / 2 + (dr() - 0.5) * 0.06;
      for (const e of [-1, 1]) {
        const ox = Math.cos(turn) * e * ww / 4, oz = -Math.sin(turn) * e * ww / 4;
        block(W, e > 0 ? 0xf2cf6b : 0xedc55e, x + ox, k * 0.8 + 0.4, z + oz, ww / 2 - 0.02, 0.77, ww, { b: 0.06, ry: turn, tint: footTint(0.9, 1.04) });
        for (const t of [-0.3, 0.3]) putL(W, GEO.box(), 0xb07a3c, x + ox - Math.sin(turn) * t * ww, k * 0.8 + 0.4, z + oz - Math.cos(turn) * t * ww, { sx: ww / 2 + 0.005, sy: 0.785, sz: 0.035, ry: turn });
      }
    }
    // wisps of straw sticking out, and lying about its foot
    for (let k = 0; k < 9; k++) {
      const sa = dr() * 6.283, up = k < 4 ? 0.02 : 0.8 * (1 + Math.floor(dr() * 3)), rr = k < 4 ? w * 0.6 + dr() * 0.5 : w * 0.52;
      put(W, GEO.box(), k % 2 ? 0xf2cf6b : 0xd9aa48, x + Math.cos(sa) * rr, up, z + Math.sin(sa) * rr, { sx: 0.34 + dr() * 0.2, sy: 0.025, sz: 0.035, ry: dr() * 3, kind: 'fx' });
    }
    W.box(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, { top: true, sound: 'grass' });
    stacks.push({ x, z });
    W.obstacles.push({ x, z, r: 1.8 });
    bouncePad(W, x - (x / d) * 3.3, 0, z - (z / d) * 3.3, { x, y: h, z }, 1, (bx, by, bz) => {
      // a low wooden frame, a heap of springy straw in it
      for (const e of [-1, 1]) {
        block(W, 0x8a5a3c, bx, 0.11, bz + e * 0.88, 1.9, 0.22, 0.14, { b: 0.03 });
        block(W, 0x7a4e32, bx + e * 0.88, 0.11, bz, 0.14, 0.22, 1.62, { b: 0.03 });
      }
      put(W, GEO.box(), 0xe9c75a, bx, 0.1, bz, { sx: 1.64, sy: 0.18, sz: 1.64 });
      put(W, GEO.lump(1), 0xf7dc84, bx, 0.17, bz, { sx: 0.8, sy: 0.09, sz: 0.8 });
      for (const [ox, oz] of [[-0.6, -0.4], [0.4, 0.5], [0.1, -0.2], [-0.3, 0.55], [0.55, -0.5]]) put(W, GEO.box(), 0xe0b752, bx + ox, 0.215 - Math.hypot(ox, oz) * 0.03, bz + oz, { sx: 0.5, sy: 0.02, sz: 0.06, ry: ox * 3 });
    });
  }, 40);

  // grazing sheep and round hay bales to hop on
  scatterProps(W, Math.round(2 + R * 0.12), (x, z) => okTree(W, x, z, 2) && !inField(x, z, 1.5), (x, z) => {
    const ry = rng() * Math.PI * 2, fx = Math.sin(ry), fz = Math.cos(ry);
    sheep(W, x, z, ry);
    W.box(x - 0.5, 0, z - 0.5, x + 0.5, 0.8, z + 0.5, { sound: 'grass' });
    W.obstacles.push({ x, z, r: 0.9 });
  });
  scatterProps(W, Math.round(1 + R * 0.08), (x, z) => okTree(W, x, z, 2.5) && !inField(x, z, 2) && W.flatAt(x, z, 1.4, 0.01) !== null, (x, z) => {
    const r = 0.6, L = 1.2, alongX = rng() < 0.5;
    bale(W, x, 0, z, r, L, alongX);
    W.obstacles.push({ x, z, r: 1.2 });
  });
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.35)), (x, z) => okTree(W, x, z) && !inField(x, z, 2), (x, z) => tree(W, 'round', x, z, 0.75 + rng() * 0.45, 0));
  scatterProps(W, Math.round(R * 0.4), (x, z) => okTree(W, x, z, 1) && !inField(x, z, 1), (x, z) => {
    const s = 0.45 + rng() * 0.3;
    bush(W, x, 0, z, s, T.leaves[Math.floor(rng() * T.leaves.length)], rng() * 3);
    W.obstacles.push({ x, z, r: s + 0.4 });
  });
  Object.assign(W, SKIES.farm);
}

// ---------- frostwood: a snowy pine forest, a log cabin and a frozen stream; deep snowdrifts slow you ----------
function frostwood(W) {
  const { R, T, seed, rng, clearR } = W, late = [];
  const isl = sdBlob(0, 0, R, seed, 0.9);
  W.walkSd = isl; W.coastSd = isl; W.radiusAt = isl.radiusAt;
  W.seaY = -1.4;
  // a frozen stream winding across the island behind the pedestal
  const zc = -(clearR + 4.2 + rng() * 1.5), tilt = (rng() - 0.5) * 0.5;
  const pts = [];
  for (let i = 0; i <= 6; i++) { const x = -R - 2 + (i / 6) * (2 * R + 4); pts.push([x, zc + x * tilt + Math.sin(i * 1.7 + seed) * 1.4]); }
  const stream = sdUnion(...pts.slice(1).map((p, i) => sdCapsule(pts[i][0], pts[i][1], p[0], p[1], 1.25)));
  // deep snowdrifts
  const drifts = [];
  for (let i = 0; i < 60 && drifts.length < (R > 20 ? 5 : 3); i++) {
    const rd = 2 + rng() * 1.2, a = rng() * Math.PI * 2, d = clearR + 3 + rd + rng() * (R * 0.85 - (clearR + 3 + rd) - rd);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (W.spawnPath(x, z, rd + 1) || isl(x, z) > -(rd + 1.5) || stream(x, z) < rd + 1 || drifts.some(o => Math.hypot(o.x - x, o.z - z) < o.rd + rd + 2.5)) continue;
    drifts.push({ x, z, rd, sd: sdBlob(x, z, rd, seed + 40 + i, 0.5) });
  }
  const DRIFT = 0.18;
  const inDrift = (x, z) => drifts.some(o => o.sd(x, z) < 0);
  const onIce = (x, z) => stream(x, z) < 0 && isl(x, z) < 0;
  W.floorAt = (x, z) => (inDrift(x, z) ? DRIFT : 0);
  W.surfaceAt = (x, z, y) => {
    if (onIce(x, z)) return { friction: 0.14, slow: 1, sound: 'ice' };
    if (y < DRIFT + 0.08 && inDrift(x, z)) return { friction: 0.9, slow: 0.55, sound: 'snow' };
    return null;
  };
  W.noTuft = (x, z) => onIce(x, z) || inDrift(x, z);
  W.noBlocks = (x, z) => stream(x, z) < 0.5;

  W.ground(isl, { top: T.grass, side: T.cliff, depth: 5, hole: stream, holeDepth: 0.12, holeColor: T.iceSide });
  W.ground((x, z) => Math.max(stream(x, z), isl(x, z) + 0.2), { y: -0.04, top: T.ice, side: T.iceSide, depth: 0.3, lip: 0 });
  for (const o of drifts) {
    const b = o.rd * 1.4;
    W.ground(o.sd, { y: DRIFT, top: 0xffffff, side: 0xe3ecfa, depth: DRIFT + 0.02, lip: 0.12, lipDepth: 0.1, rect: [o.x - b, o.z - b, o.x + b, o.z + b], cliffKind: 'solid', step: 0.3 });
    for (let k = 0; k < 5; k++) {
      const a = rng() * Math.PI * 2, r = rng() * o.rd * 0.6;
      put(W, GEO.dome(), 0xffffff, o.x + Math.cos(a) * r, DRIFT - 0.02, o.z + Math.sin(a) * r, { sx: 0.8 + rng() * 0.6, sy: 0.18 + rng() * 0.1, sz: 0.7 + rng() * 0.5, ry: rng() * 3, kind: 'fx' });
    }
  }
  // ice cracks
  scatterProps(W, 14, (x, z) => stream(x, z) < -0.5 && isl(x, z) < -0.5, (x, z) => iceMark(W, x, z, -0.03, 0.6 + rng() * 0.9, rng() * 3));

  // the log cabin, lights on
  const cab = W.sample((x, z) => !W.nearCentre(x, z, 5) && !W.spawnPath(x, z, 4) && isl(x, z) < -5 && stream(x, z) > 4 && !inDrift(x, z)
    && drifts.every(o => Math.hypot(o.x - x, o.z - z) > o.rd + 4) && W.flatAt(x, z, 3.2, 0.01) !== null && !W.blocked(x, z, 3.2, 0, 3), 150);
  if (cab) {
    const { x, z } = cab, ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
    const fwd = [Math.sin(ry), Math.cos(ry)], side = [Math.cos(ry), -Math.sin(ry)];
    const Hs = house(W, x, z, ry, { w: 3.4, d: 2.8, h: 2.1, roofH: 1.2, wall: 0x8a5a3c, roof: 0xfafcff, door: 0x5c3a28, glass: 0xffd27a, trim: null, chimney: 0x8f8aa8, footing: 0x9a96ad,
      lit: true, icicles: true, smoke: true });
    // log walls: a groove between every two logs on all four sides, the logs' ends crossing at the corners
    for (let y = 0.42; y < 2.1; y += 0.42) {
      for (const so of [-1, 1]) {
        put(W, GEO.box(), 0x6b4a36, ...Hs.at(0, y, so * 1.412), { sx: 3.42, sy: 0.05, sz: 0.04, ry });
        put(W, GEO.box(), 0x6b4a36, ...Hs.at(so * 1.712, y, 0), { sx: 0.04, sy: 0.05, sz: 2.82, ry });
      }
    }
    for (const sa of [-1, 1]) for (const so of [-1, 1]) for (let k = 0; k < 5; k++) {
      const y = 0.22 + k * 0.42;
      putL(W, GEO.cyl(8), k % 2 ? 0xb07a50 : 0xa06e46, ...Hs.at(sa * 1.75, y, so * 1.5), { sx: 0.2, sy: 0.34, sz: 0.2, ry, rx: Math.PI / 2 });
      putL(W, GEO.cyl(8), 0xe2c08c, ...Hs.at(sa * 1.75, y, so * 1.675), { sx: 0.13, sy: 0.012, sz: 0.13, ry, rx: Math.PI / 2 });
      putL(W, GEO.cyl(8), k % 2 ? 0xa06e46 : 0xb07a50, ...Hs.at(sa * 1.85, y + 0.21, so * 1.4), { sx: 0.2, sy: 0.34, sz: 0.2, ry, rz: Math.PI / 2 });
      putL(W, GEO.cyl(8), 0xe2c08c, ...Hs.at(sa * 2.025, y + 0.21, so * 1.4), { sx: 0.13, sy: 0.012, sz: 0.13, ry, rz: Math.PI / 2 });
    }
    // a wreath on the door, a lantern beside it
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; put(W, GEO.ico(), k % 4 ? 0x2f7a5a : 0xd9443b, ...Hs.at(Math.cos(a) * 0.15, 0.95 + Math.sin(a) * 0.15, 1.5), { sx: 0.07, sy: 0.07, sz: 0.05 }); }
    put(W, GEO.box(), 0x3a2a20, ...Hs.at(0.62, 1.52, 1.5), { sx: 0.05, sy: 0.05, sz: 0.2, ry });
    put(W, GEO.box(), 0xffd27a, ...Hs.at(0.62, 1.36, 1.58), { sx: 0.14, sy: 0.2, sz: 0.14, ry, kind: 'glow' });
    put(W, GEO.cone(4), 0x3a2a20, ...Hs.at(0.62, 1.52, 1.58), { sx: 0.13, sy: 0.1, sz: 0.13, ry: ry + Math.PI / 4 });
    // stacked firewood between two stakes, the cut ends showing; a chopping block with an axe in it
    const wx = x + side[0] * 2.4 + fwd[0] * 0.6, wz = z + side[1] * 2.4 + fwd[1] * 0.6;
    for (let k = 0; k < 9; k++) {
      const col = k % 3, row = Math.floor(k / 3), px = wx + side[0] * (col - 1) * 0.32 + (row % 2) * side[0] * 0.08, py = 0.17 + row * 0.29, pz = wz + side[1] * (col - 1) * 0.32 + (row % 2) * side[1] * 0.08;
      putL(W, GEO.cyl(7), k % 2 ? 0xb07a50 : 0x9a6b4f, px, py, pz, { sx: 0.16, sy: 1.0, sz: 0.16, ry, rx: Math.PI / 2 });
      for (const e of [-1, 1]) putL(W, GEO.cyl(7), 0xe2c08c, px + fwd[0] * e * 0.503, py, pz + fwd[1] * e * 0.503, { sx: 0.12, sy: 0.01, sz: 0.12, ry, rx: Math.PI / 2 });
    }
    for (const e of [-1, 1]) put(W, GEO.box(), 0x6b4a36, wx + side[0] * e * 0.55, 0.5, wz + side[1] * e * 0.55, { sx: 0.07, sy: 1.0, sz: 0.07, ry });
    put(W, GEO.dome(), 0xfafcff, wx, 0.98, wz, { sx: 0.5, sy: 0.12, sz: 0.5 });
    W.box(wx - 0.6, 0, wz - 0.6, wx + 0.6, 0.6, wz + 0.6, { sound: 'wood' });
    late.push(() => {
      // (close by the cabin, where no block lies: added last, so they move nothing)
      const [bx, , bz] = Hs.at(-2.35, 0, 0.9), [mx, , mz] = Hs.at(1.25, 0, 2.2);
      stump(W, bx, bz, 0, { r: 0.3, h: 0.42 });
      putL(W, GEO.box(), 0x8a5a3c, bx + 0.12, 0.72, bz, { sx: 0.045, sy: 0.6, sz: 0.045, rz: -0.5 });
      putL(W, GEO.box(), 0x8f8aa8, bx - 0.04, 0.5, bz, { sx: 0.2, sy: 0.12, sz: 0.04, rz: -0.5 });
      W.box(bx - 0.3, 0, bz - 0.3, bx + 0.3, 0.45, bz + 0.3, { sound: 'wood' });
      snowman(W, mx, mz, ry + 0.4);
      W.box(mx - 0.35, 0, mz - 0.35, mx + 0.35, 1.5, mz + 0.35, { sound: 'snow' });
    });
  }

  // the forest: tall pines, stumps and snowy rocks
  plateauField(W, Math.round(2 + R * 0.12), { body: 0x9fb8dc, cap: 0xffffff, step: 0xbfd0ea, sound: 'snow' }, (x, z, ext) => stream(x, z) > ext + 2.5 && !inDrift(x, z));
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 1.3)), (x, z) => okTree(W, x, z, 1.2) && stream(x, z) > 1.8 && !inDrift(x, z), (x, z) => tree(W, 'pine', x, z, 0.9 + rng() * 0.7, 0), 10);
  scatterProps(W, Math.round(R * 0.25), (x, z) => okTree(W, x, z, 1) && stream(x, z) > 1.2 && !inDrift(x, z), (x, z) => {
    stump(W, x, z, 0);
    W.box(x - 0.35, 0, z - 0.35, x + 0.35, 0.55, z + 0.35, { top: false, sound: 'wood' });
    W.obstacles.push({ x, z, r: 0.7 });
  });
  scatterProps(W, Math.round(R * 0.25), (x, z) => okTree(W, x, z, 1) && stream(x, z) > 1.2 && !inDrift(x, z), (x, z) => {
    const s = 0.45 + rng() * 0.5;
    rock(W, x, z, s, 0);
    put(W, GEO.dome(), 0xffffff, x, s * 0.55, z, { sx: s * 0.85, sy: s * 0.35, sz: s * 0.8, ry: rng() * 3 });
  });
  // snow heaped along the stream's banks
  for (let i = 0, k = 0; i < 400 && k < 30; i++) {
    const a = W.drng() * 6.283, r = Math.sqrt(W.drng()) * R, x = Math.cos(a) * r, z = Math.sin(a) * r, sd = stream(x, z);
    if (sd < 0.05 || sd > 0.45 || isl(x, z) > -0.8) continue;
    const ss = 0.3 + W.drng() * 0.35;
    put(W, GEO.dome(), 0xffffff, x, -0.03, z, { sx: ss * 1.3, sy: ss * 0.45, sz: ss, ry: W.drng() * 3, kind: 'fx' });
    k++;
  }
  late.forEach(f => f());
  Object.assign(W, SKIES.frostwood);
}

// ---------- cove: a rocky crescent around a deep bay with an old shipwreck; giant clams bounce you up the rocks ----------
function cove(W) {
  const { R, T, seed, rng, clearR } = W;
  const isl = sdBlob(0, 0, R, seed, 0.9);
  const bR = clamp(R * 0.45, 5, 11), zn = -(clearR + 3), bb = bR * 1.3;
  const bay = sdEllipse(0, zn - bb, bR, bb), bz = zn - bb * 0.6;
  const land = (x, z) => Math.max(isl(x, z), -bay(x, z));
  W.walkSd = land; W.coastSd = land; W.radiusAt = isl.radiusAt;
  W.ground(land, { top: T.grass, side: T.cliff, depth: 5, jag: 0.6 });

  // rock stacks to bounce up to, each with a giant clam in front
  const stacks = [];
  scatterProps(W, R > 20 ? 3 : 2, (x, z) => {
    if (W.nearCentre(x, z, 5) || W.spawnPath(x, z, 3) || land(x, z) > -4 || stacks.some(s => Math.hypot(s.x - x, s.z - z) < 9)) return false;
    if (W.flatAt(x, z, 1.8, 0.01) === null || W.blocked(x, z, 1.8, 0, 4) || W.crowded(x, z, 2.2)) return false;
    const d = Math.hypot(x, z), px = x - (x / d) * 3.3, pz = z - (z / d) * 3.3;
    return !W.spawnPath(px, pz, 1) && land(px, pz) < -1.5 && W.flatAt(px, pz, 1.1, 0.01) !== null && !W.blocked(px, pz, 1.2, 0, 2);
  }, (x, z) => {
    const h = 3.6 + rng() * 0.5, d = Math.hypot(x, z);
    tower(W, x, z, 2.2, 2.2, h, 0, 0, 0, 0, { body: T.cliff, cap: T.cap, lines: T.dirt, sound: 'stone' });
    stacks.push({ x, z });
    W.obstacles.push({ x, z, r: 1.8 });
    const ry = Math.atan2(x, z);
    bouncePad(W, x - (x / d) * 3.3, 0, z - (z / d) * 3.3, { x, y: h, z }, 1, (bx, by, bz) => {
      clam(W, bx, 0, bz, ry);
    });
  }, 40);

  // the old shipwreck, half sunk in the bay
  {
    const wx = bR * 0.15, wz = bz - bR * 0.2, ry = 0.5 + rng() * 0.4;
    const plank = 0x8a5a3c, d = W.drng;
    // a ship lying over in the shallows, bow towards the open sea, half under water
    const M0 = new THREE.Matrix4().compose(new THREE.Vector3(wx, W.seaY - 0.55, wz), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, ry - Math.PI / 2, 0.07, 'YXZ')), new THREE.Vector3(1, 1, 1));
    shipwreck(W, M0, { L: 9, wood: 0x8a5a3c, dark: 0x5c3a28, sail: 0xe9dfcf, big: true });
    // flotsam: planks, a barrel bobbing, a crate
    for (let k = 0; k < 6; k++) put(W, GEO.box(), k % 2 ? plank : 0x9a6b4f, wx + (rng() - 0.5) * bR, W.seaY + 0.05, wz + (rng() - 0.5) * bR * 1.5, { sx: 0.25, sy: 0.06, sz: 1 + rng(), ry: rng() * 3, kind: 'fx' });
    for (let k = 0; k < 2; k++) {
      const a = d() * 6.283, r = 4.5 + d() * 2, fx = wx + Math.cos(a) * r, fz = wz + Math.sin(a) * r;
      if (land(fx, fz) < 0.6) continue;
      putL(W, GEO.cyl(10), 0x9a6b4f, fx, W.seaY + 0.08, fz, { sx: 0.3, sy: 0.75, sz: 0.3, ry: a, rx: Math.PI / 2 - 0.2 });
      for (const t of [-0.25, 0.25]) putL(W, GEO.cyl(10), 0x5c5c6a, fx + Math.sin(a) * t, W.seaY + 0.08 + t * 0.2, fz + Math.cos(a) * t, { sx: 0.315, sy: 0.05, sz: 0.315, ry: a, rx: Math.PI / 2 - 0.2 });
    }
  }

  // crates, barrels and lanterns along the beach
  scatterProps(W, Math.round(R * 0.3), (x, z) => land(x, z) < -1.5 && okTree(W, x, z, 1.5), (x, z) => {
    if (rng() < 0.5) {
      crate(W, x, 0, z, 0.8, rng());
      W.box(x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45, { top: true, sound: 'wood' });
    } else {
      barrel(W, x, 0, z);
      W.box(x - 0.38, 0, z - 0.38, x + 0.38, 0.9, z + 0.38, { sound: 'wood' });
    }
    W.skirts.push({ x, z, y: 0, r: 0.6 });
    W.obstacles.push({ x, z, r: 0.9 });
  });
  plateauField(W, Math.round(2 + R * 0.12), { body: T.cliff, cap: T.cap, step: T.dirt, sound: 'stone' }, (x, z, ext) => land(x, z) < -(ext + 2.2));
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.4)), (x, z) => okTree(W, x, z, 1.6), (x, z) => tree(W, 'palm', x, z, 0.8 + rng() * 0.4, 0), 10);
  scatterProps(W, W.more('rocks', Math.round(R * 0.45)), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.35 + rng() * 0.55, 0));
  // tide pools with starfish (no grass grows in them)
  const pools = [];
  W.noTuft = (x, z) => pools.some(p => Math.hypot(p.x - x, p.z - z) < 1.15);
  scatterProps(W, Math.round(R * 0.25), (x, z) => land(x, z) < -1.5 && okTree(W, x, z, 1) && W.flatAt(x, z, 0.9, 0.01) !== null, (x, z) => {
    // a pool in a ring of wet sand, paler in the middle, pebbles on its rim; a starfish in it, sometimes a crab by it
    const px = 0.7 + rng() * 0.3, pz = 0.55 + rng() * 0.3, pry = rng() * 3, d = W.drng;
    pools.push({ x, z });
    put(W, GEO.cyl(12), shade(T.grass, 0.84), x, 0.008, z, { sx: px + 0.16, sy: 0.02, sz: pz + 0.16, ry: pry, kind: 'fx' });
    put(W, GEO.cyl(12), 0x3fc9d4, x, 0.015, z, { sx: px, sy: 0.02, sz: pz, ry: pry, kind: 'fx' });
    put(W, GEO.cyl(10), 0x7fe3e6, x + 0.05, 0.02, z - 0.04, { sx: px * 0.55, sy: 0.02, sz: pz * 0.5, ry: pry, kind: 'fx' });
    for (let k = 0; k < 5; k++) { const a = d() * 6.283; put(W, GEO.rock(), shade(T.rock, 0.9 + d() * 0.2), x + Math.cos(a) * (px + 0.1), 0.03, z + Math.sin(a) * (pz + 0.1), { sx: 0.08 + d() * 0.05, sy: 0.05, sz: 0.07, ry: d() * 6 }); }
    const ry = rng() * 3, c = [0xff7a6b, 0xffa94d][Math.floor(rng() * 2)];
    starfish(W, x, 0.022, z, c, ry, 1.1);
    if (d() < 0.5) crab(W, x + px + 0.3, 0, z + 0.2, d() * 6.283, 1.2);
  });
  // sea stacks out in the water
  scatterProps(W, 8, (x, z) => isl(x, z) > 4 && isl(x, z) < 24, (x, z) => {
    const h = 3 + rng() * 5, s = 1.4 + rng() * 1.6;
    put(W, GEO.cone(6), T.cliff, x, W.seaY + h / 2, z, { sx: s, sy: h, sz: s, ry: rng() * 3, tint: footTint(0.74, 1.12) });
    // a smaller spike beside it and rocks at the waterline
    const a = W.drng() * 6.283;
    put(W, GEO.cone(5), shade(T.cliff, 0.92), x + Math.cos(a) * s * 0.8, W.seaY + h * 0.22, z + Math.sin(a) * s * 0.8, { sx: s * 0.45, sy: h * 0.5, sz: s * 0.45, ry: a, tint: footTint(0.74, 1.1) });
    for (let k = 0; k < 3; k++) { const b = W.drng() * 6.283; put(W, GEO.rock(), T.cliff, x + Math.cos(b) * s * 1.05, W.seaY + 0.08, z + Math.sin(b) * s * 1.05, { sx: 0.6, sy: 0.4, sz: 0.5, ry: b }); }
  }, 6);
  Object.assign(W, SKIES.cove);
}

// ---------- moon: a grey cratered moon over the void, with a little moon base; very low gravity ----------
const MOON_G = 0.42;
function moon(W) {
  const { R, T, seed, rng, clearR } = W;
  const Rm = Math.max(13, clearR + 9, R * 0.95);
  const main = sdBlob(0, 0, Rm, seed, 0.8);
  W.walkSd = main; W.coastSd = main; W.radiusAt = main.radiusAt;
  W.hasSea = false; W.voidY = -7; W.gravityScale = MOON_G;
  W.bound = Rm * 1.12 + 1;
  W.topSound = 'stone';
  // craters: raised rims to bounce over, dark floors
  const craters = [];
  for (let i = 0; i < 60 && craters.length < (R > 20 ? 6 : 4); i++) {
    const rc = 1.8 + rng() * 2, a = rng() * Math.PI * 2, d0 = clearR + 3.5 + rc, d = d0 + rng() * Math.max(0, Rm - 2.5 - rc - d0);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (W.spawnPath(x, z, rc + 1.5) || main(x, z) > -(rc + 1.8) || craters.some(c => Math.hypot(c.x - x, c.z - z) < c.rc + rc + 2.5)) continue;
    craters.push({ x, z, rc, sd: (px, pz) => Math.abs(Math.hypot(px - x, pz - z) - rc) - 0.55 });
  }
  const RIM = 0.4;
  const onRim = (x, z) => craters.some(c => c.sd(x, z) < 0);
  W.floorAt = (x, z) => (main(x, z) > 0.05 ? null : onRim(x, z) ? RIM : 0);
  W.noTuft = onRim;
  W.tuftScale = 0.12;

  W.ground(main, { top: T.grass, side: T.cliff, depth: 3.2, taper: 1.0, jag: 0.6 });
  put(W, GEO.cone(9), T.dirt, 0, -3.15 - Rm * 0.55, 0, { sx: Rm - 1.1, sy: Rm * 1.1, sz: Rm - 1.1, rx: Math.PI });
  for (const c of craters) {
    const b = c.rc + 1.2;
    W.ground(c.sd, { y: RIM, top: T.cap, side: T.dirt, depth: RIM + 0.02, lip: 0.08, lipDepth: 0.1, rect: [c.x - b, c.z - b, c.x + b, c.z + b], cliffKind: 'solid', step: 0.25 });
    put(W, GEO.cyl(16), 0xa9a5ba, c.x, 0.012, c.z, { sx: c.rc - 0.5, sy: 0.02, sz: c.rc - 0.5, kind: 'fx' });
  }

  // the moon base: two domes joined by a tunnel, a landing pad, solar panels and a dish
  const base = W.sample((x, z) => !W.nearCentre(x, z, 5) && !W.spawnPath(x, z, 4) && main(x, z) < -4.5 && !craters.some(c => Math.hypot(c.x - x, c.z - z) < c.rc + 4)
    && W.flatAt(x, z, 3.6, 0.01) !== null && !W.blocked(x, z, 3.8, 0, 3), 400);
  if (base) {
    const { x, z } = base, a = Math.atan2(-x, -z) + Math.PI / 2, ux = Math.sin(a), uz = Math.cos(a);
    for (const [s, r] of [[-1, 1.9], [1, 1.4]]) {
      const dx = x + ux * s * 2.1, dz = z + uz * s * 2.1;
      put(W, GEO.dome(), 0xf2f4fa, dx, 0, dz, { sx: r, sy: r * 0.85, sz: r });
      put(W, GEO.cyl(16), 0x4cc9f0, dx, r * 0.42, dz, { sx: r + 0.02, sy: 0.14, sz: r + 0.02, kind: 'glow' });
      W.box(dx - r * 0.75, 0, dz - r * 0.75, dx + r * 0.75, r * 0.82, dz + r * 0.75, { sound: 'stone' });
    }
    putQ(W, GEO.cyl(10), 0xd9dce6, V.set(x, 0.5, z), Q.setFromEuler(E.set(Math.PI / 2, a, 0, 'YXZ')), new THREE.Vector3(0.5, 2.2, 0.5));
    W.obstacles.push({ x, z, r: 4.2 });
    // solar panels behind it
    const bx = x - Math.sin(a - Math.PI / 2) * 3.2, bz = z - Math.cos(a - Math.PI / 2) * 3.2;
    if (!W.blocked(bx, bz, 1.4, 0, 2)) for (const s of [-1, 1]) {
      const px = bx + ux * s * 1.1, pz = bz + uz * s * 1.1;
      put(W, GEO.cyl(6), 0x8f8aa3, px, 0.45, pz, { sx: 0.06, sy: 0.9, sz: 0.06 });
      put(W, GEO.box(), 0x2d3f9e, px, 0.95, pz, { sx: 0.9, sy: 0.05, sz: 1.3, ry: a, rx: 0.5 });
    }
  }
  const pad = W.sample((x, z) => !W.nearCentre(x, z, 4) && !W.spawnPath(x, z, 2.5) && main(x, z) < -4 && !onRim(x, z) && !craters.some(c => Math.hypot(c.x - x, c.z - z) < c.rc + 3)
    && W.flatAt(x, z, 2.4, 0.01) !== null && !W.blocked(x, z, 2.4, 0, 2) && !W.crowded(x, z, 2.6), 150);
  if (pad) {
    const { x, z } = pad;
    put(W, GEO.cyl(8), 0x5a5670, x, 0.03, z, { sx: 2.1, sy: 0.06, sz: 2.1, ry: Math.PI / 8, kind: 'fx' });
    put(W, GEO.box(), 0xffd23f, x - 0.45, 0.07, z, { sx: 0.18, sy: 0.02, sz: 1.3, kind: 'fx' });
    put(W, GEO.box(), 0xffd23f, x + 0.45, 0.07, z, { sx: 0.18, sy: 0.02, sz: 1.3, kind: 'fx' });
    put(W, GEO.box(), 0xffd23f, x, 0.07, z, { sx: 0.9, sy: 0.02, sz: 0.18, kind: 'fx' });
    W.obstacles.push({ x, z, r: 2.4 });
  }
  // tall mesas: one moon jump gets you on top
  scatterProps(W, R > 20 ? 4 : 3, (x, z) => !W.nearCentre(x, z, 3.5) && !W.spawnPath(x, z, 3) && main(x, z) < -2.5 && !onRim(x, z) && !craters.some(c => Math.hypot(c.x - x, c.z - z) < c.rc + 2.5)
    && W.flatAt(x, z, 1.8, 0.01) !== null && !W.blocked(x, z, 2, 0, 4) && !W.crowded(x, z, 2.4), (x, z) => {
    tower(W, x, z, 2.0 + rng() * 0.6, 2.0 + rng() * 0.6, 2.4 + rng() * 0.5, 0, 0, 0, 0, { body: T.cliff, cap: T.cap, lines: T.dirt, sound: 'stone' });
    W.obstacles.push({ x, z, r: 2 });
  }, 40);
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('rocks', Math.round(R * 0.6)), (x, z) => okTree(W, x, z, 1) && !onRim(x, z), (x, z) => rock(W, x, z, 0.25 + rng() * 0.55, 0));
  scatterProps(W, 4, (x, z) => okTree(W, x, z, 1.4) && !onRim(x, z), (x, z) => {
    const c = [0x6ee7ff, 0xb693f5][Math.floor(rng() * 2)], h = 0.8 + rng() * 0.8;
    put(W, GEO.octa(), c, x, h * 0.45, z, { sx: 0.25, sy: h * 0.6, sz: 0.25, ry: rng() * 3, kind: 'glow' });
    W.box(x - 0.25, 0, z - 0.25, x + 0.25, h * 0.8, z + 0.25, { sound: 'crystal' });
    W.obstacles.push({ x, z, r: 0.8 });
  });
  // a flag
  {
    const p = W.sample((x, z) => okTree(W, x, z, 2) && !onRim(x, z), 80);
    if (p) {
      put(W, GEO.cyl(6), 0xd9dce6, p.x, 1.1, p.z, { sx: 0.05, sy: 2.2, sz: 0.05 });
      put(W, GEO.box(), 0xffc93c, p.x + 0.45, 1.95, p.z, { sx: 0.9, sy: 0.55, sz: 0.03 });
      put(W, GEO.box(), 0x2a1f3d, p.x + 0.45, 1.95, p.z + 0.02, { sx: 0.3, sy: 0.3, sz: 0.03 });
      W.box(p.x - 0.1, 0, p.z - 0.1, p.x + 0.1, 2.2, p.z + 0.1);
    }
  }
  // distant moon rocks
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2, d = W.bound + 14 + rng() * 45, r = 1 + rng() * 3;
    put(W, GEO.rock(), T.cliff, Math.cos(a) * d, -10 + rng() * 26, Math.sin(a) * d, { sx: r, sy: r * 0.8, sz: r, rx: rng() * 3, ry: rng() * 3 });
  }
  Object.assign(W, SKIES.moon);
}

// ---------- cliffs: chalk sea cliffs with terraced hills, dry stone walls and cottages, kites in the sky; wind gusts ----------
function cliffs(W) {
  const { R, T, seed, rng, clearR } = W;
  const isl = sdBlob(0, 0, R, seed, 1.2);
  W.walkSd = isl; W.coastSd = isl; W.radiusAt = isl.radiusAt;
  W.seaY = -12;
  W.windDir = rng() * Math.PI * 2;
  W.extras = [];
  // two terraced hills
  const STEP_H = 0.45, RING = 1.8, hills = [];
  const th0 = -Math.PI / 2 + (rng() - 0.5) * 0.8;
  for (const a of [th0 - 1.3 - rng() * 0.3, th0 + 1.3 + rng() * 0.3]) {
    const rh = Math.min(clamp(R * 0.3, 4.5, 8.5), (R * 0.92 - 2.6 - clearR - 2.4) / 2);
    if (rh < 3.4) continue;
    const dmin = clearR + 2.4 + rh, dmax = R * 0.92 - 2.6 - rh;
    const d = dmin + rng() * Math.max(0, dmax - dmin);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    if (hills.some(h => Math.hypot(h.cx - cx, h.cz - cz) < h.rh + rh + 2)) continue;
    hills.push({ cx, cz, rh, sd: sdBlob(cx, cz, rh, seed + 3 + hills.length, 0.9), levels: rh > 6.2 ? 3 : 2 });
  }
  const levelAt = (h, x, z) => { const s = h.sd(x, z); return s < 0 ? Math.min(h.levels, 1 + Math.floor(-s / RING)) : 0; };
  W.floorAt = (x, z) => { let k = 0; for (const h of hills) k = Math.max(k, levelAt(h, x, z)); return k * STEP_H; };
  const onHill = (x, z, pad = 0) => hills.some(h => h.sd(x, z) < pad);

  W.ground(isl, { top: T.grass, side: T.cliff, depth: 22, jag: 0.5, taper: -0.25 });
  const tops = [0x8fd977, 0x9fe087, 0xafe797];
  for (const h of hills) {
    const rect = [h.cx - h.rh * 1.4, h.cz - h.rh * 1.4, h.cx + h.rh * 1.4, h.cz + h.rh * 1.4];
    for (let k = 1; k <= h.levels; k++) {
      W.ground((x, z) => h.sd(x, z) + (k - 1) * RING, { y: k * STEP_H, top: tops[k - 1], side: k % 2 ? T.cliff : 0xd9d2c2, depth: STEP_H + 0.02, lip: 0.1, lipDepth: 0.12, rect, cliffKind: 'solid', step: 0.4 });
    }
  }
  // dry stone walls with gaps, criss-crossing the flat ground
  const walls = [];
  scatterProps(W, Math.round(2 + R * 0.1), (x, z) => !W.nearCentre(x, z, 3.5) && !W.spawnPath(x, z, 3) && isl(x, z) < -5 && !onHill(x, z, 4.5)
    && !walls.some(w => Math.hypot(w.x - x, w.z - z) < 7), (x, z) => {
    const alongX = rng() < 0.5, L = 4 + rng() * 3;
    const ax = alongX ? x - L / 2 : x, az = alongX ? z : z - L / 2, bx = alongX ? x + L / 2 : x, bz = alongX ? z : z + L / 2;
    if ([0, 0.5, 1].some(t => isl(ax + (bx - ax) * t, az + (bz - az) * t) > -2 || onHill(ax + (bx - ax) * t, az + (bz - az) * t, 2) || W.blocked(ax + (bx - ax) * t, az + (bz - az) * t, 0.6, 0, 1))) return;
    walls.push({ x, z });
    for (let t = 0; t <= L; t += 0.5) {
      const px = ax + (bx - ax) * (t / L), pz = az + (bz - az) * (t / L);
      put(W, GEO.box(), rng() < 0.5 ? 0xa59f92 : 0x8f897d, px, 0.22, pz, { sx: 0.55, sy: 0.42, sz: 0.55, ry: rng() * 0.3 });
      put(W, GEO.box(), rng() < 0.5 ? 0xb9b3a6 : 0x9a9488, px + (rng() - 0.5) * 0.1, 0.58, pz, { sx: 0.5, sy: 0.32, sz: 0.48, ry: rng() * 0.4 });
    }
    W.box(Math.min(ax, bx) - 0.3, 0, Math.min(az, bz) - 0.3, Math.max(ax, bx) + 0.3, 0.75, Math.max(az, bz) + 0.3, { top: true, sound: 'stone' });
    W.obstacles.push({ x, z, r: L / 2 + 0.6 });
  });
  // whitewashed cottages with slate roofs
  scatterProps(W, R > 20 ? 2 : 1, (x, z) => !W.nearCentre(x, z, 6) && !W.spawnPath(x, z, 3.5) && isl(x, z) < -4 && !onHill(x, z, 3.5)
    && W.flatAt(x, z, 2.8, 0.01) !== null && !W.blocked(x, z, 2.8, 0, 3) && !W.crowded(x, z, 3.2), (x, z) => {
    const ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
    house(W, x, z, ry, { wall: 0xf7f3ea, roof: 0x4f5a6e, door: 0x2d6fb0, glass: 0x9fd4f2 });
  });
  plateauField(W, Math.round(2 + R * 0.1), { body: 0xd9d2c2, cap: T.cap, step: T.cliff, sound: 'stone' }, (x, z, ext) => !onHill(x, z, ext + 2));
  W.landmark(); // before the trees and rocks, which grow around it
  scatterProps(W, W.more('trees', Math.round(R * 0.4)), (x, z) => okTree(W, x, z) && !onHill(x, z, 0.5), (x, z) => tree(W, 'bent', x, z, 0.7 + rng() * 0.4, 0));
  scatterProps(W, W.more('rocks', Math.round(R * 0.35)), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.3 + rng() * 0.45, W.floorAt(x, z)));
  // kites dancing high above the island
  W.extras.push(() => {
    const kites = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const c = [[0xff6b6b, 0xffd23f], [0x4cc9f0, 0xfff8ec], [0x3ddc97, 0xff8fc7]][i];
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0).scale(0.8, 1.1, 0.06), toon(c[0]));
      const half = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0).scale(0.8, 1.1, 0.06), toon(c[1]));
      half.scale.set(0.5, 0.5, 1.2);
      g.add(diamond, half);
      const a = rng() * Math.PI * 2, d = 8 + rng() * (R * 0.6);
      const anchor = new THREE.Vector3(Math.cos(a) * d * 0.6, 0, Math.sin(a) * d * 0.6);
      const home = new THREE.Vector3(Math.cos(a) * d, 11 + rng() * 5, Math.sin(a) * d);
      const sg = new THREE.BufferGeometry().setFromPoints([anchor, home]);
      const line = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      line.layers.set(LAYER_FX);
      W.group.add(g, line);
      kites.push({ g, home, line, ph: rng() * 6 });
    }
    W.updaters.push((dt, t) => {
      const wx = W.wind?.x ?? 0, wz = W.wind?.z ?? 0;
      for (const k of kites) {
        k.g.position.set(k.home.x + Math.sin(t * 0.7 + k.ph) * 1.2 + wx * 2, k.home.y + Math.sin(t * 1.1 + k.ph) * 0.8, k.home.z + Math.cos(t * 0.6 + k.ph) * 1.2 + wz * 2);
        k.g.rotation.set(0, t * 0.2 + k.ph, Math.sin(t * 1.4 + k.ph) * 0.35);
        const p = k.line.geometry.attributes.position;
        p.setXYZ(1, k.g.position.x, k.g.position.y - 0.9, k.g.position.z);
        p.needsUpdate = true;
      }
    });
  });
  W.tuftScale = 1.2; W.sway = 1.6;
  gusts(W, { first: 6 + rng() * 3, len: 2.6, peak: 0.9, calm: [9, 7] });
  Object.assign(W, SKIES.cliffs);
  W.extras.push(() => leaves(W));
}

// ---------- hub: the small middle island of a world's archipelago, with the portal to other worlds ----------
// Bridges (built by archipelago.js) leave from its west, north and east sides; the portal stands on its south side.
function hub(W) {
  const { R, T, seed, rng } = W;
  const isl = sdBlob(0, 0, R, seed, 0.5);
  W.walkSd = isl; W.coastSd = isl; W.radiusAt = isl.radiusAt;
  const lay = T.layout;
  const floating = lay === 'starfall' || lay === 'moon';
  if (floating) {
    W.hasSea = false; W.voidY = -7; W.gravityScale = lay === 'moon' ? MOON_G : STAR_G;
    W.floorAt = (x, z) => (isl(x, z) < 0.05 ? 0 : null);
    W.ground(isl, { top: T.grass, side: T.cliff, depth: 3, taper: 1, jag: 0.5 });
    put(W, GEO.cone(9), T.dirt, 0, -2.9 - R * 0.55, 0, { sx: R - 1, sy: R * 1.1, sz: R - 1, rx: Math.PI });
  } else W.ground(isl, { top: T.grass, side: T.cliff, depth: Math.max(5, -W.seaY + 4), jag: 0.4 });
  if (lay === 'storm' || lay === 'cliffs') { W.windDir = rng() * Math.PI * 2; gusts(W, { first: 6, len: 2.6, peak: lay === 'storm' ? 1.0 : 0.8, calm: [9, 7] }); }
  // a round plaza of flagstones
  for (let i = 0; i < 360; i++) rng(); // (the draws the old scattered flagstones made: what follows stays as it was)
  plaza(W, 0, 0, 5.1, [0xd9cfbd, 0xc9bea9]);
  W.noTuft = (x, z) => Math.hypot(x, z) < 5.05;
  // the portal: a ring of stones in the world's colours on a stepped slab, a glowing keystone, and inside it the
  // way to the Keeper's Isle (js/portal.js)
  const pz = R - 3.2;
  W.portal = { x: 0, z: pz };
  portalRing(W, 0, pz, 0, [T.pedestal[0], T.pedestal[1]], T.pedestal[2]);
  block(W, T.pedestal[0], 0, 0.12, pz, 3.6, 0.24, 1.3, { b: 0.04, tint: footTint(0.88, 1.03) });
  put(W, GEO.box(), T.pedestal[1], 0, 0.06, pz + 0.95, { sx: 2.6, sy: 0.12, sz: 0.7, kind: 'ground' });
  put(W, GEO.box(), T.pedestal[1], 0, 0.06, pz - 0.95, { sx: 2.6, sy: 0.12, sz: 0.7, kind: 'ground' });
  for (const s of [-1, 1]) W.box(s * 1.55 - 0.35, 0, pz - 0.3, s * 1.55 + 0.35, 3.4, pz + 0.3, { sound: 'stone' });
  W.extras = W.extras || [];
  W.extras.push(() => {
    const P = makePortal({ view: paintView(T, { isle: true, seed }), color: T.pedestal[2] });
    P.group.position.set(0, 1.85, pz);
    W.group.add(P.group);
    W.updaters.push((dt, t) => P.update(t, document.body.classList.contains('reduce-motion')));
  });
  W.obstacles.push({ x: 0, z: pz, r: 2.4 });
  // lamps and the world's own trees round the rim
  for (const a of [-0.6, 0.6, Math.PI - 0.5, Math.PI + 0.5]) {
    const x = Math.sin(a) * 5.4, z = -Math.cos(a) * 5.4;
    lampPost(W, x, z, 2.08, 0xffd27a);
    W.box(x - 0.15, 0, z - 0.15, x + 0.15, 2.4, z + 0.15);
  }
  const trees = { meadow: 'round', farm: 'round', frost: 'pine', frostwood: 'pine', reef: 'palm', cove: 'palm', starfall: 'crystal', moon: 'crystal', cliffs: 'bent', storm: 'bent' }[lay] || 'round';
  scatterProps(W, Math.round(R * 0.6), (x, z) => isl(x, z) < -1.2 && isl(x, z) > -3.5 && Math.abs(x) > 2.6 && Math.abs(z) > 2.6 && !W.crowded(x, z, 2) && !W.blocked(x, z, 0.9, 0, 3), (x, z) => tree(W, trees, x, z, 0.7 + rng() * 0.4, 0), 12);
  scatterProps(W, Math.round(R * 0.4), (x, z) => isl(x, z) < -0.8 && Math.hypot(x, z) > 5.5 && Math.abs(x) > 2.2 && Math.abs(z) > 2.2 && !W.crowded(x, z, 1), (x, z) => rock(W, x, z, 0.3 + rng() * 0.4, 0));
  // the world's own clouds (the hub holds the whole archipelago's sky), their ring following you most of the way
  // round it so every island has them about as near as a lone island would
  Object.assign(W, SKIES[lay] || {}, { cloudFollow: 0.75 });
}

// ---------- the Keeper's Isle (js/nexus.js): a floating plaza with a bridge out to every world's portal ----------
// opts.spokes: the bridges' directions (unit vectors { x, z }); trees keep clear of them, and a sign stands beside
// each one where it leaves the plaza (out.signs, filled in by nexus.js)
function floatingGround(W, isl) {
  const { R, T } = W;
  W.walkSd = isl; W.coastSd = isl; W.radiusAt = isl.radiusAt;
  W.hasSea = false; W.voidY = -9;
  W.floorAt = (x, z) => (isl(x, z) < 0.05 ? 0 : null);
  W.ground(isl, { top: T.grass, side: T.cliff, depth: 3, taper: 1, jag: 0.5 });
  put(W, GEO.cone(9), T.dirt, 0, -2.9 - R * 0.55, 0, { sx: R - 1, sy: R * 1.1, sz: R - 1, rx: Math.PI });
}
function keeper(W) {
  const { R, T, seed, rng } = W;
  const spokes = W.opts.spokes || [];
  const isl = sdBlob(0, 0, R, seed, 0.3);
  floatingGround(W, isl);
  const nearSpoke = (x, z, w) => spokes.some(u => x * u.x + z * u.z > 0 && Math.abs(x * u.z - z * u.x) < w);
  const stone = () => (rng() < 0.5 ? 0xe6dccb : 0xd6cab4);
  // a ring of flagstones round the Keeper's Lantern, and a path of them out to each bridge
  for (let i = 0; i < 80; i++) {
    const a = rng() * Math.PI * 2, r = 2.5 + rng() * 2.2;
    put(W, GEO.box(), stone(), Math.cos(a) * r, 0.015, Math.sin(a) * r, { sx: 0.5 + rng() * 0.4, sy: 0.04, sz: 0.45 + rng() * 0.3, ry: rng(), kind: 'fx' });
  }
  for (const u of spokes) {
    for (let r = 4.9; r < R + 0.5; r += 0.62) {
      const s = (rng() - 0.5) * 0.9, x = u.x * r + u.z * s, z = u.z * r - u.x * s;
      if (isl(x, z) < -0.3) put(W, GEO.box(), stone(), x, 0.015, z, { sx: 0.55 + rng() * 0.3, sy: 0.04, sz: 0.5 + rng() * 0.3, ry: rng(), kind: 'fx' });
    }
  }
  // in the middle, under the Keeper's Lantern (its crystal and the worlds' orbs are added by nexus.js): the flowery
  // hedge arch into Kubo's Garden on a round flower bed, facing the south where you first arrive (its portal: nexus.js)
  put(W, GEO.cyl(8), 0xb9ad98, 0, 0.04, 0, { sx: 2.6, sy: 0.08, sz: 2.6, ry: Math.PI / 8, kind: 'ground' });
  put(W, GEO.cyl(8), 0x7ccf6a, 0, 0.07, 0, { sx: 2.3, sy: 0.06, sz: 2.3, ry: Math.PI / 8, kind: 'ground' });
  portalRing(W, 0, 0, 0, [0x4f9e52, 0x63b862], 0xff8fc7);
  for (let k = 1; k < 14; k += 2) {
    const a = (k / 14) * Math.PI * 2, r = 1.55;
    for (const f of [-1, 1]) put(W, GEO.blob(), T.flowers[k % T.flowers.length], Math.cos(a) * r, 1.85 + Math.sin(a) * r + 0.2, f * 0.3, { sx: 0.14, sy: 0.14, sz: 0.14 });
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.45) continue; // the way in and out stays clear
    put(W, GEO.blob(), T.flowers[i % T.flowers.length], Math.sin(a) * 2.05, 0.18, Math.cos(a) * 2.05, { sx: 0.2, sy: 0.16, sz: 0.2 });
  }
  for (const s of [-1, 1]) W.box(s * 1.55 - 0.35, 0, -0.3, s * 1.55 + 0.35, 3.4, 0.3, { sound: 'stone' });
  W.obstacles.push({ x: 0, z: 0, r: 2.8 });
  // a sign beside each bridge head, facing the plaza
  W.out.signs = spokes.map(u => {
    const a = R - 2.2, s = 2.1, x = u.x * a + u.z * s, z = u.z * a - u.x * s;
    W.box(x - 0.4, 0, z - 0.4, x + 0.4, 1.4, z + 0.4);
    W.obstacles.push({ x, z, r: 1.0 });
    return { x, z, ry: Math.atan2(-u.x, -u.z) };
  });
  scatterProps(W, 9, (x, z) => { const r = Math.hypot(x, z); return r > 5.4 && isl(x, z) < -1.8 && !nearSpoke(x, z, 2.1) && !W.crowded(x, z, 1.9); },
    (x, z) => tree(W, 'round', x, z, 0.6 + rng() * 0.3, 0), 14);
  W.extraFlowers = [];
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = 4.8 + rng() * (R - 5.5), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isl(x, z) < -0.8 && !nearSpoke(x, z, 1.5) && !W.crowded(x, z, 0.3)) W.extraFlowers.push({ x, y: 0, z, c: T.flowers[i % T.flowers.length], s: 1.4 });
  }
  W.clouds = 20; W.cloudR = 55; W.cloudY = -14; W.cloudScale = 1.3;
}

// a portal's ring of stones (two colours, a little bevel of the second on each), standing at (x, z) across ry, with a
// keystone on top holding a gem of the portal's light and two small gems where the ring meets its pillars
function portalRing(W, x, z, ry, cols, light) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, y, lz = 0) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 1.55;
    // each stone bevelled, and a slimmer band of the other colour set into its face
    putL(W, GEO.bevel(0.09), cols[k % 2], ...at(Math.cos(a) * r, 1.85 + Math.sin(a) * r), { sx: 0.66, sy: 0.66, sz: 0.5, ry, rz: a });
    putL(W, GEO.box(), cols[(k + 1) % 2], ...at(Math.cos(a) * r, 1.85 + Math.sin(a) * r), { sx: 0.2, sy: 0.4, sz: 0.53, ry, rz: a });
  }
  putL(W, GEO.bevel(0.09), cols[1], ...at(0, 1.85 + 1.62), { sx: 0.86, sy: 0.72, sz: 0.64, ry });
  // a foot under each side of the ring
  for (const side of [-1, 1]) putL(W, GEO.bevel(0.08), cols[0], ...at(side * 1.55, 0.36), { sx: 0.86, sy: 0.5, sz: 0.66, ry });
  // gems on both faces (you see the portal from either side)
  for (const f of [-1, 1]) {
    put(W, GEO.octa(), light, ...at(0, 1.85 + 1.62, f * 0.33), { sx: 0.2, sy: 0.3, sz: 0.1, ry, kind: 'glow' });
    for (const side of [-1, 1]) put(W, GEO.octa(), light, ...at(side * 1.62, 1.85, f * 0.27), { sx: 0.12, sy: 0.2, sz: 0.07, ry, kind: 'glow' });
  }
}

// a world's islet off the Keeper's Isle: its own ground and trees, its portal on the far side facing the plaza,
// lamps in the world's colour where the bridge lands and four spots for little pedestals (out.minis: nexus.js
// stands the world's rebuilt figures on them). opts.dir points away from the plaza; opts.garden makes it the
// flowery hedge arch into Kubo's Garden
function gate(W) {
  const { R, T, seed, rng } = W;
  const { dir: u = { x: 0, z: 1 }, garden = false } = W.opts;
  const isl = sdBlob(0, 0, R, seed, 0.45);
  floatingGround(W, isl);
  const at = (a, s) => [u.x * a + u.z * s, u.z * a - u.x * s]; // along the bridge's line, across it
  const ry = Math.atan2(u.x, u.z);
  // the portal: a ring of stones (a hedge for the Garden) on a low slab
  const pa = R - 2.3, [px, pz] = at(pa, 0);
  W.out.portal = { x: px, z: pz, ry };
  const ring = garden ? [0x4f9e52, 0x63b862] : [T.pedestal[0], T.pedestal[1]];
  portalRing(W, px, pz, ry, ring, garden ? 0xff8fc7 : T.pedestal[2]);
  if (garden) {
    for (let k = 1; k < 14; k += 2) {
      const a = (k / 14) * Math.PI * 2, r = 1.55, [x, z] = at(pa, Math.cos(a) * r), y = 1.85 + Math.sin(a) * r;
      put(W, GEO.blob(), T.flowers[k % T.flowers.length], x - u.x * 0.3, y + 0.2, z - u.z * 0.3, { sx: 0.13, sy: 0.13, sz: 0.13 });
    }
  }
  put(W, GEO.box(), garden ? 0xb07a50 : T.pedestal[0], px, 0.12, pz, { sx: 3.6, sy: 0.24, sz: 1.3, ry });
  for (const s of [-1, 1]) {
    const [x, z] = at(pa, s * 1.55);
    W.box(x - 0.35, 0, z - 0.35, x + 0.35, 3.4, z + 0.35, { sound: 'stone' });
    put(W, GEO.octa(), T.pedestal[2], x, 3.55, z, { sx: 0.16, sy: 0.3, sz: 0.16, kind: 'glow' });
  }
  W.obstacles.push({ x: px, z: pz, r: 2.4 });
  // lamps in the world's colour where the bridge lands
  for (const s of [-1, 1]) {
    const [x, z] = at(-R + 1.2, s * 1.75);
    lampPost(W, x, z, 1.9, T.pedestal[2]);
    W.box(x - 0.15, 0, z - 0.15, x + 0.15, 2.3, z + 0.15);
    W.obstacles.push({ x, z, r: 0.8 });
  }
  // a clear path from the bridge to the portal
  const onPath = (x, z) => Math.abs(x * u.z - z * u.x) < 2 && x * u.x + z * u.z < pa;
  W.out.minis = [];
  if (!garden) {
    for (const deg of [-115, -64, 64, 115]) {
      const th = (deg * Math.PI) / 180, r = R - 1.95, [x, z] = at(Math.cos(th) * r, Math.sin(th) * r);
      W.box(x - 0.5, 0, z - 0.5, x + 0.5, 0.55, z + 0.5, { sound: 'stone' });
      W.obstacles.push({ x, z, r: 0.75 });
      W.out.minis.push({ x, z, ry: Math.atan2(-x, -z) });
    }
  }
  const kind = garden ? 'round' : T.trees;
  scatterProps(W, garden ? 6 : 5, (x, z) => isl(x, z) < -0.9 && !onPath(x, z) && !W.crowded(x, z, 0.9),
    (x, z) => tree(W, kind, x, z, (kind === 'palm' ? 0.5 : 0.55) + rng() * 0.25, 0), 16);
  scatterProps(W, 3, (x, z) => isl(x, z) < -0.7 && !onPath(x, z) && !W.crowded(x, z, 0.8), (x, z) => rock(W, x, z, 0.25 + rng() * 0.25, 0, T.rockShape, false));
  W.extraFlowers = [];
  if (garden) {
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (R - 0.8), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (isl(x, z) < -0.6 && !onPath(x, z) && !W.crowded(x, z, 0.2)) W.extraFlowers.push({ x, y: 0, z, c: T.flowers[i % T.flowers.length], s: 1.5 });
    }
  }
  W.tuftScale = 0.35;
}

export const LAYOUTS = { hub, keeper, gate, classic, meadow, farm, frost, frostwood, reef, cove, starfall, moon, cliffs, storm };
