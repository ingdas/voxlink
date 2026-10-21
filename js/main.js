import * as THREE from 'three';
import { Renderer } from './render.js';
import { LEVELS, CHAPTERS, ENDING, expandLevel, parTime, partsFor } from './levels.js';
import { THEMES } from './world.js';
import { S, buildVoxelGeometry, voxelMaterial, generatePuzzle, mulberry32, getAtlas } from './voxels.js';
import { Game, PACK_SIZE } from './game.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { buildLogo } from './logo.js';
import FEATURES from './features/index.js';
import { t, setLocale, detectLocale, applyDom, listJoin } from './i18n.js';
import { localizeContent } from './i18n-content.js';

const $ = id => document.getElementById(id);
// touch-first devices: phones/tablets (some report no coarse pointer, so look at several signals)
const mobile = matchMedia('(pointer: coarse)').matches
  || /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); // iPadOS reports a Mac

// Something broke: show it on screen instead of leaving a silent black page.
let fatalKind = null;
function showFatal(kind, detail) {
  if (fatalKind === 'webgl' && kind !== 'webgl') return; // the specific graphics message wins
  fatalKind = kind;
  let el = document.getElementById('fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal';
    el.className = 'fatal';
    document.body.appendChild(el);
  }
  const tx = (k, f) => { try { return t(k); } catch { return f; } };
  el.innerHTML = `<div class="panel narrow"><div class="kubo mini"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div>
    <p>${kind === 'webgl' ? tx('error.webgl', 'Your browser could not start the 3D graphics.') : tx('error.generic', 'Oops — something went wrong.')}</p>
    <small>${String(detail || '').slice(0, 160).replace(/</g, '&lt;')}<br>WebGL2: ${window.__gfx?.webgl2 ? 'yes' : 'no'} · WebGL: ${window.__gfx?.webgl1 ? 'yes' : window.__gfx?.webgl2 ? '–' : 'no'} · ${(navigator.userAgent.match(/(iPhone OS [\d_]+|Android [\d.]+|Chrome\/\d+|Version\/[\d.]+ Mobile|Firefox\/\d+|SamsungBrowser\/[\d.]+)/g) || []).join(' ')}</small>
    ${kind === 'webgl' ? `<small>${tx(!window.__gfx?.webgl2 && !window.__gfx?.webgl1 ? 'error.webglBlocked' : 'error.webglTip', '')}</small>` : ''}
    <button class="btn mint" onclick="location.reload()">${tx('error.reload', 'Reload')}</button></div>`;
}
addEventListener('error', e => { if (e.message && !/ResizeObserver/.test(e.message)) showFatal('generic', e.message); });
addEventListener('unhandledrejection', e => {
  // user cancelled a share sheet, fullscreen/pointer lock was refused, audio blocked: not fatal
  if (/AbortError|NotAllowedError|SecurityError|NotSupportedError/.test(e.reason?.name || '') || /pointer ?lock|fullscreen|play\(\)/i.test(e.reason?.message || '')) return;
  showFatal('generic', e.reason?.message || e.reason);
});
document.body.classList.toggle('mobile', mobile);

// ---------- persistence ----------
// storage keys (and window.__voxlink) keep the working title Voxlink: renaming them would wipe saves
const SAVE_KEY = 'voxlink.v2';
const save = Object.assign({ unlocked: 1, best: {}, stars: {}, seen: {}, settings: {} }, safeParse(localStorage.getItem(SAVE_KEY)));
save.settings = Object.assign({ sens: 1, sfx: 0.8, music: 0.45, invert: false, outline: true, full: mobile }, save.settings);
// Saves from the 20-figure campaign: `unlocked` counted figures in the old order. Unlock up to the furthest
// figure the player had reached, so the new figures before it open up and nothing reached is lost.
const OLD_ORDER = ['sprout', 'mushroom', 'duck', 'windmill', 'penguin', 'snowman', 'frostpine', 'polarbear', 'crab', 'palm',
  'sailboat', 'whale', 'robot', 'castle', 'rocket', 'dragon', 'lighthouse', 'balloon', 'octopus', 'colossus'];
if ((save.campaign ?? 1) < 2) {
  const reached = OLD_ORDER.slice(0, save.unlocked).map(id => LEVELS.findIndex(l => l.id === id));
  save.unlocked = Math.max(1, ...reached.map(i => i + 1));
  save.campaign = 2;
  if (save.seen?.prologue) save.seen.oldSave = true; // Kubo mentions the new figures when they're back
}
delete save.daily; delete save.dailyStreak; // the daily figure was removed
// self-heal: figures can move in the campaign order (the Apple did); everything after a finished figure stays open
save.unlocked = Math.min(LEVELS.length, Math.max(save.unlocked, ...LEVELS.filter(l => save.stars[l.id]?.done).map(l => l.index + 2)));
// half-built figures: one saved run per figure (you can walk away from one and come back)
save.sessions = save.sessions || {};
if (save.session) { save.sessions[save.session.id] = save.session; delete save.session; }
function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } }
const starsOf = id => { const s = save.stars[id]; return s ? (s.done ? 1 : 0) + (s.fast ? 1 : 0) + (s.clean ? 1 : 0) : 0; };
const isDone = id => !!save.stars[id]?.done;
const totalStars = () => LEVELS.reduce((n, l) => n + starsOf(l.id), 0);

const fmt = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hex = c => `#${c.toString(16).padStart(6, '0')}`;
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- logo ----------
['logo-loading', 'logo-title', 'logo-ending'].forEach(id => buildLogo($(id)));

// ---------- screens: one base screen + a stack of overlays ----------
const OVERLAYS = new Set(['screen-settings', 'screen-talk']);
let base = 'screen-loading';
const overlays = [];
// Screens that aren't showing (or sit under an overlay) are inert: no Tab stops, no screen reader, and a button
// that kept focus can't be pressed again with Enter after its screen closed.
function render() {
  const top = overlays.length ? overlays[overlays.length - 1] : base;
  document.querySelectorAll('.screen').forEach(s => {
    const on = s.id === base || overlays.includes(s.id);
    s.classList.toggle('show', on);
    s.inert = s.id !== top;
    s.style.zIndex = overlays.includes(s.id) ? 20 + overlays.indexOf(s.id) : 10;
  });
  if (document.activeElement?.closest?.('.screen')?.inert) document.activeElement.blur();
}
function setBase(id) { base = id; overlays.length = 0; render(); }
function pushOverlay(id) { if (!overlays.includes(id)) overlays.push(id); render(); }
function popOverlay(id) { const k = overlays.lastIndexOf(id ?? overlays[overlays.length - 1]); if (k >= 0) overlays.splice(k, 1); render(); }
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => popOverlay()));

// ---------- core ----------
const canvas = $('c');
// Crash guard: if the last visit never reached a few healthy seconds of 3D (the GPU crashed or the
// tab was killed), start in safe graphics. A crashing page can make Chrome block WebGL for the site.
const GFX_KEY = 'voxlink.gfx';
const gfxState = (() => { try { return JSON.parse(localStorage.getItem(GFX_KEY)) || {}; } catch { return {}; } })();
const saveGfx = () => { try { localStorage.setItem(GFX_KEY, JSON.stringify(gfxState)); } catch { /* private mode */ } };
if (gfxState.booting && !gfxState.safe) { gfxState.safe = true; gfxState.auto = true; }
gfxState.booting = Date.now();
saveGfx();
let renderer;
try {
  renderer = new Renderer(canvas, { mobile, safe: !!gfxState.safe || /[?&]safe\b/.test(location.search) });
} catch (err) {
  gfxState.booting = 0; saveGfx();
  showFatal('webgl', err?.message);
  throw err;
}
let healthy = 0; // seconds of rendered 3D frames this visit
addEventListener('pagehide', () => { if (gfxState.booting) { gfxState.booting = 0; saveGfx(); } });
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  if (!gfxState.safe) { gfxState.safe = true; gfxState.auto = true; }
  gfxState.booting = 0; saveGfx();
  showFatal('webgl', 'WebGL context lost');
});
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
      goalsKey = '';
      $('lvl-name').textContent = level.kind || isDone(level.id) ? level.name : t('hud.mystery');
      $('count').textContent = `${n} / ${total}`;
      $('stage').textContent = game.stageCount > 1 ? t('hud.part', { k: game.stage + 1, n: game.stageCount }) : '';
      renderMagnet(game.magnetCharges, false);
      renderTool('btn-express', 'express-n', game.expressCharges ?? 0, false);
      $('bar-fill').style.width = `${(n / total) * 100}%`;
      renderNeeds();
    },
    pack: info => renderPack(info),
    focus: info => renderFocus(info),
    toast: msg => toast(msg),
    kubo: (msg, urgent) => kuboSays(msg, urgent),
    vibrate: p => { if (mobile && navigator.vibrate) navigator.vibrate(p); },
    complete: stats => onComplete(stats),
    introDone: () => { app = 'playing'; input.enabled = true; document.body.classList.add('playing'); greetBack(); },
    pause: () => pause(),
    magnet: (n, gained) => renderMagnet(n, gained),
    express: (n, gained) => renderTool('btn-express', 'express-n', n, gained),
    isOpen: l => l.index < save.unlocked,
    isDone: l => isDone(l.id),
    isHalf: l => !!save.sessions[l.id]?.placed?.length,
    island: l => walkOnto(l),
    portal: () => openPortal(),
    tutorialNudge: () => { const el = $('coach'); el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); ctx.companion?.nudge(); },
    // a tip Kubo gives once, ever
    tipOnce: (id, msg) => { if (!save.seen[`tip.${id}`]) { save.seen[`tip.${id}`] = true; persist(); kuboSays(msg); } },
    // first steps onto a figure's island this visit: its intro line, the first time ever
    arrive: l => onArrive(l),
    // finished islands stand built: R (or the Rebuild button) starts a fresh run for the missing stars
    rebuild: () => rebuild(),
    // Y on a gamepad (the hint button, unused while you roam): the results card's way on
    roamAction: () => doneCardAction(),
    // the first hint of a run costs the no-hint star (unless it's already earned)
    hintCostsStar: () => !game.level.kind ? !save.stars[game.level.id]?.clean : true,
    tip: key => { if (!save.seen[`tip.${key}`]) { save.seen[`tip.${key}`] = true; persist(); kuboSays(t(`kubo.${key}`)); } },
    stage: () => { $('stage').animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.5,1)' }); },
    saveSession: data => { if (!game.level.kind) { save.sessions[game.level.id] = data; persist(); } },
    tick: g => { tickHud(g); ctx.hooks.tick.forEach(f => f(g)); },
    frame: (g, dt) => ctx.hooks.frame.forEach(f => f(g, dt)),
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
// The bubbles row and the toast sit under whatever the top HUD really measures (the goals row, long names in
// some languages, UI size), so they never overlap it.
{
  const hud = $('hud'), prog = document.querySelector('.hud-top .progress'), pause = $('btn-pause');
  const layout = () => {
    const top = Math.max(prog.getBoundingClientRect().bottom, pause.getBoundingClientRect().bottom);
    hud.style.setProperty('--hud-bottom', `${Math.round(top)}px`);
    const n = $('needs').getBoundingClientRect();
    hud.style.setProperty('--needs-bottom', `${Math.round(n.height ? n.bottom : top)}px`);
  };
  const ro = new ResizeObserver(layout);
  [prog, $('needs'), document.querySelector('.hud-top')].forEach(el => ro.observe(el));
  addEventListener('resize', layout);
}
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
// urgent: said right away (otherwise a line waits for the one Kubo is saying)
function kuboSays(msg, urgent = false) {
  if (ctx.companion?.active()) { ctx.companion.say(msg, urgent); audio.tone({ f: 660, f2: 880, type: 'triangle', dur: 0.12, vol: 0.06 }); return; }
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

// tutorial steps (game.TUTORIAL): the coach line names the player's own keys / gamepad buttons
// Each key lights up once you've used it, and the look / walk steps show a bar filling up as you go.
const keycap = (label, on) => `<kbd class="ck${on ? ' on' : ''}">${String(label).replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'))}</kbd>`;
function coachText(step) {
  if (step === 'done') return t('coach.done');
  const used = game.tutUsed || new Set();
  const v = { move: 'WASD', look: t('access.coach.mouse'), jump: 'Space', drop: 'Q', hint: 'H', interact: 'E', ...ctx.coachLabels?.() };
  const keys = !mobile && ctx.coachKeys?.();
  if (keys) {
    v.move = ['forward', 'left', 'back', 'right'].map(d => keycap(keys[d], used.has(d))).join('');
    v.jump = keycap(keys.jump, used.has('jump'));
    v.drop = `${keycap(keys.rightClick, used.has('drop'))} / ${keycap(keys.drop, used.has('drop'))}`;
    v.hint = keycap(keys.hint, used.has('hint'));
    v.look = `${v.look} / ${['turnLeft', 'turnRight', 'lookUp', 'lookDown'].map(k => keycap(keys[k], false)).join('')}`;
    v.interact = keycap(keys.interact, false);
  }
  let html = t(`coach.${step}.${mobile ? 'touch' : 'desk'}`, v);
  if (step === 'look' || step === 'move') html += `<span class="coach-bar"><i style="width:${Math.round(game.tutProgress() * 20) * 5}%"></i></span>`;
  return html;
}
// the on-screen button each step teaches gets a pulsing ring
const COACH_BTN = { jump: 'btn-jump', drop: 'btn-drop', hint: 'btn-hint' };
let coachStep = null;
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
  // clear of the top HUD and its bubbles row, and above the backpack
  const top = (parseFloat($('hud').style.getPropertyValue('--needs-bottom')) || 112) + 30;
  const packTop = document.querySelector('.pack-wrap')?.getBoundingClientRect().top || h;
  const py = THREE.MathUtils.clamp((-y * 0.5 + 0.5) * h, top, Math.min(h - pad - 90, packTop - 28));
  el.style.transform = `translate(${px}px, ${py}px)`;
  el.firstElementChild.style.transform = `rotate(${Math.PI / 2 - ang}rad)`;
  el.classList.add('on');
}
const homePos = new THREE.Vector3(0, 1.2, 0);
function tickHud(g) {
  if (g.tutorial !== coachStep) {
    $(COACH_BTN[coachStep])?.classList.remove('tut-focus');
    coachStep = g.tutorial;
    $(COACH_BTN[coachStep])?.classList.add('tut-focus');
    $('coach').classList.toggle('show', !!coachStep);
    if (coachStep === 'done' && !save.seen.tutorial) { save.seen.tutorial = true; persist(); }
  }
  if (coachStep) { const html = coachText(coachStep); if ($('coach').innerHTML !== html) $('coach').innerHTML = html; }
  ctx.companion?.coach(coachStep ? $('coach').innerHTML : '');
  $('hint-cd').style.setProperty('--p', `${g.hintCooldown > 0 ? (g.hintCooldown / (g.hintMax || 8)) * 100 : 0}%`);
  if (!mobile && (g.elapsed > 16 || g.tutorial)) $('keys').classList.add('fade');
  const far = g.player.pos.length() > 7;
  placeEdge($('edge-home'), homePos, far && g.hasFitInPack());
  placeEdge($('edge-hint'), fx.beamTarget?.position ?? homePos, !!fx.beamTarget);
  const flag = g.flags?.[g.activeDistrict?.() ?? -1];
  const inDistrict = flag && Math.hypot(g.player.pos.x - flag.pos.x, g.player.pos.z - flag.pos.z) < 9;
  placeEdge($('edge-district'), flag?.pos ?? homePos, !!flag && !inDistrict && !g.hasFitInPack?.() && !fx.beamTarget);
  if (flag) $('edge-district').style.background = flag.color;
  // the way to the next figure (or the portal): an arrow at the screen edge while it's out of view
  // tutorial: point at the block that fits (grab step) or the pedestal (link step) when they're out of view
  const tutTarget = g.tutorial === 'grab' ? g.voxels.find(v => v.state === 'loose' && g.sockets.has(v.i))?.mesh.position
    : g.tutorial === 'link' ? homePos : null;
  const way = tutTarget || (g.mode === 'play' ? g.wayTarget?.() : null);
  placeEdge($('edge-next'), way ?? homePos, !!way && (tutTarget ? true : !g.pack.length && Math.hypot(way.x - g.player.pos.x, way.z - g.player.pos.z) > 6));
  renderGoals(g);
  if (doneCard && (g.level !== doneCard.level || performance.now() > doneCard.until || !g.roaming)) hideDoneCard();
  // on a finished island: rebuild it for stars (R, or the button)
  // (not with every star already earned, and not right after finishing it: first the way on)
  if (!g.onIsland) rebuildHold = false;
  const canRebuild = g.roaming && !g.level.kind && g.onIsland && g.mode === 'play' && isDone(g.level.id) && !rebuildHold && !!missingGoal(g.level);
  if (rebuildShown === null && performance.now() - rebuildArmed < 5000) { /* the question is up */ }
  else if (canRebuild !== rebuildShown) {
    rebuildShown = canRebuild;
    $('btn-rebuild').classList.toggle('show', canRebuild);
    if (canRebuild) $('rebuild-label').innerHTML = mobile ? t('hud.rebuild') : `<kbd>R</kbd> ${t('hud.rebuild')}`;
  }
  const radar = g.radarTarget();
  placeEdge($('edge-radar'), radar ?? homePos, !!radar && !fx.beamTarget);
}

// the goals while you build (par time and hints, each with its star: kept from before, still on, or lost);
// while roaming, the progress pill shows the world instead
let rebuildShown = false, rebuildHold = false, wasAway = false;
let goalsKey = '', goalPar = { level: null, par: 0 };
function renderGoals(g) {
  const lvl = g.level;
  let key = '', html = '';
  // off the figure's island (the hub, a bridge): the world's progress, not a puzzle you can't see
  const away = !lvl.kind && (g.roaming || (g.arch && !g.onIsland && g.mode === 'play'));
  document.body.classList.toggle('offisland', away && !g.roaming);
  // back on the island: the pill shows the figure again
  if (!away && wasAway) g.emitProgress();
  wasAway = away;
  if (away) {
    const ch = CHAPTERS[lvl.chapter], done = ch.levels.filter(l => isDone(l.id)).length;
    key = `w${lvl.chapter}:${done}`;
    if (key !== goalsKey) {
      $('lvl-name').textContent = ch.name;
      $('count').innerHTML = `<svg class="ic"><use href="#i-cube"/></svg>${done} / ${ch.levels.length}`;
      $('stage').textContent = '';
      $('bar-fill').style.width = `${(done / ch.levels.length) * 100}%`;
    }
  } else if ((!g.tutorial || g.tutorial === 'done') && !g.roaming && (g.mode === 'play' || g.mode === 'intro')) {
    if (goalPar.level !== lvl) goalPar = { level: lvl, par: parTime(lvl) };
    const prev = lvl.kind ? {} : save.stars[lvl.id] || {}, par = goalPar.par, sec = Math.round(g.elapsed);
    const cls = (kept, ok) => (kept ? 'kept' : ok ? 'on' : 'off');
    key = `${sec}:${g.hintsUsed}:${par}:${prev.fast}:${prev.clean}`;
    html = `<span class="g-time ${cls(prev.fast, sec <= par)}" title="${t('complete.star.fast')}" aria-label="${t('a11y.goal.time', { t: fmt(sec), par: fmt(par) })}"><svg><use href="#i-clock"/></svg><b>${fmt(sec)}</b><small>/ ${fmt(par)}</small><svg class="gs"><use href="#i-star"/></svg></span>`
      + `<span class="g-hint ${cls(prev.clean, !g.hintsUsed)}" title="${t('complete.star.clean')}" aria-label="${t('a11y.goal.hints', { n: g.hintsUsed })}"><svg><use href="#i-bulb"/></svg><b>${g.hintsUsed}</b><svg class="gs"><use href="#i-star"/></svg></span>`;
  }
  if (key === goalsKey) return;
  goalsKey = key;
  $('goals').innerHTML = html;
}

// ---------- flow ----------
// where Continue goes: the figure you last played if it's unfinished; a half-built one; otherwise the first unfinished figure after
// the furthest one you've finished (old saves don't land back in world 1); otherwise the first unfinished one at all
function nextLevelIndex() {
  const last = LEVELS.find(l => l.id === save.lastPlayed);
  if (last && last.index < save.unlocked && !isDone(last.id)) return last.index;
  const half = LEVELS.filter(l => l.index < save.unlocked && !isDone(l.id) && save.sessions[l.id]?.placed?.length).pop();
  if (half) return half.index;
  const far = LEVELS.reduce((m, l) => (isDone(l.id) ? l.index : m), -1);
  const after = LEVELS.find(l => l.index > far && l.index < save.unlocked && !isDone(l.id));
  if (after) return after.index;
  const i = LEVELS.findIndex((l, k) => k < save.unlocked && !isDone(l.id));
  return i < 0 ? Math.min(save.unlocked, LEVELS.length) - 1 : i;
}
// under Continue: world · figure · blocks in (when half built)
function continueLine() {
  const l = LEVELS[nextLevelIndex()], s = save.sessions[l.id];
  const ch = CHAPTERS[l.chapter], fig = isDone(l.id) ? l.name : t('hud.mystery');
  const blocks = s?.placed?.length ? ` · <svg class="ic"><use href="#i-cube"/></svg><bdi class="n">${s.done ?? s.placed.length} / ${s.n ?? expandLevel(l).cells.length}</bdi>` : '';
  return `${ch.name} · ${fig} <bdi class="n">${l.indexInChapter + 1}/${ch.levels.length}</bdi>${blocks}`;
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
  mapFromIsland = false;
  document.body.classList.remove('roaming');
  input.enabled = false;
  input.exitLock();
  document.body.classList.remove('playing');
  $('hud').classList.add('off');
  const idx = nextLevelIndex();
  if (game.levelIndex !== idx || game.mode !== 'showcase') showcase(idx);
  $('play-label').textContent = t(save.seen.prologue ? 'title.continue' : 'title.play');
  $('play-sub').innerHTML = save.seen.prologue ? continueLine() : '';
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
// index: campaign index or level object (custom figures). resume: true to continue the figure's saved run.
// arrive: 'island' (on the figure's island), 'hub' (by portal), 'keep' (walked onto its island: no camera move)
function startLevel(index, resume = false, arrive = 'island') {
  audio.unlock();
  audio.suspend(false);
  const lvl = levelOf(index);
  mapFromIsland = false;
  document.body.classList.remove('roaming');
  // arriving at a finished figure (walking over, by portal, Continue): it stands built (a rebuild you walked away
  // from is dropped); replays are explicit
  const built = resume === true && !lvl.kind && isDone(lvl.id);
  const session = built ? null : resume === true ? save.sessions[lvl.id] ?? null : resume || null;
  if (!session && !lvl.kind) { delete save.sessions[lvl.id]; persist(); }
  if (!lvl.kind) save.lastPlayed = lvl.id;
  if (arrive === 'keep') {
    game.load(lvl, session, { arrive, built });
    document.body.classList.toggle('roaming', built);
    lastNeeds = '';
    renderNeeds();
    renderFocus(null);
    game.tutorial = null;
    game.mode = 'play';
    return;
  }
  // the title showcase and the prologue already have this figure's island loaded and its blocks scattered
  const keepCam = arrive === 'island' && (app === 'title' || (app === 'cinema' && ctx.cinema?.ready === lvl)) && game.level === lvl && !session && !built;
  $('kubo-bark').classList.remove('show');
  if (!keepCam) {
    const fromCam = game.world ? null : 1;
    game.load(lvl, session, { arrive, built });
    if (fromCam) { game.orbitAngle = 0.5; game.updateOrbit(0, 0, 1); }
  }
  input.reset();
  lastNeeds = '';
  renderNeeds();
  renderFocus(null);
  // first play of the first figure: the step-by-step controls tutorial (players who finished it before skip it)
  game.tutorial = lvl === LEVELS[0] && !session && !save.seen.tutorial && !isDone(lvl.id) ? 'look' : null;
  $('keys').classList.remove('fade');
  $('hud').classList.remove('off');
  document.body.classList.remove('celebrating');
  document.body.classList.toggle('roaming', built);
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
document.addEventListener('visibilitychange', () => {
  // the ambient bed keeps playing in a background tab on menus too; the pause screen stays silent
  if (document.hidden) { pause(); audio.suspend(true); } else if (base !== 'screen-pause') audio.suspend(false);
});

let pendingUnlock = null; // { from, to } for the map animation
function onComplete(stats) {
  app = 'complete';
  document.body.classList.add('celebrating');
  input.enabled = false;
  document.body.classList.remove('playing');
  const lvl = game.level, idx = game.levelIndex;
  ctx.hooks.complete.forEach(f => f(stats, lvl));
  // workshop figures end on a results panel (Share, back to the Workshop)
  if (lvl.kind) { input.exitLock(); setTimeout(() => ctx.completeHandlers[lvl.kind]?.(stats, lvl), 2600); return; }
  const par = parTime(lvl);
  const run = { done: true, fast: Math.round(stats.time) <= par, clean: stats.hints === 0 }; // whole seconds, as shown
  const prev = save.stars[lvl.id] || {};
  const firstClear = !prev.done;
  const ch0 = CHAPTERS[lvl.chapter], worldStarsBefore = ch0.levels.reduce((n, l) => n + starsOf(l.id), 0), starsBefore = totalStars();
  save.stars[lvl.id] = { done: true, fast: !!(prev.fast || run.fast), clean: !!(prev.clean || run.clean) };
  const prevBest = save.best[lvl.id];
  const isBest = !prevBest || stats.time < prevBest;
  save.splits = save.splits || {};
  const prevSplits = save.splits[lvl.id];
  if (isBest) { save.best[lvl.id] = stats.time; save.splits[lvl.id] = stats.splits; }
  const oldUnlocked = save.unlocked;
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, idx + 2));
  // the map animates Kubo to a newly opened world
  const newCh = LEVELS[save.unlocked - 1].chapter;
  pendingUnlock = save.unlocked > oldUnlocked && newCh !== lvl.chapter ? { from: lvl.chapter, to: newCh } : null;
  delete save.sessions[lvl.id];
  persist();
  const finale = idx === LEVELS.length - 1 && firstClear;
  // the last figure of a world: a world-complete card, and straight on to the next world
  const ch = CHAPTERS[lvl.chapter], nextCh = CHAPTERS[lvl.chapter + 1];
  const worldDone = firstClear && ch.levels.every(l => isDone(l.id));
  const worldStars = ch.levels.reduce((n, l) => n + starsOf(l.id), 0), worldMax = ch.levels.length * 3;
  // the card also marks a world's last missing star (its crown) and the very last of all 150
  const crowned = worldStars === worldMax && worldStarsBefore < worldMax;
  const allStars = totalStars() === LEVELS.length * 3 && starsBefore < LEVELS.length * 3;
  const world = worldDone || crowned || allStars ? {
    name: ch.name, thumbs: ch.levels.map(l => thumbs[l.index]), stars: allStars ? totalStars() : worldStars, total: allStars ? LEVELS.length * 3 : worldMax,
    title: allStars ? t('complete.allStars', { n: LEVELS.length * 3 }) : crowned && !worldDone ? t('complete.worldCrown', { world: ch.name }) : t('complete.worldDone', { world: ch.name }),
    crown: crowned || allStars,
  } : null;
  const onward = worldDone && !finale && nextCh && chapterUnlocked(lvl.chapter + 1);
  // a friend's gift that arrived before the first figure: Kubo hands it over now
  const giftName = idx === 0 && firstClear ? ctx.gift?.pending() : null;
  // the gift card opens over the pause menu (its buttons need a pointer); Not now leads back to the game
  const openGift = () => { pause(); ctx.gift.open(); };
  // travel on: Kubo hops along the world map's path and you arrive in the next world
  const toNextWorld = () => { pendingUnlock = pendingUnlock || { from: lvl.chapter, to: lvl.chapter + 1 }; openMap(); };
  // no results panel: after the celebration you're straight back on the island with a results card in the HUD,
  // and the way on (next world, the epilogue, a friend's gift) is one key away
  const card = {
    name: lvl.name, img: thumbs[idx], time: stats.time, par, hints: stats.hints,
    stars: [run.done, run.fast, run.clean], prevStars: [!!prev.done, !!prev.fast, !!prev.clean],
    best: isBest && !firstClear, world,
    say: giftName ? t('workshop.gift.kubo', { name: escapeHtml(giftName) }) : lvl.outro,
    action: giftName ? { label: t('workshop.gift.open'), run: openGift }
      : finale || allStars ? { label: t('complete.epilogue'), run: showEnding }
      : onward ? { label: t('complete.nextWorld', { world: nextCh.name }), run: toNextWorld } : null,
  };
  setTimeout(() => { walkOn(card); }, 2600);
}

// ---------- the results card (campaign figures) ----------
// Sits in the HUD while you walk on: the figure, its three labelled stars (New / earned before), time against
// par, hints, and the way on when there is one (Enter, a tap, or Y on a gamepad). It fades after a while, or
// when you leave the island.
let doneCard = null; // { level, until, action }
function showDoneCard(o) {
  const labels = [t('complete.star.done'), t('complete.star.fast'), t('complete.star.clean')];
  const starSay = (on, k) => t(on ? 'a11y.star.earned' : o.prevStars[k] ? 'a11y.star.kept' : 'a11y.star.missed', { star: labels[k] });
  const stars = o.stars.map((on, k) => `<span class="cs ${on ? 'on' : o.prevStars[k] ? 'kept' : ''}" role="img" aria-label="${escapeHtml(starSay(on, k))}"><svg><use href="#i-star"/></svg><small>${labels[k]}</small>${on && !o.prevStars[k] ? `<em>${t('complete.star.new')}</em>` : ''}</span>`).join('');
  const dp = Math.round(o.time) - o.par;
  const w = o.world;
  const key = mobile ? '' : '<kbd>Enter</kbd> ';
  $('done-card').innerHTML = `
    <div class="dc-head"><img src="${o.img || ''}" alt=""><div><small>${t('complete.ribbon')}</small><b>${escapeHtml(o.name)}</b></div></div>
    <div class="dc-stars">${stars}</div>
    <div class="dc-stats"><span><svg><use href="#i-clock"/></svg><b>${fmt(o.time)}</b> <bdi dir="ltr"><em class="${dp <= 0 ? 'up' : 'down'}">${dp <= 0 ? '−' : '+'}${fmt(Math.abs(dp))}</em></bdi></span><span><svg><use href="#i-bulb"/></svg><b>${o.hints}</b></span>${o.best ? `<span class="dc-best">${t('complete.newBest')}</span>` : ''}</div>
    ${w ? `<div class="dc-world"><b>${w.crown ? '<svg class="wd-crown"><use href="#i-star"/></svg> ' : ''}${w.title}</b><span><svg><use href="#i-star"/></svg> <bdi class="n">${w.stars} / ${w.total}</bdi></span></div>` : ''}
    ${o.action ? `<button class="btn mint dc-go" id="dc-go">${key}<span>${escapeHtml(o.action.label)}</span><svg><use href="#i-next"/></svg></button>` : ''}`;
  $('done-card').classList.add('show');
  doneCard = { level: game.level, until: performance.now() + (o.action ? 40000 : 11000), action: o.action };
  if (o.action) $('dc-go').onclick = () => doneCardAction();
  // the stars pop in one by one
  $('done-card').querySelectorAll('.cs.on svg').forEach((s, k) => setTimeout(() => { s.classList.add('pop'); audio.star(k); }, 300 + k * 260));
}
function hideDoneCard() { doneCard = null; $('done-card').classList.remove('show'); }
function doneCardAction() {
  if (!doneCard?.action || (app !== 'playing' && app !== 'intro')) return false;
  const run = doneCard.action.run;
  hideDoneCard();
  run();
  return true;
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

// Results panel, shared by campaign and custom figures.
let completeActions = {};
function showComplete(o) {
  $('hud').classList.add('off');
  $('lvl-name').textContent = o.name;
  $('complete-name').textContent = o.name;
  $('complete-time').textContent = fmt(o.time);
  // the time against par
  const dp = o.par ? Math.round(o.time) - o.par : 0;
  $('complete-par').innerHTML = o.par ? `${t('complete.par', { t: fmt(o.par) })} <bdi dir="ltr"><em class="${dp <= 0 ? 'up' : 'down'}">${dp <= 0 ? '−' : '+'}${fmt(Math.abs(dp))}</em></bdi>` : (o.parText || t('complete.time'));
  $('complete-hints').textContent = o.hints;
  $('complete-img').src = o.img || '';
  $('complete-thumb').classList.toggle('reveal', !!o.reveal);
  $('complete-best').style.display = o.best ? '' : 'none';
  $('complete-best').textContent = o.best || '';
  $('complete-say').innerHTML = o.say || '';
  $('complete-say').closest('.say').style.display = o.say ? '' : 'none';
  // labelled stars: earned this run (pop in), kept from an earlier run (pale), newly earned (marked)
  const st = o.stars || [], labels = [t('complete.star.done'), t('complete.star.fast'), t('complete.star.clean')];
  const starSay = (on, k) => t(on ? 'a11y.star.earned' : o.prevStars?.[k] ? 'a11y.star.kept' : 'a11y.star.missed', { star: labels[k] });
  $('complete-stars').innerHTML = st.map((on, k) => `<span class="cs ${o.prevStars?.[k] && !on ? 'kept' : ''}" role="img" aria-label="${escapeHtml(starSay(on, k))}"><svg><use href="#i-star"/></svg><small>${labels[k]}</small>${on && o.prevStars && !o.prevStars[k] ? `<em>${t('complete.star.new')}</em>` : ''}</span>`).join('');
  const svgs = $('complete-stars').querySelectorAll('svg');
  // a world finished: its five figures and its stars
  const w = o.world;
  $('complete-world').innerHTML = w ? `<b>${w.crown ? '<svg class="wd-crown"><use href="#i-star"/></svg> ' : ''}${w.title}</b><div class="wd-figs">${w.thumbs.map(s => `<img src="${s}" alt="">`).join('')}</div><span><svg><use href="#i-star"/></svg> <bdi class="n">${w.stars} / ${w.total}</bdi></span>` : '';
  $('complete-world').style.display = w ? '' : 'none';
  $('complete-world').closest('.panel').classList.toggle('has-world', !!w);
  st.forEach((on, k) => { if (on) setTimeout(() => { svgs[k].classList.add('on'); audio.star(k); }, 500 + k * 280); });
  $('next-label').textContent = o.nextLabel || t('complete.continue');
  // quarter splits only mean something on bigger figures (and not on the tutorial's, whose clock starts late)
  $('complete-splits').innerHTML = o.splits && (o.blocks ?? 99) >= 20 ? splitsHtml(o.splits, o.prevSplits) : '';
  $('btn-c-share').style.display = o.onShare ? '' : 'none';
  completeActions = o;
  setBase('screen-complete');
}

// ---------- world map ----------
// A world select: one island per world, showing the figure you're on there. Inside a world you walk between
// its figures across the bridges of its archipelago.
let thumbs = [];
const BAND_H = 360, TOP_PAD = 86, BOT_PAD = 70;
const mapPos = []; // per chapter
const chapterUnlocked = c => CHAPTERS[c].levels[0].index < save.unlocked;
function buildMap() {
  const inner = $('map-inner');
  const W = inner.clientWidth || innerWidth;
  const colW = Math.min(500, W - 190);
  const cx = W / 2;
  const H = TOP_PAD + CHAPTERS.length * BAND_H + BOT_PAD;
  inner.style.height = `${H}px`;
  let html = '';
  const xs = [0, 0.38, -0.05, -0.36];
  const cur = LEVELS[nextLevelIndex()].chapter;
  CHAPTERS.forEach((ch, c) => {
    const top = TOP_PAD + (CHAPTERS.length - 1 - c) * BAND_H;
    const T = THEMES[ch.theme];
    const locked = !chapterUnlocked(c);
    const st = ch.levels.reduce((n, l) => n + starsOf(l.id), 0);
    const done = ch.levels.filter(l => isDone(l.id)).length;
    html += `<div class="map-chapter" style="position:absolute;left:0;right:0;top:${top - (c === CHAPTERS.length - 1 ? TOP_PAD : 0)}px;height:${BAND_H + (c === CHAPTERS.length - 1 ? TOP_PAD : 0) + (c === 0 ? BOT_PAD : 0)}px;
      background:linear-gradient(to top, ${hex(T.water)}, ${hex(T.skyHorizon)} 55%, ${hex(T.skyTop)});${locked ? 'filter:saturate(.35) brightness(.85);' : ''}">
      <div class="waves"></div></div>`;
    html += `<div class="chapter-head ${locked ? 'locked' : ''}" style="top:${top + 22}px"><small>${t('map.chapter', { n: c + 1 })}</small><b>${ch.name}</b>
      <span>${locked ? `<svg><use href="#i-lock"/></svg> ${t('map.locked')}` : `<svg><use href="#i-star"/></svg> <bdi class="n">${st} / ${ch.levels.length * 3}</bdi> · ${ch.blurb}`}</span></div>`;
    const x = cx + xs[c % xs.length] * colW, y = top + BAND_H - 120;
    mapPos[c] = { x, y };
    // a finished world shows its finale; otherwise the figure you're up to there
    const allDone = done === ch.levels.length;
    const fig = allDone ? ch.levels[ch.levels.length - 1] : LEVELS[firstOpenIn(c)], solved = isDone(fig.id);
    const crowned = st === ch.levels.length * 3;
    const unlocking = pendingUnlock && c === pendingUnlock.to;
    // pips: done (sun), all three stars (gold ring), half built (half filled)
    const pips = ch.levels.map(l => `<i class="${isDone(l.id) ? `on${starsOf(l.id) === 3 ? ' s3' : ''}` : save.sessions[l.id] ? 'half' : ''}"></i>`).join('');
    // what the world holds, for screen readers and as a tooltip: every figure with its stars (★ earned, ☆ missing)
    const figLines = ch.levels.filter(l => l.index < save.unlocked).map(l => (isDone(l.id) ? `${l.name} ${'★'.repeat(starsOf(l.id))}${'☆'.repeat(3 - starsOf(l.id))}` : t('hud.mystery')));
    const label = `${t('map.chapter', { n: c + 1 })}: ${ch.name}. ${locked ? t('map.locked') : `${done} / ${ch.levels.length} · ★ ${st} / ${ch.levels.length * 3}`}`;
    html += `<button class="node world ${locked ? 'locked' : ''} ${solved ? '' : 'unsolved'} ${c === cur && !locked ? 'current' : ''} ${unlocking ? 'unlocking' : ''}" aria-label="${escapeHtml(label)}" title="${escapeHtml(locked ? label : [label, ...figLines].join('\n'))}" data-c="${c}" style="left:${x}px;top:${y}px;--g:${hex(T.grass)};--c:${hex(T.cliff)}">
      <div class="island">${locked ? '<svg><use href="#i-lock"/></svg>' : `<img src="${thumbs[fig.index] || ''}" alt="">${solved ? '' : '<span class="q">?</span>'}`}<span class="num">${c + 1}</span>${crowned ? '<span class="crown"><svg><use href="#i-star"/></svg></span>' : ''}</div>
      ${locked ? '' : `<div class="pips">${pips}</div>`}
      <div class="name">${locked ? '???' : `<bdi class="n">${done} / ${ch.levels.length}</bdi>`}</div></button>`;
  });
  // path from world to world
  let bed = '', doneP = '', open = '';
  for (let c = 0; c < CHAPTERS.length - 1; c++) {
    const a = mapPos[c], b = mapPos[c + 1];
    const dy = b.y - a.y;
    const d = `M${a.x},${a.y} C${a.x},${a.y + dy * 0.55} ${b.x},${b.y - dy * 0.55} ${b.x},${b.y}`;
    bed += d;
    const anim = pendingUnlock && c + 1 === pendingUnlock.to;
    if (chapterUnlocked(c + 1)) doneP += `<path class="done ${anim ? 'draw' : ''}" d="${d}"/>`;
    else open += `<path class="open" d="${d}"/>`;
  }
  html += `<svg class="map-path" style="width:${W}px;height:${H}px" viewBox="0 0 ${W} ${H}"><path class="bed" d="${bed}"/>${open}${doneP}</svg>`;
  const kp = pendingUnlock ? mapPos[pendingUnlock.from] : mapPos[cur];
  const hat = ctx.kuboHat?.();
  html += `<div class="map-kubo" id="map-kubo" style="left:${kp.x}px;top:${kp.y}px"><div class="kubo">${hat ? `<i class="hat hat-${hat.id}">${ctx.hatSvg(hat.id)}</i>` : ''}<i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div></div>`;
  inner.innerHTML = html;
  inner.querySelectorAll('.map-path .draw').forEach(p => p.style.setProperty('--len', p.getTotalLength()));
  inner.querySelectorAll('.node').forEach(b => b.addEventListener('click', () => {
    const c = +b.dataset.c;
    if (!chapterUnlocked(c)) { audio.wrong(); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 }); return; }
    enterWorld(c);
  }));
  $('map-stars').textContent = `${totalStars()} / ${LEVELS.length * 3}`;
  $('map-stars').closest('.star-total').classList.toggle('all', totalStars() === LEVELS.length * 3);
  // the ending can be watched again once the Colossus stands
  $('btn-map-ending').style.display = isDone(LEVELS[LEVELS.length - 1].id) ? '' : 'none';
}

function openMap() {
  audio.suspend(false);
  app = 'menu';
  mapFromIsland = false;
  document.body.classList.remove('roaming');
  input.enabled = false;
  input.exitLock();
  document.body.classList.remove('playing');
  $('hud').classList.add('off');
  setBase('screen-map');
  buildMap();
  const scroll = $('map-scroll');
  // frame the current world a little low, so the next one up shows under the header; for the unlock walk, frame
  // both worlds when the screen is tall enough
  const both = pendingUnlock && scroll.clientHeight > BAND_H + 200;
  const focusY = both ? (mapPos[pendingUnlock.from].y + mapPos[pendingUnlock.to].y) / 2 - 40
    : (pendingUnlock ? mapPos[pendingUnlock.from] : mapPos[LEVELS[nextLevelIndex()].chapter]).y;
  scroll.scrollTop = focusY - scroll.clientHeight * (both ? 0.5 : 0.62);
  if (pendingUnlock) {
    const { to } = pendingUnlock;
    pendingUnlock = null;
    setTimeout(() => {
      const k = $('map-kubo');
      if (!k) return;
      k.style.left = `${mapPos[to].x}px`;
      k.style.top = `${mapPos[to].y}px`;
      if (!both) scroll.scrollTo({ top: mapPos[to].y - scroll.clientHeight * 0.62, behavior: 'smooth' });
      audio.tone({ f: 600, f2: 900, type: 'triangle', dur: 0.25, vol: 0.12 });
    }, 500);
    setTimeout(() => { audio.star(1); }, 1250);
    setTimeout(() => { if (base === 'screen-map' && !overlays.length) enterWorld(to); }, 2300);
  }
}

// ---------- walking between figures ----------
// Each world is an archipelago: a hub island with the portal, and a bridge to every figure's island.
const firstOpenIn = c => {
  const ls = CHAPTERS[c].levels.filter(l => l.index < save.unlocked);
  return (ls.find(l => !isDone(l.id)) || ls[0] || CHAPTERS[c].levels[0]).index;
};
// arriving in a world by portal: on the hub, with the figure you're up to ready on its island
function enterWorld(c) {
  const ch = CHAPTERS[c];
  if (c === 0 && !save.seen.prologue) return playPrologue();
  if (!save.seen[ch.id]) { save.seen[ch.id] = true; persist(); return talk(ch.intro, () => enterWorld(c)); }
  // the very first figure starts on its own island (its door keeps you there until it's rebuilt)
  const i = firstOpenIn(c);
  startLevel(i, true, i === 0 && !isDone(LEVELS[0].id) ? 'island' : 'hub');
}
// walked onto another figure's island: its puzzle takes over (the figure you left keeps its progress)
function walkOnto(l) {
  if (app !== 'playing') return;
  startLevel(l.index, true, 'keep');
}
// the portal on the hub opens the world select; leaving it brings you back to the island
let mapFromIsland = false;
function openPortal() {
  if (app !== 'playing' || overlays.length) return;
  openMap();
  mapFromIsland = true;
}
function backToIsland() {
  mapFromIsland = false;
  setBase(null);
  $('hud').classList.remove('off');
  app = 'playing';
  input.enabled = true;
  document.body.classList.add('playing');
  if (!mobile) input.requestLock();
}
// first steps onto a figure's island this visit: welcome back (first island of a session), its intro line the
// first time ever, then the goals; on a finished island, what's left to earn there
let welcomeBack = false;
// the first time you're back in a world this visit (Continue): right away, wherever you arrive
function greetBack() {
  if (!welcomeBack || game.tutorial || game.level.kind) return;
  welcomeBack = false;
  const half = !game.roaming && game.linkOrder?.length;
  kuboSays(half ? t('kubo.welcomeBackFig', { n: game.placedCount, total: game.voxels.length }) : t('kubo.welcomeBack'));
  // saves from before the 50 figures: new figures washed up on islands they had already passed
  if (save.seen.oldSave && !save.seen.oldSaveTold) { save.seen.oldSaveTold = true; persist(); kuboSays(t('kubo.newFigures')); }
}
// what a rebuild would still earn: "beat 2:15", "use no hints" or both
const missingGoal = l => {
  const st = save.stars[l.id] || {}, par = `<b>${fmt(parTime(l))}</b>`;
  return !st.fast && !st.clean ? t('kubo.goal.both', { par }) : !st.fast ? t('kubo.goal.fast', { par }) : !st.clean ? t('kubo.goal.clean') : '';
};
function onArrive(l) {
  if (l.kind || game.tutorial) return;
  const lines = [];
  if (!save.seen[`fig.${l.id}`]) { save.seen[`fig.${l.id}`] = true; persist(); lines.push(l.intro); }
  if (game.roaming) {
    const goal = missingGoal(l);
    if (goal) lines.push(t(mobile ? 'kubo.rebuild.touch' : 'kubo.rebuild.desk', { goal }));
  } else if (!save.seen[`goal.${l.id}`] && l !== LEVELS[0]) {
    save.seen[`goal.${l.id}`] = true; persist();
    lines.push(t('kubo.goals', { par: `<b>${fmt(parTime(l))}</b>` }));
  }
  lines.forEach(m => kuboSays(m));
}
// a fresh run on a finished figure, right where you stand (for the stars still missing); it takes the figure
// apart, so the first press asks (like the first hint)
let rebuildArmed = -Infinity;
function rebuild() {
  const l = game.level;
  if (!game.roaming || l.kind || !isDone(l.id) || app !== 'playing' || !game.onIsland || !missingGoal(l)) return;
  if (performance.now() - rebuildArmed > 5000) {
    rebuildArmed = performance.now();
    kuboSays(t(mobile ? 'kubo.rebuildSure.touch' : 'kubo.rebuildSure.desk'), true);
    $('rebuild-label').textContent = t('settings.sure');
    rebuildShown = null; // re-render the label when the question lapses
    return;
  }
  rebuildArmed = -Infinity;
  startLevel(l.index, false, 'keep');
  audio.tone({ f: 520, f2: 780, type: 'triangle', dur: 0.2, vol: 0.1 });
  kuboSays(t('kubo.rebuildGo', { goal: missingGoal(l) }), true);
}
// after the results panel: back onto the island, the way to the next figure lit
function walkOn(card = null) {
  setBase(null);
  document.body.classList.remove('celebrating');
  document.body.classList.add('roaming');
  $('hud').classList.remove('off');
  app = 'intro';
  game.walkOn();
  rebuildHold = true;
  if (!mobile && !document.pointerLockElement) input.requestLock();
  const lvl = game.level, nextCh = CHAPTERS[lvl.chapter + 1];
  const openFig = CHAPTERS[lvl.chapter].levels.some(l => l !== lvl && !isDone(l.id) && l.index < save.unlocked);
  if (card) { ctx.companion?.reset(); showDoneCard(card); if (card.say) kuboSays(card.say, true); if (card.action) return; }
  setTimeout(() => {
    if (openFig) kuboSays(t('way.next'));
    else if (nextCh && chapterUnlocked(lvl.chapter + 1)) kuboSays(t('way.nextWorld', { world: `<b>${nextCh.name}</b>` }));
  }, 1700);
}

// ---------- prologue / ending ----------
// First play: the storm cutscene, Kubo's welcome, then the first figure (its blocks are already where the storm left them).
function playPrologue() {
  ctx.cinema.prologue(() => {
    save.seen.prologue = true; save.seen[CHAPTERS[0].id] = true; persist();
    talk(CHAPTERS[0].intro, () => startLevel(0));
  });
}

function showEnding() {
  ctx.cinema.finale(() => talk(ENDING, () => {
    $('ending-grid').innerHTML = thumbs.map((t, i) => `<img src="${t}" style="animation-delay:${i * 0.06}s" alt="">`).join('');
    $('ending-stars').innerHTML = t('ending.stars', { n: totalStars(), total: LEVELS.length * 3 });
    setBase('screen-ending');
  }));
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
  const safeBtn = $('set-safe');
  safeBtn.classList.toggle('on', !!gfxState.safe);
  safeBtn.onclick = () => {
    gfxState.safe = !gfxState.safe; gfxState.auto = false; gfxState.booting = 0; saveGfx();
    safeBtn.classList.toggle('on', gfxState.safe);
    setTimeout(() => location.reload(), 250);
  };
  const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  if (!fsSupported) $('set-full').closest('.setting').classList.add('hidden');
  toggle('set-full', 'full', v => goFullscreen(v));
  let armed = false;
  $('set-reset').onclick = () => {
    if (!armed) { armed = true; $('set-reset').textContent = t('settings.sure'); setTimeout(() => { armed = false; $('set-reset').textContent = t('settings.resetBtn'); }, 2500); return; }
    Object.assign(save, { unlocked: 1, best: {}, stars: {}, seen: {} });
    save.sessions = {}; delete save.splits; // a saved run could resume a now-locked figure
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
const continueGame = (greet = true) => {
  audio.unlock();
  if (!save.seen.prologue) { playPrologue(); return; }
  const i = nextLevelIndex();
  // straight onto a half-built figure's island; otherwise into its world by the portal
  welcomeBack = greet;
  if (save.sessions[LEVELS[i].id] && save.seen[CHAPTERS[LEVELS[i].chapter].id]) { startLevel(i, true, 'island'); return; }
  enterWorld(LEVELS[i].chapter);
};
$('btn-play').onclick = () => continueGame();
$('btn-map').onclick = () => openMap();
$('btn-map-back').onclick = () => (mapFromIsland ? backToIsland() : enterTitle());
// a scroll cue while more settings sit below the fold
{
  const list = document.querySelector('#screen-settings .settings'), panel = list.parentElement;
  const cue = () => { const more = list.scrollHeight - list.scrollTop - list.clientHeight > 8; list.classList.toggle('more', more); panel.classList.toggle('more', more); };
  list.addEventListener('scroll', cue, { passive: true });
  addEventListener('resize', cue);
  new MutationObserver(() => requestAnimationFrame(cue)).observe($('screen-settings'), { attributes: true, attributeFilter: ['class'] });
}
$('btn-settings').onclick = () => pushOverlay('screen-settings');
$('btn-p-settings').onclick = () => pushOverlay('screen-settings');
$('btn-resume').onclick = () => resume();
// restarting throws away the figure's saved run: ask for a second tap
let restartArmed = -Infinity;
$('btn-restart').onclick = () => {
  const label = $('btn-restart').querySelector('span');
  if (performance.now() - restartArmed > 2500) {
    restartArmed = performance.now();
    label.textContent = t('settings.sure');
    setTimeout(() => { label.textContent = t('pause.restart'); }, 2500);
    return;
  }
  restartArmed = -Infinity;
  label.textContent = t('pause.restart');
  startLevel(game.level);
};
$('btn-quit').onclick = () => (game.level?.kind ? enterTitle() : openMap());
$('btn-pause').onclick = () => pause();
$('btn-hint').onclick = () => input.actions.push({ type: 'hint' });
$('btn-magnet').onclick = () => input.actions.push({ type: 'magnet' });
$('btn-rebuild').onclick = () => rebuild();
$('btn-express').onclick = () => input.actions.push({ type: 'express' });
function renderTool(btn, count, n, gained) {
  const b = $(btn);
  b.classList.toggle('hidden', !(game.stageCount > 1));
  document.body.classList.toggle('has-tools', game.stageCount > 1);
  b.classList.toggle('empty', n <= 0);
  $(count).textContent = n;
  if (gained) b.animate([{ transform: 'scale(1.4) rotate(-10deg)' }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.3,1.6,.5,1)' });
}
const renderMagnet = (n, gained) => renderTool('btn-magnet', 'magnet-n', n, gained);
$('btn-c-map').onclick = () => (completeActions.onMap || openMap)();
$('btn-c-retry').onclick = () => (completeActions.onRetry || (() => startLevel(game.level)))();
$('btn-next').onclick = () => (completeActions.onNext || openMap)();
$('btn-c-share').onclick = () => completeActions.onShare?.();
$('btn-ending-map').onclick = () => openMap();
$('btn-map-ending').onclick = () => showEnding();
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
    if (overlays.length) {
      const top = overlays[overlays.length - 1];
      popOverlay();
      // the gift card opened from the results card sits over the pause menu: closing it goes back to the game
      if (top === 'screen-ws-gift' && app === 'paused') resume();
      return;
    }
    if (base === 'screen-map') { (mapFromIsland ? backToIsland : enterTitle)(); return; }
    if (app === 'paused' && !mobile) return; // browsers swallow this Esc for pointer lock anyway
  }
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && doneCard?.action && !overlays.length && !base && doneCardAction()) { e.preventDefault(); return; }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (!overlays.length && base === 'screen-title') { e.preventDefault(); $('btn-play').click(); }
    else if (!overlays.length && base === 'screen-complete') { e.preventDefault(); $('btn-next').click(); }
    else if (!overlays.length && base === 'screen-ending') { e.preventDefault(); $('btn-ending-map').click(); }
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
  if (ctx.views[app]) { ctx.views[app](dt); renderer.adapt(dt); if (healthy < 6 && (healthy += dt) >= 6) { gfxState.booting = 0; saveGfx(); } return; }
  const mode = ctx.modes[app];
  if (mode) mode(dt); else game.update(dt);
  renderer.render(scene, camera);
  renderer.adapt(dt);
  if (healthy < 6 && (healthy += dt) >= 6) { gfxState.booting = 0; saveGfx(); }
}

// ---------- feature context ----------
// Feature modules (js/features/*.js) get this object in init(ctx) and hook in from there.
const ctx = {
  THREE, game, renderer, scene, camera, audio, input, fx, save, persist, mobile, $, fmt, hex, gfxState, saveGfx,
  LEVELS, CHAPTERS, expandLevel, parTime,
  get app() { return app; }, set app(v) { app = v; },
  get base() { return base; }, overlays,
  setBase, pushOverlay, popOverlay, talk, toast, kuboSays, startLevel, openMap, enterTitle, pause, resume, showComplete, splitsHtml,
  playPrologue, showEnding, continueGame,
  renderThumb, get thumbs() { return thumbs; }, goFullscreen,
  hooks: { tick: [], complete: [], link: [], frame: [] },
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
  // if the GPU needs a simpler pipeline, the first frames switch to it; then redraw the thumbnails
  renderer.onDowngrade = () => { thumbs = renderThumbs(); };
  fill.style.width = '80%';
  await new Promise(r => setTimeout(r, 30));
  bindSettings();
  for (const f of FEATURES) f.init?.(ctx);
  // first launch: straight from the loading bar into the opening cutscene, no title screen
  const firstRun = !save.seen.prologue && !document.body.classList.contains('debug') && !location.search.includes('thumbs');
  if (!firstRun) enterTitle();
  renderer.gl.compile(scene, camera);
  fill.style.width = '100%';
  await new Promise(r => setTimeout(r, 250));
  lastTime = performance.now();
  if (firstRun) {
    playPrologue();
    // browsers keep audio locked until the first click or key press
    const wake = () => { if (app === 'cinema') audio.unlock(); };
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, wake, { capture: true, once: true });
  }
  requestAnimationFrame(frame);
  if (location.search.includes('thumbs')) {
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;z-index:99;background:#fff4e0;display:grid;grid-template-columns:repeat(4,1fr);overflow:auto">${thumbs.map((t, i) => `<div style="text-align:center;font:700 14px Fredoka"><img src="${t}" style="width:100%"><br>${LEVELS[i].name}</div>`).join('')}</div>`);
  }
}
boot();

// expose for debugging
window.__voxlink = { game, renderer, save, openMap, startLevel, LEVELS, ctx };
