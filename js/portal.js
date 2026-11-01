// A portal's heart, shared by every world's portal (out to the Keeper's Isle) and the Isle's islets (into a world):
// a window onto where it leads, drawn down a tunnel that twists towards its middle, spiral arms of light in the
// portal's colour sweeping round it, rings rushing in, a bright core and rim, a thin glowing ring inside the stones,
// a halo behind them and motes of light drifting in and spiralling down into it. calm (reduced motion): it holds
// still, the light only breathes.
import * as THREE from 'three';
import { LAYER_FX } from './render.js';

const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const frag = `uniform sampler2D view; uniform vec3 col; uniform float time; uniform float spin; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  // the view down a tube: magnified in the middle, twisting more towards the rim
  float tw = spin * (1.0 - r) * (0.5 + 0.25 * sin(time * 0.6));
  float ca = cos(tw), sa = sin(tw);
  vec2 q = mat2(ca, -sa, sa, ca) * p * (0.7 + 0.25 * r * r);
  vec3 c = texture2D(view, q * 0.5 + 0.5).rgb * (1.0 - 0.5 * smoothstep(0.4, 1.0, r));
  // three spiral arms and rings rushing inwards
  float arms = smoothstep(0.3, 1.0, sin(3.0 * a + 7.0 * log(r + 0.04) - time * 2.2 * spin)) * smoothstep(0.12, 0.8, r);
  float rings = pow(0.5 + 0.5 * sin(16.0 * r + time * 4.0 * spin), 8.0) * smoothstep(0.25, 1.0, r);
  c += col * (arms * 0.6 + rings * 0.3);
  // the rim glows, its edge white; a soft bright core that breathes
  c += col * pow(r, 6.0) * 1.3 + vec3(smoothstep(0.93, 1.0, r) * 0.55);
  c += mix(col, vec3(1.0), 0.5) * pow(1.0 - r, 4.0) * (0.22 + 0.08 * sin(time * 2.0));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  glowTex.userData.shared = true;
  return glowTex;
}

// view: a texture of where it leads (paintView); color: the portal's light. The group faces +z (the disc is
// two-sided: you walk through it). update(t, calm) every frame; dispose() frees what it made.
export function makePortal({ view, color, radius = 1.25, motes = 16 }) {
  const col = new THREE.Color(color);
  const group = new THREE.Group();
  const u = { view: { value: view }, col: { value: col }, time: { value: 0 }, spin: { value: 1 } };
  // two discs back to back (not one two-sided disc: the outline pass only sees front faces, and would draw what's
  // behind the portal through it)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag }));
  disc.material.addEventListener('dispose', () => view.dispose());
  const back = new THREE.Mesh(disc.geometry, disc.material);
  back.rotation.y = Math.PI;
  group.add(disc, back);
  // a thin ring of light just inside the stones
  const ringMat = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.04, 0.045, 6, 56), ringMat);
  ring.layers.set(LAYER_FX);
  group.add(ring);
  // the halo behind the stones
  const haloMat = new THREE.MeshBasicMaterial({ map: glow(), color: col, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(radius * 4.2, radius * 4.2), haloMat);
  halo.position.z = -0.35;
  halo.layers.set(LAYER_FX);
  group.add(halo);
  // motes drifting in from round the ring and spiralling down into the middle (on both sides)
  const pos = new Float32Array(motes * 3), seeds = [];
  for (let i = 0; i < motes; i++) seeds.push({ a: (i / motes) * Math.PI * 2, k: (i * 0.618) % 1, side: i % 2 ? 1 : -1, sp: 0.18 + ((i * 0.37) % 1) * 0.14 });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: glow(), color: col.clone().lerp(new THREE.Color(0xffffff), 0.5), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.layers.set(LAYER_FX);
  pts.frustumCulled = false;
  group.add(pts);
  let last = 0, drift = 0;
  return {
    group,
    update(t, calm = false) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      u.time.value = t;
      u.spin.value += ((calm ? 0 : 1) - u.spin.value) * Math.min(1, dt * 3);
      haloMat.opacity = 0.42 + Math.sin(t * 1.6) * 0.1;
      ringMat.opacity = 0.75 + Math.sin(t * 2.4) * 0.2;
      drift += dt * (calm ? 0.25 : 1);
      for (let i = 0; i < motes; i++) {
        const s = seeds[i], f = (s.k + drift * s.sp) % 1; // 0: far out, 1: in the middle
        const r = radius * 1.9 * (1 - f) ** 1.4, a = s.a + f * 5.5;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = Math.sin(a) * r;
        pos[i * 3 + 2] = s.side * (1 - f) * 0.6;
      }
      pg.attributes.position.needsUpdate = true;
    },
    dispose() {
      for (const m of [disc, ring, halo, pts]) { m.geometry.dispose(); m.material.dispose(); }
    },
  };
}

const hex = c => `#${c.toString(16).padStart(6, '0')}`;
// the Keeper's Isle as seen through a world's portal (its theme lives in world.js, which builds the worlds)
const ISLE = { skyTop: 0x4b6fd0, skyHorizon: 0xffe2bc, clouds: 0xfff6ee, cliff: 0xe6b98a, grass: 0x9edc78, leaves: [0x6fcf6a, 0x8fd86a, 0xffb3c8, 0x5fc08a] };

// where a portal leads, painted: a world (its sky, sun, clouds, hills, ground and trees; the Garden: flowers) or
// the Keeper's Isle ('isle': golden sky, the cloud sea, the floating isle with its Lantern and islets round it)
export function paintView(T, { garden = false, isle = false, seed = 1 } = {}) {
  if (isle) T = ISLE;
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hz = N * 0.6;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, hex(T.skyTop));
  sky.addColorStop(1, hex(T.skyHorizon));
  g.fillStyle = sky;
  g.fillRect(0, 0, N, N);
  // the sun's glow
  const sun = g.createRadialGradient(N * 0.68, hz * 0.55, 0, N * 0.68, hz * 0.55, N * 0.3);
  sun.addColorStop(0, 'rgba(255,248,220,0.8)');
  sun.addColorStop(0.15, 'rgba(255,240,200,0.35)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, N, N);
  const puff = (x, y, w, c, a = 0.9) => {
    g.fillStyle = c; g.globalAlpha = a;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + (k - 1.5) * w * 0.32, y - (k % 3 === 1 ? w * 0.12 : 0), w * 0.26, w * 0.17, 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  };
  for (let k = 0; k < 4; k++) puff(rnd() * N, hz * (0.15 + rnd() * 0.45), 30 + rnd() * 30, hex(T.clouds ?? 0xffffff), 0.8);
  if (isle) {
    // the cloud sea, the Isle floating over it with the Lantern, islets round it
    const sea = g.createLinearGradient(0, hz, 0, N);
    sea.addColorStop(0, '#fff3e2');
    sea.addColorStop(1, '#f0b48e');
    g.fillStyle = sea;
    g.fillRect(0, hz, N, N - hz);
    for (let k = 0; k < 10; k++) puff(rnd() * N, hz + 10 + rnd() * (N - hz - 10), 40 + rnd() * 40, k % 2 ? '#ffe6d0' : '#ffd9be', 0.8);
    const isl = (x, y, w, top) => {
      g.fillStyle = hex(T.cliff); g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y); g.lineTo(x, y + w * 0.9); g.closePath(); g.fill();
      g.fillStyle = hex(top); g.beginPath(); g.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2); g.fill();
    };
    for (const [x, y, w] of [[0.18, 0.56, 14], [0.82, 0.5, 12], [0.3, 0.42, 9], [0.72, 0.4, 8]]) isl(x * N, y * N, w, T.grass);
    isl(N / 2, N * 0.62, 50, T.grass);
    g.fillStyle = '#d9c49c'; g.fillRect(N / 2 - 6, N * 0.62 - 64, 12, 62); // the Lantern's column
    const lamp = g.createRadialGradient(N / 2, N * 0.62 - 70, 0, N / 2, N * 0.62 - 70, 30);
    lamp.addColorStop(0, 'rgba(255,240,170,0.9)'); lamp.addColorStop(0.3, 'rgba(255,210,63,0.45)'); lamp.addColorStop(1, 'rgba(255,210,63,0)');
    g.fillStyle = lamp; g.fillRect(N / 2 - 30, N * 0.62 - 100, 60, 60);
    for (let k = 0; k < 6; k++) { const x = N / 2 + (k - 2.5) * 13; g.fillStyle = hex(T.leaves[k % T.leaves.length]); g.beginPath(); g.arc(x, N * 0.62 - 6 - (k % 2) * 3, 7, 0, Math.PI * 2); g.fill(); }
  } else {
    // far hills, then the ground and the world's trees (the Garden: hedges and flowers)
    g.fillStyle = hex(T.cliff);
    g.beginPath(); g.moveTo(0, hz);
    for (let x = 0; x <= N; x += 16) g.lineTo(x, hz - 10 - Math.abs(Math.sin(x * 0.03 + seed)) * 22);
    g.lineTo(N, hz); g.closePath(); g.fill();
    const ground = g.createLinearGradient(0, hz, 0, N);
    ground.addColorStop(0, hex(garden ? 0x8fdc6a : T.grass));
    ground.addColorStop(1, hex(garden ? 0x5fbf68 : T.cap ?? T.grass));
    g.fillStyle = ground;
    g.fillRect(0, hz, N, N - hz);
    const leaves = T.leaves || [0x4fbf5a];
    for (let k = 0; k < 9; k++) {
      const x = rnd() * N, y = hz + 4 + rnd() * (N - hz) * 0.5, sz = 8 + (y - hz) * 0.25;
      g.fillStyle = hex(T.trunk ?? 0x8a5a3a); g.fillRect(x - sz * 0.12, y - sz * 0.6, sz * 0.24, sz * 0.7);
      g.fillStyle = hex(leaves[k % leaves.length]); g.beginPath(); g.arc(x, y - sz * 0.9, sz * 0.6, 0, Math.PI * 2); g.fill();
    }
    if (garden || T.flowers) {
      for (let i = 0; i < (garden ? 50 : 18); i++) {
        g.fillStyle = hex(T.flowers[i % T.flowers.length]);
        g.beginPath(); g.arc(rnd() * N, hz + 8 + rnd() * (N - hz - 8), garden ? 4 : 2.5, 0, Math.PI * 2); g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
