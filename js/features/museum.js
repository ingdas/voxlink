// Kubo's Garden: a walkable hub island where every rebuilt campaign figure stands on its own pedestal.
// Unfinished figures wait as dim ink silhouettes under a "?" so the collection goal stays visible.
import { buildWorld, THEMES, PEDESTAL_TOP } from '../world.js';
import { Player } from '../player.js';
import { S, DIRS, INK, buildVoxelGeometry, voxelMaterial, mulberry32 } from '../voxels.js';
import { toon, LAYER_OVERLAY } from '../render.js';
import { t } from '../i18n.js';

const gardenName = () => t('museum.name');
const FONTS = "Fredoka, 'M PLUS Rounded 1c', Jua, Mitr, 'Baloo Bhaijaan 2', sans-serif";
// .one / .other key for n (English uses the same text for both)
const plural = (key, n) => `${key}.${n === 1 ? 'one' : 'other'}`;
const K = 0.65; // figures stand at two-thirds size so all 16 fit around the plaza
const RING = 16; // pedestal ring radius
const ISLAND_R = 32;
const PED_H = 0.6; // pedestal top
const GAP = 1.3; // space between neighbouring pedestals
// chapter galleries sit in the four diagonals (atan2(z, x)); the gaps between them are paths
const CHAPTER_ANGLE = [225, 315, 45, 135].map(d => (d * Math.PI) / 180);
const NEAR = 2.4; // how close (beyond the pedestal edge) before the info card shows

let ctx, THREE, $;
let G = null; // live garden session
let from = 'title';

export function init(c) {
  ctx = c; THREE = c.THREE; $ = c.$;
  buildDom();
  ctx.modes.museum = dt => G?.update(dt);
  ctx.museum = { enter, exit, get active() { return !!G; }, get session() { return G; } };

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && G && ctx.app === 'museum' && ctx.input.enabled && !ctx.mobile) pauseGarden();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && ctx.app === 'museum') pauseGarden(); });
  $('btn-pause').addEventListener('click', () => { if (G && ctx.app === 'museum') pauseGarden(); });
  addEventListener('keydown', e => {
    if (!G || ctx.app !== 'museum' || !ctx.input.enabled || e.repeat) return;
    if (e.code === 'KeyC') openPhoto(false);
  });
}

const doneCount = () => ctx.LEVELS.filter(l => ctx.save.stars[l.id]?.done).length;

// ---------- DOM ----------
function buildDom() {
  // title screen + world map entry points
  const tb = document.createElement('button');
  tb.className = 'btn';
  tb.id = 'btn-garden';
  tb.innerHTML = `<svg><use href="#i-garden"/></svg>${t('museum.garden')}<span class="garden-count" id="garden-count"></span>`;
  tb.onclick = () => enter('title');
  $('title-extra').appendChild(tb);
  const refresh = () => { $('garden-count').textContent = t('museum.count', { n: doneCount(), total: ctx.LEVELS.length }); };
  refresh();
  new MutationObserver(refresh).observe($('screen-title'), { attributes: true, attributeFilter: ['class'] });

  const top = document.querySelector('#screen-map .map-top');
  const stars = top.querySelector('.star-total');
  const right = document.createElement('div');
  right.className = 'map-right';
  const mb = document.createElement('button');
  mb.className = 'btn icon';
  mb.id = 'btn-map-garden';
  mb.setAttribute('aria-label', gardenName());
  mb.innerHTML = '<svg><use href="#i-garden"/></svg>';
  mb.onclick = () => enter('map');
  top.insertBefore(right, stars);
  right.append(mb, stars);

  // HUD extras (only visible while body has .museum)
  const cam = document.createElement('button');
  cam.className = 'btn icon garden-only';
  cam.id = 'btn-garden-photo';
  cam.setAttribute('aria-label', t('museum.photo'));
  cam.innerHTML = '<svg><use href="#i-camera"/></svg>';
  cam.onclick = () => { if (G && ctx.app === 'museum') openPhoto(false); };
  document.querySelector('#hud .hud-top').appendChild(cam);

  const card = document.createElement('div');
  card.className = 'garden-card garden-only';
  card.id = 'garden-card';
  $('hud').appendChild(card);

  const hint = document.createElement('div');
  hint.className = 'garden-keys garden-only';
  hint.id = 'garden-keys';
  hint.innerHTML = ['museum.keys.walk', 'museum.keys.jump', 'museum.keys.menu'].map(k => `<span>${t(k)}</span>`).join('');
  $('hud').appendChild(hint);

  // pause screen for the garden
  const ps = document.createElement('div');
  ps.id = 'screen-garden-pause';
  ps.className = 'screen dim';
  ps.innerHTML = `
    <div class="panel narrow">
      <h2 class="center">${gardenName()}</h2>
      <div class="pause-figure tag" id="garden-pause-info"></div>
      <div class="stack">
        <button class="btn huge mint" id="btn-garden-resume"><svg><use href="#i-play"/></svg>${t('museum.pause.resume')}</button>
        <button class="btn" id="btn-garden-p-photo"><svg><use href="#i-camera"/></svg>${t('museum.pause.photo')}</button>
        <button class="btn" id="btn-garden-settings"><svg><use href="#i-gear"/></svg>${t('museum.pause.settings')}</button>
        <button class="btn" id="btn-garden-leave"><svg><use href="#i-home"/></svg>${t('museum.pause.leave')}</button>
      </div>
    </div>`;
  document.body.appendChild(ps);
  $('btn-garden-resume').onclick = () => resumeGarden();
  $('btn-garden-p-photo').onclick = () => openPhoto(true);
  $('btn-garden-settings').onclick = () => ctx.pushOverlay('screen-settings');
  $('btn-garden-leave').onclick = () => exit();
}

// ---------- enter / exit ----------
function enter(origin = 'title') {
  if (G) return;
  from = origin;
  const { audio, input, game } = ctx;
  audio.unlock();
  audio.suspend(false);
  game.unload();
  game.mode = 'idle'; // so enterTitle() reloads a showcase island afterwards
  G = new Garden();
  input.enabled = false;
  input.reset();
  const body = document.body;
  body.classList.remove('celebrating', 'playing');
  body.classList.add('museum');
  $('kubo-bark').classList.remove('show');
  $('crosshair').className = '';
  $('tooltip').classList.remove('show');
  $('coach').classList.remove('show');
  $('toast').classList.remove('show');
  const n = doneCount(), total = ctx.LEVELS.length;
  $('lvl-name').textContent = gardenName();
  $('count').textContent = t('museum.hudCount', { n, total });
  $('bar-fill').style.width = `${(n / total) * 100}%`;
  $('garden-keys').classList.remove('fade');
  $('hud').classList.remove('off');
  ctx.setBase(null);
  ctx.app = 'museum';
  if (ctx.mobile && ctx.save.settings.full) ctx.goFullscreen(true);
  const first = !ctx.save.seen.garden;
  if (first) {
    ctx.save.seen.garden = true;
    ctx.persist();
    ctx.talk([
      t('museum.talk.welcome', { name: gardenName() }),
      n ? t(plural('museum.talk.some', n), { n, total }) : t('museum.talk.empty'),
      t(ctx.mobile ? 'museum.talk.photo.touch' : 'museum.talk.photo.keys'),
    ], () => {
      if (!G) return;
      G.talkDone = true;
      if (!ctx.mobile) ctx.input.requestLock(); // the click / key that closed the dialogue allows it
    });
  } else {
    G.talkDone = true;
    G.greet = n === total ? t('museum.greet.all')
      : n === 0 ? t('museum.greet.none')
        : t(plural('museum.greet.some', n), { n, total });
    if (!ctx.mobile) input.requestLock(); // still inside the click that brought us here
  }
}

function exit() {
  if (!G) return;
  G.dispose();
  G = null;
  const body = document.body;
  body.classList.remove('museum', 'playing');
  $('garden-card').classList.remove('show');
  $('kubo-bark').classList.remove('show');
  ctx.input.enabled = false;
  ctx.input.reset();
  if (from === 'map') ctx.openMap(); else ctx.enterTitle();
}

function startControl() {
  ctx.input.enabled = true;
  ctx.input.reset();
  document.body.classList.add('playing');
}

function pauseGarden() {
  if (!G || ctx.app !== 'museum') return;
  ctx.app = 'paused'; // the main loop stops rendering behind the pause panel
  ctx.input.enabled = false;
  ctx.input.reset();
  ctx.input.exitLock();
  const n = doneCount();
  $('garden-pause-info').innerHTML = `<svg><use href="#i-garden"/></svg>${t(plural('museum.restored', n), { n, total: ctx.LEVELS.length })}`;
  $('garden-card').classList.remove('show');
  ctx.setBase('screen-garden-pause');
}

function resumeGarden() {
  if (!G) return;
  ctx.setBase(null);
  ctx.app = 'museum';
  $('hud').classList.remove('off');
  if (G.ready) startControl();
  if (!ctx.mobile) ctx.input.requestLock();
}

function openPhoto(fromPause) {
  if (!G || !ctx.photo) return;
  const near = G.near && G.near.kind === 'figure' ? G.near : null;
  const done = near && ctx.save.stars[near.level.id]?.done;
  ctx.input.enabled = false;
  $('garden-card').classList.remove('show');
  ctx.photo.open({
    name: done ? near.level.name : gardenName(),
    orbit: near ? {
      center: near.center.clone(), minDist: Math.max(2.2, near.r * 1.5, near.figH + 0.8), maxDist: 26,
      dist0: near.figH * 1.3 + near.r * 1.2 + 1.2, pitch0: 0.28,
    } : null,
    update: dt => G?.updateScenery(dt),
    onClose: () => {
      if (!G) return;
      if (fromPause) { ctx.app = 'museum'; pauseGarden(); return; }
      resumeGarden();
    },
  });
}

// ---------- the island ----------
class Garden {
  constructor() {
    const { renderer, scene, camera, save, LEVELS, CHAPTERS, expandLevel } = ctx;
    this.t = 0;
    this.disposables = [];
    this.world = buildWorld({
      rng: mulberry32(424242), radius: ISLAND_R, seed: 11, quality: renderer.mobile ? 'low' : 'high',
      theme: 'meadow', clearR: RING + 3.4,
    });
    scene.add(this.world.group);
    scene.fog.color.setHex(this.world.theme.skyHorizon);
    scene.fog.density = this.world.theme.fogDensity * 0.8;
    ctx.audio.surface = 'grass';
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.items = [];
    this.sprites = [];

    const vmat = voxelMaterial(renderer.gl); // shares the global number atlas: dispose the material only
    const silMat = toon(0x4a3f63);
    this.disposables.push(vmat, silMat);
    const mats = new Map();
    const mat = c => { if (!mats.has(c)) { const m = toon(c); mats.set(c, m); this.disposables.push(m); } return mats.get(c); };
    const octa = new Map();
    const octGeo = (r, h) => {
      const k = `${r.toFixed(2)}:${h}`;
      if (!octa.has(k)) { const g = new THREE.CylinderGeometry(r, r, h, 8); g.rotateY(Math.PI / 8); octa.set(k, g); this.disposables.push(g); }
      return octa.get(k);
    };
    const qTex = badgeTexture('?');
    this.disposables.push(qTex);

    CHAPTERS.forEach((ch, c) => {
      const T = THEMES[ch.theme];
      const items = ch.levels.map(l => {
        const { cells, height } = expandLevel(l);
        const reach = Math.max(...cells.map(cc => Math.hypot(cc.x, cc.z))) * S * K + S * K * 0.72;
        return { level: l, cells, height, r: Math.max(1.0, (reach + 0.3) / 0.924) };
      });
      const L = items.reduce((n, it) => n + it.r * 2, 0) + GAP * (items.length - 1);
      let a = CHAPTER_ANGLE[c] - L / 2 / RING, cum = 0;
      items.forEach(it => {
        const th = a + (cum + it.r) / RING;
        cum += it.r * 2 + GAP;
        const px = Math.cos(th) * RING, pz = Math.sin(th) * RING;
        const done = !!save.stars[it.level.id]?.done;
        // pedestal: two octagonal tiers in the chapter's colours
        const base = new THREE.Mesh(octGeo(it.r, 0.36), mat(T.pedestal[0]));
        base.position.set(px, 0.18, pz);
        const topR = it.r - 0.16;
        const top = new THREE.Mesh(octGeo(topR, 0.24), mat(done ? T.pedestal[1] : 0xd8ccb6));
        top.position.set(px, 0.36 + 0.12, pz);
        const trim = new THREE.Mesh(octGeo(topR * 0.35, 0.06), mat(done ? T.pedestal[2] : 0xbfb29b));
        trim.position.set(px, PED_H + 0.03, pz);
        this.group.add(base, top);
        if (!done) this.group.add(trim);
        // the figure, merged into one mesh (one draw call)
        const geo = mergeFigure(it.cells);
        this.disposables.push(geo);
        const fig = new THREE.Mesh(geo, done ? vmat : silMat);
        fig.scale.setScalar(K);
        fig.position.set(px, PED_H + (done ? 0 : 0.06), pz);
        fig.rotation.y = Math.atan2(-Math.cos(th), -Math.sin(th)); // face the plaza
        this.group.add(fig);
        const figH = it.height * S * K;
        const topY = PED_H + figH;
        if (!done) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: qTex, depthWrite: false, transparent: true }));
          this.disposables.push(sp.material);
          sp.layers.set(LAYER_OVERLAY);
          sp.renderOrder = 5;
          sp.scale.setScalar(0.85);
          sp.position.set(px, topY + 0.75, pz);
          sp.userData = { y: topY + 0.75, ph: th * 3 };
          this.group.add(sp);
          this.sprites.push(sp);
        }
        // octagon-ish collider: two crossed slabs and a core, tall enough that the figure can't be climbed
        const hy = Math.max(1.4, topY);
        for (const [hx, hz] of [[0.92, 0.38], [0.38, 0.92], [0.68, 0.68]]) {
          this.colliders.push(new THREE.Box3(new THREE.Vector3(px - hx * it.r, 0, pz - hz * it.r), new THREE.Vector3(px + hx * it.r, hy, pz + hz * it.r)));
        }
        this.items.push({ kind: 'figure', ...it, done, th, x: px, z: pz, figH, center: new THREE.Vector3(px, PED_H + figH * 0.5, pz) });
      });
      // a little sign in front of each chapter gallery
      const nDone = ch.levels.filter(l => save.stars[l.id]?.done).length;
      this.addSign(ch, c, nDone, T, mat);
    });

    this.addKubo(mat);
    this.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.allColliders = this.world.colliders.concat(this.colliders);

    // player starts on the south path, looking at Kubo in the middle of the plaza
    this.player = new Player();
    this.player.onStep = () => ctx.audio.step();
    this.player.onLand = v => ctx.audio.land(v);
    this.player.onJump = () => ctx.audio.jump();
    this.player.spawn(0, 8.5, 0);
    this.player.pitch = -0.08;
    // intro: glide down from above the plaza
    this.introT = 0;
    this.camFrom = { pos: new THREE.Vector3(0, 15, 24), quat: new THREE.Quaternion() };
    const m = new THREE.Matrix4().lookAt(this.camFrom.pos, new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 1, 0));
    this.camFrom.quat.setFromRotationMatrix(m);
    camera.position.copy(this.camFrom.pos);
    camera.quaternion.copy(this.camFrom.quat);
    this.ready = false;
    this.talkDone = false;
    this.near = null;
    this.nearKey = '';
    this.renderer = renderer;
    renderer.gl.compile(scene, camera);
  }

  addSign(ch, c, nDone, T, mat) {
    const th = CHAPTER_ANGLE[c], r = RING - 4.6;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-Math.cos(th), -Math.sin(th));
    const wood = mat(0x9a6b4f);
    const postGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
    const boardGeo = new THREE.BoxGeometry(2.3, 0.95, 0.12);
    this.disposables.push(postGeo, boardGeo);
    for (const sx of [-0.8, 0.8]) { const p = new THREE.Mesh(postGeo, wood); p.position.set(sx, 0.31, 0); g.add(p); }
    const board = new THREE.Mesh(boardGeo, mat(T.cliff));
    board.position.y = 1.0;
    g.add(board);
    const tex = signTexture(c + 1, ch.name, nDone, ch.levels.length, T);
    const faceGeo = new THREE.PlaneGeometry(2.14, 0.8);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xf4f0ea });
    this.disposables.push(tex, faceGeo, faceMat);
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 1.0, 0.065);
    g.add(face);
    this.group.add(g);
    // (the sign is rotated, so collide with a small square around it)
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.75, 0, z - 0.75), new THREE.Vector3(x + 0.75, 1.5, z + 0.75)));
  }

  addKubo(mat) {
    const k = new THREE.Group();
    const s = 1.35;
    const bodyGeo = new THREE.BoxGeometry(s, s, s);
    const eyeGeo = new THREE.BoxGeometry(0.15, 0.3, 0.06);
    const shineGeo = new THREE.BoxGeometry(0.06, 0.08, 0.03);
    const mouthGeo = new THREE.BoxGeometry(0.34, 0.07, 0.05);
    const cheekGeo = new THREE.BoxGeometry(0.2, 0.1, 0.03);
    this.disposables.push(bodyGeo, eyeGeo, shineGeo, mouthGeo, cheekGeo);
    const body = new THREE.Mesh(bodyGeo, mat(0xffc93c));
    k.add(body);
    const ink = mat(0x2a1f3d), white = mat(0xffffff), pink = mat(0xff8f8f);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, ink); e.position.set(sx * 0.27, 0.12, s / 2 + 0.02); k.add(e);
      const w = new THREE.Mesh(shineGeo, white); w.position.set(sx * 0.27 - 0.03, 0.2, s / 2 + 0.06); k.add(w);
      const ck = new THREE.Mesh(cheekGeo, pink); ck.position.set(sx * 0.48, -0.12, s / 2 + 0.01); k.add(ck);
    }
    const mouth = new THREE.Mesh(mouthGeo, ink); mouth.position.set(0, -0.2, s / 2 + 0.02); k.add(mouth);
    k.position.set(0, PEDESTAL_TOP + s / 2, 0);
    k.rotation.z = -0.07;
    this.kubo = k;
    this.kuboBaseY = k.position.y;
    this.group.add(k);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-0.85, 0, -0.85), new THREE.Vector3(0.85, PEDESTAL_TOP + s + 0.1, 0.85)));
    this.items.push({ kind: 'kubo', x: 0, z: 0, r: 1.6, center: new THREE.Vector3(0, 1.2, 0) });
  }

  // world animation that also runs while photo mode holds the camera
  updateScenery(dt) {
    this.t += dt;
    const cam = ctx.camera;
    this.world.update(dt, this.t, cam.position);
    for (const sp of this.sprites) sp.position.y = sp.userData.y + Math.sin(this.t * 2 + sp.userData.ph) * 0.12;
    // Kubo turns to watch you and bobs a little
    const p = this.player.pos;
    const want = Math.atan2(p.x, p.z);
    let d = want - this.kubo.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.kubo.rotation.y += d * Math.min(1, dt * 3);
    this.kubo.position.y = this.kuboBaseY + Math.abs(Math.sin(this.t * 2.2)) * 0.08;
  }

  update(dt) {
    const { camera, input } = ctx;
    this.updateScenery(dt);
    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / 1.7);
      const k = 1 - Math.pow(1 - this.introT, 3);
      this.player.applyCamera(camera);
      const toP = camera.position.clone(), toQ = camera.quaternion.clone();
      camera.position.lerpVectors(this.camFrom.pos, toP, k);
      camera.quaternion.slerpQuaternions(this.camFrom.quat, toQ, k);
    } else {
      if (!this.ready && this.talkDone) {
        this.ready = true;
        startControl();
        if (this.greet) { ctx.kuboSays(this.greet); this.greet = null; }
      }
      if (input.enabled) {
        const look = input.poll();
        for (const a of input.takeActions()) {
          if (a.type === 'jump') this.player.jumpBuffer = 0.14;
          else if (a.type === 'pause') pauseGarden();
          else if (a.type === 'interact') this.interact();
        }
        this.player.update(dt, input, look, this.allColliders, this.world);
        if (Math.hypot(this.player.pos.x, this.player.pos.z - 8.5) > 3 || this.t > 16) $('garden-keys').classList.add('fade');
      }
      this.player.applyCamera(camera);
    }
    camera.updateMatrixWorld();
    this.updateNear();
  }

  interact() {
    if (this.near?.kind === 'kubo') { ctx.kuboSays(kuboLine()); return; }
    if (this.near?.kind === 'figure' && !this.near.done) ctx.audio.wrong();
  }

  updateNear() {
    const p = this.player.pos;
    let best = null, bd = NEAR;
    if (this.ready) {
      for (const it of this.items) {
        const d = Math.hypot(p.x - it.x, p.z - it.z) - it.r;
        if (d < bd) { bd = d; best = it; }
      }
    }
    this.near = best;
    const key = best ? (best.level?.id || best.kind) : '';
    if (key === this.nearKey) return;
    this.nearKey = key;
    const card = $('garden-card');
    if (!best) { card.classList.remove('show'); return; }
    card.innerHTML = cardHtml(best);
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    if (best.kind === 'figure') ctx.audio.hover();
  }

  dispose() {
    const { scene } = ctx;
    scene.remove(this.world.group);
    this.world.dispose();
    scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
  }
}

// ---------- helpers ----------
function cardHtml(it) {
  if (it.kind === 'kubo') {
    return `<div class="gc-thumb kubo-thumb"><div class="kubo mini"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div></div>
      <div class="gc-body"><small>${t('museum.card.keeper')}</small><b>${t('museum.card.kubo')}</b><div class="gc-row"><span class="gc-act">${t(ctx.mobile ? 'museum.card.chat.touch' : 'museum.card.chat.mouse')}</span></div></div>`;
  }
  const l = it.level, ch = ctx.CHAPTERS[l.chapter];
  const s = ctx.save.stars[l.id] || {};
  const thumb = ctx.thumbs[l.index] || '';
  const where = t('museum.card.figureIndex', { chapter: ch.name, n: l.indexInChapter + 1 });
  if (!it.done) {
    const locked = l.index >= ctx.save.unlocked;
    return `<div class="gc-thumb mystery"><img src="${thumb}" alt=""><span class="q">?</span></div>
      <div class="gc-body"><small>${where}</small><b>${t('museum.card.mystery')}</b>
      <div class="gc-row"><span class="gc-act">${locked ? `<svg><use href="#i-lock"/></svg>${t('museum.card.notFound')}` : t('museum.card.hint', { tag: l.tag })}</span></div></div>`;
  }
  const stars = [s.done, s.fast, s.clean].map(on => `<svg class="${on ? 'on' : ''}"><use href="#i-star"/></svg>`).join('');
  const best = ctx.save.best[l.id];
  return `<div class="gc-thumb"><img src="${thumb}" alt=""></div>
    <div class="gc-body"><small>${where}</small><b>${l.name}</b>
    <div class="gc-row"><span class="gc-stars">${stars}</span>${best ? `<span class="gc-time"><svg><use href="#i-clock"/></svg>${ctx.fmt(best)}</span>` : ''}</div></div>`;
}

function kuboLine() {
  const n = doneCount(), total = ctx.LEVELS.length;
  const next = ctx.LEVELS.find(l => l.index < ctx.save.unlocked && !ctx.save.stars[l.id]?.done);
  const pool = [
    t(plural('museum.line.home', n), { n, total }),
    t('museum.line.hum'),
    t('museum.line.photo'),
  ];
  if (next) pool.push(t('museum.line.hint', { tag: next.tag }));
  if (n === total) pool.push(t('museum.line.allStars'));
  return pool[Math.floor(Math.random() * pool.length)];
}

// One BufferGeometry for a whole figure: only faces that touch air, positions offset per cell, indices re-based.
function mergeFigure(cells) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const has = new Set(cells.map(c => key(c.ix, c.iy, c.iz)));
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (const c of cells) {
    const open = DIRS.map(d => !has.has(key(c.ix + d.n[0], c.iy + d.n[1], c.iz + d.n[2])));
    if (!open.some(Boolean)) continue;
    const g = buildVoxelGeometry(open.map(() => ({ type: 'color', color: c.color })));
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, C = g.attributes.color.array;
    const ox = c.x * S, oy = c.iy * S + S / 2, oz = c.z * S;
    open.forEach((o, d) => {
      if (!o) return;
      const base = pos.length / 3;
      for (let v = d * 4; v < d * 4 + 4; v++) {
        pos.push(P[v * 3] + ox, P[v * 3 + 1] + oy, P[v * 3 + 2] + oz);
        nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        uv.push(U[v * 2], U[v * 2 + 1]);
        col.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
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
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

function badgeTexture(txt) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = INK;
  g.beginPath(); g.arc(64, 70, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff4e0';
  g.beginPath(); g.arc(64, 62, 50, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 70px ${FONTS}`;
  g.fillText(txt, 64, 66);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Text drawn at `size` px, shrunk until it fits in `maxW`.
function fitText(g, text, x, y, size, maxW, weight = 700) {
  let fs = size;
  g.font = `${weight} ${fs}px ${FONTS}`;
  const w = g.measureText(text).width;
  if (w > maxW) { fs = Math.max(10, Math.floor(size * maxW / w)); g.font = `${weight} ${fs}px ${FONTS}`; }
  g.fillText(text, x, y, maxW);
}

function signTexture(num, name, done, total, T) {
  const W = 512, H = 192, MAX_W = W - 56;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const hex = c => `#${c.toString(16).padStart(6, '0')}`;
  const head = t('museum.sign.chapter', { n: num });
  const foot = t(plural('museum.restored', done), { n: done, total });
  const paint = () => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff4e0';
    g.fillRect(0, 0, W, H);
    g.lineWidth = 10; g.strokeStyle = INK;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = hex(T.pedestal[2]);
    g.fillRect(10, 10, W - 20, 18);
    g.fillStyle = INK;
    g.fillRect(10, 28, W - 20, 5);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
    g.fillStyle = '#5b4f73';
    fitText(g, head, W / 2, 60, 26, MAX_W);
    g.fillStyle = INK;
    fitText(g, name, W / 2, 110, 58, MAX_W);
    g.fillStyle = done === total ? '#1f9e66' : '#5b4f73';
    fitText(g, foot, W / 2, 160, 28, MAX_W, 600);
  };
  paint();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // the texture is built synchronously: repaint once the (possibly non-Latin) glyphs have loaded
  if (document.fonts?.load) {
    Promise.all([
      document.fonts.load(`700 40px ${FONTS}`, head + name),
      document.fonts.load(`600 28px ${FONTS}`, foot),
    ]).then(() => { paint(); tex.needsUpdate = true; }).catch(() => {});
  }
  return tex;
}
