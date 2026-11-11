// Island moods: the five islands of a world share its look but each has a character of its own — a colour
// shift (blossom, autumn, golden…), more or fewer trees and rocks, and one landmark (a stone circle, giant
// mushrooms, an ancient oak, a wreck…). A world's islands get its moods in campaign order, so no two match.
// The layout calls W.landmark() before its trees and rocks, so they grow around the landmark.
import * as THREE from 'three';
import { GEO, bevelBox } from './world-kit.js';
import { shade, mix, footTint, capTint, leafTint, capOf, stoneGeo, igloo as buildIgloo, shipwreck, barrel } from './world-props.js';

// tint: theme colour overrides; trees / rocks: multipliers on the layout's counts; fruit: colour of fruit in
// round trees; o: options for the landmark
export const MOODS = {
  meadow: [
    { landmark: 'well' },
    { tint: { leaves: [0xffb3d1, 0xff9ec7, 0xffd6e8, 0x9fe07a], flowers: [0xff5d8f, 0xffffff, 0xff8fc7, 0xc77dff] }, trees: 0.8, landmark: 'stones' },
    { tint: { grass: 0x7fd06a, leaves: [0x3fae5a, 0x4fbf5a, 0x2f9a5a, 0x5fc068] }, trees: 1.7, rocks: 0.6, landmark: 'mushrooms' },
    { tint: { grass: 0xb5dc6a, cap: 0xc8e57a, tuft: 0xa8c957, leaves: [0xf2a541, 0xe8743b, 0xffd23f, 0x9fd05a] }, landmark: 'oak' },
    { tint: { leaves: [0x5fd068, 0x6cc357, 0x4fbf5a] }, fruit: 0xe8413b, trees: 1.4, landmark: 'ruin' },
  ],
  farm: [
    { landmark: 'well' },
    { tint: { grass: 0x8fd86a, leaves: [0x4fbf5a, 0x5fd068, 0x3fae63] }, trees: 1.5, landmark: 'oak' },
    { tint: { grass: 0xbcd46a, cap: 0xcfe07a, leaves: [0xe8743b, 0xf2a541, 0xd6c24a, 0xc0392b], tuft: 0xb0b45a }, landmark: 'pumpkins' },
    { tint: { leaves: [0xffb3d1, 0xff9ec7, 0x9fe07a], flowers: [0xff8fc7, 0xffffff, 0xc77dff] }, fruit: 0xffd23f, landmark: 'campfire' },
    { tint: { grass: 0xc7d86a, cap: 0xd9e07a, tuft: 0xd9c45a }, trees: 0.6, landmark: 'stones' },
  ],
  frost: [
    { landmark: 'crystal', o: { glow: 0x9ad8ff } },
    { tint: { cap: 0xfff6ee, leaves: [0x2a7f66, 0x24705a] }, trees: 1.4, landmark: 'campfire' },
    { tint: { rock: 0x9ad8ff }, rocks: 1.8, trees: 0.7, landmark: 'stones', o: { stone: 0xbfe8ff } },
    { landmark: 'igloo' },
    { tint: { grass: 0xf2eeff, rock: 0xd6c8ff, leaves: [0x3a7f8a, 0x2f6f7a] }, landmark: 'oak', o: { bare: true } },
  ],
  frostwood: [
    { landmark: 'campfire' },
    { tint: { leaves: [0x1f5f48, 0x255f4a, 0x1a5040] }, trees: 1.3, landmark: 'oak', o: { bare: true } },
    { tint: { leaves: [0xd9a441, 0xc98a3a, 0x2f7a5a] }, landmark: 'stones' },
    { trees: 0.7, landmark: 'igloo' },
    { tint: { leaves: [0x3d8a64, 0x2f7a5a], flowers: [0xff6b8a, 0xffffff] }, landmark: 'mushrooms' },
  ],
  reef: [
    { landmark: 'totems' },
    { tint: { flowers: [0xff6b6b, 0xffd23f, 0xff9f43] }, landmark: 'wreck' },
    { tint: { grass: 0xf6c8a8, rock: 0xc98bff }, rocks: 1.5, landmark: 'ruin', o: { stone: 0xf3d9a4 } },
    { tint: { cap: 0x7fd05a, leaves: [0x3fae63, 0x2f9a5a, 0x4fbf5a] }, trees: 1.8, landmark: 'campfire' },
    { tint: { grass: 0xfbeed0 }, trees: 0.7, landmark: 'crystal', o: { glow: 0xff9eb8 } },
  ],
  cove: [
    { landmark: 'wreck' },
    { tint: { flowers: [0x6ee7ff, 0xff9ee8] }, landmark: 'crystal', o: { glow: 0x6ee7ff } },
    { tint: { grass: 0xd9c49a }, rocks: 1.6, trees: 0.6, landmark: 'ruin', o: { stone: 0xc9b79a } },
    { tint: { cap: 0x7fc85a, leaves: [0x3fae63, 0x2f9a5a] }, trees: 1.6, landmark: 'totems' },
    { tint: { grass: 0xf2e2b4 }, landmark: 'campfire' },
  ],
  starfall: [
    { landmark: 'crystal', o: { glow: 0x6ee7ff } },
    { tint: { leaves: [0xff9ee8, 0xffb3d1, 0xc77dff] }, landmark: 'stones', o: { glow: 0xff9ee8 } },
    { tint: { grass: 0x8a9fd8, cap: 0xa3b4e6, tuft: 0x7a8fc8 }, landmark: 'mushrooms', o: { glow: true } },
    { tint: { leaves: [0xffe066, 0xffc94a, 0x6ee7ff] }, trees: 1.4, landmark: 'ruin', o: { stone: 0xbdb1e6 } },
    { tint: { grass: 0x5fae9a, leaves: [0x6ee7ff, 0x9ef0ff] }, landmark: 'oak', o: { glowLeaves: true } },
  ],
  moon: [
    { landmark: 'lander' },
    { tint: { grass: 0xd8cfc4, cap: 0xe8e0d4, rock: 0xb8aa9a }, landmark: 'dish' },
    { tint: { grass: 0xc4cce0, cap: 0xd8def0 }, rocks: 1.5, landmark: 'crystal', o: { glow: 0xb693f5 } },
    { tint: { grass: 0xbab6c8 }, landmark: 'ruin', o: { stone: 0x8f8aa3, glow: 0x6ee7ff } },
    { tint: { grass: 0xdcd6e8, rock: 0x8f8aa3 }, rocks: 0.6, landmark: 'stones', o: { glow: 0xffd23f } },
  ],
  cliffs: [
    { landmark: 'stones' },
    { tint: { flowers: [0xb07ad8, 0xc77dff, 0xffffff], tuft: 0x7a9a58 }, landmark: 'ruin' },
    { tint: { flowers: [0xffd23f, 0xffc94a, 0xffffff], leaves: [0x6dbb58, 0x7cc45a] }, landmark: 'campfire' },
    { tint: { grass: 0x6fc85a, leaves: [0x4e9a48, 0x3f8a40] }, trees: 1.6, landmark: 'oak' },
    { tint: { grass: 0x8fd06a }, rocks: 1.4, landmark: 'well', o: { stone: 0xeee8da } },
  ],
  storm: [
    { landmark: 'ruin' },
    { tint: { grass: 0x5f7d58 }, landmark: 'rod' },
    { tint: { grass: 0x7a8a5c, cap: 0x8f9a6a }, trees: 0.6, landmark: 'wreck' },
    { tint: { grass: 0x6a8c72, leaves: [0x4a7346, 0x3f6a4a] }, trees: 1.5, landmark: 'stones', o: { glow: 0x6fa58a } },
    { tint: { grass: 0x8a8a62, cap: 0x9a9a72, tuft: 0x7a7a52 }, rocks: 1.5, landmark: 'oak', o: { bare: true } },
  ],
};

export const islandMood = (themeId, index) => { const m = MOODS[themeId]; return m ? m[index % m.length] : null; };

// ---------- placing the landmark ----------
// a flat, free spot well away from the pedestal and the path in, preferably out towards the shore
const SIZE = { well: 1.8, stones: 3.4, mushrooms: 2.8, oak: 3.0, ruin: 3.0, crystal: 2.2, igloo: 2.6, pumpkins: 2.8, campfire: 2.8, wreck: 3.2, totems: 2.4, lander: 2.6, dish: 2.2, rod: 1.8 };
export function placeLandmark(W) {
  const mood = W.mood;
  if (!mood?.landmark || W.landmarkPlaced) return;
  W.landmarkPlaced = true;
  // full size where it fits, else a smaller one (crowded islands)
  for (const k of [1, 0.8, 0.65]) {
    const spot = findSpot(W, SIZE[mood.landmark] * k);
    if (!spot) continue;
    const { x, z, y, r } = spot;
    const L = local(W, x, y, z, Math.atan2(-x, -z), k); // local +z faces the pedestal
    BUILD[mood.landmark](W, L, mood.o || {});
    W.obstacles.push({ x, z, r });
    W.landmarkAt = { kind: mood.landmark, x, z, scale: k };
    return;
  }
}
const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
function findSpot(W, r) {
  let best = null;
  for (let i = 0; i < 500 && !(best && i >= 160); i++) {
    const th = W.rng() * Math.PI * 2, d = Math.sqrt(W.rng()) * W.bound;
    const x = Math.cos(th) * d, z = Math.sin(th) * d;
    if (W.nearCentre(x, z, r + 1.2) || W.spawnPath(x, z, r + 0.6) || W.walkSd(x, z) > -(r + 0.6)) continue;
    const y = W.flatAt(x, z, r, 0.03);
    if (y === null || y < -0.05) continue;
    if (W.blocked(x, z, r, y, 4) || W.crowded(x, z, r)) continue;
    // keep off fields, beds, ice, drifts, lagoons and crater rims (where the layout keeps grass away too)
    if (W.noTuft && [[0, 0], ...RING.map(([a, b]) => [a * r, b * r])].some(([a, b]) => W.noTuft(x + a, z + b))) continue;
    if (W.surfaceAt && RING.some(([a, b]) => W.surfaceAt(x + a * r, z + b * r, y))) continue;
    const score = d + W.rng() * 3;
    if (!best || score > best.score) best = { x, z, y, r, score };
  }
  return best;
}

// a frame at the landmark: p() puts a shape at local coordinates, box() adds an axis-aligned collider around a
// local point (rotations are ignored, so keep colliders roughly square); k scales the whole landmark
function local(W, x, y, z, ry, k = 1) {
  const c = Math.cos(ry) * k, s = Math.sin(ry) * k;
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  return {
    W, x, y, z, ry, at, k,
    p(geo, color, lx, ly, lz, { sx = 1, sy = 1, sz = 1, rx = 0, ry: r2 = 0, rz = 0, kind = 'solid', tint = null } = {}) {
      const [wx, wz] = at(lx, lz);
      Q.setFromEuler(E.set(rx, ry + r2, rz, 'YXZ'));
      W.B.add(geo, color, M.compose(P.set(wx, y + ly * k, wz), Q, S.set(sx * k, sy * k, sz * k)), kind, tint);
    },
    // a one-off shape (freed once merged), and a bevelled block of real size
    own(geo, color, lx, ly, lz, { rx = 0, ry: r2 = 0, rz = 0, kind = 'solid', tint = null } = {}) {
      const [wx, wz] = at(lx, lz);
      Q.setFromEuler(E.set(rx, ry + r2, rz, 'YXZ'));
      W.B.own(geo, color, M.compose(P.set(wx, y + ly * k, wz), Q, S.set(k, k, k)), kind, tint);
    },
    block(color, lx, ly, lz, w, h, d, { b = 0.05, ...o } = {}) { this.own(bevelBox(w, h, d, Math.min(b, w * 0.3, h * 0.3, d * 0.3)), color, lx, ly, lz, o); },
    // grass gathers round its foot here
    skirt(lx, lz, r) { const [wx, wz] = at(lx, lz); W.skirts.push({ x: wx, z: wz, y, r: r * k }); },
    box(lx, lz, hx, hz, y0, y1, o = {}) {
      const [wx, wz] = at(lx, lz);
      return W.box(wx - hx * k, y + y0 * k, wz - hz * k, wx + hx * k, y + y1 * k, wz + hz * k, o);
    },
  };
}

const pick = (W, list) => list[Math.floor(W.rng() * list.length)];
const stoneOf = (W, o) => o.stone ?? W.T.rock;

// ---------- landmarks ----------
const BUILD = {
  // a stone well: a ring of dressed stones in two courses under a capping, a windlass with a crank between two posts,
  // a little shingled roof over it, the bucket hanging on its rope
  well(W, L, o) {
    const st = o.stone ?? 0xcfc8b8, dark = shade(st, 0.84), wood = W.T.trunk, cap = capOf(W.T), d = W.drng, N = 9;
    for (let c = 0; c < 2; c++) for (let k = 0; k < N; k++) {
      const a = ((k + c * 0.5) / N) * Math.PI * 2;
      L.block((k + c) % 2 ? st : shade(st, 0.93), Math.sin(a) * 0.84, 0.2 + c * 0.38, Math.cos(a) * 0.84, 0.61, 0.39, 0.3, { b: 0.05, ry: a, tint: footTint(c ? 0.95 : 0.82, 1.02) });
    }
    for (let k = 0; k < N; k++) {
      const a = ((k + 0.25) / N) * Math.PI * 2;
      L.block(dark, Math.sin(a) * 0.86, 0.83, Math.cos(a) * 0.86, 0.63, 0.1, 0.42, { b: 0.03, ry: a, tint: capTint(cap.color, 0.8, 0.96) });
    }
    L.p(GEO.cyl(12), 0x2f3a4a, 0, 0.42, 0, { sx: 0.7, sy: 0.8, sz: 0.7 });
    L.p(GEO.cyl(12), 0x3a8fc8, 0, 0.6, 0, { sx: 0.69, sy: 0.04, sz: 0.69, kind: 'fx' });
    // the posts, the beam they carry and the windlass with its crank
    for (const s of [-1, 1]) {
      L.p(GEO.box(), wood, s * 1.0, 0.97, 0, { sx: 0.14, sy: 1.94, sz: 0.14, tint: footTint(0.78, 1.03) });
      L.p(GEO.box(), shade(wood, 0.9), s * 1.0, 1.93, 0, { sx: 0.12, sy: 0.1, sz: 1.5 });
      L.p(GEO.box(), shade(wood, 0.9), s * 0.78, 1.72, 0, { sx: 0.07, sy: 0.07, sz: 0.5, ry: Math.PI / 2, rx: s * 0.8 });
    }
    L.p(GEO.box(), shade(wood, 0.9), 0, 1.94, 0, { sx: 2.2, sy: 0.1, sz: 0.12 });
    L.p(GEO.cyl(8), shade(wood, 1.1), 0, 1.45, 0, { sx: 0.06, sy: 2.14, sz: 0.06, rz: Math.PI / 2 });
    L.p(GEO.cyl(10), shade(wood, 1.16), 0, 1.45, 0, { sx: 0.13, sy: 0.8, sz: 0.13, rz: Math.PI / 2 });
    L.p(GEO.box(), 0x5c5c6a, 1.12, 1.36, 0, { sx: 0.04, sy: 0.24, sz: 0.04 });
    L.p(GEO.cyl(6), wood, 1.2, 1.26, 0, { sx: 0.035, sy: 0.18, sz: 0.035, rz: Math.PI / 2 });
    L.p(GEO.cyl(5), 0xd9c49a, 0.12, 1.18, 0, { sx: 0.018, sy: 0.5, sz: 0.018 });
    L.p(GEO.taper(8, 1.3), 0x8a5a3c, 0.12, 0.88, 0, { sx: 0.13, sy: 0.24, sz: 0.13, tint: footTint(0.85, 1.05) });
    L.p(GEO.cyl(8), 0x5c5c6a, 0.12, 0.93, 0, { sx: 0.172, sy: 0.035, sz: 0.172 });
    // the roof: a gable along the beam, two rows of shingles a side
    L.p(GEO.cyl(3), 0xe0604f, 0, 2.22, 0, { sx: 0.98, sy: 2.6, sz: 0.52, rx: -Math.PI / 2, ry: Math.PI / 2 });
    const slope = Math.atan2(0.78, 0.85);
    for (const s of [-1, 1]) for (const t of [0.42, 0.8]) L.p(GEO.box(), shade(0xe0604f, 0.8), 0, 1.96 + 0.78 * (1 - t) + 0.03, s * 0.85 * t, { sx: 2.62, sy: 0.045, sz: 0.09, rx: s * slope });
    L.p(GEO.box(), shade(0xe0604f, 0.8), 0, 2.74, 0, { sx: 2.66, sy: 0.08, sz: 0.12 });
    // a spare bucket and a few stones at its foot
    L.p(GEO.taper(8, 1.3), 0x8a5a3c, -1.25, 0.13, 0.75, { sx: 0.14, sy: 0.26, sz: 0.14, tint: footTint(0.85, 1.05) });
    for (let k = 0; k < 3; k++) { const a = d() * 6.283; L.p(GEO.rock(), dark, Math.sin(a) * 1.3, 0.07, Math.cos(a) * 1.3, { sx: 0.18, sy: 0.12, sz: 0.15, ry: d() * 6 }); }
    L.skirt(0, 0, 1.2);
    L.box(0, 0, 1, 1, 0, 0.9, { sound: 'stone' });
  },

  // a ring of standing stones, open towards the pedestal, with a trilithon at the back and an altar; each stone
  // narrows towards its top and leans its own way, moss (or snow) on what faces up
  stones(W, L, o) {
    const st = stoneOf(W, o), dark = new THREE.Color(st).multiplyScalar(0.85).getHex(), cap = capOf(W.T), d = W.drng;
    const tint = capTint(o.stone ? shade(st, 1.08) : cap.color, cap.from + 0.12, 0.82);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (k === 0) continue; // the gap faces the pedestal (+z)
      const lx = Math.sin(a) * 2.6, lz = Math.cos(a) * 2.6;
      if (k === 4) continue; // the trilithon stands there
      const h = 1.5 + W.rng() * 0.8, rz = (W.rng() - 0.5) * 0.12;
      L.own(stoneGeo(0.76, h, 0.5, { top: 0.64 + d() * 0.2, lean: (d() - 0.5) * 0.1, skew: (d() - 0.5) * 0.35 }), k % 2 ? st : dark, lx, -0.04, lz, { ry: a, rz, tint });
      // runes down its inner face
      if (o.glow) for (const [t, w, hh] of [[0.36, 0.13, 0.05], [0.47, 0.05, 0.13], [0.6, 0.13, 0.05], [0.7, 0.06, 0.06]]) L.p(GEO.box(), o.glow, lx - Math.sin(a) * 0.24 * (1 - t * 0.3), h * t, lz - Math.cos(a) * 0.24 * (1 - t * 0.3), { sx: w, sy: hh, sz: 0.03, ry: a, kind: 'glow' });
      if (d() < 0.7) { const ra = d() * 6.283; L.p(GEO.rock(), dark, lx + Math.sin(ra) * 0.6, 0.08, lz + Math.cos(ra) * 0.6, { sx: 0.22, sy: 0.14, sz: 0.18, ry: d() * 6, tint }); }
      L.skirt(lx, lz, 0.55);
      L.box(lx, lz, 0.4, 0.4, 0, h, { sound: 'stone' });
    }
    for (const s of [-1, 1]) {
      L.own(stoneGeo(0.64, 2.64, 0.54, { top: 0.86, lean: -s * 0.02 }), st, s * 0.75, -0.04, -2.6, { tint });
      L.skirt(s * 0.75, -2.6, 0.5);
      L.box(s * 0.75, -2.6, 0.32, 0.3, 0, 2.6, { sound: 'stone' });
    }
    L.own(stoneGeo(2.5, 0.42, 0.66, { top: 0.93, skew: 0.02 }), dark, 0, 2.58, -2.6, { tint });
    // the altar: a slab on two feet
    for (const s of [-1, 1]) L.block(st, s * 0.42, 0.14, 0, 0.3, 0.28, 0.62, { b: 0.04 });
    L.block(dark, 0, 0.36, 0, 1.36, 0.16, 0.84, { b: 0.04, tint: footTint(0.92, 1.03) });
    if (o.glow) L.p(GEO.ico(), o.glow, 0, 0.62, 0, { sx: 0.2, sy: 0.2, sz: 0.2, kind: 'glow' });
    L.box(0, 0, 0.6, 0.6, 0, 0.44, { top: true, sound: 'stone' });
  },

  // giant toadstools of rising heights: hop from cap to cap. Each has a stout stem with a ring, a cap with a rolled
  // rim and spots, gills underneath, and little ones coming up at its foot
  mushrooms(W, L, o) {
    const caps = o.glow ? [0x6ee7ff, 0xff9ee8, 0xb693f5] : [0xe8413b, 0xff6b4a, 0xd9443b], d = W.drng;
    const list = [[0.4, -0.2, 2.5, 1.3], [1.6, 0.9, 1.7, 0.95], [-1.4, 1.0, 0.9, 0.75], [-0.9, -1.4, 1.5, 0.8], [1.3, -1.5, 0.5, 0.5]];
    const kind = o.glow ? 'glow' : 'solid', stem = 0xf5ecd8, gill = o.glow ? 0xc9e4f5 : 0xdcc49c;
    for (const [lx, lz, h, cr] of list) {
      L.p(GEO.taper(9, 0.62), stem, lx, h / 2, lz, { sx: cr * 0.37, sy: h, sz: cr * 0.37, tint: footTint(0.84, 1.03) });
      if (h > 0.8) L.p(GEO.taper(9, 0.45), shade(stem, 0.93), lx, h * 0.72, lz, { sx: cr * 0.42, sy: cr * 0.2, sz: cr * 0.42 });
      const c = pick(W, caps);
      L.p(GEO.dome(), c, lx, h - 0.05, lz, { sx: cr, sy: cr * 0.6, sz: cr, kind, tint: footTint(0.86, 1.08) });
      L.p(GEO.cyl(12), shade(c, 0.84), lx, h - 0.045, lz, { sx: cr * 1.035, sy: cr * 0.09, sz: cr * 1.035, kind });
      // the underside (the dome is open at the bottom: from below you'd look straight into it): gills, a darker
      // ring round the stem
      L.p(GEO.cyl(12), o.glow ? 0xe8f6ff : 0xf3e2c4, lx, h - 0.08, lz, { sx: cr * 0.99, sy: 0.06, sz: cr * 0.99, kind });
      L.p(GEO.cyl(12), gill, lx, h - 0.12, lz, { sx: cr * 0.55, sy: 0.04, sz: cr * 0.55 });
      for (let k = 0; k < 8; k++) L.p(GEO.box(), gill, lx, h - 0.112, lz, { sx: 0.035 * cr, sy: 0.012, sz: cr * 1.9, ry: (k / 8) * Math.PI });
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + W.rng(), rr = cr * (0.35 + W.rng() * 0.35), ss = cr * (0.09 + d() * 0.07);
        L.p(GEO.ico(), 0xffffff, lx + Math.cos(a) * rr, h - 0.05 + cr * 0.6 * Math.sqrt(1 - (rr / cr) ** 2), lz + Math.sin(a) * rr, { sx: ss, sy: ss * 0.5, sz: ss });
      }
      L.p(GEO.ico(), 0xffffff, lx, h - 0.05 + cr * 0.6, lz, { sx: cr * 0.16, sy: cr * 0.07, sz: cr * 0.16 });
      // little ones at its foot
      for (let k = 0; k < 2; k++) {
        const a = d() * 6.283, rr = cr * 0.5 + 0.15, bh = 0.12 + d() * 0.14, bx = lx + Math.cos(a) * rr, bz = lz + Math.sin(a) * rr;
        L.p(GEO.cyl(6), stem, bx, bh / 2, bz, { sx: 0.035, sy: bh, sz: 0.035 });
        L.p(GEO.dome(), c, bx, bh - 0.01, bz, { sx: 0.1, sy: 0.075, sz: 0.1, kind });
      }
      L.skirt(lx, lz, cr * 0.45);
      L.box(lx, lz, cr * 0.3, cr * 0.3, 0, h);
      L.box(lx, lz, cr * 0.7, cr * 0.7, h, h + cr * 0.45, { top: true, sound: 'grass' });
    }
  },

  // an ancient tree: a thick trunk with a hollow, big roots, boughs reaching into a huge crown of leafy lumps
  // (bare: winter boughs with snow on them; fruit from the mood); on a green island a swing hangs from a bough
  oak(W, L, o) {
    const T = W.T, s = 1.35, d = W.drng, bark = footTint(0.72, 1.05);
    L.p(GEO.taper(10, 0.6), T.trunk, 0, 1.95 * s, 0, { sx: 0.66 * s, sy: 3.9 * s, sz: 0.66 * s, tint: bark });
    for (let k = 0; k < 5; k++) {
      const a = k * 1.256 + W.rng() * 0.4;
      L.p(GEO.cone(6), shade(T.trunk, 0.82), Math.sin(a) * 0.72 * s, 0.34, Math.cos(a) * 0.72 * s, { sx: 0.3 * s, sy: 1.5, sz: 0.3 * s, ry: a, rx: 2.0 });
    }
    // a hollow facing the pedestal, and a knot or two
    L.p(GEO.ico(), 0x3a2a24, 0, 1.5 * s, 0.56 * s, { sx: 0.2 * s, sy: 0.3 * s, sz: 0.08 });
    L.p(GEO.ico(), shade(T.trunk, 0.8), 0.42 * s, 2.3 * s, 0.36 * s, { sx: 0.1 * s, sy: 0.12 * s, sz: 0.06 });
    // boughs
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + 0.4;
      L.p(GEO.taper(6, 0.5), shade(T.trunk, 0.94), Math.sin(a) * 1.0 * s, 3.85 * s, Math.cos(a) * 1.0 * s, { sx: 0.2 * s, sy: 2.4 * s, sz: 0.2 * s, ry: a, rx: 0.85 });
    }
    if (o.bare) {
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + 0.4;
        // twigs off each bough, and snow lying along it
        for (let j = 0; j < 2; j++) L.p(GEO.taper(5, 0.4), shade(T.trunk, 0.94), Math.sin(a) * (1.3 + j * 0.5) * s, (4.3 + j * 0.35) * s, Math.cos(a) * (1.3 + j * 0.5) * s, { sx: 0.07 * s, sy: 1.1 * s, sz: 0.07 * s, ry: a + (j ? 0.9 : -0.9), rx: 0.5 });
        L.p(GEO.dome(), 0xffffff, Math.sin(a) * 1.5 * s, 4.52 * s, Math.cos(a) * 1.5 * s, { sx: 0.34 * s, sy: 0.13, sz: 0.24 * s, ry: a });
        L.p(GEO.dome(), 0xffffff, Math.sin(a) * 0.95 * s, 3.98 * s, Math.cos(a) * 0.95 * s, { sx: 0.26 * s, sy: 0.1, sz: 0.2 * s, ry: a });
      }
      L.p(GEO.dome(), 0xffffff, 0, 3.88 * s, 0, { sx: 0.42 * s, sy: 0.14, sz: 0.42 * s });
    } else {
      const leaf = () => pick(W, T.leaves);
      const kind = o.glowLeaves ? 'glow' : 'solid', tint = o.glowLeaves ? null : leafTint();
      L.p(GEO.lump(0), leaf(), 0, 5.4 * s, 0, { sx: 2.45 * s, sy: 1.7 * s, sz: 2.45 * s, ry: W.rng() * 3, kind, tint });
      for (let k = 0; k < 5; k++) {
        const a = k * 1.256 + W.rng() * 0.5;
        const c = leaf();
        L.p(GEO.lump(k + 1), c, Math.sin(a) * 1.9 * s, (4.4 + W.rng() * 0.8) * s, Math.cos(a) * 1.9 * s, { sx: 1.45 * s, sy: 1.1 * s, sz: 1.45 * s, ry: W.rng() * 3, kind, tint });
        if (W.mood.fruit) for (let f = 0; f < 3; f++) L.p(GEO.ico(), W.mood.fruit, Math.sin(a + f) * 2.6 * s, (3.9 + W.rng()) * s, Math.cos(a + f) * 2.6 * s, { sx: 0.16, sy: 0.16, sz: 0.16 });
        // smaller lumps between the big ones, and tufts on top
        const b = a + 0.63, cc = new THREE.Color(c).offsetHSL(0, 0, k % 2 ? 0.04 : -0.04).getHex();
        L.p(GEO.lump(k + 2), cc, Math.sin(b) * 2.35 * s, (4.9 + d() * 0.7) * s, Math.cos(b) * 2.35 * s, { sx: 0.9 * s, sy: 0.72 * s, sz: 0.9 * s, ry: d() * 6, kind, tint });
        if (k < 3) L.p(GEO.lump(k), cc, Math.sin(b * 2) * 1.1 * s, (6.55 + d() * 0.3) * s, Math.cos(b * 2) * 1.1 * s, { sx: 0.95 * s, sy: 0.7 * s, sz: 0.95 * s, ry: d() * 6, kind, tint });
      }
      // a swing from the bough that faces the pedestal
      if (T.step === 'grass' && !o.glowLeaves) {
        for (const e of [-1, 1]) L.p(GEO.cyl(5), 0xd9c49a, 1.25 + e * 0.28, 2.6, 1.75, { sx: 0.02, sy: 3.3, sz: 0.02 });
        L.p(GEO.box(), 0xb07a50, 1.25, 0.95, 1.75, { sx: 0.74, sy: 0.06, sz: 0.26 });
      }
    }
    L.skirt(0, 0, 0.95 * s);
    L.box(0, 0, 0.6 * s, 0.6 * s, 0, 4.5 * s, { sound: 'wood' });
  },

  // an old colonnade on a stepped plinth: columns of stacked drums on bases, some with capitals and a beam still on
  // them, some broken off; one lies fallen in pieces; moss on what faces up
  ruin(W, L, o) {
    const st = o.stone ?? 0xe8e2d4, dark = new THREE.Color(st).multiplyScalar(0.86).getHex(), d = W.drng;
    const cap = capOf(W.T), moss = o.stone ? shade(st, 1.06) : cap.color, mt = capTint(moss, 0.7, 0.9);
    L.block(dark, 0, 0.07, 0, 4.7, 0.16, 3.5, { b: 0.04 });
    L.block(shade(st, 0.93), 0, 0.2, 0, 4.4, 0.2, 3.2, { b: 0.04, tint: footTint(0.9, 1.02) });
    // joints in the plinth's top
    for (const t of [-1.1, 0, 1.1]) L.p(GEO.box(), dark, t, 0.301, 0, { sx: 0.03, sy: 0.006, sz: 3.1, kind: 'ground' });
    L.p(GEO.box(), dark, 0, 0.301, 0, { sx: 4.3, sy: 0.006, sz: 0.03, kind: 'ground' });
    L.box(0, 0, 2.2, 1.6, 0, 0.3, { top: true, sound: 'stone' });
    const drums = (lx, lz, y0, h, turn = {}) => {
      const n = Math.max(1, Math.round(h / 0.62)), dh = h / n;
      for (let k = 0; k < n; k++) L.p(GEO.cyl(12), k % 2 ? st : shade(st, 0.95), lx + (d() - 0.5) * 0.03, y0 + dh * (k + 0.5), lz + (d() - 0.5) * 0.03, { sx: 0.31, sy: dh - 0.015, sz: 0.31, ry: d() * 3, tint: k === n - 1 ? mt : footTint(0.93, 1.02), ...turn });
      for (let k = 1; k < n; k++) L.p(GEO.cyl(12), dark, lx, y0 + dh * k, lz, { sx: 0.285, sy: 0.03, sz: 0.285 });
    };
    const cols = [[-1.6, -1.1, 2.7], [1.6, -1.1, 2.7], [-1.6, 1.1, 1.3], [1.6, 1.1, 0.6], [0, -1.1, 2.7]];
    for (const [lx, lz, h] of cols) {
      L.block(dark, lx, 0.38, lz, 0.82, 0.16, 0.82, { b: 0.035 });
      L.p(GEO.cyl(12), st, lx, 0.5, lz, { sx: 0.38, sy: 0.09, sz: 0.38 });
      drums(lx, lz, 0.5, h - 0.2 - (h > 2 ? 0.14 : 0));
      if (h > 2) {
        L.p(GEO.taper(12, 0.72), st, lx, 0.3 + h - 0.09, lz, { sx: 0.42, sy: 0.14, sz: 0.42, rx: Math.PI });
        L.block(dark, lx, 0.3 + h + 0.08, lz, 0.84, 0.16, 0.84, { b: 0.035, tint: mt });
      } else {
        // broken off: a tilted stub on top
        L.p(GEO.cyl(10), st, lx + 0.04, 0.3 + h + 0.03, lz, { sx: 0.3, sy: 0.16, sz: 0.3, rx: 0.2, rz: 0.12, tint: mt });
      }
      L.box(lx, lz, 0.34, 0.34, 0.3, 0.3 + h, { top: h < 2, sound: 'stone' });
    }
    // the beam: three long stones, moss lying on them
    for (const [t, w] of [[-1.38, 1.34], [0, 1.4], [1.38, 1.34]]) L.block(t ? st : shade(st, 0.94), t, 3.3, -1.1, w, 0.4, 0.7, { b: 0.045, tint: mt });
    L.block(dark, 0, 3.54, -1.1, 4.3, 0.1, 0.84, { b: 0.03, tint: mt });
    if (o.glow) L.p(GEO.box(), o.glow, 0, 3.3, -0.74, { sx: 2.4, sy: 0.08, sz: 0.02, kind: 'glow' });
    // the fallen column, in three pieces, and rubble
    for (let k = 0; k < 3; k++) {
      const t = (k - 1) * 0.8;
      L.p(GEO.cyl(12), k % 2 ? st : shade(st, 0.95), 0.3 + Math.cos(0.3) * t, 0.6, 1.9 - Math.sin(0.3) * t, { sx: 0.3, sy: 0.74 - (k === 2 ? 0.14 : 0), sz: 0.3, rz: Math.PI / 2, ry: 0.3, tint: mt });
    }
    for (let k = 0; k < 5; k++) { const a = d() * 6.283, r = 2.2 + d() * 0.9; L.p(GEO.rock(), k % 2 ? st : dark, Math.sin(a) * r * 1.1, 0.08, Math.cos(a) * r * 0.8, { sx: 0.2 + d() * 0.14, sy: 0.13, sz: 0.18, ry: d() * 6, tint: mt }); }
    L.skirt(0, 0, 2.9);
    L.box(0.3, 1.9, 1.1, 0.35, 0, 0.9, { top: true, sound: 'stone' });
  },

  // a tall glowing crystal: a great shard with a bright heart, a ring of smaller ones leaning out round it, slivers
  // between them, all standing in a nest of stones
  crystal(W, L, o) {
    const c = o.glow ?? pick(W, W.T.leaves), d = W.drng, pale = new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.55).getHex();
    const turn = W.rng() * 3;
    L.p(GEO.shard(), c, 0, -0.1, 0, { sx: 0.82, sy: 3.75, sz: 0.82, ry: turn, kind: 'glow', tint: footTint(0.7, 1.2) });
    L.p(GEO.shard(), pale, 0, 0.4, 0, { sx: 0.3, sy: 3.0, sz: 0.3, ry: turn + 0.6, kind: 'glow' });
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + W.rng() * 0.4, dd = 1 + W.rng() * 0.6, h = 0.6 + W.rng() * 1.2;
      L.p(GEO.shard(), k % 2 ? c : 0xffffff, Math.sin(a) * dd, -0.05, Math.cos(a) * dd, { sx: 0.28, sy: h * 1.05, sz: 0.28, ry: a, rx: 0.35, kind: 'glow', tint: footTint(0.75, 1.15) });
      // a sliver beside it
      const b = a + 0.5, bd = dd * (0.7 + d() * 0.5);
      L.p(GEO.shard(), k % 2 ? pale : c, Math.sin(b) * bd, -0.03, Math.cos(b) * bd, { sx: 0.12, sy: 0.35 + d() * 0.4, sz: 0.12, ry: b, rx: 0.5 + d() * 0.3, kind: 'glow' });
    }
    const cap = capOf(W.T), st = stoneOf(W, {});
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + d() * 0.4, r = 0.75 + d() * 0.7;
      L.p(GEO.rock(), shade(st, 0.88 + d() * 0.14), Math.sin(a) * r, 0.13, Math.cos(a) * r, { sx: 0.34 + d() * 0.2, sy: 0.26, sz: 0.3, ry: d() * 6, tint: capTint(cap.color, cap.from, 0.85) });
    }
    L.skirt(0, 0, 1.7);
    L.box(0, 0, 0.7, 0.7, 0, 6, { sound: 'crystal' });
  },

  // a snow-block igloo with its tunnel facing the pedestal, a pair of snowshoes stuck in the snow beside it
  igloo(W, L) {
    buildIgloo(W, L.x, L.z, L.ry, { R: 1.7 * L.k, H: 1.5 * L.k, y: L.y, k: L.k, tunnel: 2.26 * L.k });
    for (const e of [0, 1]) L.p(GEO.cyl(8), 0xb07a50, 2.0 + e * 0.3, 0.42, 0.9, { sx: 0.13, sy: 0.03, sz: 0.4, rx: Math.PI / 2 - 0.25, rz: 0.1 + e * 0.2 });
    L.box(0, 0, 1.3, 1.3, 0, 1.4, { sound: 'snow' });
    L.box(0, 1.75, 0.55, 0.5, 0, 1.0, { sound: 'snow' });
  },

  // a pumpkin patch with a scarecrow: ribbed pumpkins on a trailing vine with big leaves; the scarecrow has a sack
  // head with button eyes under a floppy hat, straw at its cuffs, and a crow on its arm
  pumpkins(W, L) {
    const d = W.drng, vine = 0x5a7a3a;
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, dd = 0.9 + (k % 3) * 0.6, s = 0.3 + W.rng() * 0.25;
      const lx = Math.sin(a) * dd, lz = Math.cos(a) * dd + 0.3, c = k % 4 ? 0xf28c28 : 0xe8a33b, turn = d() * 3;
      for (let j = 0; j < 4; j++) L.p(GEO.blob(), j % 2 ? c : shade(c, 0.93), lx, s * 0.58, lz, { sx: s * 0.72, sy: s * 0.82, sz: s * 1.2, ry: turn + (j / 4) * Math.PI, tint: footTint(0.86, 1.05) });
      L.p(GEO.taper(5, 0.6), vine, lx, s * 1.36, lz, { sx: 0.06, sy: 0.22, sz: 0.06, rz: 0.3, ry: turn });
      // a leaf or two and a length of vine
      for (let j = 0; j < 2; j++) {
        const la = turn + j * 2.6, lr = s * 1.25;
        L.p(GEO.dome(), j ? 0x5fae4f : 0x4f9a44, lx + Math.sin(la) * lr, 0.03, lz + Math.cos(la) * lr, { sx: 0.3, sy: 0.07, sz: 0.24, ry: la });
      }
      L.p(GEO.cyl(5), vine, lx * 0.6, 0.04, lz * 0.6, { sx: 0.025, sy: Math.hypot(lx, lz) * 0.8, sz: 0.025, rx: Math.PI / 2, ry: Math.atan2(lx, lz) });
    }
    // the scarecrow
    const wood = W.T.trunk, z0 = -1.8;
    L.p(GEO.cyl(6), wood, 0, 1.0, z0, { sx: 0.08, sy: 2.0, sz: 0.08, tint: footTint(0.8, 1.02) });
    L.p(GEO.cyl(6), wood, 0, 1.47, z0, { sx: 0.055, sy: 1.7, sz: 0.055, rz: Math.PI / 2 });
    L.block(0x4a7ab8, 0, 1.28, z0, 0.62, 0.62, 0.32, { b: 0.06, tint: footTint(0.86, 1.03) });
    for (const s of [-1, 1]) {
      L.p(GEO.taper(6, 0.8), 0x4a7ab8, s * 0.52, 1.47, z0, { sx: 0.11, sy: 0.5, sz: 0.11, rz: s * Math.PI / 2 });
      for (let j = 0; j < 3; j++) L.p(GEO.cone(4), 0xf2cf6b, s * 0.84, 1.47 + (j - 1) * 0.05, z0, { sx: 0.035, sy: 0.24, sz: 0.035, rz: -s * (Math.PI / 2 + (j - 1) * 0.35) });
    }
    L.p(GEO.box(), 0xd9443b, 0.16, 1.2, z0 + 0.165, { sx: 0.16, sy: 0.16, sz: 0.02, rz: 0.2 });
    L.p(GEO.box(), 0x8a5a3c, 0, 0.99, z0, { sx: 0.66, sy: 0.07, sz: 0.35 });
    for (let j = 0; j < 5; j++) L.p(GEO.cone(4), 0xf2cf6b, -0.24 + j * 0.12, 0.86, z0 + 0.1, { sx: 0.04, sy: 0.22, sz: 0.04, rx: Math.PI });
    L.p(GEO.lump(1), 0xe9d3a0, 0, 1.94, z0, { sx: 0.27, sy: 0.29, sz: 0.27, tint: footTint(0.88, 1.04) });
    for (const s of [-1, 1]) L.p(GEO.ico(), 0x3a2a24, s * 0.1, 1.98, z0 + 0.255, { sx: 0.04, sy: 0.04, sz: 0.02 });
    L.p(GEO.box(), 0x3a2a24, 0, 1.86, z0 + 0.262, { sx: 0.16, sy: 0.02, sz: 0.02 });
    L.p(GEO.cone(4), 0xff8a3d, 0, 1.93, z0 + 0.3, { sx: 0.04, sy: 0.1, sz: 0.04, rx: Math.PI / 2 });
    L.p(GEO.cyl(10), 0x6b4a36, 0, 2.13, z0, { sx: 0.5, sy: 0.04, sz: 0.5, rz: 0.08 });
    L.p(GEO.taper(8, 0.35), 0x6b4a36, 0, 2.33, z0, { sx: 0.27, sy: 0.4, sz: 0.27, rz: 0.12 });
    L.p(GEO.cyl(8), 0xd9443b, 0, 2.18, z0, { sx: 0.275, sy: 0.06, sz: 0.275, rz: 0.08 });
    // the crow
    L.p(GEO.lump(2), 0x2a2438, -0.62, 1.6, z0, { sx: 0.11, sy: 0.1, sz: 0.16 });
    L.p(GEO.ico(), 0x2a2438, -0.62, 1.7, z0 + 0.12, { sx: 0.07, sy: 0.07, sz: 0.07 });
    L.p(GEO.cone(4), 0xffa94d, -0.62, 1.69, z0 + 0.2, { sx: 0.025, sy: 0.07, sz: 0.025, rx: Math.PI / 2 });
    L.skirt(0, z0, 0.3);
    L.box(0, -1.8, 0.3, 0.3, 0, 2.4, { sound: 'wood' });
  },

  // a campfire: a ring of stones, logs leaning together, flames in three colours, log seats with their rings
  // showing, and a ridge tent with its flap open, pegged down
  campfire(W, L) {
    const d = W.drng;
    for (let k = 0; k < 9; k++) L.p(GEO.rock(), k % 2 ? 0x8f8aa3 : 0x7d7892, Math.sin(k * 0.7) * 0.66, 0.1, Math.cos(k * 0.7) * 0.66, { sx: 0.2 + d() * 0.06, sy: 0.15, sz: 0.18, ry: k });
    L.p(GEO.cyl(10), 0x4a4350, 0, 0.02, 0, { sx: 0.6, sy: 0.03, sz: 0.6, kind: 'fx' });
    for (let k = 0; k < 4; k++) L.p(GEO.taper(6, 0.7), k % 2 ? 0x6b4a36 : 0x4f3a2e, Math.sin(k * 1.57 + 0.4) * 0.2, 0.26, Math.cos(k * 1.57 + 0.4) * 0.2, { sx: 0.075, sy: 0.72, sz: 0.075, ry: k * 1.57 + 0.4 + Math.PI, rx: 0.6 });
    L.p(GEO.cone(6), 0xff6a2a, 0, 0.52, 0, { sx: 0.34, sy: 0.82, sz: 0.34, kind: 'glow' });
    for (const [lx, lz, h] of [[0.16, 0.05, 0.5], [-0.14, 0.1, 0.42], [0.02, -0.17, 0.46]]) L.p(GEO.cone(5), 0xff8a3a, lx, 0.2 + h / 2, lz, { sx: 0.16, sy: h, sz: 0.16, rz: -lx, rx: lz, kind: 'glow' });
    L.p(GEO.cone(6), 0xffc94a, 0, 0.42, 0, { sx: 0.21, sy: 0.52, sz: 0.21, kind: 'glow' });
    L.p(GEO.cone(5), 0xfff3c4, 0, 0.34, 0, { sx: 0.1, sy: 0.28, sz: 0.1, kind: 'glow' });
    for (const s of [-1, 1]) {
      L.p(GEO.cyl(9), 0x8a5a3c, s * 1.5, 0.22, 0.3, { sx: 0.22, sy: 1.3, sz: 0.22, rx: Math.PI / 2, tint: footTint(0.82, 1.04) });
      for (const e of [-1, 1]) {
        L.p(GEO.cyl(9), 0xd9b98a, s * 1.5, 0.22, 0.3 + e * 0.652, { sx: 0.19, sy: 0.012, sz: 0.19, rx: Math.PI / 2 });
        L.p(GEO.cyl(9), 0xb98e62, s * 1.5, 0.22, 0.3 + e * 0.658, { sx: 0.09, sy: 0.012, sz: 0.09, rx: Math.PI / 2 });
      }
      L.p(GEO.cone(5), 0x6b4a36, s * 1.5 + 0.12, 0.42, 0.55, { sx: 0.05, sy: 0.14, sz: 0.05, rz: -0.6 });
      L.box(s * 1.5, 0.3, 0.25, 0.65, 0, 0.44, { top: true, sound: 'wood' });
    }
    // the tent: its ridge runs away from the fire
    const red = 0xe0604f, zt = -1.9;
    L.p(GEO.cyl(3), red, 0, 0.6, zt, { sx: 1.25, sy: 1.9, sz: 0.82, rx: -Math.PI / 2, tint: footTint(0.84, 1.05) });
    L.p(GEO.cyl(3), 0xfff1dc, 0, 0.6, zt, { sx: 1.27, sy: 0.3, sz: 0.83, rx: -Math.PI / 2 });
    L.p(GEO.cyl(3), 0x3a2a30, 0, 0.5, zt + 0.955, { sx: 0.62, sy: 0.02, sz: 0.62, rx: -Math.PI / 2 });
    L.p(GEO.box(), shade(red, 0.82), 0.33, 0.52, zt + 0.97, { sx: 0.5, sy: 1.0, sz: 0.03, rz: 0.53 });
    L.p(GEO.cyl(5), 0x8a5a3c, 0, 0.92, zt + 0.98, { sx: 0.035, sy: 1.9, sz: 0.035 });
    for (const s of [-1, 1]) for (const e of [-0.7, 0.7]) {
      L.p(GEO.cone(4), 0x8a5a3c, s * 1.3, 0.08, zt + e, { sx: 0.04, sy: 0.2, sz: 0.04, rz: s * 0.5 });
      L.p(GEO.cyl(4), 0xf4efe6, s * 1.19, 0.11, zt + e, { sx: 0.012, sy: 0.26, sz: 0.012, rz: s * 1.1 });
    }
    L.skirt(0, zt, 1.2);
    L.box(0, -1.9, 0.85, 0.85, 0, 1.4, { sound: 'wood' });
  },

  // a sailing boat washed up on its side: a planked hull stove in amidships with its ribs showing, a snapped mast
  // with a rag of sail on its yard, planks, an oar and a barrel lying about it in the sand
  wreck(W, L) {
    const d = W.drng, k = L.k, head = 0.5;
    const M0 = new THREE.Matrix4().compose(new THREE.Vector3(L.x, L.y + 0.22 * k, L.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.66, L.ry + head, 0.05, 'YXZ')), new THREE.Vector3(k, k, k));
    // (it lies with its open side towards the pedestal: you look into it)
    shipwreck(W, M0, { L: 5.2 });
    // sand banked up along the low side, and what fell out
    for (let i = 0; i < 5; i++) L.p(GEO.dome(), W.T.grass, Math.cos(head) * (i - 2) * 0.9 + Math.sin(head) * 0.75, -0.03, -Math.sin(head) * (i - 2) * 0.9 + Math.cos(head) * 0.75, { sx: 0.7, sy: 0.22, sz: 0.5, ry: head, kind: 'ground' });
    for (let i = 0; i < 4; i++) { const a = d() * 6.283, r = 2.4 + d() * 0.8; L.p(GEO.box(), i % 2 ? 0x9a6b4f : 0xb07a50, Math.sin(a) * r, 0.03, Math.cos(a) * r, { sx: 0.2, sy: 0.05, sz: 0.9 + d() * 0.6, ry: d() * 3, kind: 'fx' }); }
    L.p(GEO.cyl(6), 0xd9c49a, -1.9, 0.05, 2.0, { sx: 0.035, sy: 1.9, sz: 0.035, rx: Math.PI / 2, ry: -0.6 });
    L.p(GEO.box(), 0xb07a50, -2.42, 0.05, 2.75, { sx: 0.2, sy: 0.03, sz: 0.5, ry: -0.6 });
    const [bx, bz] = L.at(1.75, -1.35);
    barrel(W, bx, L.y, bz, 0.3 * k, 0.72 * k);
    L.skirt(0, 0, 2.3);
    L.box(0, 0, 1.3, 1.3, 0, 1.2, { sound: 'wood' });
  },

  // carved tiki totems: each block a face with a heavy brow, round eyes, a nose and a mouth of teeth, painted bands
  // between them, the top one crowned with feathers
  totems(W, L) {
    const cols = [0xb07a50, 0xd08a58, 0x8a5a3c, 0xe7a46a], paint = [0xff6b6b, 0x4cc9f0, 0xffd23f, 0x3ddc97], d = W.drng;
    [[-1.2, 0, 3], [0, -0.8, 4], [1.2, 0, 2]].forEach(([lx, lz, n], ti) => {
      L.block(0x6b4a36, lx, 0.04, lz, 0.9, 0.1, 0.8, { b: 0.03 });
      for (let k = 0; k < n; k++) {
        const y = 0.45 + k * 0.85, c = cols[(k + n) % 4], wide = (k + ti) % 2;
        L.block(c, lx, y, lz, 0.7 + wide * 0.08, 0.78, 0.6, { b: 0.07, tint: footTint(0.86, 1.04) });
        L.p(GEO.box(), paint[(k + ti) % 4], lx, y - 0.4, lz, { sx: 0.74, sy: 0.07, sz: 0.64 });
        // brow, eyes, nose, mouth
        L.p(GEO.box(), shade(c, 0.72), lx, y + 0.24, lz + 0.31, { sx: 0.62, sy: 0.1, sz: 0.1, rz: (k % 2 ? 1 : -1) * 0.04 });
        for (const s of [-1, 1]) {
          L.p(GEO.cyl(8), 0xfff6e8, lx + s * 0.17, y + 0.11, lz + 0.305, { sx: 0.09, sy: 0.04, sz: 0.09, rx: Math.PI / 2 });
          L.p(GEO.cyl(6), 0x3a2a24, lx + s * 0.17, y + 0.1, lz + 0.33, { sx: 0.04, sy: 0.02, sz: 0.04, rx: Math.PI / 2 });
        }
        L.p(GEO.taper(4, 0.5), shade(c, 0.88), lx, y + 0.0, lz + 0.35, { sx: 0.1, sy: 0.26, sz: 0.1, ry: Math.PI / 4 });
        L.p(GEO.box(), 0x3a2a24, lx, y - 0.2, lz + 0.305, { sx: 0.42, sy: 0.13, sz: 0.04 });
        for (let j = 0; j < 4; j++) L.p(GEO.box(), 0xfff6e8, lx - 0.15 + j * 0.1, y - 0.17, lz + 0.325, { sx: 0.07, sy: 0.07, sz: 0.02 });
        if (wide) for (const s of [-1, 1]) L.p(GEO.box(), shade(c, 0.8), lx + s * 0.45, y + 0.05, lz, { sx: 0.12, sy: 0.4, sz: 0.3, rz: -s * 0.25 });
      }
      // feathers
      for (let f = 0; f < 7; f++) {
        const a = (f - 3) * 0.32;
        L.p(GEO.cone(4), f % 2 ? 0x4fbf5a : paint[(f + ti) % 4], lx + Math.sin(a) * 0.3, 0.15 + n * 0.85 + 0.3 * Math.cos(a), lz - 0.05, { sx: 0.1, sy: 0.62, sz: 0.03, rz: -a });
      }
      L.skirt(lx, lz, 0.5);
      L.box(lx, lz, 0.38, 0.33, 0, n * 0.85 + 0.1, { sound: 'wood' });
    });
  },

  // a moon lander: a foil-wrapped descent stage on four legs with footpads and a ladder, the engine bell under it,
  // a cabin on top with a window, a hatch, thrusters and a dish; a flag planted beside it
  lander(W, L) {
    const gold = 0xffd23f, foil = 0xe8b62c, white = 0xf4f4f8, grey = 0xa9a5ba, d = W.drng;
    L.p(GEO.cyl(8), gold, 0, 1.15, 0, { sx: 0.92, sy: 0.8, sz: 0.92, ry: Math.PI / 8, tint: footTint(0.86, 1.05) });
    // foil panels: every other side a shade darker, a rib between them
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.283;
      if (k % 2) L.p(GEO.box(), foil, Math.sin(a) * 0.852, 1.15, Math.cos(a) * 0.852, { sx: 0.6, sy: 0.7, sz: 0.02, ry: a });
      L.p(GEO.box(), grey, Math.sin(a + 0.393) * 0.925, 1.15, Math.cos(a + 0.393) * 0.925, { sx: 0.04, sy: 0.8, sz: 0.04, ry: a + 0.393 });
    }
    L.p(GEO.cyl(8), grey, 0, 1.57, 0, { sx: 0.96, sy: 0.06, sz: 0.96, ry: Math.PI / 8 });
    L.p(GEO.taper(10, 0.55), 0x5a5670, 0, 0.56, 0, { sx: 0.42, sy: 0.4, sz: 0.42 });
    // the cabin
    L.block(white, 0, 1.94, 0, 1.0, 0.68, 1.0, { b: 0.12, ry: Math.PI / 8, tint: footTint(0.9, 1.03) });
    L.p(GEO.box(), 0x2a3a5a, Math.sin(Math.PI / 8) * 0.51, 1.98, Math.cos(Math.PI / 8) * 0.51, { sx: 0.42, sy: 0.3, sz: 0.03, ry: Math.PI / 8 });
    L.p(GEO.box(), 0x9fe0ff, Math.sin(Math.PI / 8) * 0.515 + 0.06, 2.03, Math.cos(Math.PI / 8) * 0.515, { sx: 0.12, sy: 0.08, sz: 0.03, ry: Math.PI / 8 });
    L.p(GEO.cyl(8), grey, 0, 2.31, 0, { sx: 0.3, sy: 0.08, sz: 0.3 });
    for (const [lx, lz] of [[0.52, 0.52], [-0.52, 0.52], [0.52, -0.52], [-0.52, -0.52]]) {
      L.p(GEO.box(), grey, lx, 2.1, lz, { sx: 0.1, sy: 0.1, sz: 0.1 });
      L.p(GEO.cone(5), 0x5a5670, lx * 1.16, 2.1, lz * 1.16, { sx: 0.05, sy: 0.1, sz: 0.05, rz: lx > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    L.p(GEO.cyl(5), 0xcfcbe0, 0.3, 2.62, 0, { sx: 0.025, sy: 0.6, sz: 0.025 });
    L.p(GEO.dome(), 0xcfcbe0, 0.3, 2.92, 0, { sx: 0.27, sy: 0.1, sz: 0.27, rx: Math.PI - 0.3 });
    L.p(GEO.ico(), 0xff6b6b, -0.32, 2.4, -0.2, { sx: 0.05, sy: 0.05, sz: 0.05, kind: 'glow' });
    // legs: a strut down to a round pad, a brace to the body
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, lx = Math.sin(a), lz = Math.cos(a);
      L.p(GEO.cyl(5), grey, lx * 1.0, 0.6, lz * 1.0, { sx: 0.05, sy: 1.25, sz: 0.05, ry: a, rx: 0.5 });
      L.p(GEO.cyl(5), grey, lx * 0.92, 0.95, lz * 0.92, { sx: 0.03, sy: 0.7, sz: 0.03, ry: a, rx: 1.25 });
      L.p(GEO.cyl(10), foil, lx * 1.3, 0.04, lz * 1.3, { sx: 0.24, sy: 0.08, sz: 0.24 });
      L.p(GEO.cyl(8), grey, lx * 1.3, 0.1, lz * 1.3, { sx: 0.1, sy: 0.08, sz: 0.1 });
    }
    // the ladder down the leg that faces the pedestal
    const la = Math.PI / 4, lx = Math.sin(la), lz = Math.cos(la);
    for (const e of [-1, 1]) L.p(GEO.box(), white, lx * 1.06 + lz * e * 0.11, 0.72, lz * 1.06 - lx * e * 0.11, { sx: 0.025, sy: 1.25, sz: 0.025, ry: la, rx: 0.5 });
    for (let k = 0; k < 5; k++) L.p(GEO.box(), white, lx * (0.78 + k * 0.13), 1.2 - k * 0.24, lz * (0.78 + k * 0.13), { sx: 0.24, sy: 0.025, sz: 0.025, ry: la });
    L.box(0, 0, 0.9, 0.9, 0.7, 2.25, { sound: 'stone' });
    // the flag, held out on a rod, and bootprints from the ladder to it
    L.p(GEO.cyl(5), white, 1.7, 0.9, 1.2, { sx: 0.025, sy: 1.8, sz: 0.025 });
    L.p(GEO.cyl(5), white, 2.05, 1.78, 1.2, { sx: 0.014, sy: 0.72, sz: 0.014, rz: Math.PI / 2 });
    for (let k = 0; k < 3; k++) L.p(GEO.box(), k === 1 ? 0xff8080 : 0xff6b6b, 1.83 + k * 0.23, 1.55, 1.2 + (k === 1 ? 0.025 : 0), { sx: 0.24, sy: 0.45, sz: 0.02, ry: k === 1 ? 0 : (k ? -0.2 : 0.2) });
    L.p(GEO.box(), 0xffffff, 1.9, 1.63, 1.215, { sx: 0.2, sy: 0.16, sz: 0.02 });
    for (let k = 0; k < 5; k++) L.p(GEO.cyl(6), W.T.dirt, 1.0 + k * 0.16, 0.011, 1.05 + k * 0.03 + (k % 2) * 0.2, { sx: 0.08, sy: 0.02, sz: 0.14, ry: 1.3, kind: 'fx' });
    for (let k = 0; k < 3; k++) { const a = d() * 6.283; L.p(GEO.rock(), W.T.rock, 1.7 + Math.sin(a) * 0.2, 0.05, 1.2 + Math.cos(a) * 0.2, { sx: 0.12, sy: 0.08, sz: 0.1, ry: a }); }
  },

  // a radio dish turned to the sky on a braced mount, its feed on three struts with a blinking tip, a cabinet with
  // lights at its foot and a cable to it
  dish(W, L) {
    const grey = 0xa9a5ba, dark = 0x8f8aa3, white = 0xf4f4f8;
    L.block(dark, 0, 0.15, 0, 1.25, 0.3, 1.25, { b: 0.05, tint: footTint(0.86, 1.03) });
    for (const [lx, lz] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) L.p(GEO.cyl(6), grey, lx, 0.32, lz, { sx: 0.06, sy: 0.05, sz: 0.06 });
    L.p(GEO.taper(8, 0.7), grey, 0, 0.75, 0, { sx: 0.27, sy: 0.9, sz: 0.27, tint: footTint(0.86, 1.03) });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; L.p(GEO.box(), dark, Math.sin(a) * 0.36, 0.62, Math.cos(a) * 0.36, { sx: 0.05, sy: 0.75, sz: 0.05, ry: a, rx: -0.55 }); }
    L.p(GEO.cyl(8), dark, 0, 1.28, 0, { sx: 0.2, sy: 0.3, sz: 0.2, rz: Math.PI / 2 });
    // the dish: a bowl with a paler inside, tipped back
    const tilt = Math.PI + 0.6;
    L.p(GEO.dome(), white, 0, 1.6, 0, { sx: 1.5, sy: 0.5, sz: 1.5, rx: tilt, tint: footTint(0.9, 1.04) });
    L.p(GEO.dome(), 0xd9dce6, 0, 1.62, 0.012, { sx: 1.44, sy: 0.46, sz: 1.44, rx: tilt });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 6.283 + 0.5, ex = Math.cos(a) * 0.9, ey = Math.sin(a) * 0.9;
      L.p(GEO.cyl(4), 0xcfcbe0, ex * 0.5, 1.6 + ey * 0.5 * Math.cos(0.6) + 0.45, 0.42 - ey * 0.5 * Math.sin(0.6), { sx: 0.02, sy: 1.25, sz: 0.02, rx: -0.6 - ey * 0.4, rz: ex * 0.42 });
    }
    L.p(GEO.cyl(6), dark, 0, 2.38, 0.6, { sx: 0.09, sy: 0.16, sz: 0.09, rx: -0.6 });
    L.p(GEO.ico(), 0xff6b6b, 0, 2.47, 0.67, { sx: 0.1, sy: 0.1, sz: 0.1, kind: 'glow' });
    // the cabinet
    L.block(white, 1.25, 0.35, 0.6, 0.6, 0.7, 0.45, { b: 0.05, tint: footTint(0.88, 1.03) });
    for (let k = 0; k < 3; k++) L.p(GEO.ico(), [0x3ddc97, 0xffd23f, 0xff6b6b][k], 1.1 + k * 0.15, 0.52, 0.83, { sx: 0.035, sy: 0.035, sz: 0.02, kind: 'glow' });
    L.p(GEO.box(), 0x2a3a5a, 1.25, 0.28, 0.83, { sx: 0.4, sy: 0.22, sz: 0.02 });
    L.p(GEO.cyl(5), 0x3a3850, 0.75, 0.03, 0.4, { sx: 0.03, sy: 0.8, sz: 0.03, rz: Math.PI / 2, ry: -0.35 });
    L.box(0, 0, 0.6, 0.6, 0, 1.4, { sound: 'stone' });
  },

  // an iron lightning rod on a plinth of dressed stones: a tapering mast with discs up it, braced by three stays, a
  // coil at its foot, a cable run to a stake in the ground, its tip glowing with a crown of sparks; scorched ground
  rod(W, L) {
    const st = 0x77728f, dark = 0x5c5878, iron = 0x4a4660, moss = 0x6fa58a, d = W.drng;
    for (const [lx, lz] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) L.block((lx * lz > 0) ? st : shade(st, 0.92), lx, 0.2, lz, 0.72, 0.4, 0.72, { b: 0.05, tint: footTint(0.84, 1.02) });
    L.block(dark, 0, 0.55, 0, 1.3, 0.3, 1.3, { b: 0.05, tint: capTint(moss, 0.7, 0.95) });
    L.p(GEO.cyl(12), 0x4a4350, 0, 0.012, 0, { sx: 1.7, sy: 0.02, sz: 1.5, kind: 'fx' });
    for (let k = 0; k < 4; k++) { const a = d() * 6.283; L.block(moss, Math.sin(a) * 0.66, 0.2 + d() * 0.3, Math.cos(a) * 0.66, 0.22, 0.3, 0.04, { b: 0.015, ry: a }); }
    L.p(GEO.taper(8, 0.45), iron, 0, 3.7, 0, { sx: 0.13, sy: 6.0, sz: 0.13, tint: footTint(0.8, 1.15) });
    for (const [h, r] of [[1.2, 0.34], [2.0, 0.3], [3.6, 0.26], [5.2, 0.2]]) {
      L.p(GEO.cyl(10), dark, 0, h, 0, { sx: r, sy: 0.1, sz: r });
      L.p(GEO.cyl(10), 0x9fb4ff, 0, h + 0.07, 0, { sx: r * 0.7, sy: 0.05, sz: r * 0.7 });
    }
    // the coil, the stays, the cable
    for (let k = 0; k < 4; k++) L.p(GEO.cyl(10), 0xc98a5e, 0, 0.82 + k * 0.08, 0, { sx: 0.2, sy: 0.05, sz: 0.2 });
    for (let k = 0; k < 3; k++) L.p(GEO.box(), iron, Math.sin(k * 2.1) * 0.8, 1.3, Math.cos(k * 2.1) * 0.8, { sx: 0.05, sy: 2.4, sz: 0.05, rx: Math.cos(k * 2.1) * 0.35, rz: -Math.sin(k * 2.1) * 0.35 });
    L.p(GEO.cyl(5), 0xc98a5e, 1.05, 0.5, 0.5, { sx: 0.03, sy: 1.3, sz: 0.03, rz: -1.05, ry: -0.44 });
    L.p(GEO.cone(4), iron, 1.62, 0.16, 0.77, { sx: 0.06, sy: 0.34, sz: 0.06 });
    L.p(GEO.octa(), 0x9fe8ff, 0, 6.9, 0, { sx: 0.22, sy: 0.5, sz: 0.22, kind: 'glow' });
    for (let k = 0; k < 5; k++) { const a = k * 1.257; L.p(GEO.octa(), 0xdff6ff, Math.sin(a) * 0.3, 6.95, Math.cos(a) * 0.3, { sx: 0.05, sy: 0.22, sz: 0.05, rx: Math.cos(a) * 0.9, rz: -Math.sin(a) * 0.9, kind: 'glow' }); }
    L.skirt(0, 0, 1.0);
    L.box(0, 0, 0.7, 0.7, 0, 0.7, { top: true, sound: 'stone' });
    L.box(0, 0, 0.15, 0.15, 0.7, 7, { sound: 'stone' });
  },
};
