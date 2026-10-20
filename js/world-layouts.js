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

export function tree(W, kind, x, z, s, y = W.floorAt(x, z) ?? 0) {
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

export function rock(W, x, z, s, y = W.floorAt(x, z) ?? 0, shape = W.T.rockShape, collide = true) {
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
      const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 1.1);
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
      return n;
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
    put(W, GEO.cyl(3), 0xe0604f, x, y + 2.45, z, { sx: 1.75, sy: 3.1, sz: 1.0, rz: Math.PI / 2, ry: ry + Math.PI / 2 });
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
function launchVel(from, to, extra = 1.6) {
  const g = GRAVITY * STAR_G;
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
  W.islets = islets;

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
    const sx = x + ax * (L / 2 + 0.8) + az * 0, sz = z + az * (L / 2 + 0.8);
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
  W.wind = new THREE.Vector3();
  W.tuftScale = 1.3; W.sway = 1.8;
  let calm = 5 + rng() * 3, gust = 0, dir = W.windDir;
  const LEN = 3.0, PEAK = 1.1;
  W.updaters.push((dt, t, cam, api) => {
    if (gust > 0) {
      gust -= dt;
      const k = Math.sin(Math.PI * clamp(1 - gust / LEN, 0, 1));
      W.wind.set(Math.cos(dir) * k * PEAK, 0, Math.sin(dir) * k * PEAK);
      if (gust <= 0) { W.wind.set(0, 0, 0); calm = 8 + Math.random() * 6; }
    } else if ((calm -= dt) <= 0) {
      gust = LEN;
      dir = W.windDir + (Math.random() - 0.5) * 1.4;
      api.onGust?.(dir);
    }
  });
  W.clouds = 26; W.cloudR = 45; W.cloudY = 24; W.cloudSpin = 0.045; W.cloudScale = 1.3;
  W.extras = [() => leaves(W)];
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

export const LAYOUTS = { classic, meadow, frost, reef, starfall, storm };
