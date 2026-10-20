import * as THREE from 'three';
import { toon, LAYER_FX, LAYER_OVERLAY } from './render.js';

export const PEDESTAL_TOP = 0.5;

export const THEMES = {
  meadow: {
    grass: 0x8fdc6a, cap: 0xa6e57a, cliff: 0xe0a877, dirt: 0xc98a5e, water: 0x56c8e8, foam: 0xffffff,
    skyTop: 0x7cc4ff, skyHorizon: 0xffe3c4, fogDensity: 0.0085,
    sun: [0xfff2dd, 2.1], sunPos: [-14, 26, 10], hemi: [0xcfe0ff, 0xc9a98a, 1.35],
    trees: 'round', leaves: [0x5fd068, 0x7bd957, 0x46c07a, 0xa3e05c], trunk: 0x9a6b4f,
    rock: 0xc7c1d6, rockShape: 'rock', tuft: 0x6cc957, flowers: [0xff5d5d, 0xffd23f, 0xff8fc7, 0xffffff, 0x9b5de5],
    pedestal: [0xd9c49c, 0xf0e2c4, 0xffd23f], particles: 'pollen',
  },
  frost: {
    grass: 0xf2f6ff, cap: 0xffffff, cliff: 0x9fb8dc, dirt: 0x86a2cc, water: 0x3f8fd6, foam: 0xe8f4ff,
    skyTop: 0x8db6ff, skyHorizon: 0xeef3ff, fogDensity: 0.011,
    sun: [0xffffff, 1.9], sunPos: [-16, 22, 14], hemi: [0xdde8ff, 0x9fb3cc, 1.55],
    trees: 'pine', leaves: [0x2f8f6b, 0x3a9d78, 0x2a7f66], trunk: 0x7a5a48,
    rock: 0xbfe8ff, rockShape: 'ice', tuft: 0xd5e4f7, flowers: [0xbfe8ff, 0xffffff],
    pedestal: [0xb7c8e4, 0xdfe8f6, 0x4cc9f0], particles: 'snow',
  },
  reef: {
    grass: 0xf6d898, cap: 0x9edb6a, cliff: 0xe7a46a, dirt: 0xd08a58, water: 0x2fc9c0, foam: 0xfff6e8,
    skyTop: 0x8a74e0, skyHorizon: 0xffb27a, fogDensity: 0.0095,
    sun: [0xffcf9a, 2.2], sunPos: [-24, 14, -6], hemi: [0xffd6e8, 0xc98a6a, 1.3],
    trees: 'palm', leaves: [0x4fbf5a, 0x66cc55, 0x3fae63], trunk: 0xb07a50,
    rock: 0xff9eb8, rockShape: 'coral', tuft: 0xc6b36a, flowers: [0xff8fc7, 0xffffff, 0xffd23f],
    pedestal: [0xe2b98a, 0xf5dcb4, 0xff6b6b], particles: null,
  },
  starfall: {
    grass: 0x6fbf98, cap: 0x8ad3ad, cliff: 0x8a7bc0, dirt: 0x6c5fa0, water: 0x3b4fa8, foam: 0xc9d4ff,
    skyTop: 0x1f1d55, skyHorizon: 0xe08fd0, fogDensity: 0.0105,
    sun: [0xd2dcff, 1.7], sunPos: [12, 24, 12], hemi: [0xa9b4ff, 0x5a4a7a, 1.45],
    trees: 'crystal', leaves: [0x6ee7ff, 0xff9ee8, 0xb693f5], trunk: 0x6c5fa0,
    rock: 0x9d8fd0, rockShape: 'rock', tuft: 0x5aa883, flowers: [0x6ee7ff, 0xffe066, 0xff9ee8],
    pedestal: [0x8f80c4, 0xbdb1e6, 0xffd23f], particles: 'fireflies', stars: true,
  },
  storm: {
    grass: 0x5f9e86, cap: 0x76b39a, cliff: 0x6f6a8f, dirt: 0x58547a, water: 0x2e4d6e, foam: 0xb8c8e0,
    skyTop: 0x2c3354, skyHorizon: 0x8d94b8, fogDensity: 0.016,
    sun: [0xdfe6ff, 1.5], sunPos: [10, 26, -8], hemi: [0xb4c0e8, 0x4f4a66, 1.7],
    trees: 'round', leaves: [0x3f8f6e, 0x4c9a7a, 0x357a63], trunk: 0x5c4a44,
    rock: 0x8f8aa8, rockShape: 'rock', tuft: 0x4f8c74, flowers: [0x9fb4ff, 0xffffff],
    pedestal: [0x7b77a0, 0xaaa6c8, 0x4cc9f0], particles: 'rain', lightning: true,
  },
};

function islandRadiusFn(R, seed) {
  const a = seed * 1.7, b = seed * 0.6;
  return th => R * (1 + 0.055 * Math.sin(3 * th + a) + 0.04 * Math.sin(5 * th + b) + 0.025 * Math.sin(8 * th + a * 2));
}

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

export function buildWorld({ rng, radius: R, seed, quality, theme: themeId = 'meadow', difficulty = 0, clearR = 3.2 }) {
  const T = THEMES[themeId];
  const group = new THREE.Group();
  const colliders = [];
  const blockers = []; // meshes that block the interaction ray
  const updaters = [];
  const radiusAt = islandRadiusFn(R, seed);
  const mats = new Map();
  const mat = (c, extra) => { const k = c + JSON.stringify(extra || {}); if (!mats.has(k)) mats.set(k, toon(c, extra)); return mats.get(k); };

  // --- Sky dome ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(480, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(T.skyTop) }, horizon: { value: new THREE.Color(T.skyHorizon) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
        void main(){ float h = normalize(vP).y; float t = smoothstep(-0.02, 0.6, h);
        vec3 c = mix(horizon, top, t); gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        }`,
    }),
  );
  sky.layers.set(LAYER_FX);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  if (T.stars) {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2, y = 0.15 + rng() * 0.85;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 440, y * 440, Math.sin(th) * r * 440], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6d8, size: 3.2, sizeAttenuation: false, map: dotTexture(), transparent: true, depthWrite: false, fog: false }));
    stars.layers.set(LAYER_FX);
    stars.renderOrder = -9;
    group.add(stars);
    updaters.push((dt, t) => { stars.material.opacity = 0.75 + 0.25 * Math.sin(t * 0.7); });
  }

  // --- Island ---
  const ring = (rOff, close = true) => {
    const s = new THREE.Shape();
    const SEG = 72;
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const r = radiusAt(th) + rOff;
      if (i === 0) s.moveTo(Math.cos(th) * r, Math.sin(th) * r); else s.lineTo(Math.cos(th) * r, Math.sin(th) * r);
    }
    return s;
  };
  const grassGeo = new THREE.ExtrudeGeometry(ring(0.25), { depth: 0.35, bevelEnabled: false, curveSegments: 1 });
  grassGeo.rotateX(-Math.PI / 2);
  grassGeo.translate(0, -0.35, 0);
  const grass = new THREE.Mesh(grassGeo, mat(T.grass));
  group.add(grass);
  blockers.push(grass);

  const cliffGeo = new THREE.ExtrudeGeometry(ring(-0.05), { depth: 6, bevelEnabled: false, curveSegments: 1 });
  cliffGeo.rotateX(-Math.PI / 2);
  cliffGeo.translate(0, -6.3, 0);
  const cliff = new THREE.Mesh(cliffGeo, mat(T.cliff));
  group.add(cliff);

  // --- Water + foam ---
  const water = new THREE.Mesh(new THREE.CircleGeometry(900, 64), mat(T.water));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.7;
  water.receiveShadow = true;
  group.add(water);
  const foamShape = ring(1.3);
  const hole = new THREE.Path(ring(-0.2).getPoints());
  foamShape.holes.push(hole);
  const foam = new THREE.Mesh(new THREE.ShapeGeometry(foamShape), new THREE.MeshBasicMaterial({ color: T.foam, transparent: true, opacity: 0.85 }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -1.66;
  foam.layers.set(LAYER_FX);
  group.add(foam);
  updaters.push((dt, t) => {
    const s = 1 + Math.sin(t * 1.3) * 0.012;
    foam.scale.set(s, s, 1);
    foam.material.opacity = 0.7 + Math.sin(t * 1.3) * 0.15;
  });

  // --- Pedestal ---
  const [pc1, pc2, pc3] = T.pedestal;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 5.2), mat(pc1));
  t1.position.y = 0.125;
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 4.2), mat(pc2));
  t2.position.y = 0.375;
  group.add(t1, t2);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), mat(pc3));
    post.position.set(sx * 2.35, 0.25, sz * 2.35);
    group.add(post);
    colliders.push(new THREE.Box3().setFromCenterAndSize(post.position, new THREE.Vector3(0.4, 0.5, 0.4)));
  }
  blockers.push(t1, t2);
  colliders.push(new THREE.Box3(new THREE.Vector3(-2.6, 0, -2.6), new THREE.Vector3(2.6, 0.25, 2.6)));
  colliders.push(new THREE.Box3(new THREE.Vector3(-2.1, 0, -2.1), new THREE.Vector3(2.1, 0.5, 2.1)));

  // --- Plateaus (things to climb) ---
  const plateaus = [];
  const tops = []; // surfaces where blocks can rest: {box, y}
  const overlaps = (x, z, w, d, m) => plateaus.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + m && Math.abs(p.z - z) < (p.d + d) / 2 + m);
  const addBlock = (x, z, w, d, h, color, isTop = true) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.2, d), mat(color));
    body.position.set(x, (h - 0.2) / 2, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.2, d + 0.16), mat(T.cap));
    cap.position.set(x, h - 0.1, z);
    group.add(body, cap);
    blockers.push(body, cap);
    const box = new THREE.Box3(new THREE.Vector3(x - w / 2 - 0.08, 0, z - d / 2 - 0.08), new THREE.Vector3(x + w / 2 + 0.08, h, z + d / 2 + 0.08));
    colliders.push(box);
    plateaus.push({ x, z, w: w + 0.16, d: d + 0.16, h });
    if (isTop) tops.push({ box, y: h });
  };
  const nPlateaus = Math.round(4 + R * 0.25);
  let tries = 0, made = 0;
  while (made < nPlateaus && tries++ < 500) {
    const th = rng() * Math.PI * 2;
    const rMin = Math.max(6.5, clearR + 3.8);
    const r = rMin + rng() * (R - 4 - rMin);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const w = 2 + Math.round(rng() * 2) * 0.6, d = 2 + Math.round(rng() * 2) * 0.6;
    const roll = rng();
    const tier = roll < 0.4 ? 1 : roll < 0.85 - difficulty * 0.2 ? 2 : 3;
    if (overlaps(x, z, w + 3, d + 3, 1.2) || Math.hypot(x, z) + Math.max(w, d) > R - 2.5) continue;
    if (Math.abs(x) < 2.5 && z > 3) continue; // keep the spawn path open
    const ox = -Math.cos(th), oz = -Math.sin(th); // towards the centre
    if (tier === 1) addBlock(x, z, w, d, 0.9 + rng() * 0.3, T.cliff);
    else if (tier === 2) {
      const h = 2.0 + rng() * 0.4;
      addBlock(x, z, w, d, h, T.dirt);
      addBlock(x + ox * (w / 2 + 0.7), z + oz * (d / 2 + 0.7), 1.4, 1.4, h - 1.05, T.cliff);
    } else {
      const h = 3.1 + rng() * 0.3;
      addBlock(x, z, w, d, h, T.dirt);
      // a little staircase that winds around one side
      const px = -oz, pz = ox;
      addBlock(x + ox * (w / 2 + 0.7), z + oz * (d / 2 + 0.7), 1.4, 1.4, h - 1.05, T.cliff);
      addBlock(x + ox * (w / 2 + 0.7) + px * 1.6, z + oz * (d / 2 + 0.7) + pz * 1.6, 1.4, 1.4, h - 2.1, T.cliff);
    }
    made++;
  }

  // --- Trees ---
  const trees = [];
  const nTrees = Math.round(R * 0.7);
  tries = 0;
  while (trees.length < nTrees && tries++ < 300) {
    const th = rng() * Math.PI * 2;
    const r0 = Math.max(5.5, clearR + 2);
    const r = r0 + Math.sqrt(rng()) * (radiusAt(th) - 1.5 - r0);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (overlaps(x, z, 1.6, 1.6, 0.6) || trees.some(t => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    if (Math.abs(x) < 2.5 && z > 3) continue;
    const s = 0.8 + rng() * 0.5;
    const tree = makeTree(T, rng, s, mat, blockers);
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * Math.PI * 2;
    group.add(tree);
    trees.push({ x, z });
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.3 * s, 0, z - 0.3 * s), new THREE.Vector3(x + 0.3 * s, 3.5 * s, z + 0.3 * s)));
    const ph = rng() * 10;
    updaters.push((dt, t) => { tree.rotation.z = Math.sin(t * 1.1 + ph) * 0.012; });
  }

  // --- Rocks / ice / coral ---
  const rocks = [];
  tries = 0;
  while (rocks.length < Math.round(R * 0.4) && tries++ < 200) {
    const th = rng() * Math.PI * 2;
    const r = Math.max(5, clearR + 1.5) + rng() * (radiusAt(th) - 1 - Math.max(5, clearR + 1.5));
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (overlaps(x, z, 1.2, 1.2, 0.3) || trees.some(t => Math.hypot(t.x - x, t.z - z) < 1.8) || rocks.some(t => Math.hypot(t.x - x, t.z - z) < 2.5)) continue;
    const s = 0.35 + rng() * 0.45;
    const rock = makeRock(T, rng, s, mat);
    rock.position.set(x, 0, z);
    group.add(rock);
    rocks.push({ x, z, s });
    if (s > 0.55) colliders.push(new THREE.Box3(new THREE.Vector3(x - s, 0, z - s), new THREE.Vector3(x + s, s * 0.9, z + s)));
  }

  // --- Grass tufts & flowers (instanced, no outlines) ---
  const tuftCount = quality === 'low' ? 160 : 380;
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.32, 4);
  tuftGeo.translate(0, 0.16, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, toon(T.tuft), tuftCount);
  const flowerGeo = new THREE.IcosahedronGeometry(0.065, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, toon(0xffffff), Math.floor(tuftCount / 3));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler();
  const col = new THREE.Color();
  let ti = 0, fi = 0;
  for (let i = 0; i < tuftCount * 3 && (ti < tuftCount || fi < flowers.count); i++) {
    const th = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * (radiusAt(th) - 0.5);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (Math.hypot(x, z) < 3.4 || overlaps(x, z, 0, 0, 0.2)) continue;
    if (ti < tuftCount) {
      for (let k = 0; k < 3 && ti < tuftCount; k++) {
        q.setFromEuler(eu.set((rng() - 0.5) * 0.6, rng() * 6, (rng() - 0.5) * 0.6));
        const s = 0.6 + rng() * 0.7;
        m.compose(p.set(x + (rng() - 0.5) * 0.25, 0, z + (rng() - 0.5) * 0.25), q, sc.set(s, s, s));
        tufts.setMatrixAt(ti++, m);
      }
    } else if (fi < flowers.count) {
      m.compose(p.set(x, 0.09, z), q.identity(), sc.set(1, 1, 1));
      flowers.setMatrixAt(fi, m);
      flowers.setColorAt(fi++, col.setHex(T.flowers[Math.floor(rng() * T.flowers.length)]));
    }
  }
  tufts.count = ti; flowers.count = fi;
  tufts.layers.set(LAYER_FX); flowers.layers.set(LAYER_FX);
  group.add(tufts, flowers);

  // --- Clouds ---
  const cloudMat = toon(themeId === 'starfall' ? 0xc9b8f0 : themeId === 'reef' ? 0xffe0ec : 0xffffff, { fog: false });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(cloudGeo, cloudMat);
      const s = 2.2 + rng() * 2.2;
      b.scale.set(s * 1.2, s * 0.8, s);
      b.position.set((k - n / 2) * 2.6 + rng(), rng() * 1.2, (rng() - 0.5) * 2);
      c.add(b);
    }
    const th = rng() * Math.PI * 2, r = 70 + rng() * 70;
    c.position.set(Math.cos(th) * r, 16 + rng() * 22, Math.sin(th) * r);
    c.lookAt(0, c.position.y, 0);
    c.userData = { th, r, speed: (0.004 + rng() * 0.006) * (rng() < 0.5 ? 1 : -1) };
    clouds.push(c);
    group.add(c);
  }
  updaters.push(dt => {
    for (const c of clouds) {
      c.userData.th += c.userData.speed * dt;
      c.position.x = Math.cos(c.userData.th) * c.userData.r;
      c.position.z = Math.sin(c.userData.th) * c.userData.r;
    }
  });

  // --- Ambient particles that follow the camera ---
  if (T.particles) {
    const rain = T.particles === 'rain';
    const n = T.particles === 'snow' ? 700 : rain ? 900 : T.particles === 'fireflies' ? 90 : 60;
    const span = T.particles === 'snow' ? 30 : 36;
    const pos = new Float32Array(n * 3), seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([(rng() - 0.5) * span, rng() * 14, (rng() - 0.5) * span], i * 3); seeds[i] = rng() * 100; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = T.particles === 'snow' ? 0xffffff : rain ? 0xc8d8ff : T.particles === 'fireflies' ? 0xffee88 : 0xfff4b0;
    const pm = new THREE.PointsMaterial({
      color, size: T.particles === 'snow' ? 0.13 : rain ? 0.07 : 0.16, opacity: rain ? 0.7 : 1, map: dotTexture(), transparent: true, depthWrite: false,
      blending: T.particles === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, pm);
    pts.layers.set(LAYER_OVERLAY);
    pts.frustumCulled = false;
    group.add(pts);
    updaters.push((dt, t, cam) => {
      if (!cam) return;
      const a = g.attributes.position.array;
      for (let i = 0; i < n; i++) {
        let x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
        const s = seeds[i];
        if (rain) {
          y -= dt * (14 + (s % 1) * 4);
          x += dt * 1.5;
          if (y < 0) y += 14;
        } else if (T.particles === 'snow') {
          y -= dt * (0.9 + (s % 1) * 0.6);
          x += Math.sin(t * 0.8 + s) * dt * 0.4;
          if (y < 0) y += 14;
        } else {
          y += Math.sin(t * 0.9 + s) * dt * 0.3;
          x += Math.cos(t * 0.5 + s * 1.3) * dt * 0.4;
          z += Math.sin(t * 0.6 + s * 0.7) * dt * 0.4;
          y = Math.max(0.3, Math.min(6, y));
        }
        // wrap around the camera so particles are always nearby
        const h = span / 2;
        if (x - cam.x > h) x -= span; else if (x - cam.x < -h) x += span;
        if (z - cam.z > h) z -= span; else if (z - cam.z < -h) z += span;
        a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
      }
      g.attributes.position.needsUpdate = true;
      if (T.particles === 'fireflies') pm.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    });
  }

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  sky.castShadow = sky.receiveShadow = false;
  water.castShadow = false;
  foam.castShadow = foam.receiveShadow = false;
  cliff.castShadow = false;
  grass.castShadow = false;
  tufts.castShadow = false;
  for (const c of clouds) c.traverse(o => { o.castShadow = false; o.receiveShadow = false; });

  // --- Lights ---
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  sun.position.set(...T.sunPos);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const sz = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  const ext = R + 3;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 90 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);

  // storm: lightning flashes light up the sky; the game plays thunder via api.onFlash
  let flashT = 4 + rng() * 6, flash = 0;
  if (T.lightning) {
    const baseHemi = hemi.intensity, baseTop = sky.material.uniforms.top.value.clone(), baseHor = sky.material.uniforms.horizon.value.clone();
    const white = new THREE.Color(0xeef2ff);
    updaters.push(dt => {
      flashT -= dt;
      if (flashT <= 0) { flash = 1; flashT = 7 + Math.random() * 10; api.onFlash?.(); }
      flash = Math.max(0, flash - dt * 3.5);
      const k = flash > 0.5 ? flash : flash * (0.6 + 0.4 * Math.sin(flash * 40));
      hemi.intensity = baseHemi * (1 + k * 1.6);
      sky.material.uniforms.top.value.copy(baseTop).lerp(white, k * 0.5);
      sky.material.uniforms.horizon.value.copy(baseHor).lerp(white, k * 0.7);
    });
  }

  const isFreeGround = (x, z, margin) => {
    if (Math.hypot(x, z) < Math.max(3.6, clearR + 1)) return false;
    const th = Math.atan2(z, x);
    if (Math.hypot(x, z) > radiusAt(th) - 1.2) return false;
    if (overlaps(x, z, 0, 0, margin)) return false;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 0.9)) return false;
    if (rocks.some(t => Math.hypot(t.x - x, t.z - z) < t.s + 0.5)) return false;
    return true;
  };

  const heightAt = (x, z, maxY = Infinity) => {
    let h = 0;
    for (const b of colliders) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y <= maxY + 0.01) h = Math.max(h, b.max.y);
    }
    return h;
  };

  const api = {
    group, colliders, blockers, radiusAt, R, tops, isFreeGround, heightAt, theme: T, onFlash: null,
    update(dt, t, cam) { for (const u of updaters) u(dt, t, cam); },
    dispose() {
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { mm.map?.dispose(); mm.dispose(); });
      });
      sun.shadow.map?.dispose();
    },
  };
  return api;
}

const geoCache = {};
const G = (k, f) => geoCache[k] || (geoCache[k] = f());

function makeTree(T, rng, s, mat, blockers) {
  const tree = new THREE.Group();
  const leaf = () => mat(T.leaves[Math.floor(rng() * T.leaves.length)]);
  if (T.trees === 'round') {
    const trunk = new THREE.Mesh(G('trunk', () => new THREE.CylinderGeometry(0.18, 0.26, 2.2, 7)), mat(T.trunk));
    trunk.position.y = 1.1 * s; trunk.scale.setScalar(s);
    tree.add(trunk); blockers.push(trunk);
    const lm = leaf();
    const blobs = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < blobs; i++) {
      const b = new THREE.Mesh(G('blob', () => new THREE.IcosahedronGeometry(1, 1)), lm);
      const bs = (1.25 - i * 0.28) * s;
      b.scale.set(bs, bs * 0.9, bs);
      b.position.set((rng() - 0.5) * 0.4 * s, (2.4 + i * 0.95) * s, (rng() - 0.5) * 0.4 * s);
      b.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      tree.add(b); blockers.push(b);
    }
  } else if (T.trees === 'pine') {
    const trunk = new THREE.Mesh(G('trunk', () => new THREE.CylinderGeometry(0.18, 0.26, 2.2, 7)), mat(T.trunk));
    trunk.position.y = 0.8 * s; trunk.scale.setScalar(s);
    tree.add(trunk); blockers.push(trunk);
    const lm = leaf(), snow = mat(0xffffff);
    for (let i = 0; i < 3; i++) {
      const r = (1.5 - i * 0.38) * s, h = (1.6 - i * 0.2) * s;
      const c = new THREE.Mesh(G('cone', () => new THREE.ConeGeometry(1, 1, 7)), lm);
      c.scale.set(r, h, r);
      c.position.y = (1.6 + i * 0.95) * s;
      c.rotation.y = rng() * 3;
      tree.add(c); blockers.push(c);
      const cap = new THREE.Mesh(G('cone', () => new THREE.ConeGeometry(1, 1, 7)), snow);
      cap.scale.set(r * 0.55, h * 0.42, r * 0.55);
      cap.position.y = c.position.y + h * 0.3;
      cap.rotation.y = c.rotation.y;
      tree.add(cap);
    }
  } else if (T.trees === 'palm') {
    const dir = rng() * Math.PI * 2, lean = (0.9 + rng() * 0.6) * s, h = 3.6 * s;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.6, 0), new THREE.Vector3(Math.cos(dir) * lean, h, Math.sin(dir) * lean));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.17 * s, 6), mat(T.trunk));
    tree.add(tube); blockers.push(tube);
    const x = lean, y = h;
    const top = new THREE.Vector3(Math.cos(dir) * x, y, Math.sin(dir) * x);
    const lm = leaf();
    for (let i = 0; i < 6; i++) {
      const fr = new THREE.Mesh(G('frond', () => { const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1.4, 0.12, 0.42); g.translate(1.2, 0, 0); return g; }), lm);
      fr.position.copy(top);
      fr.rotation.order = 'YZX';
      fr.rotation.set(0, (i / 6) * Math.PI * 2 + rng() * 0.3, -0.45 - rng() * 0.2);
      fr.scale.setScalar(s);
      tree.add(fr); blockers.push(fr);
    }
    const nut = mat(0x6b4a36);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(G('nut', () => new THREE.IcosahedronGeometry(0.15, 0)), nut);
      c.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2.1) * 0.2, -0.15, Math.sin(i * 2.1) * 0.2));
      tree.add(c);
    }
  } else {
    // crystal cluster
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const c = T.leaves[Math.floor(rng() * T.leaves.length)];
      const cr = new THREE.Mesh(G('crystal', () => new THREE.OctahedronGeometry(1, 0)), mat(c, { emissive: new THREE.Color(c).multiplyScalar(0.35) }));
      const h = (1.2 + rng() * 1.6) * s;
      cr.scale.set(0.35 * s, h, 0.35 * s);
      const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 0.35 * s;
      cr.position.set(Math.cos(a) * r, h * 0.75, Math.sin(a) * r);
      cr.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5);
      tree.add(cr); blockers.push(cr);
    }
  }
  return tree;
}

function makeRock(T, rng, s, mat) {
  const g = new THREE.Group();
  if (T.rockShape === 'ice') {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(G('ice', () => new THREE.ConeGeometry(0.5, 1, 5)), mat(T.rock));
      const h = (1 + rng() * 1.2) * s * 1.6;
      c.scale.set(s, h, s);
      c.position.set((rng() - 0.5) * s, h / 2, (rng() - 0.5) * s);
      c.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
      g.add(c);
    }
  } else if (T.rockShape === 'coral') {
    const cm = mat([0xff9eb8, 0xff7a6b, 0xffb86b][Math.floor(rng() * 3)]);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(G('coral', () => new THREE.CylinderGeometry(0.12, 0.16, 1, 6)), cm);
      const h = (0.6 + rng() * 0.9) * s * 1.5;
      c.scale.set(s * 1.4, h, s * 1.4);
      c.position.set((rng() - 0.5) * s, h / 2, (rng() - 0.5) * s);
      c.rotation.set((rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.7);
      g.add(c);
    }
  } else {
    const rock = new THREE.Mesh(G('rock', () => new THREE.DodecahedronGeometry(1, 0)), mat(T.rock));
    rock.scale.set(s * 1.2, s * 0.8, s);
    rock.position.y = s * 0.35;
    rock.rotation.set(rng(), rng() * 6, rng());
    g.add(rock);
  }
  return g;
}
