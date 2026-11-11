// The models every world shares: the figure's pedestal, trees (round, wind-bent, pine, palm, crystal), rocks, the
// climbable box towers, little houses and fences. Each is built from a handful of simple shapes merged into the
// island's batch (W.B), with painted gradients (a dark foot, a light top, moss or snow on what faces up).
//
// A layout places these with its own random source (W.rng); every draw from it is made here in the order it always
// was, and all added detail draws from W.drng instead, so richer models never move what a layout places.
import * as THREE from 'three';
import { GEO, bevelBox, mergeGeos } from './world-kit.js';
import { toon, LAYER_FX } from './render.js';

const Q = new THREE.Quaternion(), V = new THREE.Vector3(), M = new THREE.Matrix4(), E = new THREE.Euler();
const C1 = new THREE.Color(), C2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export function put(W, geo, color, x, y, z, o = {}) { W.B.put(geo, color, x, y, z, o); }
export function putQ(W, geo, color, pos, q, scale, kind = 'solid', tint = null) { M.compose(pos, q, scale); W.B.add(geo, color, M, kind, tint); }
// like put, but turned about its own axes: the heading (ry) first, then pitch (rx) and roll (rz) in the turned frame
export function putL(W, geo, color, x, y, z, { sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, kind = 'solid', tint = null } = {}) {
  M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  W.B.add(geo, color, M, kind, tint);
}
// a one-off shape at a place (freed once merged)
export function own(W, geo, color, x, y, z, { ry = 0, rx = 0, rz = 0, kind = 'solid', tint = null } = {}) {
  M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  W.B.own(geo, color, M, kind, tint);
}
// a bevelled box of real size (the bevel stays b wide however long the box is)
export function block(W, color, x, y, z, w, h, d, { b = 0.05, ry = 0, rx = 0, rz = 0, kind = 'solid', tint = null } = {}) {
  own(W, bevelBox(w, h, d, Math.min(b, w * 0.3, h * 0.3, d * 0.3)), color, x, y, z, { ry, rx, rz, kind, tint });
}

// ---------- painted gradients (see Batch.add) ----------
export const shade = (hex, k) => C1.set(hex).multiplyScalar(k).getHex();
export const mix = (a, b, k) => C1.set(a).lerp(C2.set(b), k).getHex();
// darker at the foot, lighter at the top of the shape
export const footTint = (lo = 0.8, hi = 1.05) => (p, n, c, box) => {
  const k = (p.y - box.min.y) / Math.max(1e-3, box.max.y - box.min.y);
  c.multiplyScalar(lo + (hi - lo) * k);
};
// leaves: what faces the sky a little lighter and warmer, what faces down darker and cooler
export const leafTint = (amount = 1) => (p, n, c, box) => {
  const k = (p.y - box.min.y) / Math.max(1e-3, box.max.y - box.min.y);
  const t = n.y * 0.6 + (k - 0.5) * 0.8;
  if (t > 0) c.offsetHSL(-0.012 * t * amount, 0, 0.07 * t * amount);
  else c.offsetHSL(0.02 * -t * amount, 0.03 * -t * amount, -0.1 * -t * amount);
};
// what faces up takes another colour (moss, snow, sun-bleached), the foot goes darker
export const capTint = (cap, from = 0.5, foot = 0.82) => {
  const cc = new THREE.Color(cap);
  return (p, n, c, box) => {
    if (n.y > from) { c.lerp(cc, Math.min(1, (n.y - from) / 0.25)); return; }
    const k = (p.y - box.min.y) / Math.max(1e-3, box.max.y - box.min.y);
    c.multiplyScalar(foot + (1 - foot) * Math.min(1, k * 1.6));
  };
};
// what grows or lies on top of things in this world: moss on grass and stone, snow, bleached sand
export function capOf(T) {
  if (T.step === 'snow') return { color: T.cap ?? 0xffffff, from: 0.3 };
  if (T.step === 'sand') return { color: mix(T.rock, 0xffffff, 0.22), from: 0.55 };
  return { color: mix(T.rock, T.moss ?? T.tuft, 0.6), from: 0.55 };
}

// ---------- the pedestal ----------
// Two low steps of dressed stone (5.2 m and 4.2 m square, the top at 0.5 m) with a slim post at each corner. The
// colliders are the plain boxes they always were.
export function pedestal(W, [c1, c2, c3]) {
  const dark = shade(c1, 0.8), trim = shade(c2, 0.86);
  // a course of footing stones under the lower step, the two steps, an inlaid line round the top
  block(W, dark, 0, 0.03, 0, 5.36, 0.1, 5.36, { b: 0.03 });
  block(W, c1, 0, 0.14, 0, 5.2, 0.22, 5.2, { b: 0.045, tint: footTint(0.9, 1.03) });
  block(W, c2, 0, 0.375, 0, 4.2, 0.25, 4.2, { b: 0.045, tint: footTint(0.93, 1.03) });
  for (const s of [-1, 1]) {
    put(W, GEO.box(), trim, 0, 0.502, s * 1.82, { sx: 3.7, sy: 0.012, sz: 0.06, kind: 'ground' });
    put(W, GEO.box(), trim, s * 1.82, 0.502, 0, { sx: 0.06, sy: 0.012, sz: 3.58, kind: 'ground' });
  }
  // the joints between the stones of each step, and a stud of the world's accent in the middle of each side
  for (const [half, y, h, n] of [[2.6, 0.14, 0.2, 5], [2.1, 0.375, 0.23, 4]]) {
    for (let k = 1; k < n; k++) {
      const t = -half + (2 * half * k) / n;
      for (const s of [-1, 1]) {
        put(W, GEO.box(), dark, t, y, s * (half - 0.004), { sx: 0.035, sy: h, sz: 0.02 });
        put(W, GEO.box(), dark, s * (half - 0.004), y, t, { sx: 0.02, sy: h, sz: 0.035 });
      }
    }
  }
  // (and across the lower step's tread)
  for (let k = 1; k < 5; k++) {
    const t = -2.6 + (5.2 * k) / 5;
    if (Math.abs(t) > 2.05) continue;
    for (const s of [-1, 1]) {
      put(W, GEO.box(), dark, t, 0.251, s * 2.36, { sx: 0.03, sy: 0.008, sz: 0.46, kind: 'ground' });
      put(W, GEO.box(), dark, s * 2.36, 0.251, t, { sx: 0.46, sy: 0.008, sz: 0.03, kind: 'ground' });
    }
  }
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    put(W, GEO.octa(), c3, ax * 2.115, 0.375, az * 2.115, { sx: az ? 0.11 : 0.035, sy: 0.075, sz: ax ? 0.11 : 0.035 });
  }
  // slim corner posts with a ball on top: squat cubes in the accent colour read as loose blocks to grab
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = sx * 2.35, pz = sz * 2.35;
    block(W, c2, px, 0.31, pz, 0.3, 0.14, 0.3, { b: 0.03 });
    put(W, GEO.taper(10, 0.72), c2, px, 0.52, pz, { sx: 0.105, sy: 0.3, sz: 0.105, tint: footTint(0.88, 1.04) });
    put(W, GEO.cyl(10), trim, px, 0.665, pz, { sx: 0.125, sy: 0.04, sz: 0.125 });
    put(W, GEO.blob(), c3, px, 0.8, pz, { sx: 0.15, sy: 0.15, sz: 0.15 });
    W.box(px - 0.17, 0, pz - 0.17, px + 0.17, 0.9, pz + 0.17);
  }
  W.box(-2.6, 0, -2.6, 2.6, 0.25, 2.6, { sound: 'stone' });
  W.box(-2.1, 0, -2.1, 2.1, 0.5, 2.1, { sound: 'stone' });
}

// ---------- trees ----------
let _tier = null, _frond = null;
// one tier of a pine: a cone whose hem zigzags (boughs), closed underneath
const tierGeo = () => _tier || (_tier = (() => {
  const pos = [], N = 10, ring = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, out = i % 2 === 0;
    ring.push([Math.cos(a) * (out ? 1 : 0.76), out ? -0.5 : -0.36, Math.sin(a) * (out ? 1 : 0.76)]);
  }
  for (let i = 0; i < N; i++) {
    const a = ring[i], b = ring[(i + 1) % N];
    pos.push(0, 0.5, 0, ...b, ...a, 0, -0.3, 0, ...a, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
})());
// a palm frond: a broad leaf along +x that rises from the crown and droops at its tip, folded along its spine, its
// edge cut into leaflets; it has an upper and an under side
const frondGeo = () => _frond || (_frond = (() => {
  const pos = [], N = 7, L = 2.7;
  const spine = [], edge = [[], []];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = t * L, y = Math.sin(t * Math.PI * 0.62) * 0.42 - t * t * 0.95;
    const w = 0.66 * Math.pow(Math.sin(Math.PI * (0.05 + 0.95 * t)), 0.5) * (i % 2 ? 1 : 0.78);
    spine.push([x, y, 0]);
    for (const s of [0, 1]) edge[s].push([x + 0.16, y - 0.3 * w - 0.03, (s ? 1 : -1) * w]);
  }
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const under = p => [p[0], p[1] - 0.07, p[2]];
  for (let i = 0; i < N; i++) for (const s of [0, 1]) {
    const a = spine[i], b = spine[i + 1], c = edge[s][i + 1], d = edge[s][i];
    if (s) { tri(a, d, c); tri(a, c, b); tri(under(a), under(c), d); tri(under(a), under(b), under(c)); }
    else { tri(a, c, d); tri(a, b, c); tri(under(a), d, under(c)); tri(under(a), under(c), under(b)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
})());

export function tree(W, kind, x, z, s, y = W.floorAt(x, z) ?? 0) {
  const { T, rng } = W, d = W.drng;
  const leaf = () => T.leaves[Math.floor(rng() * T.leaves.length)];
  const base = new THREE.Vector3(x, y, z);
  if (kind === 'round' || kind === 'bent') {
    // bent: storm trees lean away from the prevailing wind
    const bent = kind === 'bent';
    const a = bent ? (W.windDir ?? 0) + (rng() - 0.5) * 0.6 : 0;
    const tilt = bent ? 0.22 + rng() * 0.12 : 0;
    const lc = leaf();
    const blobs = bent ? 2 : 2 + Math.floor(rng() * 2);
    const draws = [];
    for (let i = 0; i < blobs; i++) {
      const dr = [rng(), rng(), rng(), rng(), rng()];
      if (W.mood?.fruit && !bent) dr.push(rng(), rng(), rng());
      draws.push(dr);
    }
    const dx = Math.cos(a), dz = Math.sin(a);
    const q = new THREE.Quaternion().setFromAxisAngle(V.set(dz, 0, -dx).normalize(), tilt);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const at = h => base.clone().addScaledVector(up, h * s);
    // the trunk: wide at the foot with a few roots, narrowing up into the crown, a bough or two off its side
    putQ(W, GEO.taper(8, 0.58), T.trunk, at(1.25), q, new THREE.Vector3(0.3 * s, 2.5 * s, 0.3 * s), 'solid', footTint(0.74, 1.05));
    const roots = 3 + Math.floor(d() * 2), r0 = d() * 6;
    for (let k = 0; k < roots; k++) {
      const ra = r0 + (k / roots) * Math.PI * 2 + (d() - 0.5) * 0.5;
      E.set(0, -ra, -2.05 - d() * 0.15, 'YXZ');
      putQ(W, GEO.cone(5), shade(T.trunk, 0.88), V.set(x + Math.cos(ra) * 0.24 * s, y + 0.15 * s, z + Math.sin(ra) * 0.24 * s), Q.setFromEuler(E), new THREE.Vector3(0.2 * s, 0.5 * s, 0.2 * s));
    }
    for (let k = 0; k < (bent ? 1 : 2); k++) {
      const ba = d() * 6.283, c = at(1.75 + k * 0.35);
      E.set(0, -ba, -0.85, 'YXZ');
      putQ(W, GEO.taper(5, 0.5), shade(T.trunk, 0.92), c.add(V.set(Math.cos(ba) * 0.42 * s, 0.36 * s, Math.sin(ba) * 0.42 * s)), Q.setFromEuler(E), new THREE.Vector3(0.075 * s, 1.0 * s, 0.075 * s));
    }
    // the crown: one big leafy lump with smaller ones nestled round it and one on top, each its own shade
    const R = (bent ? 1.08 : 1.26) * s, C = at(bent ? 2.95 : 3.1);
    if (bent) { C.x += dx * 0.35 * s; C.z += dz * 0.35 * s; }
    const tone = k => C1.set(lc).offsetHSL(0, 0, k).getHex();
    const lump = (c, r, k, flat = 0.86, wide = 1) => put(W, GEO.lump(k), tone(((k % 3) - 1) * 0.035), c.x, c.y, c.z, { sx: r * 1.05 * wide, sy: r * flat, sz: r, ry: bent ? -a : draws[k % blobs][3] * 6, tint: leafTint() });
    lump(C, R, 0, 0.84, bent ? 1.25 : 1);
    const sats = (bent ? 2 : 3) + (blobs - 2) + (d() < 0.5 ? 1 : 0), a0 = d() * 6.283;
    for (let k = 0; k < sats; k++) {
      const sa = a0 + (k / sats) * Math.PI * 2 + (draws[k % blobs][0] - 0.5) * 0.7, sr = R * (0.52 + d() * 0.2);
      const c = C.clone().add(V.set(Math.cos(sa) * R * 0.72, (d() - 0.6) * R * 0.5, Math.sin(sa) * R * 0.72));
      if (bent) { c.x += dx * R * 0.3; c.z += dz * R * 0.3; }
      lump(c, sr, k + 1);
    }
    lump(C.clone().add(V.set((draws[0][1] - 0.5) * 0.3 * s + dx * (bent ? 0.5 : 0) * s, R * 0.62, (draws[0][2] - 0.5) * 0.3 * s + dz * (bent ? 0.5 : 0) * s)), R * 0.62, 2);
    // an orchard island's trees carry fruit
    if (W.mood?.fruit && !bent) {
      for (let i = 0; i < blobs; i++) for (let f = 0; f < 3; f++) {
        const fa = draws[i][5 + f] * 6.3, fy = -0.15 - d() * 0.5;
        const rr = R * Math.sqrt(Math.max(0.2, 1 - fy * fy)) * 1.02;
        put(W, GEO.ico(), W.mood.fruit, C.x + Math.cos(fa) * rr, C.y + fy * R * 0.84, C.z + Math.sin(fa) * rr, { sx: 0.14, sy: 0.14, sz: 0.14 });
      }
    }
  } else if (kind === 'pine') {
    const lc = leaf(), turns = [rng(), rng(), rng(), d()];
    put(W, GEO.taper(7, 0.5), T.trunk, x, y + 0.9 * s, z, { sx: 0.26 * s, sy: 2.2 * s, sz: 0.26 * s, tint: footTint(0.78, 1) });
    // four tiers of boughs, each smaller and lighter than the one below, snow lying on every one
    const tiers = [[1.56, 1.5, 1.55], [1.26, 1.4, 2.35], [0.96, 1.25, 3.05], [0.64, 1.15, 3.7]];
    tiers.forEach(([r, h, cy], i) => {
      const ry = turns[i] * 3;
      put(W, tierGeo(), C1.set(lc).offsetHSL(0, 0, (i - 1.5) * 0.022).getHex(), x, y + cy * s, z, { sx: r * s, sy: h * s, sz: r * s, ry, tint: footTint(0.84, 1.06) });
      put(W, tierGeo(), 0xffffff, x, y + (cy + h * 0.26) * s, z, { sx: r * 0.6 * s, sy: h * 0.5 * s, sz: r * 0.6 * s, ry, tint: footTint(0.9, 1) });
      // a few dollops of snow out on the boughs
      for (let k = 0; k < 2; k++) {
        const sa = ry + (Math.floor(d() * 5) * 2 * Math.PI) / 5, rr = r * 0.8 * s;
        put(W, GEO.dome(), 0xffffff, x + Math.cos(sa) * rr, y + (cy - h * 0.34) * s, z - Math.sin(sa) * rr, { sx: 0.24 * s, sy: 0.12 * s, sz: 0.2 * s, ry: sa });
      }
    });
  } else if (kind === 'palm') {
    const dir = rng() * Math.PI * 2, lean = (0.9 + rng() * 0.6) * s, h = 3.6 * s;
    const top = new THREE.Vector3(x + Math.cos(dir) * lean, y + h, z + Math.sin(dir) * lean);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h * 0.6, z), top);
    W.B.own(new THREE.TubeGeometry(curve, 8, 0.17 * s, 7), T.trunk, null, 'solid', footTint(0.8, 1.05));
    // the foot swells, and the trunk is ringed where old fronds fell away
    put(W, GEO.taper(8, 0.55), shade(T.trunk, 0.86), x, y + 0.22 * s, z, { sx: 0.3 * s, sy: 0.5 * s, sz: 0.3 * s });
    for (let k = 1; k <= 6; k++) {
      const t = k / 7, p = curve.getPoint(t), tg = curve.getTangent(t);
      putQ(W, GEO.cyl(8), shade(T.trunk, 0.8), p, Q.setFromUnitVectors(UP, tg), new THREE.Vector3(0.195 * s, 0.07 * s, 0.195 * s));
    }
    const lc = leaf();
    for (let i = 0; i < 6; i++) {
      E.set(0, (i / 6) * Math.PI * 2 + rng() * 0.3, 0.05 - rng() * 0.25, 'YZX');
      putQ(W, frondGeo(), i % 2 ? lc : C1.set(lc).offsetHSL(0, 0, -0.04).getHex(), top, Q.setFromEuler(E), V.set(s, s, s), 'solid', footTint(0.8, 1.08));
    }
    // younger fronds standing up between them
    for (let i = 0; i < 4; i++) {
      E.set(0, (i / 4) * Math.PI * 2 + 0.5 + d() * 0.4, 0.55 + d() * 0.3, 'YZX');
      putQ(W, frondGeo(), C1.set(lc).offsetHSL(-0.01, 0, 0.05).getHex(), top, Q.setFromEuler(E), V.set(s * 0.7, s * 0.7, s * 0.7), 'solid', footTint(0.84, 1.08));
    }
    for (let i = 0; i < 3; i++) put(W, GEO.ico(), 0x6b4a36, top.x + Math.cos(i * 2.1) * 0.2, top.y - 0.15, top.z + Math.sin(i * 2.1) * 0.2, { sx: 0.15, sy: 0.15, sz: 0.15 });
  } else {
    // crystal cluster: pointed shards leaning out of a nest of stones
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const c = T.leaves[Math.floor(rng() * T.leaves.length)];
      const h = (1.2 + rng() * 1.6) * s;
      const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 0.35 * s;
      put(W, GEO.shard(), c, x + Math.cos(a) * r, y - 0.05, z + Math.sin(a) * r, { sx: 0.3 * s, sy: h * 1.02, sz: 0.3 * s, rx: (rng() - 0.5) * 0.5, ry: rng() * 3, rz: (rng() - 0.5) * 0.5, kind: 'glow', tint: footTint(0.72, 1.18) });
    }
    for (let k = 0; k < 4; k++) {
      const ra = k * 1.6 + d(), rr = (0.42 + d() * 0.2) * s;
      put(W, GEO.rock(), shade(T.rock, 0.9), x + Math.cos(ra) * rr, y + 0.07 * s, z + Math.sin(ra) * rr, { sx: 0.2 * s, sy: 0.13 * s, sz: 0.17 * s, ry: d() * 6 });
    }
  }
  W.box(x - 0.3 * s, y, z - 0.3 * s, x + 0.3 * s, y + 3.5 * s, z + 0.3 * s, { sound: 'wood' });
  W.obstacles.push({ x, z, r: 0.5 });
  W.skirts.push({ x, z, y, r: 0.5 * s });
}

// ---------- rocks ----------
export function rock(W, x, z, s, y = W.floorAt(x, z) ?? 0, shape = W.T.rockShape, collide = true) {
  const { T, rng } = W, d = W.drng;
  if (shape === 'ice') {
    // a cluster of ice shards, pale at the tips, in a little heap of snow
    for (let i = 0; i < 3; i++) {
      const h = (1 + rng() * 1.2) * s * 1.6;
      put(W, GEO.shard(), T.rock, x + (rng() - 0.5) * s, y - 0.04, z + (rng() - 0.5) * s, { sx: s * 0.36, sy: h * 0.72, sz: s * 0.36, rx: (rng() - 0.5) * 0.4, ry: rng() * 3, rz: (rng() - 0.5) * 0.4, tint: footTint(0.82, 1.14) });
    }
    put(W, GEO.dome(), 0xffffff, x, y - 0.02, z, { sx: s * 0.95, sy: s * 0.22, sz: s * 0.85, ry: d() * 3 });
  } else if (shape === 'coral') {
    const cc = [0xff9eb8, 0xff7a6b, 0xffb86b, 0xc98bff][Math.floor(rng() * 4)];
    // branching coral: stems that fork, each ending in a knob
    for (let i = 0; i < 4; i++) {
      const h = (0.6 + rng() * 0.9) * s * 1.5;
      const px = x + (rng() - 0.5) * s, pz = z + (rng() - 0.5) * s, rx = (rng() - 0.5) * 0.7, rz = (rng() - 0.5) * 0.7;
      put(W, GEO.taper(6, 0.7), cc, px, y + h / 2, pz, { sx: s * 0.22, sy: h, sz: s * 0.22, rx, rz, tint: footTint(0.78, 1.08) });
      const tip = V.set(0, h, 0).applyEuler(E.set(rx, 0, rz)).add(new THREE.Vector3(px, y, pz));
      put(W, GEO.blob(), mix(cc, 0xffffff, 0.25), tip.x, tip.y, tip.z, { sx: s * 0.24, sy: s * 0.24, sz: s * 0.24 });
      const fa = d() * 6.283, fl = h * 0.45;
      put(W, GEO.taper(5, 0.7), cc, px + Math.cos(fa) * fl * 0.3, y + h * 0.62, pz + Math.sin(fa) * fl * 0.3, { sx: s * 0.13, sy: fl, sz: s * 0.13, rx: Math.sin(fa) * 0.7 + rx, rz: -Math.cos(fa) * 0.7 + rz });
    }
  } else {
    // a boulder with a couple of smaller stones against it; moss, snow or sun on what faces up
    const cap = capOf(T), tint = capTint(cap.color, cap.from);
    put(W, GEO.rock(), T.rock, x, y + s * 0.35, z, { sx: s * 1.2, sy: s * 0.8, sz: s, rx: rng(), ry: rng() * 6, rz: rng(), tint });
    const n = s > 0.45 ? 2 : 1, a0 = d() * 6.283;
    for (let k = 0; k < n; k++) {
      const a = a0 + k * (2 + d()), ss = s * (0.3 + d() * 0.22), rr = s * (0.95 + d() * 0.25);
      put(W, GEO.rock(), shade(T.rock, 0.93 + d() * 0.1), x + Math.cos(a) * rr, y + ss * 0.3, z + Math.sin(a) * rr, { sx: ss * 1.15, sy: ss * 0.75, sz: ss, rx: d(), ry: d() * 6, rz: d(), tint });
    }
    W.skirts.push({ x, z, y, r: s * 1.15 });
  }
  W.obstacles.push({ x, z, r: s + 0.3 });
  if (collide && s > 0.55) W.box(x - s, y, z - s, x + s, y + s * 0.9, z + s);
}

// ---------- towers ----------
// a box tower with a cap; `steps` little boxes wind up one side (each 1.05 lower) so it can be climbed. The body is
// a dressed block, darker at the foot, with the cap's stuff (grass, snow, moss) spilling a little way down its
// sides and loose stones at its feet.
export function tower(W, x, z, w, d, h, base, ox, oz, steps, { body, cap, step = body, lines = null, sound = 'stone' }) {
  const r = W.drng;
  const part = (bx, bz, bw, bd, bh, color, isTop) => {
    block(W, color, bx, base + (bh - 0.2) / 2, bz, bw, bh - 0.2, bd, { b: 0.07, tint: footTint(0.8, 1.04) });
    block(W, cap, bx, base + bh - 0.1, bz, bw + 0.16, 0.2, bd + 0.16, { b: 0.05 });
    if (lines) for (let ly = 0.7; ly < bh - 0.4; ly += 0.75) put(W, GEO.box(), lines, bx, base + ly, bz, { sx: bw + 0.04, sy: 0.07, sz: bd + 0.04 });
    // the cap spills over the edge here and there
    for (let k = 0; k < 6; k++) {
      const side = Math.floor(r() * 4), t = (r() - 0.5) * 0.7, dw = 0.28 + r() * 0.4, dh = 0.14 + r() * 0.24;
      const alongX = side < 2, sg = side % 2 ? 1 : -1;
      const px = alongX ? bx + t * bw : bx + sg * (bw / 2 + 0.05), pz = alongX ? bz + sg * (bd / 2 + 0.05) : bz + t * bd;
      block(W, cap, px, base + bh - 0.2 - dh / 2 + 0.02, pz, alongX ? dw : 0.07, dh, alongX ? 0.07 : dw, { b: 0.025 });
    }
    // in the snow worlds icicles hang from its edge
    if (W.T.step === 'snow' && bh > 1.2) for (let k = 0; k < 7; k++) {
      const side = Math.floor(r() * 4), t = (r() - 0.5) * 0.9, il = 0.18 + r() * 0.34, alongX = side < 2, sg = side % 2 ? 1 : -1;
      put(W, GEO.cone(5), 0xdff4ff, alongX ? bx + t * bw : bx + sg * (bw / 2 + 0.05), base + bh - 0.2 - il / 2, alongX ? bz + sg * (bd / 2 + 0.05) : bz + t * bd, { sx: 0.05, sy: il, sz: 0.05, rx: Math.PI });
    }
    W.box(bx - bw / 2 - 0.08, base, bz - bd / 2 - 0.08, bx + bw / 2 + 0.08, base + bh, bz + bd / 2 + 0.08, { top: isTop, sound });
  };
  part(x, z, w, d, h, body, true);
  const sx = x + ox * (w / 2 + 0.7), sz = z + oz * (d / 2 + 0.7), px = -oz, pz = ox;
  if (steps >= 1) part(sx, sz, 1.4, 1.4, h - 1.05, step, false);
  if (steps >= 2) part(sx + px * 1.6, sz + pz * 1.6, 1.4, 1.4, h - 2.1, step, false);
  // loose stones at its feet, on the sides away from the steps
  for (let k = 0; k < 3; k++) {
    const a = r() * 6.283, ex = Math.cos(a), ez = Math.sin(a);
    if (ex * ox + ez * oz > 0.2) continue;
    const rx = x + ex * (w / 2 + 0.25) * 1.25, rz = z + ez * (d / 2 + 0.25) * 1.25, ss = 0.14 + r() * 0.16;
    put(W, GEO.rock(), shade(body, 0.9), rx, base + ss * 0.3, rz, { sx: ss * 1.2, sy: ss * 0.7, sz: ss, ry: r() * 6 });
  }
}

// ---------- houses ----------
// a little house: walls on a stone footing, a gable roof along its width with eaves and rows of tiles, a framed door
// with a step, two windows with frames and shutters facing `ry`, a window in each side wall; chimney: its colour
// box: [half size, height] of a square collider (else the walls' own footprint); clear: how far loose blocks keep off;
// lit: the windows glow; icicles: they hang from the eaves; smoke: it rises from the chimney
export function house(W, x, z, ry, { w = 2.8, d = 2.4, h = 2.0, roofH = 1.0, wall, roof, door = 0x7a4e32, glass = 0x7ec8f0, trim = null, chimney = null, shutters = null, footing = 0xb9b0a0,
  box = null, clear = null, lit = false, icicles = false, smoke = false, y = W.floorAt(x, z) ?? 0 }) {
  const fwd = [Math.sin(ry), Math.cos(ry)], side = [Math.cos(ry), -Math.sin(ry)];
  // local (across, up, out) → the world
  const at = (a, up, o) => [x + side[0] * a + fwd[0] * o, y + up, z + side[1] * a + fwd[1] * o];
  const frame = trim ?? shade(wall, 0.72), woodwork = shade(door ?? wall, 0.8);
  block(W, footing, x, y + 0.11, z, w + 0.14, 0.22, d + 0.14, { b: 0.04, ry });
  put(W, GEO.box(), wall, x, y + h / 2, z, { sx: w, sy: h, sz: d, ry, tint: footTint(0.9, 1.03) });
  // corner posts
  for (const sa of [-1, 1]) for (const so of [-1, 1]) put(W, GEO.box(), frame, ...at(sa * (w / 2 - 0.02), h / 2 + 0.1, so * (d / 2 - 0.02)), { sx: 0.13, sy: h - 0.2, sz: 0.13, ry });
  // roof: a prism tipped onto its side, apex up, ridge along the width; it overhangs the walls all round
  const rs = (d / 2 + 0.34) / 0.866;
  putQ(W, GEO.cyl(3), roof, V.set(x, y + h + roofH * 0.5 - 0.05, z), Q.setFromEuler(E.set(-Math.PI / 2, ry + Math.PI / 2, 0, 'YXZ')), new THREE.Vector3(rs, w + 0.5, roofH));
  // rows of tiles down both slopes, a ridge beam, and bargeboards along the gable edges
  const hw = d / 2 + 0.34, rise = roofH * 1.5, eave = h - 0.05, slope = Math.atan2(rise, hw), run = Math.hypot(rise, hw), dark = shade(roof, 0.82);
  for (const so of [-1, 1]) {
    for (const t of [0.26, 0.52, 0.78]) {
      putL(W, GEO.box(), dark, ...at(0, eave + rise * (1 - t) + 0.03, so * hw * t), { sx: w + 0.52, sy: 0.05, sz: 0.1, ry, rx: so * slope });
    }
    for (const sa of [-1, 1]) putL(W, GEO.box(), frame, ...at(sa * (w / 2 + 0.25), eave + rise * 0.5 + 0.01, so * hw * 0.5), { sx: 0.07, sy: 0.12, sz: run, ry, rx: so * slope });
  }
  put(W, GEO.box(), dark, ...at(0, eave + rise - 0.02, 0), { sx: w + 0.56, sy: 0.1, sz: 0.16, ry });
  // door (door: null leaves the wall plain, for a caller's own): frame, leaf, knob, a stone step
  const out = d / 2 + 0.01;
  if (door !== null) {
    put(W, GEO.box(), frame, ...at(0, 0.68, out), { sx: 0.9, sy: 1.36, sz: 0.07, ry });
    put(W, GEO.box(), door, ...at(0, 0.64, out + 0.03), { sx: 0.7, sy: 1.24, sz: 0.06, ry });
    for (const t of [-0.17, 0.17]) put(W, GEO.box(), woodwork, ...at(t, 0.64, out + 0.065), { sx: 0.025, sy: 1.2, sz: 0.01, ry });
    put(W, GEO.ico(), 0xffd23f, ...at(0.24, 0.64, out + 0.09), { sx: 0.045, sy: 0.045, sz: 0.045 });
    block(W, footing, ...at(0, 0.06, out + 0.28), 1.0, 0.12, 0.46, { b: 0.03, ry });
  }
  // windows: frame, pane with a cross, sill, shutters (front), and one in each side wall
  const win = (a, up, o, turn) => {
    const r2 = ry + turn, f = turn ? [side[0] * Math.sign(a), side[1] * Math.sign(a)] : fwd;
    const p = turn ? at(a, up, o) : at(a, up, o);
    put(W, GEO.box(), frame, p[0], p[1], p[2], { sx: 0.66, sy: 0.66, sz: 0.07, ry: r2 });
    put(W, GEO.box(), glass, p[0] + f[0] * 0.03, p[1], p[2] + f[1] * 0.03, { sx: 0.5, sy: 0.5, sz: 0.05, ry: r2, kind: lit ? 'glow' : 'solid' });
    put(W, GEO.box(), frame, p[0] + f[0] * 0.06, p[1], p[2] + f[1] * 0.06, { sx: 0.04, sy: 0.5, sz: 0.012, ry: r2 });
    put(W, GEO.box(), frame, p[0] + f[0] * 0.06, p[1], p[2] + f[1] * 0.06, { sx: 0.5, sy: 0.04, sz: 0.012, ry: r2 });
    put(W, GEO.box(), frame, p[0] + f[0] * 0.07, p[1] - 0.36, p[2] + f[1] * 0.07, { sx: 0.78, sy: 0.07, sz: 0.16, ry: r2 });
  };
  for (const sa of [-1, 1]) {
    const a = sa * w * 0.3;
    win(a, 1.2, out, 0);
    if (shutters) for (const e of [-1, 1]) put(W, GEO.box(), shutters, ...at(a + e * 0.44, 1.2, out + 0.03), { sx: 0.2, sy: 0.62, sz: 0.04, ry });
    win(sa * (w / 2 + 0.01), 1.2, 0, Math.PI / 2);
  }
  if (trim) put(W, GEO.box(), trim, x, y + h - 0.06, z, { sx: w + 0.08, sy: 0.12, sz: d + 0.08, ry });
  if (chimney) {
    const p = at(-w * 0.28, h + roofH * 0.55, -d * 0.2);
    block(W, chimney, p[0], p[1], p[2], 0.42, 1.1, 0.42, { b: 0.04, ry, tint: footTint(0.88, 1.02) });
    block(W, shade(chimney, 0.8), p[0], p[1] + 0.58, p[2], 0.54, 0.12, 0.54, { b: 0.03, ry });
    if (smoke) chimneySmoke(W, p[0], p[1] + 0.7, p[2]);
  }
  if (icicles) {
    const r = W.drng;
    for (const so of [-1, 1]) {
      // a lip of snow along the eave, icicles of uneven length under it
      putL(W, GEO.box(), roof, ...at(0, eave + 0.03, so * (hw - 0.06)), { sx: w + 0.6, sy: 0.17, sz: 0.3, ry, rx: so * slope });
      for (let t = -w / 2 - 0.15; t < w / 2 + 0.2; t += 0.26) {
        const il = 0.12 + r() * 0.3;
        if (r() < 0.25) continue;
        put(W, GEO.cone(5), 0xdff4ff, ...at(t + (r() - 0.5) * 0.1, eave - 0.12 - il / 2, so * (hw - 0.02)), { sx: 0.045, sy: il, sz: 0.045, rx: Math.PI });
      }
    }
  }
  const turned = Math.abs(Math.sin(ry)) > 0.5, ex = box ? box[0] : (turned ? d : w) / 2 + 0.05, ez = box ? box[0] : (turned ? w : d) / 2 + 0.05;
  W.box(x - ex, y, z - ez, x + ex, y + (box ? box[1] : h + roofH), z + ez, { sound: 'wood' });
  W.obstacles.push({ x, z, r: clear ?? Math.max(w, d) * 0.8 });
  W.skirts.push({ x, z, y, r: Math.max(w, d) * 0.62 });
  return { at, fwd, side };
}

// ---------- fences ----------
// a straight fence from a to b with a collider: posts with a pointed cap, two rails that sag and tilt a little
export function fence(W, ax, az, bx, bz, color = 0xc08a5c, { post = 0x8a5a3c, y = 0 } = {}) {
  const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1)), r = W.drng;
  for (let k = 0; k <= n; k++) {
    const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n, h = 0.8 + (r() - 0.5) * 0.08;
    put(W, GEO.box(), post, px, y + h / 2, pz, { sx: 0.13, sy: h, sz: 0.13, ry, tint: footTint(0.8, 1.04) });
    put(W, GEO.cone(4), shade(post, 1.12), px, y + h + 0.05, pz, { sx: 0.105, sy: 0.1, sz: 0.105, ry: ry + Math.PI / 4 });
  }
  for (let k = 0; k < n; k++) {
    const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
    for (const ry0 of [0.35, 0.65]) putL(W, GEO.box(), (k + (ry0 > 0.5 ? 1 : 0)) % 2 ? color : shade(color, 0.93), (x0 + x1) / 2, y + ry0 + (r() - 0.5) * 0.03, (z0 + z1) / 2, { sx: 0.06, sy: 0.09, sz: L / n + 0.1, ry, rx: (r() - 0.5) * 0.05 });
  }
  W.box(Math.min(ax, bx) - 0.08, y, Math.min(az, bz) - 0.08, Math.max(ax, bx) + 0.08, y + 0.85, Math.max(az, bz) + 0.08, { sound: 'wood' });
}

// ---------- masonry ----------
// a square column of stacked stones on a plinth (ruins, gates): each course a dressed block, a shade apart and a
// touch out of true; whole: a capital on top; otherwise it ends in a broken course. moss: what grows on it.
export function column(W, x, z, w, h, { stone, dark = shade(stone, 0.84), moss = null, whole = true, base = 0, plinth = 0.3, courses = 0.66 } = {}) {
  const r = W.drng, top = base + h;
  block(W, dark, x, base + plinth / 2 - 0.03, z, w + 0.3, plinth, w + 0.3, { b: 0.05, tint: footTint(0.86, 1.02) });
  const y0 = base + plinth - 0.06, span = top - y0 - (whole ? 0.22 : 0), n = Math.max(1, Math.round(span / courses)), ch = span / n;
  for (let k = 0; k < n; k++) {
    const last = k === n - 1 && !whole;
    block(W, k % 2 ? stone : shade(stone, 0.94), x + (r() - 0.5) * 0.03, y0 + ch * (k + 0.5), z + (r() - 0.5) * 0.03, w - (last ? 0.06 : 0), ch + 0.004, w - (last ? 0.06 : 0),
      { b: 0.045, ry: (r() - 0.5) * (last ? 0.3 : 0.05), tint: moss && last ? capTint(moss, 0.6, 0.94) : footTint(0.94, 1.02) });
  }
  if (whole) block(W, dark, x, top - 0.11, z, w + 0.26, 0.24, w + 0.26, { b: 0.05, tint: moss ? capTint(moss, 0.6, 0.95) : null });
  if (moss) {
    // moss creeping up from the foot and hanging from the top, in thin strands of uneven length
    for (let k = 0; k < 4; k++) {
      const side = Math.floor(r() * 4), alongX = side < 2, sg = side % 2 ? 1 : -1, t0 = (r() - 0.5) * 0.5 * w, low = k % 2 === 0;
      for (let j = 0; j < 3; j++) {
        const mh = 0.16 + r() * 0.42, mw = 0.1 + r() * 0.08, t = t0 + (j - 1) * 0.13;
        const y = low ? base + plinth + mh / 2 - 0.06 : top - (whole ? 0.24 : 0.02) - mh / 2;
        block(W, moss, alongX ? x + t : x + sg * (w / 2 + 0.008), y, alongX ? z + sg * (w / 2 + 0.008) : z + t, alongX ? mw : 0.035, mh, alongX ? 0.035 : mw, { b: 0.012 });
      }
    }
  }
}
// a beam of big stones laid end to end from a to b (a lintel), its top at y + h / 2; moss lies on it in places
export function lintel(W, ax, az, bx, bz, y, h, d, { stone, dark = shade(stone, 0.86), moss = null } = {}) {
  const r = W.drng, L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2, n = Math.max(2, Math.round(L / 1.6));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, key = n % 2 === 1 && k === (n - 1) / 2;
    block(W, key ? dark : k % 2 ? stone : shade(stone, 0.95), ax + (bx - ax) * t, y + (key ? 0.04 : 0) + (r() - 0.5) * 0.02, az + (bz - az) * t, L / n + 0.004, h + (key ? 0.1 : 0), d + (key ? 0.08 : 0),
      { b: 0.05, ry, tint: moss ? capTint(moss, 0.75, 0.95) : footTint(0.95, 1.02) });
  }
  if (moss) for (let k = 0; k < Math.round(L / 1.4); k++) {
    const t = r(), ml = 0.5 + r() * 0.8;
    block(W, moss, ax + (bx - ax) * t, y + h / 2 + 0.035, az + (bz - az) * t, ml, 0.08, d * (0.6 + r() * 0.35), { b: 0.03, ry });
    // a tuft hanging off the edge
    if (r() < 0.6) { const sg = r() < 0.5 ? -1 : 1, nx = Math.cos(ry + Math.PI / 2) * 0, o = d / 2 + 0.015; block(W, moss, ax + (bx - ax) * t + Math.sin(ry) * sg * o + nx, y + h / 2 - 0.12, az + (bz - az) * t + Math.cos(ry) * sg * o, ml * 0.6, 0.3, 0.05, { b: 0.02, ry }); }
  }
}

// ---------- garden and farm ----------
let _picket = null;
// one fence picket: a slat with a pointed top, 1 tall, standing on its foot
const picketGeo = () => _picket || (_picket = (() => {
  const w = 0.5, t = 0.5, pos = [];
  const pts = [[-w, 0], [w, 0], [w, 0.78], [0, 1], [-w, 0.78]];
  for (const sz of [-1, 1]) for (const [a, b, c] of [[0, 1, 2], [0, 2, 4], [4, 2, 3]]) {
    const tri = [pts[a], pts[b], pts[c]];
    if (sz < 0) tri.reverse();
    for (const p of tri) pos.push(p[0], p[1], sz * t);
  }
  for (let i = 0; i < 5; i++) {
    const a = pts[i], b = pts[(i + 1) % 5];
    pos.push(a[0], a[1], t, a[0], a[1], -t, b[0], b[1], -t, a[0], a[1], t, b[0], b[1], -t, b[0], b[1], t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
})());
// a picket fence from a to b with a collider: square posts with a cap, two rails, pointed pickets between
export function picketFence(W, ax, az, bx, bz, { color = 0xf8efdc, post = 0xf3e6cf, y = 0, h = 0.8 } = {}) {
  const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2, n = Math.max(1, Math.round(L / 1.15)), r = W.drng;
  const ux = (bx - ax) / L, uz = (bz - az) / L;
  for (let k = 0; k <= n; k++) {
    const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n;
    put(W, GEO.box(), post, px, y + h / 2 + 0.02, pz, { sx: 0.13, sy: h + 0.04, sz: 0.13, ry, tint: footTint(0.86, 1.03) });
    put(W, GEO.cone(4), post, px, y + h + 0.1, pz, { sx: 0.12, sy: 0.12, sz: 0.12, ry: ry + Math.PI / 4 });
  }
  for (const ry0 of [0.24, 0.58]) put(W, GEO.box(), shade(color, 0.92), (ax + bx) / 2, y + ry0 * h / 0.8, (az + bz) / 2, { sx: L, sy: 0.06, sz: 0.045, ry });
  const m = Math.max(2, Math.round(L / 0.29));
  for (let k = 0; k < m; k++) {
    const t = (k + 0.5) / m, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    // (not where a post stands)
    if (Math.abs(((t * n + 0.5) % 1) - 0.5) * (L / n) < 0.13) continue;
    put(W, picketGeo(), k % 3 ? color : shade(color, 0.95), px - uz * 0.035, y + 0.04, pz + ux * 0.035, { sx: 0.19, sy: (h - 0.1) * (0.96 + r() * 0.08), sz: 0.04, ry });
  }
  W.box(Math.min(ax, bx) - 0.07, y, Math.min(az, bz) - 0.07, Math.max(ax, bx) + 0.07, y + h, Math.max(az, bz) + 0.07, { sound: 'wood' });
}

// a round bale of hay lying along x (alongX) or z, resting on y: rings of straw on its ends, two bands of twine,
// loose straw round its foot. It is something to stand on.
export function bale(W, x, y, z, r, L, alongX = true, { straw = 0xf2cf6b, dark = 0xe0b752, loose = true } = {}) {
  const d = W.drng, turn = { rz: alongX ? Math.PI / 2 : 0, rx: alongX ? 0 : Math.PI / 2 };
  const ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
  put(W, GEO.cyl(12), straw, x, y + r, z, { sx: r, sy: L, sz: r, ...turn, tint: footTint(0.84, 1.05) });
  put(W, GEO.cyl(12), dark, x, y + r, z, { sx: r * 0.78, sy: L + 0.02, sz: r * 0.78, ...turn });
  put(W, GEO.cyl(10), straw, x, y + r, z, { sx: r * 0.5, sy: L + 0.035, sz: r * 0.5, ...turn });
  put(W, GEO.cyl(8), shade(dark, 0.86), x, y + r, z, { sx: r * 0.2, sy: L + 0.05, sz: r * 0.2, ...turn });
  for (const s of [-1, 1]) put(W, GEO.cyl(12), 0xb07a3c, x + ax * s * L * 0.27, y + r, z + az * s * L * 0.27, { sx: r + 0.012, sy: 0.05, sz: r + 0.012, ...turn });
  if (loose) for (let k = 0; k < 5; k++) {
    const t = (d() - 0.5) * L, o = (d() < 0.5 ? -1 : 1) * (r * 0.9 + d() * 0.25);
    put(W, GEO.box(), k % 2 ? straw : dark, x + ax * t + az * o, y + 0.02, z + az * t + ax * o, { sx: 0.3 + d() * 0.25, sy: 0.025, sz: 0.035, ry: d() * 3, kind: 'fx' });
  }
  W.box(x - (alongX ? L / 2 : r), y, z - (alongX ? r : L / 2), x + (alongX ? L / 2 : r), y + r * 2, z + (alongX ? r : L / 2), { top: true, sound: 'grass' });
}

// a bush: a few leafy lumps in shades of its colour (flowers or berries are the caller's)
export function bush(W, x, y, z, s, color, ry = 0) {
  const d = W.drng, tone = k => C1.set(color).offsetHSL(0, 0, k).getHex();
  put(W, GEO.lump(0), color, x, y + s * 0.55, z, { sx: s * 1.2, sy: s, sz: s, ry, tint: leafTint() });
  const n = 2 + (d() < 0.5 ? 1 : 0), a0 = d() * 6.283;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * 6.283 + (d() - 0.5), ss = s * (0.5 + d() * 0.2);
    put(W, GEO.lump(k + 1), tone((k % 2 ? 1 : -1) * 0.035), x + Math.cos(a) * s * 0.75, y + ss * 0.6, z + Math.sin(a) * s * 0.75, { sx: ss * 1.15, sy: ss, sz: ss, ry: d() * 6, tint: leafTint() });
  }
  W.skirts.push({ x, z, y, r: s * 1.25 });
}

// ---------- the shore ----------
// stones in the shallows along an island's shore, in twos and threes, wet and dark at the waterline
export function shoreRocks(W, coast) {
  const d = W.drng, T = W.T, n = Math.round(W.bound * 0.9), dry = mix(T.rock, 0xffffff, 0.12);
  for (let i = 0, k = 0; i < n * 8 && k < n; i++) {
    const a = d() * 6.283, r = W.bound * (0.55 + d() * 0.6), x = Math.cos(a) * r, z = Math.sin(a) * r, sd = coast(x, z);
    if (sd < 0.3 || sd > 1.5) continue;
    k++;
    const s0 = 0.3 + d() * 0.4;
    for (let j = 0; j < 1 + Math.floor(d() * 3); j++) {
      const ss = j ? s0 * (0.4 + d() * 0.3) : s0, ja = d() * 6.283, jr = j ? s0 * (1 + d() * 0.5) : 0;
      const px = x + Math.cos(ja) * jr, pz = z + Math.sin(ja) * jr;
      if (coast(px, pz) < 0.2) continue;
      put(W, GEO.rock(), shade(T.rock, 0.86 + d() * 0.12), px, W.seaY + ss * 0.1, pz, { sx: ss * 1.3, sy: ss * 0.72, sz: ss, rx: d() * 0.6, ry: d() * 6, rz: d() * 0.6, tint: capTint(dry, 0.5, 0.7) });
    }
  }
}

// a standing stone: a block that narrows towards its top and leans a little, its edges cut
export function stoneGeo(w, h, d, { top = 0.74, b = 0.07, lean = 0, skew = 0 } = {}) {
  const g = bevelBox(w, h, d, b), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = (p.getY(i) + h / 2) / h, t = 1 + (top - 1) * k;
    p.setXYZ(i, p.getX(i) * t + lean * k * h, p.getY(i) + h / 2 - skew * p.getX(i) * k, p.getZ(i) * t);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- paving and lamps ----------
// a round plaza of flagstones: rings of stones round a middle one, a shade apart, the ground showing in the joints
export function plaza(W, cx, cz, R, [c1, c2], { y = 0.012, inner = 0.9 } = {}) {
  const d = W.drng, c3 = mix(c1, c2, 0.5);
  W.B.own(new THREE.CircleGeometry(inner - 0.05, 10).rotateX(-Math.PI / 2).translate(cx, y, cz), c2, null, 'fx');
  const rings = Math.max(1, Math.round((R - inner) / 1.15)), dr = (R - inner) / rings;
  for (let k = 0; k < rings; k++) {
    const r0 = inner + k * dr, r1 = r0 + dr - 0.07, n = Math.round((2 * Math.PI * (r0 + dr / 2)) / 1.25), a0 = d() * 6.283;
    for (let i = 0; i < n; i++) {
      // (a stone missing here and there on the outer rings, where grass has taken over)
      if (k === rings - 1 && d() < 0.22) continue;
      const da = (Math.PI * 2) / n, gap = 0.07 / (r0 + dr / 2);
      W.B.own(new THREE.RingGeometry(r0, r1 - (d() < 0.3 ? 0.06 : 0), 3, 1, a0 + i * da + gap / 2, da - gap).rotateX(-Math.PI / 2).translate(cx, y, cz), [c1, c2, c3][Math.floor(d() * 3)], null, 'fx');
    }
  }
}
// a lamp post: a slim pole on a foot, an arm, and a lantern with a little roof (its light in `light`)
export function lampPost(W, x, z, h, light, { metal = 0x5c5c6a, y = 0 } = {}) {
  put(W, GEO.taper(8, 0.6), shade(metal, 0.85), x, y + 0.11, z, { sx: 0.17, sy: 0.22, sz: 0.17 });
  put(W, GEO.taper(6, 0.7), metal, x, y + h / 2, z, { sx: 0.06, sy: h, sz: 0.06, tint: footTint(0.8, 1.05) });
  put(W, GEO.cyl(6), shade(metal, 0.85), x, y + h * 0.62, z, { sx: 0.085, sy: 0.05, sz: 0.085 });
  put(W, GEO.box(), shade(metal, 0.8), x, y + h + 0.03, z, { sx: 0.3, sy: 0.05, sz: 0.3 });
  put(W, GEO.box(), light, x, y + h + 0.22, z, { sx: 0.24, sy: 0.34, sz: 0.24, kind: 'glow' });
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put(W, GEO.box(), shade(metal, 0.8), x + ax * 0.125, y + h + 0.22, z + az * 0.125, { sx: 0.03, sy: 0.36, sz: 0.03 });
  put(W, GEO.cone(4), shade(metal, 0.8), x, y + h + 0.5, z, { sx: 0.27, sy: 0.22, sz: 0.27, ry: Math.PI / 4 });
  put(W, GEO.ico(), metal, x, y + h + 0.64, z, { sx: 0.04, sy: 0.04, sz: 0.04 });
}

// a sheep: a woolly body of lumps, a dark face with ears and a tuft of wool, four legs, a stub of a tail
export function sheep(W, x, z, ry, y = 0) {
  const d = W.drng, wool = 0xfff8ec, face = 0x3a3352, fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry);
  const at = (a, up, f) => [x + sx * a + fx * f, y + up, z + sz * a + fz * f];
  put(W, GEO.lump(0), wool, ...at(0, 0.56, 0), { sx: 0.56, sy: 0.43, sz: 0.7, ry, tint: footTint(0.86, 1.03) });
  for (const [a, up, f, r] of [[0.22, 0.72, 0.3, 0.27], [-0.24, 0.7, -0.28, 0.28], [0.2, 0.66, -0.36, 0.25], [-0.2, 0.7, 0.34, 0.26], [0, 0.82, 0, 0.3]]) put(W, GEO.lump(1 + Math.floor(d() * 3)), wool, ...at(a, up, f), { sx: r, sy: r * 0.85, sz: r, ry: d() * 6 });
  put(W, GEO.bevel(0.12), face, ...at(0, 0.64, 0.7), { sx: 0.27, sy: 0.3, sz: 0.3, ry });
  put(W, GEO.lump(2), wool, ...at(0, 0.83, 0.62), { sx: 0.17, sy: 0.12, sz: 0.15, ry });
  for (const e of [-1, 1]) {
    putL(W, GEO.box(), face, ...at(e * 0.2, 0.7, 0.62), { sx: 0.16, sy: 0.05, sz: 0.09, ry, rz: -e * 0.5 });
    put(W, GEO.ico(), 0xffffff, ...at(e * 0.09, 0.69, 0.855), { sx: 0.035, sy: 0.035, sz: 0.02 });
  }
  for (const [a, b] of [[0.25, 0.35], [-0.25, 0.35], [0.25, -0.35], [-0.25, -0.35]]) put(W, GEO.box(), face, ...at(a, 0.15, b), { sx: 0.09, sy: 0.3, sz: 0.09, ry });
  put(W, GEO.lump(3), wool, ...at(0, 0.6, -0.72), { sx: 0.1, sy: 0.1, sz: 0.1 });
  W.skirts.push({ x, z, y, r: 0.5 });
}

// ---------- snow ----------
// an igloo of snow blocks: courses of blocks leaning in to the top, an arched tunnel facing `ry`, a dark doorway,
// snow banked up round its foot. R: its radius, H: its height, k: scales its details; tunnel: how far the tunnel's
// mouth stands out from the middle
export function igloo(W, x, z, ry, { R = 2, H = 1.6, y = 0, k = 1, tunnel = 2.4, snow = 0xfafcff, shadeC = 0xdbe8f8 } = {}) {
  const d = W.drng, fx = Math.sin(ry), fz = Math.cos(ry);
  put(W, GEO.dome(), snow, x, y, z, { sx: R * 0.985, sy: H * 0.985, sz: R * 0.985 });
  const courses = 5;
  for (let c = 0; c < courses - 1; c++) {
    const t0 = c / courses, t1 = (c + 1) / courses, hc = H * (t0 + t1) / 2, rc = R * Math.sqrt(1 - ((t0 + t1) / 2) ** 2);
    const n = Math.max(5, Math.round((2 * Math.PI * rc) / (0.62 * k))), lean = Math.asin((t0 + t1) / 2), a0 = c * 0.37;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      // (the doorway stays open through the lower courses)
      let da = Math.abs(((a - ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (c < 2 && da < 0.42 / (rc / R)) continue;
      putL(W, GEO.bevel(0.1), (i + c) % 2 ? snow : shadeC, x + Math.sin(a) * rc * 1.0, y + hc, z + Math.cos(a) * rc * 1.0, { sx: (2 * Math.PI * rc) / n - 0.02 * k, sy: H / courses - 0.015, sz: 0.17 * k, ry: a, rx: -lean });
    }
  }
  put(W, GEO.dome(), snow, x, y + H * 0.8, z, { sx: R * 0.62, sy: H * 0.2, sz: R * 0.62 });
  put(W, GEO.cyl(8), 0x55688c, x - fx * R * 0.2, y + H * 0.985, z - fz * R * 0.2, { sx: 0.09 * k, sy: 0.05, sz: 0.09 * k });
  // the tunnel: a low vault with an arch of blocks round its mouth
  const tl = tunnel - R * 0.8, tx = x + fx * (R * 0.8 + tl / 2), tz = z + fz * (R * 0.8 + tl / 2), tr = 0.66 * k;
  putL(W, GEO.cyl(10), snow, tx, y + 0.42 * k, tz, { sx: tr, sy: tl, sz: tr * 1.12, ry, rx: Math.PI / 2 });
  const mx = x + fx * tunnel, mz = z + fz * tunnel;
  for (let i = 0; i < 7; i++) {
    const a = -1.45 + (i / 6) * 2.9, ax = Math.sin(a) * tr * 1.02, ay = Math.cos(a) * tr * 1.14;
    putL(W, GEO.bevel(0.1), i % 2 ? shadeC : snow, mx + fz * ax, y + 0.42 * k + ay, mz - fx * ax, { sx: 0.36 * k, sy: 0.24 * k, sz: 0.3 * k, ry, rz: -a });
  }
  putL(W, GEO.cyl(10), 0x3a4a6a, mx + fx * 0.02, y + 0.4 * k, mz + fz * 0.02, { sx: tr * 0.7, sy: 0.3 * k, sz: tr * 0.8, ry, rx: Math.PI / 2 });
  // snow banked up round its foot
  for (let i = 0; i < 7; i++) {
    const a = ry + 0.7 + (i / 7) * (Math.PI * 2 - 1.4) + (d() - 0.5) * 0.3, ss = (0.5 + d() * 0.4) * k;
    put(W, GEO.dome(), snow, x + Math.sin(a) * (R + 0.1), y - 0.02, z + Math.cos(a) * (R + 0.1), { sx: ss, sy: ss * 0.42, sz: ss * 0.8, ry: a });
  }
}

// a penguin: an upright dark body with a white belly, a beak, two orange feet, little wings
export function penguin(W, x, y, z, ry, s = 1) {
  const fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry), dark = 0x2f3550;
  put(W, GEO.lump(1), dark, x, y + 0.3 * s, z, { sx: 0.2 * s, sy: 0.3 * s, sz: 0.18 * s, ry });
  put(W, GEO.blob(), 0xfafcff, x + fx * 0.06 * s, y + 0.27 * s, z + fz * 0.06 * s, { sx: 0.15 * s, sy: 0.24 * s, sz: 0.14 * s, ry });
  put(W, GEO.blob(), dark, x, y + 0.6 * s, z, { sx: 0.14 * s, sy: 0.13 * s, sz: 0.14 * s });
  putL(W, GEO.cone(4), 0xffa94d, x + fx * 0.15 * s, y + 0.59 * s, z + fz * 0.15 * s, { sx: 0.04 * s, sy: 0.1 * s, sz: 0.04 * s, ry, rx: Math.PI / 2 });
  for (const e of [-1, 1]) {
    put(W, GEO.ico(), 0xffffff, x + fx * 0.11 * s + sx * e * 0.06 * s, y + 0.63 * s, z + fz * 0.11 * s + sz * e * 0.06 * s, { sx: 0.025 * s, sy: 0.025 * s, sz: 0.025 * s });
    putL(W, GEO.box(), dark, x + sx * e * 0.2 * s, y + 0.32 * s, z + sz * e * 0.2 * s, { sx: 0.04 * s, sy: 0.26 * s, sz: 0.1 * s, ry, rz: e * 0.3 });
    put(W, GEO.box(), 0xffa94d, x + sx * e * 0.08 * s + fx * 0.07 * s, y + 0.02 * s, z + sz * e * 0.08 * s + fz * 0.07 * s, { sx: 0.08 * s, sy: 0.035 * s, sz: 0.13 * s, ry });
  }
}

// smoke from a chimney: a few puffs that swell as they rise and drift, then thin away (one instanced mesh)
export function chimneySmoke(W, x, y, z, color = 0xf4f1ec) {
  W.extras.push(() => {
    const N = 5, im = new THREE.InstancedMesh(GEO.blob(), toon(color, { fog: true }), N);
    im.layers.set(LAYER_FX);
    im.frustumCulled = false;
    W.group.add(im);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    W.updaters.push((dt, t) => {
      const wx = W.wind ? W.wind.x : 0, wz = W.wind ? W.wind.z : 0;
      for (let i = 0; i < N; i++) {
        const k = (t * 0.16 + i / N) % 1, s = 0.12 + Math.sin(k * Math.PI) * 0.26;
        im.setMatrixAt(i, m.compose(p.set(x + k * k * (0.9 + wx * 3) + Math.sin(k * 5 + i) * 0.08, y + k * 2.6, z + k * k * (0.4 + wz * 3)), q, sc.set(s, s * 0.85, s)));
      }
      im.instanceMatrix.needsUpdate = true;
    });
  });
}

// a snowman: three balls, coal eyes and buttons, a carrot, twig arms, a scarf, a bucket for a hat
export function snowman(W, x, z, ry, y = 0, s = 1) {
  const fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry), snow = 0xfafcff, coal = 0x2a2438;
  const at = (a, up, f) => [x + sx * a * s + fx * f * s, y + up * s, z + sz * a * s + fz * f * s];
  put(W, GEO.lump(0), snow, ...at(0, 0.36, 0), { sx: 0.46 * s, sy: 0.4 * s, sz: 0.46 * s, tint: footTint(0.86, 1.02) });
  put(W, GEO.lump(1), snow, ...at(0, 0.92, 0), { sx: 0.34 * s, sy: 0.31 * s, sz: 0.34 * s, tint: footTint(0.9, 1.02) });
  put(W, GEO.blob(), snow, ...at(0, 1.36, 0), { sx: 0.24 * s, sy: 0.23 * s, sz: 0.24 * s });
  for (const e of [-1, 1]) put(W, GEO.ico(), coal, ...at(e * 0.09, 1.42, 0.21), { sx: 0.035 * s, sy: 0.035 * s, sz: 0.03 * s });
  for (let k = 0; k < 5; k++) put(W, GEO.ico(), coal, ...at((k - 2) * 0.045, 1.3 - Math.abs(k - 2) * -0.015, 0.215), { sx: 0.018 * s, sy: 0.018 * s, sz: 0.015 * s });
  putL(W, GEO.cone(5), 0xff8a3d, ...at(0, 1.37, 0.32), { sx: 0.04 * s, sy: 0.2 * s, sz: 0.04 * s, ry, rx: Math.PI / 2 });
  for (const up of [0.8, 0.95, 1.1]) put(W, GEO.ico(), coal, ...at(0, up, 0.325), { sx: 0.03 * s, sy: 0.03 * s, sz: 0.025 * s });
  for (const e of [-1, 1]) {
    putL(W, GEO.taper(5, 0.5), 0x6b4a36, ...at(e * 0.5, 1.05, 0), { sx: 0.03 * s, sy: 0.5 * s, sz: 0.03 * s, ry, rz: -e * 1.1 });
    putL(W, GEO.taper(4, 0.5), 0x6b4a36, ...at(e * 0.68, 1.22, 0), { sx: 0.02 * s, sy: 0.16 * s, sz: 0.02 * s, ry, rz: -e * 0.3 });
  }
  put(W, GEO.cyl(10), 0xd9443b, ...at(0, 1.17, 0), { sx: 0.25 * s, sy: 0.09 * s, sz: 0.25 * s });
  putL(W, GEO.box(), 0xd9443b, ...at(0.14, 1.0, 0.24), { sx: 0.1 * s, sy: 0.32 * s, sz: 0.04 * s, ry, rz: 0.15 });
  put(W, GEO.taper(8, 0.8), 0x5c6a8a, ...at(0, 1.66, 0), { sx: 0.19 * s, sy: 0.24 * s, sz: 0.19 * s, rz: 0.12 });
  put(W, GEO.cyl(8), 0x4a5670, ...at(0, 1.55, 0), { sx: 0.205 * s, sy: 0.04 * s, sz: 0.205 * s, rz: 0.12 });
}

// a tree stump: bark that flares at the foot, the cut face with its rings showing, snow lying on it in the snow worlds
export function stump(W, x, z, y = 0, { r = 0.35, h = 0.5, bark = 0x8a5a3c } = {}) {
  const d = W.drng, snowy = W.T.step === 'snow';
  put(W, GEO.taper(9, 0.82), bark, x, y + h / 2, z, { sx: r * 1.12, sy: h, sz: r * 1.12, ry: d() * 3, tint: footTint(0.74, 1.04) });
  for (let k = 0; k < 3; k++) { const a = d() * 6.283; putL(W, GEO.cone(5), shade(bark, 0.86), x + Math.cos(a) * r * 0.95, y + 0.08, z + Math.sin(a) * r * 0.95, { sx: 0.11, sy: 0.3, sz: 0.11, ry: -a, rz: -2.05 }); }
  put(W, GEO.cyl(9), 0xe2c08c, x, y + h + 0.005, z, { sx: r * 0.88, sy: 0.02, sz: r * 0.88 });
  put(W, GEO.cyl(9), 0xc9a06a, x, y + h + 0.012, z, { sx: r * 0.55, sy: 0.02, sz: r * 0.55 });
  put(W, GEO.cyl(8), 0xe2c08c, x, y + h + 0.018, z, { sx: r * 0.26, sy: 0.02, sz: r * 0.26 });
  if (snowy) put(W, GEO.dome(), 0xfafcff, x + r * 0.15, y + h + 0.01, z - r * 0.1, { sx: r * 0.78, sy: 0.13, sz: r * 0.7, ry: d() * 3 });
  W.skirts.push({ x, z, y, r: r + 0.1 });
}

// ---------- boats ----------
// A boat's hull, bow towards +x, keel on y = 0: planks (strakes) running from stern to bow in alternating shades (the
// shades ride in the geometry's own colours), an inside you can look into, a rail round the top, a flat stern.
// L, B, D: length, beam, depth; hole(i, j, side): leave that plank piece out (a stove-in side); deck: close it over
export function hullGeo({ L = 5, B = 1.8, D = 0.9, stations = 12, strakes = 5, hole = null, deck = false, sheer = 0.3 } = {}) {
  const pos = [], col = [];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(k, k, k); };
  const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
  const half = t => (t > 0 ? Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 0.55) : 0.62 + 0.38 * (1 - t * t)) * B / 2;
  const top = t => D * (1 + sheer * t * t + (t > 0.4 ? 0.5 * sheer * (t - 0.4) : 0));
  const keel = t => (t > 0.55 ? D * 0.75 * Math.pow((t - 0.55) / 0.45, 1.6) : 0);
  // the point of strake edge j (0 keel … strakes: the rail) at station i, on side sg; k < 1: the inside skin
  const P = (i, j, sg, k = 1) => {
    const t = -1 + (2 * i) / stations, s = j / strakes, a = (s * Math.PI) / 2;
    const y0 = keel(t), y1 = top(t);
    return [t * L / 2 * (k < 1 ? 0.985 : 1), y0 + (y1 - y0) * (1 - Math.cos(a)) + (k < 1 ? 0.05 * (1 - s) : 0), sg * half(t) * Math.pow(Math.sin(a), 0.75) * k];
  };
  const shades = [0.86, 1.0, 0.9, 1.04, 0.94, 1.0];
  for (const sg of [-1, 1]) for (let i = 0; i < stations; i++) for (let j = 0; j < strakes; j++) {
    if (hole?.(i, j, sg)) continue;
    const a = P(i, j, sg), b = P(i + 1, j, sg), c = P(i + 1, j + 1, sg), d = P(i, j + 1, sg), sh = shades[j % shades.length] * (i % 4 === 3 ? 0.95 : 1);
    if (sg > 0) quad(a, b, c, d, sh); else quad(a, d, c, b, sh);
    const a2 = P(i, j, sg, 0.9), b2 = P(i + 1, j, sg, 0.9), c2 = P(i + 1, j + 1, sg, 0.9), d2 = P(i, j + 1, sg, 0.9);
    if (sg > 0) quad(a2, d2, c2, b2, j % 2 ? 0.74 : 0.68); else quad(a2, b2, c2, d2, j % 2 ? 0.74 : 0.68);
  }
  // the rail, the stern board, and (deck) planks across the top
  for (const sg of [-1, 1]) for (let i = 0; i < stations; i++) {
    const a = P(i, strakes, sg), b = P(i + 1, strakes, sg), c = P(i + 1, strakes, sg, 0.9), d = P(i, strakes, sg, 0.9);
    if (sg > 0) quad(a, b, c, d, 1.1); else quad(a, d, c, b, 1.1);
  }
  for (let j = 0; j < strakes; j++) {
    quad(P(0, j, -1), P(0, j, 1), P(0, j + 1, 1), P(0, j + 1, -1), 0.8);
    quad(P(0, j, -1, 0.9), P(0, j + 1, -1, 0.9), P(0, j + 1, 1, 0.9), P(0, j, 1, 0.9), 0.6);
  }
  if (deck) for (let i = 0; i < stations; i++) {
    const a = P(i, strakes, -1, 0.9), b = P(i, strakes, 1, 0.9), c = P(i + 1, strakes, 1, 0.9), d = P(i + 1, strakes, -1, 0.9);
    for (const p of [a, b, c, d]) p[1] -= D * 0.12;
    quad(a, b, c, d, i % 2 ? 1.02 : 0.92);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.userData.frame = { half, top, keel };
  return g;
}

// a boat built at a place: M places the hull's own frame (bow +x) in the world. Returns put-ers in that frame.
function boatFrame(W, M0) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    add(geo, color, kind = 'solid', tint = null) { W.B.own(geo, color, M0, kind, tint); },
    // a shape at hull coordinates, turned (rx, ry, rz) in the hull's frame
    p(geo, color, x, y, z, { sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, kind = 'solid', tint = null } = {}) {
      m.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), sc.set(sx, sy, sz)).premultiply(M0);
      W.B.add(geo, color, m, kind, tint);
    },
  };
}

// a rowing boat: hull, two thwarts, ribs, oars shipped along the thwarts. M0 places it.
export function rowboat(W, M0, { L = 2.8, wood = 0xb07a50, trim = 0xfff1dc, paint = null } = {}) {
  const B = L * 0.42, D = L * 0.17, F = boatFrame(W, M0), g = hullGeo({ L, B, D, stations: 10, strakes: 4 });
  const fr = g.userData.frame;
  F.add(g, paint ?? wood);
  for (const t of [-0.45, 0.1]) F.p(GEO.box(), shade(wood, 1.12), t * L / 2, D * 0.72, 0, { sx: L * 0.08, sy: 0.04, sz: fr.half(t) * 1.75 });
  for (const t of [-0.7, -0.2, 0.35]) for (const sg of [-1, 1]) F.p(GEO.box(), shade(wood, 0.7), t * L / 2, D * 0.5, sg * fr.half(t) * 0.8, { sx: 0.04, sy: D * 0.9, sz: 0.04, rx: sg * -0.5 });
  for (const sg of [-1, 1]) {
    F.p(GEO.cyl(6), 0xd9c49a, -L * 0.05, D * 0.82, sg * B * 0.22, { sx: 0.03, sy: L * 0.62, sz: 0.03, rz: Math.PI / 2 });
    F.p(GEO.box(), trim, L * 0.29, D * 0.82, sg * B * 0.22, { sx: L * 0.14, sy: 0.02, sz: 0.11 });
  }
  F.p(GEO.box(), trim, L * 0.49, fr.top(0.98) + 0.02, 0, { sx: 0.06, sy: 0.14, sz: 0.06 });
}

// a wrecked sailing boat lying on its side: a stove-in hull with its ribs showing through the hole, deck beams, a
// broken mast with a rag of sail and a yard, a rudder, planks and a barrel lying about. M0 places the hull;
// big: a ship (a stern castle with windows, a bowsprit, a crow's nest, a ragged flag) rather than a boat.
export function shipwreck(W, M0, { L = 5.2, wood = 0x9a6b4f, dark = 0x6b4a36, sail = 0xf4efe6, big = false } = {}) {
  const B = L * (big ? 0.3 : 0.36), D = L * (big ? 0.2 : 0.17), N = big ? 16 : 12, K = big ? 6 : 5, d = W.drng, F = boatFrame(W, M0);
  // the hole: amidships on the upper side, ragged
  const h0 = Math.round(N * 0.42), hole = (i, j, sg) => sg > 0 && i >= h0 && i < h0 + (big ? 4 : 3) && j >= 1 && j < K - 1 && !(i === h0 && j === 1);
  const g = hullGeo({ L, B, D, stations: N, strakes: K, hole, deck: big, sheer: big ? 0.5 : 0.3 });
  const fr = g.userData.frame;
  F.add(g, wood, 'solid', footTint(0.84, 1.04));
  // ribs: curved frames inside, standing proud where the planks are gone; beams across the top
  for (let i = 1; i < N; i += big ? 1 : 1) {
    const t = -1 + (2 * i) / N, b = fr.half(t), y1 = fr.top(t), inHole = i >= h0 && i <= h0 + (big ? 4 : 3);
    if (!inHole && i % 2) continue;
    for (const sg of inHole ? [1] : [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const s0 = j / 3, s1 = (j + 1) / 3, a0 = s0 * Math.PI / 2, a1 = s1 * Math.PI / 2;
        const p0 = [b * Math.pow(Math.sin(a0), 0.75) * 0.9, (y1 - fr.keel(t)) * (1 - Math.cos(a0)) + fr.keel(t) + 0.04], p1 = [b * Math.pow(Math.sin(a1), 0.75) * 0.9, (y1 - fr.keel(t)) * (1 - Math.cos(a1)) + fr.keel(t) + 0.04];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        F.p(GEO.box(), dark, t * L / 2, (p0[1] + p1[1]) / 2, sg * (p0[0] + p1[0]) / 2, { sx: L * 0.016 + 0.03, sy: L * 0.014 + 0.03, sz: len + 0.03, rx: -sg * ang });
      }
    }
    if (!big && i % 4 === 0) F.p(GEO.box(), shade(wood, 1.08), t * L / 2, y1 * 0.86, 0, { sx: L * 0.03, sy: 0.05, sz: b * 1.75 });
  }
  // the keel and stem, a rudder at the stern
  F.p(GEO.box(), dark, -L * 0.06, -0.02, 0, { sx: L * 0.84, sy: 0.1 * (big ? 2 : 1), sz: 0.09 * (big ? 2 : 1) });
  F.p(GEO.box(), dark, L * 0.455, D * 0.52, 0, { sx: L * 0.035, sy: D * 1.25, sz: 0.09 * (big ? 2 : 1), rz: -0.5 });
  F.p(GEO.box(), shade(wood, 0.82), -L * 0.52, D * 0.42, 0, { sx: L * 0.05, sy: D * 0.85, sz: 0.05 * (big ? 2 : 1) });
  // the mast: snapped a little way up, the top lying across the rail with a rag of sail still on its yard
  const mx = L * 0.08, mh = L * (big ? 0.5 : 0.3), mr = L * 0.014 + 0.03;
  F.p(GEO.taper(7, 0.8), shade(wood, 1.12), mx, D * 0.4 + mh / 2, 0, { sx: mr, sy: mh, sz: mr, rz: 0.06 });
  F.p(GEO.cone(6), shade(wood, 1.2), mx - 0.03, D * 0.4 + mh + mr, 0, { sx: mr * 0.9, sy: mr * 2.4, sz: mr * 0.9, rz: 0.4 });
  const fall = L * (big ? 0.55 : 0.5);
  F.p(GEO.taper(7, 0.6), shade(wood, 1.12), mx + fall * 0.42, D * 0.95 + (big ? D * 0.3 : 0), B * 0.2 + fall * 0.22, { sx: mr * 0.85, sy: fall, sz: mr * 0.85, rx: Math.PI / 2 - 0.25, ry: -1.05 });
  const yardX = mx + fall * 0.62, yardZ = B * 0.2 + fall * 0.34, yardY = D * 1.05 + (big ? D * 0.3 : 0) + fall * 0.06;
  F.p(GEO.cyl(6), dark, yardX, yardY, yardZ, { sx: mr * 0.6, sy: L * 0.34, sz: mr * 0.6, rz: Math.PI / 2, ry: 0.5 });
  // (the sail: a ragged sheet hanging from the yard, in strips of uneven length)
  for (let k = 0; k < 6; k++) {
    const t = (k - 2.5) * L * 0.052, hl = L * (0.05 + d() * 0.2), wd = L * (0.035 + d() * 0.02);
    if (k === 3) continue; // (a strip torn away)
    F.p(GEO.box(), k % 2 ? sail : shade(sail, 0.9), yardX + Math.cos(0.5) * t, yardY - hl / 2 - 0.02, yardZ - Math.sin(0.5) * t, { sx: wd, sy: hl, sz: 0.03, ry: 0.5, rx: 0.1 * (k - 2.5), rz: (d() - 0.5) * 0.16 });
    // its ragged end
    F.p(GEO.cone(4), k % 2 ? sail : shade(sail, 0.9), yardX + Math.cos(0.5) * t, yardY - hl - 0.02 - L * 0.012, yardZ - Math.sin(0.5) * t, { sx: wd * 0.5, sy: L * 0.03, sz: 0.02, ry: 0.5, rx: Math.PI });
  }
  if (big) {
    // the stern castle: a raised cabin with a rail and windows across the back, a lantern; a bowsprit; a crow's nest
    // still on the mast's stump; a ragged flag
    const sx = -L * 0.36, sw = fr.half(-0.72) * 1.7, sy = fr.top(-0.72);
    F.p(GEO.bevel(0.05), shade(wood, 0.92), sx, sy + D * 0.2, 0, { sx: L * 0.24, sy: D * 0.62, sz: sw, tint: footTint(0.86, 1.04) });
    F.p(GEO.box(), shade(wood, 1.1), sx, sy + D * 0.52, 0, { sx: L * 0.26, sy: 0.07, sz: sw + 0.14 });
    for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) F.p(GEO.box(), dark, sx - L * 0.1 + k * L * 0.065, sy + D * 0.68, sg * (sw / 2 + 0.02), { sx: 0.06, sy: D * 0.3, sz: 0.06 });
    for (const sg of [-1, 1]) F.p(GEO.box(), shade(wood, 1.1), sx, sy + D * 0.84, sg * (sw / 2 + 0.02), { sx: L * 0.25, sy: 0.06, sz: 0.08 });
    for (const zz of [-0.3, 0, 0.3]) {
      F.p(GEO.box(), 0xf2cf6b, sx - L * 0.121, sy + D * 0.22, zz * sw, { sx: 0.04, sy: D * 0.26, sz: sw * 0.2, kind: 'glow' });
      F.p(GEO.box(), dark, sx - L * 0.124, sy + D * 0.22, zz * sw, { sx: 0.03, sy: D * 0.3, sz: 0.035 });
    }
    F.p(GEO.box(), dark, sx + L * 0.121, sy + D * 0.1, 0, { sx: 0.05, sy: D * 0.42, sz: sw * 0.26 });
    F.p(GEO.taper(6, 0.5), shade(wood, 1.12), L * 0.56, fr.top(1) + D * 0.12, 0, { sx: mr * 0.8, sy: L * 0.24, sz: mr * 0.8, rz: -Math.PI / 2 + 0.3 });
    F.p(GEO.taper(8, 1.25), shade(wood, 0.9), mx + 0.02, D * 0.4 + mh * 0.82, 0, { sx: mr * 2.6, sy: mr * 2.2, sz: mr * 2.6, rz: 0.06 });
    F.p(GEO.cyl(8), dark, mx + 0.03, D * 0.4 + mh * 0.82 + mr * 1.2, 0, { sx: mr * 3.4, sy: 0.06, sz: mr * 3.4, rz: 0.06 });
    // deck fittings: a hatch, the wheel on the stern castle
    F.p(GEO.box(), dark, L * 0.24, fr.top(0.48) - D * 0.08, 0, { sx: L * 0.1, sy: 0.08, sz: B * 0.36 });
    for (let k = 0; k < 3; k++) F.p(GEO.box(), shade(wood, 0.8), L * 0.24, fr.top(0.48) - D * 0.03, (k - 1) * B * 0.11, { sx: L * 0.1, sy: 0.03, sz: 0.04 });
    F.p(GEO.cyl(5), dark, sx + L * 0.06, sy + D * 0.76, 0, { sx: 0.05, sy: D * 0.5, sz: 0.05 });
    for (let k = 0; k < 4; k++) F.p(GEO.box(), shade(wood, 1.15), sx + L * 0.065, sy + D * 0.98, 0, { sx: 0.035, sy: D * 0.46, sz: 0.035, rx: (k * Math.PI) / 4 });
    F.p(GEO.cyl(10), dark, sx + L * 0.065, sy + D * 0.98, 0, { sx: D * 0.17, sy: 0.05, sz: D * 0.17, rz: Math.PI / 2 });
  }
  return F;
}

// ---------- the beach ----------
// a starfish lying on (x, y, z): five tapering arms round a middle
export function starfish(W, x, y, z, color, turn = 0, s = 1, kind = 'fx') {
  for (let k = 0; k < 5; k++) {
    const a = turn + k * 1.2566;
    putL(W, GEO.cone(4), k % 2 ? color : shade(color, 0.92), x + Math.cos(a) * 0.1 * s, y + 0.012, z - Math.sin(a) * 0.1 * s, { sx: 0.022 * s, sy: 0.2 * s, sz: 0.06 * s, ry: a, rz: -Math.PI / 2, kind });
  }
  put(W, GEO.dome(), shade(color, 1.08), x, y, z, { sx: 0.06 * s, sy: 0.035 * s, sz: 0.06 * s, kind });
}
// a wooden crate: plank faces in a frame, a brace across each side
export function crate(W, x, y, z, s, ry, wood = 0xb07a50) {
  const dark = shade(wood, 0.72), h = s / 2;
  block(W, wood, x, y + h, z, s - 0.06, s - 0.06, s - 0.06, { b: 0.02, ry, tint: footTint(0.88, 1.04) });
  // the frame: twelve edges
  for (const [ax, ay, az] of [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0]]) {
    putL(W, GEO.box(), dark, x + Math.cos(ry) * ax * (h - 0.035), y + h + ay * (h - 0.035), z - Math.sin(ry) * ax * (h - 0.035), { sx: 0.075, sy: 0.075, sz: s, ry });
    putL(W, GEO.box(), dark, x + Math.sin(ry) * ax * (h - 0.035), y + h + ay * (h - 0.035), z + Math.cos(ry) * ax * (h - 0.035), { sx: s, sy: 0.075, sz: 0.075, ry });
    putL(W, GEO.box(), dark, x + Math.cos(ry) * ax * (h - 0.035) + Math.sin(ry) * ay * (h - 0.035), y + h, z - Math.sin(ry) * ax * (h - 0.035) + Math.cos(ry) * ay * (h - 0.035), { sx: 0.075, sy: s, sz: 0.075, ry });
  }
  // plank joints and a brace on the four sides
  for (let k = 0; k < 4; k++) {
    const a = ry + (k * Math.PI) / 2, ox = Math.sin(a) * (h - 0.025), oz = Math.cos(a) * (h - 0.025);
    for (const t of [-0.17, 0.17]) putL(W, GEO.box(), dark, x + ox, y + h + t * s, z + oz, { sx: s - 0.14, sy: 0.02, sz: 0.012, ry: a });
    putL(W, GEO.box(), shade(wood, 0.84), x + ox * 1.01, y + h, z + oz * 1.01, { sx: s * 1.18, sy: 0.07, sz: 0.02, ry: a, rz: k % 2 ? 0.785 : -0.785 });
  }
}
// a barrel: staves that bulge in the middle, iron hoops, a lid set in a little
export function barrel(W, x, y, z, r = 0.38, h = 0.9, wood = 0x9a6b4f) {
  const iron = 0x5c5c6a;
  put(W, GEO.taper(12, 0.84), wood, x, y + h * 0.75, z, { sx: r * 1.06, sy: h / 2, sz: r * 1.06, tint: footTint(0.96, 1.05) });
  put(W, GEO.taper(12, 0.84), wood, x, y + h * 0.25, z, { sx: r * 1.06, sy: h / 2, sz: r * 1.06, rx: Math.PI, tint: footTint(0.84, 0.98) });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.283; put(W, GEO.box(), shade(wood, 0.78), x + Math.cos(a) * r * 1.0, y + h / 2, z + Math.sin(a) * r * 1.0, { sx: 0.02, sy: h * 0.9, sz: 0.03, ry: -a }); }
  for (const [t, k] of [[0.12, 0.93], [0.5, 1.075], [0.88, 0.93]]) put(W, GEO.cyl(12), iron, x, y + h * t, z, { sx: r * k, sy: 0.055, sz: r * k });
  put(W, GEO.cyl(12), shade(wood, 1.12), x, y + h - 0.02, z, { sx: r * 0.8, sy: 0.03, sz: r * 0.8 });
  put(W, GEO.cyl(6), shade(wood, 0.7), x + r * 0.3, y + h, z, { sx: 0.04, sy: 0.03, sz: 0.04 });
}
// a giant clam, its hinge towards `ry`: two fluted shells (one lying, one tilted open), a pearl on a soft tongue
export function clam(W, x, y, z, ry, { shell = 0xff9eb8, lip = 0xffc2d4 } = {}) {
  const fx = Math.sin(ry), fz = Math.cos(ry);
  put(W, GEO.dome(), shell, x, y, z, { sx: 1.0, sy: 0.32, sz: 0.85, ry, tint: footTint(0.86, 1.06) });
  putL(W, GEO.dome(), lip, x - fx * 0.6, y + 0.18, z - fz * 0.6, { sx: 1.0, sy: 0.32, sz: 0.85, ry, rx: -1.0, tint: footTint(0.9, 1.08) });
  // flutes: ridges fanning out from the hinge over both shells, a scalloped lip
  for (let k = -3; k <= 3; k++) {
    const a = ry + k * 0.3, rx = Math.sin(a), rz = Math.cos(a);
    putL(W, GEO.taper(5, 0.4), shade(shell, 0.9), x - fx * 0.5 + rx * 0.62, y + 0.2, z - fz * 0.5 + rz * 0.62, { sx: 0.07, sy: 1.0, sz: 0.05, ry: a, rx: Math.PI / 2 - 0.2 });
    put(W, GEO.blob(), lip, x - fx * 0.42 + rx * 1.22, y + 0.06, z - fz * 0.42 + rz * 1.22, { sx: 0.13, sy: 0.07, sz: 0.13 });
  }
  put(W, GEO.dome(), 0xffe0ea, x, y + 0.14, z, { sx: 0.62, sy: 0.14, sz: 0.52, ry });
  put(W, GEO.blob(), 0xfff8ec, x, y + 0.33, z, { sx: 0.2, sy: 0.2, sz: 0.2, kind: 'glow' });
}
// a little crab: a shell, two eyes on stalks, claws up, legs out to the sides
export function crab(W, x, y, z, ry, s = 1, color = 0xe8553b) {
  const fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry);
  put(W, GEO.blob(), color, x, y + 0.07 * s, z, { sx: 0.13 * s, sy: 0.07 * s, sz: 0.1 * s, ry });
  for (const e of [-1, 1]) {
    put(W, GEO.cyl(4), color, x + sx * e * 0.05 * s + fx * 0.07 * s, y + 0.15 * s, z + sz * e * 0.05 * s + fz * 0.07 * s, { sx: 0.012 * s, sy: 0.07 * s, sz: 0.012 * s });
    put(W, GEO.ico(), 0x2a1f3d, x + sx * e * 0.05 * s + fx * 0.07 * s, y + 0.19 * s, z + sz * e * 0.05 * s + fz * 0.07 * s, { sx: 0.022 * s, sy: 0.022 * s, sz: 0.022 * s });
    put(W, GEO.blob(), shade(color, 1.1), x + sx * e * 0.17 * s + fx * 0.09 * s, y + 0.12 * s, z + sz * e * 0.17 * s + fz * 0.09 * s, { sx: 0.05 * s, sy: 0.04 * s, sz: 0.035 * s });
    for (let k = 0; k < 3; k++) putL(W, GEO.box(), shade(color, 0.85), x + sx * e * 0.16 * s + fx * (k - 1.2) * 0.05 * s, y + 0.04 * s, z + sz * e * 0.16 * s + fz * (k - 1.2) * 0.05 * s, { sx: 0.11 * s, sy: 0.018 * s, sz: 0.018 * s, ry, rz: -e * 0.5 });
  }
}
// a beach parasol: a pole, a canopy of eight panels in two colours with a rim, a finial
let _panels = null;
const panelGeo = () => _panels || (_panels = [0, 1].map(odd => {
  const pos = [], N = 8;
  for (let i = odd; i < N; i += 2) {
    const a0 = (i / N) * 6.283, a1 = ((i + 1) / N) * 6.283;
    const A = [Math.cos(a0), 0, Math.sin(a0)], B = [Math.cos(a1), 0, Math.sin(a1)], T = [0, 1, 0], lo = p => [p[0] * 1.0, -0.12, p[2] * 1.0];
    pos.push(...T, ...B, ...A, ...A, ...B, ...lo(B), ...A, ...lo(B), ...lo(A), ...T, ...A, ...B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
}));
export function parasol(W, x, y, z, [c0, c1], turn = 0) {
  put(W, GEO.cyl(6), 0xf5f0e8, x, y + 1.1, z, { sx: 0.045, sy: 2.2, sz: 0.045 });
  const [even, odd] = panelGeo();
  put(W, even, c0, x, y + 2.0, z, { sx: 1.42, sy: 0.52, sz: 1.42, ry: turn });
  put(W, odd, c1, x, y + 2.0, z, { sx: 1.42, sy: 0.52, sz: 1.42, ry: turn });
  put(W, GEO.ico(), c1, x, y + 2.58, z, { sx: 0.07, sy: 0.09, sz: 0.07 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283 - turn; putL(W, GEO.box(), 0xf5f0e8, x + Math.cos(a) * 0.7, y + 2.2, z + Math.sin(a) * 0.7, { sx: 1.42, sy: 0.02, sz: 0.02, ry: -a, rz: -0.35 }); }
}
// a sandcastle: a keep with four corner towers, each with a pointed top, a flag on the keep, a moat ring
export function sandcastle(W, x, y, z, s = 1, sand = 0xf0d08a) {
  const dark = shade(sand, 0.86);
  put(W, GEO.cyl(12), dark, x, y + 0.01, z, { sx: 0.62 * s, sy: 0.02, sz: 0.62 * s, kind: 'fx' });
  block(W, sand, x, y + 0.15 * s, z, 0.5 * s, 0.3 * s, 0.5 * s, { b: 0.03 * s, tint: footTint(0.88, 1.04) });
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    put(W, GEO.cyl(8), sand, x + ax * 0.26 * s, y + 0.2 * s, z + az * 0.26 * s, { sx: 0.1 * s, sy: 0.4 * s, sz: 0.1 * s, tint: footTint(0.88, 1.04) });
    put(W, GEO.cone(8), dark, x + ax * 0.26 * s, y + 0.47 * s, z + az * 0.26 * s, { sx: 0.12 * s, sy: 0.16 * s, sz: 0.12 * s });
  }
  put(W, GEO.cyl(8), sand, x, y + 0.38 * s, z, { sx: 0.14 * s, sy: 0.2 * s, sz: 0.14 * s });
  put(W, GEO.cyl(4), 0x8a5a3c, x, y + 0.62 * s, z, { sx: 0.01 * s, sy: 0.3 * s, sz: 0.01 * s });
  put(W, GEO.box(), 0xff6b6b, x + 0.06 * s, y + 0.72 * s, z, { sx: 0.12 * s, sy: 0.07 * s, sz: 0.01 });
}

// ---------- the Moon ----------
// a little rover: a body on six wheels, a mast with a camera, a dish, a solar deck (no collider: park it where
// nothing else goes)
export function rover(W, x, z, ry, y = 0, s = 1) {
  const fx = Math.sin(ry), fz = Math.cos(ry), sx = Math.cos(ry), sz = -Math.sin(ry);
  const at = (a, up, f) => [x + sx * a * s + fx * f * s, y + up * s, z + sz * a * s + fz * f * s];
  putL(W, GEO.bevel(0.12), 0xf2f4fa, ...at(0, 0.36, 0), { sx: 0.62 * s, sy: 0.22 * s, sz: 0.95 * s, ry, tint: footTint(0.86, 1.03) });
  putL(W, GEO.box(), 0x2d3f9e, ...at(0, 0.485, -0.08), { sx: 0.56 * s, sy: 0.03 * s, sz: 0.7 * s, ry });
  putL(W, GEO.box(), 0xffd23f, ...at(0, 0.36, 0.48), { sx: 0.64 * s, sy: 0.06 * s, sz: 0.03 * s, ry });
  for (const e of [-1, 1]) for (const f of [-0.36, 0, 0.36]) {
    putL(W, GEO.cyl(8), 0x3a3850, ...at(e * 0.38, 0.14, f), { sx: 0.14 * s, sy: 0.1 * s, sz: 0.14 * s, ry, rz: Math.PI / 2 });
    putL(W, GEO.cyl(6), 0xa9a5ba, ...at(e * 0.435, 0.14, f), { sx: 0.06 * s, sy: 0.02 * s, sz: 0.06 * s, ry, rz: Math.PI / 2 });
    putL(W, GEO.box(), 0x8f8aa3, ...at(e * 0.33, 0.24, f), { sx: 0.04 * s, sy: 0.16 * s, sz: 0.04 * s, ry });
  }
  put(W, GEO.cyl(5), 0xa9a5ba, ...at(0.15, 0.72, 0.3), { sx: 0.022 * s, sy: 0.5 * s, sz: 0.022 * s });
  putL(W, GEO.bevel(0.15), 0xf2f4fa, ...at(0.15, 1.0, 0.3), { sx: 0.2 * s, sy: 0.11 * s, sz: 0.13 * s, ry });
  for (const e of [-1, 1]) put(W, GEO.ico(), 0x2a2438, ...at(0.15 + e * 0.05, 1.0, 0.37), { sx: 0.03 * s, sy: 0.03 * s, sz: 0.02 * s });
  putL(W, GEO.dome(), 0xcfcbe0, ...at(-0.16, 0.66, -0.3), { sx: 0.17 * s, sy: 0.07 * s, sz: 0.17 * s, ry, rx: Math.PI - 0.5 });
  put(W, GEO.cyl(5), 0xa9a5ba, ...at(-0.16, 0.56, -0.3), { sx: 0.018 * s, sy: 0.18 * s, sz: 0.018 * s });
}
