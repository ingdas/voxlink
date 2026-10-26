// The Keeper's Isle (js/nexus.js) is the world select, and you walk it in first person: walk into a world's portal
// to travel there; a world's own portal (on its middle island) brings you back out of that world's portal here.
// Closed worlds have a gate on their bridge until the world before them is rebuilt; a newly opened one wakes as
// you arrive. A flowery arch leads to Kubo's Garden. Going between places runs through a short flash of light.
import { buildNexus } from '../nexus.js';
import { THEMES } from '../world.js';
import { Player } from '../player.js';
import { voxelMaterial } from '../voxels.js';
import { t } from '../i18n.js';
import { midgame } from '../crazygames.js';
import { fitText, FONTS } from './museum.js';

const plural = (key, n) => `${key}.${n === 1 ? 'one' : 'other'}`;
const hex = c => `#${c.toString(16).padStart(6, '0')}`;

let ctx, $;
let N = null; // the isle while you're on it

export function init(c) {
  ctx = c; $ = c.$;
  buildDom();
  ctx.modes.nexus = dt => N?.update(dt);
  ctx.nexus = { enter, leave: exit, get active() { return !!N; }, get session() { return N; } };
  ctx.warp = warp;
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && N && ctx.app === 'nexus' && ctx.input.enabled && !ctx.mobile) pauseIsle();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && N && ctx.app === 'nexus') pauseIsle(); });
  $('btn-pause').addEventListener('click', () => { if (N && ctx.app === 'nexus') pauseIsle(); });
  // without pointer lock (it was refused, or a keyboard-only player) Esc still opens the menu
  addEventListener('keydown', e => { if (e.code === 'Escape' && N && ctx.app === 'nexus' && !document.pointerLockElement && !ctx.overlays.length) pauseIsle(); });
}

const isDone = l => !!ctx.save.stars[l.id]?.done;
const starsOf = l => { const s = ctx.save.stars[l.id] || {}; return !!s.done + !!s.fast + !!s.clean; };
const totalStars = () => ctx.LEVELS.reduce((n, l) => n + starsOf(l), 0);
const GARDEN = () => ctx.CHAPTERS.length; // the Garden's islet comes after the worlds'

// ---------- DOM ----------
function buildDom() {
  const card = document.createElement('div');
  card.className = 'garden-card nexus-card nexus-only';
  card.id = 'nexus-card';
  $('hud').appendChild(card);

  const keys = document.createElement('div');
  keys.className = 'garden-keys nexus-only';
  keys.id = 'nexus-keys';
  keys.innerHTML = ['museum.keys.walk', 'museum.keys.jump', 'museum.keys.menu'].map(k => `<span>${t(k)}</span>`).join('');
  $('hud').appendChild(keys);

  const ps = document.createElement('div');
  ps.id = 'screen-nexus-pause';
  ps.className = 'screen dim';
  ps.innerHTML = `
    <div class="panel narrow">
      <h2 class="center">${t('nexus.name')}</h2>
      <div class="pause-figure tag" id="nexus-pause-info"></div>
      <div class="stack">
        <button class="btn huge mint" id="btn-nexus-resume"><svg><use href="#i-play"/></svg><span>${t('pause.resume')}</span></button>
        <button class="btn" id="btn-nexus-settings"><svg><use href="#i-gear"/></svg><span>${t('common.settings')}</span></button>
        <button class="btn" id="btn-nexus-ending"><svg><use href="#i-play"/></svg><span>${t('complete.epilogue')}</span></button>
        <button class="btn" id="btn-nexus-leave"><svg><use href="#i-home"/></svg><span>${t('nexus.pause.leave')}</span></button>
      </div>
    </div>`;
  document.body.appendChild(ps);
  $('btn-nexus-resume').onclick = () => resumeIsle();
  $('btn-nexus-settings').onclick = () => ctx.pushOverlay('screen-settings');
  $('btn-nexus-ending').onclick = () => { exit(); ctx.showEnding(); };
  $('btn-nexus-leave').onclick = () => { exit(); ctx.enterTitle(); };

  const w = document.createElement('div');
  w.id = 'warp';
  document.body.appendChild(w);
}

// ---------- going places ----------
// A flash of light in `color`: the screen fills, fn() swaps what's behind it, and it fades again. With `ad` (a walk
// through a portal) an interstitial gets its turn while the screen is filled; off CrazyGames that's instant.
let warping = false;
function warp(color, fn, ad = false) {
  if (warping) return;
  warping = true;
  const el = $('warp');
  el.style.setProperty('--warp', color);
  el.classList.add('on');
  ctx.input.enabled = false;
  ctx.input.reset();
  ctx.audio.whoosh?.();
  ctx.audio.tone({ f: 420, f2: 980, type: 'sine', dur: 0.5, vol: 0.07, wet: 0.5 });
  const swap = () => {
    try { fn(); } finally {
      warping = false;
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
    }
  };
  setTimeout(() => { if (ad) midgame().then(swap); else swap(); }, 280);
}

// from: the world (chapter) whose portal you came through, or 'garden'; unlock: a world that has just opened (its
// gate sinks as you arrive on the plaza in front of it). Neither: you arrive on the plaza facing your current world.
// before(): clears away where you were, behind the flash (the Garden)
// ad: arriving by walking through a world's portal (an interstitial goes with the flash; the menus' way here doesn't)
function enter({ from = null, unlock = null, before = null, ad = false } = {}) {
  if (N || warping) return;
  const { audio, input } = ctx;
  audio.unlock();
  audio.suspend(false);
  const first = !ctx.save.seen.nexus;
  // still inside the click or key press that brought us here: lock the pointer now (the Keeper's welcome needs it free)
  if (!ctx.mobile && !first) input.requestLock();
  else if (first) input.exitLock();
  ctx.hideDoneCard?.();
  warp('#fff4dc', () => {
    before?.();
    ctx.game.unload();
    ctx.game.mode = 'idle'; // so enterTitle() reloads a showcase island afterwards
    N = new Isle({ from, unlock });
    const body = document.body;
    body.classList.remove('celebrating', 'playing', 'roaming', 'offisland', 'museum');
    body.classList.add('nexus');
    $('kubo-bark').classList.remove('show');
    $('crosshair').className = '';
    for (const id of ['tooltip', 'coach', 'toast']) $(id).classList.remove('show');
    const n = totalStars(), max = ctx.LEVELS.length * 3;
    $('lvl-name').textContent = t('nexus.name');
    $('count').textContent = `★ ${n} / ${max}`;
    $('stage').textContent = '';
    $('bar-fill').style.width = `${(n / max) * 100}%`;
    $('nexus-keys').classList.remove('fade');
    $('hud').classList.remove('off');
    ctx.setBase(null);
    ctx.app = 'nexus';
    if (ctx.mobile && ctx.save.settings.full) ctx.goFullscreen(true);
    if (first) {
      ctx.save.seen.nexus = true;
      ctx.persist();
      ctx.talk([t('nexus.talk.welcome'), t('nexus.talk.portals'), t('nexus.talk.garden')], () => {
        if (!N) return;
        N.talkDone = true;
        if (!ctx.mobile) ctx.input.requestLock(); // the click / key that closed the dialogue allows it
      });
    } else N.talkDone = true;
  }, ad);
}

function exit() {
  if (!N) return;
  N.dispose();
  N = null;
  document.body.classList.remove('nexus', 'playing');
  $('nexus-card').classList.remove('show');
  $('kubo-bark').classList.remove('show');
  ctx.input.enabled = false;
  ctx.input.reset();
}

function startControl() {
  ctx.input.enabled = true;
  ctx.input.reset();
  document.body.classList.add('playing');
}

function pauseIsle() {
  // not during Kubo's welcome or a flash: control would never come back
  if (!N || ctx.app !== 'nexus' || ctx.overlays.includes('screen-talk') || warping) return;
  ctx.app = 'paused';
  ctx.input.enabled = false;
  ctx.input.reset();
  ctx.input.exitLock();
  $('nexus-pause-info').innerHTML = `<svg><use href="#i-star"/></svg><bdi class="n">${totalStars()} / ${ctx.LEVELS.length * 3}</bdi>`;
  $('btn-nexus-ending').style.display = isDone(ctx.LEVELS[ctx.LEVELS.length - 1]) ? '' : 'none';
  $('nexus-card').classList.remove('show');
  ctx.setBase('screen-nexus-pause');
}

function resumeIsle() {
  if (!N) return;
  ctx.setBase(null);
  ctx.app = 'nexus';
  $('hud').classList.remove('off');
  N.cardKey = ''; // the pause hid the card: show it again if you're still by a portal
  if (N.ready) startControl();
  if (!ctx.mobile) ctx.input.requestLock();
}

// ---------- the isle ----------
class Isle {
  constructor({ from, unlock }) {
    const { renderer, scene, camera, save, LEVELS, CHAPTERS, expandLevel, THREE } = ctx;
    this.t = 0;
    this.figureMat = voxelMaterial(renderer.gl);
    const fig = l => (isDone(l) ? { ...expandLevel(l), gold: starsOf(l) === 3 } : null);
    const slots = CHAPTERS.map((ch, c) => {
      const ls = ch.levels;
      return {
        theme: ch.theme, open: ctx.chapterUnlocked(c) && c !== unlock,
        minis: ls.slice(0, 4).map(fig), finale: fig(ls[ls.length - 1]),
        done: ls.every(isDone), crowned: ls.every(l => starsOf(l) === 3),
      };
    });
    slots.push({ theme: 'meadow', garden: true, open: true });
    const t0 = performance.now();
    this.isle = buildNexus({ quality: renderer.mobile ? 'low' : 'high', slots, figureMat: this.figureMat, sign: i => signTexture(i) });
    this.buildMs = performance.now() - t0;
    this.isle.api.calmMotion = () => document.body.classList.contains('reduce-motion');
    scene.add(this.isle.group);
    const T = THEMES.nexus;
    scene.fog.color.setHex(T.skyHorizon);
    scene.fog.density = T.fogDensity;
    ctx.audio.setWorld?.('nexus');

    this.player = new Player();
    this.player.onStep = (hs, surf) => ctx.audio.step(surf?.sound);
    this.player.onLand = v => ctx.audio.land(v);
    this.player.onJump = () => ctx.audio.jump();
    this.player.onRescue = () => ctx.audio.whoosh(1);
    // where you arrive: out of the portal you came through, or on the plaza facing the world that's next
    this.current = CHAPTERS.findIndex(ch => ch.levels.some(l => l.index < save.unlocked && !isDone(l)));
    const facing = unlock ?? (this.current >= 0 ? this.current : CHAPTERS.length - 1);
    const viaPortal = from === 'garden' ? GARDEN() : typeof from === 'number' && unlock == null ? from : null;
    const a = viaPortal != null ? this.isle.arrival(viaPortal) : this.isle.plazaSpot(facing);
    this.player.spawn(a.x, a.z, a.yaw);
    this.player.pitch = -0.06;
    this.player.applyCamera(camera);
    // the camera glides out of the portal behind you, or down from above the plaza
    this.camFrom = { pos: new THREE.Vector3(), quat: camera.quaternion.clone() };
    if (viaPortal != null) this.camFrom.pos.copy(this.isle.portalPos(viaPortal)).setY(this.player.pos.y + 1.55);
    else {
      this.camFrom.pos.set(a.x * 0.2, 16, a.z * 0.2 + 0.01).add(new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)).multiplyScalar(14));
      const m = new THREE.Matrix4().lookAt(this.camFrom.pos, new THREE.Vector3(a.x, 1.5, a.z), new THREE.Vector3(0, 1, 0));
      this.camFrom.quat.setFromRotationMatrix(m);
    }
    camera.position.copy(this.camFrom.pos);
    camera.quaternion.copy(this.camFrom.quat);
    this.introT = 0;
    this.introLen = viaPortal != null ? 0.9 : 1.7;
    this.isle.setBeacon(unlock ?? (this.current >= 0 ? this.current : null));
    this.unlock = unlock;
    this.ready = false;
    this.talkDone = false;
    this.cardKey = '';
    this.leaving = false;
    this.inPortal = this.isle.portalAt(a.x, a.z);
    this.gateTold = -1;
    renderer.gl.compile(scene, camera);
  }

  // you're in: a world that has just opened wakes, otherwise a word from Kubo now and then
  arrived() {
    const { CHAPTERS } = ctx;
    if (this.unlock != null) {
      const c = this.unlock;
      setTimeout(() => {
        if (N !== this) return;
        this.isle.openGate(c);
        ctx.audio.tone({ f: 330, f2: 660, type: 'triangle', dur: 0.5, vol: 0.1 });
        setTimeout(() => ctx.audio.star?.(2), 700);
        ctx.kuboSays(t('nexus.unlocked', { world: `<b>${CHAPTERS[c].name}</b>` }), true);
      }, 350);
    }
  }

  update(dt) {
    const { camera, input } = ctx;
    this.t += dt;
    this.isle.update(dt, this.t, camera.position);
    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / this.introLen);
      const k = 1 - Math.pow(1 - this.introT, 3);
      this.player.applyCamera(camera);
      const toP = camera.position.clone(), toQ = camera.quaternion.clone();
      camera.position.lerpVectors(this.camFrom.pos, toP, k);
      camera.quaternion.slerpQuaternions(this.camFrom.quat, toQ, k);
    } else {
      if (!this.ready && this.talkDone) { this.ready = true; startControl(); this.arrived(); }
      if (input.enabled) {
        const look = input.poll();
        for (const a of input.takeActions()) {
          if (a.type === 'jump') this.player.jumpBuffer = 0.14;
          else if (a.type === 'pause') pauseIsle();
        }
        this.player.update(dt, input, look, this.isle.api.colliders, this.isle.api);
        if (this.t > 14 || this.player.pos.distanceTo(this.player.lastSafe) > 4) $('nexus-keys').classList.add('fade');
      }
      this.player.applyCamera(camera);
      if (this.ready && !this.leaving) this.checkWay();
    }
    camera.updateMatrixWorld();
    this.updateCard();
  }

  // stepping into a portal, or against a closed gate
  checkWay() {
    const { x, z } = this.player.pos;
    const k = this.isle.portalAt(x, z);
    if (k >= 0 && k !== this.inPortal) this.travel(k);
    this.inPortal = k;
    const g = this.isle.gateAt(x, z);
    if (g >= 0 && g !== this.gateTold) ctx.kuboSays(t('nexus.locked', { world: `<b>${ctx.CHAPTERS[g - 1].name}</b>` }));
    this.gateTold = g;
  }

  travel(k) {
    const { save, CHAPTERS } = ctx;
    this.leaving = true;
    if (k === GARDEN()) {
      if (!save.seen.garden) ctx.input.exitLock(); // Kubo's welcome there needs the pointer
      warp('#c9f2b0', () => { exit(); ctx.museum.enter('nexus'); });
      return;
    }
    const ch = CHAPTERS[k], T = THEMES[ch.theme];
    const go = () => warp(hex(T.skyHorizon), () => { exit(); ctx.enterWorld(k); }, true); // through a portal: an interstitial's turn
    // the first visit: Kubo tells you about the world before you go through
    if (!save.seen[ch.id]) {
      save.seen[ch.id] = true;
      ctx.persist();
      ctx.input.enabled = false;
      ctx.input.reset();
      ctx.input.exitLock();
      ctx.talk(ch.intro, () => { if (!ctx.mobile) ctx.input.requestLock(); go(); });
    } else go();
  }

  // the card for the world you're at (on its islet or bridge, or by its sign)
  updateCard() {
    const p = this.player.pos;
    const k = this.ready && !this.leaving ? this.isle.slotAt(p.x, p.z) : -1;
    const key = k >= 0 ? `${k}:${this.isle.islets[k].open && this.isle.islets[k].portal.wake >= 1}` : '';
    if (key === this.cardKey) return;
    this.cardKey = key;
    const card = $('nexus-card');
    if (k < 0) { card.classList.remove('show'); return; }
    card.innerHTML = cardHtml(k, this.isle.islets[k].open);
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    ctx.audio.hover();
  }

  dispose() {
    ctx.scene.remove(this.isle.group);
    this.isle.dispose();
    this.figureMat.dispose();
  }
}

// ---------- cards and signs ----------
function worldInfo(c) {
  const ch = ctx.CHAPTERS[c];
  const stars = ch.levels.reduce((n, l) => n + starsOf(l), 0), max = ch.levels.length * 3;
  return { ch, stars, max, crowned: stars === max, T: THEMES[ch.theme] };
}

function cardHtml(k, open) {
  const { LEVELS } = ctx;
  if (k === GARDEN()) {
    const n = LEVELS.filter(isDone).length;
    return `<div class="gc-thumb nx-portal garden"><svg><use href="#i-garden"/></svg></div>
      <div class="gc-body"><small>${t(plural('museum.restored', n), { n, total: LEVELS.length })}</small><b>${t('museum.name')}</b>
      <div class="gc-row"><span class="gc-act">${t('nexus.card.gardenIn')}</span></div></div>`;
  }
  const { ch, stars, max, crowned, T } = worldInfo(k);
  const prev = ctx.CHAPTERS[k - 1];
  const figs = ch.levels.map(l => (isDone(l) ? `<img src="${ctx.thumbs[l.index] || ''}" alt="" class="${starsOf(l) === 3 ? 's3' : ''}">` : `<i class="${l.index < ctx.save.unlocked && open ? 'open' : ''}">?</i>`)).join('');
  const act = open ? t('nexus.card.walkIn') : `<svg><use href="#i-lock"/></svg>${t('nexus.card.sleeping', { world: prev?.name ?? '' })}`;
  return `<div class="gc-thumb nx-portal ${open ? '' : 'asleep'}" style="--a:${hex(T.skyTop)};--b:${hex(T.skyHorizon)};--c:${hex(T.grass)}"><span>${k + 1}</span>${crowned ? '<svg class="nx-crown"><use href="#i-star"/></svg>' : ''}</div>
    <div class="gc-body"><small>${t('map.chapter', { n: k + 1 })} · <svg class="ic"><use href="#i-star"/></svg><bdi class="n">${stars} / ${max}</bdi></small><b>${ch.name}</b>
    <div class="nx-figs">${figs}</div>
    <div class="gc-row"><span class="gc-act">${act}</span></div></div>`;
}

// the sign at a bridge head: the world's number and name, its stars (or that it's still asleep)
function signTexture(k) {
  const { THREE, LEVELS, CHAPTERS } = ctx;
  const W = 512, H = 250, MAX_W = W - 56;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const garden = k === GARDEN();
  const info = garden ? null : worldInfo(k);
  const open = garden || ctx.chapterUnlocked(k);
  const n = LEVELS.filter(isDone).length;
  const head = garden ? t('museum.garden') : t('map.chapter', { n: k + 1 });
  const name = garden ? t('museum.name') : info.ch.name;
  const foot = garden ? t(plural('museum.restored', n), { n, total: LEVELS.length }) : open ? `★ ${info.stars} / ${info.max}` : t('nexus.sign.asleep');
  const band = garden ? '#63b862' : hex(info.T.pedestal[2]);
  const paint = () => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff4e0';
    g.fillRect(0, 0, W, H);
    g.lineWidth = 10; g.strokeStyle = '#2a1f3d';
    g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = band;
    g.fillRect(10, 10, W - 20, 22);
    g.fillStyle = '#2a1f3d';
    g.fillRect(10, 32, W - 20, 5);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
    g.fillStyle = '#5b4f73';
    fitText(g, head, W / 2, 68, 28, MAX_W);
    g.fillStyle = '#2a1f3d';
    fitText(g, name, W / 2, 130, 60, MAX_W);
    g.fillStyle = !garden && info.crowned ? '#c98a00' : open ? '#5b4f73' : '#8a8098';
    fitText(g, foot, W / 2, 196, 34, MAX_W, 600);
  };
  paint();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // repaint once the (possibly non-Latin) glyphs have loaded
  if (document.fonts?.load) {
    Promise.all([document.fonts.load(`700 40px ${FONTS}`, head + name), document.fonts.load(`600 30px ${FONTS}`, foot)])
      .then(() => { paint(); tex.needsUpdate = true; }).catch(() => {});
  }
  return tex;
}
