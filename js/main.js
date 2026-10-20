import * as THREE from 'three';
import { Renderer } from './render.js';
import { LEVELS, CHAPTERS, ENDING, expandLevel, parTime } from './levels.js';
import { THEMES } from './world.js';
import { S, buildVoxelGeometry, voxelMaterial, generatePuzzle, mulberry32, getAtlas } from './voxels.js';
import { Game, PACK_SIZE } from './game.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import FEATURES from './features/index.js';
import { t, setLocale, detectLocale, applyDom, listJoin } from './i18n.js';
import { localizeContent } from './i18n-content.js';

const $ = id => document.getElementById(id);
const mobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
document.body.classList.toggle('mobile', mobile);

// ---------- persistence ----------
const SAVE_KEY = 'voxlink.v2';
const save = Object.assign({ unlocked: 1, best: {}, stars: {}, seen: {}, settings: {} }, safeParse(localStorage.getItem(SAVE_KEY)));
save.settings = Object.assign({ sens: 1, sfx: 0.8, music: 0.45, invert: false, outline: true, full: mobile }, save.settings);
function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } }
const starsOf = id => { const s = save.stars[id]; return s ? (s.done ? 1 : 0) + (s.fast ? 1 : 0) + (s.clean ? 1 : 0) : 0; };
const isDone = id => !!save.stars[id]?.done;
const totalStars = () => LEVELS.reduce((n, l) => n + starsOf(l.id), 0);

const fmt = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hex = c => `#${c.toString(16).padStart(6, '0')}`;

// ---------- logo ----------
function buildLogo(el) {
  const colors = ['var(--sun)', 'var(--coral)', 'var(--mint)', 'var(--sky)', 'var(--lilac)', 'var(--sun)', 'var(--coral)'];
  el.innerHTML = '';
  'VOXLINK'.split('').forEach((ch, i) => {
    const s = document.createElement('span');
    s.style.setProperty('--c', colors[i]);
    s.style.setProperty('--rot', `${[-6, 4, -3, 5, -4, 3, -5][i]}deg`);
    s.style.setProperty('--d', `${i * 0.12}s`);
    s.innerHTML = `${ch}<sup>${i + 1}</sup>`;
    el.appendChild(s);
  });
}
['logo-loading', 'logo-title', 'logo-ending'].forEach(id => buildLogo($(id)));

// ---------- screens: one base screen + a stack of overlays ----------
const OVERLAYS = new Set(['screen-brief', 'screen-settings', 'screen-talk']);
let base = 'screen-loading';
const overlays = [];
function render() {
  document.querySelectorAll('.screen').forEach(s => {
    const on = s.id === base || overlays.includes(s.id);
    s.classList.toggle('show', on);
    s.style.zIndex = overlays.includes(s.id) ? 20 + overlays.indexOf(s.id) : 10;
  });
}
function setBase(id) { base = id; overlays.length = 0; render(); }
function pushOverlay(id) { if (!overlays.includes(id)) overlays.push(id); render(); }
function popOverlay(id) { const k = overlays.lastIndexOf(id ?? overlays[overlays.length - 1]); if (k >= 0) overlays.splice(k, 1); render(); }
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => popOverlay()));

// ---------- core ----------
const canvas = $('c');
const renderer = new Renderer(canvas, { mobile });
renderer.outlines = save.settings.outline;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffe3c4, 0.0085);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
scene.add(camera);
const audio = new Audio();
audio.setSfx(save.settings.sfx);
audio.setMusic(save.settings.music);
const input = new Input(canvas, $('touch'), { mobile });
input.lookSens = save.settings.sens;
input.invertY = save.settings.invert;
const fx = new FX(scene);

let app = 'loading'; // loading | title | menu | intro | playing | paused | complete
let toastTimer = 0;

const game = new Game({
  renderer, scene, camera, audio, input, fx,
  events: {
    progress: (n, total, level) => {
      $('lvl-name').textContent = level.kind || isDone(level.id) ? level.name : t('hud.mystery');
      $('count').textContent = `${n} / ${total}`;
      $('stage').textContent = game.stageCount > 1 ? t('hud.part', { k: game.stage + 1, n: game.stageCount }) : '';
      $('stage').style.background = '';
      renderMagnet(game.magnetCharges, false);
      $('bar-fill').style.width = `${(n / total) * 100}%`;
      renderNeeds();
    },
    pack: info => renderPack(info),
    focus: info => renderFocus(info),
    toast: msg => toast(msg),
    kubo: msg => kuboSays(msg),
    vibrate: p => { if (mobile && navigator.vibrate) navigator.vibrate(p); },
    complete: stats => onComplete(stats),
    introDone: () => { app = 'playing'; input.enabled = true; document.body.classList.add('playing'); },
    pause: () => pause(),
    magnet: (n, gained) => renderMagnet(n, gained),
    tip: key => { if (!save.seen[`tip.${key}`]) { save.seen[`tip.${key}`] = true; persist(); kuboSays(t(`kubo.${key}`)); } },
    stage: () => { $('stage').animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.5,1)' }); },
    saveSession: data => { if (!game.level.kind) { save.session = data; persist(); } },
    tick: g => { tickHud(g); ctx.hooks.tick.forEach(f => f(g)); },
    link: (g, i) => ctx.hooks.link.forEach(f => f(g, i)),
  },
});

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  // keep a comfortable horizontal field of view in portrait
  const hfov = camera.userData.hfov || 88; // set by the field-of-view setting
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / camera.aspect));
  camera.fov = camera.userData.baseFov = THREE.MathUtils.clamp(vfov, 62 * hfov / 88, 92 * hfov / 88);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (base === 'screen-map') buildMap();
}
addEventListener('resize', resize);
screen.orientation?.addEventListener?.('change', () => setTimeout(resize, 120));
resize();

// ---------- HUD ----------
const chip = (n, cls = '', label) => `<span class="chip ${cls} ${label ? 'sum' : n === 6 || n === 9 ? 'u' : ''}">${label ?? n}</span>`;
let lastNeeds = '';
function renderNeeds() {
  if (!game.world) return;
  const nums = game.openSocketNumbers();
  const ready = game.readyNumbers();
  const key = nums.join(',') + '|' + [...ready].join(',');
  if (key === lastNeeds) return;
  const prev = new Set(lastNeeds.split('|')[0].split(',').map(Number));
  lastNeeds = key;
  const max = innerWidth < 520 ? 5 : 9;
  // ready bubbles first so they are never hidden behind "+n"
  const sorted = [...nums.filter(n => ready.has(n)), ...nums.filter(n => !ready.has(n))];
  let html = nums.length ? `<span class="lbl">${t('hud.bubbles')}</span>` : '';
  sorted.slice(0, max).forEach(n => { html += chip(n, `${ready.has(n) ? 'ready' : ''} ${prev.has(n) ? '' : 'new'}`); });
  if (nums.length > max) html += `<span class="chip more">+${nums.length - max}</span>`;
  $('needs').innerHTML = html;
}

function renderPack(info) {
  const el = $('pack');
  let html = '';
  for (let k = 0; k < PACK_SIZE; k++) {
    const s = info.slots[k];
    if (!s) { html += `<div class="slot" data-k="${k}"></div>`; continue; }
    const nums = s.numbers.map((n, j) => chip(n, n === s.link && s.fits ? 'ready' : '', s.labels?.[j])).join('');
    html += `<div class="slot full ${k === info.active ? 'active' : ''} ${s.fits ? 'fits' : ''} ${s.count > 1 ? 'chunk' : ''}" data-k="${k}">
      <span class="key">${k + 1}</span>${s.count > 1 ? `<span class="cnt">×${s.count}</span>` : ''}<span class="sw" style="background:${hex(s.color)}"></span><div class="nums">${nums}</div></div>`;
  }
  el.innerHTML = html;
  $('btn-drop').classList.toggle('show', info.slots.length > 0);
  const fits = info.slots.filter(s => s.fits).map(s => s.link);
  const tip = $('pack-tip');
  if (fits.length) tip.innerHTML = t(`pack.link.${mobile ? 'tap' : 'click'}.${fits.length > 1 ? 'other' : 'one'}`, { list: `<b>${listJoin(fits)}</b>` });
  else if (info.slots.length) tip.textContent = t('pack.none');
  tip.classList.toggle('on', info.slots.length > 0);
  renderNeeds();
}
$('pack').addEventListener('pointerdown', e => {
  const s = e.target.closest('.slot.full');
  if (!s) return;
  e.stopPropagation();
  input.actions.push({ type: 'slot', k: +s.dataset.k });
});

function renderFocus(info) {
  const ch = $('crosshair'), tip = $('tooltip');
  ch.className = '';
  if (!info) { tip.classList.remove('show'); return; }
  let label = '', nums = '';
  if (info.kind === 'loose') {
    ch.className = info.far ? 'far' : 'grab';
    nums = info.numbers.map((n, j) => chip(n, n === info.fit ? 'ready' : '', info.labels?.[j])).join('');
    label = info.far ? t('tip.closer') : info.attach ? t('puzzler.tip.attach') : info.full ? t('tip.swap') : t('tip.grab');
    if (info.attach && !info.far) ch.className = 'link';
    if (info.count > 1 && !info.far) label = t('puzzler.tip.withCount', { label, n: info.count });
  } else if (info.far) { ch.className = 'far'; label = t('tip.closer'); }
  else if (info.ok) { ch.className = 'link'; label = t('tip.link'); }
  else if (info.holding) { ch.className = 'bad'; label = t('tip.needs', { n: info.num }); }
  else label = t('tip.find', { n: info.num });
  tip.innerHTML = `${nums ? `<div class="tip-nums">${nums}</div>` : ''}<div class="tip-label">${label}</div>`;
  tip.classList.add('show');
}

let kuboTimer = 0;
function kuboSays(msg) {
  const el = $('kubo-bark');
  el.querySelector('p').innerHTML = msg;
  el.classList.add('show');
  audio.tone({ f: 660, f2: 880, type: 'triangle', dur: 0.12, vol: 0.06 });
  clearTimeout(kuboTimer);
  kuboTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

let lastToast = '', lastToastAt = 0;
function toast(msg) {
  const now = performance.now();
  if (msg === lastToast && now - lastToastAt < 1200) return;
  lastToast = msg; lastToastAt = now;
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

const COACH = {
  1: () => (mobile ? t('coach.1.touch') : t('coach.1.desk', { move: 'WASD', look: t('coach.mouse'), ...ctx.coachLabels?.() })),
  2: () => t(mobile ? 'coach.2.touch' : 'coach.2.desk'),
  3: () => t(mobile ? 'coach.3.touch' : 'coach.3.desk'),
  4: () => t('coach.4'),
};
let coachStep = -1, coachTimer = 0;
const edgeV = new THREE.Vector3();
function placeEdge(el, pos, show) {
  if (!show) { el.classList.remove('on'); return; }
  edgeV.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  const behind = edgeV.z > 0;
  edgeV.copy(pos).project(camera);
  let x = edgeV.x, y = edgeV.y;
  if (behind) { x = -x; y = -y; }
  const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.92;
  if (onScreen) { el.classList.remove('on'); return; }
  const ang = Math.atan2(y, x);
  const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
  x /= m; y /= m;
  const w = innerWidth, h = innerHeight, pad = 46;
  const px = THREE.MathUtils.clamp((x * 0.5 + 0.5) * w, pad, w - pad);
  const py = THREE.MathUtils.clamp((-y * 0.5 + 0.5) * h, pad + 70, h - pad - 90);
  el.style.transform = `translate(${px}px, ${py}px)`;
  el.firstElementChild.style.transform = `rotate(${Math.PI / 2 - ang}rad)`;
  el.classList.add('on');
}
const homePos = new THREE.Vector3(0, 1.2, 0);
function tickHud(g) {
  if (g.tutorial !== coachStep) {
    coachStep = g.tutorial;
    const el = $('coach');
    if (COACH[coachStep]) { el.innerHTML = COACH[coachStep](); el.classList.add('show'); coachTimer = 0; }
    else el.classList.remove('show');
  }
  if (coachStep === 4) { coachTimer += g.lastDt; if (coachTimer > 4.5) g.tutorial = 5; }
  if (coachStep === 1) { const html = COACH[1](); if ($('coach').innerHTML !== html) $('coach').innerHTML = html; }
  $('hint-cd').style.setProperty('--p', `${g.hintCooldown > 0 ? (g.hintCooldown / (g.hintMax || 8)) * 100 : 0}%`);
  if (!mobile && g.elapsed > 16) $('keys').classList.add('fade');
  const far = g.player.pos.length() > 7;
  placeEdge($('edge-home'), homePos, far && g.hasFitInPack());
  placeEdge($('edge-hint'), fx.beamTarget?.position ?? homePos, !!fx.beamTarget);
  const flag = g.flags?.[g.activeDistrict?.() ?? -1];
  const inDistrict = flag && Math.hypot(g.player.pos.x - flag.pos.x, g.player.pos.z - flag.pos.z) < 9;
  placeEdge($('edge-district'), flag?.pos ?? homePos, !!flag && !inDistrict && !g.hasFitInPack?.() && !fx.beamTarget);
  if (flag) $('edge-district').style.background = flag.color;
  const radar = g.radarTarget();
  placeEdge($('edge-radar'), radar ?? homePos, !!radar && !fx.beamTarget);
}

// ---------- flow ----------
function nextLevelIndex() {
  if (save.session) { const k = LEVELS.findIndex(l => l.id === save.session.id); if (k >= 0) return k; }
  const i = LEVELS.findIndex((l, k) => k < save.unlocked && !isDone(l.id));
  return i < 0 ? Math.min(save.unlocked, LEVELS.length) - 1 : i;
}

function showcase(idx) {
  game.load(idx);
  game.mode = 'showcase';
  game.orbitAngle = 0.5;
  game.updateOrbit(0, 0, 1);
}

function enterTitle() {
  audio.suspend(false);
  app = 'title';
  input.enabled = false;
  input.exitLock();
  document.body.classList.remove('playing');
  $('hud').classList.add('off');
  const idx = nextLevelIndex();
  if (game.levelIndex !== idx || game.mode !== 'showcase') showcase(idx);
  $('play-label').textContent = t(save.session ? 'title.resume' : save.seen.prologue ? 'title.continue' : 'title.play');
  setBase('screen-title');
}

function talk(lines, done) {
  const el = $('talk-text'), more = $('talk-more'), kubo = document.querySelector('#screen-talk .kubo');
  let li = 0, shown = 0, full = '', plain = 0, timer = null;
  const segs = () => full.split(/(<b>|<\/b>)/);
  const renderUpTo = n => {
    let out = '', left = n;
    for (const s of segs()) {
      if (s === '<b>' || s === '</b>') { out += s; continue; }
      out += s.slice(0, Math.max(0, left));
      left -= s.length;
    }
    el.innerHTML = out;
  };
  const start = () => {
    full = lines[li];
    plain = full.replace(/<\/?b>/g, '').length;
    shown = 0;
    more.classList.remove('on');
    kubo.classList.add('talking');
    clearInterval(timer);
    timer = setInterval(() => {
      shown += 1;
      if (shown % 3 === 0) audio.tone({ f: 520 + Math.random() * 160, type: 'triangle', dur: 0.04, vol: 0.035 });
      renderUpTo(shown);
      if (shown >= plain) finish();
    }, 22);
  };
  const finish = () => { clearInterval(timer); shown = plain; renderUpTo(shown); more.classList.add('on'); kubo.classList.remove('talking'); };
  const advance = () => {
    audio.unlock();
    if (shown < plain) return finish();
    li++;
    if (li >= lines.length) {
      $('screen-talk').removeEventListener('click', advance);
      removeEventListener('keydown', key);
      popOverlay('screen-talk');
      done?.();
      return;
    }
    audio.click();
    start();
  };
  const key = e => {
    if (['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); advance(); }
    if (e.code === 'Escape') { e.preventDefault(); skip(e); }
  };
  const skip = e => { e?.stopPropagation(); clearInterval(timer); li = lines.length - 1; shown = plain; advance(); };
  $('talk-skip').onclick = skip;
  $('screen-talk').addEventListener('click', advance);
  addEventListener('keydown', key);
  pushOverlay('screen-talk');
  start();
}

const levelOf = x => (typeof x === 'object' ? x : LEVELS[x]);
// index: campaign index or level object (daily / custom figures). resume: true to continue a saved session
function startLevel(index, resume = false) {
  audio.unlock();
  audio.suspend(false);
  const lvl = levelOf(index);
  const session = resume === true ? (save.session?.id === lvl.id ? save.session : null) : resume || null;
  if (!session && !lvl.kind) { delete save.session; persist(); }
  const keepCam = app === 'title' && game.level === lvl && !session;
  $('kubo-bark').classList.remove('show');
  if (!keepCam) {
    game.load(lvl, session);
    game.orbitAngle = 0.5;
    game.updateOrbit(0, 0, 1);
  }
  input.reset();
  lastNeeds = '';
  renderNeeds();
  renderFocus(null);
  coachStep = -1;
  $('keys').classList.remove('fade');
  $('hud').classList.remove('off');
  document.body.classList.remove('celebrating');
  setBase(null);
  app = 'intro';
  game.startIntro();
  if (!mobile) input.requestLock();
  else if (save.settings.full) goFullscreen(true);
  lastTime = performance.now();
}

function pause() {
  if (app !== 'playing' && app !== 'intro') return;
  app = 'paused';
  input.enabled = false;
  input.reset();
  input.exitLock();
  audio.suspend(true);
  const g = game;
  $('pause-info').innerHTML = `<svg><use href="#i-cube"/></svg>${g.placedCount}/${g.voxels.length} · ${fmt(g.elapsed)}`;
  setBase('screen-pause');
}

function resume() {
  if (app !== 'paused') return;
  audio.unlock();
  audio.suspend(false);
  setBase(null);
  if (!mobile) input.requestLock();
  app = game.mode === 'intro' ? 'intro' : 'playing';
  input.enabled = app === 'playing';
  input.reset();
  lastTime = performance.now();
}

input.onLockChange = locked => { if (!locked && (app === 'playing' || app === 'intro')) pause(); };
document.addEventListener('pointerlockerror', () => { if (app === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

let pendingUnlock = null; // { from, to } for the map animation
function onComplete(stats) {
  app = 'complete';
  document.body.classList.add('celebrating');
  input.enabled = false;
  document.body.classList.remove('playing');
  const lvl = game.level, idx = game.levelIndex;
  ctx.hooks.complete.forEach(f => f(stats, lvl));
  if (lvl.kind) { setTimeout(() => ctx.completeHandlers[lvl.kind]?.(stats, lvl), 2600); return; }
  const par = parTime(lvl);
  const run = { done: true, fast: stats.time <= par, clean: stats.hints === 0 };
  const prev = save.stars[lvl.id] || {};
  const firstClear = !prev.done;
  save.stars[lvl.id] = { done: true, fast: !!(prev.fast || run.fast), clean: !!(prev.clean || run.clean) };
  const prevBest = save.best[lvl.id];
  const isBest = !prevBest || stats.time < prevBest;
  save.splits = save.splits || {};
  const prevSplits = save.splits[lvl.id];
  if (isBest) { save.best[lvl.id] = stats.time; save.splits[lvl.id] = stats.splits; }
  const oldUnlocked = save.unlocked;
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, idx + 2));
  pendingUnlock = save.unlocked > oldUnlocked ? { from: idx, to: save.unlocked - 1 } : null;
  delete save.session;
  persist();
  const finale = idx === LEVELS.length - 1 && firstClear;
  setTimeout(() => showComplete({
    name: lvl.name, img: thumbs[idx], reveal: firstClear, time: stats.time, par, hints: stats.hints,
    stars: [run.done, run.fast, run.clean], best: isBest && !firstClear ? t('complete.newBest') : '', say: lvl.outro,
    splits: stats.splits, prevSplits,
    nextLabel: t(finale ? 'complete.epilogue' : 'complete.continue'), onNext: finale ? showEnding : openMap, onMap: openMap,
    onRetry: () => { pendingUnlock = null; startLevel(lvl); },
  }), 2600);
}

// 25% / 50% / 75% / done times, with the difference to the previous best run.
function splitsHtml(sp, prev) {
  return ['¼', '½', '¾', '✓'].map((label, k) => {
    if (sp[k] === undefined) return '';
    const d = prev && prev[k] !== undefined ? sp[k] - prev[k] : null;
    const delta = d === null ? '' : `<em class="${d <= 0 ? 'up' : 'down'}">${d <= 0 ? '−' : '+'}${fmt(Math.abs(d))}</em>`;
    return `<span><small>${label}</small>${fmt(sp[k])}${delta}</span>`;
  }).join('');
}

// Results panel, shared by campaign, daily and custom figures.
let completeActions = {};
function showComplete(o) {
  $('hud').classList.add('off');
  $('lvl-name').textContent = o.name;
  $('complete-name').textContent = o.name;
  $('complete-time').textContent = fmt(o.time);
  $('complete-par').textContent = o.par ? t('complete.par', { t: fmt(o.par) }) : (o.parText || t('complete.time'));
  $('complete-hints').textContent = o.hints;
  $('complete-img').src = o.img || '';
  $('complete-thumb').classList.toggle('reveal', !!o.reveal);
  $('complete-best').style.display = o.best ? '' : 'none';
  $('complete-best').textContent = o.best || '';
  $('complete-say').innerHTML = o.say || '';
  $('complete-say').closest('.say').style.display = o.say ? '' : 'none';
  const st = o.stars || [];
  $('complete-stars').innerHTML = st.map(() => '<svg><use href="#i-star"/></svg>').join('');
  const svgs = $('complete-stars').children;
  st.forEach((on, k) => { if (on) setTimeout(() => { svgs[k].classList.add('on'); audio.star(k); }, 500 + k * 280); });
  $('next-label').textContent = o.nextLabel || t('complete.continue');
  $('complete-splits').innerHTML = o.splits ? splitsHtml(o.splits, o.prevSplits) : '';
  completeActions = o;
  setBase('screen-complete');
}

// ---------- world map ----------
let thumbs = [];
const SECTION_H = 760, TOP_PAD = 86, BOT_PAD = 70;
const mapPos = [];
function buildMap() {
  const inner = $('map-inner');
  const W = inner.clientWidth || innerWidth;
  const colW = Math.min(500, W - 190);
  const cx = W / 2;
  const H = TOP_PAD + SECTION_H * CHAPTERS.length + BOT_PAD;
  inner.style.height = `${H}px`;
  let html = '';
  const xs = [0, 0.42, 0.05, -0.4];
  CHAPTERS.forEach((ch, c) => {
    const top = TOP_PAD + (CHAPTERS.length - 1 - c) * SECTION_H;
    const T = THEMES[ch.theme];
    const first = LEVELS.find(l => l.chapter === c);
    const locked = first.index >= save.unlocked;
    const st = ch.levels.reduce((n, l) => n + starsOf(l.id), 0);
    html += `<div class="map-chapter" style="position:absolute;left:0;right:0;top:${top - (c === CHAPTERS.length - 1 ? TOP_PAD : 0)}px;height:${SECTION_H + (c === CHAPTERS.length - 1 ? TOP_PAD : 0) + (c === 0 ? BOT_PAD : 0)}px;
      background:linear-gradient(to top, ${hex(T.water)}, ${hex(T.skyHorizon)} 55%, ${hex(T.skyTop)});${locked ? 'filter:saturate(.35) brightness(.85);' : ''}">
      <div class="waves"></div></div>`;
    html += `<div class="chapter-head ${locked ? 'locked' : ''}" style="top:${top + 22}px"><small>${t('map.chapter', { n: c + 1 })}</small><b>${ch.name}</b>
      <span>${locked ? `<svg><use href="#i-lock"/></svg> ${t('map.locked')}` : `<svg><use href="#i-star"/></svg> ${st} / ${ch.levels.length * 3} · ${ch.blurb}`}</span></div>`;
    ch.levels.forEach((l, k) => {
      const x = cx + xs[k] * colW * (c % 2 ? -1 : 1);
      const y = top + SECTION_H - 120 - k * 158;
      mapPos[l.index] = { x, y };
    });
  });
  // path
  let bed = '', done = '', open = '';
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const a = mapPos[i], b = mapPos[i + 1];
    const dy = b.y - a.y;
    const d = `M${a.x},${a.y} C${a.x},${a.y + dy * 0.55} ${b.x},${b.y - dy * 0.55} ${b.x},${b.y}`;
    bed += d;
    const anim = pendingUnlock && i + 1 === pendingUnlock.to;
    if (i + 1 < save.unlocked) done += `<path class="done ${anim ? 'draw' : ''}" d="${d}"/>`;
    else open += `<path class="open" d="${d}"/>`;
  }
  html += `<svg class="map-path" style="width:${W}px;height:${H}px" viewBox="0 0 ${W} ${H}"><path class="bed" d="${bed}"/>${open}${done}</svg>`;
  const cur = nextLevelIndex();
  LEVELS.forEach((l, i) => {
    const p = mapPos[i];
    const locked = i >= save.unlocked;
    const solved = isDone(l.id);
    const s = save.stars[l.id] || {};
    const stars = [s.done, s.fast, s.clean].map(on => `<svg class="${on ? 'on' : ''}"><use href="#i-star"/></svg>`).join('');
    const unlocking = pendingUnlock && i === pendingUnlock.to;
    const T = THEMES[CHAPTERS[l.chapter].theme];
    html += `<button class="node ${l.boss ? 'boss' : ''} ${locked ? 'locked' : ''} ${solved ? '' : 'unsolved'} ${i === cur && !locked ? 'current' : ''} ${unlocking ? 'unlocking' : ''}" data-i="${i}" style="left:${p.x}px;top:${p.y}px;--g:${hex(T.grass)};--c:${hex(T.cliff)}">
      <div class="island">${locked ? '<svg><use href="#i-lock"/></svg>' : `<img src="${thumbs[i] || ''}" alt="">${solved ? '' : '<span class="q">?</span>'}`}<span class="num">${i + 1}</span></div>
      ${locked ? '' : `<div class="stars">${stars}</div>`}
      <div class="name">${solved ? l.name : locked ? '???' : l.tag}</div></button>`;
  });
  const kp = pendingUnlock ? mapPos[pendingUnlock.from] : mapPos[cur];
  html += `<div class="map-kubo" id="map-kubo" style="left:${kp.x}px;top:${kp.y}px"><div class="kubo"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div></div>`;
  inner.innerHTML = html;
  inner.querySelectorAll('.map-path .draw').forEach(p => p.style.setProperty('--len', p.getTotalLength()));
  inner.querySelectorAll('.node').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if (i >= save.unlocked) { audio.wrong(); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 }); return; }
    selectLevel(i);
  }));
  $('map-stars').textContent = `${totalStars()} / ${LEVELS.length * 3}`;
}

function openMap() {
  audio.suspend(false);
  app = 'menu';
  input.enabled = false;
  input.exitLock();
  document.body.classList.remove('playing');
  $('hud').classList.add('off');
  setBase('screen-map');
  buildMap();
  const scroll = $('map-scroll');
  const focus = pendingUnlock ? mapPos[pendingUnlock.from] : mapPos[nextLevelIndex()];
  scroll.scrollTop = focus.y - scroll.clientHeight * 0.55;
  if (pendingUnlock) {
    const { to } = pendingUnlock;
    pendingUnlock = null;
    setTimeout(() => {
      const k = $('map-kubo');
      if (!k) return;
      k.style.left = `${mapPos[to].x}px`;
      k.style.top = `${mapPos[to].y}px`;
      scroll.scrollTo({ top: mapPos[to].y - scroll.clientHeight * 0.55, behavior: 'smooth' });
      audio.tone({ f: 600, f2: 900, type: 'triangle', dur: 0.25, vol: 0.12 });
    }, 500);
    setTimeout(() => { audio.star(1); }, 1250);
    setTimeout(() => { if (base === 'screen-map' && !overlays.length) selectLevel(to); }, 2300);
  }
}

function selectLevel(i) {
  const l = LEVELS[i];
  const ch = CHAPTERS[l.chapter];
  if (!save.seen[ch.id]) {
    save.seen[ch.id] = true;
    if (l.chapter === 0) save.seen.prologue = true;
    persist();
    return talk(ch.intro, () => selectLevel(i));
  }
  openBrief(i);
}

let briefIdx = 0;
function openBrief(i) {
  briefIdx = i;
  const l = LEVELS[i], ch = CHAPTERS[l.chapter];
  const solved = isDone(l.id);
  const s = save.stars[l.id] || {};
  $('brief-chapter').textContent = l.boss ? t('brief.boss') : `${ch.name} · ${l.indexInChapter + 1}`;
  $('brief-chapter').classList.toggle('boss', !!l.boss);
  $('brief-img').src = thumbs[i] || '';
  $('brief-thumb').classList.toggle('mystery', !solved);
  $('brief-name').textContent = solved ? l.name : t('hud.mystery');
  $('brief-tag').textContent = solved ? l.tag : t('brief.hint', { tag: l.tag });
  const n = expandLevel(l).cells.length;
  const best = save.best[l.id];
  $('brief-stars').innerHTML = `
    <div class="goal ${s.done ? 'on' : ''}"><svg><use href="#i-star"/></svg>${t('brief.goal.done')}<em>${t('brief.blocks', { n })}</em></div>
    <div class="goal ${s.fast ? 'on' : ''}"><svg><use href="#i-star"/></svg>${t('brief.goal.fast', { t: fmt(parTime(l)) })}<em>${best ? t('brief.best', { t: fmt(best) }) : ''}</em></div>
    <div class="goal ${s.clean ? 'on' : ''}"><svg><use href="#i-star"/></svg>${t('brief.goal.clean')}</div>`;
  $('brief-say').innerHTML = l.intro;
  const ses = save.session?.id === l.id ? save.session : null;
  $('btn-brief-go').innerHTML = ses
    ? `<svg><use href="#i-play"/></svg>${t('brief.resume', { k: ses.done, n: ses.n })}`
    : `<svg><use href="#i-play"/></svg>${t('brief.start')}`;
  $('btn-brief-fresh').classList.toggle('hidden', !ses);
  pushOverlay('screen-brief');
}

// ---------- ending ----------
function showEnding() {
  talk(ENDING, () => {
    $('ending-grid').innerHTML = thumbs.map((t, i) => `<img src="${t}" style="animation-delay:${i * 0.06}s" alt="">`).join('');
    $('ending-stars').innerHTML = t('ending.stars', { n: totalStars() });
    setBase('screen-ending');
  });
}

// ---------- thumbnails (rendered once with the game's own renderer) ----------
function renderThumbs() { return LEVELS.map(l => renderThumb(expandLevel(l).cells)); }
let thumbKit = null;
// Render a figure (list of expanded cells) to a PNG data URL with the game's outline renderer.
function renderThumb(cells, size = 256) {
  if (!thumbKit) thumbKit = makeThumbKit(size);
  return thumbKit(cells);
}
function makeThumbKit(size) {
  const rt = new THREE.WebGLRenderTarget(size, size);
  const ts = new THREE.Scene();
  ts.add(new THREE.HemisphereLight(0xcfe0ff, 0xc9a98a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(-3, 6, 4);
  ts.add(sun);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const mat = voxelMaterial(renderer.gl);
  const px = new Uint8Array(size * size * 4);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  return cells => {
    const puzzle = generatePuzzle(cells, mulberry32(7));
    const group = new THREE.Group();
    const box = new THREE.Box3();
    cells.forEach((c, i) => {
      const m = new THREE.Mesh(buildVoxelGeometry(puzzle.faces[i]), mat);
      m.position.set(c.x * S, c.iy * S + S / 2, c.z * S);
      group.add(m);
      box.expandByPoint(m.position.clone().addScalar(S / 2)).expandByPoint(m.position.clone().addScalar(-S / 2));
    });
    ts.add(group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.0;
    const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
    cam.position.copy(sphere.center).addScaledVector(dir, dist);
    cam.lookAt(sphere.center);
    renderer.render(ts, cam, rt, size);
    renderer.gl.readRenderTargetPixels(rt, 0, 0, size, size, px);
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) img.data[di + k] = Math.round(255 * Math.pow(px[si + k] / 255, 1 / 2.2));
        img.data[di + 3] = px[si + 3];
      }
    }
    g.putImageData(img, 0, 0);
    ts.remove(group);
    group.traverse(o => o.geometry?.dispose());
    return cv.toDataURL();
  };
}

// ---------- settings ----------
function bindSettings() {
  const st = save.settings;
  const sens = $('set-sens'), sfx = $('set-sfx'), mus = $('set-music');
  sens.value = st.sens; sfx.value = st.sfx; mus.value = st.music;
  sens.oninput = () => { st.sens = +sens.value; input.lookSens = st.sens; persist(); };
  sfx.oninput = () => { st.sfx = +sfx.value; audio.unlock(); audio.setSfx(st.sfx); persist(); };
  sfx.onchange = () => audio.pickup();
  mus.oninput = () => { st.music = +mus.value; audio.unlock(); audio.setMusic(st.music); persist(); };
  const toggle = (id, key, apply) => {
    const el = $(id);
    el.classList.toggle('on', !!st[key]);
    el.onclick = () => { st[key] = !st[key]; el.classList.toggle('on', st[key]); apply?.(st[key]); persist(); };
  };
  toggle('set-invert', 'invert', v => { input.invertY = v; });
  toggle('set-outline', 'outline', v => { renderer.outlines = v; });
  const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  if (!fsSupported) $('set-full').closest('.setting').classList.add('hidden');
  toggle('set-full', 'full', v => goFullscreen(v));
  let armed = false;
  $('set-reset').onclick = () => {
    if (!armed) { armed = true; $('set-reset').textContent = t('settings.sure'); setTimeout(() => { armed = false; $('set-reset').textContent = t('settings.resetBtn'); }, 2500); return; }
    Object.assign(save, { unlocked: 1, best: {}, stars: {}, seen: {} });
    persist();
    $('set-reset').textContent = t('settings.done');
    if (app === 'paused') return;
    enterTitle();
  };
}

function goFullscreen(on) {
  const d = document, el = d.documentElement;
  try {
    if (on && !d.fullscreenElement && !d.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' })?.catch?.(() => {});
    if (!on && (d.fullscreenElement || d.webkitFullscreenElement)) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  } catch { /* not allowed */ }
}

// ---------- buttons ----------
document.addEventListener('pointerdown', e => {
  if (e.target.closest('.btn, .node, .toggle')) { audio.unlock(); audio.click(); }
}, true);
$('btn-play').onclick = () => {
  audio.unlock();
  if (!save.seen.prologue) {
    save.seen.prologue = true; save.seen[CHAPTERS[0].id] = true; persist();
    talk(CHAPTERS[0].intro, () => startLevel(0));
    return;
  }
  openMap();
};
$('btn-map').onclick = () => openMap();
$('btn-map-back').onclick = () => enterTitle();
$('btn-settings').onclick = () => pushOverlay('screen-settings');
$('btn-p-settings').onclick = () => pushOverlay('screen-settings');
$('btn-resume').onclick = () => resume();
$('btn-restart').onclick = () => startLevel(game.level);
$('btn-quit').onclick = () => (game.level?.kind ? enterTitle() : openMap());
$('btn-pause').onclick = () => pause();
$('btn-hint').onclick = () => input.actions.push({ type: 'hint' });
$('btn-magnet').onclick = () => input.actions.push({ type: 'magnet' });
function renderMagnet(n, gained) {
  const b = $('btn-magnet');
  b.classList.toggle('hidden', !(game.stageCount > 1));
  b.classList.toggle('empty', n <= 0);
  $('magnet-n').textContent = n;
  if (gained) b.animate([{ transform: 'scale(1.4) rotate(-10deg)' }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.3,1.6,.5,1)' });
}
$('btn-brief-back').onclick = () => popOverlay('screen-brief');
$('btn-brief-go').onclick = () => startLevel(briefIdx, true);
$('btn-brief-fresh').onclick = () => startLevel(briefIdx, false);
$('btn-c-map').onclick = () => (completeActions.onMap || openMap)();
$('btn-c-retry').onclick = () => (completeActions.onRetry || (() => startLevel(game.level)))();
$('btn-next').onclick = () => (completeActions.onNext || openMap)();
$('btn-ending-map').onclick = () => openMap();
const jump = $('btn-jump');
jump.addEventListener('pointerdown', e => { e.preventDefault(); input.actions.push({ type: 'jump' }); input.jumpButtonHeld = true; jump.classList.add('pressed'); });
const jumpUp = () => { input.jumpButtonHeld = false; jump.classList.remove('pressed'); };
jump.addEventListener('pointerup', jumpUp);
jump.addEventListener('pointercancel', jumpUp);
jump.addEventListener('pointerleave', jumpUp);
$('btn-drop').addEventListener('pointerdown', e => { e.preventDefault(); input.actions.push({ type: 'drop' }); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
addEventListener('keydown', e => {
  if (overlays.includes('screen-talk')) return;
  if (e.code === 'Escape') {
    if (overlays.length) { popOverlay(); return; }
    if (base === 'screen-map') { enterTitle(); return; }
    if (app === 'paused' && !mobile) return; // browsers swallow this Esc for pointer lock anyway
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (overlays.at(-1) === 'screen-brief') { e.preventDefault(); $('btn-brief-go').click(); }
    else if (!overlays.length && base === 'screen-title') { e.preventDefault(); $('btn-play').click(); }
    else if (!overlays.length && base === 'screen-complete') { e.preventDefault(); $('btn-next').click(); }
  }
});

// ---------- main loop ----------
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;
  audio.updateMusic();
  // nothing 3D is visible behind these screens
  if (app === 'paused' || app === 'loading' || app === 'menu') return;
  // a feature can own the frame for its own app state:
  // ctx.views[app] replaces update + render (workshop), ctx.modes[app] replaces game.update only (garden)
  if (ctx.views[app]) { ctx.views[app](dt); renderer.adapt(dt); return; }
  const mode = ctx.modes[app];
  if (mode) mode(dt); else game.update(dt);
  renderer.render(scene, camera);
  renderer.adapt(dt);
}

// ---------- feature context ----------
// Feature modules (js/features/*.js) get this object in init(ctx) and hook in from there.
const ctx = {
  THREE, game, renderer, scene, camera, audio, input, fx, save, persist, mobile, $, fmt, hex,
  LEVELS, CHAPTERS, expandLevel, parTime,
  get app() { return app; }, set app(v) { app = v; },
  get base() { return base; }, overlays,
  setBase, pushOverlay, popOverlay, talk, toast, kuboSays, startLevel, openMap, enterTitle, pause, resume, showComplete, splitsHtml,
  renderThumb, get thumbs() { return thumbs; }, goFullscreen,
  hooks: { tick: [], complete: [], link: [], settings: [] },
  completeHandlers: {}, // kind -> (stats, level) => void, for non-campaign figures
  modes: {}, // app state -> (dt) => void, per-frame update used instead of game.update while app is that state
  views: {}, // app state -> (dt) => void; replaces game.update + scene render while app is in that state
};

// ---------- boot ----------
async function boot() {
  const fill = $('load-fill');
  fill.style.width = '15%';
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 20px Fredoka')]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch { /* fallback fonts */ }
  // language first: everything built below (thumb labels, features, menus) reads translated strings
  await setLocale(await detectLocale(save.settings.lang));
  localizeContent();
  try { await document.fonts.ready; } catch { /* ignore */ }
  fill.style.width = '40%';
  await new Promise(r => setTimeout(r, 30));
  getAtlas(renderer.gl);
  thumbs = renderThumbs();
  fill.style.width = '80%';
  await new Promise(r => setTimeout(r, 30));
  bindSettings();
  for (const f of FEATURES) f.init?.(ctx);
  enterTitle();
  renderer.gl.compile(scene, camera);
  fill.style.width = '100%';
  await new Promise(r => setTimeout(r, 250));
  lastTime = performance.now();
  requestAnimationFrame(frame);
  if (location.search.includes('thumbs')) {
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;z-index:99;background:#fff4e0;display:grid;grid-template-columns:repeat(4,1fr);overflow:auto">${thumbs.map((t, i) => `<div style="text-align:center;font:700 14px Fredoka"><img src="${t}" style="width:100%"><br>${LEVELS[i].name}</div>`).join('')}</div>`);
  }
}
boot();

// expose for debugging
window.__voxlink = { game, renderer, save, openMap, startLevel, LEVELS, ctx };
