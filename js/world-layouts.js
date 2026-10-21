// Island generators, one per chapter world. Each fills the shared builder `W` (see buildWorld):
// ground shapes (W.walkSd / W.floorAt), colliders + tops, decoration into the merged batch W.B,
// and optional gameplay twists (W.surfaceAt, W.gravityScale, W.wind, W.pads, W.voidY).
import * as THREE from 'three';
import { LAYER_FX, LAYER_OVERLAY, toon } from './render.js';
import { GEO, contours, topGeometry, sdBlob, sdBox, sdEllipse, sdCapsule, sdUnion } from './world-kit.js';
import { GRAVITY } from './player.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const Q = new THREE.Quaternion(), V = new THREE.Vector3(), M = new THREE.Matrix4(), E = new THREE.Euler();

// ---------- shared props ----------
function put(W, geo, color, x, y, z, o = {}) { W.B.put(geo, color, x, y, z, o); }
function putQ(W, geo, color, pos, q, scale, kind = 'solid') { M.compose(pos, q, scale); W.B.add(geo, color, M, kind); }

function tree(W, kind, x, z, s, y = W.floorAt(x, z) ?? 0) {
  const { T, rng } = W;
  const leaf = () => T.leaves[Math.floor(rng() * T.leaves.length)];
  if (kind === 'round' || kind === 'bent') {
    // bent: storm trees lean away from the prevailing wind
    const a = kind === 'bent' ? (W.windDir ?? 0) + (rng() - 0.5) * 0.6 : 0;
    const tilt = kind === 'bent' ? 0.22 + rng() * 0.12 : 0;
    const dx = Math.cos(a), dz = Math.sin(a);
    const q = new THREE.Quaternion().setFromAxisAngle(V.set(dz, 0, -dx).normalize(), tilt);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    putQ(W, GEO.cyl(7), T.trunk, new THREE.Vector3(x, y, z).addScaledVector(up, 1.1 * s), q, new THREE.Vector3(0.22 * s, 2.2 * s, 0.22 * s));
    const lc = leaf();
    const blobs = kind === 'bent' ? 2 : 2 + Math.floor(rng() * 2);
    for (let i = 0; i < blobs; i++) {
      const bs = (1.25 - i * 0.28) * s * (kind === 'bent' ? 0.85 : 1);
      const c = new THREE.Vector3(x, y, z).addScaledVector(up, (2.4 + i * 0.95) * s);
      c.x += (rng() - 0.5) * 0.4 * s + dx * i * 0.35 * s; c.z += (rng() - 0.5) * 0.4 * s + dz * i * 0.35 * s;
      put(W, GEO.blob(), lc, c.x, c.y, c.z, { sx: bs * (kind === 'bent' ? 1.25 : 1), sy: bs * 0.9, sz: bs, rx: rng() * 3, ry: rng() * 3, rz: rng() * 3 });
    }
  } else if (kind === 'pine') {
    put(W, GEO.cyl(7), T.trunk, x, y + 0.8 * s, z, { sx: 0.22 * s, sy: 2.2 * s, sz: 0.22 * s });
    const lc = leaf();
    for (let i = 0; i < 3; i++) {
      const r = (1.5 - i * 0.38) * s, h = (1.6 - i * 0.2) * s, ry = rng() * 3, cy = y + (1.6 + i * 0.95) * s;
      put(W, GEO.cone(7), lc, x, cy, z, { sx: r, sy: h, sz: r, ry });
      put(W, GEO.cone(7), 0xffffff, x, cy + h * 0.3, z, { sx: r * 0.55, sy: h * 0.42, sz: r * 0.55, ry });
    }
  } else if (kind === 'palm') {
    const dir = rng() * Math.PI * 2, lean = (0.9 + rng() * 0.6) * s, h = 3.6 * s;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h * 0.6, z), new THREE.Vector3(x + Math.cos(dir) * lean, y + h, z + Math.sin(dir) * lean));
    const tube = new THREE.TubeGeometry(curve, 8, 0.17 * s, 6);
    W.B.add(tube, T.trunk);
    tube.dispose();
    const top = new THREE.Vector3(x + Math.cos(dir) * lean, y + h, z + Math.sin(dir) * lean);
    const lc = leaf();
    const frond = frondGeo();
    for (let i = 0; i < 6; i++) {
      E.set(0, (i / 6) * Math.PI * 2 + rng() * 0.3, -0.45 - rng() * 0.2, 'YZX');
      putQ(W, frond, lc, top, Q.setFromEuler(E), V.set(s, s, s));
    }
    for (let i = 0; i < 3; i++) put(W, GEO.ico(), 0x6b4a36, top.x + Math.cos(i * 2.1) * 0.2, top.y - 0.15, top.z + Math.sin(i * 2.1) * 0.2, { sx: 0.15, sy: 0.15, sz: 0.15 });
  } else {
    // crystal cluster
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const c = T.leaves[Math.floor(rng() * T.leaves.length)];
      const h = (1.2 + rng() * 1.6) * s;
      const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 0.35 * s;
      put(W, GEO.octa(), c, x + Math.cos(a) * r, y + h * 0.75, z + Math.sin(a) * r, { sx: 0.35 * s, sy: h, sz: 0.35 * s, rx: (rng() - 0.5) * 0.5, ry: rng() * 3, rz: (rng() - 0.5) * 0.5, kind: 'glow' });
    }
  }
  W.box(x - 0.3 * s, y, z - 0.3 * s, x + 0.3 * s, y + 3.5 * s, z + 0.3 * s, { sound: 'wood' });
  W.obstacles.push({ x, z, r: 0.5 });
}
let _frond = null;
const frondGeo = () => _frond || (_frond = (() => { const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1.4, 0.12, 0.42); g.translate(1.2, 0, 0); return g; })());

function rock(W, x, z, s, y = W.floorAt(x, z) ?? 0, shape = W.T.rockShape, collide = true) {
  const { T, rng } = W;
  if (shape === 'ice') {
    for (let i = 0; i < 3; i++) {
      const h = (1 + rng() * 1.2) * s * 1.6;
      put(W, GEO.cone(5), T.rock, x + (rng() - 0.5) * s, y + h / 2, z + (rng() - 0.5) * s, { sx: s * 0.5, sy: h, sz: s * 0.5, rx: (rng() - 0.5) * 0.4, ry: rng() * 3, rz: (rng() - 0.5) * 0.4 });
    }
  } else if (shape === 'coral') {
    const cc = [0xff9eb8, 0xff7a6b, 0xffb86b, 0xc98bff][Math.floor(rng() * 4)];
    for (let i = 0; i < 4; i++) {
      const h = (0.6 + rng() * 0.9) * s * 1.5;
      put(W, GEO.cyl(6), cc, x + (rng() - 0.5) * s, y + h / 2, z + (rng() - 0.5) * s, { sx: s * 0.2, sy: h, sz: s * 0.2, rx: (rng() - 0.5) * 0.7, rz: (rng() - 0.5) * 0.7 });
    }
  } else {
    put(W, GEO.rock(), T.rock, x, y + s * 0.35, z, { sx: s * 1.2, sy: s * 0.8, sz: s, rx: rng(), ry: rng() * 6, rz: rng() });
  }
  W.obstacles.push({ x, z, r: s + 0.3 });
  if (collide && s > 0.55) W.box(x - s, y, z - s, x + s, y + s * 0.9, z + s);
}

// a box tower with a cap; `steps` little boxes wind up one side (each 1.05 lower) so it can be climbed
function tower(W, x, z, w, d, h, base, ox, oz, steps, { body, cap, step = body, lines = null, sound = 'stone' }) {
  const block = (bx, bz, bw, bd, bh, color, isTop) => {
    put(W, GEO.box(), color, bx, base + (bh - 0.2) / 2, bz, { sx: bw, sy: bh - 0.2, sz: bd });
    put(W, GEO.box(), cap, bx, base + bh - 0.1, bz, { sx: bw + 0.16, sy: 0.2, sz: bd + 0.16 });
    if (lines) for (let ly = 0.7; ly < bh - 0.4; ly += 0.75) put(W, GEO.box(), lines, bx, base + ly, bz, { sx: bw + 0.04, sy: 0.07, sz: bd + 0.04 });
    W.box(bx - bw / 2 - 0.08, base, bz - bd / 2 - 0.08, bx + bw / 2 + 0.08, base + bh, bz + bd / 2 + 0.08, { top: isTop, sound });
  };
  block(x, z, w, d, h, body, true);
  const px = -oz, pz = ox;
  if (steps >= 1) block(x + ox * (w / 2 + 0.7), z + oz * (d / 2 + 0.7), 1.4, 1.4, h - 1.05, step, false);
  if (steps >= 2) block(x + ox * (w / 2 + 0.7) + px * 1.6, z + oz * (d / 2 + 0.7) + pz * 1.6, 1.4, 1.4, h - 2.1, step, false);
}

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
    const { px, pz, rp } = pond;
    const wl = contours((x, z) => pond.sd(x, z) + 0.02, px - rp * 1.5, pz - rp * 1.5, px + rp * 1.5, pz + rp * 1.5, 0.3);
    W.B.add(topGeometry(wl, -0.3), 0x5fcfe8, null, 'fx');
    // lily pads, some with a flower
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rp * 0.8;
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.abs(z - pz) < 1.1) continue;
      const s = 0.35 + rng() * 0.25;
      put(W, GEO.cyl(9), 0x4fae4a, x, -0.27, z, { sx: s, sy: 0.03, sz: s, kind: 'fx' });
      if (rng() < 0.4) put(W, GEO.ico(), 0xff9ec7, x, -0.18, z, { sx: 0.12, sy: 0.09, sz: 0.12, kind: 'fx' });
    }
    // reeds
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const x = px + Math.cos(a) * (rp + 0.1), z = pz + Math.sin(a) * (rp * 0.95);
      if (Math.abs(z - pz) < 1.3) continue;
      const h = 0.7 + rng() * 0.5;
      put(W, GEO.cyl(4), 0x5a9e48, x, -0.3 + h / 2, z, { sx: 0.03, sy: h, sz: 0.03, kind: 'fx' });
      put(W, GEO.cyl(6), 0x7a5236, x, -0.3 + h - 0.1, z, { sx: 0.06, sy: 0.22, sz: 0.06, kind: 'fx' });
    }
    // bridge: planks, beams, posts and rails
    const { x0, x1, z } = bridge;
    const L = x1 - x0, cx = (x0 + x1) / 2;
    put(W, GEO.box(), 0x8a5a3c, cx, 0.17, z, { sx: L, sy: 0.12, sz: 1.5 });
    for (let x = x0 + 0.25; x < x1; x += 0.5) put(W, GEO.box(), (Math.round((x - x0) * 2) % 2) ? 0xc08a5c : 0xb27b50, x, 0.26, z, { sx: 0.44, sy: 0.07, sz: 1.6 });
    const rx0 = pond.px - pond.rp * 1.2 - 0.2, rx1 = pond.px + pond.rp * 1.2 + 0.2;
    for (const s of [-1, 1]) {
      for (let x = rx0; x <= rx1 + 0.01; x += (rx1 - rx0) / Math.max(2, Math.round((rx1 - rx0) / 1.3))) put(W, GEO.box(), 0x7a4e32, x, 0.65, z + s * 0.8, { sx: 0.14, sy: 0.8, sz: 0.14 });
      put(W, GEO.box(), 0xc08a5c, (rx0 + rx1) / 2, 1.0, z + s * 0.8, { sx: rx1 - rx0 + 0.2, sy: 0.1, sz: 0.12 });
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
    const side = (ax, az, bx, bz, gapSide) => {
      // posts + two rails, with a 1.6 m opening in the middle of the open side
      const L = Math.hypot(bx - ax, bz - az);
      const segs = gapSide ? [[0, 0.5 - 0.8 / L], [0.5 + 0.8 / L, 1]] : [[0, 1]];
      for (const [t0, t1] of segs) {
        const sx = ax + (bx - ax) * t0, sz = az + (bz - az) * t0, ex = ax + (bx - ax) * t1, ez = az + (bz - az) * t1;
        const l = Math.hypot(ex - sx, ez - sz), along = Math.abs(ex - sx) > Math.abs(ez - sz);
        for (let k = 0; k <= Math.max(1, Math.round(l / 1.1)); k++) {
          const t = k / Math.max(1, Math.round(l / 1.1));
          put(W, GEO.box(), 0xf3e6cf, sx + (ex - sx) * t, y + 0.4, sz + (ez - sz) * t, { sx: 0.12, sy: 0.8, sz: 0.12 });
        }
        for (const ry of [0.35, 0.65]) put(W, GEO.box(), 0xf8efdc, (sx + ex) / 2, y + ry, (sz + ez) / 2, { sx: along ? l : 0.07, sy: 0.08, sz: along ? 0.07 : l });
        W.box(Math.min(sx, ex) - 0.07, y, Math.min(sz, ez) - 0.07, Math.max(sx, ex) + 0.07, y + 0.8, Math.max(sz, ez) + 0.07, { sound: 'wood' });
      }
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
    const bale = (bx, by, bz) => {
      put(W, GEO.cyl(10), 0xf2cf6b, bx, by + r, bz, { sx: r, sy: L, sz: r, rz: Math.PI / 2 });
      put(W, GEO.cyl(10), 0xe0b752, bx, by + r, bz, { sx: r * 0.75, sy: L + 0.02, sz: r * 0.75, rz: Math.PI / 2 });
      W.box(bx - L / 2, by, bz - r, bx + L / 2, by + r * 2, bz + r, { top: true, sound: 'grass' });
    };
    bale(x, y, z - r - 0.02); bale(x, y, z + r + 0.02);
    if (rng() < 0.7) bale(x, y + r * 2, z);
    W.obstacles.push({ x, z, r: 0.3 });
  });

  // a cottage at the edge of the island
  scatterProps(W, 1, (x, z) => !W.nearCentre(x, z, 6) && !W.spawnPath(x, z, 3) && W.walkSd(x, z) < -3 && W.walkSd(x, z) > -7
    && W.flatAt(x, z, 2.6, 0.01) !== null && !W.blocked(x, z, 2.6, W.floorAt(x, z), 4) && !W.crowded(x, z, 3), (x, z) => {
    const y = W.floorAt(x, z), ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
    const fwd = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    put(W, GEO.box(), 0xfff1dc, x, y + 1.0, z, { sx: 2.8, sy: 2.0, sz: 2.4, ry });
    // gable roof: a three-sided cylinder tipped onto its side with the apex up, ridge along the long wall
    putQ(W, GEO.cyl(3), 0xe0604f, V.set(x, y + 2.45, z), Q.setFromEuler(E.set(-Math.PI / 2, ry + Math.PI / 2, 0, 'YXZ')), new THREE.Vector3(1.75, 3.1, 1.0));
    put(W, GEO.box(), 0x9a6b4f, x + fwd.x * 1.21, y + 0.6, z + fwd.z * 1.21, { sx: 0.7, sy: 1.2, sz: 0.06, ry });
    for (const s of [-1, 1]) {
      const sx = Math.cos(ry) * s * 0.9, sz = -Math.sin(ry) * s * 0.9;
      put(W, GEO.box(), 0x7ec8f0, x + fwd.x * 1.21 + sx, y + 1.2, z + fwd.z * 1.21 + sz, { sx: 0.5, sy: 0.5, sz: 0.06, ry });
    }
    put(W, GEO.box(), 0xb8705a, x - fwd.x * 0.6 + Math.cos(ry) * 0.8, y + 3.0, z - fwd.z * 0.6 - Math.sin(ry) * 0.8, { sx: 0.35, sy: 0.9, sz: 0.35 });
    W.box(x - 1.45, y, z - 1.45, x + 1.45, y + 3.2, z + 1.45, { sound: 'wood' });
    W.obstacles.push({ x, z, r: 2.4 });
  });

  scatterProps(W, Math.round(R * 0.5), (x, z) => okTree(W, x, z), (x, z) => tree(W, 'round', x, z, 0.75 + rng() * 0.5));
  // bushes and rocks
  scatterProps(W, Math.round(R * 0.6), (x, z) => okTree(W, x, z, 1.0), (x, z) => {
    const y = W.floorAt(x, z), s = 0.45 + rng() * 0.35;
    put(W, GEO.blob(), T.leaves[Math.floor(rng() * 4)], x, y + s * 0.55, z, { sx: s * 1.2, sy: s, sz: s, ry: rng() * 3 });
    if (rng() < 0.5) for (let k = 0; k < 3; k++) put(W, GEO.ico(), T.flowers[Math.floor(rng() * T.flowers.length)], x + (rng() - 0.5) * s * 1.6, y + s * (0.7 + rng() * 0.4), z + (rng() - 0.5) * s * 1.6, { sx: 0.08, sy: 0.08, sz: 0.08 });
    W.obstacles.push({ x, z, r: s + 0.4 });
  });
  scatterProps(W, Math.round(R * 0.2), (x, z) => okTree(W, x, z, 1.0), (x, z) => rock(W, x, z, 0.3 + rng() * 0.4));
  W.clouds = 18; W.cloudScale = 1.35; W.cloudY = 18;
  W.extras = [() => butterflies(W)];
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
  scatterProps(W, 26, (x, z) => ice(x, z) < -0.8 && (islands(x, z) > 0.3 || (rink && rink(x, z) < -0.3)), (x, z) => {
    put(W, GEO.box(), 0xf0fbff, x, -0.045, z, { sx: 0.8 + rng() * 1.4, sy: 0.01, sz: 0.05, ry: rng() * 3, kind: 'fx' });
  });

  plateauField(W, Math.round(3 + R * 0.2), { body: 0x9fd4f2, cap: 0xffffff, step: 0xbfe4f8, sound: 'snow' }, (x, z, ext) => islands(x, z) < -(ext + 2.6) && ice(x, z) > ext + 2);
  // igloo on a satellite
  const ig = sats[(sats.indexOf(mid) + 1) % sats.length];
  {
    const p = W.sample((x, z) => ig.sd(x, z) < -3.4 && W.flatAt(x, z, 2.8, 0.01) !== null && !W.blocked(x, z, 2.8, 0, 3), 80);
    if (p) {
      const { x, z } = p, ry = Math.atan2(-x, -z);
      put(W, GEO.dome(), 0xeaf6ff, x, 0, z, { sx: 2.0, sy: 1.6, sz: 2.0 });
      for (const h of [0.45, 0.9, 1.3]) {
        const rr = 2.0 * Math.sqrt(1 - (h / 1.6) ** 2);
        put(W, GEO.cyl(14), 0xc6e2f6, x, h, z, { sx: rr + 0.02, sy: 0.05, sz: rr + 0.02 });
      }
      const fx = Math.sin(ry), fz = Math.cos(ry);
      put(W, GEO.cyl(10), 0xeaf6ff, x + fx * 1.9, 0.45, z + fz * 1.9, { sx: 0.65, sy: 1.0, sz: 0.65, rx: Math.PI / 2, ry, kind: 'solid' });
      put(W, GEO.cyl(10), 0x3a4a6a, x + fx * 2.4, 0.42, z + fz * 2.4, { sx: 0.42, sy: 0.05, sz: 0.42, rx: Math.PI / 2, ry });
      W.box(x - 1.45, 0, z - 1.45, x + 1.45, 1.4, z + 1.45, { sound: 'snow' });
      W.box(x - 0.9, 1.4, z - 0.9, x + 0.9, 1.65, z + 0.9, { sound: 'snow' });
      W.obstacles.push({ x, z, r: 2.6 }, { x: x + fx * 2, z: z + fz * 2, r: 0.9 });
    }
  }
  // pine forest along the shores
  scatterProps(W, Math.round(R * 0.95), (x, z) => islands(x, z) < -1.4 && islands(x, z) > -5 && ice(x, z) > 1.5 && okTree(W, x, z, 1.2),
    (x, z) => tree(W, 'pine', x, z, 0.8 + rng() * 0.55, 0), 10);
  // snow drifts and ice spikes
  scatterProps(W, Math.round(R * 0.6), (x, z) => islands(x, z) < -0.8 && ice(x, z) > 1 && okTree(W, x, z, 0.8), (x, z) => {
    const s = 0.8 + rng() * 1.2;
    put(W, GEO.dome(), 0xfafcff, x, -0.05, z, { sx: s * 1.4, sy: 0.3 + rng() * 0.2, sz: s, ry: rng() * 3, kind: 'solid' });
    W.obstacles.push({ x, z, r: s + 0.3 });
  });
  scatterProps(W, Math.round(R * 0.3), (x, z) => islands(x, z) < -1 && ice(x, z) > 1 && okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.5 + rng() * 0.6, 0, 'ice'));
  // ice floes drifting on the dark water
  scatterProps(W, 30, (x, z) => coast(x, z) > 2 && coast(x, z) < 16, (x, z) => {
    const s = 0.6 + rng() * 1.6;
    put(W, GEO.cyl(6), 0xf3f9ff, x, W.seaY + 0.06, z, { sx: s, sy: 0.12, sz: s * (0.6 + rng() * 0.5), ry: rng() * 3, kind: 'fx' });
  }, 4);
  W.clouds = 9; W.cloudY = 22;
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
    put(W, GEO.box(), 0x9a6a46, cx, y - 0.1, cz, { sx: alongX ? L : w, sy: 0.2, sz: alongX ? w : L });
    for (let t = 0.2; t < L; t += 0.55) {
      const px = alongX ? Math.min(x0, x1) + t : cx, pz = alongX ? cz : Math.min(z0, z1) + t;
      put(W, GEO.box(), Math.round(t / 0.55) % 2 ? 0xc89466 : 0xb98257, px, y + 0.01, pz, { sx: alongX ? 0.46 : w + 0.1, sy: 0.04, sz: alongX ? w + 0.1 : 0.46 });
    }
    for (let t = 0.6; t < L; t += 1.6) for (const s of [-1, 1]) {
      const px = alongX ? Math.min(x0, x1) + t : cx + s * (w / 2 + 0.05), pz = alongX ? cz + s * (w / 2 + 0.05) : Math.min(z0, z1) + t;
      put(W, GEO.cyl(6), 0x7a5236, px, y - 0.4, pz, { sx: 0.13, sy: 1.1, sz: 0.13 });
    }
    W.box(Math.min(x0, x1) - (alongX ? 0 : w / 2), -0.8, Math.min(z0, z1) - (alongX ? w / 2 : 0), Math.max(x0, x1) + (alongX ? 0 : w / 2), y, Math.max(z0, z1) + (alongX ? w / 2 : 0), { sound: 'wood' });
    if (end) {
      const [ex, ez] = end, hw = 2.1, hd = 1.6;
      put(W, GEO.box(), 0x9a6a46, ex, y - 0.1, ez, { sx: hw * 2, sy: 0.2, sz: hd * 2 });
      put(W, GEO.box(), 0xc89466, ex, y + 0.01, ez, { sx: hw * 2 + 0.1, sy: 0.04, sz: hd * 2 + 0.1 });
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        put(W, GEO.cyl(6), 0x7a5236, ex + sx * hw, y - 0.1, ez + sz * hd, { sx: 0.15, sy: 1.6, sz: 0.15 });
        put(W, GEO.cyl(6), 0xffffff, ex + sx * hw, y + 0.6, ez + sz * hd, { sx: 0.16, sy: 0.12, sz: 0.16 });
      }
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
  scatterProps(W, Math.round(R * 0.6), (x, z) => isl(x, z) < -1.8 && lag(x, z) > 1.6 && okTree(W, x, z, 1.6), (x, z) => tree(W, 'palm', x, z, 0.85 + rng() * 0.45, 0), 10);
  scatterProps(W, 3, (x, z) => lag(x, z) > 2.5 && okTree(W, x, z, 3), (x, z) => {
    const cols = [[0xff6b6b, 0xffffff], [0x4cc9f0, 0xffffff], [0xffd23f, 0xff8fc7]][Math.floor(rng() * 3)];
    put(W, GEO.cyl(6), 0xf5f0e8, x, 1.1, z, { sx: 0.06, sy: 2.2, sz: 0.06 });
    put(W, GEO.cone(8), cols[0], x, 2.25, z, { sx: 1.4, sy: 0.55, sz: 1.4 });
    put(W, GEO.cone(8), cols[1], x, 2.4, z, { sx: 0.75, sy: 0.35, sz: 0.75, ry: Math.PI / 8 });
    put(W, GEO.box(), cols[0], x + 0.9, 0.06, z + 0.3, { sx: 0.8, sy: 0.04, sz: 1.6, ry: rng() });
    W.box(x - 0.12, 0, z - 0.12, x + 0.12, 2.2, z + 0.12);
    W.obstacles.push({ x, z, r: 1.6 });
  });
  scatterProps(W, Math.round(R * 1.6), (x, z) => isl(x, z) < -1 && lag(x, z) > 0.2 && !W.nearCentre(x, z, 0) && !W.crowded(x, z, 0.4), (x, z) => {
    if (rng() < 0.5) {
      put(W, GEO.dome(), [0xffd6e0, 0xfff1e0, 0xffc9a8][Math.floor(rng() * 3)], x, 0, z, { sx: 0.16, sy: 0.08, sz: 0.13, ry: rng() * 3, kind: 'fx' });
    } else {
      const c = [0xff7a6b, 0xffa94d, 0xff8fc7][Math.floor(rng() * 3)], ry = rng() * 3;
      for (let k = 0; k < 5; k++) put(W, GEO.box(), c, x + Math.cos(ry + k * 1.2566) * 0.09, 0.015, z + Math.sin(ry + k * 1.2566) * 0.09, { sx: 0.2, sy: 0.03, sz: 0.06, ry: -(ry + k * 1.2566), kind: 'fx' });
    }
  }, 3);
  // coral and seaweed on the lagoon floor
  scatterProps(W, Math.round(b * 2.2), (x, z) => lag(x, z) < -2.4 && !W.blocked(x, z, 0.8, -0.6, 2) && !W.crowded(x, z, 0.8), (x, z) => rock(W, x, z, 0.22 + rng() * 0.18, W.floorAt(x, z), 'coral', false));
  // tall sea stacks out in the sea
  scatterProps(W, 7, (x, z) => isl(x, z) > 5 && isl(x, z) < 22, (x, z) => {
    let y = W.seaY - 0.5, s = 1.6 + rng() * 1.4;
    const h = 4 + rng() * 6;
    const cols = [0xc98a5e, 0xd8a070, 0xb87a52];
    for (let k = 0; y < h; k++) {
      const hh = 1.2 + rng() * 1.2;
      put(W, GEO.box(), cols[k % 3], x + (rng() - 0.5) * 0.4, y + hh / 2, z + (rng() - 0.5) * 0.4, { sx: s, sy: hh, sz: s * 0.9, ry: rng() });
      y += hh; s *= 0.88;
    }
    put(W, GEO.box(), 0x9edb6a, x, y + 0.12, z, { sx: s * 1.1, sy: 0.25, sz: s, ry: rng() });
    if (rng() < 0.5) { tree(W, 'palm', x, z, 0.6, y + 0.2); W.colliders.pop(); W.obstacles.pop(); }
  }, 6);
  W.clouds = 12; W.cloudY = 8; W.cloudScale = 1.2; W.cloudR = 90;
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
  scatterProps(W, Math.round(R * 0.55), (x, z) => okTree(W, x, z, 1.4), (x, z) => tree(W, 'crystal', x, z, 0.8 + rng() * 0.6, 0));
  // tall crystal spires at the rim
  scatterProps(W, 3, (x, z) => main(x, z) < -1.2 && main(x, z) > -3.5 && okTree(W, x, z, 1.2), (x, z) => {
    const c = T.leaves[Math.floor(rng() * 3)], h = 4 + rng() * 3;
    put(W, GEO.octa(), c, x, h * 0.5, z, { sx: 0.7, sy: h * 0.75, sz: 0.7, ry: rng() * 3, kind: 'glow' });
    put(W, GEO.octa(), c, x + 0.7, h * 0.3, z + 0.3, { sx: 0.4, sy: h * 0.4, sz: 0.4, rz: 0.3, kind: 'glow' });
    W.box(x - 0.6, 0, z - 0.6, x + 0.6, h, z + 0.6, { sound: 'crystal' });
    W.obstacles.push({ x, z, r: 1.4 });
  }, 12);
  scatterProps(W, Math.round(R * 0.25), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.3 + rng() * 0.4, 0));
  // distant floating rocks for depth
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, d = W.bound + 10 + rng() * 45, r = 1 + rng() * 3.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = -14 + rng() * 30;
    put(W, GEO.cyl(7), T.cap, x, y, z, { sx: r, sy: 0.4, sz: r });
    put(W, GEO.cone(7), T.dirt, x, y - 0.2 - r * 0.75, z, { sx: r * 0.9, sy: r * 1.5, sz: r * 0.9, rx: Math.PI });
    if (rng() < 0.5) put(W, GEO.octa(), T.leaves[i % 3], x, y + 0.8, z, { sx: 0.35, sy: 1.2, sz: 0.35, kind: 'glow' });
  }
  W.clouds = 0;
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
    for (const s of [-1, 1]) {
      put(W, GEO.box(), T.stone, s * 3.0, 2.0, gz, { sx: 0.9, sy: 4.0, sz: 0.9 });
      put(W, GEO.box(), T.stoneDark, s * 3.0, 0.15, gz, { sx: 1.2, sy: 0.3, sz: 1.2 });
      put(W, GEO.box(), T.stoneDark, s * 3.0, 3.95, gz, { sx: 1.15, sy: 0.25, sz: 1.15 });
      W.box(s * 3.0 - 0.6, 0, gz - 0.6, s * 3.0 + 0.6, 4.1, gz + 0.6);
    }
    put(W, GEO.box(), T.stone, 0, 4.45, gz, { sx: 7.4, sy: 0.75, sz: 1.2 });
    put(W, GEO.box(), T.moss, 0.6, 4.86, gz, { sx: 5.2, sy: 0.1, sz: 1.0 });
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
      put(W, GEO.box(), T.stone, x, h / 2, z, { sx: 0.95, sy: h, sz: 0.95 });
      put(W, GEO.box(), T.stoneDark, x, 0.12, z, { sx: 1.25, sy: 0.24, sz: 1.25 });
      if (h > 2) {
        put(W, GEO.box(), T.stoneDark, x, h + 0.12, z, { sx: 1.2, sy: 0.24, sz: 1.2 });
        W.box(x - 0.62, 0, z - 0.62, x + 0.62, h + 0.24, z + 0.62);
      } else {
        put(W, GEO.box(), T.stone, x + 0.1, h + 0.12, z - 0.1, { sx: 0.6, sy: 0.24, sz: 0.5, ry: rng() });
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
    for (const s of [-1, 1]) {
      const px = x + ax * s * 1.7, pz = z + az * s * 1.7;
      put(W, GEO.box(), T.stone, px, ph / 2, pz, { sx: 0.9, sy: ph, sz: 0.9 });
      W.box(px - 0.45, 0, pz - 0.45, px + 0.45, ph, pz + 0.45);
    }
    put(W, GEO.box(), T.stone, x, ph + 0.2, z, { sx: alongX ? L : 1.0, sy: 0.4, sz: alongX ? 1.0 : L });
    put(W, GEO.box(), T.moss, x, ph + 0.42, z, { sx: alongX ? L - 0.4 : 0.8, sy: 0.06, sz: alongX ? 0.8 : L - 0.4 });
    W.box(x - (alongX ? L / 2 : 0.5), ph, z - (alongX ? 0.5 : L / 2), x + (alongX ? L / 2 : 0.5), ph + 0.42, z + (alongX ? 0.5 : L / 2), { top: true, sound: 'stone' });
    // the stump sits off one end of the lintel
    const sx = x + ax * (L / 2 + 0.8), sz = z + az * (L / 2 + 0.8);
    put(W, GEO.box(), T.stoneDark, sx, 0.55, sz, { sx: 1.1, sy: 1.1, sz: 1.1 });
    W.box(sx - 0.55, 0, sz - 0.55, sx + 0.55, 1.1, sz + 0.55, { top: true, sound: 'stone' });
    W.obstacles.push({ x, z, r: 0.6 }, { x: sx, z: sz, r: 0.8 });
  });
  plateauField(W, Math.round(3 + R * 0.17), ruin);
  // fallen columns
  scatterProps(W, Math.round(R * 0.1), (x, z) => okTree(W, x, z, 2.5) && !W.blocked(x, z, 2, 0, 2), (x, z) => {
    const alongX = rng() < 0.5, L = 2.6;
    put(W, GEO.cyl(8), T.stone, x, 0.42, z, { sx: 0.42, sy: L, sz: 0.42, rx: alongX ? 0 : Math.PI / 2, rz: alongX ? Math.PI / 2 : 0 });
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
  scatterProps(W, Math.round(R * 0.3), (x, z) => okTree(W, x, z), (x, z) => tree(W, 'bent', x, z, 0.7 + rng() * 0.4, 0));
  scatterProps(W, Math.round(R * 0.45), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.35 + rng() * 0.5, 0));
  // jagged rocks rising from the sea
  scatterProps(W, 9, (x, z) => isl(x, z) > 4 && isl(x, z) < 30, (x, z) => {
    const h = 6 + rng() * 9, s = 1.5 + rng() * 2;
    put(W, GEO.cone(5), T.cliff, x, W.seaY + h / 2, z, { sx: s, sy: h, sz: s, ry: rng() * 3, rz: (rng() - 0.5) * 0.2 });
  }, 6);

  // wind gusts: every so often a gentle push, with leaves and rain blowing sideways
  W.tuftScale = 1.3; W.sway = 1.8;
  gusts(W, { first: 5 + rng() * 3, len: 3.0, peak: 1.1 });
  W.clouds = 26; W.cloudR = 45; W.cloudY = 24; W.cloudSpin = 0.045; W.cloudScale = 1.3;
  W.extras = [() => leaves(W)];
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

// a little house: walls, a gable roof along its width, door and two windows facing `ry`
function house(W, x, z, ry, { w = 2.8, d = 2.4, h = 2.0, roofH = 1.0, wall, roof, door = 0x7a4e32, glass = 0x7ec8f0, trim = null, y = W.floorAt(x, z) ?? 0 }) {
  const fwd = [Math.sin(ry), Math.cos(ry)], side = [Math.cos(ry), -Math.sin(ry)];
  put(W, GEO.box(), wall, x, y + h / 2, z, { sx: w, sy: h, sz: d, ry });
  const rs = (d / 2 + 0.3) / 0.866; // roof prism: tipped onto its side, apex up, ridge along the width
  putQ(W, GEO.cyl(3), roof, V.set(x, y + h + roofH * 0.5 - 0.05, z), Q.setFromEuler(E.set(-Math.PI / 2, ry + Math.PI / 2, 0, 'YXZ')), new THREE.Vector3(rs, w + 0.3, roofH));
  const fx = fwd[0] * (d / 2 + 0.01), fz = fwd[1] * (d / 2 + 0.01);
  put(W, GEO.box(), door, x + fx, y + 0.6, z + fz, { sx: 0.7, sy: 1.2, sz: 0.06, ry });
  for (const s of [-1, 1]) put(W, GEO.box(), glass, x + fx + side[0] * s * w * 0.3, y + 1.2, z + fz + side[1] * s * w * 0.3, { sx: 0.5, sy: 0.5, sz: 0.06, ry });
  if (trim) put(W, GEO.box(), trim, x, y + h - 0.06, z, { sx: w + 0.08, sy: 0.12, sz: d + 0.08, ry });
  const turned = Math.abs(Math.sin(ry)) > 0.5, ex = (turned ? d : w) / 2 + 0.05, ez = (turned ? w : d) / 2 + 0.05;
  W.box(x - ex, y, z - ez, x + ex, y + h + roofH, z + ez, { sound: 'wood' });
  W.obstacles.push({ x, z, r: Math.max(w, d) * 0.8 });
}

// a straight fence (posts + two rails) from a to b with a collider
function fence(W, ax, az, bx, bz, color = 0xc08a5c) {
  const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1));
  for (let k = 0; k <= n; k++) put(W, GEO.box(), 0x8a5a3c, ax + (bx - ax) * k / n, 0.4, az + (bz - az) * k / n, { sx: 0.13, sy: 0.8, sz: 0.13 });
  for (const y of [0.35, 0.65]) put(W, GEO.box(), color, (ax + bx) / 2, y, (az + bz) / 2, { sx: 0.07, sy: 0.09, sz: L, ry });
  W.box(Math.min(ax, bx) - 0.08, 0, Math.min(az, bz) - 0.08, Math.max(ax, bx) + 0.08, 0.85, Math.max(az, bz) + 0.08, { sound: 'wood' });
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
    put(W, GEO.box(), 0x9a6a46, x, 0.02, z, { sx: hx * 2, sy: 0.05, sz: hz * 2, kind: 'fx' });
    const across = alongX ? hz : hx, along = alongX ? hx : hz;
    for (let r = -across + 0.45; r < across - 0.2; r += 0.9) {
      put(W, GEO.box(), 0x7d5236, alongX ? x : x + r, 0.05, alongX ? z + r : z, { sx: alongX ? hx * 2 - 0.3 : 0.25, sy: 0.04, sz: alongX ? 0.25 : hz * 2 - 0.3, kind: 'fx' });
      for (let t = -along + 0.4; t < along - 0.3; t += 0.55) {
        const px = alongX ? x + t : x + r, pz = alongX ? z + r : z + t;
        if (crop === 0) put(W, GEO.cone(5), 0xf0c75a, px, 0.3, pz, { sx: 0.12, sy: 0.55, sz: 0.12, kind: 'fx' });
        else if (crop === 1) put(W, GEO.blob(), 0x7fcf5a, px, 0.14, pz, { sx: 0.2, sy: 0.16, sz: 0.2, kind: 'fx' });
        else { put(W, GEO.cone(4), 0x5fae4a, px, 0.2, pz, { sx: 0.1, sy: 0.32, sz: 0.1, kind: 'fx' }); put(W, GEO.cone(5), 0xff8a3d, px, 0.05, pz, { sx: 0.08, sy: 0.08, sz: 0.08, kind: 'fx' }); }
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
    house(W, x, z, ry, { w: 4.4, d: 3.6, h: 2.6, roofH: 1.6, wall: 0xd8524a, roof: 0x8a4a3a, door: 0xfff1dc, glass: 0xf2cf6b, trim: 0xfff1dc });
    // big barn doors with a white X
    const fx = x + fwd[0] * 1.83, fz = z + fwd[1] * 1.83;
    put(W, GEO.box(), 0xb8433d, fx, 0.95, fz, { sx: 1.7, sy: 1.9, sz: 0.06, ry });
    for (const r of [0.84, -0.84]) put(W, GEO.box(), 0xfff1dc, fx + fwd[0] * 0.03, 0.95, fz + fwd[1] * 0.03, { sx: 0.12, sy: 2.4, sz: 0.04, ry, rz: r });
    put(W, GEO.box(), 0xf2cf6b, fx + fwd[0] * 0.02, 2.9, fz + fwd[1] * 0.02, { sx: 0.8, sy: 0.6, sz: 0.06, ry }); // hay in the loft window
    const sx = x + side[0] * 3.3, sz = z + side[1] * 3.3;
    if (!W.blocked(sx, sz, 1.1, 0, 3)) {
      put(W, GEO.cyl(12), 0xd9d4e6, sx, 2.2, sz, { sx: 1.0, sy: 4.4, sz: 1.0 });
      for (const h of [1.1, 2.2, 3.3]) put(W, GEO.cyl(12), 0xb9b4c6, sx, h, sz, { sx: 1.03, sy: 0.12, sz: 1.03 });
      put(W, GEO.dome(), 0x8fa0c0, sx, 4.4, sz, { sx: 1.05, sy: 0.8, sz: 1.05 });
      W.box(sx - 1, 0, sz - 1, sx + 1, 5.1, sz + 1, { sound: 'stone' });
      W.obstacles.push({ x: sx, z: sz, r: 1.6 });
    }
  }

  // a windmill on the rim, its sails turning faster in the wind
  const mill = W.sample((x, z) => isl(x, z) < -2.4 && isl(x, z) > -5 && !W.spawnPath(x, z, 4) && !W.nearCentre(x, z, 7) && !inField(x, z, 3)
    && W.flatAt(x, z, 1.6, 0.01) !== null && !W.blocked(x, z, 1.8, 0, 3) && !W.crowded(x, z, 2.4), 150);
  if (mill) {
    const { x, z } = mill, a = Math.atan2(-x, -z);
    put(W, GEO.cyl(8), 0xf3e6cf, x, 2.1, z, { sx: 1.15, sy: 4.2, sz: 1.15 });
    put(W, GEO.cone(8), 0xb8433d, x, 4.8, z, { sx: 1.4, sy: 1.3, sz: 1.4 });
    put(W, GEO.box(), 0x7a4e3a, x + Math.sin(a) * 1.15, 0.65, z + Math.cos(a) * 1.15, { sx: 0.7, sy: 1.3, sz: 0.08, ry: a });
    W.box(x - 1.15, 0, z - 1.15, x + 1.15, 4.8, z + 1.15, { sound: 'wood' });
    W.obstacles.push({ x, z, r: 2 });
    W.extras.push(() => {
      const hub = new THREE.Group(), spin = new THREE.Group();
      hub.position.set(x + Math.sin(a) * 1.35, 4.1, z + Math.cos(a) * 1.35);
      hub.rotation.y = a;
      hub.add(spin);
      const wood = toon(0x8a5a3c), cloth = toon(0xfff8ec);
      spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8).rotateX(Math.PI / 2), wood));
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group();
        arm.rotation.z = (k * Math.PI) / 2;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.7, 0.08), wood); beam.position.y = 1.35;
        const sail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.0, 0.04), cloth); sail.position.set(0.36, 1.6, 0.02);
        arm.add(beam, sail);
        spin.add(arm);
      }
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
    for (let k = 0; k < 4; k++) {
      put(W, GEO.box(), 0xf2cf6b, x, k * 0.8 + 0.4, z, { sx: w - k * 0.06, sy: 0.76, sz: w - k * 0.06, ry: (k % 2) * 0.08 });
      put(W, GEO.box(), 0xd9aa48, x, k * 0.8 + 0.4, z, { sx: w - k * 0.06 + 0.02, sy: 0.08, sz: w - k * 0.06 + 0.02, ry: (k % 2) * 0.08 });
    }
    W.box(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, { top: true, sound: 'grass' });
    stacks.push({ x, z });
    W.obstacles.push({ x, z, r: 1.8 });
    bouncePad(W, x - (x / d) * 3.3, 0, z - (z / d) * 3.3, { x, y: h, z }, 1, (bx, by, bz) => {
      put(W, GEO.box(), 0x8a5a3c, bx, 0.1, bz, { sx: 1.9, sy: 0.2, sz: 1.9 });
      put(W, GEO.box(), 0xf7dc84, bx, 0.21, bz, { sx: 1.6, sy: 0.05, sz: 1.6 });
      for (const [ox, oz] of [[-0.6, -0.4], [0.4, 0.5], [0.1, -0.2]]) put(W, GEO.box(), 0xe0b752, bx + ox, 0.24, bz + oz, { sx: 0.5, sy: 0.02, sz: 0.06, ry: ox * 3 });
    });
  }, 40);

  // grazing sheep and round hay bales to hop on
  scatterProps(W, Math.round(2 + R * 0.12), (x, z) => okTree(W, x, z, 2) && !inField(x, z, 1.5), (x, z) => {
    const ry = rng() * Math.PI * 2, fx = Math.sin(ry), fz = Math.cos(ry);
    put(W, GEO.blob(), 0xfff8ec, x, 0.55, z, { sx: 0.55, sy: 0.42, sz: 0.7, ry });
    put(W, GEO.box(), 0x3a3352, x + fx * 0.65, 0.62, z + fz * 0.65, { sx: 0.28, sy: 0.32, sz: 0.3, ry });
    for (const [a, b] of [[0.25, 0.35], [-0.25, 0.35], [0.25, -0.35], [-0.25, -0.35]]) put(W, GEO.box(), 0x3a3352, x + Math.cos(ry) * a + fx * b, 0.15, z - Math.sin(ry) * a + fz * b, { sx: 0.09, sy: 0.3, sz: 0.09 });
    W.box(x - 0.5, 0, z - 0.5, x + 0.5, 0.8, z + 0.5, { sound: 'grass' });
    W.obstacles.push({ x, z, r: 0.9 });
  });
  scatterProps(W, Math.round(1 + R * 0.08), (x, z) => okTree(W, x, z, 2.5) && !inField(x, z, 2) && W.flatAt(x, z, 1.4, 0.01) !== null, (x, z) => {
    const r = 0.6, L = 1.2, alongX = rng() < 0.5;
    put(W, GEO.cyl(10), 0xf2cf6b, x, r, z, { sx: r, sy: L, sz: r, rz: alongX ? Math.PI / 2 : 0, rx: alongX ? 0 : Math.PI / 2 });
    put(W, GEO.cyl(10), 0xe0b752, x, r, z, { sx: r * 0.75, sy: L + 0.02, sz: r * 0.75, rz: alongX ? Math.PI / 2 : 0, rx: alongX ? 0 : Math.PI / 2 });
    W.box(x - (alongX ? L / 2 : r), 0, z - (alongX ? r : L / 2), x + (alongX ? L / 2 : r), r * 2, z + (alongX ? r : L / 2), { top: true, sound: 'grass' });
    W.obstacles.push({ x, z, r: 1.2 });
  });
  scatterProps(W, Math.round(R * 0.35), (x, z) => okTree(W, x, z) && !inField(x, z, 2), (x, z) => tree(W, 'round', x, z, 0.75 + rng() * 0.45, 0));
  scatterProps(W, Math.round(R * 0.4), (x, z) => okTree(W, x, z, 1) && !inField(x, z, 1), (x, z) => {
    const s = 0.45 + rng() * 0.3;
    put(W, GEO.blob(), T.leaves[Math.floor(rng() * T.leaves.length)], x, s * 0.55, z, { sx: s * 1.2, sy: s, sz: s, ry: rng() * 3 });
    W.obstacles.push({ x, z, r: s + 0.4 });
  });
  W.clouds = 16; W.cloudScale = 1.3; W.cloudY = 17;
}

// ---------- frostwood: a snowy pine forest, a log cabin and a frozen stream; deep snowdrifts slow you ----------
function frostwood(W) {
  const { R, T, seed, rng, clearR } = W;
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
  scatterProps(W, 14, (x, z) => stream(x, z) < -0.5 && isl(x, z) < -0.5, (x, z) => {
    put(W, GEO.box(), 0xf0fbff, x, -0.03, z, { sx: 0.6 + rng() * 0.9, sy: 0.01, sz: 0.05, ry: rng() * 3, kind: 'fx' });
  });

  // the log cabin, lights on
  const cab = W.sample((x, z) => !W.nearCentre(x, z, 5) && !W.spawnPath(x, z, 4) && isl(x, z) < -5 && stream(x, z) > 4 && !inDrift(x, z)
    && drifts.every(o => Math.hypot(o.x - x, o.z - z) > o.rd + 4) && W.flatAt(x, z, 3.2, 0.01) !== null && !W.blocked(x, z, 3.2, 0, 3), 150);
  if (cab) {
    const { x, z } = cab, ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * (Math.PI / 2);
    const fwd = [Math.sin(ry), Math.cos(ry)], side = [Math.cos(ry), -Math.sin(ry)];
    house(W, x, z, ry, { w: 3.4, d: 2.8, h: 2.1, roofH: 1.2, wall: 0x8a5a3c, roof: 0xfafcff, door: 0x5c3a28, glass: 0xffd27a });
    // log ends at the corners and a few log lines across the front
    for (const s of [-1, 1]) for (let y = 0.25; y < 2.1; y += 0.42) put(W, GEO.cyl(8), 0xb07a50, x + side[0] * s * 1.75 + fwd[0] * 1.45, y, z + side[1] * s * 1.75 + fwd[1] * 1.45, { sx: 0.2, sy: 0.25, sz: 0.2, rx: Math.PI / 2, ry });
    for (let y = 0.42; y < 2.1; y += 0.42) put(W, GEO.box(), 0x6b4a36, x + fwd[0] * 1.415, y, z + fwd[1] * 1.415, { sx: 3.42, sy: 0.05, sz: 0.04, ry });
    put(W, GEO.box(), 0x8f8aa8, x - side[0] * 1.0 - fwd[0] * 0.5, 3.1, z - side[1] * 1.0 - fwd[1] * 0.5, { sx: 0.5, sy: 1.4, sz: 0.5 }); // chimney
    // stacked firewood
    const wx = x + side[0] * 2.4 + fwd[0] * 0.6, wz = z + side[1] * 2.4 + fwd[1] * 0.6;
    for (let k = 0; k < 6; k++) put(W, GEO.cyl(7), k % 2 ? 0xb07a50 : 0x9a6b4f, wx + side[0] * ((k % 3) - 1) * 0.32, 0.17 + Math.floor(k / 3) * 0.3, wz + side[1] * ((k % 3) - 1) * 0.32, { sx: 0.16, sy: 1.0, sz: 0.16, rx: Math.PI / 2, ry });
    W.box(wx - 0.6, 0, wz - 0.6, wx + 0.6, 0.6, wz + 0.6, { sound: 'wood' });
  }

  // the forest: tall pines, stumps and snowy rocks
  plateauField(W, Math.round(2 + R * 0.12), { body: 0x9fb8dc, cap: 0xffffff, step: 0xbfd0ea, sound: 'snow' }, (x, z, ext) => stream(x, z) > ext + 2.5 && !inDrift(x, z));
  scatterProps(W, Math.round(R * 1.3), (x, z) => okTree(W, x, z, 1.2) && stream(x, z) > 1.8 && !inDrift(x, z), (x, z) => tree(W, 'pine', x, z, 0.9 + rng() * 0.7, 0), 10);
  scatterProps(W, Math.round(R * 0.25), (x, z) => okTree(W, x, z, 1) && stream(x, z) > 1.2 && !inDrift(x, z), (x, z) => {
    put(W, GEO.cyl(8), 0x8a5a3c, x, 0.25, z, { sx: 0.35, sy: 0.5, sz: 0.35 });
    put(W, GEO.cyl(8), 0xfafcff, x, 0.52, z, { sx: 0.37, sy: 0.06, sz: 0.37 });
    W.box(x - 0.35, 0, z - 0.35, x + 0.35, 0.55, z + 0.35, { top: false, sound: 'wood' });
    W.obstacles.push({ x, z, r: 0.7 });
  });
  scatterProps(W, Math.round(R * 0.25), (x, z) => okTree(W, x, z, 1) && stream(x, z) > 1.2 && !inDrift(x, z), (x, z) => {
    const s = 0.45 + rng() * 0.5;
    rock(W, x, z, s, 0);
    put(W, GEO.dome(), 0xffffff, x, s * 0.55, z, { sx: s * 0.85, sy: s * 0.35, sz: s * 0.8, ry: rng() * 3 });
  });
  W.clouds = 10; W.cloudY = 20; W.cloudScale = 1.2;
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
      put(W, GEO.dome(), 0xff9eb8, bx, 0, bz, { sx: 1.0, sy: 0.32, sz: 0.85, ry });
      put(W, GEO.dome(), 0xffc2d4, bx - Math.sin(ry) * 0.6, 0.18, bz - Math.cos(ry) * 0.6, { sx: 1.0, sy: 0.32, sz: 0.85, ry, rx: -1.0 });
      put(W, GEO.blob(), 0xfff8ec, bx, 0.2, bz, { sx: 0.2, sy: 0.2, sz: 0.2 });
    });
  }, 40);

  // the old shipwreck, half sunk in the bay
  {
    const wx = bR * 0.15, wz = bz - bR * 0.2, ry = 0.5 + rng() * 0.4;
    const hull = 0x6b4a36, plank = 0x8a5a3c;
    putQ(W, GEO.box(), hull, V.set(wx, W.seaY + 0.6, wz), Q.setFromEuler(E.set(0.12, ry, 0.35)), new THREE.Vector3(2.4, 1.6, 6.4));
    putQ(W, GEO.box(), plank, V.set(wx, W.seaY + 1.45, wz), Q.setFromEuler(E.set(0.12, ry, 0.35)), new THREE.Vector3(2.2, 0.12, 6.0));
    putQ(W, GEO.cone(4), hull, V.set(wx + Math.sin(ry) * 3.6, W.seaY + 0.75, wz + Math.cos(ry) * 3.6), Q.setFromEuler(E.set(Math.PI / 2, ry, 0.35, 'YXZ')), new THREE.Vector3(1.2, 1.6, 0.8));
    putQ(W, GEO.cyl(6), 0x5c3a28, V.set(wx - 0.6, W.seaY + 3.4, wz), Q.setFromEuler(E.set(0.15, ry, 0.55)), new THREE.Vector3(0.14, 5, 0.14));
    putQ(W, GEO.box(), 0xe9dfcf, V.set(wx - 1.2, W.seaY + 3.6, wz + 0.2), Q.setFromEuler(E.set(0.15, ry, 0.55)), new THREE.Vector3(0.05, 1.8, 1.6));
    for (let k = 0; k < 6; k++) put(W, GEO.box(), plank, wx + (rng() - 0.5) * bR, W.seaY + 0.05, wz + (rng() - 0.5) * bR * 1.5, { sx: 0.25, sy: 0.06, sz: 1 + rng(), ry: rng() * 3, kind: 'fx' });
  }

  // crates, barrels and lanterns along the beach
  scatterProps(W, Math.round(R * 0.3), (x, z) => land(x, z) < -1.5 && okTree(W, x, z, 1.5), (x, z) => {
    if (rng() < 0.5) {
      put(W, GEO.box(), 0xb07a50, x, 0.4, z, { sx: 0.8, sy: 0.8, sz: 0.8, ry: rng() });
      W.box(x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45, { top: true, sound: 'wood' });
    } else {
      put(W, GEO.cyl(10), 0x9a6b4f, x, 0.45, z, { sx: 0.38, sy: 0.9, sz: 0.38 });
      for (const h of [0.2, 0.7]) put(W, GEO.cyl(10), 0x5c5c6a, x, h, z, { sx: 0.4, sy: 0.06, sz: 0.4 });
      W.box(x - 0.38, 0, z - 0.38, x + 0.38, 0.9, z + 0.38, { sound: 'wood' });
    }
    W.obstacles.push({ x, z, r: 0.9 });
  });
  plateauField(W, Math.round(2 + R * 0.12), { body: T.cliff, cap: T.cap, step: T.dirt, sound: 'stone' }, (x, z, ext) => land(x, z) < -(ext + 2.2));
  scatterProps(W, Math.round(R * 0.4), (x, z) => okTree(W, x, z, 1.6), (x, z) => tree(W, 'palm', x, z, 0.8 + rng() * 0.4, 0), 10);
  scatterProps(W, Math.round(R * 0.45), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.35 + rng() * 0.55, 0));
  // tide pools with starfish
  scatterProps(W, Math.round(R * 0.25), (x, z) => land(x, z) < -1.5 && okTree(W, x, z, 1) && W.flatAt(x, z, 0.9, 0.01) !== null, (x, z) => {
    put(W, GEO.cyl(10), 0x3fc9d4, x, 0.015, z, { sx: 0.7 + rng() * 0.3, sy: 0.02, sz: 0.55 + rng() * 0.3, ry: rng() * 3, kind: 'fx' });
    const ry = rng() * 3, c = [0xff7a6b, 0xffa94d][Math.floor(rng() * 2)];
    for (let k = 0; k < 5; k++) put(W, GEO.box(), c, x + Math.cos(ry + k * 1.2566) * 0.09, 0.03, z + Math.sin(ry + k * 1.2566) * 0.09, { sx: 0.2, sy: 0.03, sz: 0.06, ry: -(ry + k * 1.2566), kind: 'fx' });
  });
  // sea stacks out in the water
  scatterProps(W, 8, (x, z) => isl(x, z) > 4 && isl(x, z) < 24, (x, z) => {
    const h = 3 + rng() * 5, s = 1.4 + rng() * 1.6;
    put(W, GEO.cone(6), T.cliff, x, W.seaY + h / 2, z, { sx: s, sy: h, sz: s, ry: rng() * 3 });
  }, 6);
  W.clouds = 14; W.cloudY = 18;
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
  scatterProps(W, Math.round(R * 0.6), (x, z) => okTree(W, x, z, 1) && !onRim(x, z), (x, z) => rock(W, x, z, 0.25 + rng() * 0.55, 0));
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
  W.clouds = 0;
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
  scatterProps(W, Math.round(R * 0.4), (x, z) => okTree(W, x, z) && !onHill(x, z, 0.5), (x, z) => tree(W, 'bent', x, z, 0.7 + rng() * 0.4, 0));
  scatterProps(W, Math.round(R * 0.35), (x, z) => okTree(W, x, z, 1), (x, z) => rock(W, x, z, 0.3 + rng() * 0.45, W.floorAt(x, z)));
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
  W.clouds = 22; W.cloudY = 16; W.cloudSpin = 0.03; W.cloudScale = 1.2;
  W.extras.push(() => leaves(W));
}

// ---------- hub: the small middle island of a world's archipelago, with the portal to other worlds ----------
// Bridges (built by archipelago.js) leave from its north side; the portal stands on its south side.
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
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, r = 1 + rng() * 4.2;
    put(W, GEO.box(), rng() < 0.5 ? 0xd9cfbd : 0xc9bea9, Math.cos(a) * r, 0.015, Math.sin(a) * r, { sx: 0.5 + rng() * 0.4, sy: 0.04, sz: 0.45 + rng() * 0.3, ry: rng(), kind: 'fx' });
  }
  // the portal: a stone ring standing on the south side, a swirl of light inside
  const pz = R - 3.2;
  W.portal = { x: 0, z: pz };
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 1.55;
    put(W, GEO.box(), k % 2 ? 0x9a96b4 : 0xb4b0cc, Math.cos(a) * r, 1.85 + Math.sin(a) * r, pz, { sx: 0.62, sy: 0.62, sz: 0.5, rz: a });
  }
  put(W, GEO.box(), 0x77728f, 0, 0.12, pz, { sx: 3.6, sy: 0.24, sz: 1.3 });
  for (const s of [-1, 1]) W.box(s * 1.55 - 0.35, 0, pz - 0.3, s * 1.55 + 0.35, 3.4, pz + 0.3, { sound: 'stone' });
  W.extras = W.extras || [];
  W.extras.push(() => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x9cf5ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), mat);
    disc.position.set(0, 1.85, pz);
    disc.layers.set(LAYER_FX);
    W.group.add(disc);
    W.updaters.push((dt, t) => { disc.rotation.z = t * 0.8; mat.opacity = 0.45 + Math.sin(t * 2.2) * 0.15; disc.scale.setScalar(1 + Math.sin(t * 1.7) * 0.04); });
  });
  W.obstacles.push({ x: 0, z: pz, r: 2.4 });
  // lamps and the world's own trees round the rim
  for (const a of [-0.6, 0.6, Math.PI - 0.5, Math.PI + 0.5]) {
    const x = Math.sin(a) * 5.4, z = -Math.cos(a) * 5.4;
    put(W, GEO.cyl(6), 0x5c5c6a, x, 1.1, z, { sx: 0.08, sy: 2.2, sz: 0.08 });
    put(W, GEO.box(), 0xffd27a, x, 2.3, z, { sx: 0.32, sy: 0.38, sz: 0.32, kind: 'glow' });
    W.box(x - 0.15, 0, z - 0.15, x + 0.15, 2.4, z + 0.15);
  }
  const trees = { meadow: 'round', farm: 'round', frost: 'pine', frostwood: 'pine', reef: 'palm', cove: 'palm', starfall: 'crystal', moon: 'crystal', cliffs: 'bent', storm: 'bent' }[lay] || 'round';
  scatterProps(W, Math.round(R * 0.6), (x, z) => isl(x, z) < -1.2 && isl(x, z) > -3.5 && Math.abs(x) > 2.6 && !W.crowded(x, z, 2) && !W.blocked(x, z, 0.9, 0, 3), (x, z) => tree(W, trees, x, z, 0.7 + rng() * 0.4, 0), 12);
  scatterProps(W, Math.round(R * 0.4), (x, z) => isl(x, z) < -0.8 && Math.hypot(x, z) > 5.5 && Math.abs(x) > 2.2 && !W.crowded(x, z, 1), (x, z) => rock(W, x, z, 0.3 + rng() * 0.4, 0));
  W.clouds = floating ? 0 : 16; W.cloudR = 100; W.cloudY = 18;
}

export const LAYOUTS = { hub, classic, meadow, farm, frost, frostwood, reef, cove, starfall, moon, cliffs, storm };
