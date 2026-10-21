// Small toolkit for building island worlds: merged static geometry, signed-distance shapes
// and marching-squares contours (flat ground tops with cliff walls for any 2D shape).
import * as THREE from 'three';
import { toon, LAYER_FX } from './render.js';

// ---------- signed distance helpers (negative = inside) ----------
// wobbly blob: radius varies with angle, like the classic island outline
export function sdBlob(cx, cz, r, seed, amp = 1) {
  const a = seed * 1.7, b = seed * 0.6;
  const rf = th => r * (1 + amp * (0.055 * Math.sin(3 * th + a) + 0.04 * Math.sin(5 * th + b) + 0.025 * Math.sin(8 * th + a * 2)));
  const f = (x, z) => { const dx = x - cx, dz = z - cz; return Math.hypot(dx, dz) - rf(Math.atan2(dz, dx)); };
  f.radiusAt = rf;
  return f;
}
export const sdBox = (cx, cz, hx, hz, round = 0) => (x, z) => {
  const qx = Math.abs(x - cx) - hx + round, qz = Math.abs(z - cz) - hz + round;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - round;
};
export const sdEllipse = (cx, cz, a, b) => (x, z) => {
  const dx = (x - cx) / a, dz = (z - cz) / b;
  return (Math.hypot(dx, dz) - 1) * Math.min(a, b);
};
export function sdCapsule(ax, az, bx, bz, r) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  return (x, z) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
    return Math.hypot(x - ax - vx * t, z - az - vz * t) - r;
  };
}
export const sdUnion = (...fs) => (x, z) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, z)); return d; };

// push a point back inside a region (keeps it at least `m` from the edge)
export function projectInside(sd, p, m) {
  for (let k = 0; k < 4; k++) {
    const s = sd(p.x, p.z);
    if (s <= -m) return;
    const e = 0.05;
    let gx = sd(p.x + e, p.z) - sd(p.x - e, p.z), gz = sd(p.x, p.z + e) - sd(p.x, p.z - e);
    const gl = Math.hypot(gx, gz) || 1;
    gx /= gl; gz /= gl;
    p.x -= gx * (s + m + 1e-3); p.z -= gz * (s + m + 1e-3);
  }
}

// ---------- marching squares ----------
// Closed loops (arrays of THREE.Vector2 in x,z) of the sd = 0 line, interior always on the left.
export function contours(sd, x0, z0, x1, z1, step = 0.5) {
  const nx = Math.ceil((x1 - x0) / step) + 2, nz = Math.ceil((z1 - z0) / step) + 2;
  x0 -= step; z0 -= step;
  const W = nx + 1;
  const v = new Float32Array(W * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let s = sd(x0 + i * step, z0 + j * step);
    if (i === 0 || j === 0 || i === nx || j === nz) s = Math.max(s, 0.01);
    if (Math.abs(s) < 1e-4) s = 1e-4;
    v[j * W + i] = s;
  }
  const pts = new Map(); // edge key -> point
  const pt = (key, ax, az, va, bx, bz, vb) => {
    if (!pts.has(key)) { const t = va / (va - vb); pts.set(key, new THREE.Vector2(ax + (bx - ax) * t, az + (bz - az) * t)); }
    return key;
  };
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const c0 = v[j * W + i], c1 = v[j * W + i + 1], c2 = v[(j + 1) * W + i + 1], c3 = v[(j + 1) * W + i];
    const idx = (c0 < 0 ? 1 : 0) | (c1 < 0 ? 2 : 0) | (c2 < 0 ? 4 : 0) | (c3 < 0 ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const X = x0 + i * step, Z = z0 + j * step;
    const e = [];
    if ((c0 < 0) !== (c1 < 0)) e[0] = pt((j * W + i) * 2, X, Z, c0, X + step, Z, c1);
    if ((c1 < 0) !== (c2 < 0)) e[1] = pt((j * W + i + 1) * 2 + 1, X + step, Z, c1, X + step, Z + step, c2);
    if ((c3 < 0) !== (c2 < 0)) e[2] = pt(((j + 1) * W + i) * 2, X, Z + step, c3, X + step, Z + step, c2);
    if ((c0 < 0) !== (c3 < 0)) e[3] = pt((j * W + i) * 2 + 1, X, Z, c0, X, Z + step, c3);
    if (idx === 5 || idx === 10) {
      const centre = (c0 + c1 + c2 + c3) / 4 < 0;
      // join the inside corners through the centre when the centre is inside
      if ((idx === 5) === centre) { link(e[0], e[1]); link(e[2], e[3]); } else { link(e[3], e[0]); link(e[1], e[2]); }
    } else {
      const ks = e.filter(k => k !== undefined);
      link(ks[0], ks[1]);
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur !== undefined && !used.has(cur)) {
      used.add(cur);
      loop.push(pts.get(cur));
      const nb = adj.get(cur);
      const next = nb[0] !== prev && !used.has(nb[0]) ? nb[0] : nb[1] !== prev && !used.has(nb[1]) ? nb[1] : undefined;
      prev = cur; cur = next;
    }
    if (loop.length < 3) continue;
    // orient: interior on the left of the direction of travel
    const a = loop[0], b = loop[1];
    const mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2;
    const dx = b.x - a.x, dz = b.y - a.y, dl = Math.hypot(dx, dz) || 1;
    // left of (dx,dz) in the x/z plane viewed from above (+y) with z pointing down-screen is (dz,-dx)
    const lx = dz / dl, lz = -dx / dl;
    if (sd(mx + lx * 0.02, mz + lz * 0.02) > sd(mx - lx * 0.02, mz - lz * 0.02)) loop.reverse();
    if (Math.abs(THREE.ShapeUtils.area(loop)) < 0.3) continue;
    loops.push(loop);
  }
  return loops;
}

// group loops into outer shapes with holes
function shapesOf(loops) {
  const outers = [], holes = [];
  for (const l of loops) (THREE.ShapeUtils.area(l) < 0 ? outers : holes).push(l);
  const res = outers.map(o => ({ outer: o, holes: [] }));
  for (const h of holes) {
    const p = h[0];
    const owner = res.find(r => pointInPoly(p, r.outer));
    if (owner) owner.holes.push(h);
  }
  return res;
}
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// flat top surface of a region at height y (non-indexed, normals up)
export function topGeometry(loops, y) {
  const pos = [];
  for (const s of shapesOf(loops)) {
    const all = s.outer.concat(...s.holes);
    const tris = THREE.ShapeUtils.triangulateShape(s.outer, s.holes);
    for (const t of tris) {
      const a = all[t[0]], b = all[t[1]], c = all[t[2]];
      // make it face up
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross > 0) pos.push(a.x, y, a.y, c.x, y, c.y, b.x, y, b.y);
      else pos.push(a.x, y, a.y, b.x, y, b.y, c.x, y, c.y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

// vertical walls along the loops from y0 (top) down to y1, smooth normals facing outwards.
// taper > 0 pulls the bottom edge inwards (rock undersides).
export function wallGeometry(loops, y0, y1, taper = 0, jag = 0, rng = Math.random) {
  const pos = [], nor = [];
  for (const l of loops) {
    const n = l.length;
    const nrm = [];
    for (let i = 0; i < n; i++) {
      const a = l[(i - 1 + n) % n], b = l[(i + 1) % n];
      // interior on the left: outward normal is the right side (-dz, dx) of travel
      let nx = -(b.y - a.y), nz = b.x - a.x;
      const len = Math.hypot(nx, nz) || 1;
      nrm.push([nx / len, nz / len]);
    }
    const bot = l.map((p, i) => {
      const j = jag ? (rng() - 0.5) * jag : 0;
      return [p.x - nrm[i][0] * (taper + j), p.y - nrm[i][1] * (taper + j)];
    });
    const ty = taper ? taper / (y0 - y1) : 0; // tilt normals for tapered walls
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const a = l[i], b = l[k];
      const A = [a.x, y0, a.y], B = [b.x, y0, b.y], C = [bot[k][0], y1, bot[k][1]], D = [bot[i][0], y1, bot[i][1]];
      const na = norm3(nrm[i][0], -ty, nrm[i][1]), nb = norm3(nrm[k][0], -ty, nrm[k][1]);
      pos.push(...A, ...D, ...B, ...B, ...D, ...C);
      nor.push(...na, ...na, ...nb, ...nb, ...na, ...nb);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ---------- merged static geometry ----------
// Everything added is baked into a few vertex-coloured meshes, split into spatial tiles so the
// interaction ray and frustum culling only touch nearby triangles.
const glowPatch = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.55;');
};
export class Batch {
  constructor(tile = 14) { this.tile = tile; this.parts = new Map(); this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._v = new THREE.Vector3(); }
  // kind: 'solid' (outlined, casts + receives shadows), 'ground' (outlined, receives only),
  //       'glow' (outlined, self-lit), 'fx' (no outline, receives shadows)
  add(geo, color, matrix = null, kind = 'solid') {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(this._v);
    const key = `${kind}|${Math.floor(c.x / this.tile)},${Math.floor(c.z / this.tile)}`;
    if (!this.parts.has(key)) this.parts.set(key, { kind, list: [] });
    this.parts.get(key).list.push({ g, color: this._c.set(color).clone() });
    return this;
  }
  // convenience: transform from position / rotation / scale
  put(geo, color, x, y, z, { sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, kind = 'solid' } = {}) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    this._m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    return this.add(geo, color, this._m, kind);
  }
  build(group, blockers) {
    const mats = {
      solid: toon(0xffffff, { vertexColors: true }),
      glow: toon(0xffffff, { vertexColors: true }),
      fx: toon(0xffffff, { vertexColors: true }),
    };
    mats.glow.onBeforeCompile = glowPatch;
    mats.glow.customProgramCacheKey = () => 'vx-glow';
    mats.ground = mats.solid;
    const meshes = [];
    for (const { kind, list } of this.parts.values()) {
      let n = 0;
      for (const p of list) n += p.g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
      let o = 0;
      for (const p of list) {
        const pa = p.g.attributes.position.array, na = p.g.attributes.normal?.array;
        pos.set(pa, o * 3);
        if (na) nor.set(na, o * 3);
        const cnt = p.g.attributes.position.count;
        for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = p.color.r; col[(o + i) * 3 + 1] = p.color.g; col[(o + i) * 3 + 2] = p.color.b; }
        o += cnt;
        p.g.dispose();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mats[kind]);
      m.castShadow = kind === 'solid' || kind === 'glow';
      m.receiveShadow = true;
      if (kind === 'fx') m.layers.set(LAYER_FX);
      else blockers.push(m);
      m.userData.static = true;
      group.add(m);
      meshes.push(m);
    }
    this.parts.clear();
    return meshes;
  }
}

// shared unit geometries for props (only their merged copies are disposed with the world group)
const cache = {};
const geo = (k, f) => cache[k] || (cache[k] = f(), cache[k].userData.shared = true, cache[k]);
export const GEO = {
  box: () => geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  blob: () => geo('blob', () => new THREE.IcosahedronGeometry(1, 1)),
  ico: () => geo('ico', () => new THREE.IcosahedronGeometry(1, 0)),
  rock: () => geo('rock', () => new THREE.DodecahedronGeometry(1, 0)),
  cyl: (n = 8) => geo('cyl' + n, () => new THREE.CylinderGeometry(1, 1, 1, n)),
  cone: (n = 7) => geo('cone' + n, () => new THREE.ConeGeometry(1, 1, n)),
  octa: () => geo('octa', () => new THREE.OctahedronGeometry(1, 0)),
  dome: () => geo('dome', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
};

// soft round sprite for particles: dotTexture() makes a fresh one (the caller disposes it),
// sharedDot() returns one cached copy that world.dispose() leaves alone
export function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let dot = null;
export function sharedDot() {
  if (!dot) { dot = dotTexture(); dot.userData.shared = true; }
  return dot;
}
