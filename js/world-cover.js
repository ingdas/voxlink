// Ground cover: clumps of grass and little flowers on every island. Instanced, un-outlined (LAYER_FX), swaying in
// the wind. Grass grows in thick patches and thins out between them, stands taller along the shore and gathers round
// the foot of trees and rocks; flowers come in drifts of one colour. Far islands draw only part of theirs.
import * as THREE from 'three';
import { toon, LAYER_FX } from './render.js';
import { seeded } from './world-kit.js';

// ---------- shapes ----------
// a clump of blades fanning out from one spot: each blade a tapering strip that bends outwards, dark at the foot and
// light at the tip (the colours multiply the clump's own)
function clumpGeo(rnd, { blades = 7, h = 0.34, w = 0.05, spread = 0.09, lean = 0.55 } = {}) {
  const pos = [], col = [], nor = [];
  const v = (x, y, z, s, nx, nz) => { pos.push(x, y, z); col.push(s * 0.92, s, s * 0.86); nor.push(nx * 0.3, 1, nz * 0.3); };
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rnd() * 0.9, r0 = spread * (0.3 + rnd() * 0.7);
    const ox = Math.cos(a), oz = Math.sin(a), tx = -oz, tz = ox;
    const bh = h * (0.6 + rnd() * 0.55), bw = w * (0.8 + rnd() * 0.5), bl = lean * (0.5 + rnd() * 0.9) * (i === 0 ? 0.15 : 1);
    const P = (t, side) => {
      const out = r0 + bl * bh * t * t, half = bw * (1 - t * 0.55) * side;
      return [ox * out + tx * half, bh * t, oz * out + tz * half];
    };
    const L0 = P(0, -1), R0 = P(0, 1), L1 = P(0.55, -1), R1 = P(0.55, 1), T = [ox * (r0 + bl * bh), bh, oz * (r0 + bl * bh)];
    for (const [p, s] of [[L0, 0.5], [R0, 0.5], [R1, 0.86], [L0, 0.5], [R1, 0.86], [L1, 0.86], [L1, 0.86], [R1, 0.86], [T, 1.14]]) v(p[0], p[1], p[2], s, ox, oz);
  }
  return geoOf(pos, nor, col);
}

// a flower: a stem with a leaf, and a head of petals round a yellow middle. Only the petals take the flower's own
// colour (the `tint` attribute); stem and middle keep theirs.
function flowerGeo(kind) {
  const pos = [], col = [], nor = [], tint = [];
  const tri = (a, b, c, color, t = 0, n = [0, 1, 0]) => { for (const p of [a, b, c]) { pos.push(...p); col.push(...color); nor.push(...n); tint.push(t); } };
  const stemC = [0.2, 0.48, 0.2], stemL = [0.3, 0.62, 0.26], H = 0.24;
  // stem: a thin three-sided post
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2, a1 = ((k + 1) / 3) * Math.PI * 2, r = 0.012;
    const A = [Math.cos(a0) * r, 0, Math.sin(a0) * r], B = [Math.cos(a1) * r, 0, Math.sin(a1) * r], C = [Math.cos(a1) * r * 0.6, H, Math.sin(a1) * r * 0.6], D = [Math.cos(a0) * r * 0.6, H, Math.sin(a0) * r * 0.6];
    tri(A, B, C, stemC); tri(A, C, D, stemL);
  }
  // two leaves low on the stem
  for (const s of [-1, 1]) tri([0, 0.03, 0], [s * 0.09, 0.1, 0.03], [s * 0.05, 0.05, -0.04], stemL);
  if (kind === 'daisy') {
    // six flat petals, tipped up a little, light at the tip
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), L = 0.085, w = 0.034;
      const base = [c * 0.012, H, s * 0.012], l = [c * L * 0.55 - s * w, H + 0.014, s * L * 0.55 + c * w], r = [c * L * 0.55 + s * w, H + 0.014, s * L * 0.55 - c * w], tip = [c * L, H + 0.03, s * L];
      tri(base, r, l, [0.86, 0.86, 0.86], 1); tri(l, r, tip, [1.08, 1.08, 1.08], 1);
    }
    // the middle: a low four-sided button
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2, a1 = ((k + 1) / 4) * Math.PI * 2, r = 0.026;
      tri([Math.cos(a0) * r, H + 0.012, Math.sin(a0) * r], [0, H + 0.04, 0], [Math.cos(a1) * r, H + 0.012, Math.sin(a1) * r], [1.0, 0.8, 0.22]);
    }
  } else {
    // a cup of four upright petals (a tulip, a bell)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4, c = Math.cos(a), s = Math.sin(a), w = 0.036, R = 0.03;
      const b0 = [c * 0.008, H - 0.005, s * 0.008], l = [c * R - s * w, H + 0.05, s * R + c * w], r = [c * R + s * w, H + 0.05, s * R - c * w], tip = [c * R * 1.25, H + 0.11, s * R * 1.25];
      tri(b0, r, l, [0.8, 0.8, 0.8], 1, [c * 0.5, 1, s * 0.5]); tri(l, r, tip, [1.1, 1.1, 1.1], 1, [c * 0.5, 1, s * 0.5]);
    }
  }
  const g = geoOf(pos, nor, col);
  g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 1));
  return g;
}

function geoOf(pos, nor, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// smooth value noise over the island (where the grass grows thick)
function patches(seed) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 17.3) * 43758.5453; return s - Math.floor(s); };
  return (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - ux) + h(i + 1, j) * ux) * (1 - uz) + (h(i, j + 1) * (1 - ux) + h(i + 1, j + 1) * ux) * uz;
  };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// how each kind of ground wears its cover: how thick, how tall, how many flowers
const STYLE = {
  grass: { density: 7, h: 1, flowers: 0.42, thin: 0.25 },
  stone: { density: 6, h: 1.05, flowers: 0.18, thin: 0.25 },
  // dry stalks through the snow, in sparse tufts
  snow: { density: 1.6, h: 1.5, flowers: 0.08, thin: 0.04, w: 0.7, blades: 5, blend: 0.15 },
  // dune grass: thin bunches, wide apart
  sand: { density: 1.4, h: 1.8, flowers: 0.06, thin: 0.03, w: 0.7, lean: 0.85, blend: 0.25 },
};

// W: the island builder (see buildWorld); swayU: the wind's uniforms, shared with whatever else sways
export function addGroundCover(W, { group, updaters, walkSd, floorAt, quality, swayU }) {
  const { T, seed } = W;
  const rnd = seeded(seed * 7919 + 23);
  const low = quality === 'low';
  const St = STYLE[T.step] || STYLE.grass;
  const scale = W.tuftScale ?? 1;
  const lush = patches(seed);

  const swayMat = (tinted = false) => {
    const m = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, swayU);
      let vs = `uniform float uTime; uniform vec2 uWind; uniform float uSway;${tinted ? ' attribute float tint;' : ''}\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = ip.x * 0.45 + ip.z * 0.33;
        float k = max(transformed.y, 0.0);
        // a slow roll of wind across the island on top of each clump's own sway
        float roll = sin(uTime * 0.9 + ip.x * 0.12 + ip.z * 0.09) * 0.5 + 0.5;
        transformed.x += (sin(uTime * 2.1 + ph) * (0.04 + 0.05 * roll) * uSway + uWind.x * 0.18) * k;
        transformed.z += (cos(uTime * 1.7 + ph) * (0.04 + 0.05 * roll) * uSway + uWind.y * 0.18) * k;
        #endif`);
      // only the petals take the instance's colour
      if (tinted) vs = vs.replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
        vColor.rgb = color.rgb * mix(vec3(1.0), instanceColor.rgb, tint);
        #endif`);
      sh.vertexShader = vs;
    };
    m.customProgramCacheKey = () => (tinted ? 'vx-sway-tint' : 'vx-sway');
    return m;
  };

  const groundOk = (x, z) => {
    if (Math.hypot(x, z) < 3.4 || walkSd(x, z) > -0.4) return null;
    if (W.noTuft?.(x, z)) return null;
    const f = floorAt(x, z);
    if (f === null || f < -0.06) return null;
    if (W.blocked(x, z, 0.08, f, 0.4)) return null;
    return f;
  };

  // ---- grass ----
  // Open ground wears a short carpet (loose blocks lie there: their numbers must stay easy to read); along the shore
  // and round the foot of trees and rocks, where no block ever lies, it stands tall.
  const area = Math.PI * W.bound * W.bound;
  const want = Math.round(area * St.density * (low ? 0.34 : 1) * scale);
  const geo = clumpGeo(seeded(seed + 5), { blades: low ? 5 : St.blades ?? 6, h: 0.3, w: 0.034 * (St.w ?? 1), spread: 0.08, lean: St.lean ?? 0.6 });
  const grass = new THREE.InstancedMesh(geo, swayMat(), Math.max(1, want));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  // the blades' tips come out close to the ground's own colour, their feet darker: thick grass reads as the ground
  // itself, with depth in it
  const blade = new THREE.Color(T.tuft).lerp(new THREE.Color(T.grass), St.blend ?? 0.6);
  let n = 0;
  const clump = (x, z, f, s, tall) => {
    if (n >= want) return;
    q.setFromAxisAngle(up, rnd() * 6.283);
    m.compose(p.set(x, f - 0.01, z), q, sc.set(s, s * (tall ? 1.0 + rnd() * 0.5 : 0.42 + rnd() * 0.25) * St.h, s));
    grass.setMatrixAt(n, m);
    // each clump its own shade of the world's grass: a little lighter and yellower, or darker and bluer
    const k = rnd() - 0.5;
    grass.setColorAt(n++, col.copy(blade).offsetHSL(-k * 0.03, 0, k * 0.07));
  };
  // the open ground first, then round the foot of trees and rocks (W.skirts): a far island's reduced share drops
  // those last ones first and keeps its patches
  const skirts = W.skirts || [];
  for (let i = 0; i < want * 3 && n < want * 0.8; i++) {
    const th = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * W.bound;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const f = groundOk(x, z);
    if (f === null) continue;
    const v = lush(x * 0.17, z * 0.17), sd = walkSd(x, z), edge = sd > -1.5;
    // thick in the patches, thin between them, always some along the shore
    if (rnd() > St.thin + (1 - St.thin) * smooth(0.38, 0.62, v) && !(edge && rnd() < 0.6)) continue;
    // the rim's grass leans out over the edge, taller the closer to it
    if (edge) clump(x, z, f, 0.95 + rnd() * 0.45, true);
    else clump(x, z, f, (0.7 + rnd() * 0.3) * (0.85 + v * 0.35), false);
  }
  for (const k of skirts) {
    const cnt = Math.round((low ? 4 : 10) * Math.min(2, k.r + 0.4) * scale * (St.density > 2 ? 1 : 0.5));
    for (let i = 0; i < cnt; i++) {
      const a = rnd() * 6.283, d = k.r * (0.8 + rnd() * 0.45), x = k.x + Math.cos(a) * d, z = k.z + Math.sin(a) * d;
      const f = groundOk(x, z);
      if (f !== null && Math.abs(f - (k.y ?? f)) < 0.05) clump(x, z, f, 0.9 + rnd() * 0.5, true);
    }
  }
  grass.count = n;

  // ---- flowers: drifts of one colour ----
  const extra = W.extraFlowers || [];
  const wantF = Math.round(area * St.flowers * (low ? 0.5 : 1) * Math.min(1, scale * 1.5));
  const kinds = ['daisy', 'cup'].map(k => {
    const im = new THREE.InstancedMesh(flowerGeo(k), swayMat(true), Math.max(1, wantF + extra.length));
    im.userData.n = 0;
    return im;
  });
  const flower = (im, x, y, z, s, c) => {
    q.setFromAxisAngle(up, rnd() * 6.283);
    m.compose(p.set(x, y, z), q, sc.set(s, s * (0.8 + rnd() * 0.5), s));
    im.setMatrixAt(im.userData.n, m);
    im.setColorAt(im.userData.n++, col.setHex(c));
  };
  let made = 0;
  for (let i = 0; i < wantF * 3 && made < wantF; i++) {
    const th = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * W.bound;
    const cx = Math.cos(th) * r, cz = Math.sin(th) * r;
    if (groundOk(cx, cz) === null) continue;
    const c = T.flowers[Math.floor(rnd() * T.flowers.length)], im = kinds[rnd() < 0.62 ? 0 : 1];
    const cnt = 3 + Math.floor(rnd() * 7), pr = 0.35 + rnd() * 0.75;
    for (let k = 0; k < cnt && made < wantF; k++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * pr, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const f = groundOk(x, z);
      if (f === null) continue;
      // now and then one of another colour among them
      flower(im, x, f, z, 0.95 + rnd() * 0.55, rnd() < 0.12 ? T.flowers[Math.floor(rnd() * T.flowers.length)] : c);
      made++;
    }
  }
  // flower beds asked for by the layout
  extra.forEach((e, i) => flower(kinds[i % 3 === 0 ? 1 : 0], e.x, e.y, e.z, (e.s || 1.2) * 0.85, e.c));

  const meshes = [grass, ...kinds];
  for (const im of meshes) {
    if (im !== grass) im.count = im.userData.n;
    im.userData.full = im.count;
    im.layers.set(LAYER_FX);
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }
  // mow(lines, w): take the cover off the ways across the island (a world's archipelago lays planks there)
  W.out.mow = (lines, w) => {
    const dist = (x, z, [x0, z0, x1, z1]) => {
      const vx = x1 - x0, vz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * vx + (z - z0) * vz) / (vx * vx + vz * vz || 1)));
      return Math.hypot(x - x0 - vx * t, z - z0 - vz * t);
    };
    const a = new THREE.Matrix4(), c = new THREE.Color();
    for (const im of meshes) {
      let cnt = im.userData.full;
      for (let i = cnt - 1; i >= 0; i--) {
        im.getMatrixAt(i, a);
        const x = a.elements[12], z = a.elements[14];
        if (!lines.some(l => dist(x, z, l) < w)) continue;
        // the last one takes its place
        cnt--;
        if (i !== cnt) { im.getMatrixAt(cnt, a); im.setMatrixAt(i, a); im.getColorAt(cnt, c); im.setColorAt(i, c); }
      }
      im.userData.full = im.count = cnt;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  };
  // an island you're not on draws less of its cover the farther it is (the clumps are in no order, so any share
  // of them is spread evenly)
  const near = W.bound + 14, far = W.bound + 60;
  updaters.push((dt, t, cam) => {
    if (!cam) return;
    const d = Math.hypot(cam.x, cam.z);
    const share = d < near ? 1 : Math.max(0.3, 1 - 0.7 * (d - near) / (far - near));
    for (const im of meshes) im.count = Math.ceil(im.userData.full * share);
  });
}
