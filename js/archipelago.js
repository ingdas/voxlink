// A world's archipelago: a small hub island in the middle and one island per figure, joined by bridges in the world's style.
// The islands lie scattered round the hub as if they had grown there (seeded, so a world always looks the same; GROWTH
// gives each world its shape), close in, so no walk is long. Each island is built with its way in (the path kept clear
// from its pedestal to the shore) running south, and turned by a quarter turn so that way faces its bridge: the
// bridge runs straight out of that shore for a few metres, then curves away to join the others, at the hub (whose
// bridges leave west, north and east; the portal stands on its south side) or at a round landing where bridges meet.
// Bridges are breeze lanes: you cross them fast. Rails line every open edge. Only one figure island is active (its
// puzzle loaded): the archipelago is shifted so that island sits at the origin, which is what the game expects (the
// island stays turned: `api.spin`), and `api` answers the player's queries across all islands and bridges in those
// shifted coordinates. Moving to another island just changes the shift.
import * as THREE from 'three';
import { PEDESTAL_TOP } from './world.js';
import { thrive } from './looks.js';
import { coastOf } from './sea.js';
import { Batch, GEO, projectInside } from './world-kit.js';
import { toon, LAYER_OVERLAY } from './render.js';
import { mergeFigure, mulberry32 } from './voxels.js';
import { expandLevel } from './levels.js';
import { idleHop } from './life.js';

const DECK = 0.22; // bridge deck height
const BOOST = 2.4; // walking speed on the bridges
const HW = 1.2; // half width of a bridge
const LEAD = 3; // how far a bridge runs straight out of a shore before it turns
const LANDING = 2.4; // radius of the round landings where bridges meet
const CLEAR = 1.4; // open water kept between a bridge's edge and any shore or other bridge
const LANE = 1.3; // half width of the way in across an island, from its pedestal (or the hub's portal) out to its bridge,
// which is a breeze lane like the bridges
const LEG = 45; // the longest walk along the bridges from one figure's island to the next's, if there's a choice

const SHAPE = 1; // how much an island keeps to its world's shape (against shorter walks)
const GROWS = 4; // goes at growing a world's layout (the one with the shortest walks is kept)

// each world's bridges: deck under-beam, plank (or slab) colours, rails, posts and the lamps on the posts at a
// crossing (`top`); `rails` are [height, thickness, width] (one thick rail makes a low wall), `railTop` a strip
// along the top rail, `edge` one along the deck's open edges, `cap` a cap on every post, `piers` stone piers under
// the deck instead of a piling under every post, `sound` the footsteps
export const STYLES = {
  meadow: { base: 0x8a5a3c, planks: [0xc08a5c, 0xb27b50], rail: 0xc08a5c, post: 0x6b4a36, top: 'flowers', sound: 'wood' },
  farm: { base: 0x9a6b4f, planks: [0xd9b27a, 0xc9a06a], rail: 0xf4efe6, post: 0xc0392b, top: 'hay', sound: 'wood' },
  frost: { base: 0x5aaee6, planks: [0xbfe8ff, 0x9ad8ff], rail: 0xdff4ff, post: 0x7cc4f0, cap: 0xffffff, top: 'ice', sound: 'ice' },
  frostwood: { base: 0x5c3f2e, planks: [0x8a6a52, 0x7a5a48], rail: 0x6b4a36, railTop: 0xf4f7ff, post: 0x6b4a36, round: true, cap: 0xffffff, edge: 0xf4f7ff, top: 'lantern', sound: 'wood' },
  reef: { base: 0xb08850, planks: [0xead48e, 0xdcc076], rail: 0xb8935a, rails: [[0.5, 0.05, 0.05], [0.88, 0.05, 0.05]], post: 0xc9b06a, round: true, top: 'torch', sound: 'wood' },
  cove: { base: 0x5a4a3c, planks: [0x8a7560, 0x7a6552], rail: 0xd9c49a, rails: [[0.5, 0.06, 0.06], [0.88, 0.06, 0.06]], post: 0x5c4a3c, round: true, postW: 0.2, top: 'lantern', sound: 'wood' },
  starfall: { base: 0x5a4a8a, planks: [0x9d8fd0, 0x8a7bc0], rail: 0x6ee7ff, railKind: 'glow', post: 0xb693f5, edge: 0x6ee7ff, edgeKind: 'glow', top: 'crystal', sound: 'crystal' },
  moon: { base: 0x4f4c60, planks: [0xa9a5ba, 0x9a96ad], rail: 0xcfcbe0, post: 0x6f6a85, edge: 0xffd23f, top: 'beacon', sound: 'stone' },
  cliffs: { base: 0xb9b0a0, planks: [0xeee8da, 0xe0d9c8], rail: 0xd8d2c4, rails: [[0.3, 0.6, 0.3]], post: 0xc9c2b2, postW: 0.32, piers: true, cap: 0xeee8da, top: 'flowers', sound: 'stone' },
  storm: { base: 0x5d5878, planks: [0x9a96b4, 0x8a86a4], rail: 0x77728f, railTop: 0x6fa58a, rails: [[0.3, 0.6, 0.3]], post: 0x77728f, postW: 0.32, piers: true, cap: 0x6fa58a, top: 'rune', sound: 'stone' },
};

// The way on: a tall column of light with a bobbing "?" (over the next figure's island, a world's portal, or the
// next world's portal on the Keeper's Isle). Set userData.top to the mark's height; dispose() frees it.
export function makeBeacon() {
  const beacon = new THREE.Group();
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
  beacon.userData = { beam, mark, beamMat, tex, top: 5 };
  beacon.visible = false;
  beacon.animate = (t, calm) => {
    if (!beacon.visible) return;
    mark.position.y = beacon.userData.top + (calm ? 0 : Math.sin(t * 2.2) * 0.35);
    beamMat.opacity = calm ? 0.3 : 0.28 + Math.sin(t * 1.6) * 0.08;
  };
  beacon.dispose = () => { beam.geometry.dispose(); beamMat.dispose(); mark.material.dispose(); tex.dispose(); };
  return beacon;
}

// a padlock badge (for the gates of closed bridges); the caller disposes it
export function lockTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 70, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e9dfcf'; g.beginPath(); g.arc(64, 62, 50, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1f3d'; g.lineWidth = 9; g.beginPath(); g.arc(64, 52, 16, Math.PI, 0); g.stroke();
  g.fillStyle = '#2a1f3d'; g.fillRect(42, 52, 44, 32);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// How each world's archipelago grows round its hub. Its islands gather along a shape: a ring of radius `ring` (0: a
// clump; [r0, r1]: a spiral, from r0 round to r1) round a point `at` metres from the hub's middle the way `heading`
// points (radians, 0 = north, positive = east), on the part of it within `arc` either side of that way; `stretch`
// draws it out along (> 1) that way. On a ring the islands go round it in play order, clockwise or (turn -1)
// anticlockwise. gap: open water between neighbouring islands [min, max] (metres); trail: how much each island keeps
// near the one before; loops: how many bridges may close a loop (where one takes the walks down)
const GROWTH = {
  meadow: { gap: [4, 7], heading: 0, trail: 0.4, at: 0, ring: 46, arc: Math.PI }, // petals all round the hub
  farm: { gap: [5, 9], heading: 0, trail: 0.3, at: 0, ring: 50, arc: 1.6 }, // fields fanned out behind the farmyard
  frost: { gap: [3, 5], heading: 0.7, trail: 0.2, at: 44, ring: 0 }, // floes packed together off to the north-east
  frostwood: { gap: [4, 7], heading: -1.3, trail: 0.6, at: 0, ring: 50, arc: 1.3, turn: -1 }, // a wood wrapped round the west
  reef: { gap: [5, 8], heading: 0.3, trail: 0.4, at: 46, ring: 46, arc: 2.5, loops: 1 }, // an atoll, the hub on its rim
  cove: { gap: [4, 7], heading: 1.2, trail: 0.5, at: 30, ring: 44, arc: 1.8, turn: -1 }, // a horseshoe bay off to the east
  starfall: { gap: [5, 8], heading: 0, trail: 0.5, at: 40, ring: 0, stretch: 1.6 }, // a tower of rocks reaching north
  moon: { gap: [7, 11], heading: 0, trail: 0.2, at: 0, ring: 0 }, // craters strewn all round
  cliffs: { gap: [4, 7], heading: 0.8, trail: 0.6, at: 0, ring: 0, stretch: 2.4 }, // a ridge running through the hub
  storm: { gap: [4, 7], heading: 0, trail: 0.4, at: 0, ring: [40, 72], arc: Math.PI }, // a spiral round the eye
};
// how far (x, z) is off a world's shape (metres); u: 0 for the first island, 1 for the last
function offShape(G, x, z, u) {
  const ux = Math.sin(G.heading), uz = -Math.cos(G.heading), dx = x - ux * G.at, dz = z - uz * G.at;
  const s = G.stretch ?? 1, along = (dx * ux + dz * uz) / s, across = dx * uz - dz * ux;
  const r = Math.hypot(along, across);
  if (!G.ring) return r;
  const ring = Array.isArray(G.ring) ? G.ring[0] + (G.ring[1] - G.ring[0]) * u : G.ring;
  // on the ring, within arc of its middle, in play order round it
  const a = Math.atan2(-across, along), arc = G.arc ?? Math.PI, over = Math.max(0, Math.abs(a) - arc);
  const want = (G.turn ?? 1) * arc * (2 * u - 1) * 0.85;
  return Math.abs(r - ring) + over * ring + 0.5 * Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want))) * ring;
}

// ---- polylines: [[x, z], ...] ----
const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const arcLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
// direction of travel at point i
const tangent = (pts, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; return unit(b[0] - a[0], b[1] - a[1]); };
// how far (x, z) is from a box [x0, z0, x1, z1] round a polyline (a quick lower bound for the distance to it)
const boxGap = (b, x, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));
function polyDist(pts, x, z) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], dx = pts[i][0] - ax, dz = pts[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}
// the same line with a point every `step` metres (both ends kept)
function resample(pts, step = 0.5) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    for (; s <= L; s += step) out.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]);
    carry = L - (s - step);
  }
  const a = out[out.length - 1], b = pts[pts.length - 1];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.05) out.push(b);
  return out;
}
// a line's points every 0.5 m, as resample() would give them, without building them all: n of them, at(j) the j-th
function evenly(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const L = cum[pts.length - 1], whole = Math.floor(L / 0.5);
  return {
    n: whole + 1 + (L - whole * 0.5 > 0.05 ? 1 : 0),
    at(j) {
      const s = Math.min(j * 0.5, L);
      let lo = 1, hi = pts.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
      const a = pts[lo - 1], b = pts[lo], d = cum[lo] - cum[lo - 1], t = d ? (s - cum[lo - 1]) / d : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
  };
}
// the part of a line between two distances along it
function along(pts, s0, s1) {
  const out = [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const at = d => (L ? [a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L] : a);
    if (!out.length && s + L >= s0) out.push(at(s0 - s));
    if (out.length) {
      if (s + L >= s1) { out.push(at(s1 - s)); return out; }
      out.push(b);
    }
    s += L;
  }
  if (!out.length) out.push(pts[pts.length - 1]); // (s0 at, or a hair past, the end)
  return out;
}
// fewer points, none of the dropped ones further than tol off the line (Douglas-Peucker)
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const todo = [[0, pts.length - 1]];
  while (todo.length) {
    const [i, j] = todo.pop();
    let far = -1, fd = tol;
    for (let k = i + 1; k < j; k++) { const d = polyDist([pts[i], pts[j]], pts[k][0], pts[k][1]); if (d > fd) { fd = d; far = k; } }
    if (far >= 0) { keep[far] = 1; todo.push([i, far], [far, j]); }
  }
  return pts.filter((p, k) => keep[k]);
}
// a smooth curve from a (leaving along the unit direction ta) to b (arriving along tb); k: how far it carries on
// along each before bending
// the curve's sharpest bend (1 / its tightest radius, looked at in 32 places)
function sharpest(a, ta, b, tb, k) {
  const p1x = a[0] + ta[0] * k, p1z = a[1] + ta[1] * k, p2x = b[0] - tb[0] * k, p2z = b[1] - tb[1] * k;
  let worst = 0;
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, u = 1 - t;
    const dx = 3 * (u * u * (p1x - a[0]) + 2 * u * t * (p2x - p1x) + t * t * (b[0] - p2x)), dz = 3 * (u * u * (p1z - a[1]) + 2 * u * t * (p2z - p1z) + t * t * (b[1] - p2z));
    const ddx = 6 * (u * (p2x - 2 * p1x + a[0]) + t * (b[0] - 2 * p2x + p1x)), ddz = 6 * (u * (p2z - 2 * p1z + a[1]) + t * (b[1] - 2 * p2z + p1z));
    const v = Math.hypot(dx, dz);
    if (v > 1e-6) worst = Math.max(worst, Math.abs(dx * ddz - dz * ddx) / (v * v * v));
  }
  return worst;
}
function curve(a, ta, b, tb, k) {
  const p1 = [a[0] + ta[0] * k, a[1] + ta[1] * k], p2 = [b[0] - tb[0] * k, b[1] - tb[1] * k], out = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push([w[0] * a[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * b[0], w[0] * a[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * b[1]]);
  }
  return out;
}

// Where a piece (the hub or an island; { p, spin } or { x, z, spin }) puts a point of its own ground: islands turn by
// quarter turns (spin, radians, as the group's rotation.y), so their colliders stay boxes
const cosS = k => Math.round(Math.cos(k.spin || 0)), sinS = k => Math.round(Math.sin(k.spin || 0));
const px = k => (k.p ? k.p.x : k.x), pz = k => (k.p ? k.p.z : k.z);
function toLocal(k, ax, az) { const c = cosS(k), s = sinS(k), dx = ax - px(k), dz = az - pz(k); return [dx * c - dz * s, dx * s + dz * c]; }
function toWorld(k, lx, lz) { const c = cosS(k), s = sinS(k); return [px(k) + lx * c + lz * s, pz(k) - lx * s + lz * c]; }
// the way an island's way in leads out of it (its local south, turned)
const outOf = spin => [Math.round(Math.sin(spin)), Math.round(Math.cos(spin))];
const SPINS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
// the hub's bridges leave from its west, north and east shores (its portal stands on the south side)
const PORTS = [[-1, 0], [0, -1], [1, 0]];

// Scatter the islands round the hub (setting each pt.p and pt.spin) and join them up. Returns the bridges { nodes,
// edges }, or null if this try didn't work out (the caller tries again; relax 1 accepts tighter bends and less open
// water, 2 anything that joins up). nodes: where you stand out of the portal (first), the hub's middle, the hub's end
// of each of its bridges, round landings and each island's end of its bridge (pt.node); edges: a bridge between two
// nodes, `pts` every 0.5 m from the end nearer the portal (`a`) to the other (`b`), `island` the island it leads to
// (if any); the walks across the hub from the portal to its bridges are edges too (`land`), never drawn.
function grow(parts, hubWorld, G, rng, relax, upright) {
  const clear = relax ? CLEAR / 2 : CLEAR, bend = relax ? 3.5 : 5;
  const reach = w => (w.reach ??= extent(w));
  const hub = { world: hubWorld, x: 0, z: 0, spin: 0, R: reach(hubWorld) };
  const pieces = [hub];
  const lanes = []; // where a bridge runs straight out of a shore: [x, z of the shore, the way out]
  const nodes = [], edges = [];
  // ---- the hub: where you arrive, its middle, and its bridges' ends ----
  const pzz = (hubWorld.portal?.z ?? 4) - 2.6;
  const start = { x: 0, z: pzz, hub: true, portal: true, dh: 0, edges: [] }, mid = { x: 0, z: 0, hub: true, dh: 0, edges: [] };
  nodes.push(start, mid);
  const ground = (a, b) => {
    const pts = resample([[a.x, a.z], [b.x, b.z]]), e = { a, b, pts, land: true, island: null, len: arcLen(pts), sd: pts, box: [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)] };
    a.edges.push(e); b.edges.push(e); edges.push(e);
  };
  ground(start, mid);
  const ports = PORTS.map(([dx, dz]) => {
    const sh = shore(hubWorld, dx, dz);
    const n = { x: dx * (sh - 0.8), z: dz * (sh - 0.8), hub: true, port: [dx, dz], dh: 0, edges: [] };
    nodes.push(n); ground(mid, n);
    lanes.push([dx * sh, dz * sh, dx, dz]);
    return { n, sh, d: [dx, dz] };
  });
  const bridges = () => edges.filter(e => !e.land);
  // open water at (x, z): how far to the nearest shore (but skip's)
  const water = (x, z, skip = null) => {
    let d = Infinity;
    for (const k of pieces) {
      if (k === skip) continue;
      const c = Math.hypot(x - k.x, z - k.z) - k.R - 1.5;
      d = Math.min(d, c > 3 ? c : k.world.walkSd(...toLocal(k, x, z)));
    }
    return d;
  };
  // the bridges' segments by grid cell (each in every cell within NEAR of it), for "is a bridge this close?"
  const CELL = 4, NEAR = 2 * HW + CLEAR, cells = new Map();
  const cellKey = (i, j) => i * 4096 + j;
  const index = () => {
    cells.clear();
    for (const e of edges) if (!e.land) for (let i = 1; i < e.sd.length; i++) {
      const [ax, az] = e.sd[i - 1], [bx, bz] = e.sd[i];
      for (let ci = Math.floor((Math.min(ax, bx) - NEAR) / CELL); ci <= Math.floor((Math.max(ax, bx) + NEAR) / CELL); ci++) {
        for (let cj = Math.floor((Math.min(az, bz) - NEAR) / CELL); cj <= Math.floor((Math.max(az, bz) + NEAR) / CELL); cj++) {
          const k = cellKey(ci, cj);
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(ax, az, bx, bz);
        }
      }
    }
  };
  // is any bridge closer than r (at most NEAR) to (x, z)?
  const bridgeNear = (x, z, r) => {
    const segs = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!segs) return false;
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i], az = segs[i + 1], dx = segs[i + 2] - ax, dz = segs[i + 3] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  };
  const link = (a, b, pts, island = null) => {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const e = { a, b, pts, island, len: arcLen(pts), box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
    e.sd = pts.filter((p, i) => i % 2 === 0 || i === pts.length - 1); // (a point a metre is plenty for distances)
    a.edges.push(e); b.edges.push(e); edges.push(e);
    index();
    return e;
  };
  const unlink = e => { edges.splice(edges.indexOf(e), 1); e.a.edges.splice(e.a.edges.indexOf(e), 1); e.b.edges.splice(e.b.edges.indexOf(e), 1); index(); };
  // a new landing j points along a bridge (which becomes two)
  const split = (e, j) => {
    const at = { x: e.pts[j][0], z: e.pts[j][1], landing: true, dh: e.a.dh + j / 2, edges: [] };
    nodes.push(at);
    unlink(e);
    link(e.a, at, e.pts.slice(0, j + 1));
    link(at, e.b, e.pts.slice(j), e.island);
    return at;
  };

  // is there room for an island of radius r at (x, z): clear of the other islands, of the straight runs out of every
  // shore, and of the bridges and landings so far
  const roomy = (r, x, z) => {
    for (const k of pieces) if (Math.hypot(x - k.x, z - k.z) < r + k.R + 0.5 + G.gap[0]) return false;
    for (let t = 0; t <= LEAD + 4; t++) for (const [lx, lz, dx, dz] of lanes) if (Math.hypot(lx + dx * t - x, lz + dz * t - z) < r + HW + clear) return false;
    for (const e of bridges()) if (boxGap(e.box, x, z) < r + 2 * HW + clear && polyDist(e.sd, x, z) < r + HW + clear) return false;
    for (const m of nodes) if (m.landing && Math.hypot(x - m.x, z - m.z) < r + LANDING + clear) return false;
    return true;
  };
  // is the straight run out of a shore at (x, z) the way d clear of every other island?
  const runFree = (x, z, d, self) => {
    for (let t = 0; t <= LEAD + 4; t++) for (const k of pieces) if (k !== self && Math.hypot(x + d[0] * t - k.x, z + d[1] * t - k.z) < k.R + 0.5 + HW + clear) return false;
    return true;
  };
  // does a bridge (pts, from its island to where it joins) fit: gentle bends, clear of every shore and of the other
  // bridges and landings, and meeting the one it joins at a good angle?
  const fits = (c, line) => {
    const { n, at } = line, B = c.B, near = LANDING + HW + clear + 1.5;
    // is point j clear of every shore (but its own island's along its straight run out, and the hub's along the
    // hub's), and of the other bridges and landings (but near where it joins)?
    const clearAt = j => {
      const [x, z] = at(j);
      const skip = j / 2 < LEAD + 1.3 ? pieces[pieces.length - 1] : c.tail && (n - 1 - j) / 2 < LEAD + 1.3 ? hub : null;
      if (water(x, z, skip) < HW + clear) return false;
      if (Math.hypot(x - B[0], z - B[1]) < near) return true;
      if (bridgeNear(x, z, 2 * HW + clear)) return false;
      for (const m of nodes) if (m.landing && Math.hypot(x - m.x, z - m.z) < LANDING + HW + clear) return false;
      return true;
    };
    // (every 4 m first: most that don't fit are caught there, cheaply)
    for (let j = 0; j < n; j += 8) if (!clearAt(j)) return false;
    const cos = Math.cos(2 / bend);
    for (let j = 4; j < n - 4; j++) {
      const p = at(j), q = at(j - 4), r = at(j + 4), ux = p[0] - q[0], uz = p[1] - q[1], vx = r[0] - p[0], vz = r[1] - p[1];
      if (ux * vx + uz * vz < cos * Math.sqrt((ux * ux + uz * uz) * (vx * vx + vz * vz))) return false;
    }
    // then every metre (the gaps it keeps are wider than that)
    for (let j = 2; j < n; j += 2) if (j % 8 && !clearAt(j)) return false;
    if (c.node?.hub) return true;
    const w = at(n - 5), d = unit(B[0] - w[0], B[1] - w[1]); // the way it arrives
    if (c.edge) {
      const t = tangent(c.edge.pts, c.j);
      if (Math.abs(d[0] * t[0] + d[1] * t[1]) > 0.8 || water(B[0], B[1]) < LANDING + clear) return false;
      for (const m of nodes) if (m.landing && Math.hypot(B[0] - m.x, B[1] - m.z) < 2 * LANDING + 3) return false;
      for (const e of bridges()) if (e !== c.edge && polyDist(e.sd, B[0], B[1]) < LANDING + HW + clear) return false;
    } else {
      for (const e of c.node.edges) {
        const q = e.a === c.node ? e.pts[4] : e.pts[e.pts.length - 5], o = unit(q[0] - B[0], q[1] - B[1]);
        if (-d[0] * o[0] - d[1] * o[1] > 0.64) return false;
      }
    }
    return true;
  };
  // does a loop (line, from a point P along one bridge to Q along another) fit: room for a landing at both ends,
  // gentle bends, and clear of every shore and of the other bridges and landings (but near its ends)?
  const loopFits = (P, Q, line) => {
    const { n, at } = line, near = LANDING + HW + clear + 1.5;
    for (const S of [P, Q]) {
      const [x, z] = S.p;
      if (water(x, z) < LANDING + clear) return false;
      for (const m of nodes) if (m.landing && Math.hypot(x - m.x, z - m.z) < 2 * LANDING + 3) return false;
      for (const e of bridges()) if (e !== S.e && boxGap(e.box, x, z) < LANDING + 2 * HW + clear && polyDist(e.sd, x, z) < LANDING + HW + clear) return false;
    }
    const cos = Math.cos(2 / bend);
    for (let j = 4; j < n - 4; j++) {
      const p = at(j), q = at(j - 4), r = at(j + 4), ux = p[0] - q[0], uz = p[1] - q[1], vx = r[0] - p[0], vz = r[1] - p[1];
      if (ux * vx + uz * vz < cos * Math.sqrt((ux * ux + uz * uz) * (vx * vx + vz * vz))) return false;
    }
    for (let j = 0; j < n; j += 2) {
      const [x, z] = at(j);
      if (water(x, z) < HW + clear) return false;
      if (Math.hypot(x - P.p[0], z - P.p[1]) < near || Math.hypot(x - Q.p[0], z - Q.p[1]) < near) continue;
      if (bridgeNear(x, z, 2 * HW + clear)) return false;
      for (const m of nodes) if (m.landing && Math.hypot(x - m.x, z - m.z) < LANDING + HW + clear) return false;
    }
    return true;
  };
  // how far along the bridges (and across the hub) every node is from one of them
  const walk = from => {
    const dist = new Map([[from, 0]]), open = [from];
    while (open.length) {
      open.sort((a, b) => dist.get(a) - dist.get(b));
      const n = open.shift();
      for (const e of n.edges) {
        const m = e.a === n ? e.b : e.a, d = dist.get(n) + e.len;
        if (d < (dist.get(m) ?? Infinity)) { dist.set(m, d); open.push(m); }
      }
    }
    return dist;
  };
  // where the next island's bridge could join: one of the hub's bridges' ends (if it's free), a landing, or anywhere
  // along a bridge (a new landing there), each with `ecc`, the longest walk on from there to the portal or an island
  // so far (`far`: walks from each), `dp`, the walk on to the island before (prev), and `extra`, what the walk on costs
  const joins = (prev, far) => {
    const cands = [];
    const dp = prev ? walk(prev) : null, wp = prev ? 0.2 + 0.3 * G.trail : 0;
    const toPrev = (n, s = 0) => (dp ? dp.get(n) + s : 0);
    // the longest walk from a join (a node, or j points along an edge) to the portal or an island so far
    const eccOf = c => {
      let m = 0;
      for (const d of far) m = Math.max(m, c.edge ? Math.min(d.get(c.edge.a) + c.j / 2, d.get(c.edge.b) + c.edge.len - c.j / 2) : d.get(c.node));
      return m;
    };
    for (const { n, sh, d } of ports) if (n.edges.length < 2) cands.push({ node: n, B: [d[0] * (sh + LEAD), d[1] * (sh + LEAD)], tB: [-d[0], -d[1]], tail: [[n.x, n.z]], dh: 0, dp: toPrev(n) });
    for (const n of nodes) if (n.landing && n.edges.length < 4) cands.push({ node: n, B: [n.x, n.z], dh: n.dh, dp: toPrev(n) });
    for (const e of bridges()) {
      const m0 = e.a.landing ? 2 * LANDING + 2 : LEAD + LANDING + 2, m1 = e.b.landing ? 2 * LANDING + 2 : LEAD + LANDING + 2;
      for (let j = Math.ceil(m0 * 2); j < e.pts.length - m1 * 2; j += 5) {
        cands.push({ edge: e, j, B: e.pts[j], dh: e.a.dh + j / 2, dp: dp ? Math.min(toPrev(e.a, j / 2), toPrev(e.b, e.len - j / 2)) : 0 });
      }
    }
    for (const c of cands) { c.ecc = eccOf(c); c.extra = c.ecc + wp * c.dp + (c.edge ? 3 : 0); }
    return cands;
  };
  // a quick guess at an island's bridge from the shore at E, leaving the way d (as the crow flies, a bit longer): the
  // join with the least extra, and the longest walk and the walk to the island before it would give
  const guess = (E, d, cands) => {
    let g = null;
    const ax = E[0] + d[0] * LEAD, az = E[1] + d[1] * LEAD;
    for (const c of cands) {
      const t = Math.hypot(c.B[0] - ax, c.B[1] - az), back = Math.max(0, -((c.B[0] - ax) * d[0] + (c.B[1] - az) * d[1]));
      // (a join behind the island costs the way round it)
      const l = t * 1.15 + LEAD + back * 0.8;
      if (!g || l + c.extra < g.cost) g = { cost: l + c.extra, ecc: l + c.ecc, leg: l + c.dp };
    }
    return g;
  };
  // the best bridge for an island whose way in reaches the shore at E, leaving it within a quarter turn or so of the
  // way out (spin): the cheapest join (of cands) that fits, counting its length and what the walk on costs (null if
  // none fits)
  const bridgeFor = (E, spin, joins) => {
    const d = outOf(spin), A = [E[0] + d[0] * LEAD, E[1] + d[1] * LEAD];
    const cands = joins.map(c => ({ ...c, lb: Math.hypot(c.B[0] - A[0], c.B[1] - A[1]) + c.extra }));
    cands.sort((p, q) => p.lb - q.lb);
    let pick = null;
    for (const c of cands.slice(0, 40)) { // (the likeliest; far-fetched joins never win anyway)
      if (pick && c.lb >= pick.cost) break;
      if (Math.hypot(c.B[0] - A[0], c.B[1] - A[1]) < 5) continue;
      // (a few ways out of the island, and shapes of curve: rounder or more direct)
      for (const la of [0, -0.45, 0.45]) for (const f of [0.4, 0.6, 0.25]) {
        const ld = [Math.sin(spin + la), Math.cos(spin + la)], from = [E[0] - ld[0] * 0.8, E[1] - ld[1] * 0.8], a = [E[0] + ld[0] * LEAD, E[1] + ld[1] * LEAD];
        const k = Math.min(20, Math.max(2, Math.hypot(c.B[0] - a[0], c.B[1] - a[1]) * f));
        const tB = c.tB || unit(c.B[0] - a[0] - ld[0] * k, c.B[1] - a[1] - ld[1] * k);
        if (relax < 2 && sharpest(a, ld, c.B, tB, k) > 1.15 / bend) continue; // (clearly too tight)
        const raw = curve(a, ld, c.B, tB, k);
        raw.unshift(from);
        if (c.tail) raw.push(...c.tail);
        const cost = arcLen(raw) + c.extra + Math.abs(la) * 2; // (priced before it's worth sampling evenly)
        if (pick && cost >= pick.cost) continue;
        if (relax < 2 && !fits(c, evenly(raw))) continue;
        pick = { ...c, raw, cost, ld };
      }
    }
    if (pick) pick.pts = resample(pick.raw);
    return pick;
  };

  // the islands one by one in play order. Spots where there's room, close to another island or to the world's shape,
  // each turned so its way in faces where its bridge would go; of the likeliest few a bridge can reach, the one that
  // keeps the longest walk (portal or island to island) short, then sits best on the shape and is not too long a walk
  // from the figure before
  let diam = 0, shape = 0, tour = 0;
  const rate = (ecc, leg, off) => 1.5 * Math.max(diam, ecc) + 0.5 * ecc + 0.4 * leg + SHAPE * off + Math.max(0, leg - LEG);
  const outer = Math.max(...[G.ring || 0].flat()) + 30;
  for (const [i, pt] of parts.entries()) {
    const r = reach(pt.world), prev = pieces[pieces.length - 1], spots = [];
    const cands = joins(i ? parts[i - 1].node : null, [start, ...parts.slice(0, i).map(q => q.node)].map(walk));
    const u = i / Math.max(1, parts.length - 1), spins = upright(pt.level) ? [0] : SPINS;
    for (let k = 0; k < 120; k++) {
      let x, z;
      if (k % 2) {
        // (off one of the islands so far: islands sprout next to each other)
        const from = i && rng() < G.trail ? prev : pieces[Math.floor(rng() * pieces.length)];
        const a = rng() * Math.PI * 2;
        // (round the hub there's a ring of water to leave room for the bridges out of it)
        const d = from.R + 0.5 + r + G.gap[0] + rng() * (G.gap[1] - G.gap[0]) + (from === hub ? 3 + rng() * 8 : 0);
        x = from.x + Math.sin(a) * d; z = from.z - Math.cos(a) * d;
      } else {
        // (anywhere near the shape)
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * outer;
        x = Math.sin(G.heading) * G.at + Math.sin(a) * d; z = -Math.cos(G.heading) * G.at - Math.cos(a) * d;
      }
      if (!roomy(r, x, z)) continue;
      const off = offShape(G, x, z, u);
      // (the turn whose way in faces the likeliest join)
      let best = null;
      for (const spin of spins) {
        const d = outOf(spin), E = toWorld({ x, z, spin }, 0, pt.coast);
        if (!runFree(E[0], E[1], d, null)) continue;
        const g = guess(E, d, cands);
        if (g && (!best || g.cost < best.g.cost)) best = { g, spin, E };
      }
      if (!best) continue;
      spots.push({ x, z, off, spin: best.spin, E: best.E, score: rate(best.g.ecc, best.g.leg, off) + rng() * 6 });
    }
    spots.sort((a, b) => a.score - b.score);
    // (the first two that a bridge reaches, the better of them)
    let pick = null, tried = 0;
    for (const s of spots.slice(0, 30)) {
      pieces.push({ world: pt.world, x: s.x, z: s.z, spin: s.spin, R: r });
      const b = bridgeFor(s.E, s.spin, cands);
      pieces.pop();
      if (!b) continue;
      const len = arcLen(b.pts);
      b.spot = s; b.leg = i ? b.dp + len : 0; b.ecc += len;
      b.score = rate(b.ecc, b.leg, s.off);
      if (!pick || b.score < pick.score) pick = b;
      if (++tried >= 2) break;
    }
    if (!pick) return null;
    diam = Math.max(diam, pick.ecc);
    shape += pick.spot.off;
    tour += pick.leg || pick.ecc;
    const { x, z, spin, E } = pick.spot, d = outOf(spin);
    pt.p.set(x, 0, z);
    pt.spin = spin;
    pieces.push({ world: pt.world, x, z, spin, R: r });
    pt.leadDir = pick.ld;
    lanes.push([E[0], E[1], d[0], d[1]]);
    const at = pick.edge ? split(pick.edge, pick.j) : pick.node;
    pt.node = { x: E[0] - d[0] * 0.8, z: E[1] - d[1] * 0.8, island: pt, edges: [] };
    nodes.push(pt.node);
    link(at, pt.node, pick.pts.slice().reverse(), pt);
  }

  // then (G.loops) a loop: a bridge between two bridges that pass close by but are a long walk apart along them,
  // where one fits and takes the longest walk and the walks from figure to figure down
  const ends = [start, ...parts.map(pt => pt.node)];
  const measure = d => {
    let m = 0, t = 0;
    for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) m = Math.max(m, d(a, b));
    for (let a = 0; a + 1 < ends.length; a++) t += d(a, a + 1);
    return { diam: m, tour: t, cost: m + 0.5 * t };
  };
  for (let n = 0; n < (G.loops ?? 0); n++) {
    const far = ends.map(walk), base = measure((a, b) => far[a].get(ends[b]));
    // points along the bridges every 3 m (clear of their ends), with the walk from each to every end
    const spots = [];
    for (const e of bridges()) {
      const m0 = e.a.landing ? 2 * LANDING + 2 : LEAD + LANDING + 2, m1 = e.b.landing ? 2 * LANDING + 2 : LEAD + LANDING + 2;
      for (let j = Math.ceil(m0 * 2); j < e.pts.length - m1 * 2; j += 6) {
        spots.push({ e, j, p: e.pts[j], to: far.map(d => Math.min(d.get(e.a) + j / 2, d.get(e.b) + e.len - j / 2)) });
      }
    }
    const nodeWalk = new Map(), from = m => nodeWalk.get(m) || (nodeWalk.set(m, walk(m)), nodeWalk.get(m));
    const apart = (P, Q) => Math.min(
      P.j / 2 + from(P.e.a).get(Q.e.a) + Q.j / 2, P.j / 2 + from(P.e.a).get(Q.e.b) + Q.e.len - Q.j / 2,
      P.e.len - P.j / 2 + from(P.e.b).get(Q.e.a) + Q.j / 2, P.e.len - P.j / 2 + from(P.e.b).get(Q.e.b) + Q.e.len - Q.j / 2);
    const after = (P, Q, l) => measure((a, b) => Math.min(far[a].get(ends[b]), P.to[a] + l + Q.to[b], Q.to[a] + l + P.to[b]));
    const pairs = [];
    for (let i = 0; i < spots.length; i++) for (let k = i + 1; k < spots.length; k++) {
      const P = spots[i], Q = spots[k];
      if (P.e === Q.e) continue;
      const d = Math.hypot(P.p[0] - Q.p[0], P.p[1] - Q.p[1]);
      if (d < 2 * LANDING + 4 || d > 50 || apart(P, Q) < 1.4 * d + 8) continue;
      const gain = base.cost - after(P, Q, d * 1.25).cost;
      if (gain > 4) pairs.push({ P, Q, d, gain });
    }
    pairs.sort((a, b) => b.gain - a.gain);
    let done = false;
    for (const { P, Q, d } of pairs.slice(0, 24)) {
      // (leaving each bridge square to it, towards the other)
      const side = (S, T) => { const t = tangent(S.e.pts, S.j), v = [-t[1], t[0]]; return v[0] * (T.p[0] - S.p[0]) + v[1] * (T.p[1] - S.p[1]) > 0 ? v : [-v[0], -v[1]]; };
      const ta = side(P, Q), tb = side(Q, P).map(v => -v), k = Math.max(2, Math.min(12, d * 0.4));
      if (sharpest(P.p, ta, Q.p, tb, k) > 1.15 / bend) continue;
      const raw = curve(P.p, ta, Q.p, tb, k);
      if (base.cost - after(P, Q, arcLen(raw)).cost < 4 || !loopFits(P, Q, evenly(raw))) continue;
      link(split(P.e, P.j), split(Q.e, Q.j), resample(raw));
      done = true;
      break;
    }
    if (!done) break;
  }
  const end = measure((a, b) => walk(ends[a]).get(ends[b]));
  return { nodes, edges, diam: end.diam, tour: end.tour, shape: shape / parts.length };
}

// Each world's grown layout, kept for the session: islands come out the same every time, so going back to a world
// needn't grow it again. Kept as plain data (island positions, nodes and bridges by index), put back onto the new
// build's parts.
const grown = new Map();
function keep(key, net, parts, tries) {
  const ni = new Map(net.nodes.map((n, i) => [n, i])), pi = new Map(parts.map((pt, i) => [pt, i]));
  grown.set(key, {
    tries, diam: net.diam,
    parts: parts.map(pt => ({ x: pt.p.x, z: pt.p.z, spin: pt.spin, leadDir: pt.leadDir, node: ni.get(pt.node) })),
    nodes: net.nodes.map(({ edges, island, ...n }) => ({ ...n, island: island ? pi.get(island) : -1 })),
    edges: net.edges.map(({ a, b, island, ...e }) => ({ ...e, a: ni.get(a), b: ni.get(b), island: island ? pi.get(island) : -1 })),
  });
}
function recall(key, parts) {
  const g = grown.get(key);
  if (!g) return null;
  const nodes = g.nodes.map(({ island, ...n }) => ({ ...n, ...(island >= 0 ? { island: parts[island] } : {}), edges: [] }));
  const edges = g.edges.map(({ a, b, island, ...e }) => {
    const edge = { ...e, a: nodes[a], b: nodes[b], island: island >= 0 ? parts[island] : null };
    nodes[a].edges.push(edge); nodes[b].edges.push(edge);
    return edge;
  });
  g.parts.forEach((q, i) => { parts[i].p.set(q.x, 0, q.z); parts[i].spin = q.spin; parts[i].leadDir = q.leadDir; parts[i].node = nodes[q.node]; });
  return { net: { nodes, edges, diam: g.diam }, tries: g.tries, ms: g.ms };
}

// how far an island's ground reaches from its middle, in any direction (its nominal radius is an upper bound)
function extent(world) {
  let best = 0;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let d = world.R + 2; d > best; d -= 0.5) if (world.walkSd(c * d, s * d) < 0) { best = d; break; }
  }
  return best + 0.5;
}
// where the ground ends going along +z (or -z) from the centre line
const coast = (world, dirZ) => shore(world, 0, dirZ);
// how far the ground reaches from the middle the way (dx, dz)
function shore(world, dx, dz) {
  let d = 0;
  while (d < world.R + 4 && world.walkSd((d + 0.25) * dx, (d + 0.25) * dz) < 0) d += 0.25;
  return d;
}

// chapter: index; levels: its figures; makePart(level) -> { world, footR: the figure's footprint }; makeHub(seaY) -> world
// isOpen(level) / isDone(level); figureMaterial: material for finished figures standing on inactive islands
// doorShut(level): a door at the island end of its bridge stays shut (the very first figure, until it's rebuilt)
// isHalf(level): a saved run in progress (a half-filled marker floats over its pedestal)
export function buildArchipelago({ chapter, levels, makePart, makeHub, isOpen, isDone, isHalf = () => false, doorShut = () => false, upright = () => false, figureMaterial }) {
  const root = new THREE.Group();
  const parts = levels.map(level => ({ level, ...makePart(level), p: new THREE.Vector3() }));
  // each island's colour wash (from, to, radius of the wash, shine)
  for (const pt of parts) { pt.wash = { x: 0, y: 0, z: -1, w: 0 }; thrive(pt.world.group, pt.wash); }
  const hubWorld = makeHub(parts[0].world.seaY);
  const hub = { world: hubWorld, p: new THREE.Vector3(), spin: 0 };
  const floating = hubWorld.voidY !== undefined;

  // ---- layout: the islands grown round the hub, and the bridges between them ----
  for (const pt of parts) pt.coast = coast(pt.world, 1);
  const G = GROWTH[hubWorld.themeId] || GROWTH.meadow, rng = mulberry32(9100 + chapter * 977);
  const key = [chapter, hubWorld.themeId, ...PORTS.map(([dx, dz]) => shore(hubWorld, dx, dz)), ...parts.map(pt => `${pt.level.id}:${pt.world.R}:${pt.coast}`)].join('|');
  let { net, tries, ms } = recall(key, parts) || { net: null, tries: 0, ms: 0 };
  if (!net) {
    // (several goes, and the one with the shortest longest walk wins)
    const t0 = performance.now();
    let best = Infinity, ok = 0;
    for (; tries < 40 && ok < GROWS; tries++) {
      const n = grow(parts, hubWorld, G, rng, tries < 30 ? 0 : tries < 39 ? 1 : 2, upright);
      if (!n) continue;
      ok++;
      const score = n.diam + 0.3 * n.tour + SHAPE * n.shape;
      if (score < best) { best = score; keep(key, n, parts, tries + 1); }
      if (tries >= 30) break; // (made do: take it)
    }
    if (!ok) throw new Error(`no room for ${parts.length} islands round the hub`);
    grown.get(key).ms = performance.now() - t0;
    ({ net, tries, ms } = recall(key, parts));
  }
  const { nodes, edges } = net, hubNode = nodes[0], landings = nodes.filter(n => n.landing), bridges = edges.filter(e => !e.land);
  // the ways in, in each piece's own coordinates [x0, z0, x1, z1]: an island's from just outside the figure's
  // footprint out to its shore, the hub's from the portal to its middle and on to each of its bridges in use
  for (const pt of parts) pt.lanes = [[0, Math.max(3.6, (pt.footR ?? 3.2) + 1) + 0.4, 0, pt.coast + 0.3]];
  hub.lanes = edges.filter(e => e.land && e.b.edges.length > 1 || e.a.portal).map(({ a, b }) => {
    const [ux, uz] = unit(b.x - a.x, b.z - a.z), far = b.port ? 1.1 : 0, back = a.portal ? 1.2 : 0;
    return [a.x - ux * back, a.z - uz * back, b.x + ux * far, b.z + uz * far];
  });
  // (grass and flowers keep off them: the planks laid there below must show)
  for (const k of [hub, ...parts]) k.world.out.mow?.(k.lanes, LANE - 0.15);
  for (const pt of parts) {
    const [ex, ez] = toWorld(pt, 0, pt.coast);
    pt.entry = new THREE.Vector3(ex, 0, ez); // where its bridge reaches the island
    pt.doorPos = new THREE.Vector3(ex + pt.leadDir[0] * 1.3, 0, ez + pt.leadDir[1] * 1.3); // (on its straight run out)
    // a locked island's bridge is closed off by a gate just past where it leaves the hub or a landing
    const e = pt.node.edges[0], j = Math.round((e.a.landing ? LANDING + 1 : 2.6) * 2);
    pt.gatePos = new THREE.Vector3(e.pts[j][0], 0, e.pts[j][1]);
    pt.gateDir = tangent(e.pts, j); // (towards the island)
    pt.gateWay = e.pts.slice(0, j + 1);
  }
  const way = (e, pts, x, z) => { const o = boxGap(e.box, x, z); return o > 3 ? o : polyDist(pts, x, z); };
  const bridgeSd = (x, z) => {
    let d = Infinity;
    for (const n of landings) d = Math.min(d, Math.hypot(x - n.x, z - n.z) - LANDING);
    for (const e of bridges) {
      const pt = e.island;
      let s = pt && !pt.open
        ? Math.max(way(e, pt.gateWay, x, z) - HW, (x - pt.gatePos.x) * pt.gateDir[0] + (z - pt.gatePos.z) * pt.gateDir[1])
        : way(e, e.sd, x, z) - HW;
      if (pt?.shut) {
        const [u, v] = pt.leadDir, dx = x - pt.doorPos.x, dz = z - pt.doorPos.z;
        s = Math.max(s, Math.min(0.35 - Math.abs(dx * u + dz * v), HW + 0.6 - Math.abs(dx * v - dz * u)));
      }
      d = Math.min(d, s);
    }
    return d;
  };
  // the shortest way along the bridges between two nodes, as points every 0.5 m
  const wayBetween = (from, to) => {
    const dist = new Map([[from, 0]]), prev = new Map(), open = [from];
    while (open.length) {
      open.sort((a, b) => dist.get(a) - dist.get(b));
      const n = open.shift();
      if (n === to) break;
      for (const e of n.edges) {
        const m = e.a === n ? e.b : e.a, d = dist.get(n) + e.len;
        if (d < (dist.get(m) ?? Infinity)) { dist.set(m, d); prev.set(m, e); open.push(m); }
      }
    }
    if (!prev.has(to)) return [];
    const legs = [];
    for (let n = to; n !== from;) {
      const e = prev.get(n);
      legs.unshift(e.b === n ? e.pts : e.pts.slice().reverse());
      n = e.b === n ? e.a : e.b;
    }
    return legs.flatMap((l, i) => (i ? l.slice(1) : l));
  };

  // ---- place the islands ----
  hubWorld.group.position.copy(hub.p);
  root.add(hubWorld.group);
  for (const pt of parts) { pt.world.group.position.copy(pt.p); pt.world.group.rotation.y = pt.spin; root.add(pt.world.group); }

  // ground that's just ground there (not ice, water, a drift or anything else with its own feel)
  const plainGround = (k, x, z, y) => { const s = k.world.surfaceAt(x, z, y); return s.slow === 1 && s.friction === 1 && !s.splash; };

  // ---- bridge looks ----
  // Planks across the way, round landings where bridges meet; rails along every open edge, stopping where a bridge
  // meets land or a landing, each opening onto a landing marked by a taller post with the world's lamp.
  const S = STYLES[hubWorld.themeId] || STYLES.meadow;
  const B = new Batch();
  const plankRng = mulberry32(77 + chapter * 13), shadeOf = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
  const pieceList = [hub, ...parts];
  const onLand = (ax, az) => pieceList.some(k => k.world.walkSd(...toLocal(k, ax, az)) < -0.05);
  const inLanding = (x, z, m = 0) => landings.some(n => Math.hypot(x - n.x, z - n.z) < LANDING + m);
  const piers = S.piers && !floating;
  const postH = piers ? 1.15 : floating ? 1.6 : DECK - hubWorld.seaY + 0.9;
  const rails = S.rails || [[0.42, 0.08, 0.09], [0.86, 0.08, 0.09]];
  const posts = [];
  // a box from a to b (its length along the way), sw wide, sy tall, centred at height y
  const beam = (a, b, y, sy, sw, color, kind = 'solid') => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    B.put(GEO.box(), color, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, { sx: sw, sy, sz: Math.hypot(dx, dz) + 0.02, ry: Math.atan2(dx, dz), kind });
  };
  const pierH = DECK - 0.2 - (hubWorld.seaY - 1), pierY = DECK - 0.2 - pierH / 2;
  // one stretch of railing along a line of points (straight pieces), with newels at the ends that open onto a landing
  const railing = (run, na, nb) => {
    const L = arcLen(run);
    if (L < 0.3) return;
    const line = simplify(run, 0.03);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      for (const [y, sy, sw] of rails) beam(a, b, DECK + y, sy, sw, S.rail, S.railKind);
      if (S.railTop) { const [y, sy, sw] = rails[rails.length - 1]; beam(a, b, DECK + y + sy / 2 + 0.02, 0.05, sw + 0.04, S.railTop); }
      if (S.edge) beam(a, b, DECK + 0.02, 0.06, 0.16, S.edge, S.edgeKind || 'ground');
    }
    const k = Math.max(1, Math.round(L / 1.8));
    for (let i = 0; i <= k; i++) posts.push({ p: along(run, (L * i) / k, (L * i) / k)[0], newel: (i === 0 && na) || (i === k && nb) });
  };
  // the stretches of a side line over open water (open(x, z): where it opens onto a landing or another bridge)
  const sides = (line, open) => {
    let run = null, why = 'end';
    for (let i = 0; i <= line.length; i++) {
      const p = line[i], stop = i === line.length ? 'end' : onLand(p[0], p[1]) ? 'land' : open(p[0], p[1]) ? 'open' : null;
      if (stop) { if (run) railing(run.pts, run.from === 'open', stop === 'open'); run = null; why = stop; }
      else if (run) run.pts.push(p);
      else run = { pts: [p], from: why };
    }
  };
  for (const e of bridges) {
    const P = e.pts;
    P.forEach(([x, z], i) => {
      if (inLanding(x, z, -0.2)) return;
      const t = tangent(P, i);
      // each plank its own length and lie, a touch darker now and then
      const pr = plankRng();
      B.put(GEO.box(), pr < 0.18 ? shadeOf(S.planks[i % 2], 0.92) : S.planks[i % 2], x, DECK - 0.02, z, { sx: 2 * HW + 0.04 + pr * 0.16, sy: 0.06, sz: 0.455, ry: Math.atan2(t[0], t[1]) + (plankRng() - 0.5) * 0.035, kind: 'ground' });
    });
    const line = simplify(P, 0.05);
    for (let i = 1; i < line.length; i++) beam(line[i - 1], line[i], DECK - 0.12, 0.16, 2 * HW, S.base);
    if (piers) for (let s = 1.8; s < e.len - 0.6; s += 3.6) {
      const [[x, z]] = along(P, s, s), t = tangent(P, Math.round(s * 2));
      if (!onLand(x, z) && !inLanding(x, z, 0.4)) B.put(GEO.box(), S.post, x, pierY, z, { sx: 2 * HW - 0.2, sy: pierH, sz: 0.8, ry: Math.atan2(t[0], t[1]) });
    }
    const others = (x, z) => inLanding(x, z, 0.1) || bridges.some(f => f !== e && boxGap(f.box, x, z) < 3 && polyDist(f.sd, x, z) < HW + 0.02);
    for (const side of [-1, 1]) sides(P.map((p, i) => { const t = tangent(P, i), o = side * (HW + 0.05); return [p[0] - t[1] * o, p[1] + t[0] * o]; }), others);
  }
  // the ways in across the islands: short planks set into the ground, the bridge's own, so you can see where it
  // carries on (not over ice or water, where the speed-up doesn't either)
  for (const k of [hub, ...parts]) {
    const r = mulberry32(31 + Math.round(k.p.x * 7 + k.p.z * 13));
    for (const [x0, z0, x1, z1] of k.lanes) {
      const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      for (let t = 0.3, i = 0; t < L - 0.2; t += 0.62, i++) {
        const lx = x0 + ux * t, lz = z0 + uz * t, y = k.world.floorAt(lx, lz);
        if (y === null || !plainGround(k, lx, lz, y)) continue;
        const [x, z] = toWorld(k, lx + (r() - 0.5) * 0.25 * uz, lz - (r() - 0.5) * 0.25 * ux);
        B.put(GEO.box(), S.planks[i % 2], x, y + 0.02, z, { sx: 2 * LANE - 0.2 + (r() - 0.5) * 0.4, sy: 0.05, sz: 0.4, ry: Math.atan2(ux, uz) + (k.spin || 0) + (r() - 0.5) * 0.12, kind: 'fx' });
      }
    }
  }
  for (const n of landings) {
    // planks across the first bridge that comes in
    const e0 = n.edges[0], q = e0.a === n ? e0.pts[3] : e0.pts[e0.pts.length - 4], u = unit(q[0] - n.x, q[1] - n.z), ry = Math.atan2(u[0], u[1]);
    B.put(GEO.cyl(16), S.base, n.x, DECK - 0.12, n.z, { sx: LANDING, sy: 0.16, sz: LANDING });
    for (let t = -LANDING + 0.25, i = 0; t < LANDING; t += 0.5, i++) {
      const w = 2 * Math.sqrt(Math.max(0, LANDING * LANDING - t * t));
      if (w > 0.3) B.put(GEO.box(), S.planks[i % 2], n.x + u[0] * t, DECK - 0.02, n.z + u[1] * t, { sx: w, sy: 0.06, sz: 0.46, ry, kind: 'ground' });
    }
    if (piers) B.put(GEO.cyl(10), S.post, n.x, pierY, n.z, { sx: LANDING * 0.55, sy: pierH, sz: LANDING * 0.55 });
    // the rail round its rim, open where each bridge comes in (starting at an opening, so a run doesn't wrap round)
    const rim = [];
    for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; rim.push([n.x + Math.sin(a) * (LANDING + 0.05), n.z + Math.cos(a) * (LANDING + 0.05)]); }
    const gap = (x, z) => n.edges.some(e => polyDist(e.sd, x, z) < HW + 0.02);
    const k0 = Math.max(0, rim.findIndex(p => gap(p[0], p[1])));
    sides([...rim.slice(k0, 48), ...rim.slice(0, k0 + 1)], gap);
  }
  // posts (one where two railings meet), the openings onto a landing taller and lit
  const kept = [];
  for (const q of posts) {
    const o = kept.find(k => Math.hypot(k.p[0] - q.p[0], k.p[1] - q.p[1]) < 0.35);
    if (o) o.newel ||= q.newel; else kept.push(q);
  }
  const flowers = hubWorld.theme.flowers;
  for (const { p: [px, pz], newel } of kept) {
    const w = (S.postW || 0.14) * (newel ? 1.5 : 1), top = DECK + (newel ? 1.2 : 0.95), h = postH + top - DECK - 0.95;
    B.put(S.round ? GEO.cyl(8) : GEO.box(), S.post, px, top - h / 2, pz, S.round ? { sx: w * 0.6, sy: h, sz: w * 0.6 } : { sx: w, sy: h, sz: w });
    if (S.cap) B.put(GEO.box(), S.cap, px, top + 0.03, pz, { sx: w + 0.06, sy: 0.07, sz: w + 0.06 });
    // (a square wooden post is cut to a point)
    else if (!S.round && !newel) B.put(GEO.cone(4), S.post, px, top + 0.05, pz, { sx: w * 0.78, sy: 0.1, sz: w * 0.78, ry: Math.PI / 4 });
    if (!newel) continue;
    const y = top + (S.cap ? 0.07 : 0);
    const put = (geo, color, dy, s, o = {}) => B.put(geo, color, px, y + dy, pz, { sx: s[0], sy: s[1], sz: s[2], ...o });
    switch (S.top) {
      case 'flowers':
        // a pot of flowers: a rim, leaves, a posy
        put(GEO.taper(8, 1.25), 0xd9774a, 0.1, [0.15, 0.2, 0.15]);
        put(GEO.cyl(8), 0xc0623a, 0.2, [0.2, 0.04, 0.2]);
        put(GEO.lump(1), 0x5fae4f, 0.27, [0.19, 0.11, 0.19]);
        for (let i = 0; i < 5; i++) B.put(GEO.ico(), flowers[i % flowers.length], px + Math.cos(i * 1.257) * 0.11, y + 0.33 + (i % 2) * 0.04, pz + Math.sin(i * 1.257) * 0.11, { sx: 0.065, sy: 0.065, sz: 0.065 });
        break;
      case 'hay':
        put(GEO.box(), 0xe9c75a, 0.14, [0.42, 0.28, 0.32]);
        put(GEO.box(), 0xc9a03a, 0.14, [0.44, 0.06, 0.34]);
        break;
      case 'ice': put(GEO.octa(), 0xc8f0ff, 0.22, [0.15, 0.28, 0.15], { kind: 'glow' }); break;
      case 'crystal': put(GEO.octa(), 0xff9ee8, 0.22, [0.15, 0.28, 0.15], { kind: 'glow' }); break;
      case 'lantern':
        put(GEO.box(), 0x3a2a20, 0.03, [0.26, 0.06, 0.26]);
        put(GEO.box(), 0xffd27a, 0.17, [0.17, 0.22, 0.17], { kind: 'glow' });
        put(GEO.cone(4), 0x3a2a20, 0.36, [0.22, 0.16, 0.22], { ry: Math.PI / 4 });
        break;
      case 'torch':
        put(GEO.cone(6), 0x8a6a3c, 0.1, [0.14, 0.2, 0.14], { rx: Math.PI });
        put(GEO.ico(), 0xffa040, 0.3, [0.1, 0.18, 0.1], { kind: 'glow' });
        break;
      case 'beacon':
        put(GEO.box(), 0x3a3850, 0.04, [0.24, 0.08, 0.24]);
        put(GEO.dome(), 0x4cc9f0, 0.08, [0.12, 0.14, 0.12], { kind: 'glow' });
        break;
      case 'rune': put(GEO.box(), 0x9cf5ff, 0.22, [0.15, 0.15, 0.15], { rx: Math.PI / 4, rz: Math.PI / 4, kind: 'glow' }); break;
    }
  }
  const bridgeBlockers = [];
  B.build(root, bridgeBlockers);

  // gates on the bridges of locked islands, and finished figures on the islands you're not on
  const gateGeo = new THREE.BoxGeometry(1, 1, 1);
  const wood = toon(S.base), dark = toon(S.post);
  let lockTex = null;
  const lockBadge = () => lockTex || (lockTex = lockTexture());
  for (const pt of parts) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const m = new THREE.Mesh(gateGeo, wood); m.scale.set(0.24, 1.5, 0.24); m.position.set(s * (HW - 0.05), DECK + 0.75, 0); g.add(m); }
    for (const y of [0.55, 1.1]) { const m = new THREE.Mesh(gateGeo, dark); m.scale.set(HW * 2, 0.14, 0.1); m.position.set(0, DECK + y, 0); g.add(m); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockBadge(), depthWrite: false, transparent: true }));
    sp.scale.setScalar(0.7); sp.position.set(0, DECK + 1.95, 0); sp.layers.set(LAYER_OVERLAY); sp.renderOrder = 5;
    g.add(sp);
    g.position.copy(pt.gatePos);
    g.rotation.y = Math.atan2(pt.gateDir[0], pt.gateDir[1]);
    g.traverse(o => { o.castShadow = true; });
    root.add(g);
    pt.gate = g;
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
    d.position.copy(pt.doorPos);
    d.rotation.y = Math.atan2(pt.leadDir[0], pt.leadDir[1]);
    d.traverse(o => { o.castShadow = true; });
    root.add(d);
    pt.door = d;
  }

  let active = null, activeTops = [];
  const A = new THREE.Vector3(); // archipelago position of the active island
  // the active island's own coordinates of a scene point, and the same turn about the scene's middle
  const spun = k => ({ x: 0, z: 0, spin: k.spin });
  const mine = (x, z) => toLocal(spun(active), x, z);
  // a vector of a piece's own, as the archipelago sees it
  const turned = (k, v) => { const [x, z] = toWorld({ x: 0, z: 0, spin: k.spin }, v.x, v.z); return v.clone ? v.clone().set(x, v.y, z) : { ...v, x, z }; };
  // a box of a piece's own, as the scene sees it (a quarter turn keeps it a box)
  const boxIn = (k, b, ox, oz) => {
    const [x0, z0] = toWorld(spun(k), b.min.x, b.min.z), [x1, z1] = toWorld(spun(k), b.max.x, b.max.z);
    const c = b.clone();
    c.min.x = Math.min(x0, x1) + ox; c.max.x = Math.max(x0, x1) + ox; c.min.z = Math.min(z0, z1) + oz; c.max.z = Math.max(z0, z1) + oz;
    c.sound = b.sound;
    return c;
  };
  const pieces = [hub, ...parts];
  // the sea's shallows follow every shore of the archipelago
  if (hubWorld.sea?.userData.bake) {
    const ks = pieces.map(k => ({ sd: k.world.coastSd, toLocal: (x, z) => toLocal(k, x, z), x: px(k), z: pz(k), R: k.world.R + 2 }));
    const xs = ks.map(k => [k.x - k.R, k.x + k.R]).flat(), zs = ks.map(k => [k.z - k.R, k.z + k.R]).flat();
    hubWorld.sea.userData.bake(coastOf(ks), [Math.min(...xs) - 26, Math.min(...zs) - 26, Math.max(...xs) + 26, Math.max(...zs) + 26]);
  }
  const api = {
    group: root, theme: hubWorld.theme, themeId: hubWorld.themeId, atmos: hubWorld.atmos, archipelago: true,
    get onFlash() { return hubWorld.onFlash; }, set onFlash(f) { hubWorld.onFlash = f; },
    get onGust() { return hubWorld.onGust; }, set onGust(f) { hubWorld.onGust = f; },
    get calm() { return hubWorld.calm; }, set calm(v) { hubWorld.calm = v; },
    gravityScale: hubWorld.gravityScale, wind: hubWorld.wind, voidY: hubWorld.voidY, seaY: hubWorld.seaY, hasSea: hubWorld.hasSea,
    colliders: [], blockers: [],
    // the puzzle lives on the active island, in the middle of the scene (turned with the island: `spin`)
    get R() { return active.world.R; }, get tops() { return activeTops; }, get spin() { return active.spin; },
    // (the active island's bounce pads, as the scene sees them)
    get pads() { return active.world.pads.map(p => ({ ...turned(active, p), vel: turned(active, p.vel) })); },
    radiusAt: th => active.world.radiusAt(th + active.spin),
    isFreeGround: (x, z, m) => active.world.isFreeGround(...mine(x, z), m),
    heightAt: (x, z, maxY) => active.world.heightAt(...mine(x, z), maxY),
    groundY: (x, z) => active.world.groundY(...mine(x, z)),
    dropPoint(x, z, maxY, px, pz) {
      const d = active.world.dropPoint(...mine(x, z), maxY, ...mine(px, pz)), [sx, sz] = toWorld(spun(active), d.x, d.z);
      return { x: sx, y: d.y, z: sz };
    },
    // ---- the player walks across everything ----
    floorAt(x, z) {
      const ax = x + A.x, az = z + A.z;
      let best = null;
      for (const k of pieces) {
        const [lx, lz] = toLocal(k, ax, az);
        if (k.world.walkSd(lx, lz) < 0.35) { const f = k.world.floorAt(lx, lz); if (f !== null && (best === null || f > best)) best = f; }
      }
      if (bridgeSd(ax, az) < 0.05 && (best === null || DECK > best)) best = DECK;
      return best;
    },
    walkSd(x, z) {
      const ax = x + A.x, az = z + A.z;
      let d = bridgeSd(ax, az);
      for (const k of pieces) d = Math.min(d, k.world.walkSd(...toLocal(k, ax, az)));
      return d;
    },
    surfaceAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      const k = pieceAt(ax, az, -0.3);
      // (gentler with reduced motion)
      const boost = api.calmMotion?.() ? 1.4 : BOOST;
      if (!k && bridgeSd(ax, az) < 0.05) return { friction: 1, slow: boost, sound: S.sound };
      const w = k || active, [lx, lz] = toLocal(w, ax, az), s = w.world.surfaceAt(lx, lz, y);
      // the way in across an island (or the hub) is a breeze lane too, on the ground (not up on something)
      const inLane = w.lanes.some(([x0, z0, x1, z1]) => polyDist([[x0, z0], [x1, z1]], lx, lz) < LANE);
      if (inLane && Math.abs(y - (w.world.floorAt(lx, lz) ?? 0)) < 0.1 && s.slow === 1 && s.friction === 1 && !s.splash) return { ...s, slow: boost };
      return s;
    },
    padAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      for (const k of pieces) {
        const pd = k.world.padAt(...toLocal(k, ax, az), y);
        // (a pad on a turned island launches you its way)
        if (pd) return k.spin && pd.vel ? { ...pd, vel: turned(k, pd.vel) } : pd;
      }
      return null;
    },
    safeAt(x, z, y) {
      const ax = x + A.x, az = z + A.z;
      if (bridgeSd(ax, az) < -0.6 && Math.abs(y - DECK) < 0.15) return true;
      const k = pieceAt(ax, az, -0.6);
      return !!k && k.world.safeAt(...toLocal(k, ax, az), y);
    },
    // carrying blocks keeps you on the active island; otherwise anywhere on land or a bridge
    restrict: null, onBlocked: null,
    clampPlayer(pos) {
      if (api.restrict?.()) {
        const x = pos.x, z = pos.z, [lx, lz] = mine(x, z), q = { x: lx, y: pos.y, z: lz };
        active.world.clampPlayer(q);
        [pos.x, pos.z] = toWorld(spun(active), q.x, q.z);
        if (Math.abs(pos.x - x) + Math.abs(pos.z - z) > 1e-4 && bridgeSd(x + A.x, z + A.z) < 0.3) api.onBlocked?.();
        return;
      }
      if (floating && (pos.y > 0.05 || pos.y < -0.3)) {
        // up on a bridge's deck, or in the air over one (low gravity carries a jump a long way): you can't step or
        // drift off its side into the void (off an island's edge you still can)
        const ax = pos.x + A.x, az = pos.z + A.z;
        if (pos.y > -0.1 && bridgeSd(ax, az) < 1.6 && !pieceAt(ax, az, 0.3) && api.walkSd(pos.x, pos.z) > -0.45) projectInside(api.walkSd, pos, 0.45);
        return;
      }
      if (api.walkSd(pos.x, pos.z) > -0.45) projectInside(api.walkSd, pos, 0.45);
    },
    update(dt, t, cam) {
      const c = cam ? cam.clone().add(A) : null;
      beacon.animate(t, api.calmMotion?.());
      for (const pt of parts) for (const h of pt.leaves) if (h.rotation.y !== h.userData.to) {
        const d = h.userData.to - h.rotation.y;
        h.rotation.y = Math.abs(d) < 0.002 ? h.userData.to : h.rotation.y + d * Math.min(1, dt * 2.6);
      }
      // the finished figures on the other islands are alive: now and then one gives a little jump on its pedestal
      if (!api.calmMotion?.()) for (const m of displays.values()) if (m.visible) idleHop(m, m.userData, dt, PEDESTAL_TOP);
      for (const k of pieces) k.world.update(dt, t, c ? (([lx, lz]) => new THREE.Vector3(lx, c.y, lz))(toLocal(k, c.x, c.z)) : null);
      // a finished island's colour washes out from its figure to its shores
      for (const pt of parts) if (pt.washT !== undefined) {
        pt.washT += dt;
        pt.wash.z = pt.washT * 9;
        if (pt.wash.z > pt.world.R + 5) { pt.wash.x = pt.wash.y = 1; pt.wash.z = -1; pt.wash.w = 0; pt.washT = undefined; }
      }
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
      wood.dispose(); dark.dispose(); lockTex?.dispose(); beacon.dispose(); halfTex.dispose();
      for (const s of halves.values()) s.material.dispose();
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
    for (const k of pieces) if (k.world.walkSd(...toLocal(k, ax, az)) < inside) return k;
    return null;
  }

  // a beacon over the next figure's island (or the portal)
  const beacon = makeBeacon();
  root.add(beacon);
  let beaconFor;

  // half-built marker: a half-filled disc over the pedestal of a figure with a saved run
  const halfTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#2a1f3d'; g.beginPath(); g.arc(64, 68, 54, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4e0'; g.beginPath(); g.arc(64, 62, 48, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffc93c'; g.beginPath(); g.moveTo(64, 62); g.arc(64, 62, 48, Math.PI / 2, Math.PI * 1.5); g.fill();
    g.strokeStyle = '#2a1f3d'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 16); g.lineTo(64, 108); g.stroke();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const halves = new Map();
  const displays = new Map();
  function dress() {
    for (const pt of parts) {
      pt.open = isOpen(pt.level);
      pt.gate.visible = !pt.open;
      pt.shut = doorShut(pt.level);
      pt.door.visible = !!(pt.shut || pt.hadDoor);
      if (pt.shut) pt.hadDoor = true;
      // swung open: it swings while you watch (the figure just finished), and stands open from the start otherwise
      for (const h of pt.leaves) { h.userData.to = pt.shut ? 0 : h.userData.s * 1.75; if (!pt.dressed) h.rotation.y = h.userData.to; }
      pt.dressed = true;
      // finished islands run rich, the one you're on stays as it is, the rest wait muted
      if (pt.washT === undefined) pt.wash.x = pt.wash.y = isDone(pt.level) ? 1 : pt === active ? 0 : pt.open ? -0.7 : -1;
      const show = pt !== active && isDone(pt.level);
      if (show && !displays.has(pt)) {
        const m = new THREE.Mesh(mergeFigure(expandLevel(pt.level).cells), figureMaterial);
        m.position.set(0, PEDESTAL_TOP, 0);
        m.rotation.y = -pt.spin; // (figures all face south, as the one you're building does, however the island turns)
        m.castShadow = m.receiveShadow = true;
        pt.world.group.add(m);
        displays.set(pt, m);
      }
      if (displays.has(pt)) displays.get(pt).visible = show;
      const half = pt !== active && pt.open && !isDone(pt.level) && isHalf(pt.level);
      if (half && !halves.has(pt)) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halfTex, depthWrite: false, transparent: true, fog: false }));
        // big enough to read across the water, and beside the beacon's beam rather than inside it
        s.scale.setScalar(2.8);
        s.position.set(2.4, PEDESTAL_TOP + 3.2, 0);
        s.renderOrder = 5;
        pt.world.group.add(s);
        halves.set(pt, s);
      }
      if (halves.has(pt)) halves.get(pt).visible = half;
    }
  }

  const arch = {
    chapter, api, group: root, parts, tries, growMs: ms, // (how many goes the layout took: 31 or more means it had to make do)
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
        for (const b of k.world.colliders) api.colliders.push(boxIn(k, b, k.p.x - A.x, k.p.z - A.z));
        api.blockers.push(...k.world.blockers);
      }
      activeTops = pt.world.tops.map(t => ({ ...t, box: boxIn(pt, t.box, 0, 0) }));
      root.updateMatrixWorld(true);
      dress();
      return old.sub(A);
    },
    refresh: dress,
    // the figure on `level`'s island is finished: wash its island with colour
    bloom(level) {
      const pt = parts.find(p => p.level === level);
      if (!pt) return;
      pt.wash.x = pt.wash.y; pt.wash.y = 1; pt.wash.z = 0; pt.wash.w = 1; pt.washT = 0;
    },
    // the open figure island under the player (well inside its shore), if any
    partAt(x, z) {
      const ax = x + A.x, az = z + A.z;
      return parts.find(p => p.open && p.world.walkSd(...toLocal(p, ax, az)) < -0.8) || null;
    },
    // the round landings where bridges meet (scene positions)
    landings() { return landings.map(n => new THREE.Vector3(n.x - A.x, 0, n.z - A.z)); },
    // the end of the straight run out of a figure's island, where its bridge may start to turn (scene position)
    leadOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.entry.x + pt.leadDir[0] * LEAD - A.x, 0, pt.entry.z + pt.leadDir[1] * LEAD - A.z) : null; },
    // where you stand on a figure's island when you start there: d along its way in, facing the pedestal (scene)
    spawnOf(level, d) {
      const pt = parts.find(p => p.level === level), [x, z] = toWorld(pt, 0, d);
      return { x: x - A.x, z: z - A.z, yaw: pt.spin };
    },
    // is (x, z) on the active figure's island (bridges excluded)?
    onActive(x, z) { return active.world.walkSd(...mine(x, z)) < 0.2 && bridgeSd(x + A.x, z + A.z) > 0.05; },
    offsetOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.p.x - A.x, 0, pt.p.z - A.z) : null; },
    // scene positions: where you arrive by portal, an island's bridge entry, the portal itself
    arrival() { const pz = hubWorld.portal?.z ?? 4; return { x: hub.p.x - A.x, z: hub.p.z + pz - 2.6 - A.z, yaw: 0 }; },
    entryOf(level) { const pt = parts.find(p => p.level === level); return pt ? new THREE.Vector3(pt.entry.x + pt.leadDir[0] * 1.5 - A.x, DECK + 1, pt.entry.z + pt.leadDir[1] * 1.5 - A.z) : null; },
    // the way along the bridges from a figure's island (a level) or the portal's middle island ('portal') to another
    // figure's island or the portal: from 1.5 m out from its shore to 1.5 m short of the other's, as points along
    // the way (closer together round the bends; scene positions on the ground)
    routeFrom(level, to) {
      const at = l => (l === 'portal' ? hubNode : parts.find(p => p.level === l)?.node);
      const a = at(level), b = at(to);
      if (!a || !b || a === b) return [];
      let pts = wayBetween(a, b);
      if (!pts.length) return [];
      const L = arcLen(pts);
      pts = along(pts, a.island ? 2.3 : 0, b.island ? L - 2.3 : L);
      return simplify(pts, 0.4).map(([x, z]) => new THREE.Vector3(x - A.x, 0, z - A.z));
    },
    portalPos() { const pz = hubWorld.portal?.z ?? 4; return new THREE.Vector3(hub.p.x - A.x, 1.8, hub.p.z + pz - A.z); },
    atPortal(x, z) { const p = arch.portalPos(); return Math.hypot(x - p.x, z - p.z) < 1.3; },
    // a locked bridge's gate you're pressing against
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
      for (const pt of parts) if (pt.shut && Math.hypot(x + A.x - pt.doorPos.x, z + A.z - pt.doorPos.z) < 2) return pt;
      return null;
    },
    lockedGateAt(x, z) {
      for (const pt of parts) if (!pt.open && Math.hypot(x + A.x - pt.gatePos.x, z + A.z - pt.gatePos.z) < 2.2) return pt;
      return null;
    },
  };
  return arch;
}
