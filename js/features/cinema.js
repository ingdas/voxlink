// Cutscenes. Prologue: the Keeper Colossus loses its grip on the Great Storm and shatters, then the storm smashes
// the first figure, whose blocks land exactly where the player will find them. Finale: the rebuilt Colossus gathers
// the storm back into its hands, the storm turns into the morning sun and every figure comes home.
// While one runs, app === 'cinema' and this module owns the frame (ctx.modes.cinema). Everything is a function of
// the cutscene clock, so Skip just fast-forwards the timeline.
import { PEDESTAL_TOP, THEMES } from '../world.js';
import { S, mergeFigure, voxelMaterial } from '../voxels.js';
import { toon, LAYER_FX, LAYER_OVERLAY } from '../render.js';
import { sharedDot } from '../world-kit.js';
import { t } from '../i18n.js';

let ctx, THREE, $;
let C = null; // the running cutscene

const clamp01 = x => Math.min(1, Math.max(0, x));
const span = (T, a, b) => clamp01((T - a) / (b - a)); // progress of T through [a, b]
const ease = x => (x = clamp01(x), x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export function init(c) {
  ctx = c; THREE = c.THREE; $ = c.$;
  buildDom();
  ctx.modes.cinema = dt => update(dt);
  ctx.cinema = { prologue, finale, ready: null, get clock() { return C?.T ?? 0; } };
  addEventListener('keydown', e => {
    if (!C || ctx.app !== 'cinema' || ctx.overlays.length || ctx.base !== 'screen-cinema') return;
    if (['Escape', 'Space', 'Enter'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' && !C.over) skip();
  });
}

// ---------- screen: letterbox, captions, fades ----------
function buildDom() {
  const el = document.createElement('div');
  el.id = 'screen-cinema';
  el.className = 'screen cinema';
  el.innerHTML = `<div class="cine-bar top"></div><div class="cine-bar bottom"></div>
    <p class="cine-caption" id="cine-caption"></p>
    <div class="cine-fade" id="cine-fade"></div>
    <button class="btn cine-skip" id="cine-skip"><span data-i18n="cine.skip">${t('cine.skip')}</span><kbd>Esc</kbd><svg><use href="#i-next"/></svg></button>`;
  $('screen-talk').before(el);
  $('cine-skip').onclick = e => { e.stopPropagation(); skip(); };
}

// eyes: 'bars' (letterbox), 'shut', 'peek', 'open'
function bars(state) {
  const el = $('screen-cinema');
  el.classList.toggle('instant', !!C?.skipping);
  for (const s of ['bars', 'shut', 'peek']) el.classList.toggle(s, s === state);
}

function say(key) {
  const el = $('cine-caption');
  el.classList.remove('on');
  clearTimeout(say.timer);
  if (!key) return;
  const show = () => { el.innerHTML = t(key); el.classList.add('on'); };
  if (C?.skipping || !el.innerHTML) show();
  else say.timer = setTimeout(show, 450);
}

// a white flash of light (much softer with reduced motion)
const flashScreen = op => { fade('#fff', document.body.classList.contains('reduce-motion') ? op * 0.25 : op, 0); };

function fade(color, to, dur) {
  const el = $('cine-fade');
  el.style.background = color;
  el.style.transition = C?.skipping || !dur ? 'none' : `opacity ${dur}s ease`;
  el.style.opacity = to;
}

// ---------- sound ----------
const sfx = f => { if (!C?.skipping) f(ctx.audio); };
const boom = (big = 1) => sfx(a => {
  a.noise({ dur: 2.6 * big, vol: 0.5 * big, freq: 170, q: 0.5, type: 'lowpass' });
  a.tone({ f: 72, f2: 26, type: 'sine', dur: 1.6, vol: 0.32 * big });
  a.noise({ t: 0.04, dur: 1.0, vol: 0.16 * big, freq: 2600, f2: 500, q: 0.6 });
});
const crack = () => sfx(a => {
  a.noise({ dur: 0.16, vol: 0.38, freq: 3800, q: 0.5, type: 'highpass' });
  a.noise({ t: 0.03, dur: 1.8, vol: 0.32, freq: 150, q: 0.4, type: 'lowpass' });
});
const rumble = (dur = 3) => sfx(a => a.noise({ dur, vol: 0.24, freq: 95, q: 0.6, type: 'lowpass', attack: dur * 0.45 }));
const chime = k => sfx(a => {
  a.tone({ f: a.midi(72 + PENTA[k % PENTA.length]), type: 'triangle', dur: 0.5, vol: 0.09, wet: 0.5 });
  a.tone({ f: a.midi(84 + PENTA[k % PENTA.length]), type: 'sine', t: 0.02, dur: 0.4, vol: 0.03, wet: 0.6 });
});
const swell = () => sfx(a => [0, 4, 7, 11, 14, 19].forEach((n, i) => a.tone({ f: a.midi(62 + n), type: 'sine', t: i * 0.16, dur: 2.4, vol: 0.05, attack: 0.4, wet: 0.7 })));

// ---------- runner ----------
// script: { end, cues: [[time, fn]], update(T, dt), finish(), keep }  (keep: leave the props standing after the end)
function play(script) {
  if (C) for (const p of C.props) p.dispose(); // a kept finale set, if the island is still loaded
  C = { T: 0, skipping: false, over: false, props: [], flash: 0, ...script };
  C.cues = script.cues.slice().sort((a, b) => a[0] - b[0]);
  ctx.cinema.ready = null;
  clearTimeout(say.timer);
  // the Play / Epilogue button keeps focus behind the hidden screen: Space or Enter would click it again
  document.activeElement?.blur?.();
  ctx.app = 'cinema';
  ctx.input.enabled = false;
  ctx.input.reset();
  ctx.input.exitLock();
  ctx.audio.unlock();
  ctx.audio.suspend(false);
  document.body.classList.remove('playing', 'celebrating');
  $('hud').classList.add('off');
  $('kubo-bark').classList.remove('show');
  $('cine-caption').innerHTML = '';
  $('cine-caption').classList.remove('on');
  ctx.setBase('screen-cinema');
  $('screen-cinema').classList.remove('over');
  bars('bars');
}

function update(dt) {
  const c = C;
  if (!c) return;
  const g = ctx.game;
  c.T += dt;
  if (!c.over) {
    while (c.cues.length && c.cues[0][0] <= c.T) { c.cues.shift()[1](); if (C !== c) return; }
  }
  g.t += dt;
  g.world?.update(dt, g.t, ctx.camera.position);
  c.flash = Math.max(0, c.flash - dt * 3.2);
  c.update(c.T, dt);
  ctx.camera.updateMatrixWorld();
  ctx.fx.update(dt, ctx.camera);
  if (!c.over && c.T >= c.end) end();
}

function skip() {
  const c = C;
  if (!c || c.over) return;
  c.skipping = true;
  while (c.cues.length) { c.cues.shift()[1](); if (C !== c) return; }
  c.T = Math.max(c.T, c.end);
  c.update(c.T, 0);
  end();
}

function end() {
  const c = C;
  c.over = true;
  $('screen-cinema').classList.add('over'); // nothing left to skip
  say(null);
  fade('#000', 0, 0);
  bars('open');
  c.skipping = false;
  if (!c.keep) for (const p of c.props.splice(0)) p.dispose();
  c.finish();
}

// props are parented to the current world, so unloading the world frees them too
function prop(obj, dispose) {
  ctx.game.world.group.add(obj);
  const p = { obj, dispose: () => { obj.parent?.remove(obj); dispose?.(); } };
  C.props.push(p);
  return obj;
}

// ---------- shared pieces ----------
function aim(pos, look, shake = 0) {
  const cam = ctx.camera;
  cam.position.copy(pos);
  if (shake > 0) {
    const k = shake * ctx.game.comfort.kick, tt = ctx.game.t;
    cam.position.x += Math.sin(tt * 37.1) * k * 0.6 + Math.sin(tt * 61.7) * k * 0.4;
    cam.position.y += Math.sin(tt * 43.3 + 1) * k * 0.6 + Math.sin(tt * 71.9) * k * 0.4;
  }
  cam.lookAt(look);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, k) => a.clone().lerp(b, k);

// Freeze the level for filming: no flags, updraft ring or bubbles; nothing reacts to the game's own clock.
function film(g) {
  g.mode = 'cinema';
  g.world.calm = true;
  g.world.atmos.unflash?.(); // a lightning flash caught mid-fade would become the base light
  showGameplay(g, false);
  g.fx.clearBeam();
}
// back to a playable level (the prologue hands its island straight to the game)
function unfilm(g) {
  g.world.calm = false;
  showGameplay(g, true);
}
function showGameplay(g, on) {
  if (g.flagGroup) g.flagGroup.visible = on;
  if (g.liftFx) g.liftFx.group.visible = on;
  for (const s of g.sockets.values()) s.sprite.visible = on;
}

// every block on the figure
function assemble(g) {
  for (const v of g.voxels) {
    v.mesh.position.copy(v.target);
    v.mesh.quaternion.identity();
    v.mesh.scale.setScalar(1);
    v.mesh.visible = true;
    v.mat.emissive.setScalar(0);
  }
}

// The Colossus' arms swing forward around their shoulders (angle 0: hanging, ~1.4: holding something in front).
function armRig(g) {
  const arm = g.voxels.filter(v => Math.abs(v.cell.ix) === 4);
  const top = Math.max(...arm.map(v => v.cell.iy)), low = Math.min(...arm.map(v => v.cell.iy));
  const pivotY = PEDESTAL_TOP + top * S + S / 2;
  const pivotZ = arm.reduce((s, v) => s + v.target.z, 0) / arm.length;
  const q = new THREE.Quaternion(), ax = V(1, 0, 0), tmp = V(0, 0, 0);
  return {
    set(a) {
      q.setFromAxisAngle(ax, -a);
      for (const v of arm) {
        tmp.set(0, v.target.y - pivotY, v.target.z - pivotZ).applyQuaternion(q);
        v.mesh.position.set(v.target.x, pivotY + tmp.y, pivotZ + tmp.z);
        v.mesh.quaternion.copy(q);
      }
    },
    // the point between the two fists
    hands(a) {
      const d = (top - low) * S;
      return V(0, pivotY - d * Math.cos(a) + 0.2, pivotZ + d * Math.sin(a));
    },
  };
}

const glowMat = color => new THREE.SpriteMaterial({ map: sharedDot(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

// The storm in a ball: a swirling sphere with a soft halo.
const orbVert = `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const orbFrag = `uniform float time; uniform vec3 a; uniform vec3 b; uniform float crack;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 p = normalize(vP);
  float ang = atan(p.z, p.x);
  float s1 = sin(ang * 3.0 + p.y * 5.0 - time * 2.4 + sin(p.y * 3.0 + time * 0.7) * 1.6);
  float s2 = sin(ang * 5.0 - p.y * 8.0 + time * 1.7);
  float k = smoothstep(0.1, 0.95, s1 * 0.5 + 0.5) * 0.7 + smoothstep(0.55, 1.0, s2 * 0.5 + 0.5) * 0.35;
  float rim = pow(1.0 - max(dot(vN, vV), 0.0), 2.0);
  float lines = 1.0 - smoothstep(0.0, 0.07, abs(sin(p.x * 7.0 + p.y * 11.0 + sin(p.z * 5.0) * 2.0)));
  vec3 c = mix(a, b, k) + b * rim * 0.9 + vec3(1.0) * lines * crack;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
function makeOrb() {
  const u = { time: { value: 0 }, a: { value: new THREE.Color(0x1d2452) }, b: { value: new THREE.Color(0xa8dcff) }, crack: { value: 0 } };
  const group = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), new THREE.ShaderMaterial({ uniforms: u, vertexShader: orbVert, fragmentShader: orbFrag }));
  const halo = new THREE.Sprite(glowMat(0x9fd8ff));
  halo.scale.setScalar(3.4);
  halo.material.opacity = 0.4;
  group.add(ball, halo);
  group.traverse(o => o.layers.set(LAYER_FX));
  prop(group, () => { ball.geometry.dispose(); ball.material.dispose(); halo.material.dispose(); });
  return { group, ball, halo, u };
}

// A jagged lightning bolt from the sky down to `to`, with a branch.
function makeBolt(from, to) {
  const group = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, depthWrite: false, fog: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9fc8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const up = V(0, 1, 0);
  const seg = (a, b, w) => {
    const d = b.clone().sub(a), len = d.length();
    for (const [m, s] of [[core, w], [glow, w * 4]]) {
      const mesh = new THREE.Mesh(box, m);
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(up, d.normalize());
      mesh.scale.set(s, len + s, s);
      mesh.layers.set(LAYER_FX);
      group.add(mesh);
    }
  };
  const path = (a, b, n, jag, w) => {
    let prev = a;
    const pts = [a];
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const p = i === n ? b : a.clone().lerp(b, k).add(V((Math.random() - 0.5) * jag, (Math.random() - 0.5) * jag * 0.3, (Math.random() - 0.5) * jag));
      seg(prev, p, w * (1 - k * 0.4));
      pts.push(p);
      prev = p;
    }
    return pts;
  };
  const main = path(from, to, 14, 2.6, 0.3);
  const fork = main[6];
  path(fork, fork.clone().add(V(4 + Math.random() * 3, -9, (Math.random() - 0.5) * 6)), 6, 1.8, 0.14);
  prop(group, () => { box.dispose(); core.dispose(); glow.dispose(); });
  return {
    group,
    set(k) { // 1 → 0 as it fades, flickering
      const f = k > 0.6 ? 1 : k * (0.5 + 0.5 * Math.sin(k * 60));
      core.opacity = f; glow.opacity = 0.35 * f;
    },
  };
}

// Streaks of rain that follow the camera (the meadow has none of its own).
function makeRain(n = 700) {
  const pos = new Float32Array(n * 6), seeds = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) seeds.set([(Math.random() - 0.5) * 34, Math.random() * 16, (Math.random() - 0.5) * 34], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.layers.set(LAYER_OVERLAY);
  lines.frustumCulled = false;
  prop(lines, () => { geo.dispose(); mat.dispose(); });
  return {
    update(dt, cam, amount) {
      mat.opacity = 0.55 * amount;
      lines.visible = amount > 0.01;
      if (!lines.visible) return;
      for (let i = 0; i < n; i++) {
        let y = seeds[i * 3 + 1] - dt * 17;
        if (y < -2) y += 16;
        seeds[i * 3 + 1] = y;
        const x = cam.x + seeds[i * 3] + y * 0.18, z = cam.z + seeds[i * 3 + 2], yy = cam.y - 3 + y;
        pos.set([x, yy, z, x - 0.1, yy + 0.55, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- moods: sky, fog and light, blended per frame ----------
function readMood(w) {
  const A = w.atmos;
  return {
    top: A.sky.top.value.clone(), hor: A.sky.horizon.value.clone(), fog: ctx.scene.fog.color.clone(), dens: ctx.scene.fog.density,
    hemi: A.hemi.intensity, hemiCol: A.hemi.color.clone(), sun: A.sun.intensity, sunCol: A.sun.color.clone(),
  };
}
const mood = (base, o) => ({
  ...base, ...o,
  top: o.top !== undefined ? new THREE.Color(o.top) : base.top, hor: o.hor !== undefined ? new THREE.Color(o.hor) : base.hor,
  fog: o.fog !== undefined ? new THREE.Color(o.fog) : base.fog, hemiCol: o.hemiCol !== undefined ? new THREE.Color(o.hemiCol) : base.hemiCol,
  sunCol: o.sunCol !== undefined ? new THREE.Color(o.sunCol) : base.sunCol,
  hemi: base.hemi * (o.hemiK ?? 1), sun: base.sun * (o.sunK ?? 1), dens: o.dens ?? base.dens,
});
const WHITE = 0xeef2ff;
function applyMood(w, a, b, k, flash = 0) {
  const A = w.atmos, white = new THREE.Color(WHITE);
  A.sky.top.value.copy(a.top).lerp(b.top, k).lerp(white, flash * 0.5);
  A.sky.horizon.value.copy(a.hor).lerp(b.hor, k).lerp(white, flash * 0.7);
  if (A.sky.flash) A.sky.flash.value = flash;
  ctx.scene.fog.color.copy(a.fog).lerp(b.fog, k);
  ctx.scene.fog.density = THREE.MathUtils.lerp(a.dens, b.dens, k);
  A.hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, k) * (1 + flash * 1.6);
  A.hemi.color.copy(a.hemiCol).lerp(b.hemiCol, k);
  A.sun.intensity = THREE.MathUtils.lerp(a.sun, b.sun, k);
  A.sun.color.copy(a.sunCol).lerp(b.sunCol, k);
}

// ---------- prologue ----------
function prologue(done) {
  const L = ctx.LEVELS, boss = L[L.length - 1], first = L[0];
  const g = ctx.game;
  let shot = null;
  const flashAt = k => { if (C) C.flash = Math.max(C.flash, k); };

  // Shot 1: the Colossus on the eye of the storm, holding the storm in a ball.
  const keeper = () => {
    g.load(boss);
    film(g);
    assemble(g);
    const w = g.world, A = w.atmos;
    const arms = armRig(g);
    const hold = 1.42;
    arms.set(hold);
    const hands = arms.hands(hold);
    const orb = makeOrb();
    orb.group.position.copy(hands);
    orb.group.scale.setScalar(1.15);
    const base = readMood(w);
    const held = mood(base, { top: 0x241f55, hor: 0xc58aa8, fog: 0xb98aa6, dens: 0.008, hemiK: 0.9 });
    const wild = mood(base, { top: 0x141932, hor: 0x56607f, fog: 0x56607f, dens: 0.015, hemiK: 0.8 });
    const vortex = (A.vortex || []).map(m => ({ m, home: m.position.clone() }));
    if (A.particles) A.particles.visible = false;
    for (const v of g.voxels) v.fly = null;
    shot = {
      name: 'keeper', w, arms, hands, orb, held, wild, vortex, shatterT: Infinity,
      shatter() {
        this.shatterT = C.T;
        flashAt(1);
        flashScreen(0.85);
        fade('#fff', 0, 0.7);
        boom(1.2);
        sfx(a => a.thunder());
        if (!C.skipping) {
          g.fx.burst(hands, 0xbfe6ff, 60, 10);
          g.fx.burst(hands, 0x5a6cc0, 40, 7);
        }
        if (A.particles) A.particles.visible = true;
        for (const v of g.voxels) {
          const p = v.mesh.position, d = p.clone().sub(hands);
          const dist = d.length();
          d.y = Math.max(d.y, 0) * 0.4 + dist * 0.35;
          v.fly = {
            delay: dist * 0.03,
            vel: d.normalize().multiplyScalar(7 + Math.random() * 10).add(V(0, 2 + Math.random() * 4, 0)),
            axis: V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), w: 3 + Math.random() * 8,
          };
        }
      },
    };
  };

  // Shot 2: the storm reaches the Meadow and lightning smashes the Sprout. Its blocks land where the game wants them.
  const meadow = () => {
    g.load(first);
    film(g);
    const w = g.world, A = w.atmos;
    const base = readMood(w);
    const storm = mood(base, { top: 0x1c2045, hor: 0x4f5679, fog: 0x4f5679, dens: 0.02, hemiK: 0.42, sunK: 0.12, hemiCol: 0xaab4d8 });
    if (A.particles) A.particles.visible = false;
    const rain = makeRain();
    const top = V(0, PEDESTAL_TOP + g.figureHeight, 0);
    const fliers = g.voxels.filter(v => v.state !== 'placed');
    for (const v of g.voxels) { v.mesh.position.copy(v.target); v.mesh.quaternion.identity(); }
    const bolt = makeBolt(V(7, 46, -14), top.clone());
    bolt.set(0);
    shot = {
      name: 'meadow', w, base, storm, rain, top, fliers, bolt, strikeT: Infinity,
      strike() {
        this.strikeT = C.T;
        flashAt(1);
        flashScreen(0.7);
        fade('#fff', 0, 0.5);
        crack();
        boom(0.7);
        if (!C.skipping) {
          g.fx.burst(top, 0xffffff, 40, 6);
          g.fx.burst(top, 0xffe066, 30, 5);
        }
        for (const v of fliers) {
          v.arc = {
            from: v.target.clone(), delay: Math.random() * 0.12, dur: 1.05 + Math.random() * 0.6, landed: false,
            h: 2.4 + v.rest.pos.distanceTo(v.target) * 0.22,
            axis: V(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(), spins: 1 + Math.floor(Math.random() * 3),
          };
        }
      },
    };
  };

  // Shot 3: eyes open, first person on the island in the morning.
  const wake = () => {
    if (shot?.name !== 'meadow') meadow();
    shot.name = 'wake';
    shot.rain.update(0, ctx.camera.position, 0);
    shot.bolt.group.visible = false;
    const { w } = shot;
    applyMood(w, shot.base, shot.base, 0);
    if (w.atmos.particles) w.atmos.particles.visible = true;
    for (const v of g.voxels) {
      if (v.arc) v.arc.landed = true;
      if (v.state === 'placed') { v.mesh.position.copy(v.target); v.mesh.quaternion.identity(); }
      else { v.mesh.position.copy(v.rest.pos); v.mesh.quaternion.copy(v.rest.quat); }
      v.mesh.scale.setScalar(1);
    }
    unfilm(g);
    g.player.applyCamera(ctx.camera);
  };

  const quat = new THREE.Quaternion(), spinQ = new THREE.Quaternion(), ID = new THREE.Quaternion();
  play({
    end: 21.8,
    cues: [
      [0, () => fade('#000', 1, 0)],
      [0.02, () => keeper()],
      [0.3, () => fade('#000', 0, 1.6)],
      [0.9, () => say('cine.pro.0')],
      [3.2, () => rumble(3.6)],
      [5.1, () => say('cine.pro.1')],
      [5.6, () => sfx(a => a.thunder())],
      [7.0, () => shot.shatter()],
      [8.3, () => { flashAt(0.8); sfx(a => a.thunder()); }],
      [9.6, () => { flashAt(0.6); }],
      [9.9, () => say(null)],
      [10.1, () => fade('#fff', 1, 0.4)],
      [10.55, () => meadow()],
      [10.65, () => fade('#fff', 0, 1.0)],
      [11.1, () => say('cine.pro.2')],
      [12.4, () => { flashAt(0.5); sfx(a => a.thunder()); }],
      [14.4, () => shot.strike()],
      [14.9, () => say('cine.pro.3')],
      [18.4, () => say(null)],
      [18.6, () => fade('#000', 1, 0.9)],
      [19.6, () => { bars('shut'); wake(); }],
      [19.75, () => fade('#000', 0, 0)],
      [20.3, () => bars('peek')],
      [20.6, () => bars('shut')],
      [20.9, () => bars('open')],
    ],
    update(T, dt) {
      if (!shot) return;
      const f = C.flash;
      if (shot.name === 'keeper') {
        const { w, orb, hands, vortex } = shot;
        const sT = T - shot.shatterT;
        // the grip slips: the ball trembles and cracks, then everything blows apart
        const tremble = span(T, 4.6, 7.0);
        orb.u.time.value = g.t * (1 + tremble * 2);
        orb.u.crack.value = tremble * (0.6 + 0.4 * Math.sin(g.t * 30));
        orb.group.position.copy(hands).add(V(Math.sin(g.t * 47) * 0.08 * tremble, Math.sin(g.t * 53) * 0.08 * tremble, 0));
        orb.halo.material.opacity = 0.4 + tremble * 0.3 * Math.sin(g.t * 22);
        if (sT >= 0) {
          const k = easeOut(sT / 0.55);
          orb.ball.visible = false;
          orb.halo.scale.setScalar(4.2 + k * 50);
          orb.halo.material.opacity = 0.9 * (1 - k);
        }
        // the storm unfurls out of the ball
        const grow = sT >= 0 ? easeOut(sT / 2.6) : 0;
        for (const { m, home } of vortex) {
          m.visible = grow > 0.001;
          m.scale.setScalar(Math.max(0.001, grow));
          m.position.lerpVectors(hands, home, grow);
        }
        if (w.atmos.particles) w.atmos.particles.material.opacity = 0.7 * span(sT, 0.2, 1.5);
        applyMood(w, shot.held, shot.wild, sT >= 0 ? span(sT, 0, 1.6) : tremble * 0.25, f);
        // flying blocks
        if (sT >= 0) {
          for (const v of g.voxels) {
            const fl = v.fly, m = v.mesh;
            if (!fl || !m.visible || sT < fl.delay) continue;
            fl.vel.y -= 11 * dt;
            m.position.addScaledVector(fl.vel, dt);
            m.quaternion.premultiply(spinQ.setFromAxisAngle(fl.axis, fl.w * dt));
            const floor = w.floorAt(m.position.x, m.position.z);
            if (floor !== null && fl.vel.y < 0 && m.position.y < floor + S / 2) {
              m.position.y = floor + S / 2;
              fl.vel.set(fl.vel.x * 0.5, -fl.vel.y * 0.3, fl.vel.z * 0.5);
              fl.w *= 0.5;
            }
            if (m.position.y < -4) m.visible = false;
          }
        }
        // camera: a wide shot pushing in on the ball and the face, then thrown back by the blast
        // (it stays above the lintel of the gate arch in front of the pedestal)
        const a = ease(span(T, 0.3, 7.0));
        let pos = lerpV(V(4.5, 13, 23), V(2.2, 7.2, 12.5), a), look = lerpV(V(0, 6.2, 0.5), V(0, 6.6, 1), a);
        if (sT >= 0) {
          const b = easeOut(sT / 2.8);
          pos = lerpV(pos, V(7, 8.5, 28), b);
          look = lerpV(look, V(0, 7, 0), b);
        }
        aim(pos, look, tremble * 0.05 + (sT >= 0 ? 0.45 * Math.max(0, 1 - sT / 1.6) : 0));
      } else if (shot.name === 'meadow') {
        const { w, rain } = shot;
        const sT = T - shot.strikeT;
        applyMood(w, shot.base, shot.storm, 1, f);
        rain.update(dt, ctx.camera.position, span(T, 10.6, 11.4));
        shot.bolt.set(sT >= 0 ? 1 - span(sT, 0.25, 0.7) : 0);
        for (const v of shot.fliers) {
          const a = v.arc, m = v.mesh;
          if (!a) { // the Sprout shivers in the storm before it is hit
            m.position.copy(v.target).add(V(Math.sin(g.t * 31 + v.i) * 0.015, 0, 0));
            continue;
          }
          const k = clamp01((sT - a.delay) / a.dur);
          m.position.lerpVectors(a.from, v.rest.pos, k);
          m.position.y += Math.sin(k * Math.PI) * a.h;
          quat.slerpQuaternions(ID, v.rest.quat, k);
          m.quaternion.copy(spinQ.setFromAxisAngle(a.axis, (1 - k) * a.spins * Math.PI * 2)).multiply(quat);
          if (k >= 1 && !a.landed) {
            a.landed = true;
            sfx(au => au.thud());
            if (!C.skipping) g.fx.burst(V(m.position.x, m.position.y - S / 2, m.position.z), 0xffffff, 8, 1.6);
          }
        }
        // camera: from high over the island, down towards the little figure; a jolt and a step back at the strike
        const a = ease(span(T, 10.55, 14.4));
        let pos = lerpV(V(-10, 7.5, 12), V(-3.4, 2.5, 5.4), a), look = lerpV(V(0, 0.6, 0), V(0, 1.3, 0), a);
        if (sT >= 0) {
          const b = easeOut(sT / 1.8);
          pos = lerpV(pos, V(-5.5, 4.2, 9.5), b);
          look = lerpV(look, V(1, 0.5, 2), b);
        }
        aim(pos, look, sT >= 0 ? 0.3 * Math.max(0, 1 - sT / 1.2) : 0);
      } else if (shot.name === 'wake') {
        g.player.applyCamera(ctx.camera);
      }
    },
    finish() {
      if (shot?.name !== 'wake') wake();
      for (const v of g.voxels) { v.fly = null; v.arc = null; }
      ctx.camera.updateMatrixWorld();
      C.update = () => g.player.applyCamera(ctx.camera); // hold the first-person view while Kubo talks
      ctx.cinema.ready = first; // startLevel can take over this island as it is
      done?.();
    },
  });
}

// ---------- finale ----------
function finale(done) {
  const g = ctx.game, L = ctx.LEVELS, boss = L[L.length - 1];
  // a fresh island: a world that was already filmed has its storm, sky and sun moved around
  if (g.level !== boss || !g.world || g.world.calm) g.load(boss);
  film(g);
  assemble(g);
  const w = g.world, A = w.atmos;
  const arms = armRig(g);
  const reach = 1.3;
  const hands = arms.hands(reach);
  // the face and the glowing heart are on the front (+z) side
  const front = Math.max(...g.voxels.map(v => v.cell.iz));
  const eyes = g.voxels.filter(v => v.cell.iz === front && v.cell.iy >= 11 && v.cell.iy <= 12 && Math.abs(v.cell.ix) === 1);
  const heart = g.voxels.filter(v => v.cell.iz === front && v.cell.iy >= 6 && v.cell.iy <= 7 && Math.abs(v.cell.ix) <= 1);
  const base = readMood(w);
  const night = mood(base, { top: 0x1b2150, hor: 0x5b5f95, fog: 0x5b5f95, dens: 0.009, hemiK: 0.85 });
  const dawn = mood(base, { top: 0x4f86e0, hor: 0xffcf9e, fog: 0xffd9b0, dens: 0.006, hemiK: 1.0, hemiCol: 0xffe8cc, sunK: 1.6, sunCol: 0xffdcaa });
  const vortex = (A.vortex || []).map(m => ({ m, home: m.position.clone() }));
  const sunDir = V(0.18, 0.2, -1).normalize();
  const sunU = A.sky;
  const sunFrom = { size: sunU.sunSize.value, glow: sunU.sunGlow.value, col: sunU.sunCol.value.clone(), dir: sunU.sunDir.value.clone() };
  const sunLight = A.sun.position.clone();
  const gold = { a: new THREE.Color(0xff9a3c), b: new THREE.Color(0xfff3c4) };
  const storm = { a: new THREE.Color(0x1d2452), b: new THREE.Color(0xa8dcff) };
  let orb = null, inflow = null, figures = [];
  const glowCol = new THREE.Color();

  // the storm pours into the hands: streaks spiralling down from the clouds
  const makeInflow = () => {
    const n = 220, pos = new Float32Array(n * 3);
    const seeds = Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, r0: 14 + Math.random() * 30, y0: 12 + Math.random() * 30, s: 0.25 + Math.random() * 0.35, k: Math.random() }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.35, map: sharedDot(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.layers.set(LAYER_OVERLAY);
    pts.frustumCulled = false;
    prop(pts, () => { geo.dispose(); mat.dispose(); });
    return {
      update(dt, amount) {
        mat.opacity = amount;
        pts.visible = amount > 0.01;
        if (!pts.visible) return;
        seeds.forEach((p, i) => {
          p.k += dt * p.s;
          if (p.k >= 1) p.k -= 1;
          const k = p.k * p.k, r = p.r0 * (1 - k);
          const a = p.a + k * 5;
          pos[i * 3] = hands.x + Math.cos(a) * r;
          pos[i * 3 + 1] = THREE.MathUtils.lerp(p.y0, hands.y, k);
          pos[i * 3 + 2] = hands.z + Math.sin(a) * r;
        });
        geo.attributes.position.needsUpdate = true;
      },
    };
  };

  // every other figure, on a little pedestal in a ring around the Colossus
  const makeFigures = () => {
    const K = 0.6;
    const mat = voxelMaterial(ctx.renderer.gl);
    const others = L.filter(l => l !== boss);
    const placed = [];
    const clear = (x, z, r) => {
      const f = w.floorAt(x, z);
      if (f === null) return null;
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = i === 8 ? 0 : r;
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        const pf = w.floorAt(px, pz);
        if (pf === null || Math.abs(pf - f) > 0.15 || w.walkSd(px, pz) > -0.4 || w.heightAt(px, pz) > pf + 0.05) return null;
      }
      return placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + 0.4) ? f : null;
    };
    others.forEach((l, i) => {
      const { cells, height } = ctx.expandLevel(l);
      const r = Math.max(0.9, ...cells.map(c => Math.hypot(c.x, c.z))) * S * K + S * K + 0.35;
      const th = Math.PI / 2 + ((i + 0.5) / others.length) * Math.PI * 2;
      let spot = null;
      for (const R of [10.5, 12, 9, 13.5, 15, 7.5, 17]) {
        for (const dth of [0, 0.06, -0.06, 0.12, -0.12]) {
          const x = Math.cos(th + dth) * R, z = Math.sin(th + dth) * R;
          const y = clear(x, z, r);
          if (y !== null) { spot = { x, z, y }; break; }
        }
        if (spot) break;
      }
      if (!spot) {
        const x = Math.cos(th) * 10.5, z = Math.sin(th) * 10.5;
        spot = { x, z, y: w.groundY(x, z) };
      }
      placed.push({ x: spot.x, z: spot.z, r });
      const T = THEMES[ctx.CHAPTERS[l.chapter].theme];
      const group = new THREE.Group();
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.12, 0.3, 8), toon(T.pedestal[1]));
      ped.position.y = 0.15;
      const fig = new THREE.Mesh(mergeFigure(cells), mat);
      fig.scale.setScalar(K);
      fig.position.y = 0.3;
      fig.castShadow = ped.receiveShadow = true;
      group.add(ped, fig);
      group.position.set(spot.x, spot.y, spot.z);
      group.rotation.y = Math.atan2(-spot.x, -spot.z);
      group.visible = false;
      prop(group, () => { ped.geometry.dispose(); ped.material.dispose(); fig.geometry.dispose(); });
      figures.push({ group, y: spot.y, at: 16.2 + i * 0.22, landed: false, top: spot.y + 0.3 + height * S * K, color: T.pedestal[2] });
    });
    C.props.push({ dispose: () => mat.dispose() });
  };

  play({
    end: 22.6,
    keep: true,
    cues: [
      [0, () => { fade('#000', 1, 0); orb = makeOrb(); orb.group.visible = false; inflow = makeInflow(); makeFigures(); }],
      [0.2, () => fade('#000', 0, 1.3)],
      [0.8, () => sfx(a => a.tone({ f: 98, f2: 196, type: 'sine', dur: 2.6, vol: 0.12, attack: 1.2, wet: 0.5 }))],
      [1.0, () => say('cine.end.0')],
      [4.2, () => rumble(3)],
      [5.0, () => say('cine.end.1')],
      [6.0, () => sfx(a => a.whoosh())],
      [9.6, () => say(null)],
      [10.5, () => swell()],
      [11.4, () => say('cine.end.2')],
      [13.5, () => ctx.audio.setWorld?.('meadow')], // birdsong instead of rain
      [15.3, () => { sfx(a => a.win()); if (!C.skipping) g.fx.confettiBurst(V(0, PEDESTAL_TOP + g.figureHeight, 0), 3, 240); }],
      [15.6, () => say(null)],
      [16.6, () => say('cine.end.3')],
      [21.6, () => say(null)],
    ],
    update(T, dt) {
      // eyes and heart light up, then soften to gold with the sunrise
      const lit = span(T, 0.8, 2.6), warm = span(T, 10.5, 13);
      glowCol.setHex(0x37b8ff).lerp(new THREE.Color(0xffb347), warm).multiplyScalar(lit * (0.85 + 0.15 * Math.sin(g.t * 3)));
      for (const v of eyes) v.mat.emissive.copy(glowCol);
      for (const v of heart) v.mat.emissive.copy(glowCol).multiplyScalar(0.7);
      // arms rise to cup the storm, and lower once it has become the sun
      arms.set(reach * ease(span(T, 4.2, 7.2)) * (1 - ease(span(T, 13.2, 15.2))));
      // the storm drains into the hands
      const gather = ease(span(T, 6.0, 10.6));
      for (const { m, home } of vortex) {
        m.visible = gather < 0.995;
        m.scale.setScalar(Math.max(0.001, 1 - gather));
        m.position.lerpVectors(home, hands, gather);
      }
      if (A.particles) { A.particles.material.opacity = 0.7 * (1 - span(T, 6.0, 9.0)); A.particles.visible = T < 9; }
      inflow.update(dt, Math.sin(span(T, 6.0, 11.0) * Math.PI) * 0.9);
      // the ball forms between the fists, turns gold and rises into the sky as the sun
      const form = easeOut(span(T, 6.2, 9.8)), rise = ease(span(T, 12.0, 15.2));
      orb.group.visible = form > 0.01 && rise < 0.999;
      orb.group.position.copy(hands).addScaledVector(sunDir, rise * 90);
      orb.group.scale.setScalar(1.25 * form * (1 + rise * 2));
      orb.u.time.value = g.t * (1.6 - warm);
      orb.u.a.value.copy(storm.a).lerp(gold.a, warm);
      orb.u.b.value.copy(storm.b).lerp(gold.b, warm);
      orb.halo.material.color.copy(storm.b).lerp(gold.b, warm);
      orb.halo.material.opacity = 0.5 * (1 - span(T, 14.2, 15.2));
      orb.halo.scale.setScalar(3.4 + warm * 2.6);
      const sunK = span(T, 13.6, 15.4);
      sunU.sunDir.value.copy(sunFrom.dir).lerp(sunDir, Math.min(1, sunK * 4)).normalize();
      sunU.sunSize.value = THREE.MathUtils.lerp(sunFrom.size, 0.006, sunK);
      sunU.sunGlow.value = THREE.MathUtils.lerp(sunFrom.glow, 0.55, sunK);
      sunU.sunCol.value.copy(sunFrom.col).lerp(gold.b, sunK);
      A.sun.position.copy(sunLight).lerp(sunDir.clone().multiplyScalar(32).setY(14), sunK);
      // storm → still night → morning
      const toNight = span(T, 6.0, 10.6);
      if (T < 11) applyMood(w, base, night, toNight);
      else applyMood(w, night, dawn, ease(span(T, 11, 15.4)));
      // the figures come home, dropping onto their pedestals one after another
      figures.forEach((f, i) => {
        const k = clamp01((T - f.at) / 0.55);
        f.group.visible = T >= f.at;
        f.group.position.y = f.y + (1 - k * k) * 16;
        const sq = k >= 1 ? Math.max(0, 1 - (T - f.at - 0.55) / 0.35) : 0;
        f.group.scale.set(1 + sq * 0.12, 1 - sq * 0.15, 1 + sq * 0.12);
        if (k >= 1 && !f.landed) {
          f.landed = true;
          chime(i);
          if (!C.skipping) {
            g.fx.burst(V(f.group.position.x, f.y + 0.3, f.group.position.z), 0xffffff, 14, 2.4);
            g.fx.burst(V(f.group.position.x, f.top, f.group.position.z), f.color, 10, 2);
          }
        }
      });
      // camera: the face, the arms rising, up into the sky with the sun, then a crane over the whole island
      let pos, look;
      if (T < 4.2) {
        const a = ease(span(T, 0, 4.2));
        pos = lerpV(V(0.9, 6.5, 6.6), V(0.4, 7.0, 4.9), a); look = V(0, 7.4, 0.5);
      } else if (T < 11) {
        const a = ease(span(T, 4.2, 8.2));
        pos = lerpV(V(0.4, 7.0, 4.9), V(3.0, 7.6, 15.5), a); look = lerpV(V(0, 7.4, 0.5), V(0, 6.0, 1), a);
      } else if (T < 15.6) {
        const a = ease(span(T, 11, 15.4));
        pos = lerpV(V(3.0, 7.6, 15.5), V(-2.5, 5.5, 21), a); look = lerpV(V(0, 6.0, 1), V(0, 11, -6), a);
      } else {
        // a crane up and around, picking up where the last shot ended
        const a = ease(span(T, 15.6, 22.6)), ang = -0.118 - a * 0.8 - Math.max(0, T - 22.6) * 0.04;
        const R = 21.15 + a * 13, h = 5.5 + a * 9;
        pos = V(Math.sin(ang) * R, h, Math.cos(ang) * R);
        look = lerpV(V(0, 11, -6), V(0, 3.5, 0), ease(span(T, 15.6, 19)));
      }
      aim(pos, look, T > 4.2 && T < 7.2 ? 0.04 : 0);
    },
    // the camera keeps drifting around the island behind Kubo's farewell and the ending panel
    finish() { done?.(); },
  });
}
