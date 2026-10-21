// Per-theme skies: gradient dome with optional sun disk / aurora, plus big set pieces
// (moon and ringed planet, storm vortex with its eye, a sea of clouds). All un-outlined (LAYER_FX).
import * as THREE from 'three';
import { toon, LAYER_FX } from './render.js';
import { sharedDot } from './world-kit.js';
import { mulberry32 } from './voxels.js';

const skyVert = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const skyFrag = `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; uniform float sunSize; uniform float sunGlow; uniform float time;
uniform vec3 aur1; uniform vec3 aur2; uniform float aurora; uniform vec3 low; uniform float lowAmt;
varying vec3 vP;
void main(){
  vec3 d = normalize(vP); float h = d.y;
  float t = smoothstep(-0.02, 0.6, h);
  vec3 c = mix(horizon, top, t);
  c = mix(c, low, lowAmt * (1.0 - smoothstep(-0.25, 0.05, h)));
  float sd = dot(d, normalize(sunDir));
  if (sunSize > 0.0) {
    float disk = smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.8, sd);
    // a few horizontal stripes cut through a low sun (retro sunset)
    float stripes = step(0.5, fract((h - normalize(sunDir).y) * 90.0)) * smoothstep(0.0, -0.02, h - normalize(sunDir).y + 0.005);
    disk *= 1.0 - stripes * 0.85;
    c = mix(c, sunCol, disk);
  }
  c += sunCol * pow(max(sd, 0.0), 10.0) * sunGlow + sunCol * pow(max(sd, 0.0), 120.0) * sunGlow;
  if (aurora > 0.0) {
    // two curtains: a sharp lower hem that wanders across the sky, glowing rays fading upwards
    float az = atan(d.z, d.x);
    vec3 ac = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float y0 = 0.2 + fi * 0.13 + 0.06 * sin(az * 2.0 + time * 0.07 + fi * 2.1) + 0.025 * sin(az * 5.0 - time * 0.11 + fi);
      float dy = h - y0;
      float hem = smoothstep(-0.012, 0.012, dy) * exp(-max(dy, 0.0) * (6.0 + fi * 3.0));
      float rays = 0.55 + 0.45 * sin(az * 26.0 + 5.0 * sin(az * 3.0 + time * 0.09 + fi) + time * 0.25);
      float fadeAz = 0.35 + 0.65 * smoothstep(-0.4, 0.6, sin(az + fi * 2.5 + time * 0.03));
      vec3 col = mix(aur1, aur2, smoothstep(0.0, 0.16, dy));
      ac += col * hem * rays * fadeAz * (1.0 - fi * 0.35);
    }
    c += ac * aurora * smoothstep(0.04, 0.16, h);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function buildSky(T, rng, group, updaters) {
  const S = T.sky || {};
  const sunDir = new THREE.Vector3(...(S.sunDir || T.sunPos)).normalize();
  const uniforms = {
    top: { value: new THREE.Color(T.skyTop) }, horizon: { value: new THREE.Color(T.skyHorizon) },
    sunCol: { value: new THREE.Color(S.sunCol ?? 0xfff4d6) }, sunDir: { value: sunDir },
    sunSize: { value: S.sunSize ?? 0 }, sunGlow: { value: S.sunGlow ?? 0.15 }, time: { value: 0 },
    aur1: { value: new THREE.Color(S.aur1 ?? 0x5cffb0) }, aur2: { value: new THREE.Color(S.aur2 ?? 0xc98bff) }, aurora: { value: S.aurora ?? 0 },
    low: { value: new THREE.Color(S.low ?? T.skyHorizon) }, lowAmt: { value: S.low ? 1 : 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
  }));
  sky.layers.set(LAYER_FX);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  updaters.push((dt, t) => { uniforms.time.value = t; });

  if (T.stars) {
    const n = 650, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2, y = 0.08 + rng() * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 440, y * 440, Math.sin(th) * r * 440], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6d8, size: 3.2, sizeAttenuation: false, map: sharedDot(), transparent: true, depthWrite: false, fog: false }));
    stars.layers.set(LAYER_FX);
    stars.renderOrder = -9;
    group.add(stars);
    updaters.push((dt, t) => { stars.material.opacity = 0.75 + 0.25 * Math.sin(t * 0.7); });
  }
  if (S.moon) addMoonAndPlanet(group, updaters);
  if (S.earth) addEarth(group, updaters);
  const vortex = S.vortex ? addVortex(group, updaters, uniforms) : null;
  if (S.cloudSea) addCloudSea(group, updaters, S.cloudSea);
  return { sky, uniforms, vortex };
}

function craterTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff6e6'; g.fillRect(0, 0, 128, 128);
  const r = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const x = r() * 128, y = r() * 128, s = 4 + r() * 14;
    g.fillStyle = `rgba(170,160,200,${0.35 + r() * 0.3})`;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(x - s * 0.2, y - s * 0.2, s * 0.55, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addMoonAndPlanet(group, updaters) {
  const moon = new THREE.Mesh(new THREE.SphereGeometry(52, 32, 20), new THREE.MeshBasicMaterial({ map: craterTexture(), fog: false, color: 0xfff1dc }));
  moon.position.set(-250, 120, -300);
  moon.layers.set(LAYER_FX);
  moon.renderOrder = -8;
  group.add(moon);
  // soft halo behind the moon
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedDot(), color: 0xffe9c8, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
  halo.scale.setScalar(260);
  halo.position.copy(moon.position).multiplyScalar(1.02);
  halo.layers.set(LAYER_FX);
  halo.renderOrder = -9;
  group.add(halo);

  const planet = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(30, 28, 18), toon(0xff9ec7, { fog: false, emissive: new THREE.Color(0x5a2d6e) }));
  planet.add(ball);
  const ringGeo = new THREE.RingGeometry(40, 62, 64, 1);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, side: THREE.DoubleSide, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
  ring.rotation.x = Math.PI / 2 - 0.35;
  planet.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(64, 70, 64, 1), new THREE.MeshBasicMaterial({ color: 0xb8f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
  ring2.rotation.copy(ring.rotation);
  planet.add(ring2);
  planet.rotation.z = 0.35;
  planet.position.set(300, 75, 170);
  planet.traverse(o => { o.layers.set(LAYER_FX); o.renderOrder = -8; });
  group.add(planet);
  updaters.push((dt) => { ball.rotation.y += dt * 0.03; });
}

// a blue-green planet hanging over the moon
function addEarth(group, updaters) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#3f8ee8'; g.fillRect(0, 0, 256, 128);
  const r = mulberry32(11);
  for (let i = 0; i < 14; i++) {
    const x = r() * 256, y = 20 + r() * 88, s = 10 + r() * 26;
    g.fillStyle = r() < 0.7 ? '#5fc46a' : '#d9c27a';
    g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 22; i++) { g.beginPath(); g.ellipse(r() * 256, r() * 128, 14 + r() * 30, 3 + r() * 5, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 120, 256, 8);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(46, 32, 20), new THREE.MeshBasicMaterial({ map: t, fog: false }));
  earth.position.set(-220, 140, -290);
  earth.rotation.z = 0.4;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedDot(), color: 0x8fd0ff, transparent: true, opacity: 0.45, depthWrite: false, fog: false }));
  halo.scale.setScalar(150);
  halo.position.copy(earth.position).multiplyScalar(1.02);
  for (const o of [earth, halo]) { o.layers.set(LAYER_FX); o.renderOrder = -8; group.add(o); }
  halo.renderOrder = -9;
  updaters.push(dt => { earth.rotation.y += dt * 0.02; });
}

const NOISE = `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;
const vortexFrag = `uniform float time; uniform float flash; uniform vec3 dark; uniform vec3 light; varying vec2 vUv;
${NOISE}
// seamless around the cylinder: blend two lookups across the wrap
float wrapFbm(float u, float y, float k) { return mix(fbm(vec2(u * k, y)), fbm(vec2((u - 1.0) * k, y)), u); }
void main(){
  float y = vUv.y;
  float u = fract(vUv.x + y * 0.35);
  float s = wrapFbm(u, y * 9.0 - time * 0.05, 14.0);
  float s2 = wrapFbm(fract(u + time * 0.004), y * 22.0, 30.0);
  float streak = smoothstep(0.42, 0.75, s * 0.7 + s2 * 0.45);
  vec3 c = mix(dark, light, streak * 0.6 + y * 0.25);
  c += vec3(0.9, 0.95, 1.0) * flash * (0.25 + streak * 0.4);
  float alpha = smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.82, 1.0, y)) * (0.7 + streak * 0.3);
  gl_FragColor = vec4(c, alpha);
  #include <colorspace_fragment>
}`;
const eyeFrag = `uniform float time; uniform float flash; uniform vec3 dark; uniform vec3 light; varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
  float sw = log(r + 0.02) * 2.6 + time * 0.04;
  vec2 q = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  float n = fbm(q * 4.0 + 3.0);
  float arms = smoothstep(0.2, 0.9, (sin(a * 3.0 + log(r + 0.02) * 6.0 + time * 0.3) * 0.5 + 0.5) * 0.6 + n * 0.6);
  float arms2 = n;
  vec3 c = mix(dark, light, arms * 0.5 + arms2 * 0.25);
  c += vec3(0.9, 0.95, 1.0) * flash * 0.4;
  float alpha = smoothstep(0.16, 0.42, r) * (1.0 - smoothstep(0.85, 1.0, r)) * (0.75 + arms * 0.25);
  gl_FragColor = vec4(c, alpha);
  #include <colorspace_fragment>
}`;
const uvVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

function addVortex(group, updaters, skyU) {
  const u = { time: { value: 0 }, flash: { value: 0 }, dark: { value: new THREE.Color(0x232a45) }, light: { value: new THREE.Color(0x8a93bf) } };
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(230, 150, 190, 64, 1, true), new THREE.ShaderMaterial({
    uniforms: u, vertexShader: uvVert, fragmentShader: vortexFrag, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
  }));
  wall.position.y = 40;
  const eye = new THREE.Mesh(new THREE.CircleGeometry(240, 64), new THREE.ShaderMaterial({
    uniforms: u, vertexShader: uvVert, fragmentShader: eyeFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  eye.rotation.x = Math.PI / 2;
  eye.position.y = 105;
  for (const m of [wall, eye]) { m.layers.set(LAYER_FX); m.renderOrder = -8; m.frustumCulled = false; group.add(m); }
  updaters.push((dt, t) => {
    u.time.value = t;
    wall.rotation.y -= dt * 0.03;
    eye.rotation.z += dt * 0.02;
    u.flash.value = skyU.flash?.value ?? 0;
  });
  skyU.flash = { value: 0 };
  return [wall, eye];
}

const seaFrag = `uniform float time; uniform vec3 a; uniform vec3 b; varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = (vUv - 0.5) * 1000.0;
  float n = fbm(p * 0.025 + vec2(time * 0.02, time * 0.012));
  float n2 = fbm(p * 0.025 + vec2(time * 0.02, time * 0.012) + vec2(0.35, 0.3));
  float puff = smoothstep(0.38, 0.72, n);
  vec3 c = mix(a, b, puff);
  c += (b - a) * 0.35 * smoothstep(0.0, 0.08, n - n2) * puff;
  float fade = 1.0 - smoothstep(0.3, 0.5, length(vUv - 0.5));
  gl_FragColor = vec4(c, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, a, 1.0 - fade);
  #include <colorspace_fragment>
}`;
function addCloudSea(group, updaters, cfg) {
  const u = { time: { value: 0 }, a: { value: new THREE.Color(cfg.a) }, b: { value: new THREE.Color(cfg.b) } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000, 1, 1), new THREE.ShaderMaterial({
    uniforms: u, vertexShader: uvVert,
    fragmentShader: seaFrag, fog: false, depthWrite: true,
  }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = cfg.y;
  sea.layers.set(LAYER_FX);
  group.add(sea);
  updaters.push((dt, t) => { u.time.value = t; });
}
