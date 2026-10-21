// Island moods: the five islands of a world share its look but each has a character of its own — a colour
// shift (blossom, autumn, golden…), more or fewer trees and rocks, and one landmark (a stone circle, giant
// mushrooms, an ancient oak, a wreck…). A world's islands get its moods in campaign order, so no two match.
// The layout calls W.landmark() before its trees and rocks, so they grow around the landmark.
import * as THREE from 'three';
import { GEO } from './world-kit.js';

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
    W, x, y, z, ry, at,
    p(geo, color, lx, ly, lz, { sx = 1, sy = 1, sz = 1, rx = 0, ry: r2 = 0, rz = 0, kind = 'solid' } = {}) {
      const [wx, wz] = at(lx, lz);
      Q.setFromEuler(E.set(rx, ry + r2, rz, 'YXZ'));
      W.B.add(geo, color, M.compose(P.set(wx, y + ly * k, wz), Q, S.set(sx * k, sy * k, sz * k)), kind);
    },
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
  // a stone well with a little roof and a bucket
  well(W, L, o) {
    const st = o.stone ?? 0xcfc8b8;
    L.p(GEO.cyl(12), st, 0, 0.4, 0, { sx: 0.95, sy: 0.8, sz: 0.95 });
    L.p(GEO.cyl(12), 0xb9b0a0, 0, 0.82, 0, { sx: 1.02, sy: 0.08, sz: 1.02 });
    L.p(GEO.cyl(12), 0x3a6fa8, 0, 0.7, 0, { sx: 0.72, sy: 0.04, sz: 0.72, kind: 'fx' });
    for (const s of [-1, 1]) L.p(GEO.box(), W.T.trunk, s * 0.85, 1.1, 0, { sx: 0.14, sy: 1.6, sz: 0.14 });
    L.p(GEO.cyl(8), W.T.trunk, 0, 1.55, 0, { sx: 0.07, sy: 1.8, sz: 0.07, rz: Math.PI / 2 });
    L.p(GEO.cone(4), 0xe0604f, 0, 2.25, 0, { sx: 1.45, sy: 0.8, sz: 1.2, ry: Math.PI / 4 });
    L.p(GEO.cyl(8), 0x8a5a3c, 0.2, 1.05, 0, { sx: 0.16, sy: 0.22, sz: 0.16 });
    L.box(0, 0, 1, 1, 0, 0.9, { sound: 'stone' });
  },

  // a ring of standing stones, open towards the pedestal, with a trilithon at the back and an altar
  stones(W, L, o) {
    const st = stoneOf(W, o), dark = new THREE.Color(st).multiplyScalar(0.85).getHex();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (k === 0) continue; // the gap faces the pedestal (+z)
      const lx = Math.sin(a) * 2.6, lz = Math.cos(a) * 2.6;
      if (k === 4) continue; // the trilithon stands there
      const h = 1.5 + W.rng() * 0.8;
      L.p(GEO.box(), k % 2 ? st : dark, lx, h / 2, lz, { sx: 0.7, sy: h, sz: 0.45, ry: a, rz: (W.rng() - 0.5) * 0.12 });
      if (o.glow) L.p(GEO.box(), o.glow, lx + Math.sin(a) * -0.24, h * 0.55, lz + Math.cos(a) * -0.24, { sx: 0.12, sy: h * 0.4, sz: 0.03, ry: a, kind: 'glow' });
      L.box(lx, lz, 0.4, 0.4, 0, h, { sound: 'stone' });
    }
    for (const s of [-1, 1]) {
      L.p(GEO.box(), st, s * 0.75, 1.3, -2.6, { sx: 0.6, sy: 2.6, sz: 0.5 });
      L.box(s * 0.75, -2.6, 0.32, 0.3, 0, 2.6, { sound: 'stone' });
    }
    L.p(GEO.box(), dark, 0, 2.8, -2.6, { sx: 2.4, sy: 0.4, sz: 0.6 });
    L.p(GEO.box(), dark, 0, 0.22, 0, { sx: 1.3, sy: 0.44, sz: 0.8 });
    if (o.glow) L.p(GEO.ico(), o.glow, 0, 0.62, 0, { sx: 0.2, sy: 0.2, sz: 0.2, kind: 'glow' });
    L.box(0, 0, 0.6, 0.6, 0, 0.44, { top: true, sound: 'stone' });
  },

  // giant toadstools of rising heights: hop from cap to cap
  mushrooms(W, L, o) {
    const caps = o.glow ? [0x6ee7ff, 0xff9ee8, 0xb693f5] : [0xe8413b, 0xff6b4a, 0xd9443b];
    const list = [[0.4, -0.2, 2.5, 1.3], [1.6, 0.9, 1.7, 0.95], [-1.4, 1.0, 0.9, 0.75], [-0.9, -1.4, 1.5, 0.8], [1.3, -1.5, 0.5, 0.5]];
    for (const [lx, lz, h, cr] of list) {
      L.p(GEO.cyl(9), 0xf5ecd8, lx, h / 2, lz, { sx: cr * 0.32, sy: h, sz: cr * 0.32 });
      const c = pick(W, caps);
      L.p(GEO.dome(), c, lx, h - 0.05, lz, { sx: cr, sy: cr * 0.6, sz: cr, kind: o.glow ? 'glow' : 'solid' });
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + W.rng(), rr = cr * (0.35 + W.rng() * 0.35);
        L.p(GEO.ico(), 0xffffff, lx + Math.cos(a) * rr, h - 0.05 + cr * 0.6 * Math.sqrt(1 - (rr / cr) ** 2), lz + Math.sin(a) * rr, { sx: cr * 0.12, sy: cr * 0.06, sz: cr * 0.12 });
      }
      L.box(lx, lz, cr * 0.3, cr * 0.3, 0, h);
      L.box(lx, lz, cr * 0.7, cr * 0.7, h, h + cr * 0.45, { top: true, sound: 'grass' });
    }
  },

  // an ancient tree with roots and a huge crown (bare: winter branches; fruit from the mood)
  oak(W, L, o) {
    const T = W.T, s = 1.35;
    L.p(GEO.cyl(9), T.trunk, 0, 1.9 * s, 0, { sx: 0.55 * s, sy: 3.8 * s, sz: 0.55 * s });
    for (let k = 0; k < 5; k++) {
      const a = k * 1.256 + W.rng() * 0.4;
      L.p(GEO.cone(6), T.trunk, Math.sin(a) * 0.55 * s, 0.35, Math.cos(a) * 0.55 * s, { sx: 0.3 * s, sy: 1.0, sz: 0.3 * s, rx: Math.cos(a) * 0.7, rz: -Math.sin(a) * 0.7 });
    }
    // branches
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + 0.4;
      L.p(GEO.cyl(6), T.trunk, Math.sin(a) * 0.9 * s, 3.9 * s, Math.cos(a) * 0.9 * s, { sx: 0.16 * s, sy: 2.0 * s, sz: 0.16 * s, rx: Math.cos(a) * 0.8, rz: -Math.sin(a) * 0.8 });
    }
    if (o.bare) {
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + 0.4;
        L.p(GEO.dome(), 0xffffff, Math.sin(a) * 1.5 * s, 4.55 * s, Math.cos(a) * 1.5 * s, { sx: 0.3 * s, sy: 0.12, sz: 0.3 * s });
      }
    } else {
      const leaf = () => pick(W, T.leaves);
      const kind = o.glowLeaves ? 'glow' : 'solid';
      L.p(GEO.blob(), leaf(), 0, 5.4 * s, 0, { sx: 2.4 * s, sy: 1.7 * s, sz: 2.4 * s, ry: W.rng() * 3, kind });
      for (let k = 0; k < 5; k++) {
        const a = k * 1.256 + W.rng() * 0.5;
        const c = leaf();
        L.p(GEO.blob(), c, Math.sin(a) * 1.9 * s, (4.4 + W.rng() * 0.8) * s, Math.cos(a) * 1.9 * s, { sx: 1.4 * s, sy: 1.1 * s, sz: 1.4 * s, ry: W.rng() * 3, kind });
        if (W.mood.fruit) for (let f = 0; f < 3; f++) L.p(GEO.ico(), W.mood.fruit, Math.sin(a + f) * 2.6 * s, (3.9 + W.rng()) * s, Math.cos(a + f) * 2.6 * s, { sx: 0.16, sy: 0.16, sz: 0.16 });
      }
    }
    L.box(0, 0, 0.6 * s, 0.6 * s, 0, 4.5 * s, { sound: 'wood' });
  },

  // an old colonnade on a plinth: broken columns, one beam still standing, one column fallen
  ruin(W, L, o) {
    const st = o.stone ?? 0xe8e2d4, dark = new THREE.Color(st).multiplyScalar(0.86).getHex();
    L.p(GEO.box(), dark, 0, 0.15, 0, { sx: 4.4, sy: 0.3, sz: 3.2 });
    L.box(0, 0, 2.2, 1.6, 0, 0.3, { top: true, sound: 'stone' });
    const cols = [[-1.6, -1.1, 2.7], [1.6, -1.1, 2.7], [-1.6, 1.1, 1.3], [1.6, 1.1, 0.6], [0, -1.1, 2.7]];
    for (const [lx, lz, h] of cols) {
      L.p(GEO.cyl(10), st, lx, 0.3 + h / 2, lz, { sx: 0.32, sy: h, sz: 0.32 });
      L.p(GEO.box(), dark, lx, 0.38, lz, { sx: 0.8, sy: 0.16, sz: 0.8 });
      if (h > 2) L.p(GEO.box(), dark, lx, 0.3 + h + 0.08, lz, { sx: 0.8, sy: 0.16, sz: 0.8 });
      L.box(lx, lz, 0.34, 0.34, 0.3, 0.3 + h, { top: h < 2, sound: 'stone' });
    }
    L.p(GEO.box(), st, 0, 3.3, -1.1, { sx: 4.1, sy: 0.4, sz: 0.7 });
    if (o.glow) L.p(GEO.box(), o.glow, 0, 3.3, -0.74, { sx: 2.4, sy: 0.08, sz: 0.02, kind: 'glow' });
    L.p(GEO.cyl(10), st, 0.3, 0.6, 1.9, { sx: 0.3, sy: 2.3, sz: 0.3, rz: Math.PI / 2, ry: 0.3 });
    L.box(0.3, 1.9, 1.1, 0.35, 0, 0.9, { top: true, sound: 'stone' });
  },

  // a tall glowing crystal with smaller ones around it
  crystal(W, L, o) {
    const c = o.glow ?? pick(W, W.T.leaves);
    L.p(GEO.octa(), c, 0, 2.8, 0, { sx: 0.8, sy: 3.4, sz: 0.8, ry: W.rng() * 3, kind: 'glow' });
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + W.rng() * 0.4, d = 1 + W.rng() * 0.6, h = 0.6 + W.rng() * 1.2;
      L.p(GEO.octa(), k % 2 ? c : 0xffffff, Math.sin(a) * d, h * 0.6, Math.cos(a) * d, { sx: 0.3, sy: h, sz: 0.3, rx: Math.cos(a) * 0.35, rz: -Math.sin(a) * 0.35, kind: 'glow' });
    }
    for (let k = 0; k < 4; k++) L.p(GEO.rock(), stoneOf(W, {}), Math.sin(k * 1.6) * 0.9, 0.15, Math.cos(k * 1.6) * 0.9, { sx: 0.5, sy: 0.35, sz: 0.45, ry: k });
    L.box(0, 0, 0.7, 0.7, 0, 6, { sound: 'crystal' });
  },

  // a snow-block igloo with its tunnel facing the pedestal
  igloo(W, L) {
    L.p(GEO.dome(), 0xfafcff, 0, 0, 0, { sx: 1.7, sy: 1.5, sz: 1.7 });
    for (const [h, r] of [[0.45, 1.66], [0.9, 1.45], [1.25, 1.0]]) L.p(GEO.cyl(16), 0xdfe8f6, 0, h, 0, { sx: r, sy: 0.04, sz: r, kind: 'fx' });
    L.p(GEO.box(), 0xfafcff, 0, 0.5, 1.75, { sx: 1.1, sy: 1.0, sz: 1.0 });
    L.p(GEO.box(), 0x3a4a6a, 0, 0.42, 2.26, { sx: 0.6, sy: 0.75, sz: 0.04 });
    L.box(0, 0, 1.3, 1.3, 0, 1.4, { sound: 'snow' });
    L.box(0, 1.75, 0.55, 0.5, 0, 1.0, { sound: 'snow' });
  },

  // a pumpkin patch with a scarecrow
  pumpkins(W, L) {
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, d = 0.9 + (k % 3) * 0.6, s = 0.3 + W.rng() * 0.25;
      const lx = Math.sin(a) * d, lz = Math.cos(a) * d + 0.3;
      L.p(GEO.blob(), k % 4 ? 0xf28c28 : 0xe8a33b, lx, s * 0.6, lz, { sx: s * 1.2, sy: s * 0.85, sz: s * 1.2 });
      L.p(GEO.cyl(5), 0x5a7a3a, lx, s * 1.3, lz, { sx: 0.05, sy: 0.25, sz: 0.05 });
      L.p(GEO.blob(), 0x5fae4f, lx + s, 0.08, lz, { sx: 0.3, sy: 0.08, sz: 0.25 });
    }
    L.p(GEO.cyl(6), W.T.trunk, 0, 1.0, -1.8, { sx: 0.08, sy: 2.0, sz: 0.08 });
    L.p(GEO.cyl(6), W.T.trunk, 0, 1.45, -1.8, { sx: 0.06, sy: 1.6, sz: 0.06, rz: Math.PI / 2 });
    L.p(GEO.box(), 0x4a7ab8, 0, 1.3, -1.8, { sx: 0.6, sy: 0.6, sz: 0.3 });
    L.p(GEO.blob(), 0xf2cf6b, 0, 1.95, -1.8, { sx: 0.28, sy: 0.3, sz: 0.28 });
    L.p(GEO.cone(8), 0x6b4a36, 0, 2.3, -1.8, { sx: 0.3, sy: 0.4, sz: 0.3 });
    L.p(GEO.cyl(10), 0x6b4a36, 0, 2.12, -1.8, { sx: 0.5, sy: 0.04, sz: 0.5 });
    L.box(0, -1.8, 0.3, 0.3, 0, 2.4, { sound: 'wood' });
  },

  // a campfire in a ring of stones, log seats and a tent
  campfire(W, L) {
    for (let k = 0; k < 9; k++) L.p(GEO.rock(), 0x8f8aa3, Math.sin(k * 0.7) * 0.65, 0.1, Math.cos(k * 0.7) * 0.65, { sx: 0.2, sy: 0.15, sz: 0.18, ry: k });
    for (let k = 0; k < 3; k++) L.p(GEO.cyl(7), 0x6b4a36, 0, 0.12, 0, { sx: 0.09, sy: 0.9, sz: 0.09, rz: Math.PI / 2, ry: k * 1.05 });
    L.p(GEO.cone(6), 0xff8a3a, 0, 0.45, 0, { sx: 0.35, sy: 0.7, sz: 0.35, kind: 'glow' });
    L.p(GEO.cone(6), 0xffe066, 0, 0.38, 0, { sx: 0.2, sy: 0.45, sz: 0.2, kind: 'glow' });
    for (const s of [-1, 1]) {
      L.p(GEO.cyl(8), 0x8a5a3c, s * 1.5, 0.22, 0.3, { sx: 0.22, sy: 1.3, sz: 0.22, rx: Math.PI / 2 });
      L.box(s * 1.5, 0.3, 0.25, 0.65, 0, 0.44, { top: true, sound: 'wood' });
    }
    L.p(GEO.cone(4), 0xe0604f, 0, 0.8, -1.9, { sx: 1.2, sy: 1.6, sz: 1.2, ry: Math.PI / 4 });
    L.p(GEO.box(), 0x6b4a36, 0, 0.4, -1.08, { sx: 0.5, sy: 0.75, sz: 0.04, rx: -0.5 });
    L.box(0, -1.9, 0.85, 0.85, 0, 1.4, { sound: 'wood' });
  },

  // a little boat washed up on its side, half sunk in the sand: hull, ribs, a broken mast and a torn sail
  wreck(W, L) {
    const wood = 0x9a6b4f, dark = 0x6b4a36, tilt = 0.45, head = 0.5;
    // the hull: a long lump sunk in the sand, a plank stripe and the ribs of a stove-in side
    L.p(GEO.blob(), wood, 0, 0.25, 0, { sx: 1.15, sy: 0.85, sz: 2.6, rz: tilt, ry: head });
    L.p(GEO.blob(), 0xb07a50, 0.08, 0.32, 0, { sx: 1.18, sy: 0.12, sz: 2.55, rz: tilt, ry: head });
    for (const t of [-1.2, -0.6, 0, 0.6]) {
      const w = Math.sqrt(1 - (t / 2.6) ** 2);
      L.p(GEO.box(), dark, -0.55 + Math.sin(head) * t, 0.95 * w, Math.cos(head) * t, { sx: 0.1, sy: 0.9 * w, sz: 0.12, rz: -0.35, ry: head });
    }
    L.p(GEO.cyl(7), 0xb07a50, -0.25, 1.3, 0.2, { sx: 0.12, sy: 1.3, sz: 0.12, rz: tilt + 0.15 });
    L.p(GEO.cyl(7), 0xb07a50, -1.9, 0.12, 1.2, { sx: 0.11, sy: 2.4, sz: 0.11, rz: Math.PI / 2, ry: -0.6 });
    L.p(GEO.box(), 0xf4efe6, -2.0, 0.08, 1.9, { sx: 1.6, sy: 0.04, sz: 1.1, ry: -0.6, rz: 0.06, kind: 'fx' });
    L.p(GEO.cyl(8), dark, 1.6, 0.25, -1.2, { sx: 0.3, sy: 0.5, sz: 0.3 });
    L.p(GEO.cyl(8), 0x5a4a3c, 1.6, 0.25, -1.2, { sx: 0.32, sy: 0.06, sz: 0.32 });
    L.box(0, 0, 1.3, 1.3, 0, 1.2, { sound: 'wood' });
  },

  // carved tiki totems
  totems(W, L) {
    const cols = [0xb07a50, 0xd08a58, 0x8a5a3c, 0xe7a46a];
    [[-1.2, 0, 3], [0, -0.8, 4], [1.2, 0, 2]].forEach(([lx, lz, n]) => {
      for (let k = 0; k < n; k++) {
        const y = 0.45 + k * 0.85;
        L.p(GEO.box(), cols[(k + n) % 4], lx, y, lz, { sx: 0.7, sy: 0.8, sz: 0.6 });
        for (const s of [-1, 1]) L.p(GEO.box(), 0xfff6e8, lx + s * 0.17, y + 0.12, lz + 0.31, { sx: 0.16, sy: 0.12, sz: 0.04 });
        L.p(GEO.box(), 0x3a2a24, lx, y - 0.18, lz + 0.31, { sx: 0.36, sy: 0.1, sz: 0.04 });
      }
      for (let f = 0; f < 5; f++) L.p(GEO.blob(), 0x4fbf5a, lx, 0.2 + n * 0.85 + 0.1, lz, { sx: 0.7, sy: 0.08, sz: 0.2, ry: f * 0.63, rz: 0.3 });
      L.box(lx, lz, 0.38, 0.33, 0, n * 0.85 + 0.1, { sound: 'wood' });
    });
  },

  // a moon lander on four legs, with a flag
  lander(W, L) {
    L.p(GEO.cyl(8), 0xffd23f, 0, 1.15, 0, { sx: 0.9, sy: 0.8, sz: 0.9 });
    L.p(GEO.box(), 0xf4f4f8, 0, 1.9, 0, { sx: 1.0, sy: 0.7, sz: 1.0, ry: Math.PI / 8 });
    L.p(GEO.box(), 0x2a3a5a, 0, 1.95, 0.51, { sx: 0.4, sy: 0.3, sz: 0.03, ry: Math.PI / 8 });
    L.p(GEO.cyl(5), 0xcfcbe0, 0.3, 2.6, 0, { sx: 0.03, sy: 0.7, sz: 0.03 });
    L.p(GEO.dome(), 0xcfcbe0, 0.3, 2.9, 0, { sx: 0.25, sy: 0.1, sz: 0.25, rx: Math.PI });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, lx = Math.sin(a), lz = Math.cos(a);
      L.p(GEO.cyl(5), 0xa9a5ba, lx * 0.95, 0.55, lz * 0.95, { sx: 0.05, sy: 1.2, sz: 0.05, rx: lz * 0.5, rz: -lx * 0.5 });
      L.p(GEO.cyl(8), 0xa9a5ba, lx * 1.25, 0.04, lz * 1.25, { sx: 0.22, sy: 0.08, sz: 0.22 });
    }
    L.box(0, 0, 0.9, 0.9, 0.7, 2.25, { sound: 'stone' });
    L.p(GEO.cyl(5), 0xf4f4f8, 1.7, 0.9, 1.2, { sx: 0.03, sy: 1.8, sz: 0.03 });
    L.p(GEO.box(), 0xff6b6b, 2.05, 1.55, 1.2, { sx: 0.7, sy: 0.45, sz: 0.02 });
    L.p(GEO.box(), 0xffffff, 1.93, 1.62, 1.21, { sx: 0.24, sy: 0.18, sz: 0.02 });
  },

  // a radio dish turned to the sky, its tip blinking
  dish(W, L) {
    L.p(GEO.cyl(8), 0xa9a5ba, 0, 0.6, 0, { sx: 0.25, sy: 1.2, sz: 0.25 });
    L.p(GEO.box(), 0x8f8aa3, 0, 0.15, 0, { sx: 1.2, sy: 0.3, sz: 1.2 });
    L.p(GEO.dome(), 0xf4f4f8, 0, 1.6, 0, { sx: 1.5, sy: 0.5, sz: 1.5, rx: Math.PI + 0.6 });
    L.p(GEO.cyl(5), 0xcfcbe0, 0, 2.0, 0.35, { sx: 0.04, sy: 1.1, sz: 0.04, rx: -0.6 });
    L.p(GEO.ico(), 0xff6b6b, 0, 2.45, 0.68, { sx: 0.12, sy: 0.12, sz: 0.12, kind: 'glow' });
    L.box(0, 0, 0.6, 0.6, 0, 1.4, { sound: 'stone' });
  },

  // an iron lightning rod on a stone base, its tip glowing
  rod(W, L) {
    L.p(GEO.box(), 0x77728f, 0, 0.35, 0, { sx: 1.4, sy: 0.7, sz: 1.4 });
    L.p(GEO.box(), 0x6fa58a, 0, 0.72, 0, { sx: 1.45, sy: 0.06, sz: 1.45, kind: 'fx' });
    L.p(GEO.cyl(6), 0x4a4660, 0, 3.7, 0, { sx: 0.1, sy: 6.0, sz: 0.1 });
    for (const h of [2.0, 3.6, 5.2]) L.p(GEO.cyl(8), 0x5c5878, 0, h, 0, { sx: 0.3, sy: 0.12, sz: 0.3 });
    L.p(GEO.octa(), 0x9fe8ff, 0, 6.9, 0, { sx: 0.22, sy: 0.5, sz: 0.22, kind: 'glow' });
    for (let k = 0; k < 3; k++) L.p(GEO.box(), 0x4a4660, Math.sin(k * 2.1) * 0.8, 1.3, Math.cos(k * 2.1) * 0.8, { sx: 0.05, sy: 2.4, sz: 0.05, rx: Math.cos(k * 2.1) * 0.35, rz: -Math.sin(k * 2.1) * 0.35 });
    L.box(0, 0, 0.7, 0.7, 0, 0.7, { top: true, sound: 'stone' });
    L.box(0, 0, 0.15, 0.15, 0.7, 7, { sound: 'stone' });
  },
};
