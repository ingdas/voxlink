import * as THREE from 'three';
import { toonGradient } from './render.js';

export const S = 0.6; // voxel edge length in metres
export const INK = '#2a1f3d';
// 20x20 tiles: tile 0 is the blank face, tiles 1..399 are numbers (figures up to 400 blocks).
const CELL = 102, GRID = 20;
export const FACE_CREAM = 0xfff1d6;
export const FACE_BLANK = 0xe9dfcf;

// Face order: +x, -x, +y, -y, +z, -z. u/v give the upright text orientation per face.
export const DIRS = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
export const opposite = d => d ^ 1;

let atlas = null;
export function getAtlas(renderer) {
  if (atlas) return atlas;
  const cv = document.createElement('canvas');
  cv.width = cv.height = CELL * GRID;
  const g = cv.getContext('2d');
  const k = CELL / 128; // artwork was designed on a 128px tile
  for (let i = 0; i < GRID * GRID; i++) {
    const x0 = (i % GRID) * CELL, y0 = Math.floor(i / GRID) * CELL;
    g.fillStyle = '#d6d0c6';
    g.fillRect(x0, y0, CELL, CELL);
    g.fillStyle = '#ffffff';
    roundRect(g, x0 + 7 * k, y0 + 7 * k, CELL - 14 * k, CELL - 14 * k, 14 * k);
    g.fill();
    if (i === 0) continue;
    // socket ring
    g.lineWidth = 7 * k;
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(x0 + CELL / 2, y0 + CELL / 2, 42 * k, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const txt = String(i);
    g.font = `700 ${(txt.length > 2 ? 40 : txt.length > 1 ? 50 : 60) * k}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
    g.fillText(txt, x0 + CELL / 2, y0 + CELL / 2 + 3 * k);
    if (i === 6 || i === 9) g.fillRect(x0 + CELL / 2 - 12 * k, y0 + CELL / 2 + 25 * k, 24 * k, 6 * k);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = { canvas: cv, texture: tex };
  return atlas;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// faces: array of 6 { type: 'color'|'num'|'blank', num, color }
export function buildVoxelGeometry(faces, size = S) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const h = size / 2;
  const pad = 2 / (CELL * GRID);
  faces.forEach((f, d) => {
    const { n, u, v } = DIRS[d];
    const cell = f.type === 'num' ? f.num : 0;
    const cu = (cell % GRID) / GRID, cv = 1 - (Math.floor(cell / GRID) + 1) / GRID;
    const u0 = cu + pad, u1 = cu + 1 / GRID - pad, v0 = cv + pad, v1 = cv + 1 / GRID - pad;
    c.setHex(f.type === 'color' ? f.color : f.type === 'num' ? FACE_CREAM : FACE_BLANK);
    const base = pos.length / 3;
    const corners = [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
    for (const [a, b, tu, tv] of corners) {
      pos.push((n[0] + u[0] * a + v[0] * b) * h, (n[1] + u[1] * a + v[1] * b) * h, (n[2] + u[2] * a + v[2] * b) * h);
      nor.push(...n);
      uv.push(tu, tv);
      col.push(c.r, c.g, c.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

export function voxelMaterial(renderer) {
  return new THREE.MeshToonMaterial({
    map: getAtlas(renderer).texture, vertexColors: true, gradientMap: toonGradient(),
  });
}

// Build the link tree for a figure: random spanning tree from a root on the bottom layer.
export function generatePuzzle(cells, rng) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const map = new Map(cells.map((c, i) => [key(c.ix, c.iy, c.iz), i]));
  const nbr = (i, d) => {
    const c = cells[i], n = DIRS[d].n;
    return map.get(key(c.ix + n[0], c.iy + n[1], c.iz + n[2]));
  };
  // One root per separate patch of the bottom layer (each foot of a figure), up to 4,
  // so legs grow in parallel. Each root sits closest to its patch's centre.
  const bottom = cells.map((c, i) => i).filter(i => cells[i].iy === 0);
  const seen = new Set(), patches = [];
  for (const b of bottom) {
    if (seen.has(b)) continue;
    const patch = [], q = [b];
    seen.add(b);
    while (q.length) {
      const i = q.pop(); patch.push(i);
      for (const d of [0, 1, 4, 5]) { const j = nbr(i, d); if (j !== undefined && cells[j].iy === 0 && !seen.has(j)) { seen.add(j); q.push(j); } }
    }
    patches.push(patch);
  }
  patches.sort((a, b) => b.length - a.length);
  const roots = patches.slice(0, 4).map(patch => {
    const cx = patch.reduce((s, i) => s + cells[i].x, 0) / patch.length, cz = patch.reduce((s, i) => s + cells[i].z, 0) / patch.length;
    let r = patch[0], best = Infinity;
    for (const i of patch) { const sc = (cells[i].x - cx) ** 2 + (cells[i].z - cz) ** 2 + rng() * 0.01; if (sc < best) { best = sc; r = i; } }
    return r;
  });
  const root = roots[0];
  const parent = new Array(cells.length).fill(-1);
  const parentDir = new Array(cells.length).fill(-1);
  const inTree = new Set(roots);
  const frontier = [];
  const pushEdges = i => { for (let d = 0; d < 6; d++) { const j = nbr(i, d); if (j !== undefined && !inTree.has(j)) frontier.push([i, j, d]); } };
  roots.forEach(pushEdges);
  while (frontier.length) {
    const k = Math.floor(rng() * frontier.length);
    const [a, b, d] = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    if (inTree.has(b)) continue;
    inTree.add(b);
    parent[b] = a;
    parentDir[b] = opposite(d); // direction from b towards its parent
    pushEdges(b);
  }
  const nums = shuffle(Array.from({ length: cells.length - roots.length }, (_, i) => i + 1), rng);
  const edgeNum = new Array(cells.length).fill(0);
  let ni = 0;
  cells.forEach((_, i) => { if (parent[i] >= 0) edgeNum[i] = nums[ni++]; });
  const faces = cells.map((c, i) => {
    const out = [];
    for (let d = 0; d < 6; d++) {
      const j = nbr(i, d);
      if (j === undefined) out.push({ type: 'color', color: c.color });
      else if (parent[i] === j) out.push({ type: 'num', num: edgeNum[i] });
      else if (parent[j] === i) out.push({ type: 'num', num: edgeNum[j] });
      else out.push({ type: 'blank' });
    }
    return out;
  });
  const children = cells.map(() => []);
  parent.forEach((p, i) => { if (p >= 0) children[p].push(i); });
  return { root, roots, parent, parentDir, edgeNum, faces, children };
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The 24 axis-aligned rotations of a cube.
let ROTS = null;
export function cubeRotations() {
  if (ROTS) return ROTS;
  ROTS = [];
  const seen = new Set();
  const qs = [new THREE.Quaternion()];
  const steps = [
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  ];
  while (qs.length) {
    const q = qs.pop();
    const k = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]
      .map(v => v.applyQuaternion(q)).map(v => [v.x, v.y, v.z].map(Math.round).join(',')).join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    ROTS.push(q);
    for (const s of steps) qs.push(q.clone().multiply(s));
  }
  return ROTS;
}
