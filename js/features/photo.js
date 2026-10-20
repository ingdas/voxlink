// Photo mode: hides the UI, lets you orbit (or freezes) the view, frames it and snaps a PNG with a Voxlink watermark.
// Available from the in-level pause screen, the results panel, the C key while playing, and Kubo's Garden (ctx.photo.open).
import { PEDESTAL_TOP } from '../world.js';
import { t } from '../i18n.js';

const INK = '#2a1f3d', PAPER = '#fff4e0';
const LOGO_COLORS = ['#ffc93c', '#ff6b6b', '#3ddc97', '#4cc9f0', '#b693f5', '#ffc93c', '#ff6b6b'];
const LOGO_ROT = [-6, 4, -3, 5, -4, 3, -5];
const BAND = 14, BAND_R = 14; // frame band width / inner corner radius in CSS px (mirrored in features.css)
const FONTS = "Fredoka, 'M PLUS Rounded 1c', Jua, Mitr, 'Baloo Bhaijaan 2', sans-serif";

let ctx, THREE, $, el;
let state = null; // the open session
let lastBlob = null, lastUrl = '', busy = false;

export function init(c) {
  ctx = c; THREE = c.THREE; $ = c.$;
  buildDom();
  ctx.photo = { open, close, snap, share, get active() { return !!state; }, get lastBlob() { return lastBlob; } };
  ctx.modes.photo = dt => update(dt);

  // results panel: camera button next to Continue
  const next = $('btn-next');
  const cb = button('btn icon', '<svg><use href="#i-camera"/></svg>', 'btn-c-photo', t('photo.photo'));
  next.parentNode.insertBefore(cb, next);
  cb.onclick = () => openFromComplete();

  // in-level pause screen
  const pb = button('btn', `<svg><use href="#i-camera"/></svg>${t('photo.photo')}`, 'btn-p-photo');
  $('btn-resume').after(pb);
  pb.onclick = () => openFromPause();

  addEventListener('keydown', e => {
    if (state) {
      if (e.code === 'Escape') { e.preventDefault(); close(); }
      else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && !e.target.closest?.('button')) { e.preventDefault(); snap(); }
      return;
    }
    // C while walking around a level: freeze the view and frame a shot
    if (e.code === 'KeyC' && !e.repeat && ctx.app === 'playing' && ctx.game.mode === 'play' && !ctx.overlays.length) openFromPlay();
  });
}

function button(cls, html, id, label) {
  const b = document.createElement('button');
  b.className = cls; b.innerHTML = html;
  if (id) b.id = id;
  if (label) b.setAttribute('aria-label', label);
  return b;
}

function buildDom() {
  el = document.createElement('div');
  el.id = 'screen-photo';
  el.className = 'screen photo';
  const tiles = 'VOXLINK'.split('').map((ch, i) => `<span style="--c:${LOGO_COLORS[i]};--rot:${LOGO_ROT[i]}deg">${ch}</span>`).join('');
  el.innerHTML = `
    <div class="photo-frame"></div>
    <div class="photo-hint tag" id="photo-hint"></div>
    <div class="photo-mark"><div class="photo-logo" id="photo-logo">${tiles}</div><div class="photo-name" id="photo-name"></div></div>
    <button class="photo-preview" id="photo-preview" aria-label="${t('photo.sharePhoto')}"><img alt=""><span>${t('photo.snapped')}</span></button>
    <div class="photo-note" id="photo-note"></div>
    <div class="photo-ctl">
      <div class="pc"><button class="btn icon" id="photo-close" aria-label="${t('photo.close')}"><svg><use href="#i-back"/></svg></button><span>${t('photo.close')}</span></div>
      <div class="pc"><button class="btn round big sun" id="photo-snap" aria-label="${t('photo.snap')}"><svg><use href="#i-camera"/></svg></button><span>${t('photo.snap')}</span></div>
      <div class="pc"><button class="btn icon" id="photo-share" aria-label="${t('photo.share')}"><svg><use href="#i-share"/></svg></button><span>${t('photo.share')}</span></div>
    </div>
    <div class="photo-flash" id="photo-flash"></div>`;
  document.body.appendChild(el);
  $('photo-close').onclick = () => close();
  $('photo-snap').onclick = () => snap();
  $('photo-share').onclick = () => share();
  $('photo-preview').onclick = () => share();
  bindOrbit();
}

// ---------- open / close ----------
// o: { name, orbit: { center: Vector3, minDist, maxDist, dist0?, pitch0? } | null, update: dt => void | null, onClose: ({ yaw }) => void }
// dist0 / pitch0: the camera eases out to at least this framing when photo mode opens
function open(o) {
  if (state) return;
  const body = document.body, hud = $('hud');
  state = {
    ...o, prevApp: ctx.app,
    wasPlaying: body.classList.contains('playing'), hudOff: hud.classList.contains('off'),
  };
  ctx.input.enabled = false;
  ctx.input.reset();
  ctx.input.exitLock();
  ctx.audio.unlock();
  ctx.audio.suspend(false);
  body.classList.remove('playing');
  body.classList.add('photo-mode');
  hud.classList.add('off');
  if (o.orbit) {
    const cam = ctx.camera, c = o.orbit.center;
    const d = cam.position.clone().sub(c);
    const dist = THREE.MathUtils.clamp(d.length(), o.orbit.minDist, o.orbit.maxDist);
    const yaw = Math.atan2(d.x, d.z), pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(d.y / (d.length() || 1), -1, 1)), 0.03, 1.35);
    Object.assign(o.orbit, { yaw, pitch, dist, yawT: yaw, pitchT: Math.max(pitch, o.orbit.pitch0 ?? 0), distT: Math.max(dist, o.orbit.dist0 ?? 0) });
    applyOrbit(1);
  }
  $('photo-name').textContent = o.name || 'Voxlink';
  document.fonts?.load(`700 40px ${FONTS}`, $('photo-name').textContent).catch(() => {}); // ready for the PNG's name tag
  const hint = $('photo-hint');
  hint.textContent = t(o.orbit ? (ctx.mobile ? 'photo.hint.orbitTouch' : 'photo.hint.orbitMouse') : 'photo.hint.frozen');
  hint.classList.remove('gone');
  clearTimeout(hint._t);
  hint._t = setTimeout(() => hint.classList.add('gone'), 3200);
  setPreview(null);
  $('photo-note').classList.remove('show');
  ctx.app = 'photo';
  ctx.setBase('screen-photo');
}

function close() {
  if (!state) return;
  const s = state;
  state = null;
  const body = document.body;
  body.classList.remove('photo-mode');
  if (s.wasPlaying) body.classList.add('playing');
  if (!s.hudOff) $('hud').classList.remove('off');
  setPreview(null);
  s.onClose?.({ yaw: s.orbit?.yaw });
}

function openFromPause() {
  const g = ctx.game;
  if (!g.world) return;
  open({
    name: shotName(g.level), orbit: null, update: null,
    onClose: () => { ctx.app = 'paused'; ctx.setBase('screen-pause'); ctx.audio.suspend(true); },
  });
}

function openFromPlay() {
  const g = ctx.game;
  open({
    name: shotName(g.level), orbit: null, update: null,
    // back into the level: resume() re-locks the pointer (Close is a click, so the browser allows it)
    onClose: () => { ctx.app = 'paused'; ctx.resume(); },
  });
}

function openFromComplete() {
  const g = ctx.game;
  if (!g.world) return;
  const prevMode = g.mode;
  // settle the celebration spin so the figure stands still on its pedestal
  for (const v of g.voxels) if (v.state === 'placed') { v.mesh.position.copy(v.target); v.mesh.rotation.set(0, 0, 0); v.mesh.scale.setScalar(1); }
  g.mode = 'photo'; // unknown to Game.update: world, voxels and confetti keep animating but the camera is ours
  const h = g.figureHeight;
  open({
    name: $('complete-name').textContent,
    orbit: { center: new THREE.Vector3(0, PEDESTAL_TOP + h * 0.5, 0), minDist: Math.max(2.4, h * 0.9), maxDist: Math.min(32, g.world.R * 1.1) },
    update: dt => g.update(dt),
    onClose: ({ yaw }) => {
      g.mode = prevMode;
      if (yaw !== undefined) g.orbitAngle = yaw;
      ctx.app = 'complete';
      ctx.setBase('screen-complete');
    },
  });
}

function shotName(level) {
  if (!level) return 'Voxlink';
  if (level.kind || ctx.save.stars[level.id]?.done) return level.name;
  return ctx.CHAPTERS[level.chapter ?? 0]?.name || 'Voxlink';
}

// ---------- per frame ----------
function update(dt) {
  if (!state) return;
  if (state.orbit) applyOrbit(1 - Math.exp(-dt * 12));
  state.update?.(dt);
}

function applyOrbit(k) {
  const o = state.orbit, cam = ctx.camera;
  o.yaw += (o.yawT - o.yaw) * k;
  o.pitch += (o.pitchT - o.pitch) * k;
  o.dist += (o.distT - o.dist) * k;
  const c = o.center, cp = Math.cos(o.pitch);
  cam.position.set(c.x + Math.sin(o.yaw) * cp * o.dist, c.y + Math.sin(o.pitch) * o.dist, c.z + Math.cos(o.yaw) * cp * o.dist);
  if (cam.position.y < 0.35) cam.position.y = 0.35;
  cam.lookAt(c);
  cam.updateMatrixWorld();
}

function bindOrbit() {
  const pts = new Map();
  let pinch = 0;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  el.addEventListener('pointerdown', e => {
    if (!state?.orbit || e.target.closest('button')) return;
    el.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = pts.size === 2 ? spread() : 0;
    $('photo-hint').classList.add('gone');
  });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p || !state?.orbit) return;
    const o = state.orbit;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      o.yawT -= dx * 0.008;
      o.pitchT = THREE.MathUtils.clamp(o.pitchT + dy * 0.006, 0.03, 1.35);
    } else if (pts.size === 2) {
      const s = spread();
      if (pinch > 0 && s > 0) o.distT = THREE.MathUtils.clamp(o.distT * (pinch / s), o.minDist, o.maxDist);
      pinch = s;
    }
  });
  const up = e => { pts.delete(e.pointerId); pinch = pts.size === 2 ? spread() : 0; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => {
    if (!state?.orbit) return;
    e.preventDefault();
    const o = state.orbit;
    o.distT = THREE.MathUtils.clamp(o.distT * Math.exp(e.deltaY * 0.0012), o.minDist, o.maxDist);
  }, { passive: false });
}

// ---------- capture ----------
// The WebGL canvas has no preserveDrawingBuffer, so render a frame and read it back in the same task.
// readPixels (not drawImage) because the outline pass leaves alpha 0 on the sky, which drawImage would premultiply to black.
function capture() {
  const r = ctx.renderer, three = r.gl, gl = three.getContext();
  const prevScale = r.scale;
  if (prevScale < 1) { r.scale = 1; r.setSize(r.w, r.h); } // full resolution for the photo
  if (state.orbit) applyOrbit(1);
  ctx.camera.updateMatrixWorld();
  r.render(ctx.scene, ctx.camera);
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  three.setRenderTarget(null);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  if (prevScale < 1) { r.scale = prevScale; r.setSize(r.w, r.h); r.render(ctx.scene, ctx.camera); }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const row = w * 4;
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  g.putImageData(img, 0, 0);
  decorate(g, cv.width, cv.height);
  return cv;
}

function rr(g, x, y, w, h, rad) {
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

// Draw the frame and watermark exactly where the overlay shows them.
function decorate(g, W, H) {
  const u = W / innerWidth;
  const B = BAND * u;
  g.save();
  g.fillStyle = PAPER;
  g.beginPath();
  g.rect(0, 0, W, H);
  rr(g, B, B, W - 2 * B, H - 2 * B, BAND_R * u);
  g.fill('evenodd');
  g.lineWidth = 3 * u;
  g.strokeStyle = INK;
  g.beginPath();
  rr(g, B + 1.5 * u, B + 1.5 * u, W - 2 * B - 3 * u, H - 2 * B - 3 * u, (BAND_R - 1.5) * u);
  g.stroke();
  g.restore();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // logo tiles
  [...$('photo-logo').children].forEach((s, i) => {
    const b = s.getBoundingClientRect();
    const cx = (b.left + b.width / 2) * u, cy = (b.top + b.height / 2) * u;
    const w = s.offsetWidth * u, h = s.offsetHeight * u;
    g.save();
    g.translate(cx, cy);
    g.rotate((LOGO_ROT[i] * Math.PI) / 180);
    g.fillStyle = INK;
    g.beginPath(); rr(g, -w / 2, -h / 2 + 3 * u, w, h, 5 * u); g.fill();
    g.fillStyle = LOGO_COLORS[i];
    g.beginPath(); rr(g, -w / 2, -h / 2, w, h, 5 * u); g.fill();
    g.lineWidth = 2.5 * u; g.strokeStyle = INK;
    g.beginPath(); rr(g, -w / 2 + 1.25 * u, -h / 2 + 1.25 * u, w - 2.5 * u, h - 2.5 * u, 4 * u); g.stroke();
    g.fillStyle = INK;
    g.font = `700 ${h * 0.62}px ${FONTS}`;
    g.fillText(s.textContent, 0, h * 0.04);
    g.restore();
  });
  // name tag
  const n = $('photo-name');
  if (n.textContent) {
    const b = n.getBoundingClientRect();
    const x = b.left * u, y = b.top * u, w = b.width * u, h = b.height * u;
    g.fillStyle = INK;
    g.beginPath(); rr(g, x, y + 3 * u, w, h, h / 2); g.fill();
    g.fillStyle = PAPER;
    g.beginPath(); rr(g, x, y, w, h, h / 2); g.fill();
    g.lineWidth = 2.5 * u; g.strokeStyle = INK;
    g.beginPath(); rr(g, x + 1.25 * u, y + 1.25 * u, w - 2.5 * u, h - 2.5 * u, h / 2 - 1.25 * u); g.stroke();
    g.fillStyle = INK;
    let fs = parseFloat(getComputedStyle(n).fontSize) * u;
    g.font = `700 ${fs}px ${FONTS}`;
    const room = w - 2 * parseFloat(getComputedStyle(n).paddingLeft) * u, tw = g.measureText(n.textContent).width;
    if (tw > room && room > 0) { fs *= room / tw; g.font = `700 ${fs}px ${FONTS}`; } // keep long names inside the tag
    g.fillText(n.textContent, x + w / 2, y + h / 2 + fs * 0.04);
  }
}

function shutter() {
  const a = ctx.audio;
  a.noise({ dur: 0.05, vol: 0.22, freq: 3800, q: 0.7, type: 'highpass' });
  a.tone({ f: 1500, f2: 700, type: 'square', dur: 0.04, vol: 0.04 });
  a.noise({ t: 0.09, dur: 0.06, vol: 0.16, freq: 2200, q: 0.9 });
  a.tone({ f: 880, f2: 1320, type: 'triangle', t: 0.1, dur: 0.12, vol: 0.07 });
  const f = $('photo-flash');
  f.getAnimations().forEach(x => x.cancel());
  f.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
  $('photo-snap').animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
}

function snap() {
  if (!state || busy) return Promise.resolve(lastBlob);
  busy = true;
  $('photo-hint').classList.add('gone');
  const cv = capture();
  shutter();
  return new Promise(res => cv.toBlob(b => {
    busy = false;
    if (b) { lastBlob = b; setPreview(b); }
    res(b);
  }, 'image/png'));
}

function setPreview(blob) {
  const p = $('photo-preview');
  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = ''; }
  if (!blob) { lastBlob = null; p.classList.remove('show'); $('photo-share').classList.remove('mint'); return; }
  lastUrl = URL.createObjectURL(blob);
  p.querySelector('img').src = lastUrl;
  p.classList.remove('show');
  void p.offsetWidth;
  p.classList.add('show');
  $('photo-share').classList.add('mint');
}

function note(msg) {
  const n = $('photo-note');
  n.textContent = msg;
  n.classList.add('show');
  clearTimeout(n._t);
  n._t = setTimeout(() => n.classList.remove('show'), 2200);
}

async function share() {
  if (!state) return;
  const blob = lastBlob || await snap();
  if (!blob) return;
  const name = (state?.name || 'voxlink').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = new File([blob], `voxlink-${name || 'photo'}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Voxlink', text: t('photo.shareText', { name: state?.name || t('photo.myIsland') }) });
      note(t('photo.shared'));
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  note(t('photo.saved'));
}
