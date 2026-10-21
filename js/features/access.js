// Comfort, accessibility & controls: FOV / look smoothing / head bob / reduced motion / UI size /
// high contrast settings, rebindable keys and standard-mapping gamepad support (game + menus).
import { THEMES } from '../world.js';
import { DEFAULT_KEYS } from '../input.js';
import { t } from '../i18n.js';

const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS = { fov: 88, smooth: 0, bob: true, reduceMotion: prefersReduced, uiScale: 1, contrast: false };
// rebindable actions; labels are i18n keys access.act.<action>
const ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'run', 'interact', 'drop', 'hint'];
const actLabel = a => t(`access.act.${a}`);
// fixed keys that can't be rebound (menus, slots, pause, magnet / express, photo mode and the secondary movement keys)
const RESERVED = new Set(['Escape', 'Tab', 'KeyP', 'KeyR', 'KeyF', 'KeyC', 'Enter', 'NumpadEnter', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'MetaLeft', 'MetaRight', 'F5', 'F11', 'F12']);
// named keys → i18n key access.key.<word>; symbol keys are shown as-is
const KEY_WORDS = {
  Space: 'space', ShiftLeft: 'shift', ShiftRight: 'shift', ControlLeft: 'ctrl', ControlRight: 'ctrl', AltLeft: 'alt', AltRight: 'alt',
  CapsLock: 'caps', Insert: 'ins', Delete: 'del', Home: 'home', End: 'end', PageUp: 'pgUp', PageDown: 'pgDn', ContextMenu: 'menu',
  Tab: 'tab', Enter: 'enter', Backspace: 'backspace',
};
const KEY_SYMBOLS = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};
const keyName = code => (KEY_WORDS[code] ? t(`access.key.${KEY_WORDS[code]}`) : KEY_SYMBOLS[code]);
// snow ground a touch darker / blue-grey so white blocks pop in high contrast
const FROST_HC = { grass: 0xc9d5e8, cap: 0xdae3f0, tuft: 0xa9bad4 };
// [button, action, note] — looked up when the legend is built
const PAD_LEGEND = () => [
  [t('access.pad.leftStick'), actLabel('move'), t('access.pad.note.run')], [t('access.pad.rightStick'), actLabel('look'), ''],
  ['A', actLabel('jump'), t('access.pad.note.select')], ['X / RT', actLabel('interact'), ''],
  ['B / LT', actLabel('drop'), t('access.pad.note.back')], ['Y', actLabel('hint'), ''], ['LB / RB', actLabel('slot'), ''],
  [t('access.pad.start'), actLabel('pause'), ''], [t('access.pad.dpad'), actLabel('menuFocus'), ''],
  ['◀', t('aria.magnet'), ''], ['▶', t('aria.express'), ''],
];
const PRIMARY = '#btn-play, #btn-brief-go, #btn-next, #btn-resume, #btn-ending-map';
const FOCUSABLE = '.btn, .toggle, .node, input[type=range], .kbtn';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sideless = c => c.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');

export function init(ctx) {
  const { save, persist, input, camera, game, $ } = ctx;
  const st = save.settings;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof st[k] !== typeof v) st[k] = v;
  const keys = st.keys = Object.assign({}, DEFAULT_KEYS, st.keys);
  for (const a of Object.keys(DEFAULT_KEYS)) if (typeof keys[a] !== 'string' || !keys[a]) keys[a] = DEFAULT_KEYS[a];
  input.bindings = keys;
  const body = document.body, root = document.documentElement;

  // ---------- floating toast (the HUD toast is hidden while menus are up) ----------
  const toastEl = document.createElement('div');
  toastEl.id = 'acc-toast';
  toastEl.className = 'tag toast';
  body.appendChild(toastEl);
  let toastT = 0;
  const notify = msg => {
    if (ctx.base == null && !$('hud').classList.contains('off')) return ctx.toast(msg);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
  };

  // ---------- key labels ----------
  let layout = null;
  navigator.keyboard?.getLayoutMap?.().then(m => { layout = m; renderKeys(); renderKeysHint(); }).catch(() => {});
  const keyLabel = code => {
    const ch = layout?.get?.(code);
    const named = keyName(code);
    if (ch && ch.trim() && !named) return ch.toUpperCase();
    if (named) return named;
    if (code.startsWith('Numpad')) return t('access.key.numpad', { k: keyName(code.slice(6)) || code.slice(6) });
    return code.replace(/^Key|^Digit/, '');
  };
  const L = a => keyLabel(keys[a]);
  const moveLabel = () => {
    const m = ['forward', 'left', 'back', 'right'].map(L);
    return m.every(s => s.length === 1) ? m.join('') : m.join(' ');
  };

  // ---------- settings rows ----------
  const list = document.querySelector('#screen-settings .settings');
  const range = (id, label, min, max, step) =>
    `<label class="setting acc-range"><span>${esc(label)} <em class="acc-val" id="${id}-val"></em></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"></label>`;
  const toggle = (id, label, extra = '') => `<div class="setting ${extra}" id="${id}-row"><span>${esc(label)}</span><button class="toggle" id="${id}" aria-label="${esc(label)}"><i></i></button></div>`;
  list.querySelector('#set-sens').closest('.setting').insertAdjacentHTML('afterend', range('acc-smooth', t('access.set.smooth'), 0, 1, 0.05));
  list.querySelector('.setting.danger').insertAdjacentHTML('beforebegin', `
    <div class="acc-sec">${esc(t('access.set.section'))}</div>
    ${range('acc-fov', t('access.set.fov'), 70, 110, 1)}
    ${toggle('acc-bob', t('access.set.bob'))}
    ${toggle('acc-motion', t('access.set.motion'))}
    ${range('acc-ui', t('access.set.ui'), 0.8, 1.3, 0.05)}
    ${toggle('acc-contrast', t('access.set.contrast'))}
    <div class="acc-sec acc-desk" id="acc-controls-sec">${esc(t('access.set.controls'))}</div>
    <div class="setting acc-desk"><span>${esc(t('access.set.keyboard'))}</span><button class="btn small" id="acc-keys-btn" aria-expanded="false">${esc(t('access.set.edit'))}</button></div>
    <div class="acc-keys hidden" id="acc-keys"></div>
    <div class="setting acc-desk acc-pad-row" id="acc-pad-row"><span>${esc(t('access.set.gamepad'))} <em class="acc-val" id="acc-pad-status">${esc(t('access.set.padNotFound'))}</em></span><button class="btn small" id="acc-pad-btn" aria-expanded="false">${esc(t('access.set.layout'))}</button></div>
    <div class="acc-keys acc-legend hidden" id="acc-pad-legend">${PAD_LEGEND().map(([b, a, n]) =>
      `<div class="acc-key"><span>${esc(a)}${n ? `<small>${esc(n)}</small>` : ''}</span><kbd>${esc(b)}</kbd></div>`).join('')}</div>
    <div class="acc-sec acc-sec-end"></div>`);

  const bindRange = (id, key, fmtVal, apply) => {
    const el = $(id), val = $(`${id}-val`);
    el.value = st[key];
    val.textContent = fmtVal(st[key]);
    el.addEventListener('input', () => { st[key] = +el.value; val.textContent = fmtVal(st[key]); apply(); persist(); });
  };
  const bindToggle = (id, key, apply) => {
    const el = $(id);
    el.classList.toggle('on', !!st[key]);
    el.onclick = () => { st[key] = !st[key]; el.classList.toggle('on', st[key]); apply(); persist(); };
  };
  const pct = v => t('access.val.percent', { n: Math.round(v * 100) });
  bindRange('acc-smooth', 'smooth', v => (v ? pct(v) : t('access.val.off')), applySmooth);
  bindRange('acc-fov', 'fov', v => t('access.val.degrees', { n: v }), applyFov);
  bindRange('acc-ui', 'uiScale', pct, applyUi);
  bindToggle('acc-bob', 'bob', applyMotion);
  bindToggle('acc-motion', 'reduceMotion', applyMotion);
  bindToggle('acc-contrast', 'contrast', applyContrast);

  const expander = (btnId, panelId) => {
    const b = $(btnId), p = $(panelId);
    b.onclick = () => {
      const open = p.classList.toggle('hidden') === false;
      b.textContent = open ? t('access.set.done') : b.dataset.label;
      b.setAttribute('aria-expanded', open);
      if (!open) cancelCapture();
      if (open) requestAnimationFrame(() => p.scrollIntoView({ block: 'nearest', behavior: st.reduceMotion ? 'auto' : 'smooth' }));
    };
    b.dataset.label = b.textContent;
  };
  expander('acc-keys-btn', 'acc-keys');
  expander('acc-pad-btn', 'acc-pad-legend');

  // ---------- applying ----------
  function applySmooth() { input.smoothing = st.smooth; }
  function applyFov() {
    camera.userData.hfov = st.fov;
    dispatchEvent(new Event('resize'));
  }
  function applyMotion() {
    const rm = st.reduceMotion;
    body.classList.toggle('reduce-motion', rm);
    game.player.bobScale = st.bob && !rm ? 1 : 0;
    game.player.landScale = rm ? 0.25 : 1;
    game.comfort.kick = rm ? 0 : 1;
    game.comfort.spin = rm ? 0.3 : 1;
    $('acc-bob-row').classList.toggle('acc-off', rm);
  }
  function applyUi() {
    const m = Math.min(innerWidth, innerHeight);
    // never grow past what small phones can fit (390px-tall landscape / 390px-wide portrait)
    const hud = Math.min(st.uiScale, clamp(Math.min(innerWidth / 360, innerHeight / 340), 1, 1.3));
    const menu = Math.min(st.uiScale, clamp(m / 480, 1, 1.3));
    root.style.setProperty('--ui-hud', hud);
    root.style.setProperty('--ui-menu', menu);
    body.classList.toggle('ui-scaled', hud !== 1 || menu !== 1);
  }
  const frostOrig = { grass: THEMES.frost.grass, cap: THEMES.frost.cap, tuft: THEMES.frost.tuft };
  function applyContrast() {
    body.classList.toggle('high-contrast', st.contrast);
    Object.assign(THEMES.frost, st.contrast ? FROST_HC : frostOrig); // takes effect on the next island build
  }
  addEventListener('resize', applyUi);

  // ---------- key remapping ----------
  let capturing = null;
  function renderKeys() {
    $('acc-keys').innerHTML = ACTIONS.map(a =>
      `<div class="acc-key"><span>${esc(actLabel(a))}</span><button class="kbtn ${capturing === a ? 'wait' : ''}" data-act="${a}">${esc(capturing === a ? t('access.keys.press') : L(a))}</button></div>`).join('') +
      `<div class="acc-keys-foot"><small>${esc(t('access.keys.foot'))}</small><button class="btn small" id="acc-keys-reset">${esc(t('access.keys.defaults'))}</button></div>`;
  }
  function cancelCapture() { if (capturing) { capturing = null; renderKeys(); } }
  $('acc-keys').addEventListener('click', e => {
    const k = e.target.closest('.kbtn');
    if (k) { capturing = capturing === k.dataset.act ? null : k.dataset.act; renderKeys(); return; }
    if (e.target.closest('#acc-keys-reset')) {
      Object.assign(keys, DEFAULT_KEYS);
      capturing = null;
      persist(); renderKeys(); renderKeysHint();
      notify(t('access.toast.reset'));
    }
  });
  let swallowUp = null;
  addEventListener('keydown', e => {
    if (!capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    swallowUp = e.code;
    if (e.code === 'Escape') return cancelCapture();
    if (RESERVED.has(e.code)) { notify(t('access.toast.reserved', { key: keyLabel(e.code) })); return; }
    const act = capturing;
    const other = Object.keys(keys).find(a => a !== act && sideless(keys[a]) === sideless(e.code));
    if (other) keys[other] = keys[act]; // swap so no action is left unbound
    keys[act] = e.code;
    capturing = null;
    persist(); renderKeys(); renderKeysHint();
    if (other) notify(t('access.toast.swapped', { action: actLabel(other) }));
  }, true);
  addEventListener('keyup', e => { if (swallowUp === e.code) { swallowUp = null; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // leaving the settings screen cancels a pending capture
  new MutationObserver(() => { if (!$('screen-settings').classList.contains('show')) cancelCapture(); })
    .observe($('screen-settings'), { attributes: true, attributeFilter: ['class'] });

  function renderKeysHint() {
    const k = s => `<kbd>${esc(s)}</kbd>`;
    const lines = padMode ? [
      t('access.hint.moveLook', { move: k(t('access.key.lStick')), look: k(t('access.key.rStick')) }),
      t('access.hint.grab', { a: k('X'), b: k('RT') }),
      t('access.hint.jumpRun', { jump: k('A'), run: k('L3') }),
      t('access.hint.slot', { a: k('LB'), b: k('RB') }),
      t('access.hint.dropHint', { drop: k('B'), hint: k('Y') }),
    ] : [
      t('access.hint.move', { move: k(moveLabel()) }),
      t('access.hint.grab', { a: k(t('access.key.click')), b: k(L('interact')) }),
      t('access.hint.jumpRun', { jump: k(L('jump')), run: k(L('run')) }),
      t('access.hint.slot', { a: k('1-4'), b: k(t('access.key.wheel')) }),
      t('access.hint.dropHint2', { a: k(t('access.key.rightClick')), b: k(L('drop')), hint: k(L('hint')) }),
      `${k('R')} ${t('aria.magnet')} · ${k('F')} ${t('aria.express')}`,
    ];
    $('keys').innerHTML = lines.map(s => `<span>${s}</span>`).join('');
  }
  // the tutorial lines name the keys; main.js asks us for the current labels
  ctx.coachLabels = () => (padMode
    ? { move: t('access.coach.leftStick'), look: t('access.coach.rightStick'), jump: 'A', drop: 'B', hint: 'Y' }
    : { move: moveLabel(), look: t('access.coach.mouse'), jump: L('jump'), drop: `${t('access.key.rightClick')} / ${L('drop')}`, hint: L('hint') });

  // ---------- gamepad ----------
  let padMode = false;
  const setPadMode = on => {
    if (on === padMode) return;
    padMode = on;
    body.classList.toggle('pad-nav', on);
    renderKeysHint();
  };
  // with a gamepad there is no need for pointer lock (and it can't be requested without a click anyway)
  const lock = input.requestLock.bind(input);
  input.requestLock = () => (padMode ? Promise.resolve() : lock());
  addEventListener('mousedown', () => setPadMode(false), true);
  addEventListener('keydown', () => setPadMode(false), true);
  addEventListener('touchstart', () => setPadMode(false), { capture: true, passive: true });

  const getPad = () => {
    const all = [...(navigator.getGamepads?.() || [])].filter(g => g && g.connected !== false);
    return all.find(g => g.mapping === 'standard') || all[0] || null;
  };
  const refreshPadStatus = () => {
    const gp = getPad();
    $('acc-pad-status').textContent = t(gp ? 'access.set.padConnected' : 'access.set.padNotFound');
    $('acc-pad-row').classList.toggle('on', !!gp);
    $('acc-controls-sec').classList.toggle('on', !!gp);
  };
  addEventListener('gamepadconnected', () => { notify(t('access.toast.padOn')); refreshPadStatus(); });
  addEventListener('gamepaddisconnected', () => {
    refreshPadStatus();
    if (!getPad()) { notify(t('access.toast.padOff')); setPadMode(false); }
  });

  const pad = input.pad;
  const zeroPad = () => { pad.x = pad.y = 0; pad.sprint = pad.jump = false; };
  const DZ = 0.18;
  const stick = (x = 0, y = 0) => {
    const m = Math.hypot(x, y);
    if (m < DZ) return { x: 0, y: 0, m: 0 };
    const k = Math.min(1, (m - DZ) / (1 - DZ)) / m;
    return { x: x * k, y: y * k, m: Math.min(1, (m - DZ) / (1 - DZ)) };
  };
  let prev = [], sprintLatch = false, lastT = performance.now();
  let navDir = null, navNext = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    const gp = getPad();
    if (!gp) { zeroPad(); prev = []; return; }
    const btn = gp.buttons.map(b => !!b && (b.pressed || b.value > 0.5));
    const old = prev;
    const pressed = i => btn[i] && !old[i];
    prev = btn;
    const ls = stick(gp.axes[0], gp.axes[1]), rs = stick(gp.axes[2], gp.axes[3]);
    if (btn.some((b, i) => b && pressed(i)) || ls.m > 0.4 || rs.m > 0.4) setPadMode(true);

    const inGame = ctx.app === 'playing' && input.enabled && ctx.base == null && !ctx.overlays.length;
    if (!inGame) {
      zeroPad();
      if ((ctx.app === 'playing' || ctx.app === 'intro') && pressed(9)) return ctx.pause();
      return menuPad(btn, pressed, ls, rs, now, dt);
    }
    if (pressed(10)) sprintLatch = !sprintLatch;
    if (ls.m < 0.2) sprintLatch = false;
    pad.x = ls.x; pad.y = ls.y; pad.sprint = sprintLatch; pad.jump = btn[0];
    // look: squared response curve for fine aim, full deflection ~ 3.2 rad/s at look speed 1
    const rate = 3.2 * (st.sens || 1) * rs.m;
    pad.lx += rs.x * rate * dt;
    pad.ly += rs.y * rate * dt * (input.invertY ? -1 : 1);
    const act = a => input.actions.push(a);
    if (pressed(0)) act({ type: 'jump' });
    if (pressed(2) || pressed(7)) act({ type: 'interact' });
    if (pressed(1) || pressed(6)) act({ type: 'drop' });
    if (pressed(3)) act({ type: 'hint' });
    if (pressed(4)) act({ type: 'cycle', d: -1 });
    if (pressed(5)) act({ type: 'cycle', d: 1 });
    if (pressed(14)) act({ type: 'magnet' });
    if (pressed(15)) act({ type: 'express' });
    if (pressed(9)) ctx.pause();
  }
  requestAnimationFrame(loop);

  // ---------- menu navigation ----------
  const visible = el => el.getClientRects().length > 0 && !el.disabled && getComputedStyle(el).visibility !== 'hidden';
  const focusEl = el => {
    if (!el) return;
    try { el.focus({ focusVisible: true, preventScroll: true }); } catch { el.focus(); }
    el.scrollIntoView({ block: el.classList.contains('node') ? 'center' : 'nearest', behavior: st.reduceMotion ? 'auto' : 'smooth' });
  };
  function menuPad(btn, pressed, ls, rs, now, dt) {
    const id = ctx.overlays.at(-1) || ctx.base;
    if (!id) return;
    const scr = $(id);
    if (!scr) return;
    if (id === 'screen-talk') { if (pressed(0) || pressed(2) || pressed(9)) scr.click(); return; }
    const items = [...scr.querySelectorAll(FOCUSABLE)].filter(e => visible(e) && !e.matches('.node.locked'));
    const cur = scr.contains(document.activeElement) && items.includes(document.activeElement) ? document.activeElement : null;
    const primary = [...scr.querySelectorAll(PRIMARY)].find(visible);
    const fallback = () => primary || scr.querySelector('.node.current') || items.find(e => !e.classList.contains('locked')) || items[0];
    const tap = el => { ctx.audio.unlock(); ctx.audio.click(); el.click(); };

    if (pressed(0)) {
      if (cur && cur.type !== 'range') tap(cur);
      else if (!cur && primary) tap(primary);
      else if (!cur) focusEl(fallback());
      return;
    }
    if (pressed(9)) {
      if (id === 'screen-pause') ctx.resume();
      else if (primary) tap(primary);
      return;
    }
    if (pressed(1)) {
      if (ctx.overlays.length) ctx.popOverlay();
      else if (id === 'screen-map') ctx.enterTitle();
      else if (id === 'screen-pause') ctx.resume();
      return;
    }
    // right stick scrolls long screens (map, settings)
    if (rs.m > 0) scr.querySelector('.map-scroll, .settings')?.scrollBy(0, rs.y * 1100 * dt);

    let dir = null;
    if (btn[12] || ls.y < -0.55) dir = 'up';
    else if (btn[13] || ls.y > 0.55) dir = 'down';
    else if (btn[14] || ls.x < -0.55) dir = 'left';
    else if (btn[15] || ls.x > 0.55) dir = 'right';
    if (!dir) { navDir = null; return; }
    if (dir === navDir && now < navNext) return;
    navNext = now + (dir === navDir ? 110 : 380);
    navDir = dir;
    if (!cur) return focusEl(fallback());
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const s = +cur.step || 1;
      cur.value = +cur.value + (dir === 'left' ? -s : s);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    focusEl(nearest(cur, dir, items));
  }
  // spatial navigation: closest element in the pressed direction, favouring alignment
  function nearest(cur, dir, items) {
    const c = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const r0 = cur.getBoundingClientRect(), p0 = c(r0);
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), p = c(r);
      const vx = p.x - p0.x, vy = p.y - p0.y;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const ortho = Math.abs(dx ? vy : vx);
      // overlapping on the cross axis counts as aligned
      const overlap = dx ? (r.top < r0.bottom && r.bottom > r0.top) : (r.left < r0.right && r.right > r0.left);
      const score = along + (overlap ? 0 : ortho * 2.5);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best || cur;
  }

  // ---------- boot ----------
  applySmooth(); applyFov(); applyMotion(); applyUi(); applyContrast();
  renderKeys(); renderKeysHint(); refreshPadStatus();
}
