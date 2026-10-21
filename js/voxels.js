import * as THREE from 'three';
import { toonGradient } from './render.js';

export const S = 0.6; // voxel edge length in metres
export const INK = '#2a1f3d';
// 20x20 tiles: tile 0 is the blank face, tiles 1..399 are numbers (figures up to 400 blocks).
const CELL = 102.4, GRID = 20; // 20 x 102.4 = 2048: a power of two, so WebGL1 devices keep full resolution
export const ATLAS_CELLS = GRID * GRID;
const FACE_CREAM = 0xfff1d6;
const FACE_BLANK = 0xe9dfcf;

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
  cv.width = cv.height = Math.round(CELL * GRID);
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
  tex.userData.shared = true; // world.dispose() leaves it alone
  atlas = { canvas: cv, texture: tex };
  return atlas;
}

// Puzzler mode: one shared per-level atlas = the number atlas plus "sum" tiles drawn into spare cells.
// tiles: [{ cell, text }]. Reused between levels so it costs exactly one extra texture.
let puzzleAtlas = null;
export function getPuzzleAtlas(renderer, tiles) {
  const base = getAtlas(renderer);
  if (!puzzleAtlas) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(CELL * GRID);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = base.texture.anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    puzzleAtlas = { canvas: cv, texture: tex };
  }
  const g = puzzleAtlas.canvas.getContext('2d');
  g.drawImage(base.canvas, 0, 0);
  const k = CELL / 128; // artwork was designed on a 128px tile
  for (const t of tiles) {
    const x0 = (t.cell % GRID) * CELL, y0 = Math.floor(t.cell / GRID) * CELL;
    g.fillStyle = '#d6d0c6';
    g.fillRect(x0, y0, CELL, CELL);
    g.fillStyle = '#ffffff';
    roundRect(g, x0 + 7 * k, y0 + 7 * k, CELL - 14 * k, CELL - 14 * k, 14 * k);
    g.fill();
    // a "ticket" instead of the round socket ring, so sums read differently from plain numbers
    g.fillStyle = '#efe6ff';
    roundRect(g, x0 + 12 * k, y0 + 30 * k, CELL - 24 * k, 68 * k, 18 * k);
    g.fill();
    g.lineWidth = 6 * k;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 46 * k;
    do { g.font = `700 ${size}px Fredoka, "Arial Rounded MT Bold", sans-serif`; size -= 2 * k; } while (size > 20 * k && g.measureText(t.text).width > CELL - 36 * k);
    g.fillText(t.text, x0 + CELL / 2, y0 + CELL / 2 + 2 * k);
    // orientation bar (sums can contain 6s and 9s)
    g.fillRect(x0 + CELL / 2 - 14 * k, y0 + 104 * k, 28 * k, 6 * k);
  }
  puzzleAtlas.texture.needsUpdate = true;
  return puzzleAtlas;
}

// A small sum/difference/product that equals k, e.g. 7 -> "3+4", 12 -> "15−3", 20 -> "4×5".
export function sumFor(k, rng) {
  const ops = [];
  if (k >= 3) ops.push(() => { const a = 1 + Math.floor(rng() * (k - 1)); return `${a}+${k - a}`; });
  ops.push(() => { const d = 1 + Math.floor(rng() * (k < 20 ? 9 : 12)); return `${k + d}\u2212${d}`; });
  const fac = [];
  for (let a = 2; a <= 12; a++) if (k % a === 0 && k / a >= 2 && k / a <= 12) fac.push(a);
  if (fac.length) { const f = () => { const a = fac[Math.floor(rng() * fac.length)]; return `${a}\u00d7${k / a}`; }; ops.push(f, f); }
  return ops[Math.floor(rng() * ops.length)]();
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

// faces: array of 6 { type: 'color'|'num'|'blank', num, color, pattern }
export function buildVoxelGeometry(faces, size = S) {
  const pos = [], nor = [], uv = [], col = [], pat = [], idx = [];
  const c = new THREE.Color();
  const h = size / 2;
  const pad = 2 / (CELL * GRID);
  faces.forEach((f, d) => {
    const { n, u, v } = DIRS[d];
    const cell = f.cell ?? (f.type === 'num' ? f.num : 0); // f.cell: explicit atlas cell (puzzler sums)
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
      pat.push(f.type === 'color' ? f.pattern || 0 : 0);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  geo.setIndex(idx);
  return geo;
}

// A whole figure (expanded cells) as one plain-coloured mesh: only the outside faces, one draw call.
export function mergeFigure(cells) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const has = new Set(cells.map(c => key(c.ix, c.iy, c.iz)));
  const pos = [], nor = [], uv = [], col = [], pat = [], idx = [];
  for (const c of cells) {
    const open = DIRS.map(d => !has.has(key(c.ix + d.n[0], c.iy + d.n[1], c.iz + d.n[2])));
    if (!open.some(Boolean)) continue;
    const g = buildVoxelGeometry(open.map(() => ({ type: 'color', color: c.color, pattern: c.pattern })));
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, C = g.attributes.color.array, T = g.attributes.pattern.array;
    const ox = c.x * S, oy = c.iy * S + S / 2, oz = c.z * S;
    open.forEach((o, d) => {
      if (!o) return;
      const base = pos.length / 3;
      for (let v = d * 4; v < d * 4 + 4; v++) {
        pos.push(P[v * 3] + ox, P[v * 3 + 1] + oy, P[v * 3 + 2] + oz);
        nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        uv.push(U[v * 2], U[v * 2 + 1]);
        col.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
        pat.push(T[v]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// Patterned colour faces (see PATTERN in levels.js): light dots, dark spots or a glassy shine,
// drawn from the face's own position in its texture tile (tiles per uv unit) so they line up on every face.
export const patternGlsl = (tiles = GRID) => `
  if (vPat > 0.5) {
    vec2 tq = fract(vMapUv * ${tiles.toFixed(1)});
    if (vPat < 2.5) {
      float d = min(min(length(tq - vec2(0.3, 0.3)), length(tq - vec2(0.72, 0.42))), min(length(tq - vec2(0.38, 0.74)), length(tq - vec2(0.76, 0.8))));
      float m = 1.0 - smoothstep(0.095, 0.115, d);
      diffuseColor.rgb = mix(diffuseColor.rgb, vPat < 1.5 ? vec3(1.0, 0.97, 0.9) : vec3(0.17, 0.13, 0.23), m);
    } else {
      float s = smoothstep(0.07, 0.0, abs(tq.x - tq.y * 0.6 - 0.18)) + 0.7 * smoothstep(0.045, 0.0, abs(tq.x - tq.y * 0.6 - 0.36));
      s *= step(0.12, tq.y) * step(tq.y, 0.88);
      diffuseColor.rgb = mix(min(diffuseColor.rgb * 1.15 + 0.04, vec3(1.0)), vec3(1.0), clamp(s, 0.0, 1.0) * 0.8);
    }
  }`;
export function patternPatch(sh) {
  sh.vertexShader = 'attribute float pattern;\nvarying float vPat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPat = pattern;');
  sh.fragmentShader = 'varying float vPat;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>${patternGlsl()}`);
}
// the same patterns on a material whose map covers each face once (the workshop's blocks)
export function fixedPatternPatch(material, pattern) {
  if (!pattern) return material;
  material.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n  float vPat = ${pattern.toFixed(1)};${patternGlsl(1)}`);
  };
  material.customProgramCacheKey = () => `vx-fixed-pattern-${pattern}`;
  return material;
}

export function voxelMaterial(renderer) {
  const m = new THREE.MeshToonMaterial({
    map: getAtlas(renderer).texture, vertexColors: true, gradientMap: toonGradient(),
  });
  m.onBeforeCompile = patternPatch;
  m.customProgramCacheKey = () => 'vx-voxel-pattern';
  return m;
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
      if (j === undefined) out.push({ type: 'color', color: c.color, pattern: c.pattern });
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
