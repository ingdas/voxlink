import * as THREE from 'three';
import { toon, LAYER_FX, LAYER_OVERLAY } from './render.js';
import { Batch, GEO, contours, topGeometry, wallGeometry, projectInside, sharedDot } from './world-kit.js';
import { buildSky } from './world-sky.js';
import { LAYOUTS } from './world-layouts.js';

export { dotTexture } from './world-kit.js';

export const PEDESTAL_TOP = 0.5;

// Theme colours + per-world flavour. `layout` picks the island generator in world-layouts.js.
export const THEMES = {
  meadow: {
    layout: 'meadow',
    grass: 0x8fdc6a, cap: 0xa6e57a, cliff: 0xe0a877, dirt: 0xc98a5e, water: 0x4cc3ec, foam: 0xffffff,
    skyTop: 0x4aa6ff, skyHorizon: 0xdff2ff, fogDensity: 0.0075,
    sky: { sunDir: [-0.42, 0.72, 0.55], sunSize: 0.0016, sunGlow: 0.22, sunCol: 0xfffbea },
    sun: [0xfff4e0, 2.2], sunPos: [-14, 24, 18], hemi: [0xd2e6ff, 0xc9a98a, 1.35],
    trees: 'round', leaves: [0x5fd068, 0x7bd957, 0x46c07a, 0xa3e05c], trunk: 0x9a6b4f,
    rock: 0xc7c1d6, rockShape: 'rock', tuft: 0x6cc957, flowers: [0xff5d5d, 0xffd23f, 0xff8fc7, 0xffffff, 0x9b5de5],
    pedestal: [0xd9c49c, 0xf0e2c4, 0xffd23f], particles: 'pollen', clouds: 0xffffff, step: 'grass',
  },
  frost: {
    layout: 'frost',
    grass: 0xf2f6ff, cap: 0xffffff, cliff: 0x9fb8dc, dirt: 0x86a2cc, water: 0x2f6fb8, foam: 0xe8f4ff,
    skyTop: 0x2e3f8a, skyHorizon: 0xdbe6ff, fogDensity: 0.0085,
    sky: { aurora: 0.9, aur1: 0x4dffb0, aur2: 0xd08bff, sunDir: [-0.5, 0.12, -0.86], sunSize: 0, sunGlow: 0.35, sunCol: 0xfff0f6 },
    sun: [0xfff6fb, 1.9], sunPos: [-16, 14, -22], hemi: [0xdde8ff, 0x9fb3cc, 1.6],
    trees: 'pine', leaves: [0x2f8f6b, 0x3a9d78, 0x2a7f66], trunk: 0x7a5a48,
    rock: 0xbfe8ff, rockShape: 'ice', tuft: 0xd5e4f7, flowers: [0xbfe8ff, 0xffffff],
    ice: 0x9ad8ff, iceSide: 0x5aaee6,
    pedestal: [0xb7c8e4, 0xdfe8f6, 0x4cc9f0], particles: 'snow', clouds: 0xf4f6ff, step: 'snow',
  },
  reef: {
    layout: 'reef',
    grass: 0xf6d898, cap: 0x9edb6a, cliff: 0xe7a46a, dirt: 0xd08a58, water: 0x2bb3c9, foam: 0xfff6e8,
    skyTop: 0x5b3fb8, skyHorizon: 0xffa866, fogDensity: 0.008,
    sky: { sunDir: [-0.36, 0.065, -0.93], sunSize: 0.0055, sunGlow: 0.55, sunCol: 0xffd884, low: 0xff8a6a },
    sun: [0xffc890, 2.3], sunPos: [-9, 7, -24], hemi: [0xffd6e8, 0xc98a6a, 1.45],
    trees: 'palm', leaves: [0x4fbf5a, 0x66cc55, 0x3fae63], trunk: 0xb07a50,
    rock: 0xff9eb8, rockShape: 'coral', tuft: 0xc6b36a, flowers: [0xff8fc7, 0xffffff, 0xffd23f],
    lagoon: 0x3fe6d4, lagoonDeep: 0x1fb8c0,
    pedestal: [0xe2b98a, 0xf5dcb4, 0xff6b6b], particles: null, clouds: 0xffd0e0, step: 'sand',
  },
  starfall: {
    layout: 'starfall',
    grass: 0x6fbf98, cap: 0x8ad3ad, cliff: 0x8a7bc0, dirt: 0x6c5fa0, water: 0x3b4fa8, foam: 0xc9d4ff,
    skyTop: 0x110d38, skyHorizon: 0x7a4fb0, fogDensity: 0.0055,
    sky: { moon: true, cloudSea: { y: -34, a: 0x6a4fa8, b: 0xe7b6ef }, low: 0xc98fd8, sunDir: [-0.6, 0.29, -0.72], sunGlow: 0.0, sunSize: 0 },
    sun: [0xdce2ff, 1.75], sunPos: [-14, 20, -17], hemi: [0xa9b4ff, 0x5a4a7a, 1.5],
    trees: 'crystal', leaves: [0x6ee7ff, 0xff9ee8, 0xb693f5], trunk: 0x6c5fa0,
    rock: 0x9d8fd0, rockShape: 'rock', tuft: 0x5aa883, flowers: [0x6ee7ff, 0xffe066, 0xff9ee8],
    pedestal: [0x8f80c4, 0xbdb1e6, 0xffd23f], particles: 'fireflies', stars: true, clouds: 0xc9b8f0, step: 'grass',
  },
  storm: {
    layout: 'storm',
    grass: 0x6f8c62, cap: 0x86a374, cliff: 0x5d5878, dirt: 0x58547a, water: 0x24405e, foam: 0xb8c8e0,
    skyTop: 0x1c2140, skyHorizon: 0x6f7899, fogDensity: 0.0125,
    sky: { vortex: true, sunSize: 0, sunGlow: 0 },
    sun: [0xdfe6ff, 1.5], sunPos: [10, 26, -8], hemi: [0xb4c0e8, 0x4f4a66, 1.7],
    trees: 'bent', leaves: [0x557f4c, 0x648f58, 0x4a7346], trunk: 0x5c4a44,
    rock: 0x8f8aa8, rockShape: 'rock', tuft: 0x5f7d52, flowers: [0x9fb4ff, 0xffffff],
    stone: 0x9a96b4, stoneDark: 0x77728f, moss: 0x6fa58a,
    pedestal: [0x7b77a0, 0xaaa6c8, 0x4cc9f0], particles: 'rain', lightning: true, clouds: 0x8d94b8, step: 'stone',
  },
};

// plain: the classic round island (Kubo's Garden keeps its calm plaza)
export function buildWorld({ rng, radius: R, seed, quality, theme: themeId = 'meadow', difficulty = 0, clearR = 3.2, plain = false }) {
  const T = THEMES[themeId];
  const group = new THREE.Group();
  const colliders = [];
  const blockers = []; // meshes that block the interaction ray
  const updaters = [];
  const tops = []; // surfaces where blocks can rest: {box, y}
  const obstacles = []; // footprints {x, z, r} that loose blocks keep clear of
  const B = new Batch();
  const spawnZ = Math.min(R - 3, 9);

  const W = {
    T, themeId, rng, R, clearR, seed, difficulty, quality, group, B, colliders, blockers, tops, updaters, obstacles, spawnZ,
    bound: R + 1, hasSea: true, seaY: -1.7, wind: null, pads: [], gravityScale: 1, voidY: undefined,
    walkSd: null, floorAt: () => 0, surfaceAt: null, coastSd: null,
    cstep: 0.5,
    // axis-aligned collider (optionally a resting surface for blocks)
    box(x0, y0, z0, x1, y1, z1, { top = false, sound = null } = {}) {
      const b = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
      if (sound) b.sound = sound;
      colliders.push(b);
      if (top) tops.push({ box: b, y: y1 });
      return b;
    },
    spawnPath: (x, z, pad = 0) => Math.abs(x) < 2.5 + pad && z > 2 - pad && z < spawnZ + 2 + pad,
    nearCentre: (x, z, pad = 0) => Math.hypot(x, z) < Math.max(3.6, clearR + 1) + pad,
    // a collider footprint overlaps the disc (x, z, r) at height y
    blocked(x, z, r, y = 0, hgt = 1) {
      for (const b of colliders) {
        if (b.max.y <= y + 0.05 || b.min.y >= y + hgt) continue;
        if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
      }
      return false;
    },
    crowded(x, z, r) { return obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r); },
    flatAt(x, z, r, tol = 0.06) {
      const f = W.floorAt(x, z);
      if (f === null) return null;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7]]) {
        const g = W.floorAt(x + dx, z + dz);
        if (g === null || Math.abs(g - f) > tol) return null;
      }
      return f;
    },
    // a random point in the bounding disc that passes test(x, z)
    sample(test, tries = 60) {
      for (let i = 0; i < tries; i++) {
        const th = rng() * Math.PI * 2, r = Math.sqrt(rng()) * W.bound;
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        if (test(x, z)) return { x, z };
      }
      return null;
    },
    // flat ground region at height y with a cartoon lip and cliff walls; hole cuts ponds/lagoons out of it
    ground(sd, o = {}) {
      const { y = 0, top, side, depth = 6, lip = 0.25, lipDepth = 0.35, hole = null, holeDepth = 0, holeColor = side,
        taper = 0, jag = 0, rect = null, cliffKind = 'ground', step = W.cstep } = o;
      const [x0, z0, x1, z1] = rect || [-W.bound - 3, -W.bound - 3, W.bound + 3, W.bound + 3];
      const C = f => contours(f, x0, z0, x1, z1, step);
      const topSd = hole ? (x, z) => Math.max(sd(x, z) - lip, -hole(x, z)) : (x, z) => sd(x, z) - lip;
      B.add(topGeometry(C(topSd), y), top, null, 'ground');
      if (lip > 0 && lipDepth > 0) B.add(wallGeometry(C((x, z) => sd(x, z) - lip), y, y - lipDepth), top, null, 'ground');
      if (depth > 0) B.add(wallGeometry(C((x, z) => sd(x, z) + 0.05), y - (lip > 0 ? lipDepth - 0.05 : 0), y - depth, taper, jag, rng), side, null, cliffKind);
      // rim walls only: the hole loops of (land minus hole) run the other way round
      if (hole && holeDepth > 0) B.add(wallGeometry(C((x, z) => Math.max(-hole(x, z), sd(x, z))).filter(l => THREE.ShapeUtils.area(l) > 0), y + 0.001, y - holeDepth), holeColor, null, 'ground');
    },
  };

  const layoutId = plain ? 'classic' : T.layout || 'classic';
  LAYOUTS[layoutId](W);
  const walkSd = W.walkSd;
  const coastSd = W.coastSd || walkSd;
  const floorAt = W.floorAt;
  const voidWorld = W.voidY !== undefined;

  // --- Sky ---
  const { sky, uniforms: skyU, vortex } = buildSky(T, rng, group, updaters);

  // --- Water + foam ---
  let water = null;
  if (W.hasSea && T.water != null) {
    water = new THREE.Mesh(new THREE.CircleGeometry(900, 64), toon(T.water));
    water.rotation.x = -Math.PI / 2;
    water.position.y = W.seaY;
    water.receiveShadow = true;
    group.add(water);
    const Bn = W.bound + 4;
    const band = (x, z) => { const s = coastSd(x, z); return Math.max(s - 1.3, -0.2 - s); };
    const foamGeo = topGeometry(contours(band, -Bn, -Bn, Bn, Bn, 0.6), 0);
    const foam = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({ color: T.foam, transparent: true, opacity: 0.85 }));
    foam.position.y = W.seaY + 0.04;
    foam.layers.set(LAYER_FX);
    group.add(foam);
    updaters.push((dt, t) => {
      const s = 1 + Math.sin(t * 1.3) * 0.006;
      foam.scale.set(s, 1, s);
      foam.material.opacity = 0.7 + Math.sin(t * 1.3) * 0.15;
    });
  }

  // --- Pedestal ---
  const [pc1, pc2, pc3] = T.pedestal;
  B.put(GEO.box(), pc1, 0, 0.125, 0, { sx: 5.2, sy: 0.25, sz: 5.2 });
  B.put(GEO.box(), pc2, 0, 0.375, 0, { sx: 4.2, sy: 0.25, sz: 4.2 });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    B.put(GEO.box(), pc3, sx * 2.35, 0.25, sz * 2.35, { sx: 0.4, sy: 0.5, sz: 0.4 });
    W.box(sx * 2.35 - 0.2, 0, sz * 2.35 - 0.2, sx * 2.35 + 0.2, 0.5, sz * 2.35 + 0.2);
  }
  W.box(-2.6, 0, -2.6, 2.6, 0.25, 2.6, { sound: 'stone' });
  W.box(-2.1, 0, -2.1, 2.1, 0.5, 2.1, { sound: 'stone' });

  // --- Grass tufts & flowers (instanced, no outlines, sway in the wind) ---
  const swayU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uSway: { value: W.sway ?? 1 } };
  const swayMat = (c) => {
    const m = toon(c);
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, swayU);
      sh.vertexShader = 'uniform float uTime; uniform vec2 uWind; uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = ip.x * 0.45 + ip.z * 0.33;
        float k = max(transformed.y, 0.0);
        transformed.x += (sin(uTime * 2.1 + ph) * 0.05 * uSway + uWind.x * 0.18) * k;
        transformed.z += (cos(uTime * 1.7 + ph) * 0.05 * uSway + uWind.y * 0.18) * k;
        #endif`);
    };
    m.customProgramCacheKey = () => 'vx-sway';
    return m;
  };
  const tuftCount = Math.round((quality === 'low' ? 170 : 400) * (W.tuftScale ?? 1));
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.32, 4);
  tuftGeo.translate(0, 0.16, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, swayMat(T.tuft), Math.max(1, tuftCount));
  const flowerGeo = new THREE.IcosahedronGeometry(0.065, 0);
  const nFlowers = Math.max(1, Math.floor(tuftCount / 3) + (W.extraFlowers?.length || 0));
  const flowers = new THREE.InstancedMesh(flowerGeo, swayMat(0xffffff), nFlowers);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler();
    const col = new THREE.Color();
    let ti = 0, fi = 0;
    const groundOk = (x, z) => {
      if (Math.hypot(x, z) < 3.4 || walkSd(x, z) > -0.4) return null;
      if (W.noTuft?.(x, z)) return null;
      const f = floorAt(x, z);
      if (f === null || f < -0.06) return null;
      if (W.blocked(x, z, 0.08, f, 0.4)) return null;
      return f;
    };
    for (let i = 0; i < tuftCount * 4 && (ti < tuftCount || fi < nFlowers); i++) {
      const th = rng() * Math.PI * 2, r = Math.sqrt(rng()) * W.bound;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const f = groundOk(x, z);
      if (f === null) continue;
      if (ti < tuftCount) {
        for (let k = 0; k < 3 && ti < tuftCount; k++) {
          q.setFromEuler(eu.set((rng() - 0.5) * 0.6, rng() * 6, (rng() - 0.5) * 0.6));
          const s = 0.6 + rng() * 0.7;
          m.compose(p.set(x + (rng() - 0.5) * 0.25, f, z + (rng() - 0.5) * 0.25), q, sc.set(s, s, s));
          tufts.setMatrixAt(ti++, m);
        }
      } else if (fi < nFlowers - (W.extraFlowers?.length || 0)) {
        m.compose(p.set(x, f + 0.09, z), q.identity(), sc.set(1, 1, 1));
        flowers.setMatrixAt(fi, m);
        flowers.setColorAt(fi++, col.setHex(T.flowers[Math.floor(rng() * T.flowers.length)]));
      }
    }
    // flower beds requested by the layout
    for (const e of W.extraFlowers || []) {
      if (fi >= nFlowers) break;
      m.compose(p.set(e.x, e.y + 0.09, e.z), q.identity(), sc.setScalar(e.s || 1.2));
      flowers.setMatrixAt(fi, m);
      flowers.setColorAt(fi++, col.setHex(e.c));
    }
    tufts.count = ti; flowers.count = fi;
  }
  tufts.layers.set(LAYER_FX); flowers.layers.set(LAYER_FX);
  tufts.receiveShadow = flowers.receiveShadow = true;
  group.add(tufts, flowers);
  updaters.push((dt, t) => {
    swayU.uTime.value = t;
    if (W.wind) swayU.uWind.value.set(W.wind.x, W.wind.z);
  });

  // --- Clouds: one instanced mesh in a slowly turning ring ---
  const nClouds = W.clouds ?? 14;
  if (nClouds) {
    const cloudRing = new THREE.Group();
    const blobs = [];
    for (let i = 0; i < nClouds; i++) {
      const n = 3 + Math.floor(rng() * 3);
      const th = rng() * Math.PI * 2, r = (W.cloudR ?? 70) + rng() * 70;
      const cy = (W.cloudY ?? 16) + rng() * 22;
      const big = W.cloudScale ?? 1;
      for (let k = 0; k < n; k++) {
        const s = (2.2 + rng() * 2.2) * big;
        // lay the puffs out tangentially
        const off = (k - n / 2) * 2.6 * big + rng();
        const tx = -Math.sin(th), tz = Math.cos(th);
        blobs.push({ x: Math.cos(th) * r + tx * off, y: cy + rng() * 1.2 * big, z: Math.sin(th) * r + tz * off, sx: s * 1.2, sy: s * 0.8, sz: s });
      }
    }
    const cm = new THREE.InstancedMesh(GEO.blob(), toon(T.clouds ?? 0xffffff, { fog: false }), blobs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    blobs.forEach((b, i) => cm.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.sx, b.sy, b.sz))));
    cm.frustumCulled = false;
    cloudRing.add(cm);
    group.add(cloudRing);
    const spin = (W.cloudSpin ?? 0.006) * (rng() < 0.5 ? 1 : -1);
    updaters.push(dt => { cloudRing.rotation.y += spin * dt; });
  }

  // --- Ambient particles that follow the camera ---
  const particles = T.particles ? addParticles(T, rng, group, updaters, W) : null;
  W.extras?.forEach(f => f());

  B.build(group, blockers);

  sky.castShadow = sky.receiveShadow = false;

  // --- Lights ---
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  const sp = new THREE.Vector3(...T.sunPos).normalize().multiplyScalar(32);
  sun.position.copy(sp);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const sz = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  const ext = W.bound + 3;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 100 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);

  // storm: lightning flashes light up the sky; the game plays thunder via api.onFlash
  let flashT = 4 + rng() * 6, flash = 0, unflash = null;
  if (T.lightning) {
    const baseHemi = hemi.intensity, baseTop = skyU.top.value.clone(), baseHor = skyU.horizon.value.clone();
    unflash = () => {
      flash = 0;
      hemi.intensity = baseHemi;
      skyU.top.value.copy(baseTop);
      skyU.horizon.value.copy(baseHor);
      if (skyU.flash) skyU.flash.value = 0;
    };
    const white = new THREE.Color(0xeef2ff);
    updaters.push(dt => {
      if (api.calm) return; // a cutscene owns the sky
      flashT -= dt;
      if (flashT <= 0) { flash = 1; flashT = 7 + Math.random() * 10; api.onFlash?.(); }
      flash = Math.max(0, flash - dt * 3.5);
      const k = flash > 0.5 ? flash : flash * (0.6 + 0.4 * Math.sin(flash * 40));
      hemi.intensity = baseHemi * (1 + k * 1.6);
      skyU.top.value.copy(baseTop).lerp(white, k * 0.5);
      skyU.horizon.value.copy(baseHor).lerp(white, k * 0.7);
      if (skyU.flash) skyU.flash.value = k;
    });
  }

  // ---------- queries used by the game and the player ----------
  const isFreeGround = (x, z, margin) => {
    if (Math.hypot(x, z) < Math.max(3.6, clearR + 1)) return false;
    if (walkSd(x, z) > -1.2) return false;
    if (W.noBlocks?.(x, z)) return false;
    const f = W.flatAt(x, z, 0.55, 0.12);
    if (f === null) return false;
    if (W.crowded(x, z, 0.5)) return false;
    if (W.blocked(x, z, 0.45 + margin * 0.5, f, 1.0)) return false;
    return true;
  };
  const groundY = (x, z) => floorAt(x, z) ?? 0;
  const heightAt = (x, z, maxY = Infinity) => {
    let h = floorAt(x, z) ?? 0;
    for (const b of colliders) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y <= maxY + 0.01) h = Math.max(h, b.max.y);
    }
    return h;
  };
  // is there something to stand on at (x, z) at about height y?
  const supportAt = (x, z, y) => {
    const f = floorAt(x, z);
    if (f !== null && Math.abs(f - y) < 0.1 && walkSd(x, z) < 0) return true;
    for (const b of colliders) if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && Math.abs(b.max.y - y) < 0.1) return true;
    return false;
  };
  const tmpP = { x: 0, z: 0 };
  const api = {
    group, colliders, blockers, R: W.bound, tops, isFreeGround, heightAt, groundY, theme: T, themeId, onFlash: null, onGust: null,
    // handles for cutscenes that restyle the weather (calm: true stops the storm's own lightning)
    atmos: { sky: skyU, hemi, sun, particles, vortex, unflash }, calm: false,
    radiusAt: W.radiusAt || (() => W.bound),
    floorAt, walkSd, gravityScale: W.gravityScale, wind: W.wind, voidY: W.voidY, pads: W.pads,
    surfaceAt(x, z, y) {
      const f = floorAt(x, z);
      if (f !== null && y > f + 0.05) {
        for (const b of colliders) if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && Math.abs(b.max.y - y) < 0.06) return { friction: 1, slow: 1, sound: b.sound || W.topSound || 'stone' };
      }
      return W.surfaceAt?.(x, z, y) || { friction: 1, slow: 1, sound: T.step };
    },
    // keep the player on the islands; in a void world only at ground level (falls are rescued)
    clampPlayer(pos) {
      if (voidWorld) {
        if (pos.y > 0.05 || pos.y < -0.3) return;
        const s = walkSd(pos.x, pos.z);
        if (s > -0.45 && s < 1.2 && !supportAt(pos.x, pos.z, pos.y)) projectInside(walkSd, pos, 0.45);
        return;
      }
      if (walkSd(pos.x, pos.z) > -0.45) projectInside(walkSd, pos, 0.45);
    },
    // safe spot to come back to after a fall (well inside the ground, or the middle of a top)
    safeAt(x, z, y) {
      const r = 0.7;
      return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => supportAt(x + dx, z + dz, y));
    },
    padAt(x, z, y) {
      for (const p of W.pads) if (Math.abs(y - p.y) < 0.12 && Math.hypot(x - p.x, z - p.z) < p.r) return p;
      return null;
    },
    // where a dropped block lands: on supported ground near (x, z), never in the sea or the void
    dropPoint(x, z, maxY, px, pz) {
      tmpP.x = x; tmpP.z = z;
      const yRef = maxY - 0.6;
      if (voidWorld) {
        if (!supportAt(x, z, heightAt(x, z, maxY)) || walkSd(x, z) > -0.6 && heightAt(x, z, maxY) <= 0.01) {
          const onTop = heightAt(px, pz, maxY) > 0.01;
          if (onTop || walkSd(px, pz) > -0.6) { tmpP.x = px; tmpP.z = pz; } else projectInside(walkSd, tmpP, 0.8);
        }
      } else if (walkSd(x, z) > -0.8 && heightAt(x, z, maxY) <= Math.max(0, yRef) + 0.01) projectInside(walkSd, tmpP, 0.9);
      return { x: tmpP.x, y: heightAt(tmpP.x, tmpP.z, maxY), z: tmpP.z };
    },
    update(dt, t, cam) { for (const u of updaters) u(dt, t, cam, api); },
    dispose() {
      group.traverse(o => {
        if (o.isInstancedMesh) o.dispose(); // frees the instance matrix / colour buffers
        if (o.geometry && !o.isSprite && !o.geometry.userData.shared) o.geometry.dispose(); // sprites share one geometry
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { if (mm.map && !mm.map.userData.shared) mm.map.dispose(); mm.dispose(); });
      });
      sun.shadow.map?.dispose();
    },
  };
  return api;
}

function addParticles(T, rng, group, updaters, W) {
  const kind = T.particles;
  const rain = kind === 'rain';
  const n = kind === 'snow' ? 700 : rain ? 900 : kind === 'fireflies' ? 110 : 60;
  const span = kind === 'snow' ? 30 : 36;
  const pos = new Float32Array(n * 3), seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([(rng() - 0.5) * span, rng() * 14, (rng() - 0.5) * span], i * 3); seeds[i] = rng() * 100; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const color = kind === 'snow' ? 0xffffff : rain ? 0xc8d8ff : kind === 'fireflies' ? 0xffee88 : 0xfff4b0;
  const pm = new THREE.PointsMaterial({
    color, size: kind === 'snow' ? 0.13 : rain ? 0.07 : 0.16, opacity: rain ? 0.7 : 1, map: sharedDot(), transparent: true, depthWrite: false,
    blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, pm);
  pts.layers.set(LAYER_OVERLAY);
  pts.frustumCulled = false;
  group.add(pts);
  updaters.push((dt, t, cam) => {
    if (!cam) return;
    const a = g.attributes.position.array;
    const wx = W.wind ? W.wind.x : 0, wz = W.wind ? W.wind.z : 0;
    for (let i = 0; i < n; i++) {
      let x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      const s = seeds[i];
      if (rain) {
        y -= dt * (14 + (s % 1) * 4);
        x += dt * (1.5 + wx * 5); z += dt * wz * 5;
        if (y < cam.y - 6) y += 14;
      } else if (kind === 'snow') {
        y -= dt * (0.9 + (s % 1) * 0.6);
        x += Math.sin(t * 0.8 + s) * dt * 0.4;
        if (y < cam.y - 5) y += 14;
      } else {
        y += Math.sin(t * 0.9 + s) * dt * 0.3;
        x += Math.cos(t * 0.5 + s * 1.3) * dt * 0.4;
        z += Math.sin(t * 0.6 + s * 0.7) * dt * 0.4;
        y = Math.max(cam.y - 1.3, Math.min(cam.y + 4.5, y));
      }
      if (y > cam.y + 9) y -= 14;
      // wrap around the camera so particles are always nearby
      const h = span / 2;
      if (x - cam.x > h) x -= span; else if (x - cam.x < -h) x += span;
      if (z - cam.z > h) z -= span; else if (z - cam.z < -h) z += span;
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    g.attributes.position.needsUpdate = true;
    if (kind === 'fireflies') pm.opacity = 0.7 + 0.3 * Math.sin(t * 3);
  });
  return pts;
}

